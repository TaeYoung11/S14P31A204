from __future__ import annotations

from typing import Any

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.root
import numpy as np
from ifcopenshell.util import element as ifc_element
from ifcopenshell.util.placement import get_local_placement

from ..command import CommandBatch, FloorNLPCommand
from .geometry import (
    offset_along_segment,
    opening_world_point,
    point_along_segment,
    point_is_within_segment,
    point_range_along_segment,
    polygon_bbox_mm,
    segment_length_mm,
    wall_segment_from_entity,
)
from .ifc import (
    DEFAULT_SPACE_HEIGHT_M,
    attach_space_boundary,
    attach_wall_boundaries_from_plan,
    body_context,
    create_box_representation,
    create_linear_wall,
    create_local_placement,
    create_space_representation_from_polygon,
    ensure_body_context,
    owner_history,
    update_space_pset,
)


def apply_insert_toilet(
    *,
    model: ifcopenshell.file,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None,
    policy_plan: dict[str, Any],
    space_dimensions_m_fn,
) -> dict[str, Any]:
    del command
    donor = model.by_guid(policy_plan["donor_room_id"])
    if donor is None:
        return {
            "status": "not_applied",
            "summary": "insert_toilet donor IfcSpace could not be found.",
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
        return {"status": "not_applied", "summary": "insert_toilet storey_id metadata is missing."}

    storey = model.by_guid(storey_id)
    if storey is None:
        return {
            "status": "not_applied",
            "summary": "insert_toilet target storey could not be found.",
        }

    _, _, donor_depth_m = space_dimensions_m_fn(donor)
    donor_depth_m = donor_depth_m if donor_depth_m > 0.0 else DEFAULT_SPACE_HEIGHT_M
    donor.Representation = create_space_representation_from_polygon(
        model=model,
        polygon_mm=policy_plan["donor_local_polygon_mm"],
        depth_m=donor_depth_m,
        context=body_context(model, donor),
    )
    donor_min_x, donor_min_y, donor_max_x, donor_max_y = polygon_bbox_mm(
        policy_plan["donor_world_polygon_mm"]
    )
    update_space_pset(
        model=model,
        space=donor,
        width_mm=round(donor_max_x - donor_min_x),
        height_mm=round(donor_max_y - donor_min_y),
        rects=None,
        shape="poly",
    )

    toilet_world_polygon_mm = policy_plan["toilet_world_polygon_mm"]
    toilet_min_x, toilet_min_y, toilet_max_x, toilet_max_y = polygon_bbox_mm(
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
    toilet.OwnerHistory = owner_history(model)
    toilet.CompositionType = "ELEMENT"
    toilet.ObjectPlacement = create_local_placement(
        model=model,
        relative_to=getattr(storey, "ObjectPlacement", None),
        location=(toilet_min_x / 1000.0, toilet_min_y / 1000.0, 0.0),
        ref_direction=(1.0, 0.0, 0.0),
    )
    toilet.Representation = create_space_representation_from_polygon(
        model=model,
        polygon_mm=toilet_local_polygon_mm,
        depth_m=donor_depth_m,
        context=ensure_body_context(model),
    )
    ifcopenshell.api.aggregate.assign_object(model, products=[toilet], relating_object=storey)
    update_space_pset(
        model=model,
        space=toilet,
        width_mm=round(toilet_max_x - toilet_min_x),
        height_mm=round(toilet_max_y - toilet_min_y),
        rects=None,
        room_type="bathroom",
        shape="poly",
        locked=False,
    )
    west_wall = create_linear_wall(
        model=model,
        storey=storey,
        start_mm=(toilet_min_x, toilet_min_y),
        end_mm=(toilet_min_x, toilet_max_y),
        name="Toilet Divider Wall",
        thickness_mm=200,
    )
    south_wall = create_linear_wall(
        model=model,
        storey=storey,
        start_mm=(toilet_min_x, toilet_min_y),
        end_mm=(toilet_max_x, toilet_min_y),
        name="Toilet South Wall",
        thickness_mm=200,
    )
    east_wall = create_linear_wall(
        model=model,
        storey=storey,
        start_mm=(toilet_max_x, toilet_min_y),
        end_mm=(toilet_max_x, toilet_max_y),
        name="Toilet Exterior Wall",
        thickness_mm=200,
    )
    attach_space_boundary(model=model, wall=west_wall, space=donor)
    attach_space_boundary(model=model, wall=west_wall, space=toilet)
    attach_space_boundary(model=model, wall=south_wall, space=toilet)
    attach_space_boundary(model=model, wall=east_wall, space=toilet)
    wall_length_mm = round(toilet_max_y - toilet_min_y)
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
    window_width_mm = min(700, max(500, round(toilet_max_x - toilet_min_x - 400)))
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
        "summary": "Created a demo toilet and updated the donor room.",
        "created_space_id": toilet.GlobalId,
        "updated_space_id": donor.GlobalId,
    }


def apply_insert_toilet_v2(
    *,
    model: ifcopenshell.file,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None,
    policy_plan: dict[str, Any],
    space_dimensions_m_fn,
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
    donor_depth_m = DEFAULT_SPACE_HEIGHT_M
    for space_plan in policy_plan.get("space_plans", []):
        global_id = space_plan.get("global_id")
        if not global_id:
            continue
        space = model.by_guid(global_id)
        if space is None:
            continue
        _, _, current_depth_m = space_dimensions_m_fn(space)
        current_depth_m = current_depth_m if current_depth_m > 0.0 else DEFAULT_SPACE_HEIGHT_M
        if global_id == policy_plan["donor_room_id"]:
            donor_depth_m = current_depth_m
        origin_world = space_plan["placement_world_mm"]
        space.ObjectPlacement = create_local_placement(
            model=model,
            relative_to=getattr(storey, "ObjectPlacement", None),
            location=(origin_world[0] / 1000.0, origin_world[1] / 1000.0, 0.0),
            ref_direction=(1.0, 0.0, 0.0),
        )
        space.Representation = create_space_representation_from_polygon(
            model=model,
            polygon_mm=space_plan["polygon_local_mm"],
            depth_m=current_depth_m,
            context=body_context(model, space),
        )
        min_x, min_y, max_x, max_y = polygon_bbox_mm(space_plan["polygon_world_mm"])
        update_space_pset(
            model=model,
            space=space,
            width_mm=round(max_x - min_x),
            height_mm=round(max_y - min_y),
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
    toilet_min_x, toilet_min_y, toilet_max_x, toilet_max_y = polygon_bbox_mm(
        toilet_world_polygon_mm
    )
    toilet = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcSpace",
        name=policy_plan["toilet_name"],
    )
    toilet.OwnerHistory = owner_history(model)
    toilet.CompositionType = "ELEMENT"
    toilet.ObjectPlacement = create_local_placement(
        model=model,
        relative_to=getattr(storey, "ObjectPlacement", None),
        location=(
            policy_plan["toilet_local_origin_world_mm"][0] / 1000.0,
            policy_plan["toilet_local_origin_world_mm"][1] / 1000.0,
            0.0,
        ),
        ref_direction=(1.0, 0.0, 0.0),
    )
    toilet.Representation = create_space_representation_from_polygon(
        model=model,
        polygon_mm=policy_plan["toilet_local_polygon_mm"],
        depth_m=donor_depth_m,
        context=ensure_body_context(model),
    )
    ifcopenshell.api.aggregate.assign_object(model, products=[toilet], relating_object=storey)
    update_space_pset(
        model=model,
        space=toilet,
        width_mm=round(toilet_max_x - toilet_min_x),
        height_mm=round(toilet_max_y - toilet_min_y),
        rects=None,
        room_type=policy_plan["toilet_space_type"],
        shape="poly",
        locked=bool(policy_plan.get("toilet_locked", False)),
    )
    toilet.Name = policy_plan["toilet_name"]
    toilet.LongName = policy_plan["toilet_name"]
    existing_space_entities["new-toilet"] = toilet

    wall_refs: dict[str, ifcopenshell.entity_instance] = {}
    wall_segments_by_local_id: dict[str, tuple[tuple[float, float], tuple[float, float]]] = {}
    wall_offset_base_by_local_id: dict[str, float] = {}
    for wall_plan in policy_plan.get("new_walls", []):
        wall = create_linear_wall(
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
        attach_wall_boundaries_from_plan(
            model=model,
            wall=wall,
            space_by_id=existing_space_entities,
            bounded_room_ids=wall_plan["bounded_room_ids"],
        )
    for wall_plan in policy_plan.get("donor_walls_to_reuse", []):
        wall = model.by_guid(wall_plan["global_id"])
        if wall is None:
            continue
        wall_refs[wall_plan["wall_local_id"]] = wall
        actual_segment = wall_segment_from_entity(wall)
        wall_segments_by_local_id[wall_plan["wall_local_id"]] = actual_segment
        base_offset = offset_along_segment(actual_segment, tuple(wall_plan["start_mm"]))
        wall_offset_base_by_local_id[wall_plan["wall_local_id"]] = base_offset
        if wall_plan["wall_local_id"] == "reuse-east-exterior":
            _consolidate_hosted_windows_on_segment(
                model=model,
                host_wall=wall,
                target_segment_mm=actual_segment,
                target_name="Toilet Window",
            )
        attach_wall_boundaries_from_plan(
            model=model,
            wall=wall,
            space_by_id=existing_space_entities,
            bounded_room_ids=wall_plan["bounded_room_ids"],
        )

    _clear_reused_wall_openings_for_toilet_segments(
        model=model,
        wall_refs=wall_refs,
        wall_segments_by_local_id=wall_segments_by_local_id,
        wall_offset_base_by_local_id=wall_offset_base_by_local_id,
        donor_walls_to_reuse=policy_plan.get("donor_walls_to_reuse", []),
    )

    for junction in policy_plan.get("reuse_junctions_to_clear", []):
        host_wall = wall_refs.get(junction["wall_local_id"])
        host_segment = wall_segments_by_local_id.get(junction["wall_local_id"])
        if host_wall is None or host_segment is None:
            continue
        _remove_hosted_openings_crossing_offset(
            model=model,
            host_wall=host_wall,
            host_segment_mm=host_segment,
            junction_offset_mm=float(junction["offset_mm"]),
            opening_class=junction["opening_class"],
        )

    for door_plan in policy_plan.get("new_doors", []):
        host_wall = wall_refs.get(door_plan["host_wall_local_id"])
        host_segment = wall_segments_by_local_id.get(door_plan["host_wall_local_id"])
        if host_wall is None or host_segment is None:
            continue
        _create_hosted_door(
            model=model,
            storey=storey,
            host_wall=host_wall,
            placement_mm=point_along_segment(
                host_segment,
                wall_offset_base_by_local_id.get(door_plan["host_wall_local_id"], 0.0)
                + float(door_plan["segment_along_wall_mm"][0]),
            ),
            width_mm=int(door_plan["width_mm"]),
            height_mm=int(door_plan["height_mm"]),
            name=_opening_display_name(door_plan["door_local_id"], default_name="Door"),
        )

    for window_plan in policy_plan.get("new_windows", []):
        host_wall = wall_refs.get(window_plan["host_wall_local_id"])
        host_segment = wall_segments_by_local_id.get(window_plan["host_wall_local_id"])
        if host_wall is None or host_segment is None:
            continue
        start_offset = wall_offset_base_by_local_id.get(window_plan["host_wall_local_id"], 0.0)
        target_window_segment = point_range_along_segment(
            host_segment,
            (
                start_offset + float(window_plan["segment_along_wall_mm"][0]),
                start_offset + float(window_plan["segment_along_wall_mm"][1]),
            ),
        )
        if window_plan.get("reuse_existing"):
            reused_window = _reuse_hosted_window_on_segment(
                model=model,
                host_wall=host_wall,
                target_segment_mm=target_window_segment,
                target_name=_opening_display_name(
                    window_plan["window_local_id"],
                    default_name="Window",
                ),
            )
            if reused_window is not None:
                continue
        _create_hosted_window(
            model=model,
            storey=storey,
            host_wall=host_wall,
            placement_mm=point_along_segment(
                host_segment,
                start_offset + float(window_plan["segment_along_wall_mm"][0]),
            ),
            width_mm=int(window_plan["width_mm"]),
            height_mm=int(window_plan["height_mm"]),
            sill_height_mm=int(window_plan["sill_height_mm"]),
            name=_opening_display_name(window_plan["window_local_id"], default_name="Window"),
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
        opening_point = opening_world_point(opening=opening)
        if opening_point is None:
            continue
        if point_is_within_segment(
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
    target_center = point_along_segment(
        target_segment_mm,
        segment_length_mm(target_segment_mm) / 2.0,
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
        opening_point = opening_world_point(opening=opening)
        if opening_point is None:
            continue
        if not point_is_within_segment(
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
    target_center = point_along_segment(
        target_segment_mm,
        segment_length_mm(target_segment_mm) / 2.0,
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
        opening_point = opening_world_point(opening=opening)
        if opening_point is None:
            continue
        if not point_is_within_segment(
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
                    _remove_hosted_opening_pair(model=model, opening=opening, filled=filled)
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
                    _remove_hosted_opening_pair(model=model, opening=opening, filled=product)
                    break
            continue
        try:
            if model.by_id(product.id()) is not None:
                ifcopenshell.api.root.remove_product(model, product=product)
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
        wall_plan_length = segment_length_mm(
            (tuple(wall_plan["start_mm"]), tuple(wall_plan["end_mm"]))
        )
        target_segment = point_range_along_segment(
            host_segment,
            (start_offset, start_offset + wall_plan_length),
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
        opening_point = opening_world_point(opening=opening)
        if opening_point is None:
            continue
        center_offset = offset_along_segment(
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
        target_width_m=width_mm / 1000.0,
        target_height_m=height_mm / 1000.0,
    )
    opening = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcOpeningElement",
        name=f"{name} Opening",
    )
    opening.ObjectPlacement = create_local_placement(
        model=model,
        relative_to=getattr(host_wall, "ObjectPlacement", None),
        location=(host_point_local[0] / 1000.0, 0.0, 0.0),
        ref_direction=(1.0, 0.0, 0.0),
    )
    opening.Representation = _clone_representation_or_box(
        model=model,
        template_product=None,
        fallback_length_m=width_mm / 1000.0,
        fallback_width_m=max(wall_thickness_m, 0.2),
        fallback_height_m=height_mm / 1000.0,
    )
    door = ifcopenshell.api.root.create_entity(model, ifc_class="IfcDoor", name=name)
    door.ObjectPlacement = _clone_child_product_placement(
        model=model,
        template_product=template_door,
        relative_to=opening.ObjectPlacement,
    )
    door.OverallWidth = width_mm / 1000.0
    door.OverallHeight = height_mm / 1000.0
    door.Representation = _clone_representation_or_box(
        model=model,
        template_product=template_door,
        fallback_length_m=width_mm / 1000.0,
        fallback_width_m=max(wall_thickness_m * 0.6, 0.05),
        fallback_height_m=height_mm / 1000.0,
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
        target_width_m=width_mm / 1000.0,
        target_height_m=height_mm / 1000.0,
    )
    opening = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcOpeningElement",
        name=f"{name} Opening",
    )
    opening.ObjectPlacement = create_local_placement(
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
        fallback_length_m=width_mm / 1000.0,
        fallback_width_m=max(wall_thickness_m, 0.2),
        fallback_height_m=height_mm / 1000.0,
    )
    window = ifcopenshell.api.root.create_entity(model, ifc_class="IfcWindow", name=name)
    window.ObjectPlacement = _clone_child_product_placement(
        model=model,
        template_product=template_window,
        relative_to=opening.ObjectPlacement,
    )
    window.OverallWidth = width_mm / 1000.0
    window.OverallHeight = height_mm / 1000.0
    window.Representation = _clone_representation_or_box(
        model=model,
        template_product=template_window,
        fallback_length_m=width_mm / 1000.0,
        fallback_width_m=max(wall_thickness_m * 0.4, 0.05),
        fallback_height_m=height_mm / 1000.0,
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
    return create_local_placement(
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
    return create_box_representation(
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


def _wall_thickness_m(wall: ifcopenshell.entity_instance) -> float:
    for rel in getattr(wall, "IsDefinedBy", []) or []:
        definition = getattr(rel, "RelatingPropertyDefinition", None)
        if definition and getattr(definition, "Name", None) == "Batang_WallDimensions":
            for prop in getattr(definition, "HasProperties", []) or []:
                nominal = getattr(prop, "NominalValue", None)
                wrapped = getattr(nominal, "wrappedValue", None)
                if prop.Name == "Thickness" and isinstance(wrapped, int | float):
                    return float(wrapped) / 1000.0
    return 0.2
