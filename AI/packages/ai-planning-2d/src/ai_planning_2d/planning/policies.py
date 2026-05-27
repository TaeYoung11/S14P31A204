"""방 삭제와 크기 조정 같은 작업에 대한 정책 판단과 계획 보조 로직을 제공한다."""

from __future__ import annotations

import math
from typing import Literal, TypedDict

from ..command import IFCContext, SpaceContext

from shapely.geometry import Polygon  # type: ignore[import-untyped]

_TOLERANCE_MM = 1.0
_DOMINANT_CONTACT_RATIO = 0.3
_DOMINANT_CONTACT_EPSILON = 50.0


class RemoveRoomPolicyResult(TypedDict):
    status: Literal["planned", "needs_clarification", "unsupported"]
    reason: str
    target_space_id: str | None
    merge_target_space_id: str | None
    shared_contact_length_mm: float | None
    remove_wall_ids: list[str]
    remove_opening_ids: list[str]


class ResizeRoomPolicyResult(TypedDict):
    status: Literal["planned", "needs_clarification", "unsupported"]
    reason: str
    target_space_id: str | None
    direction: Literal["north", "south", "east", "west"] | None
    new_width: int | None
    new_height: int | None
    affected_space_id: str | None
    affected_wall_ids: list[str]
    affected_opening_ids: list[str]


def plan_remove_room(
    *,
    target_space_id: str,
    preferred_merge_target_space_id: str | None = None,
    ifc_context: IFCContext,
) -> RemoveRoomPolicyResult:
    target_space = _find_space(target_space_id, ifc_context)
    if target_space is None:
        return _remove_result("needs_clarification", "room_not_found", None, None, None, [], [])
    if target_space.get("locked", False):
        return _remove_result(
            "needs_clarification", "locked_room", target_space_id, None, None, [], []
        )

    candidates = _remove_candidates(target_space=target_space, ifc_context=ifc_context)

    if not candidates:
        return _remove_result(
            "needs_clarification",
            "no_adjacent_absorber",
            target_space_id,
            None,
            None,
            [],
            [],
        )

    if preferred_merge_target_space_id is not None:
        preferred_candidate = next(
            (item for item in candidates if item[1]["id"] == preferred_merge_target_space_id),
            None,
        )
        if preferred_candidate is None:
            return _remove_result(
                "needs_clarification",
                "preferred_absorber_not_adjacent",
                target_space_id,
                None,
                None,
                [],
                [],
            )
        preferred_contact, preferred_space = preferred_candidate
        remove_wall_ids = _shared_wall_ids(
            ifc_context,
            target_space_id=target_space_id,
            other_space_id=preferred_space["id"],
        )
        remove_opening_ids = _opening_ids_for_walls(ifc_context, remove_wall_ids)
        return _remove_result(
            "planned",
            "preferred_adjacent_absorber",
            target_space_id,
            preferred_space["id"],
            preferred_contact,
            remove_wall_ids,
            remove_opening_ids,
        )

    candidates.sort(key=lambda item: item[0], reverse=True)
    dominant_contact, dominant_space = candidates[0]
    target_perimeter = _perimeter_mm(target_space["polygon"])
    if target_perimeter <= 0:
        return _remove_result(
            "unsupported", "invalid_target_polygon", target_space_id, None, None, [], []
        )
    if dominant_contact / target_perimeter < _DOMINANT_CONTACT_RATIO:
        return _remove_result(
            "needs_clarification",
            "no_dominant_absorber",
            target_space_id,
            None,
            dominant_contact,
            [],
            [],
        )

    if len(candidates) > 1:
        second_contact, _ = candidates[1]
        if abs(dominant_contact - second_contact) <= _DOMINANT_CONTACT_EPSILON:
            return _remove_result(
                "needs_clarification",
                "multiple_similar_absorbers",
                target_space_id,
                None,
                dominant_contact,
                [],
                [],
            )

    remove_wall_ids = _shared_wall_ids(
        ifc_context,
        target_space_id=target_space_id,
        other_space_id=dominant_space["id"],
    )
    remove_opening_ids = _opening_ids_for_walls(ifc_context, remove_wall_ids)

    return _remove_result(
        "planned",
        "dominant_adjacent_absorber",
        target_space_id,
        dominant_space["id"],
        dominant_contact,
        remove_wall_ids,
        remove_opening_ids,
    )


