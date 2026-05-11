from __future__ import annotations

from typing import Any

from ai_domain import EngineRequestInlineRef, IfcEditCommandPayload
from ai_domain.worker_messages.payloads_ifc_edit import EngineOperationInlineRef

from .add_room_placement import suggest_add_room_start_mm
from .command import CommandBatch, FloorNLPCommand, IFCContext
from .remove_healing import build_remove_merge_plan
from .resize_healing import build_isolated_rectangular_resize_wall_plans
from .space_healing import build_isolated_resize_space_plan

_SPACE_PSET_NAME = "Batang_SpaceDimensions"
_SUPPORTED_SHARED_ACTIONS = {"add_room", "remove_room", "resize_room"}


def build_engine_request(
    *,
    mode: str,
    request_id: str,
    project_id: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch,
    policy_plan: dict[str, Any] | None,
    ifc_context: IFCContext | None,
    base_revision_id: str | None = None,
) -> EngineRequestInlineRef:
    operations = _build_operations(
        command=command,
        command_batch=command_batch,
        policy_plan=policy_plan,
        ifc_context=ifc_context,
    )
    if not operations:
        raise ValueError(f"shared engine request operations are empty for action={command.action}")
    return EngineRequestInlineRef(
        schema_version="v1",
        request_id=request_id,
        mode=mode,
        project_id=project_id,
        base_revision_id=base_revision_id,
        operations=operations,
    )


def build_ifc_edit_payload(
    *,
    mode: str,
    request_id: str,
    project_id: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch,
    policy_plan: dict[str, Any] | None,
    ifc_context: IFCContext | None,
    base_revision_id: str | None = None,
) -> IfcEditCommandPayload:
    return IfcEditCommandPayload(
        engineRequest=build_engine_request(
            mode=mode,
            request_id=request_id,
            project_id=project_id,
            command=command,
            command_batch=command_batch,
            policy_plan=policy_plan,
            ifc_context=ifc_context,
            base_revision_id=base_revision_id,
        )
    )


def _build_operations(
    *,
    command: FloorNLPCommand,
    command_batch: CommandBatch,
    policy_plan: dict[str, Any] | None,
    ifc_context: IFCContext | None,
) -> list[EngineOperationInlineRef]:
    if command.action not in _SUPPORTED_SHARED_ACTIONS:
        raise ValueError(f"unsupported shared action: {command.action}")

    if command.action == "add_room":
        return _build_add_room_operations(
            command=command,
            command_batch=command_batch,
            ifc_context=ifc_context,
        )
    if command.action == "remove_room":
        return _build_remove_room_operations(
            command_batch=command_batch,
            policy_plan=policy_plan,
            ifc_context=ifc_context,
        )
    return _build_resize_room_operations(
        command=command,
        command_batch=command_batch,
        policy_plan=policy_plan,
        ifc_context=ifc_context,
    )


def _build_add_room_operations(
    *,
    command: FloorNLPCommand,
    command_batch: CommandBatch,
    ifc_context: IFCContext | None,
) -> list[EngineOperationInlineRef]:
    if command.new_room is None:
        raise ValueError("add_room shared request requires new_room")
    storey_id = command_batch.commands[0].params.get("metadata", {}).get("storey_id")
    if storey_id is None:
        raise ValueError("add_room shared request requires storey_id")
    start_mm = suggest_add_room_start_mm(
        ifc_context,
        floor=command.new_room.floor,
        width=command.new_room.width,
        height=command.new_room.height,
    )
    if start_mm is None:
        raise ValueError(
            "add_room shared request could not find a feasible placement "
            "inside the floor boundary"
        )
    width = command.new_room.width
    height = command.new_room.height
    pset_updates = _space_pset_updates(
        width=width,
        height=height,
        space_type=command.new_room.type,
        shape=command.new_room.shape,
        rects=command.new_room.rects or [],
        locked=False,
    )
    return [
        EngineOperationInlineRef(
            id="op-add-space",
            type="create_element",
            selector=None,
            parameters={
                "element_type": "IfcSpace",
                "storey_id": storey_id,
                "pset_name": _SPACE_PSET_NAME,
                "start_mm": {"x": start_mm[0], "y": start_mm[1], "z": 0.0},
                "dimensions_mm": {"width": width, "height": height},
                "properties": {
                    "name": command.new_room.name,
                    "space_type": command.new_room.type,
                    "shape": command.new_room.shape,
                    "rects": command.new_room.rects or [],
                    "locked": False,
                },
                "pset_updates": {_SPACE_PSET_NAME: pset_updates},
            },
        )
    ]


