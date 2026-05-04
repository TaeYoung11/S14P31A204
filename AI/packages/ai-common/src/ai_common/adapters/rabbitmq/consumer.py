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
from typing import Any

import kombu
import kombu.mixins

from ai_common.adapters.rabbitmq.kombu_client import build_connection, get_command_queue
from ai_common.config import RabbitMQSettings
from ai_common.logging import get_logger
from ai_domain.worker_messages.command import CommandMessage

_logger = get_logger(__name__)

CommandHandler = Callable[[CommandMessage], None]


class RabbitMQConsumer(kombu.mixins.ConsumerMixin):
    """Pull-based command consumer backed by kombu ConsumerMixin."""

    def __init__(
        self,
        *,
        settings: RabbitMQSettings,
        worker_type: str,
        handler: CommandHandler,
        prefetch_count: int = 1,
    ) -> None:
        self.connection = build_connection(settings)
        self._queue = get_command_queue(worker_type)
        self._handler = handler
        self._prefetch_count = prefetch_count

    def get_consumers(
        self,
        Consumer: type[kombu.Consumer],
        channel: Any,
    ) -> list[kombu.Consumer]:
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

    def _on_message(self, body: Any, message: kombu.Message) -> None:
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
        except Exception as exc:
            _logger.error(
                "command_handler_failed",
                jobId=getattr(command, "jobId", None),
                idempotencyKey=getattr(command, "idempotencyKey", None),
                error=str(exc),
            )
            message.nack(requeue=True)
