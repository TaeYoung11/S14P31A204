"""Validation helpers used by toilet planning."""

from __future__ import annotations

from typing import Any, cast

from shapely.geometry import Polygon  # type: ignore[import-untyped]

from .geometry import _bbox, _segment_length
from .types import (
    BedroomQualityMetrics,
    MIN_BEDROOM_BBOX_FILL_RATIO,
    MIN_BEDROOM_INSCRIBED_DEPTH_MM,
    MIN_BEDROOM_INSCRIBED_WIDTH_MM,
    MIN_CORRIDOR_CLEARANCE_MM,
    MIN_ROOM_AREA_BY_TYPE_MM2,
    MIN_ROOM_WIDTH_MM,
    ToiletReadabilityMetrics,
    ValidationIssue,
)


def _validate_space_minimums(
    *,
    donor_type: str | None,
    polygon: list[tuple[float, float]],
) -> bool:
    poly = Polygon(polygon)
    if not cast(Any, poly).is_valid:
        return False
    bbox = _bbox(polygon)
    min_width = min(bbox[2] - bbox[0], bbox[3] - bbox[1])
    if donor_type == "corridor":
        return min_width >= MIN_CORRIDOR_CLEARANCE_MM
    if donor_type == "bathroom":
        return min_width >= 1800
    if min_width < MIN_ROOM_WIDTH_MM:
        return False
    min_area = MIN_ROOM_AREA_BY_TYPE_MM2.get(donor_type)
    if min_area is None:
        return True
    return cast(Any, poly).area >= min_area


def _build_bedroom_quality_metrics(
    *,
    before_polygon: list[tuple[float, float]],
    after_polygon: list[tuple[float, float]],
) -> BedroomQualityMetrics:
    before_shape = Polygon(before_polygon)
    after_shape = Polygon(after_polygon)
    after_bbox = _bbox(after_polygon)
    after_bbox_area = max(1.0, (after_bbox[2] - after_bbox[0]) * (after_bbox[3] - after_bbox[1]))
    return {
        "area_before_mm2": float(cast(Any, before_shape).area),
        "area_after_mm2": float(cast(Any, after_shape).area),
        "bbox_fill_ratio_after": float(cast(Any, after_shape).area / after_bbox_area),
        "largest_inscribed_rect_after_mm": (
            round(after_bbox[2] - after_bbox[0]),
            round(after_bbox[3] - after_bbox[1]),
        ),
    }


def _is_bedroom_shape_acceptable(metrics: BedroomQualityMetrics) -> bool:
    if metrics["bbox_fill_ratio_after"] < MIN_BEDROOM_BBOX_FILL_RATIO:
        return False
    width_mm, depth_mm = metrics["largest_inscribed_rect_after_mm"]
    return width_mm >= MIN_BEDROOM_INSCRIBED_WIDTH_MM and depth_mm >= MIN_BEDROOM_INSCRIBED_DEPTH_MM


def _build_toilet_readability_metrics(
    *,
    toilet_polygon: list[tuple[float, float]],
    exterior_wall_segment: tuple[tuple[float, float], tuple[float, float]],
    interior_door_wall_segment: tuple[tuple[float, float], tuple[float, float]],
) -> ToiletReadabilityMetrics:
    toilet_bbox = _bbox(toilet_polygon)
    width_mm = round(toilet_bbox[2] - toilet_bbox[0])
    depth_mm = round(toilet_bbox[3] - toilet_bbox[1])
    min_dim = max(1, min(width_mm, depth_mm))
    max_dim = max(width_mm, depth_mm)
    perimeter = cast(Any, Polygon(toilet_polygon)).length
    covered_length = (
        _segment_length(exterior_wall_segment)
        + _segment_length(interior_door_wall_segment)
        + 2 * min(width_mm, depth_mm)
    )
    return {
        "dimensions_mm": (width_mm, depth_mm),
        "aspect_ratio": max_dim / min_dim,
        "exterior_contact_length_mm": _segment_length(exterior_wall_segment),
        "interior_contact_length_mm": _segment_length(interior_door_wall_segment),
        "perimeter_coverage_ratio": covered_length / max(1.0, perimeter),
    }


def _build_validation_issues(
    *,
    errors: list[str],
    warnings: list[str],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for code in errors:
        issues.append({"code": code, "severity": "error", "message": code})
    for code in warnings:
        issues.append({"code": code, "severity": "warning", "message": code})
    return issues
