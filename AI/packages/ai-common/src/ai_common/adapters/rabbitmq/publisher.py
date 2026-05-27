"""Kombu-backed event publisher for the batang.events.exchange.

Implements the EventPublisher protocol defined in worker_sdk/base_worker.py.
Any exception from the AMQP layer propagates to the caller without being
swallowed — the consumer relies on this to withhold the command ack when
a publish fails.
"""

from __future__ import annotations

import json

from ai_common.adapters.rabbitmq.kombu_client import EVENTS_EXCHANGE, build_connection, kombu
from ai_common.config import RabbitMQSettings
from ai_common.logging import get_logger
from ai_domain.worker_messages.event import EventMessage

_logger = get_logger(__name__)


class KombuEventPublisher:
    """Synchronous event publisher backed by kombu.

    Usage::

        with KombuEventPublisher(settings.rabbitmq) as publisher:
            worker = MyWorker(worker_id=..., event_publisher=publisher)
            ...
    """

    def __init__(self, settings: RabbitMQSettings) -> None:
        self._settings = settings
        self._connection: kombu.Connection | None = None

    def connect(self) -> None:
        self._connection = build_connection(self._settings)
        self._connection.connect()

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def publish(self, event: EventMessage) -> None:
        """Publish a lifecycle event to batang.events.exchange.

        Raises immediately if not connected. Any AMQP or serialisation
        error propagates to the caller — never swallowed.
        """
        if self._connection is None:
            raise RuntimeError(
                "KombuEventPublisher is not connected; call connect() first "
                "or use it as a context manager."
            )

        payload = json.dumps(
            event.model_dump(by_alias=True, exclude_none=True),
            ensure_ascii=False,
        )

        with kombu.producers[self._connection].acquire(block=True) as producer:
            producer.publish(
                payload,
                exchange=EVENTS_EXCHANGE,
                routing_key=event.routingKey,
                content_type="application/json",
                delivery_mode=2,
                retry=True,
                retry_policy={
                    "interval_start": 0,
                    "interval_step": 1,
                    "interval_max": 5,
                    "max_retries": 3,
                },
            )

        _logger.info(
            "event_published",
            eventId=event.eventId,
            eventType=event.eventType,
            routingKey=event.routingKey,
            jobId=event.jobId,
        )

    def __enter__(self) -> KombuEventPublisher:
        self.connect()
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
