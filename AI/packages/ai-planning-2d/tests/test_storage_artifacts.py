from __future__ import annotations

from ai_common.storage.paths import (
    engine_request_key,
    error_detail_key,
    pad_step,
    planner_2d_command_key,
    preview_result_key,
    validation_report_key,
)
from ai_planning_2d.schemas import (
    ErrorDetailArtifact,
    PreviewResultArtifact,
    TwoDCommandArtifact,
    ValidationReportArtifact,
)


def test_storage_path_builders_use_zero_padded_steps() -> None:
    assert pad_step(1) == "001"
    assert planner_2d_command_key("proj", "job", 1) == (
        "projects/proj/jobs/job/steps/001/planner/2d-command.v1.json"
    )
    assert preview_result_key("proj", "job", 2) == (
        "projects/proj/jobs/job/steps/002/engine/preview-result.v2.json"
    )
    assert engine_request_key("proj", "job", 10) == (
        "projects/proj/jobs/job/steps/010/engine/engine-request.v2.json"
    )
    assert validation_report_key("proj", "job", 11) == (
        "projects/proj/jobs/job/steps/011/engine/validation-report.v1.json"
    )
    assert error_detail_key("proj", "job", 12) == (
        "projects/proj/jobs/job/steps/012/error/error-detail.v1.json"
    )


def test_error_detail_artifact_serializes_utc_timestamp() -> None:
    artifact = ErrorDetailArtifact(
        error_code="E",
        error_message="failed",
        error_class="RuntimeError",
        job_id="job-1",
        step_no=1,
    )

    payload = artifact.model_dump(mode="json")

    assert payload["schema_version"] == "v1"
    assert payload["timestamp"].endswith("Z")


def test_validation_report_artifact_allows_empty_issue_lists() -> None:
    artifact = ValidationReportArtifact(
        artifact_id="artifact-1",
        job_id="job-1",
        step_no=1,
    )

    payload = artifact.model_dump(mode="json")

    assert payload["schema_version"] == "v1"
    assert payload["plan_validation_issues"] == []
    assert payload["plan_validation_warnings"] == []
    assert payload["preview_warnings"] == []
    assert payload["ifc_validation_issues"] is None


def test_preview_and_command_artifacts_lock_versions() -> None:
    command_artifact = TwoDCommandArtifact.model_validate(
        {
            "user_instruction": "침실을 없애고 거실과 합쳐줘",
            "parsed_command": {
                "action": "remove_room",
                "target_room_name": "침실",
                "target_floor": 1,
                "confidence": 0.9,
                "resize_shape": "rect",
                "apply_to_all": False,
                "needs_clarification": False,
                "clarification_question": None,
            },
            "command_batch": {
                "commands": [
                    {
                        "action": "delete_space",
                        "target_id": "space-bedroom-1",
                        "params": {},
                        "confidence": 0.9,
                        "reason": "test",
                    }
                ],
                "requires_clarification": False,
                "clarification_question": None,
                "failed_command_indices": [],
            },
        }
    )
    preview_artifact = PreviewResultArtifact.model_validate(
        {
            "status": "preview_ready",
            "summary": "ok",
            "command": command_artifact.parsed_command.model_dump(mode="json"),
            "command_batch": command_artifact.command_batch.model_dump(mode="json"),
            "policy_plan": {"status": "planned"},
            "matched_count": 1,
            "validation_warnings": [],
            "engine_request": {"schema_version": "v1"},
            "ifc_edit_payload": {"engineRequest": {"schema_version": "v1"}},
            "engine_capabilities": {"shared_payload": True},
        }
    )

    assert command_artifact.model_dump(mode="json")["schema_version"] == "v1"
    assert preview_artifact.model_dump(mode="json")["schema_version"] == "v2"
