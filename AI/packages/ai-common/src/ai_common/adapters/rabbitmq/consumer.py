"""RabbitMQ command consumer with manual ack and publish-before-ack invariant.

Ack ordering guarantee:
  1. Message received from command queue.
  2. Parse failure → reject(requeue=False) — malformed messages go to DLQ.
  3. handler(command) is called. BaseWorker.handle() publishes events internally.
     If publisher.publish() raises, the exception propagates here.
  4. handler() returns normally → message.ack()   ← only place ack is issued.
  5. handler() raises          → message.nack(requeue=True), no ack.

prefetch_count=1 ensures at most one unacked message per worker process,
preventing pipeline overflow during error recovery.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any, TYPE_CHECKING, Protocol

from ai_common.adapters.rabbitmq.kombu_client import build_connection, get_command_queue, kombu
from ai_common.config import RabbitMQSettings
from ai_common.logging import get_logger
from ai_domain.worker_messages.command import CommandMessage

_logger = get_logger(__name__)

CommandHandler = Callable[[CommandMessage], None]

if TYPE_CHECKING:
    class ConsumerMixinBase:
        should_stop: bool

        def run(self) -> None:
            """Consumer mixin run loop."""

else:
    ConsumerMixinBase = kombu.mixins.ConsumerMixin


class MessageLike(Protocol):
    def ack(self) -> None:
        """Acknowledge a message."""

    def nack(self, *, requeue: bool) -> None:
        """Reject a message with optional requeue."""

    def reject(self, *, requeue: bool) -> None:
        """Reject a malformed message."""


class RabbitMQConsumer(ConsumerMixinBase):
    """Pull-based command consumer backed by kombu ConsumerMixin."""

    def __init__(
        self,
        *,
        settings: RabbitMQSettings,
        worker_type: str,
        handler: CommandHandler,
        prefetch_count: int = 1,
        stop_after: int | None = None,
    ) -> None:
        if stop_after is not None and stop_after < 1:
            raise ValueError("stop_after must be >= 1 when provided")
        self.connection = build_connection(settings)
        self._queue = get_command_queue(worker_type)
        self._handler = handler
        self._prefetch_count = prefetch_count
        self._stop_after = stop_after
        self._acked_count = 0
        self.should_stop = False

    def get_consumers(
        self,
        Consumer: type[Any],
        channel: Any,
    ) -> list[Any]:
        channel.basic_qos(
            prefetch_size=0,
            prefetch_count=self._prefetch_count,
            a_global=False,
        )
        return [
            Consumer(
                queues=[self._queue],
                callbacks=[self._on_message],
                accept=["application/json", "text/plain"],
                auto_declare=True,
            )
        ]

    def _on_message(self, body: Any, message: MessageLike) -> None:
        try:
            raw = body if isinstance(body, dict) else json.loads(body)
            command = CommandMessage.model_validate(raw)
        except Exception as exc:
            _logger.error("command_decode_failed", error=str(exc))
            message.reject(requeue=False)
            return

        try:
            self._handler(command)
            message.ack()
            self._acked_count += 1
            if self._stop_after is not None and self._acked_count >= self._stop_after:
                self.should_stop = True
        except Exception as exc:
            _logger.error(
                "command_handler_failed",
                jobId=getattr(command, "jobId", None),
                idempotencyKey=getattr(command, "idempotencyKey", None),
                error=str(exc),
            )
            message.nack(requeue=True)
