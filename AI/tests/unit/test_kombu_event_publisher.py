from __future__ import annotations

from datetime import datetime, UTC
from unittest.mock import MagicMock, patch

import pytest

from ai_common.adapters.rabbitmq.publisher import KombuEventPublisher
from ai_common.config import RabbitMQSettings
from ai_domain.worker_messages.event import EventMessage


def _make_event() -> EventMessage:
    return EventMessage(
        event_id="evt-001",
        schema_version="v1",
        message_type="EVENT",
        event_type="JOB_STARTED",
        routing_key="event.sd-render.started",
        job_id="job-001",
        job_step_id="step-001",
        step_no=1,
        total_steps=1,
        project_id="project-001",
        worker_type="SD_RENDER_GENERATE",
        worker_id="worker-001",
        status="started",
        idempotency_key="job-001:1",
        correlation_id="corr-001",
        occurred_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


def _make_publisher() -> KombuEventPublisher:
    return KombuEventPublisher(RabbitMQSettings())


def test_publish_raises_when_not_connected() -> None:
    pub = _make_publisher()
    with pytest.raises(RuntimeError, match="not connected"):
        pub.publish(_make_event())


def test_publish_success_passes_routing_key_and_delivery_mode() -> None:
    pub = _make_publisher()
    pub._connection = MagicMock()

    mock_producer = MagicMock()
    pool_entry = MagicMock()
    pool_entry.acquire.return_value.__enter__.return_value = mock_producer

    with patch("ai_common.adapters.rabbitmq.publisher.kombu.producers") as mock_producers:
        mock_producers.__getitem__.return_value = pool_entry

        event = _make_event()
        pub.publish(event)

    mock_producer.publish.assert_called_once()
    call_kwargs = mock_producer.publish.call_args.kwargs
    assert call_kwargs["routing_key"] == event.routingKey
    assert call_kwargs["delivery_mode"] == 2


def test_publish_propagates_amqp_error() -> None:
    pub = _make_publisher()
    pub._connection = MagicMock()

    mock_producer = MagicMock()
    mock_producer.publish.side_effect = OSError("connection lost")
    pool_entry = MagicMock()
    pool_entry.acquire.return_value.__enter__.return_value = mock_producer

    with patch("ai_common.adapters.rabbitmq.publisher.kombu.producers") as mock_producers:
        mock_producers.__getitem__.return_value = pool_entry

        with pytest.raises(OSError, match="connection lost"):
            pub.publish(_make_event())
