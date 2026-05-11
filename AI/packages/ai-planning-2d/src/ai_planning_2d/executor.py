from __future__ import annotations

import json
from typing import Any

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.pset
import ifcopenshell.api.root
import numpy as np
from ai_authoring.operations.space_support import is_product_host_relative
from ai_authoring.operations.wall_support import update_wall_segment
from ifcopenshell.util import element as ifc_element
from ifcopenshell.util.placement import get_local_placement
from shapely.geometry import LineString, Point

from .add_room_placement import suggest_add_room_start_mm
from .command import CommandBatch, FloorNLPCommand
from .ifc_extractor import extract_ifc_context
from .remove_healing import build_remove_merge_plan
from .resize_healing import build_isolated_rectangular_resize_wall_plans
from .space_healing import build_isolated_resize_space_plan

_DEFAULT_SPACE_HEIGHT_M = 2.7
_ROOM_PLANNING_ACTIONS = {"add_room", "remove_room", "resize_room"}


def apply_space_plan(
    *,
    ifc_path: str,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None = None,
    policy_plan: dict[str, Any] | None,
    ifc_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if command.action in _ROOM_PLANNING_ACTIONS:
        return {
            "status": "not_applied",
            "summary": (
                f"{command.action} is planning-assist only on this branch "
                "and cannot be auto-applied."
            ),
        }

    model = ifcopenshell.open(ifc_path)
    if command.action == "add_room":
        return _apply_add_room(
            model=model,
            ifc_path=ifc_path,
            output_path=output_path,
            command=command,
            command_batch=command_batch,
        )

    if policy_plan is None or policy_plan.get("status") != "planned":
        return {
            "status": "not_applied",
            "summary": "planned 상태의 2D policy plan이 없어 IFC를 수정하지 않았습니다.",
        }

    if command.action == "remove_room":
        return _apply_remove_room(
            model=model,
            output_path=output_path,
            policy_plan=policy_plan,
            ifc_context=ifc_context,
        )
    if command.action == "insert_toilet":
        return _apply_insert_toilet_v2(
            model=model,
            output_path=output_path,
            command=command,
            command_batch=command_batch,
            policy_plan=policy_plan,
        )
    if command.action == "resize_room":
        return _apply_resize_room(
            model=model,
            output_path=output_path,
            command=command,
            policy_plan=policy_plan,
            ifc_context=ifc_context,
        )

    return {
        "status": "not_applied",
        "summary": f"{command.action}은 아직 2D executor가 지원하지 않습니다.",
    }


def _apply_add_room(
    *,
    model: ifcopenshell.file,
    ifc_path: str,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None,
) -> dict[str, Any]:
    if command.new_room is None or command_batch is None or not command_batch.commands:
        return {"status": "not_applied", "summary": "add_room 실행에 필요한 명령 정보가 없습니다."}

    metadata = command_batch.commands[0].params.get("metadata", {})
    storey_id = metadata.get("storey_id")
    if storey_id is None:
        return {
            "status": "not_applied",
            "summary": "대상 storey_id가 없어 방을 추가하지 않았습니다.",
        }

    storey = model.by_guid(storey_id)
    if storey is None:
        return {"status": "not_applied", "summary": "대상 IfcBuildingStorey를 찾지 못했습니다."}

    owner_history = _owner_history(model)
    context = _ensure_body_context(model)
    ifc_context = extract_ifc_context(ifc_path)
    start_mm = suggest_add_room_start_mm(
        ifc_context,
        floor=command.new_room.floor,
        width=command.new_room.width,
        height=command.new_room.height,
    )
    if start_mm is None:
        return {
            "status": "not_applied",
            "summary": (
                "floor boundary 내부에서 추가 방을 배치할 수 있는 "
                "유효한 위치를 찾지 못했습니다."
            ),
        }
    x_m, y_m = start_mm[0] / 1000.0, start_mm[1] / 1000.0

    space = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcSpace",
        name=command.new_room.name,
    )
    space.OwnerHistory = owner_history
    space.CompositionType = "ELEMENT"
    space.ObjectPlacement = _create_local_placement(
        model=model,
        relative_to=getattr(storey, "ObjectPlacement", None),
        location=(x_m, y_m, 0.0),
        ref_direction=(1.0, 0.0, 0.0),
    )
    space.Representation = _create_space_representation(
        model=model,
        width_m=command.new_room.width / 1000.0,
        height_m=command.new_room.height / 1000.0,
        depth_m=_DEFAULT_SPACE_HEIGHT_M,
        context=context,
    )
    ifcopenshell.api.aggregate.assign_object(model, products=[space], relating_object=storey)
    _update_space_pset(
        model=model,
        space=space,
        width_mm=command.new_room.width,
        height_mm=command.new_room.height,
        rects=command.new_room.rects,
        room_type=command.new_room.type,
        shape=command.new_room.shape,
        locked=False,
    )

    model.write(output_path)
    return {
        "status": "applied",
        "summary": "IfcSpace 추가가 적용되었습니다.",
        "created_space_id": space.GlobalId,
    }


