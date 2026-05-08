from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_planning_2d.schemas.plan_v14 import PLAN_SCHEMA_VERSION, PlanV14
from ai_planning_2d.validators.geometry import polygon_bounds_mm, polygon_perimeter_mm

from _fixtures.synthetic import make_minimal_plan_v14


def test_plan_v14_minimal_fixture_is_valid() -> None:
    plan = make_minimal_plan_v14()

    assert isinstance(plan, PlanV14)
    assert plan.plan_schema_version == PLAN_SCHEMA_VERSION
    assert plan.space_plans[0].required_openings.needs_door_count == 1


def test_plan_v14_rejects_wrong_schema_version() -> None:
    payload = make_minimal_plan_v14().model_dump()
    payload["plan_schema_version"] = "v13"

    with pytest.raises(ValidationError):
        PlanV14(**payload)


def test_opening_plan_rejects_non_increasing_segment() -> None:
    payload = make_minimal_plan_v14().model_dump()
    payload["final_openings"][0]["segment_along_wall_mm"] = (2100.0, 1200.0)

    with pytest.raises(ValidationError):
        PlanV14(**payload)


def test_geometry_helpers_compute_bounds_and_perimeter() -> None:
    polygon = [(0.0, 0.0), (4000.0, 0.0), (4000.0, 3000.0), (0.0, 3000.0)]

    assert polygon_bounds_mm(polygon) == (0.0, 0.0, 4000.0, 3000.0)
    assert polygon_perimeter_mm(polygon) == 14000.0
