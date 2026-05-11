from __future__ import annotations

import math
from typing import Literal, TypedDict

from .command import IFCContext

_TOLERANCE_MM = 1.0


class IsolatedResizeSpacePlan(TypedDict):
    target_space_id: str
    world_polygon_mm: list[tuple[float, float]]
    local_polygon_mm: list[tuple[float, float]]
    rects: list[dict[str, int]]
    dimensions_mm: dict[str, int]


def build_isolated_resize_space_plan(
    *,
    ifc_context: IFCContext | None,
    target_space_id: str,
    direction: Literal["north", "south", "east", "west"] | None,
    new_width: int,
    new_height: int,
) -> IsolatedResizeSpacePlan | None:
    if ifc_context is None or direction is None:
        return None
    target = next(
        (space for space in ifc_context.get("spaces", []) if space["id"] == target_space_id),
        None,
    )
    if target is None or not target.get("polygon"):
        return None

    world_polygon = _resize_world_polygon(
        polygon=target["polygon"],
        direction=direction,
        new_width=new_width,
        new_height=new_height,
    )
    if world_polygon is None:
        return None
    local_polygon = _world_to_local_polygon(
        polygon=world_polygon,
        origin_x=float(target.get("x") or 0.0),
        origin_y=float(target.get("y") or 0.0),
        angle_deg=float(target.get("angle") or 0.0),
    )
    rects = [_polygon_bbox_rect(local_polygon)]
    return {
        "target_space_id": target_space_id,
        "world_polygon_mm": world_polygon,
        "local_polygon_mm": local_polygon,
        "rects": rects,
        "dimensions_mm": {"width": new_width, "height": new_height},
    }


def _resize_world_polygon(
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
    current_width = max_x - min_x
    current_height = max_y - min_y
    next_min_x, next_max_x = min_x, max_x
    next_min_y, next_max_y = min_y, max_y

    if direction == "west":
        next_min_x = max_x - new_width
    elif direction == "east":
        next_max_x = min_x + new_width
    elif direction == "south":
        next_min_y = max_y - new_height
    elif direction == "north":
        next_max_y = min_y + new_height
    else:  # pragma: no cover
        return None

    if math.isclose(current_width, 0.0, abs_tol=_TOLERANCE_MM) or math.isclose(
        current_height, 0.0, abs_tol=_TOLERANCE_MM
    ):
        return None

    resized: list[tuple[float, float]] = []
    for x, y in polygon:
        next_x, next_y = x, y
        if math.isclose(x, min_x, abs_tol=_TOLERANCE_MM):
            next_x = next_min_x
        elif math.isclose(x, max_x, abs_tol=_TOLERANCE_MM):
            next_x = next_max_x
        if math.isclose(y, min_y, abs_tol=_TOLERANCE_MM):
            next_y = next_min_y
        elif math.isclose(y, max_y, abs_tol=_TOLERANCE_MM):
            next_y = next_max_y
        resized.append((float(next_x), float(next_y)))
    return resized


def _world_to_local_polygon(
    *,
    polygon: list[tuple[float, float]],
    origin_x: float,
    origin_y: float,
    angle_deg: float,
) -> list[tuple[float, float]]:
    theta = math.radians(angle_deg)
    cos_theta = math.cos(theta)
    sin_theta = math.sin(theta)
    local: list[tuple[float, float]] = []
    for world_x, world_y in polygon:
        dx = world_x - origin_x
        dy = world_y - origin_y
        local_x = dx * cos_theta + dy * sin_theta
        local_y = -dx * sin_theta + dy * cos_theta
        local.append((float(local_x), float(local_y)))
    return local


def _polygon_bbox_rect(polygon: list[tuple[float, float]]) -> dict[str, int]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return {
        "x": int(round(min_x)),
        "y": int(round(min_y)),
        "width": int(round(max_x - min_x)),
        "height": int(round(max_y - min_y)),
    }