def _apply_remove_room(
    *,
    model: ifcopenshell.file,
    output_path: str,
    policy_plan: dict[str, Any],
    ifc_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    merge_target_space_id = policy_plan.get("merge_target_space_id")
    merge_plan = build_remove_merge_plan(
        ifc_context=ifc_context,
        target_space_id=policy_plan["target_space_id"],
        merge_target_space_id=merge_target_space_id,
    )
    if merge_plan is not None:
        _apply_remove_merge_plan(model=model, merge_plan=merge_plan)
    _remove_related_products(model, policy_plan.get("remove_opening_ids", []))
    _remove_related_products(model, policy_plan.get("remove_wall_ids", []))
    space = model.by_guid(policy_plan["target_space_id"])
    if space is None:
        return {"status": "not_applied", "summary": "삭제 대상 IfcSpace를 찾지 못했습니다."}

    ifcopenshell.api.root.remove_product(model, product=space)
    model.write(output_path)
    return {
        "status": "applied",
        "summary": "IfcSpace 삭제가 적용되었습니다.",
        "removed_space_id": policy_plan["target_space_id"],
        "merge_target_space_id": merge_target_space_id,
    }


def _apply_resize_room(
    *,
    model: ifcopenshell.file,
    output_path: str,
    command: FloorNLPCommand,
    policy_plan: dict[str, Any],
    ifc_context: dict[str, Any] | None,
) -> dict[str, Any]:
    space = model.by_guid(policy_plan["target_space_id"])
    if space is None:
        return {"status": "not_applied", "summary": "크기 변경 대상 IfcSpace를 찾지 못했습니다."}

    placement = getattr(space, "ObjectPlacement", None)
    relative = getattr(placement, "RelativePlacement", None) if placement else None
    location = getattr(relative, "Location", None) if relative else None
    if relative is None or location is None:
        return {"status": "not_applied", "summary": "IfcSpace placement를 읽지 못했습니다."}

    current_width_m, current_height_m, current_depth_m = _space_dimensions_m(space)
    new_width_m = (command.resize_width or 0) / 1000.0
    new_height_m = (command.resize_height or 0) / 1000.0
    direction = policy_plan.get("direction")
    isolated_wall_plans = []
    isolated_space_plan = None
    if policy_plan.get("affected_space_id") is None:
        isolated_wall_plans = build_isolated_rectangular_resize_wall_plans(
            ifc_context=ifc_context,
            target_space_id=policy_plan["target_space_id"],
            direction=direction,
            new_width=int(command.resize_width or 0),
            new_height=int(command.resize_height or 0),
        )
        isolated_space_plan = build_isolated_resize_space_plan(
            ifc_context=ifc_context,
            target_space_id=policy_plan["target_space_id"],
            direction=direction,
            new_width=int(command.resize_width or 0),
            new_height=int(command.resize_height or 0),
        )

    boundary_offset_x_m, boundary_offset_y_m = _boundary_shift_m(
        direction=direction,
        current_width_m=current_width_m,
        current_height_m=current_height_m,
        new_width_m=new_width_m,
        new_height_m=new_height_m,
    )
    if isolated_space_plan is None:
        target_offset_x_m = boundary_offset_x_m if direction == "west" else 0.0
        target_offset_y_m = boundary_offset_y_m if direction == "south" else 0.0
        _translate_relative_placement_location(
            model=model,
            relative_placement=relative,
            offset_x_m=target_offset_x_m,
            offset_y_m=target_offset_y_m,
        )
        space.Representation = _create_space_representation(
            model=model,
            width_m=new_width_m,
            height_m=new_height_m,
            depth_m=current_depth_m,
            context=_body_context(model, space),
        )
    else:
        space.Representation = _create_space_representation_from_polygon(
            model=model,
            polygon_mm=isolated_space_plan["local_polygon_mm"],
            depth_m=current_depth_m,
            context=_body_context(model, space),
        )
    _translate_products(
        model,
        policy_plan.get("affected_wall_ids", [])
        if policy_plan.get("affected_space_id") is not None or not isolated_wall_plans
        else [],
        boundary_offset_x_m,
        boundary_offset_y_m,
    )
    _translate_products(
        model,
        policy_plan.get("affected_opening_ids", []),
        boundary_offset_x_m,
        boundary_offset_y_m,
        skip_host_relative=True,
    )
    _update_affected_space_for_resize(
        model=model,
        affected_space_id=policy_plan.get("affected_space_id"),
        direction=direction,
        boundary_offset_x_m=boundary_offset_x_m,
        boundary_offset_y_m=boundary_offset_y_m,
    )
    if isolated_wall_plans:
        _apply_isolated_resize_wall_plans(
            model=model,
            wall_plans=isolated_wall_plans,
        )
    _update_space_pset(
        model=model,
        space=space,
        width_mm=command.resize_width,
        height_mm=command.resize_height,
        rects=(
            isolated_space_plan["rects"]
            if isolated_space_plan is not None
            else command.resize_rects
        ),
    )

    model.write(output_path)
    return {
        "status": "applied",
        "summary": "IfcSpace 크기 변경이 적용되었습니다.",
        "resized_space_id": policy_plan["target_space_id"],
    }


def _apply_insert_toilet(
    *,
    model: ifcopenshell.file,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None,
    policy_plan: dict[str, Any],
) -> dict[str, Any]:
    donor = model.by_guid(policy_plan["donor_room_id"])
    if donor is None:
        return {
            "status": "not_applied",
            "summary": "insert_toilet donor IfcSpaceë¥¼ ì°¾ì§€ ëª»í–ˆìŠµë‹ˆë‹¤.",
        }

    create_command = None
    if command_batch is not None:
        create_command = next(
            (item for item in command_batch.commands if item.action.value == "create_space"),
            None,
        )
    storey_id = None
    if create_command is not None:
        storey_id = create_command.params.get("metadata", {}).get("storey_id")
    if storey_id is None:
        return {
            "status": "not_applied",
            "summary": "insert_toilet storey_idê°€ ì—†ì–´ applyë¥¼ ìˆ˜í–‰í•  ìˆ˜ ì—†ìŠµë‹ˆë‹¤.",
        }

    storey = model.by_guid(storey_id)
    if storey is None:
        return {
            "status": "not_applied",
            "summary": "insert_toilet target storeyè¥¼ ì°¾ì§€ ëª»í–ˆìŠµë‹ˆë‹¤.",
        }

    _, _, donor_depth_m = _space_dimensions_m(donor)
    donor_depth_m = donor_depth_m if donor_depth_m > 0.0 else _DEFAULT_SPACE_HEIGHT_M
    donor.Representation = _create_space_representation_from_polygon(
        model=model,
        polygon_mm=policy_plan["donor_local_polygon_mm"],
        depth_m=donor_depth_m,
        context=_body_context(model, donor),
    )
    donor_min_x, donor_min_y, donor_max_x, donor_max_y = _polygon_bbox_mm(
        policy_plan["donor_world_polygon_mm"]
    )
    _update_space_pset(
        model=model,
        space=donor,
        width_mm=int(round(donor_max_x - donor_min_x)),
        height_mm=int(round(donor_max_y - donor_min_y)),
        rects=None,
        shape="poly",
    )

    toilet_world_polygon_mm = policy_plan["toilet_world_polygon_mm"]
    toilet_min_x, toilet_min_y, toilet_max_x, toilet_max_y = _polygon_bbox_mm(
        toilet_world_polygon_mm
    )
    toilet_local_polygon_mm = [
        (float(x - toilet_min_x), float(y - toilet_min_y))
        for x, y in toilet_world_polygon_mm
    ]
    toilet = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcSpace",
        name=policy_plan["toilet_name"],
    )
    toilet.OwnerHistory = _owner_history(model)
    toilet.CompositionType = "ELEMENT"
    toilet.ObjectPlacement = _create_local_placement(
        model=model,
        relative_to=getattr(storey, "ObjectPlacement", None),
        location=(toilet_min_x / 1000.0, toilet_min_y / 1000.0, 0.0),
        ref_direction=(1.0, 0.0, 0.0),
    )
    toilet.Representation = _create_space_representation_from_polygon(
        model=model,
        polygon_mm=toilet_local_polygon_mm,
        depth_m=donor_depth_m,
        context=_ensure_body_context(model),
    )
    ifcopenshell.api.aggregate.assign_object(model, products=[toilet], relating_object=storey)
    _update_space_pset(
        model=model,
        space=toilet,
        width_mm=int(round(toilet_max_x - toilet_min_x)),
        height_mm=int(round(toilet_max_y - toilet_min_y)),
        rects=None,
        room_type="bathroom",
        shape="poly",
        locked=False,
    )
    west_wall = _create_linear_wall(
        model=model,
        storey=storey,
        start_mm=(toilet_min_x, toilet_min_y),
        end_mm=(toilet_min_x, toilet_max_y),
        name="Toilet Divider Wall",
        thickness_mm=200,
    )
    south_wall = _create_linear_wall(
        model=model,
        storey=storey,
        start_mm=(toilet_min_x, toilet_min_y),
        end_mm=(toilet_max_x, toilet_min_y),
        name="Toilet South Wall",
        thickness_mm=200,
    )
    east_wall = _create_linear_wall(
        model=model,
        storey=storey,
        start_mm=(toilet_max_x, toilet_min_y),
        end_mm=(toilet_max_x, toilet_max_y),
        name="Toilet Exterior Wall",
        thickness_mm=200,
    )
    _attach_space_boundary(model=model, wall=west_wall, space=donor)
    _attach_space_boundary(model=model, wall=west_wall, space=toilet)
    _attach_space_boundary(model=model, wall=south_wall, space=toilet)
    _attach_space_boundary(model=model, wall=east_wall, space=toilet)
    wall_length_mm = int(round(toilet_max_y - toilet_min_y))
    door_width_mm = min(900, max(700, wall_length_mm - 200))
    door_offset_mm = max(0, (wall_length_mm - door_width_mm) / 2.0)
    _create_hosted_door(
        model=model,
        storey=storey,
        host_wall=west_wall,
        placement_mm=(toilet_min_x, toilet_min_y + door_offset_mm),
        width_mm=door_width_mm,
        height_mm=2100,
        name="Toilet Door",
    )
    window_width_mm = min(700, max(500, int(round(toilet_max_x - toilet_min_x - 400))))
    window_offset_mm = max(0, (wall_length_mm - window_width_mm) / 2.0)
    _create_hosted_window(
        model=model,
        storey=storey,
        host_wall=east_wall,
        placement_mm=(toilet_max_x, toilet_min_y + window_offset_mm),
        width_mm=window_width_mm,
        height_mm=900,
        sill_height_mm=1000,
        name="Toilet Window",
    )

    model.write(output_path)
    return {
        "status": "applied",
        "summary": "ì¸ì ‘ ê³µê°„ì„ ì¡°ì •í•´ í™”ìž¥ì‹¤ì„ ì¶”ê°€í–ˆìŠµë‹ˆë‹¤.",
        "created_space_id": toilet.GlobalId,
        "updated_space_id": donor.GlobalId,
    }


