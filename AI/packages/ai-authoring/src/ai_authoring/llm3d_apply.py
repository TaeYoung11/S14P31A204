from __future__ import annotations

import hashlib
from typing import Any

import ifcopenshell

from ai_common.logging import get_logger

from ai_authoring.engine_3d import (
    create_generic_element,
    create_roof,
    create_slab,
    create_stair_preset,
    create_wall,
    delete_element,
    modify_color,
    modify_face_offset,
    modify_height,
    modify_length,
    modify_material,
    modify_position,
    modify_rotation,
    modify_thickness,
)
from ai_authoring.operations.space_support import transform_scope_for_product
from ai_authoring.operations.registry import get as get_operation

logger = get_logger(__name__)

_TEXT_PREVIEW_LIMIT = 160
_MAX_LOG_IDS = 20


def _bind_logger(log_context: dict[str, Any] | None) -> Any:
    if log_context and hasattr(logger, "bind"):
        return logger.bind(**log_context)
    return logger


def _capped_target_ids(matched: list[dict[str, Any]]) -> dict[str, Any]:
    ids = [str(item.get("global_id") or "") for item in matched if item.get("global_id")]
    return {
        "targetIds": ids[:_MAX_LOG_IDS],
        "targetIdsOmitted": max(len(ids) - _MAX_LOG_IDS, 0),
    }


def _summary_preview_fields(summary: str | None) -> dict[str, Any]:
    value = summary or ""
    compact = " ".join(value.split())
    return {
        "failureSummarySha256": hashlib.sha256(value.encode("utf-8")).hexdigest(),
        "failureSummaryPreview": compact[:_TEXT_PREVIEW_LIMIT],
    }


def _apply_result_fields(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "applyStatus": result.get("status"),
        "appliedCount": result.get("applied_count"),
        "missingCount": len(result.get("missing_ids") or []),
        "failedCount": len(result.get("failed_ids") or []),
    }


def _required_number(params: dict[str, Any], key: str) -> float:
    value = params.get(key)
    if value is None:
        raise ValueError(f"Missing required create parameter: {key}")
    return float(value)


def apply_llm3d_create_to_ifc(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    element_type: str,
    params: dict[str, Any],
    output_path: str,
) -> dict[str, Any]:
    """Create an IFC element from normalized LLM3D create parameters and write output."""
    base_params = {
        key: value
        for key, value in params.items()
        if key
        not in (
            "ridge_height_mm",
            "shape_preset",
            "step_count",
            "riser_height_mm",
            "tread_depth_mm",
            "host_wall_global_id",
            "sill_height_mm",
            "opening_offset_mm",
        )
    }

    if element_type == "IfcWall":
        entity = create_wall(model, storey, **base_params)
    elif element_type == "IfcSlab":
        entity = create_slab(model, storey, **base_params)
    elif element_type == "IfcRoof":
        entity = create_roof(model, storey, **params)
    elif element_type == "IfcStair":
        stair_params = {
            key: value
            for key, value in params.items()
            if key not in ("ridge_height_mm", "shape_preset") and value is not None
        }
        entity = create_stair_preset(model, storey, **stair_params)
    elif element_type in {"IfcDoor", "IfcWindow"}:
        create_params = {
            "element_type": element_type,
            "storey": getattr(storey, "Name", None),
            "coordinate_space": "PROJECT_ABSOLUTE_MM",
            "start_mm": {
                "x": _required_number(params, "x_mm"),
                "y": _required_number(params, "y_mm"),
                "z": _required_number(params, "z_mm"),
            },
            "dimensions_mm": {
                "length": _required_number(params, "length_mm"),
                "width": _required_number(params, "width_mm"),
                "height": _required_number(params, "height_mm"),
            },
            "direction": params.get("direction") or "north",
            "color": params.get("color"),
            "material": params.get("material_name"),
            "host_wall_global_id": params.get("host_wall_global_id"),
            "sill_height_mm": params.get("sill_height_mm"),
            "opening_offset_mm": params.get("opening_offset_mm"),
        }
        entity = get_operation("create_element").execute(model, storey, create_params)
    else:
        entity = create_generic_element(model, storey, element_type, **base_params)

    if entity:
        model.write(output_path)
        return {
            "status": "applied",
            "created_id": entity.GlobalId,
            "summary": f"신규 {element_type} 생성 완료",
        }
    return {"status": "error", "summary": "생성 실패"}


