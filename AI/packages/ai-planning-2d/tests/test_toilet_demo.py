from pathlib import Path

from ai_planning_2d import extract_ifc_context
from ai_planning_2d.toilet_demo import (
    build_toilet_insertion_geometry_plan,
    build_opening_completeness_check,
    compute_circulation_reachability,
    detect_opening_segment_conflicts,
    find_exterior_contact_segments,
    plan_toilet_near_bathroom,
    shared_edge_length,
    validate_space_opening_closure,
)


def _space(
    space_id: str,
    name: str,
    space_type: str,
    floor: int,
    polygon: list[tuple[float, float]],
) -> dict:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return {
        "id": space_id,
        "name": name,
        "type": space_type,
        "floor": floor,
        "polygon": polygon,
        "width": int(max(xs) - min(xs)),
        "height": int(max(ys) - min(ys)),
        "x": min(xs),
        "y": min(ys),
        "angle": 0.0,
        "locked": False,
        "zone_id": None,
    }


def _ifc_context(
    *,
    spaces: list[dict],
    adjacency: list[dict],
    boundaries: list[dict],
    walls: list[dict] | None = None,
    doors: list[dict] | None = None,
    windows: list[dict] | None = None,
) -> dict:
    return {
        "spaces": spaces,
        "adjacency": adjacency,
        "walls": walls or [],
        "doors": doors or [],
        "windows": windows or [],
        "boundaries": boundaries,
        "storeys": [{"id": "st-001", "floor": 1, "elevation": 0.0}],
    }


def test_find_exterior_contact_segments_detects_shared_boundary_edge():
    outer = [(0.0, 0.0), (8000.0, 0.0), (8000.0, 6000.0), (0.0, 6000.0)]
    toilet = [(6000.0, 0.0), (8000.0, 0.0), (8000.0, 2000.0), (6000.0, 2000.0)]

    segments = find_exterior_contact_segments(toilet, outer)

    assert ((8000.0, 0.0), (8000.0, 2000.0)) in segments
    assert ((6000.0, 0.0), (8000.0, 0.0)) in segments


def test_build_toilet_insertion_geometry_plan_prefers_exterior_corridor_end():
    ctx = _ifc_context(
        spaces=[
            _space(
                "bath",
                "욕실",
                "bathroom",
                1,
                [(4040.0, 9700.0), (4040.0, 5990.0), (7410.0, 5990.0), (7410.0, 9700.0)],
            ),
            _space(
                "corridor",
                "복도",
                "corridor",
                1,
                [
                    (300.0, 4250.0),
                    (3800.0, 4250.0),
                    (3800.0, 4010.0),
                    (4695.0, 4010.0),
                    (7410.0, 4010.0),
                    (7410.0, 5750.0),
                    (300.0, 5750.0),
                ],
            ),
        ],
        adjacency=[{"space_a_id": "bath", "space_b_id": "corridor", "strength": 0.5}],
        boundaries=[
            {
                "floor": 1,
                "outer_polygon": [
                    (300.0, 300.0),
                    (4695.0, 300.0),
                    (11700.0, 300.0),
                    (11700.0, 4010.0),
                    (7410.0, 4010.0),
                    (7410.0, 5750.0),
                    (300.0, 5750.0),
                    (300.0, 4250.0),
                    (3800.0, 4250.0),
                    (3800.0, 4010.0),
                    (300.0, 4010.0),
                ],
                "holes": [],
            }
        ],
        walls=[
            {
                "id": "wall-north",
                "floor": 1,
                "start": (0.0, 5750.0),
                "end": (7410.0, 5750.0),
                "thickness": 200,
                "space_ids": ["bath", "corridor"],
                "kind": None,
            },
            {
                "id": "wall-east",
                "floor": 1,
                "start": (7410.0, 4250.0),
                "end": (7410.0, 10000.0),
                "thickness": 200,
                "space_ids": ["bath", "corridor"],
                "kind": None,
            },
        ],
    )

    plan = build_toilet_insertion_geometry_plan(ctx, floor=1)

    assert plan is not None
    assert plan["plan_schema_version"] == "v2"
    assert plan["donor_room_name"] == "복도"
    assert plan["storey_id"] == "st-001"
    assert plan["validation_errors"] == []
    assert plan["toilet_world_polygon_mm"] == [
        (6010.0, 4010.0),
        (7410.0, 4010.0),
        (7410.0, 5750.0),
        (6010.0, 5750.0),
    ]
    assert plan["toilet_local_origin_world_mm"] == (6010.0, 4010.0)
    assert plan["toilet_local_polygon_mm"] == [
        (0.0, 0.0),
        (1400.0, 0.0),
        (1400.0, 1740.0),
        (0.0, 1740.0),
    ]
    assert plan["toilet_locked"] is False
    assert plan["toilet_pset_updates"]["Shape"] == "poly"
    assert plan["bathroom_shared_edge_segment_mm"] == ((6010.0, 5750.0), (7410.0, 5750.0))
    assert plan["bathroom_adjacency_kind"] == "shared_wall_partition"
    assert plan["bathroom_partition_gap_mm"] == 240.0
    assert plan["door_plan"]["host_wall_local_id"] == "new-west-divider"
    assert plan["window_plan"]["host_wall_local_id"] == "new-east-exterior"
    assert plan["donor_walls_to_reuse"][0]["global_id"] == "wall-north"
    assert len(plan["donor_walls_to_reuse"]) == 1
    assert len(plan["space_plans"]) == 2
    assert {space["local_id"] for space in plan["space_plans"]} == {"corridor", "new-toilet"}
    assert len(plan["wall_plans"]) == 4
    assert {wall["wall_local_id"] for wall in plan["wall_plans"]} == {
        "reuse-north",
        "new-west-divider",
        "new-south",
        "new-east-exterior",
    }
    assert plan["door_plans"][0]["local_id"] == "toilet-door"
    assert plan["window_plans"][0]["local_id"] == "toilet-window"
    assert plan["bathroom_shared_edge_length_mm"] == 1400.0
    assert plan["existing_openings_plan"] == []
    assert plan["bedroom_quality_metrics"] is None
    assert plan["toilet_readability_metrics"]["dimensions_mm"] == (1400, 1740)
    assert plan["toilet_readability_metrics"]["aspect_ratio"] < 2.5
    assert plan["validation_errors"] == []
    assert plan["validation_warnings"] == ["entrance_not_detected"]
    assert plan["validation_issues"] == [
        {
            "code": "entrance_not_detected",
            "severity": "warning",
            "message": "entrance_not_detected",
        }
    ]


