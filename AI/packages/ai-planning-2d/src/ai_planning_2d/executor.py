"""계획된 2D 공간 변경 사항을 IFC 파일에 적용한다."""

from __future__ import annotations

from typing import Any, cast

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.root
from ai_authoring.engine_3d import delete_element
from ai_authoring.operations.space_support import is_product_host_relative
from ai_authoring.operations.wall_support import update_wall_segment
from shapely import union_all as _shapely_union_all  # type: ignore[import-untyped]
from shapely.geometry import MultiPolygon, Polygon  # type: ignore[import-untyped]

from .add_room_placement import suggest_add_room_start_mm
from .command import CommandBatch, FloorNLPCommand, IFCContext, SpaceContext, WallContext
from .executor_support.ifc import (
    body_context as _body_context,
    create_local_placement as _create_local_placement,
    create_space_representation as _create_space_representation,
    create_space_representation_from_polygon as _create_space_representation_from_polygon,
    create_wall_representation as _create_wall_representation_impl,
    ensure_body_context as _ensure_body_context,
    owner_history as _owner_history,
    update_space_pset as _update_space_pset,
)
from .ifc_extractor import extract_ifc_context
from .policies import RemoveRoomPolicyResult, ResizeRoomPolicyResult
from .remove_healing import RemoveMergePlan, build_remove_merge_plan
from .resize_healing import WallSegmentPlan, build_isolated_rectangular_resize_wall_plans
from .space_healing import build_isolated_resize_space_plan
from .executor_support.toilet import (
    _remove_hosted_opening_pair,
    apply_insert_toilet as _apply_insert_toilet_impl,
    apply_insert_toilet_v2 as _apply_insert_toilet_v2_impl,
)

_DEFAULT_SPACE_HEIGHT_M = 2.7
_PLANNING_ASSIST_ONLY_ACTIONS = {"add_room", "remove_room", "resize_room", "insert_toilet"}
_DELETE_WALL_SPACE_CLOSE_MM = 120.0
PolicyPlan = RemoveRoomPolicyResult | ResizeRoomPolicyResult | dict[str, Any]
_create_wall_representation = _create_wall_representation_impl