def _build_remove_room_operations(
    *,
    command_batch: CommandBatch,
    policy_plan: dict[str, Any] | None,
    ifc_context: IFCContext | None = None,
) -> list[EngineOperationInlineRef]:
    delete_ids: list[str] = []
    merge_target_space_id: str | None = None
    operations: list[EngineOperationInlineRef] = []
    if policy_plan is not None:
        delete_ids.extend(policy_plan.get("remove_opening_ids", []))
        delete_ids.extend(policy_plan.get("remove_wall_ids", []))
        if policy_plan.get("target_space_id"):
            delete_ids.append(policy_plan["target_space_id"])
        merge_target_space_id = policy_plan.get("merge_target_space_id")
    else:
        delete_ids = [cmd.target_id for cmd in command_batch.commands if cmd.target_id]
    delete_ids = list(dict.fromkeys(delete_ids))
    if not delete_ids:
        raise ValueError("remove_room shared request has no target global_ids")

    merge_plan = None
    if policy_plan is not None and policy_plan.get("target_space_id"):
        merge_plan = build_remove_merge_plan(
            ifc_context=ifc_context,
            target_space_id=policy_plan["target_space_id"],
            merge_target_space_id=merge_target_space_id,
        )
    if merge_plan is not None:
        if any(abs(value) > 0.0 for value in merge_plan["anchor_translate_mm"].values()):
            operations.append(
                EngineOperationInlineRef(
                    id="op-transform-merge-target-space",
                    type="transform_elements",
                    selector={"global_ids": [merge_plan["merge_target_space_id"]]},
                    parameters={"translate_mm": merge_plan["anchor_translate_mm"]},
                )
            )
        operations.append(
            EngineOperationInlineRef(
                id="op-update-merge-target-space",
                type="update_element_properties",
                selector={"global_ids": [merge_plan["merge_target_space_id"]]},
                parameters={
                    "pset_name": _SPACE_PSET_NAME,
                    "dimensions_mm": merge_plan["dimensions_mm"],
                    "properties": {
                        "shape": "rect",
                        "rects": merge_plan["rects"],
                    },
                    "pset_updates": {
                        _SPACE_PSET_NAME: {
                            "Width": merge_plan["dimensions_mm"]["width"],
                            "Height": merge_plan["dimensions_mm"]["height"],
                            "Shape": "rect",
                            "Rects": merge_plan["rects"],
                        }
                    },
                },
            )
        )

    operations.append(
        EngineOperationInlineRef(
            id="op-delete-elements",
            type="delete_elements",
            selector={"global_ids": delete_ids},
            parameters={
                "cascade": True,
                "merge_target_space_id": merge_target_space_id,
            },
        )
    )
    return operations


