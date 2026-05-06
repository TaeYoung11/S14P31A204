"""Entry point for the ai-planning-3d worker."""

from __future__ import annotations

from ai_common import load_worker_settings
from ai_common.adapters.rabbitmq.consumer import RabbitMQConsumer
from ai_common.adapters.rabbitmq.publisher import KombuEventPublisher
from ai_common.adapters.storage.s3_client import S3Client
from ai_common.health import start_health_server
from ai_common.logging import configure_logging, get_logger

from ai_planning_3d.worker import PlanningWorker


def main() -> None:
    settings = load_worker_settings()
    configure_logging(settings)

    logger = get_logger(__name__)
    logger.info(
        "worker_starting",
        workerType=settings.worker_type,
        workerId=settings.worker_id,
        environment=settings.environment,
    )

    start_health_server(settings)

    s3 = S3Client(settings.s3)

    with KombuEventPublisher(settings.rabbitmq) as publisher:
        worker = PlanningWorker(
            worker_id=settings.worker_id,
            event_publisher=publisher,
            s3=s3,
        )
        consumer = RabbitMQConsumer(
            settings=settings.rabbitmq,
            worker_type=settings.worker_type,
            handler=worker.handle,
        )
        logger.info("worker_ready", workerType=settings.worker_type)
        consumer.run()


if __name__ == "__main__":
    main()