def apply_space_plan(
    *,
    ifc_path: str,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None = None,
    policy_plan: PolicyPlan | None,
    ifc_context: IFCContext | None = None,
) -> dict[str, Any]:
    if command.action in _PLANNING_ASSIST_ONLY_ACTIONS:
        return {
            "status": "not_applied",
            "summary": (
                f"{command.action} 작업은 현재 브랜치에서 planning-assist only 상태이며 "
                "자동 적용할 수 없습니다."
            ),
        }

    if command.action in _PLANNING_ASSIST_ONLY_ACTIONS:
        return {
            "status": "not_applied",
            "summary": (
                f"{command.action} 작업은 현재 브랜치에서 planning-assist 전용이며 "
                "자동 적용할 수 없습니다."
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
    if command.action == "delete_wall":
        return _apply_delete_wall(
            model=model,
            output_path=output_path,
            command=command,
            command_batch=command_batch,
            ifc_context=ifc_context,
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
            policy_plan=cast(RemoveRoomPolicyResult, policy_plan),
            ifc_context=ifc_context,
        )
    if command.action == "insert_toilet":
        return _apply_insert_toilet_v2(
            model=model,
            output_path=output_path,
            command=command,
            command_batch=command_batch,
            policy_plan=cast(dict[str, Any], policy_plan),
        )
    if command.action == "resize_room":
        return _apply_resize_room(
            model=model,
            output_path=output_path,
            command=command,
            policy_plan=cast(ResizeRoomPolicyResult, policy_plan),
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
        return {
            "status": "not_applied",
            "summary": "add_room 실행에 필요한 명령 정보가 없습니다.",
        }

    metadata = command_batch.commands[0].params.get("metadata", {})
    storey_id = metadata.get("storey_id")
    if storey_id is None:
        return {
            "status": "not_applied",
            "summary": "대상 storey_id가 없어 방을 추가하지 않았습니다.",
        }

    storey = model.by_guid(storey_id)
    if storey is None:
        return {
            "status": "not_applied",
            "summary": "대상 IfcBuildingStorey를 찾지 못했습니다.",
        }

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


def _apply_delete_wall(
    *,
    model: ifcopenshell.file,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None,
    ifc_context: IFCContext | None,
) -> dict[str, Any]:
    wall_id = (
        command_batch.commands[0].target_id
        if command_batch is not None and command_batch.commands
        else command.target_wall_id
    )
    if wall_id is None or ifc_context is None:
        return {
            "status": "not_applied",
            "summary": "벽 삭제에 필요한 IFC context 또는 대상 벽 정보가 없습니다.",
        }

    wall_context = _find_wall_context(ifc_context, wall_id)
    if wall_context is None:
        return {
            "status": "not_applied",
            "summary": "삭제 대상 벽을 IFC context에서 찾지 못했습니다.",
        }
    adjacent_space_ids = wall_context.get("space_ids", [])
    if wall_context.get("kind") != "INTERIOR" or len(adjacent_space_ids) != 2:
        return {
            "status": "not_applied",
            "summary": "벽 삭제는 현재 두 개의 공간을 나누는 내부벽에서만 지원됩니다.",
        }

    first_space = _find_space_context(ifc_context, adjacent_space_ids[0])
    second_space = _find_space_context(ifc_context, adjacent_space_ids[1])
    if first_space is None or second_space is None:
        return {
            "status": "not_applied",
            "summary": "벽 삭제 후 병합할 인접 공간 정보를 찾지 못했습니다.",
        }

    merged_polygon_mm = _merge_deleted_wall_space_polygon(first_space, second_space)
    survivor_space_context, removed_space_context = _survivor_and_removed_space(
        first_space,
        second_space,
    )

    try:
        wall = model.by_guid(wall_id)
    except RuntimeError:
        wall = None
    if wall is None:
        return {
            "status": "not_applied",
            "summary": "삭제 대상 벽이 IFC 모델에 없습니다.",
        }
    if not delete_element(model, wall, wall.is_a()):
        return {
            "status": "not_applied",
            "summary": "벽 삭제를 적용하지 못했습니다.",
        }

    if not _heal_deleted_wall_spaces(
        model=model,
        survivor_space_id=survivor_space_context["id"],
        removed_space_id=removed_space_context["id"],
        merged_polygon_mm=merged_polygon_mm,
    ):
        return {
            "status": "not_applied",
            "summary": "벽 삭제 후 공간 병합 치유를 적용하지 못했습니다.",
        }

    model.write(output_path)
    return {
        "status": "applied",
        "summary": "벽 삭제와 인접 공간 병합이 적용되었습니다.",
        "deleted_wall_id": wall_id,
        "survivor_space_id": survivor_space_context["id"],
        "removed_space_id": removed_space_context["id"],
    }


def _apply_remove_room(
    *,
    model: ifcopenshell.file,
    output_path: str,
    policy_plan: RemoveRoomPolicyResult,
    ifc_context: IFCContext | None = None,
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
        return {
            "status": "not_applied",
            "summary": "삭제 대상 IfcSpace를 찾지 못했습니다.",
        }

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
    policy_plan: ResizeRoomPolicyResult,
    ifc_context: IFCContext | None,
) -> dict[str, Any]:
    space = model.by_guid(policy_plan["target_space_id"])
    if space is None:
        return {
            "status": "not_applied",
            "summary": "크기 변경 대상 IfcSpace를 찾지 못했습니다.",
        }

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
            new_width=command.resize_width or 0,
            new_height=command.resize_height or 0,
        )
        isolated_space_plan = build_isolated_resize_space_plan(
            ifc_context=ifc_context,
            target_space_id=policy_plan["target_space_id"],
            direction=direction,
            new_width=command.resize_width or 0,
            new_height=command.resize_height or 0,
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


def _find_space_context(ifc_context: IFCContext, space_id: str) -> SpaceContext | None:
    for space in ifc_context.get("spaces", []):
        if space["id"] == space_id:
            return space
    return None


def _find_wall_context(ifc_context: IFCContext, wall_id: str) -> WallContext | None:
    for wall in ifc_context.get("walls", []):
        if wall["id"] == wall_id:
            return wall
    return None


def _space_polygon_area(space: SpaceContext) -> float:
    return float(cast(Any, Polygon(space["polygon"])).area)


def _survivor_and_removed_space(
    first_space: SpaceContext,
    second_space: SpaceContext,
) -> tuple[SpaceContext, SpaceContext]:
    if _space_polygon_area(first_space) >= _space_polygon_area(second_space):
        return first_space, second_space
    return second_space, first_space


def _merge_deleted_wall_space_polygon(
    first_space: SpaceContext,
    second_space: SpaceContext,
) -> list[tuple[float, float]]:
    merged = _shapely_union_all(
        [Polygon(first_space["polygon"]), Polygon(second_space["polygon"])]
    )
    merged = cast(Any, merged).buffer(_DELETE_WALL_SPACE_CLOSE_MM, join_style=2).buffer(
        -_DELETE_WALL_SPACE_CLOSE_MM,
        join_style=2,
    )
    if isinstance(merged, MultiPolygon):
        merged = max(merged.geoms, key=lambda geom: float(cast(Any, geom).area))
    if not isinstance(merged, Polygon):
        raise ValueError(f"unexpected merged geometry for delete_wall: {merged.geom_type}")
    return [
        (float(x), float(y))
        for x, y in cast(Any, merged).exterior.coords[:-1]
    ]


def _space_depth_m_for_healing(space: ifcopenshell.entity_instance) -> float:
    representation = getattr(space, "Representation", None)
    if representation is None:
        return _DEFAULT_SPACE_HEIGHT_M
    for rep in getattr(representation, "Representations", []) or []:
        for item in getattr(rep, "Items", []) or []:
            if item.is_a("IfcExtrudedAreaSolid"):
                depth = getattr(item, "Depth", None)
                if isinstance(depth, int | float) and depth > 0.0:
                    return float(depth)
    return _DEFAULT_SPACE_HEIGHT_M


def _heal_deleted_wall_spaces(
    *,
    model: ifcopenshell.file,
    survivor_space_id: str,
    removed_space_id: str,
    merged_polygon_mm: list[tuple[float, float]],
) -> bool:
    survivor = model.by_guid(survivor_space_id)
    removed = model.by_guid(removed_space_id)
    if survivor is None or removed is None:
        return False

    placement = getattr(survivor, "ObjectPlacement", None)
    relative_to = getattr(placement, "PlacementRelTo", None) if placement else None
    depth_m = _space_depth_m_for_healing(survivor)
    min_x = min(point[0] for point in merged_polygon_mm)
    min_y = min(point[1] for point in merged_polygon_mm)
    max_x = max(point[0] for point in merged_polygon_mm)
    max_y = max(point[1] for point in merged_polygon_mm)
    local_polygon_mm = [(x - min_x, y - min_y) for x, y in merged_polygon_mm]

    survivor.ObjectPlacement = _create_local_placement(
        model=model,
        relative_to=relative_to,
        location=(min_x / 1000.0, min_y / 1000.0, 0.0),
        ref_direction=(1.0, 0.0, 0.0),
    )
    survivor.Representation = _create_space_representation_from_polygon(
        model=model,
        polygon_mm=local_polygon_mm,
        depth_m=depth_m,
        context=_body_context(model, survivor),
    )
    _update_space_pset(
        model=model,
        space=survivor,
        width_mm=round(max_x - min_x),
        height_mm=round(max_y - min_y),
        rects=None,
        shape="polygon",
    )
    ifcopenshell.api.root.remove_product(model, product=removed)
    return True


def _apply_insert_toilet(
    *,
    model: ifcopenshell.file,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None,
    policy_plan: dict[str, Any],
) -> dict[str, Any]:
    return _apply_insert_toilet_impl(
        model=model,
        output_path=output_path,
        command=command,
        command_batch=command_batch,
        policy_plan=policy_plan,
        space_dimensions_m_fn=_space_dimensions_m,
    )


def _apply_insert_toilet_v2(
    *,
    model: ifcopenshell.file,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None,
    policy_plan: dict[str, Any],
) -> dict[str, Any]:
    return _apply_insert_toilet_v2_impl(
        model=model,
        output_path=output_path,
        command=command,
        command_batch=command_batch,
        policy_plan=policy_plan,
        space_dimensions_m_fn=_space_dimensions_m,
    )



def _apply_remove_merge_plan(
    *,
    model: ifcopenshell.file,
    merge_plan: RemoveMergePlan,
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
                offset_x_m=anchor["x"] / 1000.0,
                offset_y_m=anchor["y"] / 1000.0,
            )

    _, _, current_depth_m = _space_dimensions_m(merge_target)
    dimensions = merge_plan["dimensions_mm"]
    merge_target.Representation = _create_space_representation(
        model=model,
        width_m=dimensions["width"] / 1000.0,
        height_m=dimensions["height"] / 1000.0,
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
    wall_plans: list[WallSegmentPlan],
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
    if relative is None or location is None:
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
        width_mm=round(next_width_m * 1000.0),
        height_mm=round(next_height_m * 1000.0),
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
                if prop.Name == "Width" and isinstance(wrapped, int | float):
                    width_mm = wrapped
                elif prop.Name == "Height" and isinstance(wrapped, int | float):
                    height_mm = wrapped
            break

    return (
        (float(width_mm) / 1000.0) if width_mm is not None else 0.0,
        (float(height_mm) / 1000.0) if height_mm is not None else 0.0,
        _DEFAULT_SPACE_HEIGHT_M,
    )