def _build_resize_room_operations(
    *,
    command: FloorNLPCommand,
    command_batch: CommandBatch,
    policy_plan: dict[str, Any] | None,
    ifc_context: IFCContext | None,
) -> list[EngineOperationInlineRef]:
    target_id = command_batch.commands[0].target_id
    if target_id is None:
        raise ValueError("resize_room shared request requires target_id")
    resize_state = _resolve_resize_state(
        command=command,
        policy_plan=policy_plan,
        ifc_context=ifc_context,
    )
    operations: list[EngineOperationInlineRef] = []
    isolated_wall_plans = []
    isolated_space_plan = None
    if resize_state["affected_space_id"] is None:
        isolated_wall_plans = build_isolated_rectangular_resize_wall_plans(
            ifc_context=ifc_context,
            target_space_id=target_id,
            direction=resize_state["direction"],
            new_width=int(command.resize_width or 0),
            new_height=int(command.resize_height or 0),
        )
        isolated_space_plan = build_isolated_resize_space_plan(
            ifc_context=ifc_context,
            target_space_id=target_id,
            direction=resize_state["direction"],
            new_width=int(command.resize_width or 0),
            new_height=int(command.resize_height or 0),
        )

    target_translation = resize_state["target_anchor_translate_mm"]
    if isolated_space_plan is None and _has_non_zero_translation(target_translation):
        operations.append(
            EngineOperationInlineRef(
                id="op-transform-target-space",
                type="transform_elements",
                selector={"global_ids": [target_id]},
                parameters={"translate_mm": target_translation},
            )
        )

    boundary_translation = resize_state["boundary_translate_mm"]
    boundary_wall_ids = list(resize_state["affected_wall_ids"])
    boundary_opening_ids = list(resize_state["affected_opening_ids"])
    if (
        boundary_wall_ids
        and (resize_state["affected_space_id"] is not None or not isolated_wall_plans)
        and _has_non_zero_translation(boundary_translation)
    ):
        operations.append(
            EngineOperationInlineRef(
                id="op-transform-shared-boundary-walls",
                type="transform_elements",
                selector={"global_ids": boundary_wall_ids},
                parameters={"translate_mm": boundary_translation},
            )
        )
    if boundary_opening_ids and _has_non_zero_translation(boundary_translation):
        operations.append(
            EngineOperationInlineRef(
                id="op-transform-shared-boundary-openings",
                type="transform_elements",
                selector={"global_ids": boundary_opening_ids},
                parameters={
                    "translate_mm": boundary_translation,
                    "skip_if_host_relative": True,
                },
            )
        )

    affected_space_id = resize_state["affected_space_id"]
    affected_translation = resize_state["affected_space_anchor_translate_mm"]
    if affected_space_id is not None and _has_non_zero_translation(affected_translation):
        operations.append(
            EngineOperationInlineRef(
                id="op-transform-affected-space",
                type="transform_elements",
                selector={"global_ids": [affected_space_id]},
                parameters={"translate_mm": affected_translation},
            )
        )

    operations.append(
        EngineOperationInlineRef(
            id="op-update-target-space",
            type="update_element_properties",
            selector={"global_ids": [target_id]},
            parameters={
                "pset_name": _SPACE_PSET_NAME,
                "dimensions_mm": {
                    "width": command.resize_width,
                    "height": command.resize_height,
                },
                "properties": {
                    "shape": command.resize_shape,
                    "rects": (
                        isolated_space_plan["rects"]
                        if isolated_space_plan is not None
                        else command.resize_rects or []
                    ),
                    "polygon_mm": (
                        [
                            {"x": point[0], "y": point[1]}
                            for point in isolated_space_plan["local_polygon_mm"]
                        ]
                        if isolated_space_plan is not None
                        else None
                    ),
                },
                "pset_updates": {
                    _SPACE_PSET_NAME: _space_pset_updates(
                        width=command.resize_width,
                        height=command.resize_height,
                        shape=command.resize_shape,
                        rects=(
                            isolated_space_plan["rects"]
                            if isolated_space_plan is not None
                            else command.resize_rects or []
                        ),
                    )
                },
            },
        )
    )

    for index, wall_plan in enumerate(isolated_wall_plans, start=1):
        operations.append(
            EngineOperationInlineRef(
                id=f"op-update-wall-segment-{index}",
                type="update_element_properties",
                selector={"global_ids": [wall_plan["wall_id"]]},
                parameters={
                    "segment_mm": {
                        "start": {
                            "x": wall_plan["start_mm"][0],
                            "y": wall_plan["start_mm"][1],
                        },
                        "end": {
                            "x": wall_plan["end_mm"][0],
                            "y": wall_plan["end_mm"][1],
                        },
                    }
                },
            )
        )

    affected_dimensions = resize_state["affected_space_dimensions_mm"]
    if affected_space_id is not None and affected_dimensions is not None:
        operations.append(
            EngineOperationInlineRef(
                id="op-update-affected-space",
                type="update_element_properties",
                selector={"global_ids": [affected_space_id]},
                parameters={
                    "pset_name": _SPACE_PSET_NAME,
                    "dimensions_mm": affected_dimensions,
                    "pset_updates": {
                        _SPACE_PSET_NAME: {
                            "Width": affected_dimensions["width"],
                            "Height": affected_dimensions["height"],
                        }
                    },
                },
            )
        )

    return operations
