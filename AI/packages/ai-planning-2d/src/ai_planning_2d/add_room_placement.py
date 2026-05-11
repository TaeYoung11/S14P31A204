from __future__ import annotations

from typing import Any

from .command import IFCContext
from shapely.geometry import Polygon, box

_GRID_STEP_MM = 250


def suggest_add_room_start_mm(
    ifc_context: IFCContext | None,
    *,
    floor: int | None,
    width: int,
    height: int,
) -> tuple[float, float] | None:
    if ifc_context is None:
        return (0.0, 0.0)

    same_floor_spaces = [
        space for space in ifc_context.get("spaces", []) if space.get("floor") == floor
    ]
    if not same_floor_spaces:
        return (0.0, 0.0)

    boundary = next(
        (entry for entry in ifc_context.get("boundaries", []) if entry.get("floor") == floor),
        None,
    )
    region = _placement_region(boundary, same_floor_spaces)
    existing_rects = [_space_rect(space) for space in same_floor_spaces]

    candidates: list[tuple[float, float, tuple[float, float]]] = []
    for space in same_floor_spaces:
        host_rect = _space_rect(space)
        candidates.extend(
            _adjacent_candidates(
                host_rect=host_rect,
                width=width,
                height=height,
                region=region,
                existing_rects=existing_rects,
            )
        )

    if candidates:
        candidates.sort(key=lambda item: item[2], reverse=True)
        x, y, _score = candidates[0]
        return (x, y)

    if len(same_floor_spaces) == 1:
        relaxed_region = {
            "bbox": region["bbox"],
            "enforce_bbox": False,
            "polygon": None,
        }
        relaxed_candidates = _adjacent_candidates(
            host_rect=_space_rect(same_floor_spaces[0]),
            width=width,
            height=height,
            region=relaxed_region,
            existing_rects=existing_rects,
        )
        if relaxed_candidates:
            relaxed_candidates.sort(key=lambda item: item[2], reverse=True)
            x, y, _score = relaxed_candidates[0]
            return (x, y)

    fallback = _grid_search_candidate(
        width=width,
        height=height,
        region=region,
        existing_rects=existing_rects,
    )
    return fallback


def _adjacent_candidates(
    *,
    host_rect: tuple[float, float, float, float],
    width: int,
    height: int,
    region: dict[str, Any],
    existing_rects: list[tuple[float, float, float, float]],
) -> list[tuple[float, float, tuple[float, float]]]:
    min_x, min_y, max_x, max_y = host_rect
    raw_candidates = [
        (max_x, min_y, _shared_length_mm((min_y, max_y), (min_y, min_y + height))),
        (max_x, max_y - height, _shared_length_mm((min_y, max_y), (max_y - height, max_y))),
        (min_x - width, min_y, _shared_length_mm((min_y, max_y), (min_y, min_y + height))),
        (min_x - width, max_y - height, _shared_length_mm((min_y, max_y), (max_y - height, max_y))),
        (min_x, max_y, _shared_length_mm((min_x, max_x), (min_x, min_x + width))),
        (max_x - width, max_y, _shared_length_mm((min_x, max_x), (max_x - width, max_x))),
        (min_x, min_y - height, _shared_length_mm((min_x, max_x), (min_x, min_x + width))),
        (max_x - width, min_y - height, _shared_length_mm((min_x, max_x), (max_x - width, max_x))),
    ]
    candidates: list[tuple[float, float, tuple[float, float]]] = []
    center_x = (region["bbox"][0] + region["bbox"][2]) / 2.0
    center_y = (region["bbox"][1] + region["bbox"][3]) / 2.0
    for x, y, shared_edge in raw_candidates:
        rect = (x, y, x + width, y + height)
        if not _fits_region(region, rect):
            continue
        if _overlaps_existing(rect, existing_rects):
            continue
        distance = abs((x + width / 2.0) - center_x) + abs((y + height / 2.0) - center_y)
        candidates.append((x, y, (shared_edge, -distance)))
    return candidates


def _grid_search_candidate(
    *,
    width: int,
    height: int,
    region: dict[str, Any],
    existing_rects: list[tuple[float, float, float, float]],
) -> tuple[float, float] | None:
    min_x, min_y, max_x, max_y = region["bbox"]
    best: tuple[float, float] | None = None
    best_score: tuple[float, float] | None = None
    y = min_y
    while y + height <= max_y:
        x = min_x
        while x + width <= max_x:
            rect = (x, y, x + width, y + height)
            if _fits_region(region, rect) and not _overlaps_existing(rect, existing_rects):
                distance = _nearest_space_gap(rect, existing_rects)
                center_x = (min_x + max_x) / 2.0
                center_y = (min_y + max_y) / 2.0
                anchor_distance = (
                    abs((x + width / 2.0) - center_x)
                    + abs((y + height / 2.0) - center_y)
                )
                score = (-distance, -anchor_distance)
                if best_score is None or score > best_score:
                    best = (x, y)
                    best_score = score
            x += _GRID_STEP_MM
        y += _GRID_STEP_MM
    return best


def _nearest_space_gap(
    rect: tuple[float, float, float, float],
    existing_rects: list[tuple[float, float, float, float]],
) -> float:
    distances: list[float] = []
    for other in existing_rects:
        distances.append(_rect_gap_mm(rect, other))
    return min(distances) if distances else 0.0


def _rect_gap_mm(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    dx = max(bx1 - ax2, ax1 - bx2, 0.0)
    dy = max(by1 - ay2, ay1 - by2, 0.0)
    return dx + dy


def _shared_length_mm(a: tuple[float, float], b: tuple[float, float]) -> float:
    start = max(a[0], b[0])
    end = min(a[1], b[1])
    return max(0.0, end - start)


def _placement_region(
    boundary: dict[str, Any] | None,
    spaces: list[dict[str, Any]],
) -> dict[str, Any]:
    if boundary is not None and boundary.get("outer_polygon"):
        points = boundary["outer_polygon"]
    else:
        points = [point for space in spaces for point in space["polygon"]]
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    polygon = None
    if len(points) >= 3:
        polygon = Polygon(points)
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
    return {
        "bbox": (min(xs), min(ys), max(xs), max(ys)),
        "enforce_bbox": boundary is not None,
        "polygon": polygon,
    }


def _fits_region(region: dict[str, Any], rect: tuple[float, float, float, float]) -> bool:
    polygon = region["polygon"]
    if region.get("enforce_bbox", False):
        min_x, min_y, max_x, max_y = region["bbox"]
        if rect[0] < min_x or rect[1] < min_y or rect[2] > max_x or rect[3] > max_y:
            return False
    if polygon is None:
        return True
    return polygon.buffer(1e-6).covers(box(*rect))


def _overlaps_existing(
    rect: tuple[float, float, float, float],
    existing_rects: list[tuple[float, float, float, float]],
) -> bool:
    for other in existing_rects:
        if _rectangles_overlap(rect, other):
            return True
    return False


def _rectangles_overlap(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> bool:
    return not (
        a[2] <= b[0]
        or b[2] <= a[0]
        or a[3] <= b[1]
        or b[3] <= a[1]
    )


def _space_rect(space: dict[str, Any]) -> tuple[float, float, float, float]:
    xs = [point[0] for point in space["polygon"]]
    ys = [point[1] for point in space["polygon"]]
    return (min(xs), min(ys), max(xs), max(ys))
