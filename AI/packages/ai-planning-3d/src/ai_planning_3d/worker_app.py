"""Runtime bootstrap for the 3D LLM planning worker process."""

from __future__ import annotations

import argparse
import json
from collections.abc import Callable, Sequence
from typing import Protocol, Self

from ai_common.adapters.rabbitmq.consumer import RabbitMQConsumer
from ai_common.adapters.rabbitmq.kombu_client import COMMANDS_EXCHANGE, build_connection, kombu
from ai_common.adapters.rabbitmq.publisher import KombuEventPublisher
from ai_common.adapters.storage import S3Client
from ai_common.config import RabbitMQSettings, S3Settings, WorkerSettings, load_worker_settings
from ai_common.health import start_health_server
from ai_common.logging import bind_worker_logger, configure_logging, get_logger
from ai_common.worker_sdk.base_worker import EventPublisher
from ai_domain.worker_messages.command import CommandMessage
from ai_planning_3d.worker import PlanningWorker

WORKER_TYPE = "THREE_D_LLM"
_logger = get_logger(__name__)


class HealthServerLike(Protocol):
    def stop(self) -> None:
        """Stop the background health server."""


class EventPublisherContext(EventPublisher, Protocol):
    def __enter__(self) -> Self:
        """Open the underlying publisher resource."""

    def __exit__(self, *_: object) -> None:
        """Close the underlying publisher resource."""


class CommandPublisherContext(Protocol):
    def publish_command(self, command: CommandMessage) -> None:
        """Publish a downstream command."""

    def __enter__(self) -> Self:
        """Open the underlying publisher resource."""

    def __exit__(self, *_: object) -> None:
        """Close the underlying publisher resource."""


class KombuCommandPublisher:
    """Kombu-backed command publisher for batang.commands.exchange."""

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

    def publish_command(self, command: CommandMessage) -> None:
        if self._connection is None:
            raise RuntimeError(
                "KombuCommandPublisher is not connected; call connect() first "
                "or use it as a context manager."
            )

        payload = json.dumps(
            command.model_dump(by_alias=True, exclude_none=True),
            ensure_ascii=False,
        )
        with kombu.producers[self._connection].acquire(block=True) as producer:
            producer.publish(
                payload,
                exchange=COMMANDS_EXCHANGE,
                routing_key=command.routingKey,
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

    def __enter__(self) -> KombuCommandPublisher:
        self.connect()
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


class ConsumerLike(Protocol):
    def run(self) -> None:
        """Run the underlying consumer loop."""


HealthServerFactory = Callable[[WorkerSettings], HealthServerLike]
PublisherFactory = Callable[[RabbitMQSettings], EventPublisherContext]
CommandPublisherFactory = Callable[[RabbitMQSettings], CommandPublisherContext]
StorageFactory = Callable[[S3Settings], S3Client]
ConsumerFactory = Callable[..., ConsumerLike]


def build_settings() -> WorkerSettings:
    return load_worker_settings(worker_type=WORKER_TYPE)


def run_planning_3d_worker(
    settings: WorkerSettings | None = None,
    *,
    once: bool = False,
    health_server_factory: HealthServerFactory = start_health_server,
    publisher_factory: PublisherFactory = KombuEventPublisher,
    command_publisher_factory: CommandPublisherFactory = KombuCommandPublisher,
    storage_factory: StorageFactory = S3Client,
    consumer_factory: ConsumerFactory = RabbitMQConsumer,
) -> int:
    runtime_settings = settings or build_settings()
    if runtime_settings.worker_type != WORKER_TYPE:
        raise ValueError(
            f"3D LLM planning worker requires WORKER_TYPE={WORKER_TYPE!r}, "
            f"got {runtime_settings.worker_type!r}"
        )

    configure_logging(runtime_settings)
    logger = bind_worker_logger(_logger, runtime_settings, once=once)
    health_server = health_server_factory(runtime_settings)
    try:
        with (
            publisher_factory(runtime_settings.rabbitmq) as publisher,
            command_publisher_factory(runtime_settings.rabbitmq) as command_publisher,
        ):
            s3 = storage_factory(runtime_settings.s3)
            worker = PlanningWorker(
                worker_id=runtime_settings.worker_id,
                event_publisher=publisher,
                s3=s3,
                command_publisher=command_publisher,
            )
            consumer = consumer_factory(
                settings=runtime_settings.rabbitmq,
                worker_type=runtime_settings.worker_type,
                handler=worker.handle,
                stop_after=1 if once else None,
            )
            logger.info(
                "planning_3d_worker_starting",
                queue="batang.three-d-llm.command.queue",
                once=once,
            )
            consumer.run()
            logger.info("planning_3d_worker_stopped", once=once)
            return 0
    finally:
        health_server.stop()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the 3D LLM planning worker.")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process a single acknowledged command and exit.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        return run_planning_3d_worker(once=args.once)
    except Exception:
        _logger.exception("planning_3d_worker_startup_failed")
        return 1


__all__ = ["WORKER_TYPE", "build_settings", "main", "run_planning_3d_worker"]
