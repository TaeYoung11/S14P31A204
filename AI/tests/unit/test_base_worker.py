from __future__ import annotations

import json
from pathlib import Path

from ai_common.errors import ClarificationRequiredError, NonRetryableWorkerError
from ai_common.worker_sdk.base_worker import BaseWorker
from ai_common.worker_sdk.event_factory import (
    ClarificationResult,
    CompletedResult,
    FailedResult,
)
from ai_common.worker_sdk.context import WorkerContext
from ai_domain import CommandMessage
from ai_domain.worker_messages.event import EventMessage
from tests.unit.schema_assert import validate_json_schema


ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "shared" / "schemas" / "messages" / "event_message.schema.json"
SAMPLE_PATH = ROOT / "AI" / "sample_messages" / "command_2d_llm.json"


class InMemoryPublisher:
    def __init__(self) -> None:
        self.events: list[EventMessage] = []

    def publish(self, event: EventMessage) -> None:
        self.events.append(event)


class CompletedWorker(BaseWorker):
    def process(self, command: object) -> CompletedResult:
        return CompletedResult(
            output={
                "storageUrl": "s3://batang-artifacts/jobs/job-2d-001/steps/1/edit-plan.json",
            }
        )


class FailedWorker(BaseWorker):
    def process(self, command: object) -> FailedResult:
        return FailedResult(
            error=NonRetryableWorkerError(
                code="FAILED",
                message="failed",
            )
        )


class ClarificationWorker(BaseWorker):
    def process(self, command: object) -> ClarificationResult:
        return ClarificationResult(
            error=ClarificationRequiredError(
                code="CLARIFICATION_REQUIRED",
                message="clarify",
                clarification_request_id="clar-001",
            )
        )


class RaisedWorkerErrorWorker(BaseWorker):
    def process(self, command: object) -> CompletedResult:
        raise NonRetryableWorkerError(
            code="VALIDATION_ERROR",
            message="validation failed",
        )


class UnknownErrorWorker(BaseWorker):
    def process(self, command: object) -> CompletedResult:
        raise RuntimeError("boom")


class ProgressWorker(BaseWorker):
    def __init__(
        self,
        *,
        worker_id: str,
        event_publisher: InMemoryPublisher,
    ) -> None:
        super().__init__(worker_id=worker_id, event_publisher=event_publisher)
        self.last_context: WorkerContext | None = None

    def process(self, command: object) -> CompletedResult:
        self.last_context = WorkerContext.from_command(command)
        return CompletedResult(
            output={
                "storageUrl": "s3://batang-artifacts/jobs/job-2d-001/steps/1/edit-plan.json",
            }
        )


def _schema() -> dict[str, object]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _command() -> CommandMessage:
    data = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    return CommandMessage.model_validate(data)


def _assert_schema_valid(event: EventMessage) -> None:
    validate_json_schema(event.model_dump(by_alias=True, exclude_none=True), _schema())


def test_base_worker_started_then_completed_flow() -> None:
    publisher = InMemoryPublisher()
    worker = CompletedWorker(worker_id="2d-llm-worker-1", event_publisher=publisher)

    result = worker.handle(_command())

    assert isinstance(result, CompletedResult)
    assert [event.status for event in publisher.events] == ["started", "completed"]
    _assert_schema_valid(publisher.events[1])


def test_base_worker_started_then_failed_flow_from_result() -> None:
    publisher = InMemoryPublisher()
    worker = FailedWorker(worker_id="2d-llm-worker-1", event_publisher=publisher)

    result = worker.handle(_command())

    assert isinstance(result, FailedResult)
    assert [event.status for event in publisher.events] == ["started", "failed"]
    _assert_schema_valid(publisher.events[1])


def test_base_worker_started_then_clarification_flow_from_result() -> None:
    publisher = InMemoryPublisher()
    worker = ClarificationWorker(worker_id="2d-llm-worker-1", event_publisher=publisher)

    result = worker.handle(_command())

    assert isinstance(result, ClarificationResult)
    assert [event.status for event in publisher.events] == [
        "started",
        "clarification_required",
    ]
    assert publisher.events[1].clarificationRequestId == "clar-001"
    _assert_schema_valid(publisher.events[1])


def test_base_worker_maps_raised_worker_error_to_failed_event() -> None:
    publisher = InMemoryPublisher()
    worker = RaisedWorkerErrorWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=publisher,
    )

    result = worker.handle(_command())

    assert isinstance(result, FailedResult)
    assert result.error.code == "VALIDATION_ERROR"
    assert [event.status for event in publisher.events] == ["started", "failed"]
    _assert_schema_valid(publisher.events[1])


def test_base_worker_maps_unknown_exception_to_unhandled_failed_event() -> None:
    publisher = InMemoryPublisher()
    worker = UnknownErrorWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=publisher,
    )

    result = worker.handle(_command())

    assert isinstance(result, FailedResult)
    assert result.error.code == "UNHANDLED_WORKER_EXCEPTION"
    assert [event.status for event in publisher.events] == ["started", "failed"]
    assert publisher.events[1].error is not None
    assert publisher.events[1].error.code == "UNHANDLED_WORKER_EXCEPTION"
    _assert_schema_valid(publisher.events[1])


def test_progress_is_not_auto_emitted_and_emit_progress_is_explicit() -> None:
    publisher = InMemoryPublisher()
    worker = ProgressWorker(worker_id="2d-llm-worker-1", event_publisher=publisher)

    worker.handle(_command())

    assert [event.status for event in publisher.events] == ["started", "completed"]
    assert worker.last_context is not None

    progress_event = worker.emit_progress(worker.last_context, 0.5)

    assert progress_event.status == "progress"
    assert publisher.events[-1].status == "progress"
    assert len(publisher.events) == 3
    _assert_schema_valid(progress_event)