def _resolve_resize_state(
    *,
    command: FloorNLPCommand,
    policy_plan: dict[str, Any] | None,
    ifc_context: IFCContext | None,
) -> dict[str, Any]:
    if policy_plan is None or ifc_context is None:
        raise ValueError("resize_room shared request requires policy_plan and ifc_context")
    target_id = policy_plan.get("target_space_id")
    direction = policy_plan.get("direction")
    if target_id is None or direction is None:
        raise ValueError("resize_room shared request requires target_space_id and direction")

    target = next(
        (space for space in ifc_context.get("spaces", []) if space["id"] == target_id),
        None,
    )
    if target is None:
        raise ValueError(f"resize_room target space not found: {target_id}")

    current_width = int(round(float(target.get("width") or 0.0)))
    current_height = int(round(float(target.get("height") or 0.0)))
    new_width = int(round(float(command.resize_width or current_width)))
    new_height = int(round(float(command.resize_height or current_height)))

    boundary_translate = {"x": 0.0, "y": 0.0, "z": 0.0}
    target_anchor_translate = {"x": 0.0, "y": 0.0, "z": 0.0}
    affected_anchor_translate = {"x": 0.0, "y": 0.0, "z": 0.0}
    affected_dimensions: dict[str, int] | None = None
    affected_space_id = policy_plan.get("affected_space_id")

    if direction == "west":
        boundary_translate["x"] = float(current_width - new_width)
        target_anchor_translate["x"] = boundary_translate["x"]
    elif direction == "east":
        boundary_translate["x"] = float(new_width - current_width)
        affected_anchor_translate["x"] = boundary_translate["x"]
    elif direction == "south":
        boundary_translate["y"] = float(current_height - new_height)
        target_anchor_translate["y"] = boundary_translate["y"]
    elif direction == "north":
        boundary_translate["y"] = float(new_height - current_height)
        affected_anchor_translate["y"] = boundary_translate["y"]

    if affected_space_id is not None:
        affected = next(
            (space for space in ifc_context.get("spaces", []) if space["id"] == affected_space_id),
            None,
        )
        if affected is not None:
            affected_width = int(round(float(affected.get("width") or 0.0)))
            affected_height = int(round(float(affected.get("height") or 0.0)))
            if direction == "west":
                next_width = affected_width + int(round(boundary_translate["x"]))
                _ensure_positive_dimension(next_width, affected_space_id, "width")
                affected_dimensions = {"width": next_width, "height": affected_height}
            elif direction == "east":
                next_width = affected_width - int(round(boundary_translate["x"]))
                _ensure_positive_dimension(next_width, affected_space_id, "width")
                affected_dimensions = {"width": next_width, "height": affected_height}
            elif direction == "south":
                next_height = affected_height + int(round(boundary_translate["y"]))
                _ensure_positive_dimension(next_height, affected_space_id, "height")
                affected_dimensions = {"width": affected_width, "height": next_height}
            elif direction == "north":
                next_height = affected_height - int(round(boundary_translate["y"]))
                _ensure_positive_dimension(next_height, affected_space_id, "height")
                affected_dimensions = {"width": affected_width, "height": next_height}

    return {
        "target_space_id": target_id,
        "direction": direction,
        "target_anchor_translate_mm": target_anchor_translate,
        "boundary_translate_mm": boundary_translate,
        "affected_space_anchor_translate_mm": affected_anchor_translate,
        "affected_space_id": affected_space_id,
        "affected_space_dimensions_mm": affected_dimensions,
        "affected_wall_ids": list(policy_plan.get("affected_wall_ids", [])),
        "affected_opening_ids": list(policy_plan.get("affected_opening_ids", [])),
    }


def _space_pset_updates(
    *,
    width: int | None = None,
    height: int | None = None,
    space_type: str | None = None,
    shape: str | None = None,
    rects: list[dict[str, Any]] | None = None,
    locked: bool | None = None,
) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if width is not None:
        updates["Width"] = width
    if height is not None:
        updates["Height"] = height
    if space_type is not None:
        updates["SpaceType"] = space_type
    if shape is not None:
        updates["Shape"] = shape
    if rects is not None:
        updates["Rects"] = rects
    if locked is not None:
        updates["Locked"] = locked
    return updates


def _has_non_zero_translation(translation: dict[str, float]) -> bool:
    return any(abs(value) > 0.0 for value in translation.values())


def _ensure_positive_dimension(value: int, space_id: str, axis: str) -> None:
    if value <= 0:
        raise ValueError(f"affected space {space_id} {axis} must stay positive")
