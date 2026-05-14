"""Authoring Worker — IFC_EDIT_APPLY 커맨드 핸들러.

IFC_EDIT_APPLY 커맨드를 수신하여 engine request 오퍼레이션을 IFC 모델에 적용하고,
수정된 IFC를 MinIO에 업로드한 뒤 COMPLETED 이벤트를 발행한다.
"""

from __future__ import annotations

import hashlib
import json
import math
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import ifcopenshell

from ai_authoring.engine_3d import (
    delete_element,
    modify_face_offset,
    modify_color,
    modify_height,
    modify_length,
    modify_material,
    modify_position,
    modify_rotation,
    modify_thickness,
)
# operations/__init__ 경유 → create_element @register 실행
from ai_authoring.operations.registry import get as get_op_handler
from ai_authoring.post_validator import PostEditValidator
from ai_authoring.utils import normalize_space_name, normalize_storey_name
from ai_common.adapters.storage.s3_client import S3Client, parse_s3_url
from ai_common.errors import NonRetryableWorkerError, RetryableWorkerError, ValidationWorkerError
from ai_common.logging import get_logger
from ai_common.worker_sdk.base_worker import BaseWorker, EventPublisher
from ai_common.worker_sdk.context import WorkerContext
from ai_common.worker_sdk.event_factory import CompletedResult, WorkerResult
from ai_domain.worker_messages.command import CommandMessage
from ai_domain.worker_messages.payloads_ifc_edit import IfcEditCommandPayload

_logger = get_logger(__name__)


def _pad_step(step_no: int) -> str:
    """MinIO 경로용 3자리 zero-padding 변환."""
    return f"{step_no:03d}"