def _apply_insert_toilet_v2(
    *,
    model: ifcopenshell.file,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None,
    policy_plan: dict[str, Any],
) -> dict[str, Any]:
    del command, command_batch
    if policy_plan.get("validation_errors"):
        return {
            "status": "not_applied",
            "summary": "insert_toilet plan validation failed.",
            "validation_errors": policy_plan["validation_errors"],
        }

    donor = model.by_guid(policy_plan["donor_room_id"])
    if donor is None:
        return {
            "status": "not_applied",
            "summary": "insert_toilet donor IfcSpace could not be found.",
        }
    storey = model.by_guid(policy_plan["storey_id"])
    if storey is None:
        return {
            "status": "not_applied",
            "summary": "insert_toilet target storey could not be found.",
        }

    _apply_existing_opening_plans(
        model=model,
        opening_plans=policy_plan.get("existing_openings_plan", []),
    )
    if policy_plan.get("donor_walls_to_delete"):
        _remove_related_products(model, list(policy_plan["donor_walls_to_delete"]))

    existing_space_entities: dict[str, ifcopenshell.entity_instance] = {}
    donor_depth_m = _DEFAULT_SPACE_HEIGHT_M
    for space_plan in policy_plan.get("space_plans", []):
        global_id = space_plan.get("global_id")
        if not global_id:
            continue
        space = model.by_guid(global_id)
        if space is None:
            continue
        _, _, current_depth_m = _space_dimensions_m(space)
        current_depth_m = current_depth_m if current_depth_m > 0.0 else _DEFAULT_SPACE_HEIGHT_M
        if global_id == policy_plan["donor_room_id"]:
            donor_depth_m = current_depth_m
        origin_world = space_plan["placement_world_mm"]
        space.ObjectPlacement = _create_local_placement(
            model=model,
            relative_to=getattr(storey, "ObjectPlacement", None),
            location=(
                float(origin_world[0]) / 1000.0,
                float(origin_world[1]) / 1000.0,
                0.0,
            ),
            ref_direction=(1.0, 0.0, 0.0),
        )
        space.Representation = _create_space_representation_from_polygon(
            model=model,
            polygon_mm=space_plan["polygon_local_mm"],
            depth_m=current_depth_m,
            context=_body_context(model, space),
        )
        min_x, min_y, max_x, max_y = _polygon_bbox_mm(space_plan["polygon_world_mm"])
        _update_space_pset(
            model=model,
            space=space,
            width_mm=int(round(max_x - min_x)),
            height_mm=int(round(max_y - min_y)),
            rects=None,
            room_type=space_plan["space_type"],
            shape="poly",
            locked=bool(space_plan.get("locked", False)),
        )
        if getattr(space, "Name", None) != space_plan["name"]:
            space.Name = space_plan["name"]
            space.LongName = space_plan["name"]
        existing_space_entities[global_id] = space

    toilet_world_polygon_mm = policy_plan["toilet_world_polygon_mm"]
    toilet_min_x, toilet_min_y, toilet_max_x, toilet_max_y = _polygon_bbox_mm(
        toilet_world_polygon_mm
    )
    toilet = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcSpace",
        name=policy_plan["toilet_name"],
    )
    toilet.OwnerHistory = _owner_history(model)
    toilet.CompositionType = "ELEMENT"
    toilet.ObjectPlacement = _create_local_placement(
        model=model,
        relative_to=getattr(storey, "ObjectPlacement", None),
        location=(
            policy_plan["toilet_local_origin_world_mm"][0] / 1000.0,
            policy_plan["toilet_local_origin_world_mm"][1] / 1000.0,
            0.0,
        ),
        ref_direction=(1.0, 0.0, 0.0),
    )
    toilet.Representation = _create_space_representation_from_polygon(
        model=model,
        polygon_mm=policy_plan["toilet_local_polygon_mm"],
        depth_m=donor_depth_m,
        context=_ensure_body_context(model),
    )
    ifcopenshell.api.aggregate.assign_object(model, products=[toilet], relating_object=storey)
    _update_space_pset(
        model=model,
        space=toilet,
        width_mm=int(round(toilet_max_x - toilet_min_x)),
        height_mm=int(round(toilet_max_y - toilet_min_y)),
        rects=None,
        room_type=policy_plan["toilet_space_type"],
        shape="poly",
        locked=False,
    )

    space_by_id = {space_id: entity for space_id, entity in existing_space_entities.items()}
    anchor_space = model.by_guid(policy_plan["anchor_room_id"])
    if anchor_space is not None:
        space_by_id[policy_plan["anchor_room_id"]] = anchor_space
    space_by_id["new-toilet"] = toilet
    wall_refs: dict[str, ifcopenshell.entity_instance] = {}
    wall_segments_by_local_id: dict[str, tuple[tuple[float, float], tuple[float, float]]] = {}
    wall_offset_base_by_local_id: dict[str, float] = {}
    for wall_plan in policy_plan.get("required_new_walls", []):
        wall = _create_linear_wall(
            model=model,
            storey=storey,
            start_mm=tuple(wall_plan["start_mm"]),
            end_mm=tuple(wall_plan["end_mm"]),
            name=f"Toilet Wall {wall_plan['wall_local_id']}",
            thickness_mm=int(wall_plan["thickness_mm"]),
        )
        wall_refs[wall_plan["wall_local_id"]] = wall
        wall_segments_by_local_id[wall_plan["wall_local_id"]] = (
            tuple(wall_plan["start_mm"]),
            tuple(wall_plan["end_mm"]),
        )
        wall_offset_base_by_local_id[wall_plan["wall_local_id"]] = 0.0
        _attach_wall_boundaries_from_plan(
            model=model,
            wall=wall,
            space_by_id=space_by_id,
            bounded_room_ids=wall_plan["bounded_room_ids"],
        )
    for wall_plan in policy_plan.get("donor_walls_to_reuse", []):
        wall = model.by_guid(wall_plan["global_id"])
        if wall is None:
            continue
        wall_refs[wall_plan["wall_local_id"]] = wall
        actual_segment = _wall_segment_from_entity(wall)
        wall_segments_by_local_id[wall_plan["wall_local_id"]] = actual_segment
        base_offset = _offset_along_segment(actual_segment, tuple(wall_plan["start_mm"]))
        wall_offset_base_by_local_id[wall_plan["wall_local_id"]] = base_offset
        if wall_plan["wall_local_id"] == "reuse-east-exterior":
            _remove_hosted_openings_crossing_offset(
                model=model,
                host_wall=wall,
                host_segment_mm=actual_segment,
                junction_offset_mm=base_offset,
                opening_class="IfcWindow",
            )
        _attach_wall_boundaries_from_plan(
            model=model,
            wall=wall,
            space_by_id=space_by_id,
            bounded_room_ids=wall_plan["bounded_room_ids"],
        )

    _clear_reused_wall_openings_for_toilet_segments(
        model=model,
        wall_refs=wall_refs,
        wall_segments_by_local_id=wall_segments_by_local_id,
        wall_offset_base_by_local_id=wall_offset_base_by_local_id,
        donor_walls_to_reuse=policy_plan.get("donor_walls_to_reuse", []),
    )

    for door_plan in policy_plan.get("door_plans", []):
        door_wall = wall_refs[door_plan["host_wall_local_id"]]
        _create_hosted_door(
            model=model,
            storey=storey,
            host_wall=door_wall,
            placement_mm=_point_along_segment(
                wall_segments_by_local_id[door_plan["host_wall_local_id"]],
                wall_offset_base_by_local_id[door_plan["host_wall_local_id"]]
                + float(door_plan["segment_along_wall_mm"][0]),
            ),
            width_mm=int(door_plan["width_mm"]),
            height_mm=int(door_plan["height_mm"]),
            name=_opening_display_name(door_plan["local_id"], default_name="Toilet Door"),
        )

    for window_plan in policy_plan.get("window_plans", []):
        window_wall = wall_refs[window_plan["host_wall_local_id"]]
        target_window_segment = _point_range_along_segment(
            wall_segments_by_local_id[window_plan["host_wall_local_id"]],
            (
                wall_offset_base_by_local_id[window_plan["host_wall_local_id"]]
                + float(window_plan["segment_along_wall_mm"][0]),
                wall_offset_base_by_local_id[window_plan["host_wall_local_id"]]
                + float(window_plan["segment_along_wall_mm"][1]),
            ),
        )
        window_name = _opening_display_name(
            window_plan["local_id"], default_name="Toilet Window"
        )
        reused_window = _reuse_hosted_window_on_segment(
            model=model,
            host_wall=window_wall,
            target_segment_mm=target_window_segment,
            target_name=window_name,
        )
        if reused_window is None:
            _create_hosted_window(
                model=model,
                storey=storey,
                host_wall=window_wall,
                placement_mm=_point_along_segment(
                    wall_segments_by_local_id[window_plan["host_wall_local_id"]],
                    wall_offset_base_by_local_id[window_plan["host_wall_local_id"]]
                    + float(window_plan["segment_along_wall_mm"][0]),
                ),
                width_mm=int(window_plan["width_mm"]),
                height_mm=int(window_plan["height_mm"]),
                sill_height_mm=int(window_plan["sill_height_mm"]),
                name=window_name,
            )
        _consolidate_hosted_windows_on_segment(
            model=model,
            host_wall=window_wall,
            target_segment_mm=target_window_segment,
            target_name=window_name,
        )

    model.write(output_path)
    return {
        "status": "applied",
        "summary": (
            "Created a demo toilet by shrinking the donor room and "
            "applying the planned walls, door, and window."
        ),
        "created_space_id": toilet.GlobalId,
        "updated_space_id": donor.GlobalId,
    }