def apply_llm3d_modify_delete_to_ifc(
    model: ifcopenshell.file,
    command: dict[str, Any],
    matched: list[dict[str, Any]],
    output_path: str,
    scale: float,
    failure_summary: str,
    log_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Apply a parsed LLM3D MODIFY/DELETE command and write the IFC result."""
    command_type = str(command.get("command_type") or "")
    target = command.get("target") or {}
    changes = command.get("changes") or {}
    apply_logger = _bind_logger(log_context)
    apply_logger.info(
        "llm3d_authoring_apply_started",
        commandType=command_type,
        targetElementType=target.get("element_type"),
        selectAll=bool(target.get("select_all")),
        changeKeys=sorted(changes.keys()),
        matchedCount=len(matched),
        **_capped_target_ids(matched),
    )
    applied_count = 0
    missing_ids: list[str] = []
    failed_ids: list[str] = []

    for item in matched:
        global_id = str(item.get("global_id") or "")
        try:
            element = model.by_guid(global_id) if global_id else None
        except RuntimeError:
            element = None
        if not element:
            missing_ids.append(global_id)
            continue

        if command_type == "DELETE":
            if delete_element(model, element):
                applied_count += 1
            else:
                failed_ids.append(global_id)
            continue

        applied_ids: set[str] = set()
        length_mm = changes.get("length_mm")
        if length_mm and modify_length(element, length_mm, scale=scale):
            applied_ids.add(global_id)
        width_mm = changes.get("width_mm")
        if width_mm and modify_thickness(element, width_mm, scale=scale):
            applied_ids.add(global_id)
        height_mm = changes.get("height_mm")
        if height_mm and modify_height(element, height_mm, scale=scale):
            applied_ids.add(global_id)
        material = changes.get("material")
        if material and modify_material(model, element, material):
            applied_ids.add(global_id)
        color = changes.get("color")
        if color and modify_color(model, element, str(color)):
            applied_ids.add(global_id)

        position_mm = changes.get("position_mm")
        rotation_deg = changes.get("rotation_deg")
        transform_targets = (
            transform_scope_for_product(model, element)
            if position_mm or rotation_deg is not None
            else [element]
        )
        for transform_target in transform_targets:
            transform_id = str(getattr(transform_target, "GlobalId", "") or "")
            if position_mm and modify_position(transform_target, position_mm, scale=scale):
                applied_ids.add(transform_id)
            if rotation_deg is not None and modify_rotation(
                model,
                transform_target,
                float(rotation_deg),
            ):
                applied_ids.add(transform_id)

        face_offset_mm = changes.get("face_offset_mm")
        if face_offset_mm is not None and modify_face_offset(
            element,
            float(face_offset_mm),
            str(target.get("direction") or ""),
            scale=scale,
        ):
            applied_ids.add(global_id)

        if applied_ids:
            applied_count += len(applied_ids)
        else:
            failed_ids.append(global_id)

    if applied_count == 0:
        result = {
            "status": "not_applied",
            "applied_count": 0,
            "summary": failure_summary,
            "missing_ids": missing_ids,
            "failed_ids": failed_ids,
        }
        apply_logger.warning(
            "llm3d_authoring_apply_completed",
            commandType=command_type,
            matchedCount=len(matched),
            **_apply_result_fields(result),
            **_summary_preview_fields(failure_summary),
            **_capped_target_ids(matched),
        )
        return result

    model.write(output_path)
    status = "partial_applied" if missing_ids or failed_ids else "applied"
    result = {
        "status": status,
        "applied_count": applied_count,
        "ifc_path": output_path,
        "missing_ids": missing_ids,
        "failed_ids": failed_ids,
        "summary": f"{applied_count}개 요소 반영 완료",
    }
    level = apply_logger.info if status == "applied" else apply_logger.warning
    level(
        "llm3d_authoring_apply_completed",
        commandType=command_type,
        matchedCount=len(matched),
        **_apply_result_fields(result),
        **_capped_target_ids(matched),
    )
    return result