class AuthoringWorker(BaseWorker):
    """IFC_EDIT_APPLY 오퍼레이션을 IFC 모델에 적용하고 결과를 MinIO에 업로드한다."""

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
        ctx = WorkerContext.from_command(command)
        payload: IfcEditCommandPayload = command.payload
        engine_req = self._resolve_engine_request(payload)

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)

            ifc_bytes = self._download_ifc(command)
            src = tmp / "source.ifc"
            src.write_bytes(ifc_bytes)

            try:
                model = ifcopenshell.open(str(src))
            except Exception as exc:
                raise NonRetryableWorkerError(
                    code="IFC_PARSE_FAILED",
                    message=f"IFC 파싱 실패: {exc}",
                ) from exc

            self._validate_operations_before_mutation(engine_req)
            op_results = self._run_operations(model, engine_req, ctx)

            applied_count = sum(1 for r in op_results if r["status"] == "applied")
            if applied_count == 0:
                failed_ids = [r["operation_id"] for r in op_results]
                raise NonRetryableWorkerError(
                    code="NO_OPERATIONS_APPLIED",
                    message=f"적용된 오퍼레이션이 없습니다. ops={failed_ids}",
                )

            validation_report = PostEditValidator(model).validate(op_results, engine_req)

            out = tmp / "result.ifc"
            model.write(str(out))
            result_bytes = out.read_bytes()
            sha256 = hashlib.sha256(result_bytes).hexdigest()

            ifc_url = self._upload_ifc(result_bytes, command, ctx)
            manifest_url = self._upload_manifest(
                ifc_url, result_bytes, sha256, op_results, ctx,
                validation_report=validation_report.to_dict(),
            )

        _logger.info(
            "ifc_edit_apply_completed",
            jobId=ctx.job_id,
            stepNo=_pad_step(ctx.step_no),
            appliedOps=applied_count,
            ifcUrl=ifc_url,
        )
        return CompletedResult(
            output={
                "storage_url": ifc_url,
                "validation_report_storage_url": manifest_url,
            }
        )

    # ── Engine request 결정 ─────────────────────────────────────────────────

    def _resolve_engine_request(self, payload: IfcEditCommandPayload) -> dict[str, Any]:
        if payload.engineRequest is not None:
            return payload.engineRequest.model_dump()
        assert payload.commandJsonStorageUrl is not None
        try:
            raw = self._s3.read_text(payload.commandJsonStorageUrl)
        except Exception as exc:
            raise RetryableWorkerError(
                code="ENGINE_REQUEST_DOWNLOAD_FAILED",
                message=f"engine request JSON 다운로드 실패: {exc}",
            ) from exc
        return json.loads(raw)

    # ── IFC 다운로드 ────────────────────────────────────────────────────────

    def _download_ifc(self, command: CommandMessage) -> bytes:
        if command.input is None or command.input.sourceIfcStorageUrl is None:
            raise ValidationWorkerError(
                code="MISSING_SOURCE_IFC",
                message="command.input.sourceIfcStorageUrl 이 필요합니다 (IFC_EDIT_APPLY)",
            )
        try:
            return self._s3.read_bytes(command.input.sourceIfcStorageUrl)
        except Exception as exc:
            raise RetryableWorkerError(
                code="IFC_DOWNLOAD_FAILED",
                message=f"IFC 다운로드 실패: {exc}",
            ) from exc

    # ── 오퍼레이션 실행 ─────────────────────────────────────────────────────

    def _run_operations(
        self,
        model: ifcopenshell.file,
        engine_req: dict[str, Any],
        ctx: WorkerContext,
    ) -> list[dict[str, Any]]:
        results = []
        for op in engine_req.get("operations", []):
            op_id: str = op.get("id", "")
            op_type: str = op.get("type", "")
            selector: dict[str, Any] = op.get("selector") or {}
            params: dict[str, Any] = op.get("parameters") or {}
            results.append(self._apply_operation(model, op_id, op_type, selector, params))
        return results

    def _validate_operations_before_mutation(self, engine_req: dict[str, Any]) -> None:
        """Reject invalid mutation parameters before touching IFC geometry."""
        issues: list[str] = []
        for op in engine_req.get("operations", []) or []:
            op_id = str(op.get("id") or "<unknown>")
            op_type = str(op.get("type") or "")
            params: dict[str, Any] = op.get("parameters") or {}
            if op_type == "update_element_properties":
                self._validate_dimension_params(op_id, params.get("dimensions_mm") or {}, issues)
            if op_type == "transform_elements":
                self._validate_translation_params(op_id, params.get("translation_mm") or {}, issues)
                rotation = params.get("rotation_deg") or {}
                if rotation.get("z") is not None:
                    self._validate_finite_number(op_id, "rotation_deg.z", rotation.get("z"), issues)
        if issues:
            raise NonRetryableWorkerError(
                code="INVALID_OPERATION_PARAMETERS",
                message="; ".join(issues),
            )

    def _validate_dimension_params(
        self,
        op_id: str,
        dimensions_mm: dict[str, Any],
        issues: list[str],
    ) -> None:
        for key in ("width", "length", "height"):
            if key not in dimensions_mm or dimensions_mm[key] is None:
                continue
            value = dimensions_mm[key]
            if isinstance(value, dict):
                mode = str(value.get("mode") or "ABSOLUTE").upper()
                raw = value.get("value")
                if mode not in {"ABSOLUTE", "RELATIVE", "SCALE"}:
                    issues.append(f"{op_id}.{key}: unsupported size mode {mode}")
                    continue
                number = self._validate_finite_number(op_id, key, raw, issues)
                if number is None:
                    continue
                if mode in {"ABSOLUTE", "SCALE"} and number <= 0.0:
                    issues.append(f"{op_id}.{key}: {mode} value must be positive")
                continue

            number = self._validate_finite_number(op_id, key, value, issues)
            if number is not None and number <= 0.0:
                issues.append(f"{op_id}.{key}: dimension must be positive millimeters")

    def _validate_translation_params(
        self,
        op_id: str,
        translation_mm: dict[str, Any],
        issues: list[str],
    ) -> None:
        for key in ("x", "y", "z"):
            if key in translation_mm and translation_mm[key] is not None:
                self._validate_finite_number(
                    op_id, f"translation_mm.{key}", translation_mm[key], issues
                )

    @staticmethod
    def _validate_finite_number(
        op_id: str,
        field_name: str,
        value: Any,
        issues: list[str],
    ) -> float | None:
        try:
            number = float(value)
        except (TypeError, ValueError):
            issues.append(f"{op_id}.{field_name}: expected numeric value")
            return None
        if not math.isfinite(number):
            issues.append(f"{op_id}.{field_name}: value must be finite")
            return None
        return number

    def _apply_operation(
        self,
        model: ifcopenshell.file,
        op_id: str,
        op_type: str,
        selector: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        # create_element (v2 스키마) 또는 create_wall (v1 inline payload)
        if op_type in ("create_element", "create_wall"):
            return self._apply_create(model, op_id, op_type, params)

        elements = self._resolve_selector(model, selector)
        if not elements:
            return _op_result(op_id, op_type, "rejected", 0, [], [
                _issue("NOT_FOUND", "error", "셀렉터 조건에 맞는 요소를 찾을 수 없습니다"),
            ])

        if op_type == "delete_elements":
            return self._apply_delete(model, op_id, op_type, elements)

        if op_type in ("update_element_properties", "transform_elements"):
            return self._apply_modify(model, op_id, op_type, elements, params, selector)

        return _op_result(op_id, op_type, "skipped", len(elements), [], [
            _issue("UNSUPPORTED_OP", "warning", f"지원하지 않는 오퍼레이션 타입: {op_type}"),
        ])

    # ── CREATE ──────────────────────────────────────────────────────────────

    def _apply_create(
        self,
        model: ifcopenshell.file,
        op_id: str,
        op_type: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        # create_wall (v1) → create_element 핸들러로 위임
        if op_type == "create_wall":
            params = {"element_type": "IfcWall", **params}

        storey_name: str = params.get("storey") or "1F"
        storeys = model.by_type("IfcBuildingStorey")
        storey = next(
            (s for s in storeys if storey_name.lower() in (s.Name or "").lower()),
            storeys[0] if storeys else None,
        )
        if storey is None:
            return _op_result(op_id, op_type, "rejected", 0, [], [
                _issue("NO_STOREY", "error", "IFC 모델에 IfcBuildingStorey 가 없습니다"),
            ])

        handler = get_op_handler("create_element")
        entity = handler.execute(model, storey, params)
        if entity is None:
            return _op_result(op_id, op_type, "rejected", 0, [], [
                _issue("CREATE_FAILED", "error", "create_element 핸들러가 None 을 반환했습니다"),
            ])

        return _op_result(op_id, op_type, "applied", 1, [
            {
                "global_id": entity.GlobalId,
                "element_type": entity.is_a(),
                "name": entity.Name,
            },
        ])

    # ── DELETE ──────────────────────────────────────────────────────────────

    def _apply_delete(
        self,
        model: ifcopenshell.file,
        op_id: str,
        op_type: str,
        elements: list[ifcopenshell.entity_instance],
    ) -> dict[str, Any]:
        applied, issues = [], []
        for el in elements:
            matched = {
                "global_id": el.GlobalId,
                "element_type": el.is_a(),
                "name": el.Name,
                "description": getattr(el, "Description", None),
                "is_load_bearing": self._is_load_bearing_wall(el),
            }
            if delete_element(model, el):
                applied.append(matched)
            else:
                issues.append(_issue("DELETE_FAILED", "warning", f"삭제 실패: {el.GlobalId}"))
        status = "applied" if applied else "rejected"
        return _op_result(op_id, op_type, status, len(elements), applied, issues)

    def _is_load_bearing_wall(self, element: ifcopenshell.entity_instance) -> bool:
        if not element.is_a("IfcWall") and not element.is_a("IfcWallStandardCase"):
            return False

        text = " ".join(
            str(value)
            for value in (
                getattr(element, "Name", None),
                getattr(element, "Description", None),
            )
            if value
        ).lower()
        if any(
            keyword in text
            for keyword in (
                "load-bearing",
                "load bearing",
                "loadbearing",
                "structural",
                "bearing wall",
                "내력",
                "내력벽",
                "구조벽",
                "구조",
            )
        ):
            return True

        for rel in getattr(element, "IsDefinedBy", []) or []:
            if not rel.is_a("IfcRelDefinesByProperties"):
                continue
            pset = getattr(rel, "RelatingPropertyDefinition", None)
            if not pset:
                continue
            pset_name = (getattr(pset, "Name", "") or "").lower()
            if "wallcommon" not in pset_name and "wall" not in pset_name:
                continue
            for prop in getattr(pset, "HasProperties", []) or []:
                prop_name = (getattr(prop, "Name", "") or "").lower().replace(" ", "")
                if prop_name not in ("loadbearing", "isloadbearing"):
                    continue
                nominal = getattr(prop, "NominalValue", None)
                if getattr(nominal, "wrappedValue", None) is True:
                    return True
        return False

    # ── MODIFY (update_element_properties / transform_elements) ─────────────

    def _apply_modify(
        self,
        model: ifcopenshell.file,
        op_id: str,
        op_type: str,
        elements: list[ifcopenshell.entity_instance],
        params: dict[str, Any],
        selector: dict[str, Any],
    ) -> dict[str, Any]:
        applied, issues = [], []
        for el in elements:
            changed = self._modify_one(model, el, op_type, params, selector)
            if changed:
                applied.append(
                    {
                        "global_id": el.GlobalId,
                        "element_type": el.is_a(),
                        "name": el.Name,
                    }
                )
            else:
                issues.append(_issue("NO_CHANGE", "info", f"변경 사항 없음: {el.GlobalId}"))
        status = "applied" if applied else "skipped"
        return _op_result(op_id, op_type, status, len(elements), applied, issues)

    def _modify_one(
        self,
        model: ifcopenshell.file,
        el: ifcopenshell.entity_instance,
        op_type: str,
        params: dict[str, Any],
        selector: dict[str, Any],
    ) -> bool:
        changed = False
        if op_type == "update_element_properties":
            dims = params.get("dimensions_mm") or {}
            # dimensionChangesMm values are authored in millimeters.
            if dims.get("width"):
                changed |= bool(modify_thickness(el, dims["width"], scale=1000.0))
            if dims.get("length"):
                changed |= bool(modify_length(el, dims["length"], scale=1000.0))
            if dims.get("height"):
                changed |= bool(modify_height(el, dims["height"], scale=1000.0))
            if params.get("material"):
                changed |= bool(modify_material(model, el, {"name": params["material"]}))
            if params.get("color"):
                changed |= bool(modify_color(model, el, str(params["color"])))
            face_offset = params.get("face_offset_mm")
            if face_offset is not None:
                direction = str(selector.get("direction") or "")
                changed |= bool(
                    modify_face_offset(el, float(face_offset), direction, scale=1000.0)
                )

        elif op_type == "transform_elements":
            translation = params.get("translation_mm")
            if translation:
                # translation 은 항상 delta (RELATIVE)
                pos_dict: dict[str, Any] = {"mode": "RELATIVE", **translation}
                changed |= bool(modify_position(el, pos_dict, scale=1000.0))
            rotation = params.get("rotation_deg")
            if rotation and rotation.get("z") is not None:
                changed |= bool(modify_rotation(model, el, float(rotation["z"])))

        return changed

    # ── 셀렉터 처리 ─────────────────────────────────────────────────────────

    def _resolve_selector(
        self,
        model: ifcopenshell.file,
        selector: dict[str, Any],
    ) -> list[ifcopenshell.entity_instance]:
        global_ids: list[str] = selector.get("global_ids") or []
        if global_ids:
            return [el for gid in global_ids if (el := model.by_guid(gid)) is not None]

        element_type: str = selector.get("element_type") or "IfcProduct"
        elements: list[ifcopenshell.entity_instance] = list(model.by_type(element_type))

        storey_filter: str | None = selector.get("storey")
        if storey_filter:
            elements = [e for e in elements if _matches_storey(e, storey_filter)]

        space_filter: str | None = selector.get("space_name")
        if space_filter:
            space_matches = [e for e in elements if _matches_space(e, space_filter)]
            if space_matches:
                elements = space_matches

        direction_filter: str | None = selector.get("direction")
        if direction_filter:
            direction_matches = [e for e in elements if _matches_direction(e, direction_filter)]
            if direction_matches:
                elements = direction_matches

        name_filter: str | None = selector.get("name")
        if name_filter:
            name_lower = name_filter.lower()
            elements = [e for e in elements if name_lower in (e.Name or "").lower()]

        select_all: bool = bool(selector.get("select_all", False))
        return elements if select_all else elements[:1]

    # ── MinIO 업로드 ────────────────────────────────────────────────────────

    def _upload_ifc(
        self,
        ifc_bytes: bytes,
        command: CommandMessage,
        ctx: WorkerContext,
    ) -> str:
        ifc_url: str | None = (
            command.expectedOutput.ifcStorageUrl if command.expectedOutput is not None else None
        )
        if ifc_url:
            loc = parse_s3_url(ifc_url)
            return self._s3.write_bytes(
                loc.key, ifc_bytes, content_type="application/x-step", bucket=loc.bucket
            )
        # 백엔드가 URL 을 제공하지 않은 경우 MinIO 명세 경로로 fallback
        revision_id = ctx.target_revision_id or ctx.expected_output_artifact_id
        key = f"projects/{ctx.project_id}/revisions/{revision_id}/ifc/model.v1.ifc"
        return self._s3.write_bytes(key, ifc_bytes, content_type="application/x-step")

    def _upload_manifest(
        self,
        ifc_url: str,
        ifc_bytes: bytes,
        sha256: str,
        op_results: list[dict[str, Any]],
        ctx: WorkerContext,
        validation_report: dict[str, Any] | None = None,
    ) -> str:
        revision_id = ctx.target_revision_id or ctx.expected_output_artifact_id
        # ifc_url 에서 bucket 추출하여 manifest 경로 일관성 유지
        bucket = parse_s3_url(ifc_url).bucket
        scene_type = ctx.source_scene_type or "SCENE_3D"

        manifest = {
            "schema_version": "v1",
            "revision_id": revision_id,
            "project_id": ctx.project_id,
            "parent_revision_id": ctx.source_revision_id,
            "revision_no": ctx.step_no,
            "status": "applied",
            "created_by": ctx.requested_by,
            "created_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "source_job_id": ctx.job_id,
            "scene_states": [
                {
                    "scene_type": scene_type,
                    "schema_version": "v1",
                    "storage_url": (
                        f"s3://{bucket}/projects/{ctx.project_id}"
                        f"/revisions/{revision_id}/{scene_type}/snapshot.v1.json"
                    ),
                }
            ],
            "artifacts": [
                {
                    "artifact_id": ctx.expected_output_artifact_id,
                    "artifact_type": "ifc_model",
                    "file_name": "model.v1.ifc",
                    "mime_type": "application/x-step",
                    "storage_url": ifc_url,
                    "sha256": sha256,
                    "size_bytes": len(ifc_bytes),
                }
            ],
        }
        if validation_report is not None:
            manifest["validation_report"] = validation_report
        key = f"projects/{ctx.project_id}/revisions/{revision_id}/manifest.v1.json"
        return self._s3.write_text(
            key,
            json.dumps(manifest, ensure_ascii=False, indent=2),
            content_type="application/json",
            bucket=bucket,
        )


# ── 헬퍼 함수 ───────────────────────────────────────────────────────────────

def _op_result(
    op_id: str,
    op_type: str,
    status: str,
    target_count: int,
    matched_elements: list[dict[str, Any]],
    issues: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "operation_id": op_id,
        "operation_type": op_type,
        "status": status,
        "target_count": target_count,
        "matched_elements": matched_elements,
        "issues": issues or [],
    }


def _issue(code: str, severity: str, message: str) -> dict[str, str]:
    return {"code": code, "severity": severity, "message": message}


def _matches_storey(el: ifcopenshell.entity_instance, storey_name: str) -> bool:
    storey_lower = normalize_storey_name(storey_name).lower()
    for rel in getattr(el, "ContainedInStructure", []):
        if rel.is_a("IfcRelContainedInSpatialStructure"):
            p = rel.RelatingStructure
            if p.is_a("IfcBuildingStorey") and storey_lower in _storey_key(p.Name):
                return True
            if p.is_a("IfcSpace"):
                for decomposes in getattr(p, "Decomposes", []) or []:
                    if not decomposes.is_a("IfcRelAggregates"):
                        continue
                    storey = decomposes.RelatingObject
                    if storey.is_a("IfcBuildingStorey") and storey_lower in _storey_key(
                        storey.Name
                    ):
                        return True
    return False


def _matches_space(el: ifcopenshell.entity_instance, space_name: str) -> bool:
    space_key = _space_key(space_name)
    element_name_key = _space_key(getattr(el, "Name", None))
    if space_key and space_key in element_name_key:
        return True

    for rel in getattr(el, "ContainedInStructure", []) or []:
        if not rel.is_a("IfcRelContainedInSpatialStructure"):
            continue
        parent = rel.RelatingStructure
        if not parent.is_a("IfcSpace"):
            continue
        parent_names = [
            _space_key(getattr(parent, "Name", None)),
            _space_key(getattr(parent, "LongName", None)),
        ]
        if any(space_key and space_key in parent_name for parent_name in parent_names):
            return True
    return False


def _matches_direction(el: ifcopenshell.entity_instance, direction: str) -> bool:
    direction_key = direction.strip().lower()
    if not direction_key:
        return True
    aliases = {
        "north": ("north", "n"),
        "south": ("south", "s"),
        "east": ("east", "e"),
        "west": ("west", "w"),
    }
    direction_tokens = aliases.get(direction_key, (direction_key,))
    name_parts = _name_parts(getattr(el, "Name", None))
    return any(token in name_parts for token in direction_tokens)


def _storey_key(value: str | None) -> str:
    if not value:
        return ""
    return normalize_storey_name(value).lower()


def _space_key(value: str | None) -> str:
    normalized = normalize_space_name(value)
    if not normalized:
        return ""
    return "".join(ch for ch in normalized.lower() if ch.isalnum())


def _name_parts(value: str | None) -> set[str]:
    if not value:
        return set()
    normalized = "".join(ch.lower() if ch.isalnum() else " " for ch in value)
    return set(normalized.split())


__all__ = ["AuthoringWorker"]
