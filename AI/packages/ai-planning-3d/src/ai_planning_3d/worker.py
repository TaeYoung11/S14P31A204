"""Planning 3D worker for natural language interpretation."""

from __future__ import annotations

import asyncio
import json
import tempfile
import uuid
from pathlib import Path
from typing import Any

from ai_common.adapters.storage.s3_client import S3Client, parse_s3_url
from ai_common.errors import (
    ClarificationRequiredError,
    NonRetryableWorkerError,
    RetryableWorkerError,
)
from ai_common.logging import get_logger
from ai_common.worker_sdk.base_worker import BaseWorker, EventPublisher
from ai_common.worker_sdk.event_factory import (
    ClarificationResult,
    CompletedResult,
    FailedResult,
    WorkerResult,
)
from ai_domain.worker_messages.command import CommandMessage
from ai_domain.worker_messages.event import EventOutputRef

from ai_planning_3d.pipeline import LLM3DPipeline

_logger = get_logger(__name__)

_PIPELINE_TO_SCHEMA_STATUS: dict[str, str] = {
    "preview_ready": "ready",
    "needs_clarification": "clarification_required",
}


class PlanningWorker(BaseWorker):
    """Synchronous worker that wraps LLM3DPipeline for preview steps."""

    def __init__(
        self,
        *,
        worker_id: str,
        event_publisher: EventPublisher,
        s3: S3Client,
    ) -> None:
        super().__init__(worker_id=worker_id, event_publisher=event_publisher)
        self._s3 = s3

    def process(self, command: CommandMessage) -> WorkerResult:
        payload = command.payload  # ThreeDLlmCommandPayload
        ifc_url: str = payload.sourceSceneStorageUrl
        user_instruction: str = payload.userInstruction
        output_url: str | None = command.expectedOutput.threeDPlanStorageUrl

        with tempfile.TemporaryDirectory() as tmp_dir:
            ifc_path = Path(tmp_dir) / "input.ifc"
            try:
                ifc_path.write_bytes(self._s3.read_bytes(ifc_url))
            except Exception as exc:
                raise RetryableWorkerError(
                    code="IFC_DOWNLOAD_FAILED",
                    message=f"IFC 파일 다운로드 실패: {exc}",
                ) from exc

            pipeline = LLM3DPipeline(ifc_path=str(ifc_path))
            try:
                result = asyncio.run(pipeline.execute_preview(user_instruction))
            except Exception as exc:
                raise NonRetryableWorkerError(
                    code="PIPELINE_FAILED",
                    message=f"Pipeline 실행 실패: {exc}",
                ) from exc

        return self._map_result(result, command, output_url)

    def _map_result(
        self,
        result: dict[str, Any],
        command: CommandMessage,
        output_url: str | None,
    ) -> WorkerResult:
        status = result.get("status")
        stored_url = self._store_result(result, command, output_url)

        if status == "needs_clarification":
            # ambiguity_question 경로는 session_id가 없으므로 UUID로 대체
            session_id = result.get("session_id") or str(uuid.uuid4())
            _logger.info(
                "planning_needs_clarification",
                session_id=session_id,
                question_count=len(result.get("clarification_questions", [])),
            )
            return ClarificationResult(
                error=ClarificationRequiredError(
                    code="NEEDS_CLARIFICATION",
                    message=result.get("summary", "생성 전 확인이 필요합니다."),
                    clarification_request_id=session_id,
                    detail_storage_url=stored_url,
                )
            )

        if status == "preview_ready":
            return CompletedResult(output=EventOutputRef(storageUrl=stored_url))

        return FailedResult(
            error=NonRetryableWorkerError(
                code=f"PLANNING_{(status or 'unknown').upper()}",
                message=result.get("summary") or f"계획 실행 실패: {status}",
            )
        )

    def _store_result(
        self,
        result: dict[str, Any],
        command: CommandMessage,
        output_url: str | None,
    ) -> str | None:
        if not output_url:
            return None
        try:
            payload = _build_result_payload(result, command)
            loc = parse_s3_url(output_url)
            return self._s3.write_text(
                key=loc.key,
                text=json.dumps(payload, ensure_ascii=False),
                content_type="application/json; charset=utf-8",
                bucket=loc.bucket,
            )
        except Exception as exc:
            raise RetryableWorkerError(
                code="RESULT_UPLOAD_FAILED",
                message=f"결과 업로드 실패: {exc}",
            ) from exc


# ── planner_3d_result.v1.schema.json 변환 헬퍼 ───────────────────────────────


def _build_result_payload(
    result: dict[str, Any],
    command: CommandMessage,
) -> dict[str, Any]:
    """파이프라인 결과를 planner_3d_result.v1.schema.json 형식으로 변환."""
    pipeline_status = result.get("status", "")
    schema_status = _PIPELINE_TO_SCHEMA_STATUS.get(pipeline_status, "invalid_instruction")

    commands: list[dict[str, Any]] = []
    if schema_status == "ready":
        raw_cmd = result.get("command")
        if raw_cmd:
            commands = [_map_command(raw_cmd)]

    clarification = (
        _map_clarification(result) if schema_status == "clarification_required" else None
    )
    issues = _map_issues(result, pipeline_status, schema_status)

    return {
        "schema_version": "v1",
        "planner_type": "3d",
        "request_id": command.jobStepId,
        "project_id": command.projectId,
        "base_revision_id": command.sourceRevisionId,
        "source_scene_type": "SCENE_3D",
        "status": schema_status,
        "commands": commands,
        "clarification": clarification,
        "issues": issues,
    }