def plan_resize_room(
    *,
    target_space_id: str,
    new_width: int,
    new_height: int,
    preferred_direction: Literal["north", "south", "east", "west"] | None = None,
    ifc_context: IFCContext,
) -> ResizeRoomPolicyResult:
    target_space = _find_space(target_space_id, ifc_context)
    if target_space is None:
        return _resize_result(
            "needs_clarification", "room_not_found", None, None, None, None, None, [], []
        )
    if target_space.get("locked", False):
        return _resize_result(
            "needs_clarification",
            "locked_room",
            target_space_id,
            None,
            None,
            None,
            None,
            [],
            [],
        )
    if not _is_axis_aligned_rectangle(target_space["polygon"]):
        return _resize_result(
            "unsupported",
            "non_rectangular_space",
            target_space_id,
            None,
            None,
            None,
            None,
            [],
            [],
        )

    min_x, min_y, max_x, max_y = _bbox(target_space["polygon"])
    current_width = round(max_x - min_x)
    current_height = round(max_y - min_y)
    changed_width = new_width != current_width
    changed_height = new_height != current_height

    if changed_width and changed_height:
        return _resize_result(
            "needs_clarification",
            "multi_axis_resize_unsupported",
            target_space_id,
            None,
            new_width,
            new_height,
            None,
            [],
            [],
        )
    if not changed_width and not changed_height:
        return _resize_result(
            "planned",
            "no_dimension_change",
            target_space_id,
            None,
            new_width,
            new_height,
            None,
            [],
            [],
        )

    axis = "x" if changed_width else "y"
    directions = ("west", "east") if axis == "x" else ("south", "north")
    if preferred_direction is not None:
        if preferred_direction not in directions:
            return _resize_result(
                "unsupported",
                "resize_direction_axis_mismatch",
                target_space_id,
                preferred_direction,
                new_width,
                new_height,
                None,
                [],
                [],
            )
        directions = (preferred_direction,)
    valid_candidates: list[
        tuple[Literal["north", "south", "east", "west"], str | None, list[str], list[str]]
    ] = []
    rejected_for_geometry_healing = False
    rejected_for_boundary = False

    for direction in directions:
        neighbors = _neighbors_on_direction(
            target_space=target_space,
            direction=direction,
            ifc_context=ifc_context,
        )
        if len(neighbors) > 1:
            continue
        affected_space_id = neighbors[0] if neighbors else None

        affected_wall_ids = _walls_for_direction(
            ifc_context,
            target_space=target_space,
            direction=direction,
            other_space_id=affected_space_id,
        )
        if _requires_resize_geometry_healing(
            ifc_context,
            wall_ids=affected_wall_ids,
        ):
            rejected_for_geometry_healing = True
            continue
        if _violates_floor_boundary(
            ifc_context=ifc_context,
            floor=target_space["floor"],
            polygon=target_space["polygon"],
            direction=direction,
            new_width=new_width,
            new_height=new_height,
        ):
            rejected_for_boundary = True
            continue
        affected_opening_ids = _opening_ids_for_walls(ifc_context, affected_wall_ids)
        valid_candidates.append(
            (direction, affected_space_id, affected_wall_ids, affected_opening_ids)
        )

    if not valid_candidates and rejected_for_boundary:
        return _resize_result(
            "unsupported",
            "resize_outside_boundary",
            target_space_id,
            preferred_direction,
            new_width,
            new_height,
            None,
            [],
            [],
        )

    if not valid_candidates and rejected_for_geometry_healing:
        return _resize_result(
            "unsupported",
            "resize_geometry_healing_required",
            target_space_id,
            preferred_direction,
            new_width,
            new_height,
            None,
            [],
            [],
        )

    if len(valid_candidates) != 1:
        return _resize_result(
            "needs_clarification",
            "resize_direction_ambiguous",
            target_space_id,
            None,
            new_width,
            new_height,
            None,
            [],
            [],
        )

    direction, affected_space_id, affected_wall_ids, affected_opening_ids = valid_candidates[0]
    return _resize_result(
        "planned",
        "single_direction_resize",
        target_space_id,
        direction,
        new_width,
        new_height,
        affected_space_id,
        affected_wall_ids,
        affected_opening_ids,
    )


