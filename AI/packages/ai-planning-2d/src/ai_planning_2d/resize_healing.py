from __future__ import annotations

import math
from typing import Literal, TypedDict

from .command import IFCContext, SpaceContext, WallContext

_WALL_MATCH_TOLERANCE_MM = 500.0
_OVERLAP_TOLERANCE_MM = 1.0


class WallSegmentPlan(TypedDict):
    wall_id: str
    start_mm: tuple[float, float]
    end_mm: tuple[float, float]


def build_isolated_rectangular_resize_wall_plans(
    *,
    ifc_context: IFCContext | None,
    target_space_id: str,
    direction: Literal["north", "south", "east", "west"] | None,
    new_width: int,
    new_height: int,
) -> list[WallSegmentPlan]:
    if ifc_context is None or direction is None:
        return []
    target = next(
        (space for space in ifc_context.get("spaces", []) if space["id"] == target_space_id),
        None,
    )
    if target is None:
        return []

    min_x, min_y, max_x, max_y = _bbox(target["polygon"])
    current_walls = _directional_boundary_walls(ifc_context=ifc_context, target_space=target)
    if current_walls is None:
        return []

    current_positions = {
        "west": current_walls["west"]["start"][0],
        "east": current_walls["east"]["start"][0],
        "south": current_walls["south"]["start"][1],
        "north": current_walls["north"]["start"][1],
    }
    offsets = {
        "west": current_positions["west"] - min_x,
        "east": current_positions["east"] - max_x,
        "south": current_positions["south"] - min_y,
        "north": current_positions["north"] - max_y,
    }

    next_min_x, next_min_y, next_max_x, next_max_y = min_x, min_y, max_x, max_y
    if direction == "west":
        next_min_x = next_max_x - new_width
    elif direction == "east":
        next_max_x = next_min_x + new_width
    elif direction == "south":
        next_min_y = next_max_y - new_height
    elif direction == "north":
        next_max_y = next_min_y + new_height

    wall_x = {
        "west": next_min_x + offsets["west"],
        "east": next_max_x + offsets["east"],
    }
    wall_y = {
        "south": next_min_y + offsets["south"],
        "north": next_max_y + offsets["north"],
    }

    desired_segments = {
        "west": ((wall_x["west"], wall_y["south"]), (wall_x["west"], wall_y["north"])),
        "east": ((wall_x["east"], wall_y["south"]), (wall_x["east"], wall_y["north"])),
        "south": ((wall_x["east"], wall_y["south"]), (wall_x["west"], wall_y["south"])),
        "north": ((wall_x["west"], wall_y["north"]), (wall_x["east"], wall_y["north"])),
    }

    plans: list[WallSegmentPlan] = []
    for side, wall in current_walls.items():
        start_mm, end_mm = _ordered_like_current(
            current_start=wall["start"],
            current_end=wall["end"],
            desired_start=desired_segments[side][0],
            desired_end=desired_segments[side][1],
        )
        plans.append(
            {
                "wall_id": wall["id"],
                "start_mm": start_mm,
                "end_mm": end_mm,
            }
        )
    return plans


def _directional_boundary_walls(
    *,
    ifc_context: IFCContext,
    target_space: SpaceContext,
) -> dict[str, WallContext] | None:
    by_direction: dict[str, WallContext] = {}
    for direction in ("west", "east", "south", "north"):
        wall = _closest_wall_for_direction(
            ifc_context=ifc_context,
            target_space=target_space,
            direction=direction,
        )
        if wall is None:
            return None
        by_direction[direction] = wall
    wall_ids = {wall["id"] for wall in by_direction.values()}
    if len(wall_ids) != 4:
        return None
    return by_direction


def _closest_wall_for_direction(
    *,
    ifc_context: IFCContext,
    target_space: SpaceContext,
    direction: Literal["north", "south", "east", "west"],
) -> WallContext | None:
    min_x, min_y, max_x, max_y = _bbox(target_space["polygon"])
    candidates: list[tuple[float, WallContext]] = []

    for wall in ifc_context.get("walls", []):
        if wall["floor"] != target_space["floor"] or (
            target_space["id"] not in wall.get("space_ids", [])
        ):
            continue
        start_x, start_y = wall["start"]
        end_x, end_y = wall["end"]
        is_vertical = math.isclose(start_x, end_x, abs_tol=_OVERLAP_TOLERANCE_MM)
        is_horizontal = math.isclose(start_y, end_y, abs_tol=_OVERLAP_TOLERANCE_MM)
        if direction in {"west", "east"} and not is_vertical:
            continue
        if direction in {"north", "south"} and not is_horizontal:
            continue

        if direction == "west":
            if _interval_overlap(min_y, max_y, start_y, end_y) <= _OVERLAP_TOLERANCE_MM:
                continue
            distance = min_x - start_x
            if distance < -_WALL_MATCH_TOLERANCE_MM:
                continue
        elif direction == "east":
            if _interval_overlap(min_y, max_y, start_y, end_y) <= _OVERLAP_TOLERANCE_MM:
                continue
            distance = start_x - max_x
            if distance < -_WALL_MATCH_TOLERANCE_MM:
                continue
        elif direction == "south":
            if _interval_overlap(min_x, max_x, start_x, end_x) <= _OVERLAP_TOLERANCE_MM:
                continue
            distance = min_y - start_y
            if distance < -_WALL_MATCH_TOLERANCE_MM:
                continue
        else:
            if _interval_overlap(min_x, max_x, start_x, end_x) <= _OVERLAP_TOLERANCE_MM:
                continue
            distance = start_y - max_y
            if distance < -_WALL_MATCH_TOLERANCE_MM:
                continue

        candidates.append((abs(distance), wall))

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def _ordered_like_current(
    *,
    current_start: tuple[float, float],
    current_end: tuple[float, float],
    desired_start: tuple[float, float],
    desired_end: tuple[float, float],
) -> tuple[tuple[float, float], tuple[float, float]]:
    same_cost = math.dist(current_start, desired_start) + math.dist(current_end, desired_end)
    swapped_cost = math.dist(current_start, desired_end) + math.dist(current_end, desired_start)
    if same_cost <= swapped_cost:
        return desired_start, desired_end
    return desired_end, desired_start


def _bbox(polygon: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def _interval_overlap(
    start_a: float,
    end_a: float,
    start_b: float,
    end_b: float,
) -> float:
    low_a, high_a = sorted((start_a, end_a))
    low_b, high_b = sorted((start_b, end_b))
    return max(0.0, min(high_a, high_b) - max(low_a, low_b))
