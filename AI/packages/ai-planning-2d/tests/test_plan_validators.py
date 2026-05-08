from __future__ import annotations

from ai_planning_2d.schemas.validation import ValidationSeverity
from ai_planning_2d.validators.plan import validate_plan_v14

from _fixtures.synthetic import make_minimal_plan_v14


def test_validate_plan_v14_accepts_minimal_valid_fixture() -> None:
    issues = validate_plan_v14(make_minimal_plan_v14())

    assert issues == []


def test_validate_plan_v14_flags_missing_required_door() -> None:
    payload = make_minimal_plan_v14().model_dump()
    payload["space_plans"][0]["required_openings"]["door_satisfied_by_opening_local_ids"] = []
    plan = make_minimal_plan_v14().__class__(**payload)

    issues = validate_plan_v14(plan)

    assert any(issue.code == "space_missing_required_door" for issue in issues)


def test_validate_plan_v14_flags_opening_outside_wall_length() -> None:
    payload = make_minimal_plan_v14().model_dump()
    payload["final_openings"][0]["segment_along_wall_mm"] = (3900.0, 4500.0)
    plan = make_minimal_plan_v14().__class__(**payload)

    issues = validate_plan_v14(plan)

    assert any(issue.code == "opening_outside_host_wall_length" for issue in issues)


def test_validate_plan_v14_flags_unreachable_space() -> None:
    payload = make_minimal_plan_v14().model_dump()
    payload["space_plans"].append(
        {
            "local_id": "space-study",
            "global_id": None,
            "is_new": True,
            "source_space_id": None,
            "polygon_world_mm": [(0.0, 0.0), (1000.0, 0.0), (1000.0, 1000.0), (0.0, 1000.0)],
            "polygon_local_mm": [(0.0, 0.0), (1000.0, 0.0), (1000.0, 1000.0), (0.0, 1000.0)],
            "placement_world_mm": (0.0, 0.0),
            "name": "서재",
            "space_type": "office",
            "locked": False,
            "walls_bounding_local_ids": [],
            "openings_local_ids": [],
            "required_openings": {
                "needs_door_count": 0,
                "needs_window_count": 0,
                "door_satisfied_by_opening_local_ids": [],
                "window_satisfied_by_opening_local_ids": [],
            },
            "access_circulation": {
                "reachable_from_space_local_id": None,
                "via_opening_local_id": None,
            },
        }
    )
    plan = make_minimal_plan_v14().__class__(**payload)

    issues = validate_plan_v14(plan)

    assert any(issue.code == "space_unreachable_from_entrance" for issue in issues)
    assert any(issue.code == "space_unreachable_from_floor_entrance" for issue in issues)
    assert all(issue.severity == ValidationSeverity.ERROR for issue in issues)


def test_validate_plan_v14_flags_missing_circulation_source_space() -> None:
    payload = make_minimal_plan_v14().model_dump()
    payload["space_plans"].append(
        {
            "local_id": "space-study",
            "global_id": None,
            "is_new": True,
            "source_space_id": None,
            "polygon_world_mm": [(0.0, 0.0), (1000.0, 0.0), (1000.0, 1000.0), (0.0, 1000.0)],
            "polygon_local_mm": [(0.0, 0.0), (1000.0, 0.0), (1000.0, 1000.0), (0.0, 1000.0)],
            "placement_world_mm": (0.0, 0.0),
            "name": "스터디",
            "space_type": "office",
            "locked": False,
            "walls_bounding_local_ids": [],
            "openings_local_ids": [],
            "required_openings": {
                "needs_door_count": 0,
                "needs_window_count": 0,
                "door_satisfied_by_opening_local_ids": [],
                "window_satisfied_by_opening_local_ids": [],
            },
            "access_circulation": {
                "reachable_from_space_local_id": "missing-space",
                "via_opening_local_id": "door-1",
            },
        }
    )
    plan = make_minimal_plan_v14().__class__(**payload)

    issues = validate_plan_v14(plan)

    assert any(issue.code == "circulation_source_space_missing" for issue in issues)


def test_validate_plan_v14_flags_opening_that_does_not_link_target_space() -> None:
    payload = make_minimal_plan_v14().model_dump()
    payload["space_plans"].append(
        {
            "local_id": "space-study",
            "global_id": None,
            "is_new": True,
            "source_space_id": None,
            "polygon_world_mm": [(0.0, 0.0), (1000.0, 0.0), (1000.0, 1000.0), (0.0, 1000.0)],
            "polygon_local_mm": [(0.0, 0.0), (1000.0, 0.0), (1000.0, 1000.0), (0.0, 1000.0)],
            "placement_world_mm": (0.0, 0.0),
            "name": "스터디",
            "space_type": "office",
            "locked": False,
            "walls_bounding_local_ids": [],
            "openings_local_ids": ["door-1"],
            "required_openings": {
                "needs_door_count": 0,
                "needs_window_count": 0,
                "door_satisfied_by_opening_local_ids": [],
                "window_satisfied_by_opening_local_ids": [],
            },
            "access_circulation": {
                "reachable_from_space_local_id": "space-living",
                "via_opening_local_id": "door-1",
            },
        }
    )
    plan = make_minimal_plan_v14().__class__(**payload)

    issues = validate_plan_v14(plan)

    assert any(issue.code == "circulation_opening_missing_target_space_link" for issue in issues)
    assert any(issue.code == "space_unreachable_from_floor_entrance" for issue in issues)


def test_validate_plan_v14_flags_missing_circulation_opening_without_crashing() -> None:
    payload = make_minimal_plan_v14().model_dump()
    payload["space_plans"].append(
        {
            "local_id": "space-study",
            "global_id": None,
            "is_new": True,
            "source_space_id": None,
            "polygon_world_mm": [(0.0, 0.0), (1000.0, 0.0), (1000.0, 1000.0), (0.0, 1000.0)],
            "polygon_local_mm": [(0.0, 0.0), (1000.0, 0.0), (1000.0, 1000.0), (0.0, 1000.0)],
            "placement_world_mm": (0.0, 0.0),
            "name": "스터디",
            "space_type": "office",
            "locked": False,
            "walls_bounding_local_ids": ["wall-1"],
            "openings_local_ids": [],
            "required_openings": {
                "needs_door_count": 0,
                "needs_window_count": 0,
                "door_satisfied_by_opening_local_ids": [],
                "window_satisfied_by_opening_local_ids": [],
            },
            "access_circulation": {
                "reachable_from_space_local_id": "space-living",
                "via_opening_local_id": "missing-opening",
            },
        }
    )
    plan = make_minimal_plan_v14().__class__(**payload)

    issues = validate_plan_v14(plan)

    assert any(issue.code == "circulation_opening_missing" for issue in issues)


def test_validate_plan_v14_flags_perimeter_not_fully_covered() -> None:
    payload = make_minimal_plan_v14().model_dump()
    payload["space_plans"][0]["walls_bounding_local_ids"] = ["wall-1", "wall-2", "wall-3"]
    plan = make_minimal_plan_v14().__class__(**payload)

    issues = validate_plan_v14(plan)

    assert any(issue.code == "space_perimeter_not_fully_covered" for issue in issues)