def _find_space(space_id: str, ifc_context: IFCContext) -> SpaceContext | None:
    for space in ifc_context.get("spaces", []):
        if space["id"] == space_id:
            return space
    return None


def _remove_candidates(
    *,
    target_space: SpaceContext,
    ifc_context: IFCContext,
) -> list[tuple[float, SpaceContext]]:
    spaces_by_id = {space["id"]: space for space in ifc_context.get("spaces", [])}
    wall_contact_mm: dict[str, float] = {}

    for wall in ifc_context.get("walls", []):
        wall_space_ids = [space_id for space_id in wall.get("space_ids", []) if space_id]
        if target_space["id"] not in wall_space_ids:
            continue
        if wall.get("kind") != "INTERIOR":
            continue
        other_space_ids = [
            space_id
            for space_id in wall_space_ids
            if space_id != target_space["id"]
            and spaces_by_id.get(space_id, {}).get("floor") == target_space["floor"]
        ]
        if len(other_space_ids) != 1:
            continue
        wall_length = math.dist(wall["start"], wall["end"])
        if wall_length <= _TOLERANCE_MM:
            continue
        other_space_id = other_space_ids[0]
        wall_contact_mm[other_space_id] = wall_contact_mm.get(other_space_id, 0.0) + wall_length

    if wall_contact_mm:
        candidates = [
            (contact_length, spaces_by_id[space_id])
            for space_id, contact_length in wall_contact_mm.items()
            if space_id in spaces_by_id
        ]
        candidates.sort(key=lambda item: item[0], reverse=True)
        return candidates

    candidates = []
    for candidate in ifc_context.get("spaces", []):
        if candidate["id"] == target_space["id"] or candidate["floor"] != target_space["floor"]:
            continue
        contact_length = _shared_contact_length_mm(target_space, candidate)
        if contact_length > _TOLERANCE_MM:
            candidates.append((contact_length, candidate))
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates


def _remove_result(
    status: Literal["planned", "needs_clarification", "unsupported"],
    reason: str,
    target_space_id: str | None,
    merge_target_space_id: str | None,
    shared_contact_length_mm: float | None,
    remove_wall_ids: list[str],
    remove_opening_ids: list[str],
) -> RemoveRoomPolicyResult:
    return {
        "status": status,
        "reason": reason,
        "target_space_id": target_space_id,
        "merge_target_space_id": merge_target_space_id,
        "shared_contact_length_mm": shared_contact_length_mm,
        "remove_wall_ids": remove_wall_ids,
        "remove_opening_ids": remove_opening_ids,
    }


def _resize_result(
    status: Literal["planned", "needs_clarification", "unsupported"],
    reason: str,
    target_space_id: str | None,
    direction: Literal["north", "south", "east", "west"] | None,
    new_width: int | None,
    new_height: int | None,
    affected_space_id: str | None,
    affected_wall_ids: list[str],
    affected_opening_ids: list[str],
) -> ResizeRoomPolicyResult:
    return {
        "status": status,
        "reason": reason,
        "target_space_id": target_space_id,
        "direction": direction,
        "new_width": new_width,
        "new_height": new_height,
        "affected_space_id": affected_space_id,
        "affected_wall_ids": affected_wall_ids,
        "affected_opening_ids": affected_opening_ids,
    }


def _shared_wall_ids(
    ifc_context: IFCContext,
    *,
    target_space_id: str,
    other_space_id: str,
) -> list[str]:
    wall_ids: list[str] = []
    for wall in ifc_context.get("walls", []):
        wall_space_ids = set(wall.get("space_ids", []))
        if (
            {target_space_id, other_space_id}.issubset(wall_space_ids)
            and wall.get("kind") == "INTERIOR"
        ):
            wall_ids.append(wall["id"])
    return wall_ids


def _opening_ids_for_walls(ifc_context: IFCContext, wall_ids: list[str]) -> list[str]:
    wall_id_set = set(wall_ids)
    opening_ids: list[str] = []
    for door in ifc_context.get("doors", []):
        if door["host_wall_id"] in wall_id_set:
            opening_ids.append(door["id"])
    for window in ifc_context.get("windows", []):
        if window["host_wall_id"] in wall_id_set:
            opening_ids.append(window["id"])
    return opening_ids


