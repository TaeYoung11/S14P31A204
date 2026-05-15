"""Bucket-relative MinIO/S3 object path builders."""

from __future__ import annotations


def pad_step(step_no: int) -> str:
    return f"{step_no:03d}"


def planner_2d_command_key(project_id: str, job_id: str, step_no: int) -> str:
    return (
        f"projects/{project_id}/jobs/{job_id}/steps/{pad_step(step_no)}"
        "/planner/2d-command.v1.json"
    )


def engine_request_key(project_id: str, job_id: str, step_no: int) -> str:
    return (
        f"projects/{project_id}/jobs/{job_id}/steps/{pad_step(step_no)}"
        "/engine/engine-request.v2.json"
    )


def preview_result_key(project_id: str, job_id: str, step_no: int) -> str:
    return (
        f"projects/{project_id}/jobs/{job_id}/steps/{pad_step(step_no)}"
        "/engine/preview-result.v2.json"
    )


def validation_report_key(project_id: str, job_id: str, step_no: int) -> str:
    return (
        f"projects/{project_id}/jobs/{job_id}/steps/{pad_step(step_no)}"
        "/engine/validation-report.v1.json"
    )


def error_detail_key(project_id: str, job_id: str, step_no: int) -> str:
    return (
        f"projects/{project_id}/jobs/{job_id}/steps/{pad_step(step_no)}"
        "/error/error-detail.v1.json"
    )


def clarification_detail_key(project_id: str, job_id: str, step_no: int) -> str:
    return (
        f"projects/{project_id}/jobs/{job_id}/steps/{pad_step(step_no)}"
        "/clarification/detail.v1.json"
    )


def revision_ifc_key(project_id: str, revision_id: str) -> str:
    return f"projects/{project_id}/revisions/{revision_id}/ifc/model.v1.ifc"


def revision_manifest_key(project_id: str, revision_id: str) -> str:
    return f"projects/{project_id}/revisions/{revision_id}/manifest.v1.json"


__all__ = [
    "clarification_detail_key",
    "engine_request_key",
    "error_detail_key",
    "pad_step",
    "planner_2d_command_key",
    "preview_result_key",
    "revision_ifc_key",
    "revision_manifest_key",
    "validation_report_key",
]
