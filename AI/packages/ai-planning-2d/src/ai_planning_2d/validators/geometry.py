from __future__ import annotations

import math


def polygon_bounds_mm(polygon: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def polygon_perimeter_mm(polygon: list[tuple[float, float]]) -> float:
    if len(polygon) < 2:
        return 0.0
    perimeter = 0.0
    next_points = polygon[1:] + [polygon[0]]
    for start, end in zip(polygon, next_points, strict=True):
        perimeter += math.dist(start, end)
    return perimeter


__all__ = ["polygon_bounds_mm", "polygon_perimeter_mm"]
