"""Opening planning helpers used by toilet planning."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from ..command import DoorContext, WallContext, WindowContext
from .geometry import (
    _as_point2,
    _is_horizontal,
    _is_vertical,
    _range_overlap,
    _segment_length,
)
from .types import (
    CompletenessCheck,
    ExistingOpeningPlan,
    OpeningConflict,
    WallPlan,
)
from .types import TOLERANCE_MM


def _classify_existing_openings_plan(
    *,
    opening_ids: list[str],
    opening_type: str,
    host_wall_ids: Mapping[str, str | None] | None = None,
    decision: str,
    reason: str = "affected_by_toilet_plan",
    replaces_with_new_opening_local_id: str | None = None,
    inherits_size_from_opening_id: str | None = None,
) -> list[ExistingOpeningPlan]:
    return [
        {
            "global_id": opening_id,
            "opening_type": opening_type,
            "host_wall_id": (host_wall_ids or {}).get(opening_id),
            "decision": decision,
            "reason": reason,
            "new_host_wall_local_id": None,
            "new_segment_along_wall_mm": None,
            "new_width_mm": None,
            "new_height_mm": None,
            "new_sill_height_mm": None,
            "swing_in_space_local_id": None,
            "opens_toward_space_local_id": None,
            "swing_clearance_radius_mm": None,
            "replaces_with_new_opening_local_id": replaces_with_new_opening_local_id,
            "inherits_size_from_opening_id": inherits_size_from_opening_id,
        }
        for opening_id in opening_ids
    ]


def _opening_world_segment(
    *,
    opening: DoorContext | WindowContext,
    wall: WallContext,
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    start = _as_point2(wall["start"])
    end = _as_point2(wall["end"])
    position = float(opening.get("position", 0))
    width = float(opening.get("width", 0))
    wall_length = _segment_length((start, end))
    if wall_length <= TOLERANCE_MM:
        return None

    half_width = width / 2.0
    offset_start = max(0.0, min(position - half_width, wall_length))
    offset_end = max(0.0, min(position + half_width, wall_length))
    if offset_end - offset_start <= TOLERANCE_MM:
        return None
    return (
        _point_on_segment(start, end, offset_start / wall_length),
        _point_on_segment(start, end, offset_end / wall_length),
    )


def _segments_overlap_length(
    segment_a: tuple[tuple[float, float], tuple[float, float]],
    segment_b: tuple[tuple[float, float], tuple[float, float]],
) -> float:
    a_start, a_end = segment_a
    b_start, b_end = segment_b
    if _is_horizontal(a_start, a_end) and _is_horizontal(b_start, b_end):
        if abs(a_start[1] - b_start[1]) > TOLERANCE_MM:
            return 0.0
        overlap = _range_overlap((a_start[0], a_end[0]), (b_start[0], b_end[0]))
        if overlap is None:
            return 0.0
        return abs(overlap[1] - overlap[0])
    if _is_vertical(a_start, a_end) and _is_vertical(b_start, b_end):
        if abs(a_start[0] - b_start[0]) > TOLERANCE_MM:
            return 0.0
        overlap = _range_overlap((a_start[1], a_end[1]), (b_start[1], b_end[1]))
        if overlap is None:
            return 0.0
        return abs(overlap[1] - overlap[0])
    return 0.0


def _point_on_segment(
    start: tuple[float, float],
    end: tuple[float, float],
    ratio: float,
) -> tuple[float, float]:
    return (
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
    )


def build_opening_completeness_check(
    *,
    affected_opening_ids: list[str],
    opening_plans: list[ExistingOpeningPlan],
) -> CompletenessCheck:
    covered_ids = {entry["global_id"] for entry in opening_plans}
    uncovered = [opening_id for opening_id in affected_opening_ids if opening_id not in covered_ids]
    return {
        "affected_openings_count": len(affected_opening_ids),
        "decisions_count": len(opening_plans),
        "uncovered_opening_ids": uncovered,
    }


def detect_opening_segment_conflicts(
    *,
    openings: Iterable[DoorContext | WindowContext],
    wall_by_id: dict[str, WallContext],
    candidate_walls: Iterable[WallPlan],
    floor: int,
) -> list[OpeningConflict]:
    conflicts: list[OpeningConflict] = []
    for opening in openings:
        if opening.get("floor") != floor:
            continue
        host_wall = wall_by_id.get(opening.get("host_wall_id"))
        if host_wall is None:
            continue
        opening_segment = _opening_world_segment(opening=opening, wall=host_wall)
        if opening_segment is None:
            continue
        for wall_plan in candidate_walls:
            wall_segment = (_as_point2(wall_plan["start_mm"]), _as_point2(wall_plan["end_mm"]))
            overlap_length_mm = _segments_overlap_length(wall_segment, opening_segment)
            if overlap_length_mm <= TOLERANCE_MM:
                continue
            conflicts.append(
                {
                    "opening_id": opening["id"],
                    "opening_type": "door" if "from_space_id" in opening else "window",
                    "wall_local_id": wall_plan["wall_local_id"],
                    "overlap_length_mm": overlap_length_mm,
                }
            )
    return conflicts