def _apply_remove_merge_plan(
    *,
    model: ifcopenshell.file,
    merge_plan: dict[str, Any],
) -> None:
    try:
        merge_target = model.by_guid(merge_plan["merge_target_space_id"])
    except RuntimeError:
        merge_target = None
    if merge_target is None:
        return

    placement = getattr(merge_target, "ObjectPlacement", None)
    relative = getattr(placement, "RelativePlacement", None) if placement else None
    location = getattr(relative, "Location", None) if relative else None
    if relative is not None and location is not None:
        anchor = merge_plan["anchor_translate_mm"]
        if any(abs(value) > 0.0 for value in anchor.values()):
            _translate_relative_placement_location(
                model=model,
                relative_placement=relative,
                offset_x_m=float(anchor["x"]) / 1000.0,
                offset_y_m=float(anchor["y"]) / 1000.0,
            )

    _, _, current_depth_m = _space_dimensions_m(merge_target)
    dimensions = merge_plan["dimensions_mm"]
    merge_target.Representation = _create_space_representation(
        model=model,
        width_m=float(dimensions["width"]) / 1000.0,
        height_m=float(dimensions["height"]) / 1000.0,
        depth_m=current_depth_m if current_depth_m > 0.0 else _DEFAULT_SPACE_HEIGHT_M,
        context=_body_context(model, merge_target),
    )
    _update_space_pset(
        model=model,
        space=merge_target,
        width_mm=dimensions["width"],
        height_mm=dimensions["height"],
        rects=merge_plan["rects"],
        shape="rect",
    )


def _apply_isolated_resize_wall_plans(
    *,
    model: ifcopenshell.file,
    wall_plans: list[dict[str, Any]],
) -> None:
    for wall_plan in wall_plans:
        try:
            wall = model.by_guid(wall_plan["wall_id"])
        except RuntimeError:
            wall = None
        if wall is None:
            continue
        update_wall_segment(
            model=model,
            wall=wall,
            start_m=(wall_plan["start_mm"][0] / 1000.0, wall_plan["start_mm"][1] / 1000.0),
            end_m=(wall_plan["end_mm"][0] / 1000.0, wall_plan["end_mm"][1] / 1000.0),
        )


def _remove_related_products(model: ifcopenshell.file, global_ids: list[str]) -> None:
    for global_id in global_ids:
        try:
            product = model.by_guid(global_id)
        except RuntimeError:
            continue
        if product is None:
            continue
        if product.is_a("IfcWall"):
            for rel in list(getattr(product, "HasOpenings", []) or []):
                opening = getattr(rel, "RelatedOpeningElement", None)
                if opening is not None:
                    fills = list(getattr(opening, "HasFillings", []) or [])
                    filled = fills[0].RelatedBuildingElement if fills else None
                    _remove_hosted_opening_pair(
                        model=model,
                        opening=opening,
                        filled=filled,
                    )
            try:
                if model.by_id(product.id()) is not None:
                    ifcopenshell.api.root.remove_product(model, product=product)
            except RuntimeError:
                pass
            continue
        if product.is_a("IfcDoor") or product.is_a("IfcWindow"):
            for rel in getattr(product, "FillsVoids", []) or []:
                opening = getattr(rel, "RelatingOpeningElement", None)
                if opening is not None:
                    _remove_hosted_opening_pair(
                        model=model,
                        opening=opening,
                        filled=product,
                    )
                    break
            continue
        try:
            if model.by_id(product.id()) is not None:
                ifcopenshell.api.root.remove_product(model, product=product)
        except RuntimeError:
            pass


def _translate_products(
    model: ifcopenshell.file,
    global_ids: list[str],
    offset_x_m: float,
    offset_y_m: float,
    *,
    skip_host_relative: bool = False,
) -> None:
    if offset_x_m == 0.0 and offset_y_m == 0.0:
        return
    for global_id in global_ids:
        try:
            product = model.by_guid(global_id)
        except RuntimeError:
            continue
        if product is None:
            continue
        if skip_host_relative and is_product_host_relative(product):
            continue
        placement = getattr(product, "ObjectPlacement", None)
        relative = getattr(placement, "RelativePlacement", None) if placement else None
        if relative is None or getattr(relative, "Location", None) is None:
            continue
        _translate_relative_placement_location(
            model=model,
            relative_placement=relative,
            offset_x_m=offset_x_m,
            offset_y_m=offset_y_m,
        )


def _translate_relative_placement_location(
    *,
    model: ifcopenshell.file,
    relative_placement: ifcopenshell.entity_instance,
    offset_x_m: float,
    offset_y_m: float,
) -> None:
    location = getattr(relative_placement, "Location", None)
    if location is None:
        return
    coords = list(tuple(getattr(location, "Coordinates", ()) or ()))
    while len(coords) < 3:
        coords.append(0.0)
    coords[0] += offset_x_m
    coords[1] += offset_y_m
    relative_placement.Location = model.create_entity(
        "IfcCartesianPoint",
        Coordinates=tuple(coords[:3]),
    )


def _boundary_shift_m(
    *,
    direction: str | None,
    current_width_m: float,
    current_height_m: float,
    new_width_m: float,
    new_height_m: float,
) -> tuple[float, float]:
    if direction == "west":
        return (current_width_m - new_width_m, 0.0)
    if direction == "east":
        return (new_width_m - current_width_m, 0.0)
    if direction == "south":
        return (0.0, current_height_m - new_height_m)
    if direction == "north":
        return (0.0, new_height_m - current_height_m)
    return (0.0, 0.0)


def _update_affected_space_for_resize(
    *,
    model: ifcopenshell.file,
    affected_space_id: str | None,
    direction: str | None,
    boundary_offset_x_m: float,
    boundary_offset_y_m: float,
) -> None:
    if affected_space_id is None:
        return
    try:
        affected_space = model.by_guid(affected_space_id)
    except RuntimeError:
        affected_space = None
    if affected_space is None:
        return

    width_m, height_m, depth_m = _space_dimensions_m(affected_space)
    placement = getattr(affected_space, "ObjectPlacement", None)
    relative = getattr(placement, "RelativePlacement", None) if placement else None
    location = getattr(relative, "Location", None) if relative else None
    if location is None:
        return

    next_width_m = width_m
    next_height_m = height_m
    shift_x_m = 0.0
    shift_y_m = 0.0
    if direction == "west":
        next_width_m = width_m + boundary_offset_x_m
    elif direction == "east":
        next_width_m = width_m - boundary_offset_x_m
        shift_x_m = boundary_offset_x_m
    elif direction == "south":
        next_height_m = height_m + boundary_offset_y_m
    elif direction == "north":
        next_height_m = height_m - boundary_offset_y_m
        shift_y_m = boundary_offset_y_m
    if next_width_m <= 0.0 or next_height_m <= 0.0:
        return

    _translate_relative_placement_location(
        model=model,
        relative_placement=relative,
        offset_x_m=shift_x_m,
        offset_y_m=shift_y_m,
    )
    affected_space.Representation = _create_space_representation(
        model=model,
        width_m=next_width_m,
        height_m=next_height_m,
        depth_m=depth_m,
        context=_body_context(model, affected_space),
    )
    _update_space_pset(
        model=model,
        space=affected_space,
        width_mm=int(round(next_width_m * 1000.0)),
        height_mm=int(round(next_height_m * 1000.0)),
        rects=None,
    )


