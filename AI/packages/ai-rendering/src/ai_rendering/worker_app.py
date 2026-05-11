"""ai-rendering worker 프로세스 실행 진입점."""

from __future__ import annotations

import argparse
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Protocol, Self

from ai_common.adapters.rabbitmq.consumer import RabbitMQConsumer
from ai_common.adapters.rabbitmq.publisher import KombuEventPublisher
from ai_common.config import RabbitMQSettings, WorkerSettings, load_worker_settings
from ai_common.health import start_health_server
from ai_common.logging import bind_worker_logger, configure_logging, get_logger
from ai_common.worker_sdk.base_worker import EventPublisher

from ai_rendering.worker import RenderingWorker

WORKER_TYPE = "SD_RENDER_GENERATE"
DEFAULT_WORK_ROOT = Path("outputs/ai_rendering_worker")
_logger = get_logger(__name__)


class HealthServerLike(Protocol):
    def stop(self) -> None:
        """백그라운드 health server를 종료한다."""


class EventPublisherContext(EventPublisher, Protocol):
    def __enter__(self) -> Self:
        """publisher 연결을 연다."""

    def __exit__(self, *_: object) -> None:
        """publisher 연결을 닫는다."""


class ConsumerLike(Protocol):
    def run(self) -> None:
        """RabbitMQ command consumer loop를 실행한다."""


HealthServerFactory = Callable[[WorkerSettings], HealthServerLike]
PublisherFactory = Callable[[RabbitMQSettings], EventPublisherContext]
ConsumerFactory = Callable[..., ConsumerLike]


def build_settings() -> WorkerSettings:
    """SD_RENDER_GENERATE worker 설정을 환경 변수에서 읽어온다."""

    return load_worker_settings(worker_type=WORKER_TYPE)


def run_rendering_worker(
    settings: WorkerSettings | None = None,
    *,
    once: bool = False,
    work_root: Path | str = DEFAULT_WORK_ROOT,
    health_server_factory: HealthServerFactory = start_health_server,
    publisher_factory: PublisherFactory = KombuEventPublisher,
    consumer_factory: ConsumerFactory = RabbitMQConsumer,
) -> int:
    """RenderingWorker를 RabbitMQConsumer에 연결하고 command 소비를 시작한다."""

    runtime_settings = settings or build_settings()
    if runtime_settings.worker_type != WORKER_TYPE:
        raise ValueError(
            f"Rendering worker requires WORKER_TYPE={WORKER_TYPE!r}, "
            f"got {runtime_settings.worker_type!r}"
        )

    configure_logging(runtime_settings)
    logger = bind_worker_logger(_logger, runtime_settings, once=once)
    health_server = health_server_factory(runtime_settings)
    try:
        with publisher_factory(runtime_settings.rabbitmq) as publisher:
            worker = RenderingWorker(
                worker_id=runtime_settings.worker_id,
                event_publisher=publisher,
                s3_settings=runtime_settings.s3,
                work_root=work_root,
            )
            consumer = consumer_factory(
                settings=runtime_settings.rabbitmq,
                worker_type=runtime_settings.worker_type,
                handler=worker.handle,
                stop_after=1 if once else None,
            )
            logger.info(
                "rendering_worker_starting",
                queue="batang.sd-render.command.queue",
                once=once,
            )
            consumer.run()
            logger.info("rendering_worker_stopped", once=once)
            return 0
    finally:
        health_server.stop()


def main(argv: Sequence[str] | None = None) -> int:
    """CLI 인자를 읽고 ai-rendering worker를 실행한다."""

    parser = argparse.ArgumentParser(description="Run the ai-rendering worker.")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process a single acknowledged command and exit.",
    )
    parser.add_argument(
        "--work-root",
        default=str(DEFAULT_WORK_ROOT),
        help="Local directory used for ifc2img worker temporary outputs.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        return run_rendering_worker(once=args.once, work_root=args.work_root)
    except Exception:
        _logger.exception("rendering_worker_startup_failed")
        return 1


__all__ = ["WORKER_TYPE", "build_settings", "main", "run_rendering_worker"]
