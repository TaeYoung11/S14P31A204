from __future__ import annotations

import ifcopenshell
from ifcopenshell.util.placement import get_local_placement
from shapely import LineString as ShapelyLineString, Point as ShapelyPoint  # type: ignore[import-untyped]


def polygon_bbox_mm(
    polygon: list[tuple[float, float]],
) -> tuple[float, float, float, float]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return (min(xs), min(ys), max(xs), max(ys))


def localize_polygon(
    *,
    world_polygon: list[tuple[float, float]],
    origin_x: float,
    origin_y: float,
) -> list[tuple[float, float]]:
    return [(x - origin_x, y - origin_y) for x, y in world_polygon]


def wall_segment_from_entity(
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
        x_local = point[0]
        y_local = point[1] if len(point) > 1 else 0.0
        return (
            float((location[0] + (x_local * dir_x) - (y_local * dir_y)) * 1000.0),
            float((location[1] + (x_local * dir_y) + (y_local * dir_x)) * 1000.0),
        )

    return (
        _to_world(start_local),
        _to_world(end_local),
    )


def point_along_segment(
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


def offset_along_segment(
    segment: tuple[tuple[float, float], tuple[float, float]],
    point_mm: tuple[float, float],
) -> float:
    start, end = segment
    dx = float(end[0] - start[0])
    dy = float(end[1] - start[1])
    length_mm = (dx * dx + dy * dy) ** 0.5
    if length_mm <= 0.0:
        return 0.0
    projection = ((point_mm[0] - start[0]) * dx + (point_mm[1] - start[1]) * dy) / (
        length_mm * length_mm
    )
    return float(projection * length_mm)


def point_range_along_segment(
    segment: tuple[tuple[float, float], tuple[float, float]],
    offsets_mm: tuple[float, float],
) -> tuple[tuple[float, float], tuple[float, float]]:
    return (
        point_along_segment(segment, offsets_mm[0]),
        point_along_segment(segment, offsets_mm[1]),
    )


def segment_line(
    segment: tuple[tuple[float, float], tuple[float, float]],
) -> ShapelyLineString:
    return ShapelyLineString([segment[0], segment[1]])


def segment_length_mm(
    segment: tuple[tuple[float, float], tuple[float, float]],
) -> float:
    return float(segment_line(segment).length)


def point_is_within_segment(
    *,
    point_mm: tuple[float, float],
    segment_mm: tuple[tuple[float, float], tuple[float, float]],
    distance_tolerance_mm: float = 50.0,
    endpoint_tolerance_mm: float = 50.0,
) -> bool:
    line = segment_line(segment_mm)
    point = ShapelyPoint(point_mm)
    if line.distance(point) > distance_tolerance_mm:
        return False
    start, end = segment_mm
    dx = float(end[0] - start[0])
    dy = float(end[1] - start[1])
    length_sq = (dx * dx) + (dy * dy)
    if length_sq <= 0.0:
        return False
    projection = ((point_mm[0] - start[0]) * dx + (point_mm[1] - start[1]) * dy) / length_sq
    return (-endpoint_tolerance_mm / (length_sq**0.5)) <= projection <= (
        1.0 + endpoint_tolerance_mm / (length_sq**0.5)
    )


def opening_world_point(opening: ifcopenshell.entity_instance) -> ShapelyPoint | None:
    if getattr(opening, "ObjectPlacement", None) is None:
        return None
    matrix = get_local_placement(opening.ObjectPlacement)
    return ShapelyPoint(float(matrix[0, 3]) * 1000.0, float(matrix[1, 3]) * 1000.0)

