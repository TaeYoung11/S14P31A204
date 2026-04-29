from __future__ import annotations

import json
from pathlib import Path

from ai_common.errors import ClarificationRequiredError, NonRetryableWorkerError
from ai_common.worker_sdk.context import WorkerContext
from ai_common.worker_sdk.event_factory import (
    ClarificationResult,
    CompletedResult,
    FailedResult,
    build_clarification_event,
    build_completed_event,
    build_failed_event,
    build_progress_event,
    build_started_event,
    build_terminal_event,
)
from ai_common.worker_sdk.lifecycle import (
    build_event_routing_key,
    build_event_type,
    build_worker_type,
)
from ai_domain.worker_messages.event import EventOutputRef
from tests.unit.schema_assert import validate_json_schema


ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "shared" / "schemas" / "messages" / "event_message.schema.json"


def _context() -> WorkerContext:
    return WorkerContext(
        message_id="cmd-001",
        command_type="TWO_D_LLM_GENERATE",
        routing_key="command.2d-llm.generate",
        job_id="job-001",
        job_step_id="step-001",
        step_no=1,
        total_steps=2,
        project_id="project-001",
        requested_by="user-001",
        expected_output_artifact_id="artifact-001",
        attempt_no=0,
        max_attempts=3,
        idempotency_key="idem-001",
        correlation_id="corr-001",
        source_revision_id="rev-src-001",
        source_scene_state_id=None,
        source_scene_type=None,
        target_revision_id="rev-target-001",
    )


def _schema() -> dict[str, object]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def test_build_started_event_creates_schema_valid_event() -> None:
    context = _context()
    event = build_started_event(context, "2d-llm-worker-1")

    assert event.status == "started"
    assert event.eventType == build_event_type(context.command_type, "started")
    assert event.routingKey == build_event_routing_key(
        build_worker_type(context.command_type),
        "started",
    )
    assert event.workerType == "TWO_D_LLM"
    validate_json_schema(event.model_dump(by_alias=True, exclude_none=True), _schema())


def test_build_progress_event_sets_progress_and_schema_valid_output() -> None:
    context = _context()
    event = build_progress_event(context, "2d-llm-worker-1", 0.5)

    assert event.status == "progress"
    assert event.progress == 0.5
    validate_json_schema(event.model_dump(by_alias=True, exclude_none=True), _schema())


def test_build_completed_event_coerces_dict_output() -> None:
    context = _context()
    result = CompletedResult(
        output={
            "storageUrl": "s3://batang-artifacts/jobs/job-001/steps/1/edit-plan.json",
        }
    )

    event = build_completed_event(context, "2d-llm-worker-1", result)

    assert event.status == "completed"
    assert isinstance(event.output, EventOutputRef)
    assert event.output.storageUrl == "s3://batang-artifacts/jobs/job-001/steps/1/edit-plan.json"
    validate_json_schema(event.model_dump(by_alias=True, exclude_none=True), _schema())


def test_build_failed_event_maps_worker_error_to_event_error() -> None:
    context = _context()
    result = FailedResult(
        error=NonRetryableWorkerError(
            code="VALIDATION_ERROR",
            message="validation failed",
        )
    )

    event = build_failed_event(context, "2d-llm-worker-1", result)

    assert event.status == "failed"
    assert event.error is not None
    assert event.error.code == "VALIDATION_ERROR"
    assert event.error.retryable is False
    validate_json_schema(event.model_dump(by_alias=True, exclude_none=True), _schema())


def test_build_clarification_event_requires_request_id() -> None:
    context = _context()
    result = ClarificationResult(
        error=ClarificationRequiredError(
            code="CLARIFICATION_REQUIRED",
            message="Need more detail",
            clarification_request_id="clar-001",
        )
    )

    event = build_clarification_event(context, "2d-llm-worker-1", result)

    assert event.status == "clarification_required"
    assert event.clarificationRequestId == "clar-001"
    assert event.error is not None
    assert event.error.clarificationPossible is True
    validate_json_schema(event.model_dump(by_alias=True, exclude_none=True), _schema())


def test_build_terminal_event_dispatches_by_result_type() -> None:
    context = _context()

    completed = build_terminal_event(
        context,
        "2d-llm-worker-1",
        CompletedResult(
            output={
                "storageUrl": "s3://batang-artifacts/jobs/job-001/steps/1/edit-plan.json",
            }
        ),
    )
    failed = build_terminal_event(
        context,
        "2d-llm-worker-1",
        FailedResult(
            error=NonRetryableWorkerError(
                code="FAILED",
                message="failed",
            )
        ),
    )
    clarification = build_terminal_event(
        context,
        "2d-llm-worker-1",
        ClarificationResult(
            error=ClarificationRequiredError(
                code="CLARIFICATION_REQUIRED",
                message="clarify",
                clarification_request_id="clar-002",
            )
        ),
    )

    assert completed.status == "completed"
    assert failed.status == "failed"
    assert clarification.status == "clarification_required"