def test_build_toilet_insertion_geometry_plan_rejects_when_not_on_exterior_boundary():
    ctx = _ifc_context(
        spaces=[
            _space(
                "bath",
                "욕실",
                "bathroom",
                1,
                [(4000.0, 6000.0), (4000.0, 9000.0), (7000.0, 9000.0), (7000.0, 6000.0)],
            ),
            _space(
                "corridor",
                "복도",
                "corridor",
                1,
                [(3000.0, 4000.0), (6000.0, 4000.0), (6000.0, 5500.0), (3000.0, 5500.0)],
            ),
        ],
        adjacency=[{"space_a_id": "bath", "space_b_id": "corridor", "strength": 0.5}],
        boundaries=[
            {
                "floor": 1,
                "outer_polygon": [(0.0, 0.0), (10000.0, 0.0), (10000.0, 10000.0), (0.0, 10000.0)],
                "holes": [],
            }
        ],
        walls=[],
    )

    assert build_toilet_insertion_geometry_plan(ctx, floor=1) is None


def test_build_toilet_insertion_geometry_plan_rejects_below_min_corridor_clearance():
    ctx = _ifc_context(
        spaces=[
            _space(
                "bath",
                "욕실",
                "bathroom",
                1,
                [(5000.0, 5500.0), (5000.0, 8500.0), (7600.0, 8500.0), (7600.0, 5500.0)],
            ),
            _space(
                "corridor",
                "복도",
                "corridor",
                1,
                [(6200.0, 3500.0), (7600.0, 3500.0), (7600.0, 5500.0), (6200.0, 5500.0)],
            ),
        ],
        adjacency=[{"space_a_id": "bath", "space_b_id": "corridor", "strength": 0.5}],
        boundaries=[
            {
                "floor": 1,
                "outer_polygon": [(0.0, 0.0), (7600.0, 0.0), (7600.0, 9000.0), (0.0, 9000.0)],
                "holes": [],
            }
        ],
        walls=[
            {
                "id": "wall-north",
                "floor": 1,
                "start": (0.0, 5500.0),
                "end": (7600.0, 5500.0),
                "thickness": 200,
                "space_ids": ["bath", "corridor"],
                "kind": None,
            }
        ],
    )

    assert build_toilet_insertion_geometry_plan(ctx, floor=1) is None


