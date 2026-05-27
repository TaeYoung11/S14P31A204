from __future__ import annotations

from ai_common.storage.paths import (
    clarification_detail_key,
    engine_request_key,
    error_detail_key,
    pad_step,
    planner_2d_command_key,
    preview_result_key,
    validation_report_key,
)
from ai_planning_2d.schemas import (
    ClarificationArtifact,
    ClarificationAlternative,
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


# ---------------------------------------------------------------------------
# ClarificationArtifact 스키마 + clarification_detail_key
# ---------------------------------------------------------------------------


def test_clarification_detail_key_format() -> None:
    assert clarification_detail_key("proj", "job", 1) == (
        "projects/proj/jobs/job/steps/001/clarification/detail.v1.json"
    )
    assert clarification_detail_key("proj", "job", 10) == (
        "projects/proj/jobs/job/steps/010/clarification/detail.v1.json"
    )


def test_clarification_artifact_serializes_utc_timestamp() -> None:
    artifact = ClarificationArtifact(
        kind="needs_clarification",
        question="어느 층 거실을 삭제할까요?",
        job_id="job-1",
        step_no=1,
        clarification_request_id="req-1",
    )

    payload = artifact.model_dump(mode="json")

    assert payload["schema_version"] == "v1"
    assert payload["timestamp"].endswith("Z")


def test_clarification_artifact_kind_alternatives() -> None:
    artifact = ClarificationArtifact(
        kind="alternatives",
        question="어느 거실을 삭제할까요?",
        alternatives=[
            ClarificationAlternative(
                alternative_id="remove-living-1f",
                title="1층 거실 삭제",
                description="1층 거실(5000×7000mm)을 삭제합니다.",
                fill={"target_floor": 1, "target_room_name": "거실"},
            )
        ],
        job_id="job-2",
        step_no=2,
        clarification_request_id="req-2",
    )

    payload = artifact.model_dump(mode="json")

    assert payload["kind"] == "alternatives"
    assert len(payload["alternatives"]) == 1
    alt = payload["alternatives"][0]
    assert alt["alternative_id"] == "remove-living-1f"
    assert alt["fill"] == {"target_floor": 1, "target_room_name": "거실"}
    assert alt["affected_entities"] == []
    assert alt["warnings"] == []
    assert alt["metrics"] == []


def test_clarification_artifact_alternatives_default_empty() -> None:
    artifact = ClarificationArtifact(
        kind="needs_clarification",
        question="더 구체적인 치수를 알려주세요.",
        job_id="job-3",
        step_no=1,
        clarification_request_id="req-3",
    )

    assert artifact.alternatives == []
    assert artifact.parsed_command_preview is None
    assert artifact.policy_plan is None


def test_clarification_artifact_forbids_extra_fields() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ClarificationArtifact.model_validate(
            {
                "kind": "needs_clarification",
                "question": "Q",
                "job_id": "j",
                "step_no": 1,
                "clarification_request_id": "r",
                "unknown_field": "oops",
            }
        )


def test_clarification_alternative_requires_fill() -> None:
    alt = ClarificationAlternative(
        alternative_id="a1",
        title="옵션 1",
        description="설명",
        fill={"target_floor": 2},
    )

    assert alt.fill.target_floor == 2
    assert alt.fill.target_room_name is None
    assert alt.fill.action is None
