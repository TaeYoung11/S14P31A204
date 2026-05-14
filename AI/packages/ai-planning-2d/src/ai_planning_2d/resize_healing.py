"""Compatibility wrapper for resize healing helpers."""

from __future__ import annotations

from .healing.resize import WallSegmentPlan, build_isolated_rectangular_resize_wall_plans

__all__ = ["WallSegmentPlan", "build_isolated_rectangular_resize_wall_plans"]
