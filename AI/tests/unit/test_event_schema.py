from __future__ import annotations

import json
from pathlib import Path

from ai_domain import EventMessage
from ai_common.errors import ClarificationRequiredError, NonRetryableWorkerError
from ai_common.worker_sdk.context import WorkerContext
from ai_common.worker_sdk.event_factory import (
    ClarificationResult,
    CompletedResult,
    FailedResult,
    build_clarification_event,
    build_completed_event,
    build_failed_event,
)
from tests.unit.schema_assert import validate_json_schema


ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "shared" / "schemas" / "messages" / "event_message.schema.json"


def _event(status: str) -> dict[str, object]:
    payload: dict[str, object] = {
        "event_id": f"evt-{status}",
        "schema_version": "v1",
        "message_type": "EVENT",
        "event_type": f"TWO_D_LLM_{status.upper()}",
        "routing_key": f"event.two-d-llm.{status.replace('_', '-')}",
        "job_id": "job-001",
        "job_step_id": "job-step-001",
        "step_no": 1,
        "total_steps": 2,
        "project_id": "project-001",
        "worker_type": "TWO_D_LLM",
        "worker_id": "2d-llm-worker-1",
        "status": status,
        "idempotency_key": "job-001:1",
        "correlation_id": "corr-001",
        "occurred_at": "2026-04-27T09:30:00Z",
    }
    if status == "completed":
        payload["output"] = {
            "storage_url": "s3://batang-artifacts/jobs/job-001/steps/1/edit-plan.json"
        }
    if status in {"failed", "clarification_required"}:
        payload["error"] = {
            "code": "VALIDATION_ERROR",
            "message": "validation failed",
            "retryable": False,
            "clarification_possible": status == "clarification_required",
        }
    if status == "clarification_required":
        payload["clarification_request_id"] = "clar-001"
    if status == "progress":
        payload["progress"] = 0.5
    return payload


def _context() -> WorkerContext:
    return WorkerContext(
        message_id="cmd-001",
        command_type="TWO_D_LLM_GENERATE",
        routing_key="command.two-d-llm.generate",
        job_id="job-001",
        job_step_id="job-step-001",
        step_no=1,
        total_steps=2,
        project_id="project-001",
        requested_by="user-001",
        expected_output_artifact_id="artifact-001",
        attempt_no=0,
        max_attempts=3,
        idempotency_key="job-001:1",
        correlation_id="corr-001",
        source_revision_id="rev-src-001",
        source_scene_state_id=None,
        source_scene_type=None,
        target_revision_id="rev-target-001",
    )


def test_event_fixtures_pass_json_schema_validation() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    for status in ["started", "progress", "completed", "failed", "clarification_required"]:
        validate_json_schema(_event(status), schema)


def test_event_fixtures_pass_pydantic_validation() -> None:
    for status in ["started", "progress", "completed", "failed", "clarification_required"]:
        model = EventMessage.model_validate(_event(status))
        assert model.status == status


def test_failed_event_requires_error_for_json_schema_and_pydantic() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    payload = _event("failed")
    payload.pop("error")

    try:
        validate_json_schema(payload, schema)
    except ValueError:
        pass
    else:
        raise AssertionError("failed event without error must be rejected by schema")

    try:
        EventMessage.model_validate(payload)
    except ValueError:
        pass
    else:
        raise AssertionError("failed event without error must be rejected by pydantic")


def test_completed_event_requires_output_for_json_schema_and_pydantic() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    payload = _event("completed")
    payload.pop("output")

    try:
        validate_json_schema(payload, schema)
    except ValueError:
        pass
    else:
        raise AssertionError("completed event without output must be rejected by schema")

    try:
        EventMessage.model_validate(payload)
    except ValueError:
        pass
    else:
        raise AssertionError("completed event without output must be rejected by pydantic")


def test_completed_event_accepts_floor_plan_project_output_for_json_schema_and_pydantic() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    floor_plan_project = {
        "id": "ifc-result",
        "unit": "mm",
        "floors": [],
        "rooms": [{"id": "room-1"}],
        "adjacency": [],
    }
    payload = _event("completed")
    assert isinstance(payload["output"], dict)
    payload["output"]["floor_plan_project"] = floor_plan_project

    validate_json_schema(payload, schema)
    model = EventMessage.model_validate(payload)

    assert model.output is not None
    assert model.output.floorPlanProject == floor_plan_project


def test_clarification_event_requires_request_id_for_json_schema_and_pydantic() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    payload = _event("clarification_required")
    payload.pop("clarification_request_id")

    try:
        validate_json_schema(payload, schema)
    except ValueError:
        pass
    else:
        raise AssertionError(
            "clarification_required event without "
            "clarification_request_id must be rejected by schema"
        )

    try:
        EventMessage.model_validate(payload)
    except ValueError:
        pass
    else:
        raise AssertionError(
            "clarification_required event without "
            "clarificationRequestId must be rejected by pydantic"
        )


def test_progress_event_requires_progress_for_json_schema_and_pydantic() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    payload = _event("progress")
    payload.pop("progress")

    try:
        validate_json_schema(payload, schema)
    except ValueError:
        pass
    else:
        raise AssertionError("progress event without progress must be rejected by schema")

    try:
        EventMessage.model_validate(payload)
    except ValueError:
        pass
    else:
        raise AssertionError("progress event without progress must be rejected by pydantic")


def test_event_message_serializes_with_snake_case_aliases() -> None:
    model = EventMessage.model_validate(_event("completed"))
    data = model.model_dump(by_alias=True, exclude_none=True)

    assert "event_id" in data
    assert "routing_key" in data
    assert "output" in data
    assert "storage_url" in data["output"]


def test_event_factory_payloads_remain_schema_valid_after_serialization() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    context = _context()

    events = [
        build_completed_event(
            context,
            "2d-llm-worker-1",
            CompletedResult(
                output={
                    "storageUrl": "s3://batang-artifacts/jobs/job-001/steps/1/edit-plan.json"
                }
            ),
        ),
        build_failed_event(
            context,
            "2d-llm-worker-1",
            FailedResult(
                error=NonRetryableWorkerError(
                    code="FAILED",
                    message="failed",
                )
            ),
        ),
        build_clarification_event(
            context,
            "2d-llm-worker-1",
            ClarificationResult(
                error=ClarificationRequiredError(
                    code="CLARIFICATION_REQUIRED",
                    message="clarify",
                    clarification_request_id="clar-001",
                )
            ),
        ),
    ]

    for event in events:
        validate_json_schema(event.model_dump(by_alias=True, exclude_none=True), schema)