def _map_command(raw: dict[str, Any]) -> dict[str, Any]:
    """LLM3DCommand.model_dump() → planner3dCommand 스키마 형식."""
    cmd_type = raw.get("command_type", "")
    cmd: dict[str, Any] = {
        "command_type": cmd_type,
        "target": _map_target(raw.get("target") or {}),
        "confidence": raw.get("confidence", 1.0),
        "raw_instruction": raw.get("raw_instruction", ""),
    }
    if cmd_type == "MODIFY":
        changes = raw.get("changes")
        cmd["changes"] = _map_changes(changes) if changes else None
        cmd["create_info"] = None
    elif cmd_type == "CREATE":
        cmd["changes"] = None
        ci = raw.get("create_info")
        cmd["create_info"] = _map_create_info(ci) if ci else None
    else:  # DELETE
        cmd["changes"] = None
        cmd["create_info"] = None
    return cmd


def _map_target(raw: dict[str, Any]) -> dict[str, Any]:
    target: dict[str, Any] = {"element_type": raw.get("element_type", "IfcWall")}
    for field in ("global_id", "name", "storey", "space_name", "direction", "tag"):
        val = raw.get(field)
        if val is not None and val != "":
            target[field] = val
    if raw.get("select_all"):
        target["select_all"] = True
    return target


def _map_changes(raw: dict[str, Any]) -> dict[str, Any] | None:
    """LLM3DChanges.model_dump() → threeDChanges 스키마 형식.

    주요 변환:
    - material: {name: str} → str
    - rotation_deg: float → {x: 0, y: 0, z: float}
    - deletion 필드 제외 (DELETE는 command_type으로 표현)
    """
    changes: dict[str, Any] = {}

    material = raw.get("material")
    if isinstance(material, dict) and material.get("name"):
        changes["material"] = material["name"]

    for field in ("color", "face_offset_mm"):
        val = raw.get(field)
        if val is not None:
            changes[field] = val

    for field in ("length_mm", "height_mm", "width_mm"):
        val = raw.get(field)
        if isinstance(val, dict):
            changes[field] = {"mode": val["mode"], "value": val["value"]}

    pos = raw.get("position_mm")
    if isinstance(pos, dict):
        changes["position_mm"] = {
            "mode": pos.get("mode", "RELATIVE"),
            "x": pos.get("x", 0.0),
            "y": pos.get("y", 0.0),
            "z": pos.get("z", 0.0),
        }

    rot = raw.get("rotation_deg")
    if rot is not None:
        changes["rotation_deg"] = {"x": 0.0, "y": 0.0, "z": float(rot)}

    return changes or None


def _map_create_info(raw: dict[str, Any]) -> dict[str, Any] | None:
    """LLM3DCreateInfo.model_dump() → threeDCreateInfo 스키마 형식.

    주요 변환:
    - start_point → start_point_mm
    - shape_preset → roof_shape_preset
    - material: {name: str} → str
    - coordinate_space 추가
    """
    if not raw:
        return None
    ci: dict[str, Any] = {
        "element_type": raw.get("element_type", "IfcWall"),
        "storey": raw.get("storey") or "1F",
        "coordinate_space": "PROJECT_ABSOLUTE_MM",
    }

    sp = raw.get("start_point")
    if isinstance(sp, dict):
        ci["start_point_mm"] = {
            "x": sp.get("x", 0.0),
            "y": sp.get("y", 0.0),
            "z": sp.get("z", 0.0),
        }

    for field in (
        "length_mm",
        "width_mm",
        "height_mm",
        "azimuth_deg",
        "step_count",
        "riser_height_mm",
        "tread_depth_mm",
    ):
        val = raw.get(field)
        if val is not None:
            ci[field] = val

    for field in ("space_name", "direction", "color"):
        val = raw.get(field)
        if val:
            ci[field] = val

    material = raw.get("material")
    if isinstance(material, dict) and material.get("name"):
        ci["material"] = material["name"]

    shape = raw.get("shape_preset")
    if shape:
        ci["roof_shape_preset"] = shape
        if shape == "GABLED":
            ridge = raw.get("ridge_height_mm")
            if ridge is not None:
                ci["ridge_height_mm"] = ridge

    return ci


def _map_clarification(result: dict[str, Any]) -> dict[str, Any]:
    """파이프라인 needs_clarification 결과 → clarification 스키마 형식."""
    questions: list[dict[str, Any]] = result.get("clarification_questions") or []
    if questions:
        first = questions[0]
        question_text = first.get("question_ko") or result.get("summary", "추가 정보가 필요합니다.")
        options = [o["label"] for o in first.get("options", []) if o.get("label")]
        return {"question": question_text, "options": options}
    # ambiguity_question 경로: 질문만 있고 선택지 없음
    return {"question": result.get("summary", "추가 정보가 필요합니다.")}


def _map_issues(
    result: dict[str, Any],
    pipeline_status: str,
    schema_status: str,
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []

    for msg in result.get("structural_warnings") or []:
        issues.append({"code": "STRUCTURAL_WARNING", "severity": "warning", "message": msg})

    for msg in result.get("collision_warnings") or []:
        issues.append({"code": "COLLISION_WARNING", "severity": "warning", "message": msg})

    if schema_status == "invalid_instruction":
        code_map = {
            "not_found": "NOT_FOUND",
            "failed_quality_check": "QUALITY_CHECK_FAILED",
            "failed_structural_check": "STRUCTURAL_BLOCKED",
        }
        error_code = code_map.get(pipeline_status, "PLANNING_ERROR")
        message = result.get("summary") or result.get("message") or "처리할 수 없는 명령입니다."
        issues.append({"code": error_code, "severity": "error", "message": message})

    return issues


__all__ = ["PlanningWorker"]