def test_build_toilet_insertion_geometry_plan_classifies_shared_wall_partition():
    ctx = _ifc_context(
        spaces=[
            _space(
                "bath",
                "욕실",
                "bathroom",
                1,
                [(5000.0, 5800.0), (5000.0, 9000.0), (7600.0, 9000.0), (7600.0, 5800.0)],
            ),
            _space(
                "corridor",
                "복도",
                "corridor",
                1,
                [(3000.0, 4000.0), (7600.0, 4000.0), (7600.0, 5600.0), (3000.0, 5600.0)],
            ),
        ],
        adjacency=[{"space_a_id": "bath", "space_b_id": "corridor", "strength": 0.5}],
        boundaries=[
            {
                "floor": 1,
                "outer_polygon": [(0.0, 0.0), (7600.0, 0.0), (7600.0, 10000.0), (0.0, 10000.0)],
                "holes": [],
            }
        ],
        walls=[
            {
                "id": "wall-north",
                "floor": 1,
                "start": (0.0, 5600.0),
                "end": (7600.0, 5600.0),
                "thickness": 200,
                "space_ids": ["bath", "corridor"],
                "kind": None,
            }
        ],
    )

    plan = build_toilet_insertion_geometry_plan(ctx, floor=1)

    assert plan is not None
    assert plan["bathroom_adjacency_kind"] == "shared_wall_partition"
    assert plan["bathroom_partition_gap_mm"] == 200.0
    assert plan["bathroom_shared_edge_segment_mm"] == ((6200.0, 5600.0), (7600.0, 5600.0))
    assert plan["bathroom_shared_edge_length_mm"] == 1400.0


def test_house_kr_toilet_plan_touches_exterior_and_bathroom():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))

    plan = plan_toilet_near_bathroom(ctx, floor=1)

    assert plan is not None
    bathroom_polygon = next(
        space["polygon"] for space in ctx["spaces"] if space["id"] == plan["anchor_room_id"]
    )
    donor_polygon = next(
        space["polygon"] for space in ctx["spaces"] if space["id"] == plan["donor_room_id"]
    )
    donor_max_y = max(point[1] for point in donor_polygon)
    assert plan["strategy"] == "bathroom_edge"
    assert plan["donor_room_name"] == "욕실"
    assert plan["exterior_wall_segment_mm"][0][1] == donor_max_y
    assert plan["exterior_wall_segment_mm"][1][1] == donor_max_y
    assert shared_edge_length(plan["toilet_world_polygon_mm"], bathroom_polygon) > 0.0
    assert plan["bathroom_shared_edge_segment_mm"] is not None
    assert plan["space_plans"][1]["name"] == "복도"
    assert plan["space_plans"][1]["storey_id"] == plan["storey_id"]
    assert plan["donor_strategy_used"] == "bathroom_edge_full"
    assert plan["door_plan"]["host_wall_local_id"] == "reuse-south-toilet-corridor"
    assert plan["window_plan"]["host_wall_local_id"] == "reuse-north-toilet-exterior"
    assert plan["bathroom_shared_edge_length_mm"] > 0.0
    assert plan["bedroom_quality_metrics"] is None
    assert plan["toilet_readability_metrics"]["dimensions_mm"] == (1500, 3710)
    assert plan["toilet_readability_metrics"]["aspect_ratio"] < 2.5


def test_no_bathroom_house_kr_prefers_public_corridor_toilet():
    fixture = Path(__file__).resolve().parents[3] / "scripts" / "House_KR_nobathroom.ifc"
    ctx = extract_ifc_context(str(fixture))

    floor1_window_ids = {window["id"] for window in ctx["windows"] if window["floor"] == 1}
    assert {"1TAI4ouKX4Xx4lBDZIu5qM", "1DiYqhfzH9xxuJdVHwXCNa"} <= floor1_window_ids

    plan = build_toilet_insertion_geometry_plan(ctx, floor=1)

    assert plan is not None
    assert plan["strategy"] == "corridor_end"
    assert plan["anchor_room_name"] is None
    assert plan["donor_room_name"] == "Big Room"
    assert plan["toilet_world_polygon_mm"] == [
        (6010.0, 5990.0),
        (7410.0, 5990.0),
        (7410.0, 9700.0),
        (6010.0, 9700.0),
    ]
    assert plan["door_plan"]["host_wall_local_id"] == "new-south-toilet-corridor"
    assert plan["window_plan"]["host_wall_local_id"] == "reuse-north-toilet-exterior"
    assert plan["bathroom_adjacency_kind"] == "none"
    assert plan["status"] == "planned"
    assert plan["user_intent"] == "shared_toilet_any_strategy"
    assert plan["split_remainder_room_name"] == "서재"
    assert plan["split_remainder_room_type"] == "office"
    assert plan["split_operation"] == {
        "source_space_id": "2RSCzLOBz4FAK$_wE8VckM",
        "resulting_space_local_ids": ["2RSCzLOBz4FAK$_wE8VckM", "new-toilet"],
    }
    assert plan["completeness_check"]["uncovered_opening_ids"] == []
    assert "split_remainder_missing_door" not in plan["validation_errors"]
    assert "split_remainder_missing_window" not in plan["validation_errors"]
    remainder_plan = next(
        space for space in plan["space_plans"] if space["local_id"] == plan["donor_room_id"]
    )
    toilet_plan = next(space for space in plan["space_plans"] if space["local_id"] == "new-toilet")
    assert remainder_plan["required_openings"]["door_satisfied_by_opening_local_ids"]
    assert remainder_plan["required_openings"]["window_satisfied_by_opening_local_ids"]
    assert (
        toilet_plan["required_openings"]["door_satisfied_by_opening_local_ids"]
        == ["toilet-door"]
    )
    assert (
        toilet_plan["required_openings"]["window_satisfied_by_opening_local_ids"]
        == ["toilet-window"]
    )
    assert remainder_plan["required_openings"]["door_satisfied_by_opening_local_ids"] == [
        "study-door"
    ]
    assert remainder_plan["required_openings"]["window_satisfied_by_opening_local_ids"] == [
        "existing:1TAI4ouKX4Xx4lBDZIu5qM"
    ]
    assert {"study-door", "toilet-door"} == {
        door_plan["local_id"] for door_plan in plan["door_plans"]
    }
    assert {"toilet-window"} == {
        window_plan["local_id"] for window_plan in plan["window_plans"]
    }
    assert compute_circulation_reachability(space_plans=plan["space_plans"]) == {
        "2RSCzLOBz4FAK$_wE8VckM": True,
        "new-toilet": True,
    }
    assert validate_space_opening_closure(plan) == []


