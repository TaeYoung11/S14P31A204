from __future__ import annotations

import json
from pathlib import Path

from ai_domain import EventMessage
from tests.unit.schema_assert import validate_json_schema


ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "shared" / "schemas" / "messages" / "event_message.schema.json"


def _event(status: str) -> dict[str, object]:
    payload: dict[str, object] = {
        "eventId": f"evt-{status}",
        "schemaVersion": "v1",
        "messageType": "EVENT",
        "eventType": f"TWO_D_LLM_{status.upper()}",
        "routingKey": f"event.2d-llm.{status}",
        "jobId": "job-001",
        "jobStepId": "job-step-001",
        "stepNo": 1,
        "totalSteps": 2,
        "projectId": "project-001",
        "workerType": "TWO_D_LLM",
        "workerId": "2d-llm-worker-1",
        "status": status,
        "idempotencyKey": "job-001:1",
        "correlationId": "corr-001",
        "occurredAt": "2026-04-27T09:30:00Z",
    }
    if status == "completed":
        payload["output"] = {"storageUrl": "s3://batang-artifacts/jobs/job-001/steps/1/edit-plan.json"}
    if status in {"failed", "clarification_required"}:
        payload["error"] = {
            "code": "VALIDATION_ERROR",
            "message": "validation failed",
            "retryable": False,
            "clarificationPossible": status == "clarification_required",
        }
    if status == "progress":
        payload["progress"] = 0.5
    return payload


def test_event_fixtures_pass_json_schema_validation() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    for status in ["started", "progress", "completed", "failed", "clarification_required"]:
        validate_json_schema(_event(status), schema)


def test_event_fixtures_pass_pydantic_validation() -> None:
    for status in ["started", "progress", "completed", "failed", "clarification_required"]:
        model = EventMessage.model_validate(_event(status))
        assert model.status == status
