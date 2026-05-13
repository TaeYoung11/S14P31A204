"""Compatibility wrapper for the toilet planner."""

from __future__ import annotations

from .toilet_planner.planner import build_toilet_insertion_geometry_plan
from .toilet_planner.types import ToiletInsertionPlan, UserIntent

__all__ = [
    "ToiletInsertionPlan",
    "UserIntent",
    "build_toilet_insertion_geometry_plan",
]