def _space_dimensions_m(space: ifcopenshell.entity_instance) -> tuple[float, float, float]:
    representation = getattr(space, "Representation", None)
    if representation:
        for rep in getattr(representation, "Representations", []) or []:
            if getattr(rep, "RepresentationIdentifier", None) != "Body":
                continue
            for item in getattr(rep, "Items", []) or []:
                if item.is_a("IfcExtrudedAreaSolid"):
                    profile = getattr(item, "SweptArea", None)
                    if profile and profile.is_a("IfcRectangleProfileDef"):
                        return float(profile.XDim), float(profile.YDim), float(item.Depth)

    width_mm = None
    height_mm = None
    for rel in getattr(space, "IsDefinedBy", []) or []:
        definition = getattr(rel, "RelatingPropertyDefinition", None)
        if definition and getattr(definition, "Name", None) == "Batang_SpaceDimensions":
            for prop in getattr(definition, "HasProperties", []) or []:
                nominal = getattr(prop, "NominalValue", None)
                wrapped = getattr(nominal, "wrappedValue", None)
                if prop.Name == "Width" and isinstance(wrapped, (int, float)):
                    width_mm = wrapped
                elif prop.Name == "Height" and isinstance(wrapped, (int, float)):
                    height_mm = wrapped
            break

    return (
        (float(width_mm) / 1000.0) if width_mm is not None else 0.0,
        (float(height_mm) / 1000.0) if height_mm is not None else 0.0,
        _DEFAULT_SPACE_HEIGHT_M,
    )


def _polygon_bbox_mm(
    polygon: list[tuple[float, float]],
) -> tuple[float, float, float, float]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return (min(xs), min(ys), max(xs), max(ys))


def _create_linear_wall(
    *,
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    start_mm: tuple[float, float],
    end_mm: tuple[float, float],
    name: str,
    thickness_mm: int,
) -> ifcopenshell.entity_instance:
    start_m = (float(start_mm[0]) / 1000.0, float(start_mm[1]) / 1000.0)
    end_m = (float(end_mm[0]) / 1000.0, float(end_mm[1]) / 1000.0)
    dx = end_m[0] - start_m[0]
    dy = end_m[1] - start_m[1]
    length_m = (dx**2 + dy**2) ** 0.5
    if length_m <= 0.0:
        raise ValueError("wall segment length must be positive")
    ref_direction = (dx / length_m, dy / length_m, 0.0)
    wall = ifcopenshell.api.root.create_entity(model, ifc_class="IfcWall", name=name)
    wall.ObjectPlacement = _create_local_placement(
        model=model,
        relative_to=getattr(storey, "ObjectPlacement", None),
        location=(start_m[0], start_m[1], 0.0),
        ref_direction=ref_direction,
    )
    wall.Representation = _create_wall_representation(
        model=model,
        length_m=length_m,
        thickness_m=float(thickness_mm) / 1000.0,
        height_m=_DEFAULT_SPACE_HEIGHT_M,
        context=_ensure_body_context(model),
    )
    ifcopenshell.api.aggregate.assign_object(model, products=[wall], relating_object=storey)
    wall_pset = ifcopenshell.api.pset.add_pset(model, product=wall, name="Batang_WallDimensions")
    ifcopenshell.api.pset.edit_pset(model, pset=wall_pset, properties={"Thickness": thickness_mm})
    return wall


def _create_wall_representation(
    *,
    model: ifcopenshell.file,
    length_m: float,
    thickness_m: float,
    height_m: float,
    context: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance:
    polyline = model.create_entity(
        "IfcPolyline",
        Points=(
            model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0)),
            model.create_entity("IfcCartesianPoint", Coordinates=(length_m, 0.0)),
        ),
    )
    axis = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Axis",
        RepresentationType="Curve2D",
        Items=(polyline,),
    )
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=length_m,
        YDim=thickness_m,
        Position=model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(length_m / 2.0, 0.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0)),
        ),
    )
    body_item = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=height_m,
    )
    body = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=(body_item,),
    )
    box = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Box",
        RepresentationType="BoundingBox",
        Items=[
            model.create_entity(
                "IfcBoundingBox",
                Corner=model.create_entity(
                    "IfcCartesianPoint",
                    Coordinates=(0.0, -(thickness_m / 2.0), 0.0),
                ),
                XDim=float(length_m),
                YDim=float(thickness_m),
                ZDim=float(height_m),
            )
        ],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=(axis, body, box))


def _attach_space_boundary(
    *,
    model: ifcopenshell.file,
    wall: ifcopenshell.entity_instance,
    space: ifcopenshell.entity_instance,
) -> None:
    model.create_entity(
        "IfcRelSpaceBoundary",
        GlobalId=ifcopenshell.guid.new(),
        RelatingSpace=space,
        RelatedBuildingElement=wall,
    )


def _attach_wall_boundaries_from_plan(
    *,
    model: ifcopenshell.file,
    wall: ifcopenshell.entity_instance,
    space_by_id: dict[str, ifcopenshell.entity_instance | None],
    bounded_room_ids: list[str],
) -> None:
    for room_id in bounded_room_ids:
        space = space_by_id.get(room_id)
        if space is not None:
            _attach_space_boundary(model=model, wall=wall, space=space)


def _localize_polygon(
    *,
    world_polygon: list[tuple[float, float]],
    origin_x: float,
    origin_y: float,
) -> list[tuple[float, float]]:
    return [(float(x - origin_x), float(y - origin_y)) for x, y in world_polygon]


def _wall_segment_from_entity(
    wall: ifcopenshell.entity_instance,
) -> tuple[tuple[float, float], tuple[float, float]]:
    placement = wall.ObjectPlacement.RelativePlacement
    location = tuple(placement.Location.Coordinates)
    ref = getattr(placement, "RefDirection", None)
    if ref is not None:
        direction = tuple(ref.DirectionRatios)
        dir_x = float(direction[0]) if len(direction) > 0 else 1.0
        dir_y = float(direction[1]) if len(direction) > 1 else 0.0
    else:
        dir_x = 1.0
        dir_y = 0.0
    axis_representation = next(
        rep for rep in wall.Representation.Representations if rep.RepresentationIdentifier == "Axis"
    )
    start_local = tuple(axis_representation.Items[0].Points[0].Coordinates)
    end_local = tuple(axis_representation.Items[0].Points[1].Coordinates)
    def _to_world(point: tuple[float, ...]) -> tuple[float, float]:
        x_local = float(point[0])
        y_local = float(point[1]) if len(point) > 1 else 0.0
        return (
            float((location[0] + (x_local * dir_x) - (y_local * dir_y)) * 1000.0),
            float((location[1] + (x_local * dir_y) + (y_local * dir_x)) * 1000.0),
        )
    return (
        _to_world(start_local),
        _to_world(end_local),
    )


