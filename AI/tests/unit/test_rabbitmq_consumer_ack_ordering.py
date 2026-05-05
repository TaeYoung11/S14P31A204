from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from ai_common.adapters.rabbitmq.consumer import RabbitMQConsumer
from ai_common.config import RabbitMQSettings
from ai_domain.worker_messages.command import CommandMessage

_VALID_COMMAND: dict = {
    "messageId": "msg-test-001",
    "schemaVersion": "v1",
    "messageType": "COMMAND",
    "commandType": "SD_RENDER_GENERATE",
    "routingKey": "command.sd-render.generate",
    "jobId": "job-001",
    "jobStepId": "step-001",
    "stepNo": 1,
    "totalSteps": 1,
    "projectId": "project-test",
    "requestedBy": "user-test",
    "expectedOutputArtifactId": "artifact-001",
    "input": {
        "sourceImageStorageUrl": "s3://batang-artifacts/test/source.png",
    },
    "expectedOutput": {
        "renderImageStorageUrl": "s3://batang-artifacts/test/output.png",
    },
    "payload": {
        "prompt": "test prompt",
        "negativePrompt": "low quality",
        "sourceImageStorageUrl": "s3://batang-artifacts/test/source.png",
    },
    "attemptNo": 0,
    "maxAttempts": 3,
    "idempotencyKey": "job-001:1",
    "correlationId": "corr-001",
    "createdAt": "2026-01-01T00:00:00Z",
}


@pytest.fixture
def mock_message() -> MagicMock:
    return MagicMock()


@pytest.fixture
def consumer() -> RabbitMQConsumer:
    return RabbitMQConsumer(
        settings=RabbitMQSettings(),
        worker_type="SD_RENDER_GENERATE",
        handler=MagicMock(),
    )


def test_handler_success_acks_once(
    consumer: RabbitMQConsumer,
    mock_message: MagicMock,
) -> None:
    consumer._on_message(_VALID_COMMAND, mock_message)

    mock_message.ack.assert_called_once()
    mock_message.nack.assert_not_called()
    mock_message.reject.assert_not_called()


def test_stop_after_one_sets_should_stop_after_successful_ack(
    mock_message: MagicMock,
) -> None:
    consumer = RabbitMQConsumer(
        settings=RabbitMQSettings(),
        worker_type="SD_RENDER_GENERATE",
        handler=MagicMock(),
        stop_after=1,
    )

    consumer._on_message(_VALID_COMMAND, mock_message)

    mock_message.ack.assert_called_once()
    assert consumer.should_stop is True


def test_handler_receives_validated_command_message(
    mock_message: MagicMock,
) -> None:
    received: list[CommandMessage] = []
    consumer = RabbitMQConsumer(
        settings=RabbitMQSettings(),
        worker_type="SD_RENDER_GENERATE",
        handler=lambda cmd: received.append(cmd),
    )

    consumer._on_message(_VALID_COMMAND, mock_message)

    assert len(received) == 1
    assert isinstance(received[0], CommandMessage)
    assert received[0].jobId == "job-001"
    mock_message.ack.assert_called_once()


def test_json_string_body_is_parsed_and_acked(
    consumer: RabbitMQConsumer,
    mock_message: MagicMock,
) -> None:
    consumer._on_message(json.dumps(_VALID_COMMAND), mock_message)

    mock_message.ack.assert_called_once()
    mock_message.nack.assert_not_called()


def test_handler_failure_nacks_with_requeue(
    mock_message: MagicMock,
) -> None:
    consumer = RabbitMQConsumer(
        settings=RabbitMQSettings(),
        worker_type="SD_RENDER_GENERATE",
        handler=MagicMock(side_effect=RuntimeError("processing failed")),
    )

    consumer._on_message(_VALID_COMMAND, mock_message)

    mock_message.nack.assert_called_once_with(requeue=True)
    mock_message.ack.assert_not_called()
    mock_message.reject.assert_not_called()
    assert consumer.should_stop is False


def test_parse_failure_rejects_without_requeue(
    consumer: RabbitMQConsumer,
    mock_message: MagicMock,
) -> None:
    consumer._on_message("{invalid-json", mock_message)

    mock_message.reject.assert_called_once_with(requeue=False)
    mock_message.ack.assert_not_called()
    mock_message.nack.assert_not_called()


def test_invalid_schema_version_rejects_without_requeue(
    consumer: RabbitMQConsumer,
    mock_message: MagicMock,
) -> None:
    bad_command = {**_VALID_COMMAND, "schemaVersion": "v99"}
    consumer._on_message(bad_command, mock_message)

    mock_message.reject.assert_called_once_with(requeue=False)
    mock_message.ack.assert_not_called()
    mock_message.nack.assert_not_called()


def test_invalid_stop_after_raises_value_error() -> None:
    with pytest.raises(ValueError):
        RabbitMQConsumer(
            settings=RabbitMQSettings(),
            worker_type="SD_RENDER_GENERATE",
            handler=MagicMock(),
            stop_after=0,
        )
