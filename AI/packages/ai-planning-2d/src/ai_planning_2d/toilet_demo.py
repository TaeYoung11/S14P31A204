"""Compatibility wrapper for the toilet planner."""

from __future__ import annotations

from .toilet_planner.openings import (
    build_opening_completeness_check,
    detect_opening_segment_conflicts,
)
from .toilet_planner.planner import (
    build_toilet_insertion_geometry_plan,
    compute_circulation_reachability,
    find_exterior_contact_segments,
    plan_toilet_near_bathroom,
    shared_edge_length,
    validate_space_opening_closure,
)
from .toilet_planner.types import ToiletInsertionPlan, UserIntent

__all__ = [
    "ToiletInsertionPlan",
    "UserIntent",
    "build_toilet_insertion_geometry_plan",
    "build_opening_completeness_check",
    "compute_circulation_reachability",
    "detect_opening_segment_conflicts",
    "find_exterior_contact_segments",
    "plan_toilet_near_bathroom",
    "shared_edge_length",
    "validate_space_opening_closure",
]