def test_no_bathroom_house_kr_big_room_intent_is_preserved():
    fixture = Path(__file__).resolve().parents[3] / "scripts" / "House_KR_nobathroom.ifc"
    ctx = extract_ifc_context(str(fixture))

    plan = build_toilet_insertion_geometry_plan(
        ctx,
        floor=1,
        user_intent="shared_toilet_split_big_room",
    )

    assert plan is not None
    assert plan["status"] == "planned"
    assert plan["user_intent"] == "shared_toilet_split_big_room"
    assert plan["donor_room_name"] == "Big Room"
    assert validate_space_opening_closure(plan) == []


def test_public_corridor_carve_intent_rejects_when_strategy_is_big_room_only():
    fixture = Path(__file__).resolve().parents[3] / "scripts" / "House_KR_nobathroom.ifc"
    ctx = extract_ifc_context(str(fixture))

    plan = build_toilet_insertion_geometry_plan(
        ctx,
        floor=1,
        user_intent="shared_toilet_corridor_carve",
    )

    assert plan is not None
    assert plan["status"] == "rejected"
    assert plan["validation_errors"] == ["requested_strategy_not_supported"]


def test_build_opening_completeness_check_reports_uncovered_ids():
    completeness = build_opening_completeness_check(
        affected_opening_ids=["door-1", "window-2"],
        opening_plans=[
            {
                "global_id": "door-1",
                "opening_type": "door",
                "host_wall_id": "wall-a",
                "decision": "remove",
                "reason": "conflict",
                "new_host_wall_local_id": None,
                "new_segment_along_wall_mm": None,
                "new_width_mm": None,
                "new_height_mm": None,
                "new_sill_height_mm": None,
                "swing_in_space_local_id": None,
                "opens_toward_space_local_id": None,
                "swing_clearance_radius_mm": None,
                "replaces_with_new_opening_local_id": None,
                "inherits_size_from_opening_id": None,
            }
        ],
    )

    assert completeness["affected_openings_count"] == 2
    assert completeness["decisions_count"] == 1
    assert completeness["uncovered_opening_ids"] == ["window-2"]


def test_detect_opening_segment_conflicts_flags_new_partition_crossing_existing_window():
    conflicts = detect_opening_segment_conflicts(
        openings=[
            {
                "id": "window-1",
                "floor": 1,
                "host_wall_id": "wall-north",
                "adjacent_space_id": "room-a",
                "width": 1200,
                "height": 900,
                "sill_height": 1000,
                "position": 2500,
            }
        ],
        wall_by_id={
            "wall-north": {
                "id": "wall-north",
                "floor": 1,
                "start": (0.0, 0.0),
                "end": (5000.0, 0.0),
                "thickness": 200,
                "space_ids": ["room-a"],
                "kind": "EXTERIOR",
            }
        },
        candidate_walls=[
            {
                "wall_local_id": "new-partition",
                "source": "new",
                "global_id": None,
                "start_mm": (2000.0, 0.0),
                "end_mm": (3200.0, 0.0),
                "thickness_mm": 200,
                "kind": "INTERIOR",
                "bounded_room_ids": ["room-a", "new-toilet"],
                "hosts": [],
            }
        ],
        floor=1,
    )

    assert len(conflicts) == 1
    assert conflicts[0]["opening_id"] == "window-1"
    assert conflicts[0]["wall_local_id"] == "new-partition"
