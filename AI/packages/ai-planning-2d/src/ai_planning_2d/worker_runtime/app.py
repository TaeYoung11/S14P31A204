"""Runtime bootstrap for the 2D LLM worker process."""

from __future__ import annotations

import argparse
import signal
from collections.abc import Callable, Sequence
from types import FrameType
from typing import Protocol, Self

from ai_common.adapters.rabbitmq.kombu_client import get_command_queue
from ai_common.adapters.rabbitmq.consumer import RabbitMQConsumer
from ai_common.adapters.rabbitmq.publisher import KombuEventPublisher
from ai_common.adapters.storage.s3_client import S3Client
from ai_common.config import RabbitMQSettings, S3Settings, WorkerSettings, load_worker_settings
from ai_common.health import start_health_server
from ai_common.logging import bind_worker_logger, configure_logging, get_logger
from ai_common.worker_sdk.base_worker import EventPublisher

from .worker import TwoDLlmWorker

WORKER_TYPE = "TWO_D_LLM"
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
    should_stop: bool

    def run(self) -> None:
        """Run the underlying consumer loop."""


HealthServerFactory = Callable[[WorkerSettings], HealthServerLike]
PublisherFactory = Callable[[RabbitMQSettings], EventPublisherContext]
StorageFactory = Callable[[S3Settings], S3Client]
ConsumerFactory = Callable[..., ConsumerLike]


def build_settings() -> WorkerSettings:
    return load_worker_settings(worker_type=WORKER_TYPE)


def _install_shutdown_handlers(
    consumer: ConsumerLike,
    *,
    logger: object,
) -> None:
    def _handle_shutdown(signum: int, _frame: FrameType | None) -> None:
        getattr(logger, "info")("two_d_llm_worker_shutdown_signal", signum=signum)
        setattr(consumer, "should_stop", True)

    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)


def run_two_d_llm_worker(
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
            f"2D LLM worker requires WORKER_TYPE={WORKER_TYPE!r}, "
            f"got {runtime_settings.worker_type!r}"
        )

    configure_logging(runtime_settings)
    logger = bind_worker_logger(_logger, runtime_settings, once=once)
    health_server = health_server_factory(runtime_settings)
    try:
        with publisher_factory(runtime_settings.rabbitmq) as publisher:
            worker = TwoDLlmWorker(
                worker_id=runtime_settings.worker_id,
                event_publisher=publisher,
                s3_client=storage_factory(runtime_settings.s3),
            )
            consumer = consumer_factory(
                settings=runtime_settings.rabbitmq,
                worker_type=runtime_settings.worker_type,
                handler=worker.handle,
                stop_after=1 if once else None,
            )
            _install_shutdown_handlers(consumer, logger=logger)
            queue_name = get_command_queue(runtime_settings.worker_type).name
            logger.info(
                "two_d_llm_worker_starting",
                queue=queue_name,
                once=once,
            )
            consumer.run()
            logger.info("two_d_llm_worker_stopped", once=once)
            return 0
    finally:
        health_server.stop()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the 2D LLM worker.")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process a single acknowledged command and exit.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    return run_two_d_llm_worker(once=args.once)


__all__ = ["WORKER_TYPE", "build_settings", "main", "run_two_d_llm_worker"]
"""2D 계획 워커 애플리케이션을 실행하기 위한 진입 래퍼를 제공한다."""