def _neighbors_on_direction(
    *,
    target_space: SpaceContext,
    direction: Literal["north", "south", "east", "west"],
    ifc_context: IFCContext,
) -> list[str]:
    neighbors = []
    for candidate in ifc_context.get("spaces", []):
        if candidate["id"] == target_space["id"] or candidate["floor"] != target_space["floor"]:
            continue
        if _touches_direction(target_space, candidate, direction):
            neighbors.append(candidate["id"])
    return neighbors


def _walls_for_direction(
    ifc_context: IFCContext,
    *,
    target_space: SpaceContext,
    direction: Literal["north", "south", "east", "west"],
    other_space_id: str | None,
) -> list[str]:
    wall_ids: list[str] = []
    for wall in ifc_context.get("walls", []):
        wall_space_ids = set(wall.get("space_ids", []))
        if target_space["id"] not in wall_space_ids:
            continue
        if other_space_id is not None and other_space_id not in wall_space_ids:
            continue
        start_x, start_y = wall["start"]
        end_x, end_y = wall["end"]
        min_x, min_y, max_x, max_y = _bbox(target_space["polygon"])
        if (
            direction == "west"
            and math.isclose(start_x, min_x, abs_tol=_TOLERANCE_MM)
            and math.isclose(end_x, min_x, abs_tol=_TOLERANCE_MM)
        ):
            wall_ids.append(wall["id"])
        elif (
            direction == "east"
            and math.isclose(start_x, max_x, abs_tol=_TOLERANCE_MM)
            and math.isclose(end_x, max_x, abs_tol=_TOLERANCE_MM)
        ):
            wall_ids.append(wall["id"])
        elif (
            direction == "south"
            and math.isclose(start_y, min_y, abs_tol=_TOLERANCE_MM)
            and math.isclose(end_y, min_y, abs_tol=_TOLERANCE_MM)
        ):
            wall_ids.append(wall["id"])
        elif (
            direction == "north"
            and math.isclose(start_y, max_y, abs_tol=_TOLERANCE_MM)
            and math.isclose(end_y, max_y, abs_tol=_TOLERANCE_MM)
        ):
            wall_ids.append(wall["id"])
    return wall_ids


def _touches_direction(
    target_space: SpaceContext,
    candidate_space: SpaceContext,
    direction: Literal["north", "south", "east", "west"],
) -> bool:
    min_x, min_y, max_x, max_y = _bbox(target_space["polygon"])
    other_min_x, other_min_y, other_max_x, other_max_y = _bbox(candidate_space["polygon"])
    if direction == "west":
        return math.isclose(other_max_x, min_x, abs_tol=_TOLERANCE_MM) and _interval_overlap_mm(
            min_y, max_y, other_min_y, other_max_y
        ) > _TOLERANCE_MM
    if direction == "east":
        return math.isclose(other_min_x, max_x, abs_tol=_TOLERANCE_MM) and _interval_overlap_mm(
            min_y, max_y, other_min_y, other_max_y
        ) > _TOLERANCE_MM
    if direction == "south":
        return math.isclose(other_max_y, min_y, abs_tol=_TOLERANCE_MM) and _interval_overlap_mm(
            min_x, max_x, other_min_x, other_max_x
        ) > _TOLERANCE_MM
    return math.isclose(other_min_y, max_y, abs_tol=_TOLERANCE_MM) and _interval_overlap_mm(
        min_x, max_x, other_min_x, other_max_x
    ) > _TOLERANCE_MM


def _shared_contact_length_mm(space_a: SpaceContext, space_b: SpaceContext) -> float:
    min_x_a, min_y_a, max_x_a, max_y_a = _bbox(space_a["polygon"])
    min_x_b, min_y_b, max_x_b, max_y_b = _bbox(space_b["polygon"])

    if math.isclose(max_x_a, min_x_b, abs_tol=_TOLERANCE_MM) or math.isclose(
        max_x_b, min_x_a, abs_tol=_TOLERANCE_MM
    ):
        return _interval_overlap_mm(min_y_a, max_y_a, min_y_b, max_y_b)
    if math.isclose(max_y_a, min_y_b, abs_tol=_TOLERANCE_MM) or math.isclose(
        max_y_b, min_y_a, abs_tol=_TOLERANCE_MM
    ):
        return _interval_overlap_mm(min_x_a, max_x_a, min_x_b, max_x_b)
    return 0.0


