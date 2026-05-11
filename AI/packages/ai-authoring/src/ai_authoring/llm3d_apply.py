from __future__ import annotations

from typing import Any

import ifcopenshell

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
from ai_authoring.operations.registry import get as get_operation


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
                "x": params["x_mm"],
                "y": params["y_mm"],
                "z": params["z_mm"],
            },
            "dimensions_mm": {
                "length": params["length_mm"],
                "width": params["width_mm"],
                "height": params["height_mm"],
            },
            "direction": params["direction"],
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
) -> dict[str, Any]:
    """Apply a parsed LLM3D MODIFY/DELETE command and write the IFC result."""
    command_type = str(command.get("command_type") or "")
    target = command.get("target") or {}
    changes = command.get("changes") or {}
    applied_count = 0
    missing_ids: list[str] = []
    failed_ids: list[str] = []

    for item in matched:
        global_id = str(item.get("global_id") or "")
        element = model.by_guid(global_id) if global_id else None
        if not element:
            missing_ids.append(global_id)
            continue

        if command_type == "DELETE":
            if delete_element(model, element):
                applied_count += 1
            else:
                failed_ids.append(global_id)
            continue

        applied_any = False
        length_mm = changes.get("length_mm")
        if length_mm and modify_length(element, length_mm, scale=scale):
            applied_any = True
        width_mm = changes.get("width_mm")
        if width_mm and modify_thickness(element, width_mm, scale=scale):
            applied_any = True
        height_mm = changes.get("height_mm")
        if height_mm and modify_height(element, height_mm, scale=scale):
            applied_any = True
        position_mm = changes.get("position_mm")
        if position_mm and modify_position(element, position_mm, scale=scale):
            applied_any = True
        material = changes.get("material")
        if material and modify_material(model, element, material):
            applied_any = True
        color = changes.get("color")
        if color and modify_color(model, element, str(color)):
            applied_any = True
        rotation_deg = changes.get("rotation_deg")
        if rotation_deg is not None and modify_rotation(model, element, float(rotation_deg)):
            applied_any = True
        face_offset_mm = changes.get("face_offset_mm")
        if face_offset_mm is not None and modify_face_offset(
            element,
            float(face_offset_mm),
            str(target.get("direction") or ""),
            scale=scale,
        ):
            applied_any = True

        if applied_any:
            applied_count += 1
        else:
            failed_ids.append(global_id)

    if applied_count == 0:
        return {
            "status": "not_applied",
            "applied_count": 0,
            "summary": failure_summary,
            "missing_ids": missing_ids,
            "failed_ids": failed_ids,
        }

    model.write(output_path)
    return {
        "status": "applied",
        "applied_count": applied_count,
        "ifc_path": output_path,
        "missing_ids": missing_ids,
        "failed_ids": failed_ids,
        "summary": f"{applied_count}개 요소 반영 완료",
    }