def _point_along_segment(
    segment: tuple[tuple[float, float], tuple[float, float]],
    offset_mm: float,
) -> tuple[float, float]:
    start, end = segment
    length_mm = ((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2) ** 0.5
    if length_mm <= 0.0:
        return start
    ratio = offset_mm / length_mm
    return (
        float(start[0] + (end[0] - start[0]) * ratio),
        float(start[1] + (end[1] - start[1]) * ratio),
    )


def _offset_along_segment(
    segment: tuple[tuple[float, float], tuple[float, float]],
    point_mm: tuple[float, float],
) -> float:
    start, end = segment
    dx = float(end[0] - start[0])
    dy = float(end[1] - start[1])
    length_sq = (dx * dx) + (dy * dy)
    if length_sq <= 0.0:
        return 0.0
    projection = (((point_mm[0] - start[0]) * dx) + ((point_mm[1] - start[1]) * dy)) / length_sq
    length_mm = length_sq ** 0.5
    return float(projection * length_mm)


def _remove_hosted_openings_overlapping_segment(
    *,
    model: ifcopenshell.file,
    host_wall: ifcopenshell.entity_instance,
    target_segment_mm: tuple[tuple[float, float], tuple[float, float]],
    opening_class: str,
) -> None:
    for rel in list(getattr(host_wall, "HasOpenings", []) or []):
        opening = getattr(rel, "RelatedOpeningElement", None)
        if opening is None:
            continue
        fills = list(getattr(opening, "HasFillings", []) or [])
        filled = fills[0].RelatedBuildingElement if fills else None
        if filled is None or not filled.is_a(opening_class):
            continue
        opening_point = _opening_world_point(opening=opening)
        if opening_point is None:
            continue
        if _point_is_within_segment(
            point_mm=(float(opening_point.x), float(opening_point.y)),
            segment_mm=target_segment_mm,
        ):
            _remove_hosted_opening_pair(model=model, opening=opening, filled=filled)


def _reuse_hosted_window_on_segment(
    *,
    model: ifcopenshell.file,
    host_wall: ifcopenshell.entity_instance,
    target_segment_mm: tuple[tuple[float, float], tuple[float, float]],
    target_name: str,
) -> ifcopenshell.entity_instance | None:
    target_center = _point_along_segment(
        target_segment_mm,
        _segment_length_mm(target_segment_mm) / 2.0,
    )
    candidates: list[tuple[float, ifcopenshell.entity_instance, ifcopenshell.entity_instance]] = []
    for rel in list(getattr(host_wall, "HasOpenings", []) or []):
        opening = getattr(rel, "RelatedOpeningElement", None)
        if opening is None:
            continue
        fills = list(getattr(opening, "HasFillings", []) or [])
        filled = fills[0].RelatedBuildingElement if fills else None
        if filled is None or not filled.is_a("IfcWindow"):
            continue
        opening_point = _opening_world_point(opening=opening)
        if opening_point is None:
            continue
        if not _point_is_within_segment(
            point_mm=(float(opening_point.x), float(opening_point.y)),
            segment_mm=target_segment_mm,
        ):
            continue
        dx = float(opening_point.x - target_center[0])
        dy = float(opening_point.y - target_center[1])
        candidates.append((((dx * dx) + (dy * dy)) ** 0.5, opening, filled))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    _, kept_opening, kept_window = candidates[0]
    kept_window.Name = target_name
    for _, opening, filled in candidates[1:]:
        if opening != kept_opening:
            _remove_hosted_opening_pair(model=model, opening=opening, filled=filled)
    return kept_window


def _consolidate_hosted_windows_on_segment(
    *,
    model: ifcopenshell.file,
    host_wall: ifcopenshell.entity_instance,
    target_segment_mm: tuple[tuple[float, float], tuple[float, float]],
    target_name: str,
) -> None:
    target_center = _point_along_segment(
        target_segment_mm,
        _segment_length_mm(target_segment_mm) / 2.0,
    )
    candidates: list[tuple[float, ifcopenshell.entity_instance, ifcopenshell.entity_instance]] = []
    for rel in list(getattr(host_wall, "HasOpenings", []) or []):
        opening = getattr(rel, "RelatedOpeningElement", None)
        if opening is None:
            continue
        fills = list(getattr(opening, "HasFillings", []) or [])
        filled = fills[0].RelatedBuildingElement if fills else None
        if filled is None or not filled.is_a("IfcWindow"):
            continue
        opening_point = _opening_world_point(opening=opening)
        if opening_point is None:
            continue
        if not _point_is_within_segment(
            point_mm=(float(opening_point.x), float(opening_point.y)),
            segment_mm=target_segment_mm,
        ):
            continue
        dx = float(opening_point.x - target_center[0])
        dy = float(opening_point.y - target_center[1])
        candidates.append((((dx * dx) + (dy * dy)) ** 0.5, opening, filled))
    if not candidates:
        return
    candidates.sort(key=lambda item: item[0])
    _, kept_opening, kept_window = candidates[0]
    kept_window.Name = target_name
    for _, opening, filled in candidates[1:]:
        if opening != kept_opening:
            _remove_hosted_opening_pair(model=model, opening=opening, filled=filled)


def _point_is_within_segment(
    *,
    point_mm: tuple[float, float],
    segment_mm: tuple[tuple[float, float], tuple[float, float]],
    distance_tolerance_mm: float = 50.0,
    endpoint_tolerance_mm: float = 50.0,
) -> bool:
    line = _segment_line(segment_mm)
    point = Point(point_mm)
    if line.distance(point) > distance_tolerance_mm:
        return False
    start, end = segment_mm
    dx = float(end[0] - start[0])
    dy = float(end[1] - start[1])
    length_sq = (dx * dx) + (dy * dy)
    if length_sq <= 0.0:
        return False
    projection = (
        ((point_mm[0] - start[0]) * dx) + ((point_mm[1] - start[1]) * dy)
    ) / length_sq
    length_mm = length_sq ** 0.5
    tolerance_ratio = endpoint_tolerance_mm / max(length_mm, 1.0)
    return -tolerance_ratio <= projection <= 1.0 + tolerance_ratio


def _remove_hosted_opening_pair(
    *,
    model: ifcopenshell.file,
    opening: ifcopenshell.entity_instance,
    filled: ifcopenshell.entity_instance | None,
) -> None:
    if filled is not None:
        try:
            ifcopenshell.api.root.remove_product(model, product=filled)
        except RuntimeError:
            pass
    try:
        if model.by_id(opening.id()) is not None:
            ifcopenshell.api.root.remove_product(model, product=opening)
    except RuntimeError:
        pass


def _apply_existing_opening_plans(
    *,
    model: ifcopenshell.file,
    opening_plans: list[dict[str, Any]],
) -> None:
    for opening_plan in opening_plans:
        if opening_plan.get("decision") not in {"remove", "replace_with_new", "relocate"}:
            continue
        opening_id = opening_plan.get("global_id")
        if not opening_id:
            continue
        try:
            opening_or_filled = model.by_guid(opening_id)
        except RuntimeError:
            continue
        if opening_or_filled is None:
            continue
        if opening_or_filled.is_a("IfcOpeningElement"):
            fills = list(getattr(opening_or_filled, "HasFillings", []) or [])
            filled = fills[0].RelatedBuildingElement if fills else None
            _remove_hosted_opening_pair(
                model=model,
                opening=opening_or_filled,
                filled=filled,
            )
            continue
        fills_voids = list(getattr(opening_or_filled, "FillsVoids", []) or [])
        opening = fills_voids[0].RelatingOpeningElement if fills_voids else None
        _remove_hosted_opening_pair(
            model=model,
            opening=opening if opening is not None else opening_or_filled,
            filled=opening_or_filled,
        )


def _clear_reused_wall_openings_for_toilet_segments(
    *,
    model: ifcopenshell.file,
    wall_refs: dict[str, ifcopenshell.entity_instance],
    wall_segments_by_local_id: dict[str, tuple[tuple[float, float], tuple[float, float]]],
    wall_offset_base_by_local_id: dict[str, float],
    donor_walls_to_reuse: list[dict[str, Any]],
) -> None:
    for wall_plan in donor_walls_to_reuse:
        if "new-toilet" not in wall_plan.get("bounded_room_ids", []):
            continue
        wall_local_id = wall_plan["wall_local_id"]
        host_wall = wall_refs.get(wall_local_id)
        host_segment = wall_segments_by_local_id.get(wall_local_id)
        if host_wall is None or host_segment is None:
            continue
        start_offset = wall_offset_base_by_local_id.get(wall_local_id, 0.0)
        wall_plan_length = _segment_length_mm(
            (tuple(wall_plan["start_mm"]), tuple(wall_plan["end_mm"]))
        )
        target_segment = _point_range_along_segment(
            host_segment,
            (
                start_offset,
                start_offset + wall_plan_length,
            ),
        )
        _remove_hosted_openings_overlapping_segment(
            model=model,
            host_wall=host_wall,
            target_segment_mm=target_segment,
            opening_class="IfcDoor",
        )
        _remove_hosted_openings_overlapping_segment(
            model=model,
            host_wall=host_wall,
            target_segment_mm=target_segment,
            opening_class="IfcWindow",
        )


def _remove_hosted_openings_crossing_offset(
    *,
    model: ifcopenshell.file,
    host_wall: ifcopenshell.entity_instance,
    host_segment_mm: tuple[tuple[float, float], tuple[float, float]],
    junction_offset_mm: float,
    opening_class: str,
    default_span_mm: float = 900.0,
) -> None:
    for rel in list(getattr(host_wall, "HasOpenings", []) or []):
        opening = getattr(rel, "RelatedOpeningElement", None)
        if opening is None:
            continue
        fills = list(getattr(opening, "HasFillings", []) or [])
        filled = fills[0].RelatedBuildingElement if fills else None
        if filled is None or not filled.is_a(opening_class):
            continue
        opening_point = _opening_world_point(opening=opening)
        if opening_point is None:
            continue
        center_offset = _offset_along_segment(
            host_segment_mm,
            (float(opening_point.x), float(opening_point.y)),
        )
        span_mm = float(
            max(
                getattr(filled, "OverallWidth", 0.0) or 0.0,
                getattr(filled, "OverallHeight", 0.0) or 0.0,
            )
            * 1000.0
        )
        if span_mm <= 0.0:
            span_mm = default_span_mm
        half_span = span_mm / 2.0
        if (center_offset - half_span) <= junction_offset_mm <= (center_offset + half_span):
            _remove_hosted_opening_pair(model=model, opening=opening, filled=filled)


def _opening_display_name(local_id: str, *, default_name: str) -> str:
    if local_id == "study-door":
        return "Study Door"
    if local_id == "study-window":
        return "Study Window"
    if local_id == "toilet-door":
        return "Toilet Door"
    if local_id == "toilet-window":
        return "Toilet Window"
    return default_name


def _create_hosted_door(
    *,
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    host_wall: ifcopenshell.entity_instance,
    placement_mm: tuple[float, float],
    width_mm: int,
    height_mm: int,
    name: str,
) -> ifcopenshell.entity_instance:
    del storey
    host_point_local = _point_in_host_wall_local_mm(host_wall=host_wall, point_mm=placement_mm)
    wall_thickness_m = _wall_thickness_m(host_wall)
    template_door = _find_template_product(
        model=model,
        ifc_class="IfcDoor",
        target_width_m=float(width_mm) / 1000.0,
        target_height_m=float(height_mm) / 1000.0,
    )
    opening = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcOpeningElement",
        name=f"{name} Opening",
    )
    opening.ObjectPlacement = _create_local_placement(
        model=model,
        relative_to=getattr(host_wall, "ObjectPlacement", None),
        location=(host_point_local[0] / 1000.0, 0.0, 0.0),
        ref_direction=(1.0, 0.0, 0.0),
    )
    opening.Representation = _clone_representation_or_box(
        model=model,
        template_product=None,
        fallback_length_m=float(width_mm) / 1000.0,
        fallback_width_m=max(wall_thickness_m, 0.2),
        fallback_height_m=float(height_mm) / 1000.0,
    )
    door = ifcopenshell.api.root.create_entity(model, ifc_class="IfcDoor", name=name)
    door.ObjectPlacement = _clone_child_product_placement(
        model=model,
        template_product=template_door,
        relative_to=opening.ObjectPlacement,
    )
    door.OverallWidth = float(width_mm) / 1000.0
    door.OverallHeight = float(height_mm) / 1000.0
    door.Representation = _clone_representation_or_box(
        model=model,
        template_product=template_door,
        fallback_length_m=float(width_mm) / 1000.0,
        fallback_width_m=max(wall_thickness_m * 0.6, 0.05),
        fallback_height_m=float(height_mm) / 1000.0,
    )
    if template_door is not None:
        _copy_material_associations_from_template(
            model=model,
            template_product=template_door,
            product=door,
        )
    model.create_entity(
        "IfcRelVoidsElement",
        GlobalId=ifcopenshell.guid.new(),
        RelatingBuildingElement=host_wall,
        RelatedOpeningElement=opening,
    )
    model.create_entity(
        "IfcRelFillsElement",
        GlobalId=ifcopenshell.guid.new(),
        RelatingOpeningElement=opening,
        RelatedBuildingElement=door,
    )
    return door


