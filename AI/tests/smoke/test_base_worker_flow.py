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


class SuccessWorker(BaseWorker):
    def process(self, command: object) -> CompletedResult:
        return CompletedResult(
            output={
                "storageUrl": "s3://batang-artifacts/jobs/job-2d-001/steps/1/edit-plan.json",
            }
        )


class FailureWorker(BaseWorker):
    def process(self, command: object) -> FailedResult:
        return FailedResult(
            error=NonRetryableWorkerError(
                code="FAILED",
                message="failed",
            )
        )


class ClarificationFlowWorker(BaseWorker):
    def process(self, command: object) -> ClarificationResult:
        return ClarificationResult(
            error=ClarificationRequiredError(
                code="CLARIFICATION_REQUIRED",
                message="clarify",
                clarification_request_id="clar-001",
            )
        )


def _schema() -> dict[str, object]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _command() -> CommandMessage:
    data = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    return CommandMessage.model_validate(data)


def _run(
    worker: BaseWorker,
    publisher: InMemoryPublisher,
) -> tuple[CommandMessage, list[EventMessage]]:
    command = _command()
    worker.handle(command)
    return command, publisher.events


def _assert_flow(
    command: CommandMessage,
    events: list[EventMessage],
    terminal_status: str,
) -> None:
    assert len(events) == 2
    assert events[0].status == "started"
    assert events[1].status == terminal_status
    assert events[1].jobId == command.jobId
    assert events[1].jobStepId == command.jobStepId
    assert events[1].idempotencyKey == command.idempotencyKey
    assert events[1].correlationId == command.correlationId
    validate_json_schema(events[1].model_dump(by_alias=True, exclude_none=True), _schema())


def test_base_worker_success_flow_matches_schema_and_command_metadata() -> None:
    publisher = InMemoryPublisher()
    worker = SuccessWorker(worker_id="2d-llm-worker-1", event_publisher=publisher)

    command, events = _run(worker, publisher)
    _assert_flow(command, events, "completed")


def test_base_worker_failed_flow_matches_schema_and_command_metadata() -> None:
    publisher = InMemoryPublisher()
    worker = FailureWorker(worker_id="2d-llm-worker-1", event_publisher=publisher)

    command, events = _run(worker, publisher)
    _assert_flow(command, events, "failed")


def test_base_worker_clarification_flow_matches_schema_and_command_metadata() -> None:
    publisher = InMemoryPublisher()
    worker = ClarificationFlowWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=publisher,
    )

    command, events = _run(worker, publisher)
    _assert_flow(command, events, "clarification_required")
    assert events[1].clarificationRequestId == "clar-001"