def _interval_overlap_mm(start_a: float, end_a: float, start_b: float, end_b: float) -> float:
    return max(0.0, min(end_a, end_b) - max(start_a, start_b))


def _perimeter_mm(polygon: list[tuple[float, float]]) -> float:
    if len(polygon) < 2:
        return 0.0
    perimeter = 0.0
    for index, point in enumerate(polygon):
        next_point = polygon[(index + 1) % len(polygon)]
        perimeter += math.dist(point, next_point)
    return perimeter


def _bbox(polygon: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def _is_axis_aligned_rectangle(polygon: list[tuple[float, float]]) -> bool:
    unique_points = _unique_points_with_tolerance(polygon)
    if len(unique_points) != 4:
        return False
    unique_x = _cluster_axis_values([point[0] for point in unique_points])
    unique_y = _cluster_axis_values([point[1] for point in unique_points])
    return len(unique_x) == 2 and len(unique_y) == 2


def _unique_points_with_tolerance(
    polygon: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    unique_points: list[tuple[float, float]] = []
    for point in polygon:
        if not any(
            math.isclose(point[0], existing[0], abs_tol=_TOLERANCE_MM)
            and math.isclose(point[1], existing[1], abs_tol=_TOLERANCE_MM)
            for existing in unique_points
        ):
            unique_points.append(point)
    return unique_points


def _cluster_axis_values(values: list[float]) -> list[float]:
    clusters: list[float] = []
    for value in values:
        if any(math.isclose(value, existing, abs_tol=_TOLERANCE_MM) for existing in clusters):
            continue
        clusters.append(value)
    return clusters


def _requires_resize_geometry_healing(
    ifc_context: IFCContext,
    *,
    wall_ids: list[str],
) -> bool:
    if not wall_ids:
        return False
    walls = {wall["id"]: wall for wall in ifc_context.get("walls", [])}
    moving_walls = [walls[wall_id] for wall_id in wall_ids if wall_id in walls]
    if not moving_walls:
        return False

    moving_endpoints = {
        _point_key(point)
        for wall in moving_walls
        for point in (wall["start"], wall["end"])
    }
    moving_wall_id_set = {wall["id"] for wall in moving_walls}
    for wall in ifc_context.get("walls", []):
        if wall["id"] in moving_wall_id_set:
            continue
        if (
            _point_key(wall["start"]) in moving_endpoints
            or _point_key(wall["end"]) in moving_endpoints
        ):
            return True
    return False


def _point_key(point: tuple[float, float]) -> tuple[int, int]:
    return (
        round(point[0] / _TOLERANCE_MM),
        round(point[1] / _TOLERANCE_MM),
    )


def _violates_floor_boundary(
    *,
    ifc_context: IFCContext,
    floor: int,
    polygon: list[tuple[float, float]],
    direction: Literal["north", "south", "east", "west"],
    new_width: int,
    new_height: int,
) -> bool:
    boundary = next(
        (item for item in ifc_context.get("boundaries", []) if item["floor"] == floor),
        None,
    )
    if boundary is None:
        return False
    resized_polygon = _resized_polygon(
        polygon=polygon,
        direction=direction,
        new_width=new_width,
        new_height=new_height,
    )
    if resized_polygon is None:
        return False
    return not Polygon(boundary["outer_polygon"]).covers(Polygon(resized_polygon))


def _resized_polygon(
    *,
    polygon: list[tuple[float, float]],
    direction: Literal["north", "south", "east", "west"],
    new_width: int,
    new_height: int,
) -> list[tuple[float, float]] | None:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    if direction == "west":
        min_x = max_x - new_width
    elif direction == "east":
        max_x = min_x + new_width
    elif direction == "south":
        min_y = max_y - new_height
    elif direction == "north":
        max_y = min_y + new_height
    else:  # pragma: no cover
        return None

    return [
        (min_x, min_y),
        (max_x, min_y),
        (max_x, max_y),
        (min_x, max_y),
    ]