def _create_hosted_window(
    *,
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    host_wall: ifcopenshell.entity_instance,
    placement_mm: tuple[float, float],
    width_mm: int,
    height_mm: int,
    sill_height_mm: int,
    name: str,
) -> ifcopenshell.entity_instance:
    del storey
    host_point_local = _point_in_host_wall_local_mm(host_wall=host_wall, point_mm=placement_mm)
    wall_thickness_m = _wall_thickness_m(host_wall)
    template_window = _find_template_product(
        model=model,
        ifc_class="IfcWindow",
        target_width_m=float(width_mm) / 1000.0,
        target_height_m=float(height_mm) / 1000.0,
    )
    opening = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcOpeningElement",
        name=f"{name} Opening",
    )
    opening.ObjectPlacement = _create_local_placement(
        model=model,
        relative_to=getattr(host_wall, "ObjectPlacement", None),
        location=(
            host_point_local[0] / 1000.0,
            0.0,
            sill_height_mm / 1000.0,
        ),
        ref_direction=(1.0, 0.0, 0.0),
    )
    opening.Representation = _clone_representation_or_box(
        model=model,
        template_product=None,
        fallback_length_m=float(width_mm) / 1000.0,
        fallback_width_m=max(wall_thickness_m, 0.2),
        fallback_height_m=float(height_mm) / 1000.0,
    )
    window = ifcopenshell.api.root.create_entity(model, ifc_class="IfcWindow", name=name)
    window.ObjectPlacement = _clone_child_product_placement(
        model=model,
        template_product=template_window,
        relative_to=opening.ObjectPlacement,
    )
    window.OverallWidth = float(width_mm) / 1000.0
    window.OverallHeight = float(height_mm) / 1000.0
    window.Representation = _clone_representation_or_box(
        model=model,
        template_product=template_window,
        fallback_length_m=float(width_mm) / 1000.0,
        fallback_width_m=max(wall_thickness_m * 0.4, 0.05),
        fallback_height_m=float(height_mm) / 1000.0,
    )
    if template_window is not None:
        _copy_material_associations_from_template(
            model=model,
            template_product=template_window,
            product=window,
        )
    model.create_entity(
        "IfcRelVoidsElement",
        GlobalId=ifcopenshell.guid.new(),
        RelatingBuildingElement=host_wall,
        RelatedOpeningElement=opening,
    )
    model.create_entity(
        "IfcRelFillsElement",
        GlobalId=ifcopenshell.guid.new(),
        RelatingOpeningElement=opening,
        RelatedBuildingElement=window,
    )
    return window


def _point_in_host_wall_local_mm(
    *,
    host_wall: ifcopenshell.entity_instance,
    point_mm: tuple[float, float],
) -> tuple[float, float]:
    wall_matrix = get_local_placement(host_wall.ObjectPlacement)
    point = np.array([point_mm[0] / 1000.0, point_mm[1] / 1000.0, 0.0, 1.0])
    relative = np.linalg.inv(wall_matrix) @ point
    return (float(relative[0]) * 1000.0, float(relative[1]) * 1000.0)


