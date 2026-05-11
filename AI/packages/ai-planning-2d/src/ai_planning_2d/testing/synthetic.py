from __future__ import annotations

from ai_planning_2d.schemas.ifc_context import IFCContext
from ai_planning_2d.schemas.plan_v14 import (
    PLAN_SCHEMA_VERSION,
    AccessCirculation,
    OpeningPlan,
    PlanV14,
    RequiredOpenings,
    SpacePlan,
    WallPlan,
)
from ai_planning_2d.schemas.validation import PlanStatus


def make_minimal_ifc_context() -> IFCContext:
    return {
        "spaces": [
            {
                "id": "space-1",
                "name": "嫄곗떎",
                "type": "living",
                "floor": 1,
                "polygon": [(0.0, 0.0), (4000.0, 0.0), (4000.0, 3000.0), (0.0, 3000.0)],
                "width": 4000,
                "height": 3000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            }
        ],
        "adjacency": [],
        "walls": [
            {
                "id": "wall-1",
                "floor": 1,
                "start": (0.0, 0.0),
                "end": (4000.0, 0.0),
                "thickness": 150,
                "space_ids": ["space-1"],
                "kind": "EXTERIOR",
            },
            {
                "id": "wall-2",
                "floor": 1,
                "start": (4000.0, 0.0),
                "end": (4000.0, 3000.0),
                "thickness": 150,
                "space_ids": ["space-1"],
                "kind": "EXTERIOR",
            },
            {
                "id": "wall-3",
                "floor": 1,
                "start": (4000.0, 3000.0),
                "end": (0.0, 3000.0),
                "thickness": 150,
                "space_ids": ["space-1"],
                "kind": "EXTERIOR",
            },
            {
                "id": "wall-4",
                "floor": 1,
                "start": (0.0, 3000.0),
                "end": (0.0, 0.0),
                "thickness": 150,
                "space_ids": ["space-1"],
                "kind": "EXTERIOR",
            },
        ],
        "openings": [
            {
                "id": "opening-1",
                "floor": 1,
                "host_wall_id": "wall-1",
                "filled_by_id": "door-1",
                "filled_by_kind": "door",
            }
        ],
        "doors": [
            {
                "id": "door-1",
                "floor": 1,
                "host_wall_id": "wall-1",
                "from_space_id": None,
                "to_space_id": "space-1",
                "width": 900,
                "height": 2100,
                "position": 1600,
                "opening_type": "door",
                "swing_into_id": "space-1",
                "hinge_side": "left",
            }
        ],
        "windows": [],
        "boundaries": [
            {
                "floor": 1,
                "outer_polygon": [
                    (0.0, 0.0),
                    (4000.0, 0.0),
                    (4000.0, 3000.0),
                    (0.0, 3000.0),
                ],
                "holes": [],
            }
        ],
        "storeys": [{"id": "storey-1", "floor": 1, "elevation": 0.0}],
    }


def make_minimal_plan_v14() -> PlanV14:
    return PlanV14(
        plan_schema_version=PLAN_SCHEMA_VERSION,
        plan_status=PlanStatus.PLANNED,
        storey_id="storey-1",
        floor_entrance_space_id="space-living",
        house_kr_fingerprint_match=False,
        affected_zone_polygon_mm=[
            (0.0, 0.0),
            (4000.0, 0.0),
            (4000.0, 3000.0),
            (0.0, 3000.0),
        ],
        space_plans=[
            SpacePlan(
                local_id="space-living",
                global_id=None,
                is_new=True,
                source_space_id=None,
                polygon_world_mm=[
                    (0.0, 0.0),
                    (4000.0, 0.0),
                    (4000.0, 3000.0),
                    (0.0, 3000.0),
                ],
                polygon_local_mm=[
                    (0.0, 0.0),
                    (4000.0, 0.0),
                    (4000.0, 3000.0),
                    (0.0, 3000.0),
                ],
                placement_world_mm=(0.0, 0.0),
                name="嫄곗떎",
                space_type="living",
                walls_bounding_local_ids=["wall-1", "wall-2", "wall-3", "wall-4"],
                openings_local_ids=["door-1"],
                required_openings=RequiredOpenings(
                    needs_door_count=1,
                    needs_window_count=0,
                    door_satisfied_by_opening_local_ids=["door-1"],
                    window_satisfied_by_opening_local_ids=[],
                ),
                access_circulation=AccessCirculation(
                    reachable_from_space_local_id=None,
                    via_opening_local_id=None,
                ),
            )
        ],
        final_walls=[
            WallPlan(
                local_id="wall-1",
                kind="EXTERIOR",
                start_mm=(0.0, 0.0),
                end_mm=(4000.0, 0.0),
                thickness_mm=150,
                bounded_space_local_ids=["space-living"],
                hosts_opening_local_ids=["door-1"],
                representation_template_global_id="template-wall-1",
            ),
            WallPlan(
                local_id="wall-2",
                kind="EXTERIOR",
                start_mm=(4000.0, 0.0),
                end_mm=(4000.0, 3000.0),
                thickness_mm=150,
                bounded_space_local_ids=["space-living"],
                hosts_opening_local_ids=[],
                representation_template_global_id="template-wall-2",
            ),
            WallPlan(
                local_id="wall-3",
                kind="EXTERIOR",
                start_mm=(4000.0, 3000.0),
                end_mm=(0.0, 3000.0),
                thickness_mm=150,
                bounded_space_local_ids=["space-living"],
                hosts_opening_local_ids=[],
                representation_template_global_id="template-wall-3",
            ),
            WallPlan(
                local_id="wall-4",
                kind="EXTERIOR",
                start_mm=(0.0, 3000.0),
                end_mm=(0.0, 0.0),
                thickness_mm=150,
                bounded_space_local_ids=["space-living"],
                hosts_opening_local_ids=[],
                representation_template_global_id="template-wall-4",
            ),
        ],
        final_openings=[
            OpeningPlan(
                local_id="door-1",
                opening_kind="door",
                host_wall_local_id="wall-1",
                segment_along_wall_mm=(1200.0, 2100.0),
                width_mm=900,
                height_mm=2100,
                sill_height_mm=0,
                swing_in_space_local_id="space-living",
                opens_toward_space_local_id="space-living",
                operation_type="SINGLE_SWING_LEFT",
                serves_door_requirement_of_space_local_id="space-living",
                serves_window_requirement_of_space_local_id=None,
                representation_template_global_id="template-door-1",
            )
        ],
        validation_issues=[],
        validation_warnings=[],
        representation_templates_used={
            "wall-1": "template-wall-1",
            "wall-2": "template-wall-2",
            "wall-3": "template-wall-3",
            "wall-4": "template-wall-4",
            "door-1": "template-door-1",
        },
    )
