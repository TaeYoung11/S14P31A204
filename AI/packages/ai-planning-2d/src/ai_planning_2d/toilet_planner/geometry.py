"""Geometry helpers used by toilet planning."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any, cast

from shapely.geometry import LineString, Polygon  # type: ignore[import-untyped]

from ..command import WallContext
from .types import DONOR_TYPE_PRIORITY, TOLERANCE_MM, ToiletInsertionPlan


def _bbox(polygon: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return (min(xs), min(ys), max(xs), max(ys))


def _segment_length(segment: tuple[tuple[float, float], tuple[float, float]]) -> float:
    return float(cast(Any, LineString)([segment[0], segment[1]]).length)


def _polygon_edges(
    polygon: list[tuple[float, float]],
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    points = _closed_polygon(polygon)
    return list(zip(points[:-1], points[1:], strict=False))


def _closed_polygon(polygon: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not polygon:
        return []
    if polygon[0] == polygon[-1]:
        return polygon
    return [*polygon, polygon[0]]


def _is_vertical(start: tuple[float, float], end: tuple[float, float]) -> bool:
    return abs(start[0] - end[0]) <= TOLERANCE_MM


def _is_horizontal(start: tuple[float, float], end: tuple[float, float]) -> bool:
    return abs(start[1] - end[1]) <= TOLERANCE_MM


def _range_overlap(
    range_a: tuple[float, float],
    range_b: tuple[float, float],
) -> tuple[float, float] | None:
    a_min, a_max = sorted(range_a)
    b_min, b_max = sorted(range_b)
    start = max(a_min, b_min)
    end = min(a_max, b_max)
    if end - start <= TOLERANCE_MM:
        return None
    return (start, end)


def _polygon_from_shape(shape: Polygon) -> list[tuple[float, float]]:
    coords = list(cast(Any, shape).exterior.coords)[:-1]
    return [(float(x), float(y)) for x, y in coords]


def _as_point2(point: tuple[float, ...] | list[float]) -> tuple[float, float]:
    return (point[0], point[1])


def _shrink_polygon_right_edge(
    polygon: list[tuple[float, float]],
    *,
    old_max_x: float,
    new_max_x: float,
) -> list[tuple[float, float]] | None:
    if new_max_x >= old_max_x:
        return None
    adjusted: list[tuple[float, float]] = []
    for x, y in polygon:
        next_x = new_max_x if abs(x - old_max_x) <= TOLERANCE_MM else x
        point = (next_x, y)
        if not adjusted or adjusted[-1] != point:
            adjusted.append(point)
    if adjusted and adjusted[0] == adjusted[-1]:
        adjusted.pop()
    return adjusted


def _world_to_local_polygon(
    *,
    polygon: list[tuple[float, float]],
    origin_x: float,
    origin_y: float,
    angle_deg: float,
) -> list[tuple[float, float]]:
    del angle_deg
    return [(x - origin_x, y - origin_y) for x, y in polygon]


def _dedupe_segments(
    segments: list[tuple[tuple[float, float], tuple[float, float]]],
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    deduped: list[tuple[tuple[float, float], tuple[float, float]]] = []
    seen: set[tuple[tuple[float, float], tuple[float, float]]] = set()
    for start, end in segments:
        key = (start, end) if start <= end else (end, start)
        if key in seen:
            continue
        seen.add(key)
        deduped.append((start, end))
    return deduped


def _find_existing_wall_for_segment(
    walls: Iterable[WallContext],
    segment: tuple[tuple[float, float], tuple[float, float]],
) -> WallContext | None:
    segment_line = cast(Any, LineString)([segment[0], segment[1]])
    for wall in walls:
        wall_line = cast(Any, LineString)([_as_point2(wall["start"]), _as_point2(wall["end"])])
        if wall_line.buffer(TOLERANCE_MM).contains(segment_line):
            return wall
    return None


def _find_nearby_wall_for_segment(
    walls: Iterable[WallContext],
    segment: tuple[tuple[float, float], tuple[float, float]],
    *,
    max_gap_mm: float,
) -> WallContext | None:
    best_wall: WallContext | None = None
    best_gap: float | None = None
    start, end = segment
    for wall in walls:
        wall_start = _as_point2(wall["start"])
        wall_end = _as_point2(wall["end"])
        if _is_horizontal(start, end) and _is_horizontal(wall_start, wall_end):
            overlap = _range_overlap((start[0], end[0]), (wall_start[0], wall_end[0]))
            if overlap is None:
                continue
            gap = abs(start[1] - wall_start[1])
        elif _is_vertical(start, end) and _is_vertical(wall_start, wall_end):
            overlap = _range_overlap((start[1], end[1]), (wall_start[1], wall_end[1]))
            if overlap is None:
                continue
            gap = abs(start[0] - wall_start[0])
        else:
            continue
        if gap > max_gap_mm:
            continue
        if best_gap is None or gap < best_gap:
            best_gap = gap
            best_wall = wall
    return best_wall


def _select_primary_exterior_segment(
    segments: list[tuple[tuple[float, float], tuple[float, float]]],
) -> tuple[tuple[float, float], tuple[float, float]]:
    vertical = [segment for segment in segments if _is_vertical(*segment)]
    if vertical:
        return max(vertical, key=lambda segment: abs(segment[1][1] - segment[0][1]))
    return max(segments, key=lambda segment: abs(segment[1][0] - segment[0][0]))


def _candidate_sort_key(plan: ToiletInsertionPlan) -> tuple[int, int, str]:
    return (
        len(plan["validation_errors"]),
        _donor_priority(plan["donor_room_type"]),
        plan["donor_room_name"],
    )


def _donor_priority(space_type: str | None) -> int:
    if space_type in DONOR_TYPE_PRIORITY:
        return DONOR_TYPE_PRIORITY.index(space_type)
    return len(DONOR_TYPE_PRIORITY)
