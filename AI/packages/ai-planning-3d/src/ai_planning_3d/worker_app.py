"""Runtime bootstrap for the 3D LLM planning worker process."""

from __future__ import annotations

import argparse
from collections.abc import Callable, Sequence
from typing import Protocol, Self

from ai_common.adapters.rabbitmq.consumer import RabbitMQConsumer
from ai_common.adapters.rabbitmq.publisher import KombuEventPublisher
from ai_common.adapters.storage import S3Client
from ai_common.config import RabbitMQSettings, S3Settings, WorkerSettings, load_worker_settings
from ai_common.health import start_health_server
from ai_common.logging import bind_worker_logger, configure_logging, get_logger
from ai_common.worker_sdk.base_worker import EventPublisher
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


class ConsumerLike(Protocol):
    def run(self) -> None:
        """Run the underlying consumer loop."""


HealthServerFactory = Callable[[WorkerSettings], HealthServerLike]
PublisherFactory = Callable[[RabbitMQSettings], EventPublisherContext]
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
        with publisher_factory(runtime_settings.rabbitmq) as publisher:
            s3 = storage_factory(runtime_settings.s3)
            worker = PlanningWorker(
                worker_id=runtime_settings.worker_id,
                event_publisher=publisher,
                s3=s3,
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