def _find_template_product(
    *,
    model: ifcopenshell.file,
    ifc_class: str,
    target_width_m: float,
    target_height_m: float,
) -> ifcopenshell.entity_instance | None:
    candidates: list[tuple[float, ifcopenshell.entity_instance]] = []
    for product in model.by_type(ifc_class):
        representation = getattr(product, "Representation", None)
        if representation is None:
            continue
        width = float(getattr(product, "OverallWidth", 0.0) or 0.0)
        height = float(getattr(product, "OverallHeight", 0.0) or 0.0)
        score = abs(width - target_width_m) + abs(height - target_height_m)
        candidates.append((score, product))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def _clone_child_product_placement(
    *,
    model: ifcopenshell.file,
    template_product: ifcopenshell.entity_instance | None,
    relative_to: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance:
    del template_product
    return _create_local_placement(
        model=model,
        relative_to=relative_to,
        location=(0.0, 0.0, 0.0),
        ref_direction=(1.0, 0.0, 0.0),
    )


def _template_opening_for_product(
    product: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance | None:
    if product is None:
        return None
    fills_voids = list(getattr(product, "FillsVoids", []) or [])
    if not fills_voids:
        return None
    return fills_voids[0].RelatingOpeningElement


def _clone_representation_or_box(
    *,
    model: ifcopenshell.file,
    template_product: ifcopenshell.entity_instance | None,
    fallback_length_m: float,
    fallback_width_m: float,
    fallback_height_m: float,
) -> ifcopenshell.entity_instance:
    if (
        template_product is not None
        and getattr(template_product, "Representation", None) is not None
    ):
        return ifc_element.copy_deep(model, template_product.Representation)
    return _create_box_representation(
        model=model,
        length_m=fallback_length_m,
        width_m=fallback_width_m,
        height_m=fallback_height_m,
    )


def _copy_material_associations_from_template(
    *,
    model: ifcopenshell.file,
    template_product: ifcopenshell.entity_instance,
    product: ifcopenshell.entity_instance,
) -> None:
    for rel in getattr(template_product, "HasAssociations", []) or []:
        if not rel.is_a("IfcRelAssociatesMaterial"):
            continue
        model.create_entity(
            "IfcRelAssociatesMaterial",
            GlobalId=ifcopenshell.guid.new(),
            RelatingMaterial=rel.RelatingMaterial,
            RelatedObjects=[product],
        )


def _point_range_along_segment(
    segment: tuple[tuple[float, float], tuple[float, float]],
    offsets_mm: tuple[float, float],
) -> tuple[tuple[float, float], tuple[float, float]]:
    return (
        _point_along_segment(segment, float(offsets_mm[0])),
        _point_along_segment(segment, float(offsets_mm[1])),
    )


def _segment_line(
    segment: tuple[tuple[float, float], tuple[float, float]],
) -> LineString:
    return LineString([segment[0], segment[1]])


def _segment_length_mm(
    segment: tuple[tuple[float, float], tuple[float, float]],
) -> float:
    return float(_segment_line(segment).length)


def _opening_world_point(opening: ifcopenshell.entity_instance) -> Point | None:
    if getattr(opening, "ObjectPlacement", None) is None:
        return None
    matrix = get_local_placement(opening.ObjectPlacement)
    return Point(float(matrix[0, 3]) * 1000.0, float(matrix[1, 3]) * 1000.0)


def _wall_thickness_m(wall: ifcopenshell.entity_instance) -> float:
    for rel in getattr(wall, "IsDefinedBy", []) or []:
        definition = getattr(rel, "RelatingPropertyDefinition", None)
        if definition and getattr(definition, "Name", None) == "Batang_WallDimensions":
            for prop in getattr(definition, "HasProperties", []) or []:
                nominal = getattr(prop, "NominalValue", None)
                wrapped = getattr(nominal, "wrappedValue", None)
                if prop.Name == "Thickness" and isinstance(wrapped, (int, float)):
                    return float(wrapped) / 1000.0
    return 0.2


def _create_box_representation(
    *,
    model: ifcopenshell.file,
    length_m: float,
    width_m: float,
    height_m: float,
) -> ifcopenshell.entity_instance:
    context = _ensure_body_context(model)
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=length_m,
        YDim=width_m,
        Position=model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(length_m / 2.0, 0.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0)),
        ),
    )
    body_item = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=height_m,
    )
    body = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=(body_item,),
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=(body,))


def _body_context(
    model: ifcopenshell.file,
    space: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance | None:
    representation = getattr(space, "Representation", None)
    if representation:
        for rep in getattr(representation, "Representations", []) or []:
            if getattr(rep, "ContextOfItems", None) is not None:
                return rep.ContextOfItems
    contexts = model.by_type("IfcGeometricRepresentationContext")
    if contexts:
        return contexts[0]
    return _ensure_body_context(model)


def _ensure_body_context(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    context = model.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Body",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
    )
    projects = model.by_type("IfcProject")
    if projects:
        project = projects[0]
        contexts = list(getattr(project, "RepresentationContexts", []) or [])
        contexts.append(context)
        project.RepresentationContexts = contexts
    return context


def _owner_history(model: ifcopenshell.file) -> ifcopenshell.entity_instance | None:
    histories = model.by_type("IfcOwnerHistory")
    return histories[0] if histories else None


def _create_local_placement(
    *,
    model: ifcopenshell.file,
    relative_to: ifcopenshell.entity_instance | None,
    location: tuple[float, float, float],
    ref_direction: tuple[float, float, float],
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=relative_to,
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=location),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=ref_direction),
        ),
    )


def _create_space_representation(
    *,
    model: ifcopenshell.file,
    width_m: float,
    height_m: float,
    depth_m: float,
    context: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance:
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=width_m,
        YDim=height_m,
        Position=model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0)),
        ),
    )
    body = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=depth_m,
    )
    shape = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[shape])


def _create_space_representation_from_polygon(
    *,
    model: ifcopenshell.file,
    polygon_mm: list[tuple[float, float]],
    depth_m: float,
    context: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance:
    polygon_m = [(x / 1000.0, y / 1000.0) for x, y in polygon_mm]
    points = [
        model.create_entity("IfcCartesianPoint", Coordinates=(float(x), float(y)))
        for x, y in polygon_m
    ]
    profile = model.create_entity(
        "IfcArbitraryClosedProfileDef",
        ProfileType="AREA",
        OuterCurve=model.create_entity("IfcPolyline", Points=points),
    )
    body = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=depth_m,
    )
    shape = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    footprint = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="FootPrint",
        RepresentationType="GeometricCurveSet",
        Items=[
            model.create_entity(
                "IfcGeometricCurveSet",
                Elements=[
                    model.create_entity(
                        "IfcPolyline",
                        Points=[
                            model.create_entity(
                                "IfcCartesianPoint", Coordinates=(float(x), float(y))
                            )
                            for x, y in [*polygon_m, polygon_m[0]]
                        ],
                    )
                ],
            )
        ],
    )
    xs = [point[0] for point in polygon_m]
    ys = [point[1] for point in polygon_m]
    box = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Box",
        RepresentationType="BoundingBox",
        Items=[
            model.create_entity(
                "IfcBoundingBox",
                Corner=model.create_entity(
                    "IfcCartesianPoint",
                    Coordinates=(float(min(xs)), float(min(ys)), 0.0),
                ),
                XDim=float(max(xs) - min(xs)),
                YDim=float(max(ys) - min(ys)),
                ZDim=float(depth_m),
            )
        ],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[shape, box, footprint])


def _update_space_pset(
    *,
    model: ifcopenshell.file,
    space: ifcopenshell.entity_instance,
    width_mm: int | None,
    height_mm: int | None,
    rects: list[dict[str, Any]] | None,
    room_type: str | None = None,
    shape: str | None = None,
    locked: bool | None = None,
) -> None:
    pset = None
    for rel in getattr(space, "IsDefinedBy", []) or []:
        definition = getattr(rel, "RelatingPropertyDefinition", None)
        if definition and getattr(definition, "Name", None) == "Batang_SpaceDimensions":
            pset = definition
            break

    if pset is None:
        pset = ifcopenshell.api.pset.add_pset(
            model,
            product=space,
            name="Batang_SpaceDimensions",
        )

    properties: dict[str, Any] = {}
    if width_mm is not None:
        properties["Width"] = width_mm
    if height_mm is not None:
        properties["Height"] = height_mm
    if room_type is not None:
        properties["SpaceType"] = room_type
    if shape is not None:
        properties["Shape"] = shape
    if locked is not None:
        properties["Locked"] = locked
    if rects is not None:
        properties["Rects"] = json.dumps(rects, ensure_ascii=False)

    if properties:
        ifcopenshell.api.pset.edit_pset(model, pset=pset, properties=properties)
