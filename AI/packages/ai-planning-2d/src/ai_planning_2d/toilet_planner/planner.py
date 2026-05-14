"""화장실 데모 시나리오에서 사용하는 전용 배치와 계획 보조 로직을 모아둔다."""

from __future__ import annotations

from typing import Any, Literal, TypedDict, cast

from shapely import contains as shapely_contains, union_all as shapely_union_all  # type: ignore[import-untyped]
from shapely.geometry import LineString, Point, Polygon  # type: ignore[import-untyped]

from ..command import (
    BoundaryContext,
    DoorContext,
    IFCContext,
    SpaceContext,
    StoreyContext,
    WallContext,
    WindowContext,
)
from ..critique import find_bathroom_anchor
from .geometry import (
    _as_point2,
    _bbox,
    _candidate_sort_key,
    _closed_polygon,
    _dedupe_segments,
    _donor_priority,
    _find_existing_wall_for_segment,
    _find_nearby_wall_for_segment,
    _is_horizontal,
    _is_vertical,
    _polygon_edges,
    _polygon_from_shape,
    _range_overlap,
    _segment_length,
    _select_primary_exterior_segment,
    _shrink_polygon_right_edge,
    _world_to_local_polygon,
)
from .openings import (
    _classify_existing_openings_plan,
    build_opening_completeness_check,
    detect_opening_segment_conflicts,
)
from .validation import (
    _build_bedroom_quality_metrics,
    _build_toilet_readability_metrics,
    _build_validation_issues,
    _is_bedroom_shape_acceptable,
    _validate_space_minimums,
)

TOILET_NAME = "화장실"
PLAN_SCHEMA_VERSION = "v2"
TOLERANCE_MM = 5.0
BATHROOM_NEAR_GAP_MM = 300.0
MIN_CORRIDOR_CLEARANCE_MM = 900
MIN_ROOM_WIDTH_MM = 2400
MIN_BEDROOM_INSCRIBED_WIDTH_MM = 2700
MIN_BEDROOM_INSCRIBED_DEPTH_MM = 2400
MIN_BEDROOM_BBOX_FILL_RATIO = 0.88
MIN_TOILET_WIDTH_MM = 900
MIN_TOILET_DEPTH_MM = 1200
MIN_TOILET_DOOR_WIDTH_MM = 700
MIN_TOILET_WINDOW_WIDTH_MM = 400
MAX_TOILET_ASPECT_RATIO = 2.5
DEFAULT_TOILET_WIDTH_MM = 1400
DEFAULT_TOILET_DEPTH_MM = 1740
DONOR_TYPE_PRIORITY: tuple[str, ...] = ("corridor", "bedroom", "office", "living", "kitchen")
ENTRANCE_KEYWORDS = ("현관", "현관문", "entrance", "front")
MIN_ROOM_AREA_BY_TYPE_MM2: dict[str, int] = {
    "bedroom": 8_000_000,
    "living": 14_000_000,
    "kitchen": 6_000_000,
    "office": 6_000_000,
}


class ValidationIssue(TypedDict):
    code: str
    severity: Literal["error", "warning"]
    message: str


PlanStatus = Literal["planned", "needs_clarification", "rejected"]
UserIntent = Literal[
    "shared_toilet_any_strategy",
    "shared_toilet_split_big_room",
    "shared_toilet_corridor_carve",
]


class SpacePsetUpdates(TypedDict, total=False):
    Width: int
    Height: int
    Shape: Literal["rect", "L", "U", "poly"]
    Rects: str | None
    SpaceType: str
    Locked: bool


class SpaceOpeningRequirements(TypedDict):
    needs_door_count: int
    needs_window_count: int
    door_satisfied_by_opening_local_ids: list[str]
    window_satisfied_by_opening_local_ids: list[str]


class AccessCirculationPlan(TypedDict):
    reachable_from_space_local_id: str | None
    via_door_opening_local_id: str | None


class SplitOperation(TypedDict):
    source_space_id: str
    resulting_space_local_ids: list[str]


class SpacePlan(TypedDict, total=False):
    local_id: str
    global_id: str | None
    name: str
    space_type: str
    locked: bool
    storey_id: str
    polygon_world_mm: list[tuple[float, float]]
    polygon_local_mm: list[tuple[float, float]]
    placement_world_mm: tuple[float, float]
    pset_updates: SpacePsetUpdates
    walls_bounding: list[str]
    is_new: bool
    source_space_id: str | None
    required_openings: SpaceOpeningRequirements
    access_circulation: AccessCirculationPlan


class WallPlan(TypedDict):
    wall_local_id: str
    source: Literal["new", "existing"]
    global_id: str | None
    start_mm: tuple[float, float]
    end_mm: tuple[float, float]
    thickness_mm: int
    kind: Literal["INTERIOR", "EXTERIOR"]
    bounded_room_ids: list[str]
    hosts: list[str]


class DoorPlan(TypedDict):
    local_id: str
    host_wall_local_id: str
    segment_along_wall_mm: tuple[float, float]
    width_mm: int
    height_mm: int
    swing_in_space_id: str
    opens_toward_space_id: str
    swing_clearance_radius_mm: int


class WindowPlan(TypedDict):
    local_id: str
    host_wall_local_id: str
    segment_along_wall_mm: tuple[float, float]
    width_mm: int
    height_mm: int
    sill_height_mm: int
    inherits_size_from_opening_id: str | None


class OpeningRelocationPlan(TypedDict):
    global_id: str
    new_host_wall_local_id: str
    new_segment_along_wall_mm: tuple[float, float]


class ExistingOpeningPlan(TypedDict):
    global_id: str
    opening_type: Literal["door", "window"]
    host_wall_id: str | None
    decision: Literal[
        "keep_in_original_space",
        "keep_with_boundary_change",
        "relocate",
        "remove",
        "replace_with_new",
    ]
    reason: str
    new_host_wall_local_id: str | None
    new_segment_along_wall_mm: tuple[float, float] | None
    new_width_mm: int | None
    new_height_mm: int | None
    new_sill_height_mm: int | None
    swing_in_space_local_id: str | None
    opens_toward_space_local_id: str | None
    swing_clearance_radius_mm: int | None
    replaces_with_new_opening_local_id: str | None
    inherits_size_from_opening_id: str | None


class CompletenessCheck(TypedDict):
    affected_openings_count: int
    decisions_count: int
    uncovered_opening_ids: list[str]


class OpeningConflict(TypedDict):
    opening_id: str
    opening_type: Literal["door", "window"]
    wall_local_id: str
    overlap_length_mm: float


class BedroomQualityMetrics(TypedDict):
    area_before_mm2: float
    area_after_mm2: float
    bbox_fill_ratio_after: float
    largest_inscribed_rect_after_mm: tuple[int, int]


class ToiletReadabilityMetrics(TypedDict):
    dimensions_mm: tuple[int, int]
    aspect_ratio: float
    exterior_contact_length_mm: float
    interior_contact_length_mm: float
    perimeter_coverage_ratio: float


class ToiletInsertionPlan(TypedDict):
    plan_schema_version: Literal["v2"]
    status: PlanStatus
    user_intent: UserIntent
    floor: int
    storey_id: str
    strategy: Literal["corridor_end", "bedroom_edge", "bathroom_edge"]
    anchor_room_id: str | None
    anchor_room_name: str | None
    donor_room_id: str
    donor_room_name: str
    donor_room_type: str
    donor_strategy_used: Literal[
        "corridor_end", "bedroom_edge_full", "bedroom_edge_partial", "bathroom_edge_full"
    ]
    toilet_name: Literal["화장실"]
    toilet_space_type: Literal["bathroom"]
    toilet_locked: bool
    preferred_width_mm: int
    preferred_height_mm: int
    toilet_world_polygon_mm: list[tuple[float, float]]
    toilet_local_origin_world_mm: tuple[float, float]
    toilet_local_polygon_mm: list[tuple[float, float]]
    toilet_pset_updates: SpacePsetUpdates
    donor_polygon_before_world_mm: list[tuple[float, float]]
    donor_polygon_after_world_mm: list[tuple[float, float]]
    bathroom_adjacency_kind: Literal["shared_edge", "shared_wall_partition", "none"]
    bathroom_shared_edge_length_mm: float
    bathroom_shared_edge_segment_mm: tuple[tuple[float, float], tuple[float, float]] | None
    bathroom_partition_gap_mm: float | None
    bathroom_indirect_adjacency_via_donor: bool
    exterior_wall_segment_mm: tuple[tuple[float, float], tuple[float, float]]
    interior_door_wall_segment_mm: tuple[tuple[float, float], tuple[float, float]]
    donor_remaining_min_clearance_mm: int
    donor_existing_doors_inside_toilet_polygon: list[str]
    donor_existing_windows_inside_toilet_polygon: list[str]
    donor_reachability_after_carve: bool
    entrance_segments_mm: list[tuple[tuple[float, float], tuple[float, float]]]
    affected_space_ids: list[str]
    untouched_space_ids: list[str]
    required_new_walls: list[WallPlan]
    donor_walls_to_reuse: list[WallPlan]
    donor_walls_to_split: list[dict[str, object]]
    donor_walls_to_delete: list[str]
    space_plans: list[SpacePlan]
    wall_plans: list[WallPlan]
    door_plan: DoorPlan
    door_plans: list[DoorPlan]
    window_plan: WindowPlan
    window_plans: list[WindowPlan]
    existing_openings_to_remove: list[str]
    existing_openings_to_relocate: list[OpeningRelocationPlan]
    existing_openings_plan: list[ExistingOpeningPlan]
    forbidden_existing_openings: list[str]
    bedroom_quality_metrics: BedroomQualityMetrics | None
    toilet_readability_metrics: ToiletReadabilityMetrics
    validation_errors: list[str]
    validation_warnings: list[str]
    validation_issues: list[ValidationIssue]
    clarification_questions: list[str]
    completeness_check: CompletenessCheck
    split_remainder_room_name: str | None
    split_remainder_room_type: str | None
    split_operation: SplitOperation | None
    score: float


class SpaceOpeningClosurePlan(TypedDict):
    space_plans: list[SpacePlan]
    door_plans: list[DoorPlan]
    window_plans: list[WindowPlan]


def build_toilet_insertion_geometry_plan(
    ifc_context: IFCContext,
    floor: int,
    *,
    anchor_room_name: str | None = None,
    user_intent: UserIntent = "shared_toilet_any_strategy",
    preferred_width_mm: int = DEFAULT_TOILET_WIDTH_MM,
    preferred_height_mm: int = DEFAULT_TOILET_DEPTH_MM,
) -> ToiletInsertionPlan | None:
    return plan_toilet_near_bathroom(
        ifc_context,
        floor,
        anchor_room_name=anchor_room_name,
        user_intent=user_intent,
        preferred_width_mm=preferred_width_mm,
        preferred_height_mm=preferred_height_mm,
    )


def plan_toilet_near_bathroom(
    ifc_context: IFCContext,
    floor: int,
    *,
    anchor_room_name: str | None = None,
    user_intent: UserIntent = "shared_toilet_any_strategy",
    preferred_width_mm: int = DEFAULT_TOILET_WIDTH_MM,
    preferred_height_mm: int = DEFAULT_TOILET_DEPTH_MM,
) -> ToiletInsertionPlan | None:
    spaces = [space for space in ifc_context.get("spaces", []) if space.get("floor") == floor]
    if not spaces:
        return None
    storey = _find_storey(ifc_context.get("storeys", []), floor)
    if storey is None:
        return None
    anchor = _resolve_anchor_bathroom(spaces, anchor_room_name=anchor_room_name)
    if anchor is None:
        return _plan_public_toilet_with_intent(
            ifc_context=ifc_context,
            floor=floor,
            user_intent=user_intent,
            preferred_width_mm=preferred_width_mm,
            preferred_height_mm=preferred_height_mm,
        )
    if anchor is None:
        return None
    boundary = _resolve_floor_boundary(
        ifc_context=ifc_context,
        floor=floor,
        anchor=anchor,
    )
    if boundary is None:
        return None

    bathroom_edge_candidate = _build_bathroom_edge_candidate(
        ifc_context=ifc_context,
        floor=floor,
        anchor=anchor,
        boundary=boundary,
        preferred_width_mm=preferred_width_mm,
        preferred_height_mm=preferred_height_mm,
    )
    if bathroom_edge_candidate is not None:
        return bathroom_edge_candidate

    candidates = enumerate_carve_candidates(
        ifc_context=ifc_context,
        floor=floor,
        anchor=anchor,
        boundary=boundary,
        preferred_width_mm=preferred_width_mm,
        preferred_height_mm=preferred_height_mm,
    )
    if not candidates:
        return None
    candidates.sort(key=_candidate_sort_key)
    return candidates[0]


def _plan_public_toilet_with_intent(
    *,
    ifc_context: IFCContext,
    floor: int,
    user_intent: UserIntent,
    preferred_width_mm: int,
    preferred_height_mm: int,
) -> ToiletInsertionPlan | None:
    base_plan = _build_public_corridor_candidate(
        ifc_context=ifc_context,
        floor=floor,
        user_intent=user_intent,
        preferred_width_mm=preferred_width_mm,
        preferred_height_mm=preferred_height_mm,
    )
    if base_plan is None:
        return None
    if base_plan["status"] == "rejected":
        return base_plan

    east_plan = _build_public_big_room_east_candidate(
        ifc_context=ifc_context,
        floor=floor,
        preferred_width_mm=preferred_width_mm,
        preferred_height_mm=preferred_height_mm,
    )
    if east_plan is None:
        return base_plan
    candidates = [base_plan, east_plan]
    candidates.sort(key=_public_candidate_sort_key)
    top, second = candidates[0], candidates[1]
    if user_intent == "shared_toilet_split_big_room":
        top["user_intent"] = user_intent
        return top
    if top["status"] == "planned" and second["status"] == "planned":
        top_score_value = top.get("score", 0.0)
        second_score_value = second.get("score", 0.0)
        top_score = (
            float(top_score_value) if isinstance(top_score_value, int | float) else 0.0
        )
        second_score = (
            float(second_score_value)
            if isinstance(second_score_value, int | float)
            else 0.0
        )
        if abs(top_score - second_score) < 5.0:
            top["status"] = "needs_clarification"
            top["clarification_questions"] = [
                "큰 방을 어느 쪽에서 나눠 공용 화장실을 만들지 확인이 필요합니다."
            ]
    top["user_intent"] = user_intent
    return top


def _build_public_corridor_candidate(
    *,
    ifc_context: IFCContext,
    floor: int,
    user_intent: UserIntent,
    preferred_width_mm: int,
    preferred_height_mm: int,
) -> ToiletInsertionPlan | None:
    if user_intent == "shared_toilet_corridor_carve":
        return _build_rejected_public_toilet_plan(
            floor=floor,
            reason="requested_strategy_not_supported",
            message="House_KR_nobathroom 데모에서는 현재 큰 방 분할 공용 화장실만 지원합니다.",
        )
    spaces = [space for space in ifc_context.get("spaces", []) if space.get("floor") == floor]
    donor = next((space for space in spaces if space.get("name") == "Big Room"), None)
    corridor = next((space for space in spaces if space.get("type") == "corridor"), None)
    if donor is None or corridor is None or not donor.get("polygon") or not corridor.get("polygon"):
        return None

    boundary = _resolve_floor_boundary(ifc_context=ifc_context, floor=floor, anchor=donor)
    if boundary is None:
        return None

    storey = _find_storey(ifc_context.get("storeys", []), floor)
    if storey is None:
        return None

    donor_polygon = donor["polygon"]
    donor_bbox = _bbox(donor_polygon)
    corridor_bbox = _bbox(corridor["polygon"])
    toilet_width = max(preferred_width_mm, 1800)
    toilet_min_x = donor_bbox[0]
    toilet_max_x = min(donor_bbox[2], donor_bbox[0] + toilet_width)
    toilet_min_y = donor_bbox[1]
    toilet_max_y = donor_bbox[3]
    if toilet_max_x - toilet_min_x < MIN_TOILET_WIDTH_MM:
        return None
    toilet_polygon = [
        (toilet_min_x, toilet_min_y),
        (toilet_max_x, toilet_min_y),
        (toilet_max_x, toilet_max_y),
        (toilet_min_x, toilet_max_y),
    ]
    donor_after = [
        (toilet_max_x, donor_bbox[1]),
        (donor_bbox[2], donor_bbox[1]),
        (donor_bbox[2], donor_bbox[3]),
        (toilet_max_x, donor_bbox[3]),
    ]
    if (
        not cast(Any, Polygon(donor_after)).is_valid
        or not cast(Any, Polygon(toilet_polygon)).is_valid
    ):
        return None
    if not _validate_space_minimums(donor_type=donor["type"], polygon=donor_after):
        return None

    wall_by_id = {
        wall["id"]: wall for wall in ifc_context.get("walls", []) if wall.get("floor") == floor
    }
    donor_door_conflicts = _openings_inside_polygon(
        openings=ifc_context.get("doors", []),
        wall_by_id=wall_by_id,
        polygon=toilet_polygon,
        floor=floor,
    )
    donor_window_conflicts = _openings_inside_polygon(
        openings=ifc_context.get("windows", []),
        wall_by_id=wall_by_id,
        polygon=toilet_polygon,
        floor=floor,
    )
    if donor_door_conflicts or donor_window_conflicts:
        return None

    entrance_segments, entrance_warnings = find_entrance_segments(
        doors=ifc_context.get("doors", []),
        walls=ifc_context.get("walls", []),
        outer_polygon=boundary["outer_polygon"],
        floor=floor,
    )
    north_edge = ((toilet_min_x, toilet_max_y), (toilet_max_x, toilet_max_y))
    west_edge = ((toilet_min_x, toilet_min_y), (toilet_min_x, toilet_max_y))
    south_edge = ((toilet_min_x, toilet_min_y), (toilet_max_x, toilet_min_y))
    east_edge = ((toilet_max_x, toilet_min_y), (toilet_max_x, toilet_max_y))
    if is_segment_on_entrance_face(north_edge, entrance_segments):
        return None

    reused_west = next(
        (
            wall
            for wall in wall_by_id.values()
            if _is_vertical(_as_point2(wall["start"]), _as_point2(wall["end"]))
            and min(wall["start"][0], wall["end"][0]) <= toilet_min_x + 1.0
            and max(wall["start"][1], wall["end"][1]) >= toilet_max_y - 1.0
            and min(wall["start"][1], wall["end"][1]) <= toilet_min_y + 1.0
        ),
        None,
    )
    reused_north = next(
        (
            wall
            for wall in wall_by_id.values()
            if _is_horizontal(_as_point2(wall["start"]), _as_point2(wall["end"]))
            and min(wall["start"][1], wall["end"][1]) >= toilet_max_y - 1.0
            and max(wall["start"][0], wall["end"][0]) >= toilet_max_x - 1.0
            and min(wall["start"][0], wall["end"][0]) <= toilet_min_x + 1.0
        ),
        None,
    )
    reused_south = next(
        (
            wall
            for wall in wall_by_id.values()
            if _is_horizontal(_as_point2(wall["start"]), _as_point2(wall["end"]))
            and abs(wall["start"][1] - corridor_bbox[3]) <= 1.0
            and max(wall["start"][0], wall["end"][0]) >= toilet_max_x - 1.0
            and min(wall["start"][0], wall["end"][0]) <= toilet_min_x + 1.0
        ),
        None,
    )
    if reused_west is None or reused_north is None or reused_south is None:
        return None

    toilet_origin = (toilet_min_x, toilet_min_y)
    toilet_local_polygon = _world_to_local_polygon(
        polygon=toilet_polygon,
        origin_x=toilet_origin[0],
        origin_y=toilet_origin[1],
        angle_deg=0.0,
    )
    south_wall_length_mm = abs(south_edge[1][0] - south_edge[0][0])
    door_width_mm = min(
        900,
        max(MIN_TOILET_DOOR_WIDTH_MM, round(south_wall_length_mm - 200)),
    )
    door_offset_mm = max(100.0, (south_wall_length_mm - door_width_mm) / 2.0)
    window_width_mm = min(
        700,
        max(MIN_TOILET_WINDOW_WIDTH_MM, round(_segment_length(north_edge) - 400)),
    )
    window_offset_mm = max(100.0, (_segment_length(north_edge) - window_width_mm) / 2.0)

    donor_space_plan: SpacePlan = {
        "local_id": donor["id"],
        "global_id": donor["id"],
        "name": donor["name"],
        "space_type": donor["type"],
        "locked": donor.get("locked", False),
        "storey_id": storey["id"],
        "polygon_world_mm": donor_after,
        "polygon_local_mm": _world_to_local_polygon(
            polygon=donor_after,
            origin_x=donor.get("x") or 0.0,
            origin_y=donor.get("y") or 0.0,
            angle_deg=donor.get("angle") or 0.0,
        ),
        "placement_world_mm": (donor.get("x") or 0.0, donor.get("y") or 0.0),
        "pset_updates": {
            "Width": round(_bbox(donor_after)[2] - _bbox(donor_after)[0]),
            "Height": round(_bbox(donor_after)[3] - _bbox(donor_after)[1]),
            "Shape": "poly",
            "SpaceType": donor["type"],
            "Locked": donor.get("locked", False),
        },
        "walls_bounding": [
            "reuse-west-exterior",
            "reuse-north-exterior",
            "new-east-divider",
            "reuse-south-toilet-corridor",
        ],
        "is_new": False,
        "source_space_id": donor["id"],
    }
    toilet_space_plan: SpacePlan = {
        "local_id": "new-toilet",
        "global_id": None,
        "name": TOILET_NAME,
        "space_type": "bathroom",
        "locked": False,
        "storey_id": storey["id"],
        "polygon_world_mm": toilet_polygon,
        "polygon_local_mm": toilet_local_polygon,
        "placement_world_mm": toilet_origin,
        "pset_updates": {
            "Width": round(toilet_max_x - toilet_min_x),
            "Height": round(toilet_max_y - toilet_min_y),
            "Shape": "poly",
            "SpaceType": "bathroom",
            "Locked": False,
        },
        "walls_bounding": [
            "reuse-west-exterior",
            "reuse-north-exterior",
            "new-east-divider",
            "reuse-south-toilet-corridor",
        ],
        "is_new": True,
        "source_space_id": donor["id"],
    }
    donor_walls_to_reuse: list[WallPlan] = [
        {
            "wall_local_id": "reuse-west-exterior",
            "source": "existing",
            "global_id": reused_west["id"],
            "start_mm": west_edge[0],
            "end_mm": west_edge[1],
            "thickness_mm": reused_west["thickness"],
            "kind": "EXTERIOR",
            "bounded_room_ids": ["new-toilet"],
            "hosts": ["toilet-window"],
        },
        {
            "wall_local_id": "reuse-north-exterior",
            "source": "existing",
            "global_id": reused_north["id"],
            "start_mm": north_edge[0],
            "end_mm": north_edge[1],
            "thickness_mm": reused_north["thickness"],
            "kind": "EXTERIOR",
            "bounded_room_ids": ["new-toilet"],
            "hosts": [],
        },
        {
            "wall_local_id": "reuse-south-toilet-corridor",
            "source": "existing",
            "global_id": reused_south["id"],
            "start_mm": south_edge[0],
            "end_mm": south_edge[1],
            "thickness_mm": reused_south["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": ["new-toilet", corridor["id"]],
            "hosts": ["toilet-door"],
        },
    ]
    new_walls: list[WallPlan] = [
        {
            "wall_local_id": "new-east-divider",
            "source": "new",
            "global_id": None,
            "start_mm": east_edge[0],
            "end_mm": east_edge[1],
            "thickness_mm": 200,
            "kind": "INTERIOR",
            "bounded_room_ids": [donor["id"], "new-toilet"],
            "hosts": [],
        },
    ]
    wall_conflicts = detect_opening_segment_conflicts(
        openings=[*ifc_context.get("doors", []), *ifc_context.get("windows", [])],
        wall_by_id=wall_by_id,
        candidate_walls=new_walls,
        floor=floor,
    )
    door_plan: DoorPlan = {
        "local_id": "toilet-door",
        "host_wall_local_id": "reuse-south-toilet-corridor",
        "segment_along_wall_mm": (door_offset_mm, door_offset_mm + door_width_mm),
        "width_mm": door_width_mm,
        "height_mm": 2100,
        "swing_in_space_id": corridor["id"],
        "opens_toward_space_id": corridor["id"],
        "swing_clearance_radius_mm": door_width_mm,
    }
    window_plan: WindowPlan = {
        "local_id": "toilet-window",
        "host_wall_local_id": "reuse-north-exterior",
        "segment_along_wall_mm": (window_offset_mm, window_offset_mm + window_width_mm),
        "width_mm": window_width_mm,
        "height_mm": 900,
        "sill_height_mm": 1000,
        "inherits_size_from_opening_id": None,
    }
    host_wall_ids = {
        opening["id"]: opening.get("host_wall_id") for opening in ifc_context.get("doors", [])
    }
    host_wall_ids.update(
        {opening["id"]: opening.get("host_wall_id") for opening in ifc_context.get("windows", [])}
    )
    existing_door_plans = _classify_existing_openings_plan(
        opening_ids=donor_door_conflicts,
        opening_type="door",
        host_wall_ids=host_wall_ids,
        decision="remove",
    )
    existing_window_plans = _classify_existing_openings_plan(
        opening_ids=donor_window_conflicts,
        opening_type="window",
        host_wall_ids=host_wall_ids,
        decision="replace_with_new",
        replaces_with_new_opening_local_id="toilet-window",
    )
    floor_doors = [
        opening for opening in ifc_context.get("doors", []) if opening.get("floor") == floor
    ]
    floor_windows = [
        opening for opening in ifc_context.get("windows", []) if opening.get("floor") == floor
    ]
    remainder_door_ids = _space_opening_ids(
        space_id=donor["id"],
        openings=floor_doors,
        opening_type="door",
        excluded_ids=set(donor_door_conflicts),
    )
    remainder_window_ids = _space_opening_ids(
        space_id=donor["id"],
        openings=floor_windows,
        opening_type="window",
        excluded_ids=set(donor_window_conflicts),
    )
    donor_space_plan["required_openings"] = {
        "needs_door_count": 1,
        "needs_window_count": 1,
        "door_satisfied_by_opening_local_ids": [
            f"existing:{opening_id}" for opening_id in remainder_door_ids
        ],
        "window_satisfied_by_opening_local_ids": [
            f"existing:{opening_id}" for opening_id in remainder_window_ids
        ],
    }
    donor_space_plan["access_circulation"] = {
        "reachable_from_space_local_id": "corridor",
        "via_door_opening_local_id": (
            f"existing:{remainder_door_ids[0]}" if remainder_door_ids else None
        ),
    }
    toilet_space_plan["required_openings"] = {
        "needs_door_count": 1,
        "needs_window_count": 1,
        "door_satisfied_by_opening_local_ids": ["toilet-door"],
        "window_satisfied_by_opening_local_ids": ["toilet-window"],
    }
    toilet_space_plan["access_circulation"] = {
        "reachable_from_space_local_id": "corridor",
        "via_door_opening_local_id": "toilet-door",
    }
    affected_opening_ids = sorted(
        {
            *donor_door_conflicts,
            *donor_window_conflicts,
            *(conflict["opening_id"] for conflict in wall_conflicts),
        }
    )
    opening_decisions = [*existing_door_plans, *existing_window_plans]
    completeness_check = build_opening_completeness_check(
        affected_opening_ids=affected_opening_ids,
        opening_plans=opening_decisions,
    )
    validation_errors: list[str] = []
    if wall_conflicts:
        validation_errors.append("existing_opening_on_new_partition")
    if completeness_check["uncovered_opening_ids"]:
        validation_errors.append("missing_opening_decision")
    if not remainder_door_ids:
        validation_errors.append("split_remainder_missing_door")
    if not remainder_window_ids:
        validation_errors.append("split_remainder_missing_window")
    validation_warnings = list(entrance_warnings)
    validation_issues = _build_validation_issues(
        errors=validation_errors,
        warnings=validation_warnings,
    )
    split_operation: SplitOperation = {
        "source_space_id": donor["id"],
        "resulting_space_local_ids": [donor["id"], "new-toilet"],
    }
    closure_issues = validate_space_opening_closure(
        {
            "space_plans": [donor_space_plan, toilet_space_plan],
            "door_plans": [door_plan],
            "window_plans": [window_plan],
        }  # type: ignore[arg-type]
    )
    for issue in closure_issues:
        if issue["code"] not in validation_errors:
            validation_errors.append(issue["code"])
            validation_issues.append(issue)
    toilet_readability_metrics = _build_toilet_readability_metrics(
        toilet_polygon=toilet_polygon,
        exterior_wall_segment=west_edge,
        interior_door_wall_segment=east_edge,
    )
    untouched_space_ids = [
        space["id"]
        for space in spaces
        if space["id"] != donor["id"]
    ]
    plan: ToiletInsertionPlan = {
        "plan_schema_version": PLAN_SCHEMA_VERSION,
        "status": "planned" if not validation_errors else "rejected",
        "user_intent": user_intent,
        "floor": floor,
        "storey_id": storey["id"],
        "strategy": "corridor_end",
        "anchor_room_id": None,
        "anchor_room_name": None,
        "donor_room_id": donor["id"],
        "donor_room_name": donor["name"],
        "donor_room_type": donor["type"],
        "donor_strategy_used": "corridor_end",
        "toilet_name": TOILET_NAME,
        "toilet_space_type": "bathroom",
        "toilet_locked": False,
        "preferred_width_mm": preferred_width_mm,
        "preferred_height_mm": round(toilet_max_y - toilet_min_y),
        "toilet_world_polygon_mm": toilet_polygon,
        "toilet_local_origin_world_mm": toilet_origin,
        "toilet_local_polygon_mm": toilet_local_polygon,
        "toilet_pset_updates": toilet_space_plan["pset_updates"],
        "donor_polygon_before_world_mm": [(x, y) for x, y in donor_polygon],
        "donor_polygon_after_world_mm": donor_after,
        "bathroom_adjacency_kind": "none",
        "bathroom_shared_edge_length_mm": 0.0,
        "bathroom_shared_edge_segment_mm": None,
        "bathroom_partition_gap_mm": None,
        "bathroom_indirect_adjacency_via_donor": False,
        "exterior_wall_segment_mm": north_edge,
        "interior_door_wall_segment_mm": south_edge,
        "donor_remaining_min_clearance_mm": round(_bbox(donor_after)[2] - _bbox(donor_after)[0]),
        "donor_existing_doors_inside_toilet_polygon": [],
        "donor_existing_windows_inside_toilet_polygon": [],
        "donor_reachability_after_carve": True,
        "entrance_segments_mm": entrance_segments,
        "affected_space_ids": [donor["id"]],
        "untouched_space_ids": untouched_space_ids,
        "required_new_walls": new_walls,
        "donor_walls_to_reuse": donor_walls_to_reuse,
        "donor_walls_to_split": [],
        "donor_walls_to_delete": [],
        "space_plans": [donor_space_plan, toilet_space_plan],
        "wall_plans": [*donor_walls_to_reuse, *new_walls],
        "door_plan": door_plan,
        "door_plans": [door_plan],
        "window_plan": window_plan,
        "window_plans": [window_plan],
        "existing_openings_to_remove": [],
        "existing_openings_to_relocate": [],
        "existing_openings_plan": opening_decisions,
        "forbidden_existing_openings": [],
        "bedroom_quality_metrics": None,
        "toilet_readability_metrics": toilet_readability_metrics,
        "validation_errors": validation_errors,
        "validation_warnings": validation_warnings,
        "validation_issues": validation_issues,
        "clarification_questions": [],
        "completeness_check": completeness_check,
        "split_remainder_room_name": donor["name"],
        "split_remainder_room_type": donor["type"],
        "split_operation": split_operation,
        "score": float(len(affected_opening_ids) * 50 + 10),
    }
    return plan


def _public_candidate_sort_key(plan: ToiletInsertionPlan) -> tuple[int, float]:
    status_rank = 0 if plan["status"] == "planned" else 1
    score_value = plan.get("score", 0.0)
    score = float(score_value) if isinstance(score_value, int | float) else 0.0
    return (status_rank, score)


def _build_public_big_room_east_candidate(
    *,
    ifc_context: IFCContext,
    floor: int,
    preferred_width_mm: int,
    preferred_height_mm: int,
) -> ToiletInsertionPlan | None:
    spaces = [space for space in ifc_context.get("spaces", []) if space.get("floor") == floor]
    donor = next((space for space in spaces if space.get("name") == "Big Room"), None)
    corridor = next((space for space in spaces if space.get("type") == "corridor"), None)
    study_neighbor = next((space for space in spaces if space.get("type") == "bedroom"), None)
    storey = _find_storey(ifc_context.get("storeys", []), floor)
    if donor is None or corridor is None or storey is None:
        return None

    donor_bbox = _bbox(donor["polygon"])
    toilet_width = max(preferred_width_mm, 1400)
    toilet_min_x = max(donor_bbox[0], donor_bbox[2] - toilet_width)
    toilet_max_x = donor_bbox[2]
    donor_after = [
        (donor_bbox[0], donor_bbox[1]),
        (toilet_min_x, donor_bbox[1]),
        (toilet_min_x, donor_bbox[3]),
        (donor_bbox[0], donor_bbox[3]),
    ]
    if not _validate_space_minimums(donor_type="office", polygon=donor_after):
        return None

    toilet_polygon = [
        (toilet_min_x, donor_bbox[1]),
        (toilet_max_x, donor_bbox[1]),
        (toilet_max_x, donor_bbox[3]),
        (toilet_min_x, donor_bbox[3]),
    ]
    wall_by_id = {
        wall["id"]: wall for wall in ifc_context.get("walls", []) if wall.get("floor") == floor
    }
    north_wall = wall_by_id.get("1bzfVsJqn8De5PukCrqylz")
    south_wall = wall_by_id.get("3jjW3rL656ex34Gws22EfM")
    west_wall = wall_by_id.get("3rPX_Juz59peXXY6wDJl18")
    east_wall = wall_by_id.get("3PfS__Y_DBAfq5naM6zD2Z")
    if north_wall is None or south_wall is None or west_wall is None or east_wall is None:
        return None

    host_wall_ids = {
        opening["id"]: opening.get("host_wall_id") for opening in ifc_context.get("doors", [])
    }
    host_wall_ids.update(
        {opening["id"]: opening.get("host_wall_id") for opening in ifc_context.get("windows", [])}
    )
    affected_door_ids = _openings_inside_polygon(
        openings=ifc_context.get("doors", []),
        wall_by_id=wall_by_id,
        polygon=toilet_polygon,
        floor=floor,
    )
    affected_window_ids = _openings_inside_polygon(
        openings=ifc_context.get("windows", []),
        wall_by_id=wall_by_id,
        polygon=toilet_polygon,
        floor=floor,
    )
    floor_doors = [
        opening for opening in ifc_context.get("doors", []) if opening.get("floor") == floor
    ]
    floor_windows = [
        opening for opening in ifc_context.get("windows", []) if opening.get("floor") == floor
    ]
    remainder_window_ids = _space_opening_ids(
        space_id=donor["id"],
        openings=floor_windows,
        opening_type="window",
        excluded_ids=set(affected_window_ids),
    )
    study_replaced_door_ids = [
        opening["id"]
        for opening in floor_doors
        if opening.get("host_wall_id") == south_wall["id"]
        and (
            opening.get("from_space_id") == donor["id"] or opening.get("to_space_id") == donor["id"]
        )
    ]
    study_window_id = next(
        (
            opening["id"]
            for opening in floor_windows
            if opening["id"] in remainder_window_ids
            and opening.get("host_wall_id") == north_wall["id"]
            and opening.get("adjacent_space_id") == donor["id"]
        ),
        next(
            (
                opening["id"]
                for opening in floor_windows
                if opening["id"] in remainder_window_ids
                and opening.get("host_wall_id") == west_wall["id"]
                and opening.get("adjacent_space_id") == donor["id"]
            ),
            remainder_window_ids[0] if remainder_window_ids else None,
        ),
    )
    study_space_plan: SpacePlan = {
        "local_id": donor["id"],
        "global_id": donor["id"],
        "name": "서재",
        "space_type": "office",
        "locked": donor.get("locked", False),
        "storey_id": storey["id"],
        "polygon_world_mm": donor_after,
        "polygon_local_mm": _world_to_local_polygon(
            polygon=donor_after,
            origin_x=donor.get("x") or 0.0,
            origin_y=donor.get("y") or 0.0,
            angle_deg=donor.get("angle") or 0.0,
        ),
        "placement_world_mm": (donor.get("x") or 0.0, donor.get("y") or 0.0),
        "pset_updates": {
            "Width": round(toilet_min_x - donor_bbox[0]),
            "Height": round(donor_bbox[3] - donor_bbox[1]),
            "Shape": "poly",
            "SpaceType": "office",
            "Locked": donor.get("locked", False),
        },
        "walls_bounding": [
            "reuse-west-study-exterior",
            "reuse-north-study-exterior",
            "new-study-toilet-divider",
            "new-south-study-corridor",
        ],
        "is_new": False,
        "source_space_id": donor["id"],
    }
    toilet_space_plan: SpacePlan = {
        "local_id": "new-toilet",
        "global_id": None,
        "name": TOILET_NAME,
        "space_type": "bathroom",
        "locked": False,
        "storey_id": storey["id"],
        "polygon_world_mm": toilet_polygon,
        "polygon_local_mm": _world_to_local_polygon(
            polygon=toilet_polygon,
            origin_x=toilet_min_x,
            origin_y=donor_bbox[1],
            angle_deg=0.0,
        ),
        "placement_world_mm": (toilet_min_x, donor_bbox[1]),
        "pset_updates": {
            "Width": round(toilet_max_x - toilet_min_x),
            "Height": round(donor_bbox[3] - donor_bbox[1]),
            "Shape": "poly",
            "SpaceType": "bathroom",
            "Locked": False,
        },
        "walls_bounding": [
            "new-study-toilet-divider",
            "reuse-north-toilet-exterior",
            "reuse-east-toilet-bedroom",
            "new-south-toilet-corridor",
        ],
        "is_new": True,
        "source_space_id": donor["id"],
    }
    study_space_plan["required_openings"] = {
        "needs_door_count": 1,
        "needs_window_count": 1,
        "door_satisfied_by_opening_local_ids": ["study-door"],
        "window_satisfied_by_opening_local_ids": (
            [f"existing:{study_window_id}"] if study_window_id else []
        ),
    }
    study_space_plan["access_circulation"] = {
        "reachable_from_space_local_id": "corridor",
        "via_door_opening_local_id": "study-door",
    }
    toilet_space_plan["required_openings"] = {
        "needs_door_count": 1,
        "needs_window_count": 1,
        "door_satisfied_by_opening_local_ids": ["toilet-door"],
        "window_satisfied_by_opening_local_ids": ["toilet-window"],
    }
    toilet_space_plan["access_circulation"] = {
        "reachable_from_space_local_id": "corridor",
        "via_door_opening_local_id": "toilet-door",
    }
    study_door_width_mm = 900
    toilet_door_width_mm = 800
    toilet_window_width_mm = min(900, max(600, round((toilet_max_x - toilet_min_x) - 300)))
    study_door_offset_mm = max(100.0, ((toilet_min_x - donor_bbox[0]) - study_door_width_mm) / 2.0)
    toilet_door_offset_mm = max(100.0, ((toilet_max_x - toilet_min_x) - toilet_door_width_mm) / 2.0)
    toilet_window_offset_mm = max(
        100.0, ((toilet_max_x - toilet_min_x) - toilet_window_width_mm) / 2.0
    )

    opening_plans = [
        *_classify_existing_openings_plan(
            opening_ids=sorted(set([*affected_door_ids, *study_replaced_door_ids])),
            opening_type="door",
            host_wall_ids=host_wall_ids,
            decision="remove",
        ),
        *_classify_existing_openings_plan(
            opening_ids=sorted(set(affected_window_ids)),
            opening_type="window",
            host_wall_ids=host_wall_ids,
            decision="replace_with_new",
            replaces_with_new_opening_local_id="toilet-window",
        ),
    ]
    completeness_check = build_opening_completeness_check(
        affected_opening_ids=sorted(
            set(
                [
                    *affected_door_ids,
                    *study_replaced_door_ids,
                    *affected_window_ids,
                ]
            )
        ),
        opening_plans=opening_plans,
    )
    validation_errors: list[str] = []
    if completeness_check["uncovered_opening_ids"]:
        validation_errors.append("missing_opening_decision")
    if study_window_id is None:
        validation_errors.append("split_remainder_missing_window")
    new_walls: list[WallPlan] = [
        {
            "wall_local_id": "new-study-toilet-divider",
            "source": "new",
            "global_id": None,
            "start_mm": (toilet_min_x, donor_bbox[1]),
            "end_mm": (toilet_min_x, donor_bbox[3]),
            "thickness_mm": 200,
            "kind": "INTERIOR",
            "bounded_room_ids": [donor["id"], "new-toilet"],
            "hosts": [],
        },
        {
            "wall_local_id": "new-south-study-corridor",
            "source": "new",
            "global_id": None,
            "start_mm": (donor_bbox[0], donor_bbox[1]),
            "end_mm": (toilet_min_x, donor_bbox[1]),
            "thickness_mm": south_wall["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": [donor["id"], corridor["id"]],
            "hosts": ["study-door"],
        },
        {
            "wall_local_id": "new-south-toilet-corridor",
            "source": "new",
            "global_id": None,
            "start_mm": (toilet_min_x, donor_bbox[1]),
            "end_mm": (toilet_max_x, donor_bbox[1]),
            "thickness_mm": south_wall["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": ["new-toilet", corridor["id"]],
            "hosts": ["toilet-door"],
        },
    ]
    donor_walls_to_reuse: list[WallPlan] = [
        {
            "wall_local_id": "reuse-west-study-exterior",
            "source": "existing",
            "global_id": west_wall["id"],
            "start_mm": (donor_bbox[0], donor_bbox[1]),
            "end_mm": (donor_bbox[0], donor_bbox[3]),
            "thickness_mm": west_wall["thickness"],
            "kind": "EXTERIOR",
            "bounded_room_ids": [donor["id"]],
            "hosts": [],
        },
        {
            "wall_local_id": "reuse-north-study-exterior",
            "source": "existing",
            "global_id": north_wall["id"],
            "start_mm": (donor_bbox[0], donor_bbox[3]),
            "end_mm": (toilet_min_x, donor_bbox[3]),
            "thickness_mm": north_wall["thickness"],
            "kind": "EXTERIOR",
            "bounded_room_ids": [donor["id"]],
            "hosts": [],
        },
        {
            "wall_local_id": "reuse-north-toilet-exterior",
            "source": "existing",
            "global_id": north_wall["id"],
            "start_mm": (toilet_min_x, donor_bbox[3]),
            "end_mm": (toilet_max_x, donor_bbox[3]),
            "thickness_mm": north_wall["thickness"],
            "kind": "EXTERIOR",
            "bounded_room_ids": ["new-toilet"],
            "hosts": ["toilet-window"],
        },
        {
            "wall_local_id": "reuse-east-toilet-bedroom",
            "source": "existing",
            "global_id": east_wall["id"],
            "start_mm": (toilet_max_x, donor_bbox[1]),
            "end_mm": (toilet_max_x, donor_bbox[3]),
            "thickness_mm": east_wall["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": (
                ["new-toilet", study_neighbor["id"]]
                if study_neighbor is not None
                else ["new-toilet"]
            ),
            "hosts": [],
        },
    ]
    wall_conflicts = detect_opening_segment_conflicts(
        openings=[*ifc_context.get("doors", []), *ifc_context.get("windows", [])],
        wall_by_id=wall_by_id,
        candidate_walls=new_walls,
        floor=floor,
    )
    if wall_conflicts:
        validation_errors.append("existing_opening_on_new_partition")

    study_door_plan: DoorPlan = {
        "local_id": "study-door",
        "host_wall_local_id": "new-south-study-corridor",
        "segment_along_wall_mm": (study_door_offset_mm, study_door_offset_mm + study_door_width_mm),
        "width_mm": study_door_width_mm,
        "height_mm": 2100,
        "swing_in_space_id": corridor["id"],
        "opens_toward_space_id": corridor["id"],
        "swing_clearance_radius_mm": study_door_width_mm,
    }
    toilet_door_plan: DoorPlan = {
        "local_id": "toilet-door",
        "host_wall_local_id": "new-south-toilet-corridor",
        "segment_along_wall_mm": (
            toilet_door_offset_mm,
            toilet_door_offset_mm + toilet_door_width_mm,
        ),
        "width_mm": toilet_door_width_mm,
        "height_mm": 2100,
        "swing_in_space_id": corridor["id"],
        "opens_toward_space_id": corridor["id"],
        "swing_clearance_radius_mm": toilet_door_width_mm,
    }
    toilet_window_plan: WindowPlan = {
        "local_id": "toilet-window",
        "host_wall_local_id": "reuse-north-toilet-exterior",
        "segment_along_wall_mm": (
            toilet_window_offset_mm,
            toilet_window_offset_mm + toilet_window_width_mm,
        ),
        "width_mm": toilet_window_width_mm,
        "height_mm": 900,
        "sill_height_mm": 1000,
        "inherits_size_from_opening_id": None,
    }
    plan: ToiletInsertionPlan = {
        "plan_schema_version": PLAN_SCHEMA_VERSION,
        "status": "planned" if not validation_errors else "rejected",
        "user_intent": "shared_toilet_split_big_room",
        "floor": floor,
        "storey_id": storey["id"],
        "strategy": "corridor_end",
        "anchor_room_id": None,
        "anchor_room_name": None,
        "donor_room_id": donor["id"],
        "donor_room_name": donor["name"],
        "donor_room_type": donor["type"],
        "donor_strategy_used": "corridor_end",
        "toilet_name": TOILET_NAME,
        "toilet_space_type": "bathroom",
        "toilet_locked": False,
        "preferred_width_mm": round(toilet_max_x - toilet_min_x),
        "preferred_height_mm": round(donor_bbox[3] - donor_bbox[1]),
        "toilet_world_polygon_mm": toilet_polygon,
        "toilet_local_origin_world_mm": (toilet_min_x, donor_bbox[1]),
        "toilet_local_polygon_mm": _world_to_local_polygon(
            polygon=toilet_polygon,
            origin_x=toilet_min_x,
            origin_y=donor_bbox[1],
            angle_deg=0.0,
        ),
        "toilet_pset_updates": toilet_space_plan["pset_updates"],
        "donor_polygon_before_world_mm": [(x, y) for x, y in donor["polygon"]],
        "donor_polygon_after_world_mm": donor_after,
        "bathroom_adjacency_kind": "none",
        "bathroom_shared_edge_length_mm": 0.0,
        "bathroom_shared_edge_segment_mm": None,
        "bathroom_partition_gap_mm": None,
        "bathroom_indirect_adjacency_via_donor": False,
        "exterior_wall_segment_mm": (
            (toilet_min_x, donor_bbox[3]),
            (toilet_max_x, donor_bbox[3]),
        ),
        "interior_door_wall_segment_mm": (
            (toilet_min_x, donor_bbox[1]),
            (toilet_max_x, donor_bbox[1]),
        ),
        "donor_remaining_min_clearance_mm": round(toilet_min_x - donor_bbox[0]),
        "donor_existing_doors_inside_toilet_polygon": affected_door_ids,
        "donor_existing_windows_inside_toilet_polygon": affected_window_ids,
        "donor_reachability_after_carve": True,
        "entrance_segments_mm": [],
        "affected_space_ids": [donor["id"]],
        "untouched_space_ids": [space["id"] for space in spaces if space["id"] != donor["id"]],
        "required_new_walls": new_walls,
        "donor_walls_to_reuse": donor_walls_to_reuse,
        "donor_walls_to_split": [],
        "donor_walls_to_delete": [south_wall["id"]],
        "space_plans": [study_space_plan, toilet_space_plan],
        "wall_plans": [*donor_walls_to_reuse, *new_walls],
        "door_plan": toilet_door_plan,
        "door_plans": [study_door_plan, toilet_door_plan],
        "window_plan": toilet_window_plan,
        "window_plans": [toilet_window_plan],
        "existing_openings_to_remove": [],
        "existing_openings_to_relocate": [],
        "existing_openings_plan": opening_plans,
        "forbidden_existing_openings": [],
        "bedroom_quality_metrics": None,
        "toilet_readability_metrics": _build_toilet_readability_metrics(
            toilet_polygon=toilet_polygon,
            exterior_wall_segment=(
                (toilet_min_x, donor_bbox[3]),
                (toilet_max_x, donor_bbox[3]),
            ),
            interior_door_wall_segment=(
                (toilet_min_x, donor_bbox[1]),
                (toilet_max_x, donor_bbox[1]),
            ),
        ),
        "validation_errors": sorted(set(validation_errors)),
        "validation_warnings": [],
        "validation_issues": [],
        "clarification_questions": [],
        "completeness_check": completeness_check,
        "split_remainder_room_name": "서재",
        "split_remainder_room_type": "office",
        "split_operation": {
            "source_space_id": donor["id"],
            "resulting_space_local_ids": [donor["id"], "new-toilet"],
        },
        "score": -10.0,
    }
    plan["validation_issues"] = _build_validation_issues(
        errors=plan["validation_errors"],
        warnings=plan["validation_warnings"],
    )
    closure_issues = validate_space_opening_closure(plan)
    for issue in closure_issues:
        if issue["code"] not in plan["validation_errors"]:
            plan["validation_errors"].append(issue["code"])
            plan["validation_issues"].append(issue)
    plan["validation_errors"] = sorted(set(plan["validation_errors"]))
    plan["status"] = "planned" if not plan["validation_errors"] else "rejected"
    return plan


def enumerate_carve_candidates(
    *,
    ifc_context: IFCContext,
    floor: int,
    anchor: SpaceContext,
    boundary: BoundaryContext,
    preferred_width_mm: int,
    preferred_height_mm: int,
) -> list[ToiletInsertionPlan]:
    candidate_spaces = _candidate_spaces(ifc_context, floor=floor, anchor=anchor)
    wall_by_id = {
        wall["id"]: wall for wall in ifc_context.get("walls", []) if wall.get("floor") == floor
    }
    candidates: list[ToiletInsertionPlan] = []
    for donor in candidate_spaces:
        candidate = None
        if donor.get("type") == "corridor":
            candidate = _build_corridor_end_candidate(
                ifc_context=ifc_context,
                floor=floor,
                anchor=anchor,
                donor=donor,
                boundary=boundary,
                preferred_width_mm=preferred_width_mm,
                preferred_height_mm=preferred_height_mm,
                wall_by_id=wall_by_id,
            )
        elif donor.get("type") == "bedroom":
            candidate = _build_bedroom_edge_candidate(
                ifc_context=ifc_context,
                floor=floor,
                anchor=anchor,
                donor=donor,
                boundary=boundary,
                preferred_width_mm=preferred_width_mm,
                preferred_height_mm=preferred_height_mm,
            )
        if candidate is not None:
            candidates.append(candidate)
    return candidates


def _build_corridor_end_candidate(
    *,
    ifc_context: IFCContext,
    floor: int,
    anchor: SpaceContext,
    donor: SpaceContext,
    boundary: BoundaryContext,
    preferred_width_mm: int,
    preferred_height_mm: int,
    wall_by_id: dict[str, WallContext],
) -> ToiletInsertionPlan | None:
    donor_polygon = donor.get("polygon") or []
    anchor_polygon = anchor.get("polygon") or []
    if not donor_polygon or not anchor_polygon:
        return None

    donor_bbox = _bbox(donor_polygon)
    anchor_bbox = _bbox(anchor_polygon)
    overlap_max_x = min(donor_bbox[2], anchor_bbox[2])
    overlap_min_x = max(donor_bbox[0], anchor_bbox[0])
    if overlap_max_x - overlap_min_x < max(preferred_width_mm, MIN_TOILET_WIDTH_MM):
        return None

    toilet_max_x = overlap_max_x
    toilet_min_x = toilet_max_x - preferred_width_mm
    toilet_min_y = donor_bbox[1]
    toilet_max_y = min(donor_bbox[3], toilet_min_y + preferred_height_mm)
    if toilet_max_y - toilet_min_y < MIN_TOILET_DEPTH_MM:
        return None

    toilet_polygon = [
        (toilet_min_x, toilet_min_y),
        (toilet_max_x, toilet_min_y),
        (toilet_max_x, toilet_max_y),
        (toilet_min_x, toilet_max_y),
    ]
    donor_after = _shrink_polygon_right_edge(
        donor_polygon,
        old_max_x=donor_bbox[2],
        new_max_x=toilet_min_x,
    )
    if donor_after is None:
        return None

    exterior_segments = _dedupe_segments(
        find_exterior_contact_segments(toilet_polygon, boundary["outer_polygon"])
    )
    if not exterior_segments:
        return None
    exterior_wall_segment = _select_primary_exterior_segment(exterior_segments)

    bathroom_segment = _find_parallel_contact_segment(
        polygon_a=toilet_polygon,
        polygon_b=anchor_polygon,
        max_gap_mm=BATHROOM_NEAR_GAP_MM,
    )
    bathroom_partition_gap = (
        _parallel_polygon_gap_mm(toilet_polygon, anchor_polygon)
        if bathroom_segment is not None
        else None
    )
    if bathroom_segment is None:
        return None
    adjacency_kind: Literal["shared_edge", "shared_wall_partition", "none"]
    if (bathroom_partition_gap or 0.0) <= TOLERANCE_MM:
        adjacency_kind = "shared_edge"
    else:
        adjacency_kind = "shared_wall_partition"

    entrance_segments, entrance_warnings = find_entrance_segments(
        doors=ifc_context.get("doors", []),
        walls=ifc_context.get("walls", []),
        outer_polygon=boundary["outer_polygon"],
        floor=floor,
    )
    if is_segment_on_entrance_face(exterior_wall_segment, entrance_segments):
        return None

    donor_door_conflicts = _openings_inside_polygon(
        openings=ifc_context.get("doors", []),
        wall_by_id=wall_by_id,
        polygon=toilet_polygon,
        floor=floor,
    )
    donor_window_conflicts = _openings_inside_polygon(
        openings=ifc_context.get("windows", []),
        wall_by_id=wall_by_id,
        polygon=toilet_polygon,
        floor=floor,
    )
    donor_remaining_min_clearance_mm = round(_bbox(donor_after)[2] - _bbox(donor_after)[0])
    if donor_remaining_min_clearance_mm < MIN_CORRIDOR_CLEARANCE_MM:
        return None
    if donor_door_conflicts:
        return None
    if not _validate_space_minimums(donor_type=donor["type"], polygon=donor_after):
        return None
    if (
        not cast(Any, Polygon(donor_after)).is_valid
        or not cast(Any, Polygon(toilet_polygon)).is_valid
    ):
        return None

    storey = _find_storey(ifc_context.get("storeys", []), floor)
    if storey is None:
        return None

    toilet_origin = (toilet_min_x, toilet_min_y)
    toilet_local_polygon = _world_to_local_polygon(
        polygon=toilet_polygon,
        origin_x=toilet_origin[0],
        origin_y=toilet_origin[1],
        angle_deg=0.0,
    )
    north_edge = (
        (toilet_min_x, toilet_max_y),
        (toilet_max_x, toilet_max_y),
    )
    west_edge = (
        (toilet_min_x, toilet_min_y),
        (toilet_min_x, toilet_max_y),
    )
    south_edge = (
        (toilet_min_x, toilet_min_y),
        (toilet_max_x, toilet_min_y),
    )
    east_edge = (
        (toilet_max_x, toilet_min_y),
        (toilet_max_x, toilet_max_y),
    )
    reused_north = _find_existing_wall_for_segment(wall_by_id.values(), north_edge)
    if reused_north is None:
        return None

    west_wall_length_mm = abs(west_edge[1][1] - west_edge[0][1])
    door_width_mm = min(
        900,
        max(MIN_TOILET_DOOR_WIDTH_MM, round(west_wall_length_mm - 200)),
    )
    door_offset_mm = max(100.0, (west_wall_length_mm - door_width_mm) / 2.0)
    exterior_wall_length_mm = _segment_length(exterior_wall_segment)
    window_width_mm = min(
        700,
        max(MIN_TOILET_WINDOW_WIDTH_MM, round(exterior_wall_length_mm - 400)),
    )
    window_offset_mm = max(100.0, (exterior_wall_length_mm - window_width_mm) / 2.0)

    donor_space_plan: SpacePlan = {
        "local_id": donor["id"],
        "global_id": donor["id"],
        "name": donor["name"],
        "space_type": donor["type"],
        "locked": donor.get("locked", False),
        "storey_id": storey["id"],
        "polygon_world_mm": donor_after,
        "polygon_local_mm": _world_to_local_polygon(
            polygon=donor_after,
            origin_x=donor.get("x") or 0.0,
            origin_y=donor.get("y") or 0.0,
            angle_deg=donor.get("angle") or 0.0,
        ),
        "placement_world_mm": (donor.get("x") or 0.0, donor.get("y") or 0.0),
        "pset_updates": {
            "Width": round(_bbox(donor_after)[2] - _bbox(donor_after)[0]),
            "Height": round(_bbox(donor_after)[3] - _bbox(donor_after)[1]),
            "Shape": "poly",
            "SpaceType": donor["type"],
            "Locked": donor.get("locked", False),
        },
        "walls_bounding": ["reuse-north", "new-west-divider", "new-south", "new-east-exterior"],
    }
    toilet_space_plan: SpacePlan = {
        "local_id": "new-toilet",
        "global_id": None,
        "name": TOILET_NAME,
        "space_type": "bathroom",
        "locked": False,
        "storey_id": storey["id"],
        "polygon_world_mm": toilet_polygon,
        "polygon_local_mm": toilet_local_polygon,
        "placement_world_mm": toilet_origin,
        "pset_updates": {
            "Width": round(toilet_max_x - toilet_min_x),
            "Height": round(toilet_max_y - toilet_min_y),
            "Shape": "poly",
            "SpaceType": "bathroom",
            "Locked": False,
        },
        "walls_bounding": ["reuse-north", "new-west-divider", "new-south", "new-east-exterior"],
    }
    wall_reuse_north: WallPlan = {
        "wall_local_id": "reuse-north",
        "source": "existing",
        "global_id": reused_north["id"],
        "start_mm": north_edge[0],
        "end_mm": north_edge[1],
        "thickness_mm": reused_north["thickness"],
        "kind": "INTERIOR",
        "bounded_room_ids": [anchor["id"], "new-toilet"],
        "hosts": [],
    }
    new_walls: list[WallPlan] = [
        {
            "wall_local_id": "new-west-divider",
            "source": "new",
            "global_id": None,
            "start_mm": west_edge[0],
            "end_mm": west_edge[1],
            "thickness_mm": 200,
            "kind": "INTERIOR",
            "bounded_room_ids": [donor["id"], "new-toilet"],
            "hosts": ["toilet-door"],
        },
        {
            "wall_local_id": "new-south",
            "source": "new",
            "global_id": None,
            "start_mm": south_edge[0],
            "end_mm": south_edge[1],
            "thickness_mm": 200,
            "kind": "INTERIOR",
            "bounded_room_ids": ["new-toilet"],
            "hosts": [],
        },
        {
            "wall_local_id": "new-east-exterior",
            "source": "new",
            "global_id": None,
            "start_mm": east_edge[0],
            "end_mm": east_edge[1],
            "thickness_mm": 200,
            "kind": "EXTERIOR",
            "bounded_room_ids": ["new-toilet"],
            "hosts": ["toilet-window"],
        },
    ]
    door_plan: DoorPlan = {
        "local_id": "toilet-door",
        "host_wall_local_id": "new-west-divider",
        "segment_along_wall_mm": (door_offset_mm, door_offset_mm + door_width_mm),
        "width_mm": door_width_mm,
        "height_mm": 2100,
        "swing_in_space_id": donor["id"],
        "opens_toward_space_id": donor["id"],
        "swing_clearance_radius_mm": door_width_mm,
    }
    window_plan: WindowPlan = {
        "local_id": "toilet-window",
        "host_wall_local_id": "new-east-exterior",
        "segment_along_wall_mm": (window_offset_mm, window_offset_mm + window_width_mm),
        "width_mm": window_width_mm,
        "height_mm": 900,
        "sill_height_mm": 1000,
        "inherits_size_from_opening_id": None,
    }

    validation_errors: list[str] = []
    validation_warnings = list(entrance_warnings)
    if donor_door_conflicts:
        validation_warnings.append("donor_door_conflict")
    if donor_window_conflicts:
        validation_warnings.append("donor_window_conflict")
    donor_reachability_after_carve = not donor_door_conflicts
    if not donor_reachability_after_carve:
        validation_warnings.append("donor_circulation_loss")

    validation_issues = _build_validation_issues(
        errors=validation_errors,
        warnings=validation_warnings,
    )
    host_wall_ids = {
        opening["id"]: opening.get("host_wall_id") for opening in ifc_context.get("doors", [])
    }
    host_wall_ids.update(
        {opening["id"]: opening.get("host_wall_id") for opening in ifc_context.get("windows", [])}
    )
    existing_openings_plan = [
        *_classify_existing_openings_plan(
            opening_ids=donor_door_conflicts,
            opening_type="door",
            host_wall_ids=host_wall_ids,
            decision="remove",
        ),
        *_classify_existing_openings_plan(
            opening_ids=donor_window_conflicts,
            opening_type="window",
            host_wall_ids=host_wall_ids,
            decision="remove",
        ),
    ]
    completeness_check = build_opening_completeness_check(
        affected_opening_ids=[*donor_door_conflicts, *donor_window_conflicts],
        opening_plans=existing_openings_plan,
    )
    toilet_readability_metrics = _build_toilet_readability_metrics(
        toilet_polygon=toilet_polygon,
        exterior_wall_segment=exterior_wall_segment,
        interior_door_wall_segment=west_edge,
    )

    affected_space_ids = [donor["id"]]
    untouched_space_ids = [
        space["id"]
        for space in ifc_context.get("spaces", [])
        if space.get("floor") == floor and space["id"] not in {donor["id"], anchor["id"]}
    ]

    plan: ToiletInsertionPlan = {
        "plan_schema_version": PLAN_SCHEMA_VERSION,
        "status": "planned" if not validation_errors else "rejected",
        "user_intent": "shared_toilet_any_strategy",
        "floor": floor,
        "storey_id": storey["id"],
        "strategy": "corridor_end",
        "anchor_room_id": anchor["id"],
        "anchor_room_name": anchor["name"],
        "donor_room_id": donor["id"],
        "donor_room_name": donor["name"],
        "donor_room_type": donor["type"],
        "donor_strategy_used": "corridor_end",
        "toilet_name": TOILET_NAME,
        "toilet_space_type": "bathroom",
        "toilet_locked": False,
        "preferred_width_mm": preferred_width_mm,
        "preferred_height_mm": round(toilet_max_y - toilet_min_y),
        "toilet_world_polygon_mm": toilet_polygon,
        "toilet_local_origin_world_mm": toilet_origin,
        "toilet_local_polygon_mm": toilet_local_polygon,
        "toilet_pset_updates": toilet_space_plan["pset_updates"],
        "donor_polygon_before_world_mm": [(x, y) for x, y in donor_polygon],
        "donor_polygon_after_world_mm": donor_after,
        "bathroom_adjacency_kind": adjacency_kind,
        "bathroom_shared_edge_length_mm": _segment_length(bathroom_segment),
        "bathroom_shared_edge_segment_mm": bathroom_segment,
        "bathroom_partition_gap_mm": bathroom_partition_gap,
        "bathroom_indirect_adjacency_via_donor": adjacency_kind != "none",
        "exterior_wall_segment_mm": exterior_wall_segment,
        "interior_door_wall_segment_mm": west_edge,
        "donor_remaining_min_clearance_mm": donor_remaining_min_clearance_mm,
        "donor_existing_doors_inside_toilet_polygon": donor_door_conflicts,
        "donor_existing_windows_inside_toilet_polygon": donor_window_conflicts,
        "donor_reachability_after_carve": donor_reachability_after_carve,
        "entrance_segments_mm": entrance_segments,
        "affected_space_ids": affected_space_ids,
        "untouched_space_ids": untouched_space_ids,
        "required_new_walls": new_walls,
        "donor_walls_to_reuse": [wall_reuse_north],
        "donor_walls_to_split": [],
        "donor_walls_to_delete": [],
        "space_plans": [donor_space_plan, toilet_space_plan],
        "wall_plans": [wall_reuse_north, *new_walls],
        "door_plan": door_plan,
        "door_plans": [door_plan],
        "window_plan": window_plan,
        "window_plans": [window_plan],
        "existing_openings_to_remove": donor_door_conflicts,
        "existing_openings_to_relocate": [],
        "existing_openings_plan": existing_openings_plan,
        "forbidden_existing_openings": donor_door_conflicts + donor_window_conflicts,
        "bedroom_quality_metrics": None,
        "toilet_readability_metrics": toilet_readability_metrics,
        "validation_errors": validation_errors,
        "validation_warnings": validation_warnings,
        "validation_issues": validation_issues,
        "clarification_questions": [],
        "completeness_check": completeness_check,
        "split_remainder_room_name": donor["name"],
        "split_remainder_room_type": donor["type"],
        "split_operation": None,
        "score": 0.0,
    }
    return plan


def _build_bathroom_edge_candidate(
    *,
    ifc_context: IFCContext,
    floor: int,
    anchor: SpaceContext,
    boundary: BoundaryContext,
    preferred_width_mm: int,
    preferred_height_mm: int,
) -> ToiletInsertionPlan | None:
    donor = anchor
    donor_polygon = donor.get("polygon") or []
    if not donor_polygon:
        return None
    corridor = _find_anchor_adjacent_corridor(ifc_context=ifc_context, floor=floor, anchor=anchor)
    if corridor is None or not corridor.get("polygon"):
        return None

    wall_by_id = {
        wall["id"]: wall for wall in ifc_context.get("walls", []) if wall.get("floor") == floor
    }
    storey = _find_storey(ifc_context.get("storeys", []), floor)
    if storey is None:
        return None

    donor_bbox = _bbox(donor_polygon)
    corridor_polygon = corridor["polygon"]
    corridor_bbox = _bbox(corridor_polygon)
    width_mm = max(preferred_width_mm + 100, 1500)
    toilet_max_x = donor_bbox[2]
    toilet_min_x = max(donor_bbox[0], toilet_max_x - width_mm)
    toilet_min_y = donor_bbox[1]
    toilet_max_y = donor_bbox[3]
    if toilet_max_x - toilet_min_x < MIN_TOILET_WIDTH_MM:
        return None
    if toilet_max_y - toilet_min_y < MIN_TOILET_DEPTH_MM:
        return None

    toilet_polygon = [
        (toilet_min_x, toilet_min_y),
        (toilet_max_x, toilet_min_y),
        (toilet_max_x, toilet_max_y),
        (toilet_min_x, toilet_max_y),
    ]
    donor_after = [
        (donor_bbox[0], donor_bbox[1]),
        (toilet_min_x, donor_bbox[1]),
        (toilet_min_x, donor_bbox[3]),
        (donor_bbox[0], donor_bbox[3]),
    ]

    exterior_segments = _dedupe_segments(
        find_exterior_contact_segments(toilet_polygon, boundary["outer_polygon"])
    )
    if not exterior_segments:
        return None
    exterior_wall_segment = next(
        (segment for segment in exterior_segments if _is_horizontal(*segment)),
        _select_primary_exterior_segment(exterior_segments),
    )

    bathroom_segment = _find_parallel_contact_segment(
        polygon_a=toilet_polygon,
        polygon_b=donor_after,
        max_gap_mm=BATHROOM_NEAR_GAP_MM,
    )
    if bathroom_segment is None:
        return None
    bathroom_partition_gap = _parallel_polygon_gap_mm(toilet_polygon, donor_after)
    if bathroom_partition_gap is None or bathroom_partition_gap > TOLERANCE_MM:
        return None

    entrance_segments, entrance_warnings = find_entrance_segments(
        doors=ifc_context.get("doors", []),
        walls=ifc_context.get("walls", []),
        outer_polygon=boundary["outer_polygon"],
        floor=floor,
    )
    if is_segment_on_entrance_face(exterior_wall_segment, entrance_segments):
        return None

    if not _validate_space_minimums(donor_type="bathroom", polygon=donor_after):
        return None
    if (
        not cast(Any, Polygon(donor_after)).is_valid
        or not cast(Any, Polygon(toilet_polygon)).is_valid
    ):
        return None

    north_edge = ((toilet_min_x, toilet_max_y), (toilet_max_x, toilet_max_y))
    south_edge = ((toilet_min_x, toilet_min_y), (toilet_max_x, toilet_min_y))
    west_edge = ((toilet_min_x, toilet_min_y), (toilet_min_x, toilet_max_y))
    east_edge = ((toilet_max_x, toilet_min_y), (toilet_max_x, toilet_max_y))
    donor_north_edge = (
        (donor_bbox[0], donor_bbox[3]),
        (toilet_min_x, donor_bbox[3]),
    )
    donor_south_edge = (
        (donor_bbox[0], donor_bbox[1]),
        (toilet_min_x, donor_bbox[1]),
    )
    donor_west_edge = (
        (donor_bbox[0], donor_bbox[1]),
        (donor_bbox[0], donor_bbox[3]),
    )

    reused_north = _find_nearby_wall_for_segment(
        wall_by_id.values(),
        (
            (donor_bbox[0], donor_bbox[3]),
            (donor_bbox[2], donor_bbox[3]),
        ),
        max_gap_mm=300.0,
    )
    reused_south = _find_nearby_wall_for_segment(
        wall_by_id.values(),
        (
            (donor_bbox[0], donor_bbox[1]),
            (donor_bbox[2], donor_bbox[1]),
        ),
        max_gap_mm=300.0,
    )
    reused_east = _find_nearby_wall_for_segment(
        wall_by_id.values(),
        east_edge,
        max_gap_mm=300.0,
    )
    reused_west = _find_nearby_wall_for_segment(
        wall_by_id.values(),
        donor_west_edge,
        max_gap_mm=300.0,
    )
    if reused_north is None or reused_south is None or reused_east is None or reused_west is None:
        return None

    corridor_contact = _find_parallel_contact_segment(
        polygon_a=toilet_polygon,
        polygon_b=corridor_polygon,
        max_gap_mm=BATHROOM_NEAR_GAP_MM,
    )
    if corridor_contact is None:
        return None

    south_wall_length_mm = abs(south_edge[1][0] - south_edge[0][0])
    door_width_mm = min(
        900,
        max(MIN_TOILET_DOOR_WIDTH_MM, round(south_wall_length_mm - 400)),
    )
    door_offset_mm = max(150.0, (south_wall_length_mm - door_width_mm) / 2.0)
    exterior_wall_length_mm = _segment_length(exterior_wall_segment)
    window_width_mm = min(
        700,
        max(MIN_TOILET_WINDOW_WIDTH_MM, round(exterior_wall_length_mm - 400)),
    )
    window_offset_mm = max(100.0, (exterior_wall_length_mm - window_width_mm) / 2.0)

    toilet_origin = (toilet_min_x, toilet_min_y)
    toilet_local_polygon = _world_to_local_polygon(
        polygon=toilet_polygon,
        origin_x=toilet_origin[0],
        origin_y=toilet_origin[1],
        angle_deg=0.0,
    )
    donor_origin = (donor.get("x") or 0.0, donor.get("y") or 0.0)
    corridor_origin = (corridor.get("x") or 0.0, corridor.get("y") or 0.0)

    donor_space_plan: SpacePlan = {
        "local_id": donor["id"],
        "global_id": donor["id"],
        "name": donor["name"],
        "space_type": donor["type"],
        "locked": donor.get("locked", False),
        "storey_id": storey["id"],
        "polygon_world_mm": donor_after,
        "polygon_local_mm": _world_to_local_polygon(
            polygon=donor_after,
            origin_x=donor_origin[0],
            origin_y=donor_origin[1],
            angle_deg=donor.get("angle") or 0.0,
        ),
        "placement_world_mm": donor_origin,
        "pset_updates": {
            "Width": round(_bbox(donor_after)[2] - _bbox(donor_after)[0]),
            "Height": round(_bbox(donor_after)[3] - _bbox(donor_after)[1]),
            "Shape": "poly",
            "SpaceType": donor["type"],
            "Locked": donor.get("locked", False),
        },
        "walls_bounding": [
            "reuse-north-bathroom-exterior",
            "reuse-south-bathroom-corridor",
            "reuse-west-bathroom-exterior",
            "new-bathroom-toilet-divider",
        ],
    }
    corridor_space_plan: SpacePlan = {
        "local_id": corridor["id"],
        "global_id": corridor["id"],
        "name": corridor["name"],
        "space_type": corridor["type"],
        "locked": corridor.get("locked", False),
        "storey_id": storey["id"],
        "polygon_world_mm": corridor_polygon,
        "polygon_local_mm": _world_to_local_polygon(
            polygon=corridor_polygon,
            origin_x=corridor_origin[0],
            origin_y=corridor_origin[1],
            angle_deg=corridor.get("angle") or 0.0,
        ),
        "placement_world_mm": corridor_origin,
        "pset_updates": {
            "Width": round(corridor_bbox[2] - corridor_bbox[0]),
            "Height": round(corridor_bbox[3] - corridor_bbox[1]),
            "Shape": "poly",
            "SpaceType": corridor["type"],
            "Locked": corridor.get("locked", False),
        },
        "walls_bounding": ["reuse-south-bathroom-corridor", "reuse-south-toilet-corridor"],
    }
    toilet_space_plan: SpacePlan = {
        "local_id": "new-toilet",
        "global_id": None,
        "name": TOILET_NAME,
        "space_type": "bathroom",
        "locked": False,
        "storey_id": storey["id"],
        "polygon_world_mm": toilet_polygon,
        "polygon_local_mm": toilet_local_polygon,
        "placement_world_mm": toilet_origin,
        "pset_updates": {
            "Width": round(toilet_max_x - toilet_min_x),
            "Height": round(toilet_max_y - toilet_min_y),
            "Shape": "poly",
            "SpaceType": "bathroom",
            "Locked": False,
        },
        "walls_bounding": [
            "reuse-north-toilet-exterior",
            "reuse-south-toilet-corridor",
            "new-bathroom-toilet-divider",
            "reuse-east-toilet-boundary",
        ],
    }

    reused_walls: list[WallPlan] = [
        {
            "wall_local_id": "reuse-north-bathroom-exterior",
            "source": "existing",
            "global_id": reused_north["id"],
            "start_mm": donor_north_edge[0],
            "end_mm": donor_north_edge[1],
            "thickness_mm": reused_north["thickness"],
            "kind": "EXTERIOR",
            "bounded_room_ids": [donor["id"]],
            "hosts": [],
        },
        {
            "wall_local_id": "reuse-north-toilet-exterior",
            "source": "existing",
            "global_id": reused_north["id"],
            "start_mm": north_edge[0],
            "end_mm": north_edge[1],
            "thickness_mm": reused_north["thickness"],
            "kind": "EXTERIOR",
            "bounded_room_ids": ["new-toilet"],
            "hosts": ["toilet-window"],
        },
        {
            "wall_local_id": "reuse-south-bathroom-corridor",
            "source": "existing",
            "global_id": reused_south["id"],
            "start_mm": donor_south_edge[0],
            "end_mm": donor_south_edge[1],
            "thickness_mm": reused_south["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": [donor["id"], corridor["id"]],
            "hosts": [],
        },
        {
            "wall_local_id": "reuse-south-toilet-corridor",
            "source": "existing",
            "global_id": reused_south["id"],
            "start_mm": south_edge[0],
            "end_mm": south_edge[1],
            "thickness_mm": reused_south["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": ["new-toilet", corridor["id"]],
            "hosts": ["toilet-door"],
        },
        {
            "wall_local_id": "reuse-west-bathroom-exterior",
            "source": "existing",
            "global_id": reused_west["id"],
            "start_mm": donor_west_edge[0],
            "end_mm": donor_west_edge[1],
            "thickness_mm": reused_west["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": [donor["id"]],
            "hosts": [],
        },
        {
            "wall_local_id": "reuse-east-toilet-boundary",
            "source": "existing",
            "global_id": reused_east["id"],
            "start_mm": east_edge[0],
            "end_mm": east_edge[1],
            "thickness_mm": reused_east["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": ["new-toilet"],
            "hosts": [],
        },
    ]
    new_walls: list[WallPlan] = [
        {
            "wall_local_id": "new-bathroom-toilet-divider",
            "source": "new",
            "global_id": None,
            "start_mm": west_edge[0],
            "end_mm": west_edge[1],
            "thickness_mm": reused_east["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": [donor["id"], "new-toilet"],
            "hosts": [],
        }
    ]
    door_plan: DoorPlan = {
        "local_id": "toilet-door",
        "host_wall_local_id": "reuse-south-toilet-corridor",
        "segment_along_wall_mm": (door_offset_mm, door_offset_mm + door_width_mm),
        "width_mm": door_width_mm,
        "height_mm": 2100,
        "swing_in_space_id": corridor["id"],
        "opens_toward_space_id": corridor["id"],
        "swing_clearance_radius_mm": door_width_mm,
    }
    window_plan: WindowPlan = {
        "local_id": "toilet-window",
        "host_wall_local_id": "reuse-north-toilet-exterior",
        "segment_along_wall_mm": (window_offset_mm, window_offset_mm + window_width_mm),
        "width_mm": window_width_mm,
        "height_mm": 900,
        "sill_height_mm": 1000,
        "inherits_size_from_opening_id": None,
    }

    validation_errors: list[str] = []
    validation_warnings = list(entrance_warnings)
    validation_issues = _build_validation_issues(
        errors=validation_errors,
        warnings=validation_warnings,
    )
    toilet_readability_metrics = _build_toilet_readability_metrics(
        toilet_polygon=toilet_polygon,
        exterior_wall_segment=exterior_wall_segment,
        interior_door_wall_segment=south_edge,
    )
    plan: ToiletInsertionPlan = {
        "plan_schema_version": PLAN_SCHEMA_VERSION,
        "status": "planned" if not validation_errors else "rejected",
        "user_intent": "shared_toilet_any_strategy",
        "floor": floor,
        "storey_id": storey["id"],
        "strategy": "bathroom_edge",
        "anchor_room_id": anchor["id"],
        "anchor_room_name": anchor["name"],
        "donor_room_id": donor["id"],
        "donor_room_name": donor["name"],
        "donor_room_type": donor["type"],
        "donor_strategy_used": "bathroom_edge_full",
        "toilet_name": TOILET_NAME,
        "toilet_space_type": "bathroom",
        "toilet_locked": False,
        "preferred_width_mm": round(toilet_max_x - toilet_min_x),
        "preferred_height_mm": round(toilet_max_y - toilet_min_y),
        "toilet_world_polygon_mm": toilet_polygon,
        "toilet_local_origin_world_mm": toilet_origin,
        "toilet_local_polygon_mm": toilet_local_polygon,
        "toilet_pset_updates": toilet_space_plan["pset_updates"],
        "donor_polygon_before_world_mm": [(x, y) for x, y in donor_polygon],
        "donor_polygon_after_world_mm": donor_after,
        "bathroom_adjacency_kind": "shared_edge",
        "bathroom_shared_edge_length_mm": _segment_length(bathroom_segment),
        "bathroom_shared_edge_segment_mm": bathroom_segment,
        "bathroom_partition_gap_mm": bathroom_partition_gap,
        "bathroom_indirect_adjacency_via_donor": False,
        "exterior_wall_segment_mm": exterior_wall_segment,
        "interior_door_wall_segment_mm": south_edge,
        "donor_remaining_min_clearance_mm": round(_bbox(donor_after)[2] - _bbox(donor_after)[0]),
        "donor_existing_doors_inside_toilet_polygon": [],
        "donor_existing_windows_inside_toilet_polygon": [],
        "donor_reachability_after_carve": True,
        "entrance_segments_mm": entrance_segments,
        "affected_space_ids": [donor["id"]],
        "untouched_space_ids": [
            space["id"]
            for space in ifc_context.get("spaces", [])
            if space.get("floor") == floor and space["id"] not in {donor["id"], corridor["id"]}
        ],
        "required_new_walls": new_walls,
        "donor_walls_to_reuse": reused_walls,
        "donor_walls_to_split": [],
        "donor_walls_to_delete": [],
        "space_plans": [donor_space_plan, corridor_space_plan, toilet_space_plan],
        "wall_plans": [*reused_walls, *new_walls],
        "door_plan": door_plan,
        "door_plans": [door_plan],
        "window_plan": window_plan,
        "window_plans": [window_plan],
        "existing_openings_to_remove": [],
        "existing_openings_to_relocate": [],
        "existing_openings_plan": [],
        "forbidden_existing_openings": [],
        "bedroom_quality_metrics": None,
        "toilet_readability_metrics": toilet_readability_metrics,
        "validation_errors": validation_errors,
        "validation_warnings": validation_warnings,
        "validation_issues": validation_issues,
        "clarification_questions": [],
        "completeness_check": build_opening_completeness_check(
            affected_opening_ids=[],
            opening_plans=[],
        ),
        "split_remainder_room_name": donor["name"],
        "split_remainder_room_type": donor["type"],
        "split_operation": None,
        "score": 0.0,
    }
    return plan


def _build_bedroom_edge_candidate(
    *,
    ifc_context: IFCContext,
    floor: int,
    anchor: SpaceContext,
    donor: SpaceContext,
    boundary: BoundaryContext,
    preferred_width_mm: int,
    preferred_height_mm: int,
) -> ToiletInsertionPlan | None:
    donor_polygon = donor.get("polygon") or []
    anchor_polygon = anchor.get("polygon") or []
    if not donor_polygon or not anchor_polygon:
        return None

    corridor = _find_anchor_adjacent_corridor(ifc_context=ifc_context, floor=floor, anchor=anchor)
    if corridor is None or not corridor.get("polygon"):
        return None

    wall_by_id = {
        wall["id"]: wall for wall in ifc_context.get("walls", []) if wall.get("floor") == floor
    }
    storey = _find_storey(ifc_context.get("storeys", []), floor)
    if storey is None:
        return None

    donor_bbox = _bbox(donor_polygon)
    anchor_bbox = _bbox(anchor_polygon)
    corridor_polygon = corridor["polygon"]
    corridor_bbox = _bbox(corridor_polygon)

    toilet_width_mm = max(MIN_TOILET_WIDTH_MM + 500, preferred_width_mm)
    toilet_min_x = anchor_bbox[2]
    toilet_max_x = min(donor_bbox[2], toilet_min_x + toilet_width_mm)
    toilet_max_y = donor_bbox[3]
    toilet_min_y = max(donor_bbox[1], toilet_max_y - preferred_height_mm)
    if toilet_max_x - toilet_min_x < MIN_TOILET_WIDTH_MM:
        return None
    if toilet_max_y - toilet_min_y < MIN_TOILET_DEPTH_MM:
        return None

    toilet_polygon = [
        (toilet_min_x, toilet_min_y),
        (toilet_max_x, toilet_min_y),
        (toilet_max_x, toilet_max_y),
        (toilet_min_x, toilet_max_y),
    ]
    corridor_extension_polygon = [
        (corridor_bbox[2], donor_bbox[1]),
        (toilet_max_x, donor_bbox[1]),
        (toilet_max_x, toilet_min_y),
        (corridor_bbox[2], toilet_min_y),
    ]
    corridor_after_shape = shapely_union_all(
        [Polygon(corridor_polygon), Polygon(corridor_extension_polygon)]
    )
    if cast(Any, corridor_after_shape).geom_type != "Polygon":
        return None
    corridor_after = _polygon_from_shape(corridor_after_shape)
    donor_after = [
        (toilet_max_x, donor_bbox[1]),
        (donor_bbox[2], donor_bbox[1]),
        (donor_bbox[2], donor_bbox[3]),
        (toilet_max_x, donor_bbox[3]),
    ]

    exterior_segments = _dedupe_segments(
        find_exterior_contact_segments(toilet_polygon, boundary["outer_polygon"])
    )
    if not exterior_segments:
        return None
    exterior_wall_segment = next(
        (segment for segment in exterior_segments if _is_horizontal(*segment)),
        _select_primary_exterior_segment(exterior_segments),
    )

    bathroom_segment = _find_parallel_contact_segment(
        polygon_a=toilet_polygon,
        polygon_b=anchor_polygon,
        max_gap_mm=BATHROOM_NEAR_GAP_MM,
    )
    if bathroom_segment is None:
        return None
    bathroom_partition_gap = _parallel_polygon_gap_mm(toilet_polygon, anchor_polygon)
    if bathroom_partition_gap is None or bathroom_partition_gap > 300.0:
        return None
    adjacency_kind: Literal["shared_edge", "shared_wall_partition", "none"]
    if bathroom_partition_gap <= TOLERANCE_MM:
        adjacency_kind = "shared_edge"
    else:
        adjacency_kind = "shared_wall_partition"

    entrance_segments, entrance_warnings = find_entrance_segments(
        doors=ifc_context.get("doors", []),
        walls=ifc_context.get("walls", []),
        outer_polygon=boundary["outer_polygon"],
        floor=floor,
    )
    if is_segment_on_entrance_face(exterior_wall_segment, entrance_segments):
        return None

    if not _validate_space_minimums(donor_type=donor["type"], polygon=donor_after):
        return None
    if not _validate_space_minimums(donor_type=corridor["type"], polygon=corridor_after):
        return None
    if (
        not cast(Any, Polygon(donor_after)).is_valid
        or not cast(Any, Polygon(corridor_after)).is_valid
    ):
        return None

    bedroom_quality_metrics = _build_bedroom_quality_metrics(
        before_polygon=donor_polygon,
        after_polygon=donor_after,
    )
    if not _is_bedroom_shape_acceptable(bedroom_quality_metrics):
        return None

    toilet_origin = (toilet_min_x, toilet_min_y)
    toilet_local_polygon = _world_to_local_polygon(
        polygon=toilet_polygon,
        origin_x=toilet_origin[0],
        origin_y=toilet_origin[1],
        angle_deg=0.0,
    )
    north_edge = ((toilet_min_x, toilet_max_y), (toilet_max_x, toilet_max_y))
    west_edge = ((toilet_min_x, toilet_min_y), (toilet_min_x, toilet_max_y))
    south_edge = ((toilet_min_x, toilet_min_y), (toilet_max_x, toilet_min_y))
    east_edge = ((toilet_max_x, toilet_min_y), (toilet_max_x, toilet_max_y))
    east_corridor_edge = ((toilet_max_x, donor_bbox[1]), (toilet_max_x, toilet_min_y))

    reused_north = _find_nearby_wall_for_segment(
        wall_by_id.values(),
        north_edge,
        max_gap_mm=400.0,
    )
    reused_west = _find_nearby_wall_for_segment(
        wall_by_id.values(),
        west_edge,
        max_gap_mm=300.0,
    )
    reused_east = _find_nearby_wall_for_segment(
        wall_by_id.values(),
        (
            (donor_bbox[2], donor_bbox[1]),
            (donor_bbox[2], donor_bbox[3]),
        ),
        max_gap_mm=400.0,
    )
    if reused_north is None or reused_west is None or reused_east is None:
        return None

    south_wall_length_mm = abs(south_edge[1][0] - south_edge[0][0])
    door_width_mm = min(
        900,
        max(MIN_TOILET_DOOR_WIDTH_MM, round(south_wall_length_mm - 400)),
    )
    door_offset_mm = max(150.0, (south_wall_length_mm - door_width_mm) / 2.0)
    exterior_wall_length_mm = _segment_length(exterior_wall_segment)
    window_width_mm = min(
        700,
        max(MIN_TOILET_WINDOW_WIDTH_MM, round(exterior_wall_length_mm - 400)),
    )
    window_offset_mm = max(100.0, (exterior_wall_length_mm - window_width_mm) / 2.0)

    donor_space_plan: SpacePlan = {
        "local_id": donor["id"],
        "global_id": donor["id"],
        "name": donor["name"],
        "space_type": donor["type"],
        "locked": donor.get("locked", False),
        "storey_id": storey["id"],
        "polygon_world_mm": donor_after,
        "polygon_local_mm": _world_to_local_polygon(
            polygon=donor_after,
            origin_x=donor.get("x") or 0.0,
            origin_y=donor.get("y") or 0.0,
            angle_deg=donor.get("angle") or 0.0,
        ),
        "placement_world_mm": (donor.get("x") or 0.0, donor.get("y") or 0.0),
        "pset_updates": {
            "Width": round(_bbox(donor_after)[2] - _bbox(donor_after)[0]),
            "Height": round(_bbox(donor_after)[3] - _bbox(donor_after)[1]),
            "Shape": "poly",
            "SpaceType": donor["type"],
            "Locked": donor.get("locked", False),
        },
        "walls_bounding": [
            "reuse-north-bedroom-exterior",
            "new-east-toilet-divider",
            "new-east-corridor-divider",
            "reuse-east-bedroom-exterior",
        ],
    }
    corridor_space_plan: SpacePlan = {
        "local_id": corridor["id"],
        "global_id": corridor["id"],
        "name": corridor["name"],
        "space_type": corridor["type"],
        "locked": corridor.get("locked", False),
        "storey_id": storey["id"],
        "polygon_world_mm": corridor_after,
        "polygon_local_mm": _world_to_local_polygon(
            polygon=corridor_after,
            origin_x=corridor.get("x") or 0.0,
            origin_y=corridor.get("y") or 0.0,
            angle_deg=corridor.get("angle") or 0.0,
        ),
        "placement_world_mm": (
            corridor.get("x") or 0.0,
            corridor.get("y") or 0.0,
        ),
        "pset_updates": {
            "Width": round(_bbox(corridor_after)[2] - _bbox(corridor_after)[0]),
            "Height": round(_bbox(corridor_after)[3] - _bbox(corridor_after)[1]),
            "Shape": "poly",
            "SpaceType": corridor["type"],
            "Locked": corridor.get("locked", False),
        },
        "walls_bounding": [
            "new-south-divider",
            "reuse-west-bathroom-partition",
            "new-east-corridor-divider",
        ],
    }
    toilet_space_plan: SpacePlan = {
        "local_id": "new-toilet",
        "global_id": None,
        "name": TOILET_NAME,
        "space_type": "bathroom",
        "locked": False,
        "storey_id": storey["id"],
        "polygon_world_mm": toilet_polygon,
        "polygon_local_mm": toilet_local_polygon,
        "placement_world_mm": toilet_origin,
        "pset_updates": {
            "Width": round(toilet_max_x - toilet_min_x),
            "Height": round(toilet_max_y - toilet_min_y),
            "Shape": "poly",
            "SpaceType": "bathroom",
            "Locked": False,
        },
        "walls_bounding": [
            "reuse-north-exterior",
            "reuse-west-bathroom-partition",
            "new-south-divider",
            "new-east-toilet-divider",
        ],
    }
    reused_walls: list[WallPlan] = [
        {
            "wall_local_id": "reuse-north-exterior",
            "source": "existing",
            "global_id": reused_north["id"],
            "start_mm": north_edge[0],
            "end_mm": north_edge[1],
            "thickness_mm": reused_north["thickness"],
            "kind": "EXTERIOR",
            "bounded_room_ids": ["new-toilet"],
            "hosts": ["toilet-window"],
        },
        {
            "wall_local_id": "reuse-north-bedroom-exterior",
            "source": "existing",
            "global_id": reused_north["id"],
            "start_mm": (toilet_max_x, toilet_max_y),
            "end_mm": (donor_bbox[2], donor_bbox[3]),
            "thickness_mm": reused_north["thickness"],
            "kind": "EXTERIOR",
            "bounded_room_ids": [donor["id"]],
            "hosts": [],
        },
        {
            "wall_local_id": "reuse-west-bathroom-partition",
            "source": "existing",
            "global_id": reused_west["id"],
            "start_mm": west_edge[0],
            "end_mm": west_edge[1],
            "thickness_mm": reused_west["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": [anchor["id"], "new-toilet"],
            "hosts": [],
        },
        {
            "wall_local_id": "reuse-east-bedroom-exterior",
            "source": "existing",
            "global_id": reused_east["id"],
            "start_mm": (donor_bbox[2], donor_bbox[1]),
            "end_mm": (donor_bbox[2], donor_bbox[3]),
            "thickness_mm": reused_east["thickness"],
            "kind": "EXTERIOR",
            "bounded_room_ids": [donor["id"]],
            "hosts": [],
        },
    ]
    new_walls: list[WallPlan] = [
        {
            "wall_local_id": "new-south-divider",
            "source": "new",
            "global_id": None,
            "start_mm": south_edge[0],
            "end_mm": south_edge[1],
            "thickness_mm": 200,
            "kind": "INTERIOR",
            "bounded_room_ids": [corridor["id"], "new-toilet"],
            "hosts": ["toilet-door"],
        },
        {
            "wall_local_id": "new-east-toilet-divider",
            "source": "new",
            "global_id": None,
            "start_mm": east_edge[0],
            "end_mm": east_edge[1],
            "thickness_mm": reused_east["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": ["new-toilet", donor["id"]],
            "hosts": [],
        },
        {
            "wall_local_id": "new-east-corridor-divider",
            "source": "new",
            "global_id": None,
            "start_mm": east_corridor_edge[0],
            "end_mm": east_corridor_edge[1],
            "thickness_mm": reused_east["thickness"],
            "kind": "INTERIOR",
            "bounded_room_ids": [corridor["id"], donor["id"]],
            "hosts": [],
        },
    ]
    door_plan: DoorPlan = {
        "local_id": "toilet-door",
        "host_wall_local_id": "new-south-divider",
        "segment_along_wall_mm": (door_offset_mm, door_offset_mm + door_width_mm),
        "width_mm": door_width_mm,
        "height_mm": 2100,
        "swing_in_space_id": corridor["id"],
        "opens_toward_space_id": corridor["id"],
        "swing_clearance_radius_mm": door_width_mm,
    }
    window_plan: WindowPlan = {
        "local_id": "toilet-window",
        "host_wall_local_id": "reuse-north-exterior",
        "segment_along_wall_mm": (window_offset_mm, window_offset_mm + window_width_mm),
        "width_mm": window_width_mm,
        "height_mm": 900,
        "sill_height_mm": 1000,
        "inherits_size_from_opening_id": None,
    }

    existing_window_plans = _classify_existing_openings_plan(
        opening_ids=_openings_inside_polygon(
            openings=ifc_context.get("windows", []),
            wall_by_id=wall_by_id,
            polygon=toilet_polygon,
            floor=floor,
        ),
        opening_type="window",
        decision="remove",
    )
    existing_door_plans = _classify_existing_openings_plan(
        opening_ids=_openings_inside_polygon(
            openings=ifc_context.get("doors", []),
            wall_by_id=wall_by_id,
            polygon=toilet_polygon,
            floor=floor,
        ),
        opening_type="door",
        decision="remove",
    )
    validation_errors: list[str] = []
    validation_warnings = list(entrance_warnings)
    validation_issues = _build_validation_issues(
        errors=validation_errors,
        warnings=validation_warnings,
    )
    toilet_readability_metrics = _build_toilet_readability_metrics(
        toilet_polygon=toilet_polygon,
        exterior_wall_segment=exterior_wall_segment,
        interior_door_wall_segment=south_edge,
    )
    affected_space_ids = [donor["id"], corridor["id"]]
    untouched_space_ids = [
        space["id"]
        for space in ifc_context.get("spaces", [])
        if space.get("floor") == floor
        and space["id"] not in {donor["id"], anchor["id"], corridor["id"]}
    ]

    plan: ToiletInsertionPlan = {
        "plan_schema_version": PLAN_SCHEMA_VERSION,
        "status": "planned" if not validation_errors else "rejected",
        "user_intent": "shared_toilet_any_strategy",
        "floor": floor,
        "storey_id": storey["id"],
        "strategy": "bedroom_edge",
        "anchor_room_id": anchor["id"],
        "anchor_room_name": anchor["name"],
        "donor_room_id": donor["id"],
        "donor_room_name": donor["name"],
        "donor_room_type": donor["type"],
        "donor_strategy_used": "bedroom_edge_full",
        "toilet_name": TOILET_NAME,
        "toilet_space_type": "bathroom",
        "toilet_locked": False,
        "preferred_width_mm": round(toilet_max_x - toilet_min_x),
        "preferred_height_mm": round(toilet_max_y - toilet_min_y),
        "toilet_world_polygon_mm": toilet_polygon,
        "toilet_local_origin_world_mm": toilet_origin,
        "toilet_local_polygon_mm": toilet_local_polygon,
        "toilet_pset_updates": toilet_space_plan["pset_updates"],
        "donor_polygon_before_world_mm": [(x, y) for x, y in donor_polygon],
        "donor_polygon_after_world_mm": donor_after,
        "bathroom_adjacency_kind": adjacency_kind,
        "bathroom_shared_edge_length_mm": _segment_length(bathroom_segment),
        "bathroom_shared_edge_segment_mm": bathroom_segment,
        "bathroom_partition_gap_mm": bathroom_partition_gap,
        "bathroom_indirect_adjacency_via_donor": adjacency_kind != "none",
        "exterior_wall_segment_mm": exterior_wall_segment,
        "interior_door_wall_segment_mm": south_edge,
        "donor_remaining_min_clearance_mm": round(donor_bbox[2] - donor_bbox[0]),
        "donor_existing_doors_inside_toilet_polygon": [],
        "donor_existing_windows_inside_toilet_polygon": [],
        "donor_reachability_after_carve": True,
        "entrance_segments_mm": entrance_segments,
        "affected_space_ids": affected_space_ids,
        "untouched_space_ids": untouched_space_ids,
        "required_new_walls": new_walls,
        "donor_walls_to_reuse": reused_walls,
        "donor_walls_to_split": [],
        "donor_walls_to_delete": [],
        "space_plans": [donor_space_plan, corridor_space_plan, toilet_space_plan],
        "wall_plans": [*reused_walls, *new_walls],
        "door_plan": door_plan,
        "door_plans": [door_plan],
        "window_plan": window_plan,
        "window_plans": [window_plan],
        "existing_openings_to_remove": [],
        "existing_openings_to_relocate": [],
        "existing_openings_plan": [*existing_door_plans, *existing_window_plans],
        "forbidden_existing_openings": [],
        "bedroom_quality_metrics": bedroom_quality_metrics,
        "toilet_readability_metrics": toilet_readability_metrics,
        "validation_errors": validation_errors,
        "validation_warnings": validation_warnings,
        "validation_issues": validation_issues,
        "clarification_questions": [],
        "completeness_check": build_opening_completeness_check(
            affected_opening_ids=[
                *(plan["global_id"] for plan in existing_door_plans),
                *(plan["global_id"] for plan in existing_window_plans),
            ],
            opening_plans=[*existing_door_plans, *existing_window_plans],
        ),
        "split_remainder_room_name": donor["name"],
        "split_remainder_room_type": donor["type"],
        "split_operation": None,
        "score": 0.0,
    }
    return plan


def shared_edge_length(
    polygon_a: list[tuple[float, float]],
    polygon_b: list[tuple[float, float]],
) -> float:
    line_a = cast(Any, LineString)(_closed_polygon(polygon_a))
    line_b = cast(Any, LineString)(_closed_polygon(polygon_b))
    return float(cast(Any, line_a.intersection(line_b)).length)


def find_exterior_contact_segments(
    polygon: list[tuple[float, float]],
    outer_polygon: list[tuple[float, float]],
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    outer_boundary = cast(Any, LineString)(_closed_polygon(outer_polygon))
    segments: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for start, end in _polygon_edges(polygon):
        edge = cast(Any, LineString)([start, end])
        if (
            cast(Any, edge.intersection(outer_boundary)).length
            >= cast(Any, edge).length - TOLERANCE_MM
        ):
            segments.append((start, end))
    return segments


def find_entrance_segments(
    *,
    doors: list[DoorContext],
    walls: list[WallContext],
    outer_polygon: list[tuple[float, float]],
    floor: int,
) -> tuple[list[tuple[tuple[float, float], tuple[float, float]]], list[str]]:
    wall_by_id = {wall["id"]: wall for wall in walls if wall.get("floor") == floor}
    candidates: list[tuple[tuple[float, float], tuple[float, float]]] = []
    warnings: list[str] = []
    for door in doors:
        if door.get("floor") != floor:
            continue
        host_wall = wall_by_id.get(door["host_wall_id"])
        if host_wall is None:
            continue
        segment = (_as_point2(host_wall["start"]), _as_point2(host_wall["end"]))
        if is_exterior_segment(segment, outer_polygon):
            candidates.append(segment)
    if not candidates:
        warnings.append("entrance_not_detected")
        return [], warnings
    return _dedupe_segments(candidates), warnings


def is_exterior_segment(
    segment: tuple[tuple[float, float], tuple[float, float]],
    outer_polygon: list[tuple[float, float]],
) -> bool:
    edge = cast(Any, LineString)([segment[0], segment[1]])
    outer_boundary = cast(Any, LineString)(_closed_polygon(outer_polygon))
    return (
        cast(Any, edge.intersection(outer_boundary)).length
        >= cast(Any, edge).length - TOLERANCE_MM
    )


def is_segment_on_entrance_face(
    segment: tuple[tuple[float, float], tuple[float, float]],
    entrance_segments: list[tuple[tuple[float, float], tuple[float, float]]],
) -> bool:
    target = cast(Any, LineString)([segment[0], segment[1]])
    for entrance in entrance_segments:
        other = cast(Any, LineString)([entrance[0], entrance[1]])
        if cast(Any, target.intersection(other)).length > TOLERANCE_MM:
            return True
    return False


def _candidate_spaces(
    ifc_context: IFCContext,
    *,
    floor: int,
    anchor: SpaceContext,
) -> list[SpaceContext]:
    space_by_id = {
        space["id"]: space for space in ifc_context.get("spaces", []) if space.get("floor") == floor
    }
    candidate_ids: list[str] = []
    for edge in ifc_context.get("adjacency", []):
        if edge["space_a_id"] == anchor["id"] and edge["space_b_id"] in space_by_id:
            candidate_ids.append(edge["space_b_id"])
        elif edge["space_b_id"] == anchor["id"] and edge["space_a_id"] in space_by_id:
            candidate_ids.append(edge["space_a_id"])
    for space in space_by_id.values():
        if space["id"] == anchor["id"]:
            continue
        if space.get("type") != "bedroom":
            continue
        if (
            _find_parallel_contact_segment(
                polygon_a=space.get("polygon") or [],
                polygon_b=anchor.get("polygon") or [],
                max_gap_mm=BATHROOM_NEAR_GAP_MM,
            )
            is not None
        ):
            candidate_ids.append(space["id"])
    candidates = [space_by_id[space_id] for space_id in dict.fromkeys(candidate_ids)]
    candidates.sort(
        key=lambda space: (
            _donor_priority(space.get("type")),
            -int((space.get("width") or 0) * (space.get("height") or 0)),
            space.get("name") or "",
        )
    )
    return candidates


def _resolve_anchor_bathroom(
    spaces: list[SpaceContext],
    *,
    anchor_room_name: str | None,
) -> SpaceContext | None:
    if anchor_room_name:
        for space in spaces:
            if space.get("name") == anchor_room_name:
                return space
    return find_bathroom_anchor(spaces)


def _find_anchor_adjacent_corridor(
    *,
    ifc_context: IFCContext,
    floor: int,
    anchor: SpaceContext,
) -> SpaceContext | None:
    space_by_id = {
        space["id"]: space for space in ifc_context.get("spaces", []) if space.get("floor") == floor
    }
    for edge in ifc_context.get("adjacency", []):
        other_id = None
        if edge["space_a_id"] == anchor["id"]:
            other_id = edge["space_b_id"]
        elif edge["space_b_id"] == anchor["id"]:
            other_id = edge["space_a_id"]
        if other_id is None:
            continue
        other = space_by_id.get(other_id)
        if other is not None and other.get("type") == "corridor":
            return other
    return None


def _resolve_floor_boundary(
    *,
    ifc_context: IFCContext,
    floor: int,
    anchor: SpaceContext,
) -> BoundaryContext | None:
    boundary = next(
        (
            candidate
            for candidate in ifc_context.get("boundaries", [])
            if candidate.get("floor") == floor
        ),
        None,
    )
    anchor_polygon = anchor.get("polygon") or []
    if boundary is not None and anchor_polygon:
        boundary_bbox = _bbox(boundary["outer_polygon"])
        anchor_bbox = _bbox(anchor_polygon)
        if (
            anchor_bbox[0] >= boundary_bbox[0] - TOLERANCE_MM
            and anchor_bbox[1] >= boundary_bbox[1] - TOLERANCE_MM
            and anchor_bbox[2] <= boundary_bbox[2] + TOLERANCE_MM
            and anchor_bbox[3] <= boundary_bbox[3] + TOLERANCE_MM
        ):
            return boundary

    floor_polygons = [
        Polygon(space["polygon"])
        for space in ifc_context.get("spaces", [])
        if space.get("floor") == floor and space.get("polygon")
    ]
    if not floor_polygons:
        return boundary
    merged = shapely_union_all(floor_polygons)
    if cast(Any, merged).geom_type == "MultiPolygon":
        merged = cast(Any, merged).convex_hull
    if cast(Any, merged).geom_type != "Polygon":
        return boundary
    outer_polygon = [
        (float(x), float(y))
        for x, y in list(cast(Any, merged).exterior.coords)[:-1]
    ]
    return {
        "floor": floor,
        "outer_polygon": outer_polygon,
        "holes": [],
    }


def _find_storey(storeys: list[StoreyContext], floor: int) -> StoreyContext | None:
    return next((storey for storey in storeys if storey.get("floor") == floor), None)


def _find_parallel_contact_segment(
    *,
    polygon_a: list[tuple[float, float]],
    polygon_b: list[tuple[float, float]],
    max_gap_mm: float,
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    best: tuple[tuple[float, float], tuple[float, float]] | None = None
    best_length = 0.0
    for start_a, end_a in _polygon_edges(polygon_a):
        for start_b, end_b in _polygon_edges(polygon_b):
            if _is_vertical(start_a, end_a) and _is_vertical(start_b, end_b):
                gap = abs(start_a[0] - start_b[0])
                overlap = _range_overlap((start_a[1], end_a[1]), (start_b[1], end_b[1]))
                if gap <= max_gap_mm and overlap is not None:
                    length = abs(overlap[1] - overlap[0])
                    if length > best_length:
                        best = ((start_a[0], overlap[0]), (start_a[0], overlap[1]))
                        best_length = length
            elif _is_horizontal(start_a, end_a) and _is_horizontal(start_b, end_b):
                gap = abs(start_a[1] - start_b[1])
                overlap = _range_overlap((start_a[0], end_a[0]), (start_b[0], end_b[0]))
                if gap <= max_gap_mm and overlap is not None:
                    length = abs(overlap[1] - overlap[0])
                    if length > best_length:
                        best = ((overlap[0], start_a[1]), (overlap[1], start_a[1]))
                        best_length = length
    return best


def _parallel_polygon_gap_mm(
    polygon_a: list[tuple[float, float]],
    polygon_b: list[tuple[float, float]],
) -> float | None:
    best_gap: float | None = None
    for start_a, end_a in _polygon_edges(polygon_a):
        for start_b, end_b in _polygon_edges(polygon_b):
            if _is_vertical(start_a, end_a) and _is_vertical(start_b, end_b):
                overlap = _range_overlap((start_a[1], end_a[1]), (start_b[1], end_b[1]))
                if overlap is None:
                    continue
                gap = abs(start_a[0] - start_b[0])
            elif _is_horizontal(start_a, end_a) and _is_horizontal(start_b, end_b):
                overlap = _range_overlap((start_a[0], end_a[0]), (start_b[0], end_b[0]))
                if overlap is None:
                    continue
                gap = abs(start_a[1] - start_b[1])
            else:
                continue
            if best_gap is None or gap < best_gap:
                best_gap = gap
    return best_gap if best_gap is not None else None


def _openings_inside_polygon(
    *,
    openings: list[DoorContext] | list[WindowContext],
    wall_by_id: dict[str, WallContext],
    polygon: list[tuple[float, float]],
    floor: int,
) -> list[str]:
    polygon_shape = Polygon(polygon)
    conflicts: list[str] = []
    for opening in openings:
        if opening.get("floor") != floor:
            continue
        host_wall = wall_by_id.get(opening["host_wall_id"])
        if host_wall is None:
            continue
        point = _opening_point(host_wall, opening)
        if point is not None and shapely_contains(
            polygon_shape.buffer(TOLERANCE_MM),
            cast(Any, Point)(point),
        ):
            conflicts.append(opening["id"])
    return conflicts


def _space_opening_ids(
    *,
    space_id: str,
    openings: list[DoorContext] | list[WindowContext],
    opening_type: Literal["door", "window"],
    excluded_ids: set[str] | None = None,
) -> list[str]:
    excluded = excluded_ids or set()
    matches: list[str] = []
    if opening_type == "door":
        for opening in openings:
            if opening["id"] in excluded:
                continue
            if opening.get("from_space_id") == space_id or opening.get("to_space_id") == space_id:
                matches.append(opening["id"])
        return matches

    for opening in openings:
        if opening["id"] in excluded:
            continue
        if opening.get("adjacent_space_id") == space_id:
            matches.append(opening["id"])
    return matches


def _opening_point(
    wall: WallContext,
    opening: DoorContext | WindowContext,
) -> tuple[float, float] | None:
    start = _as_point2(wall["start"])
    end = _as_point2(wall["end"])
    edge_length = _segment_length((start, end))
    if edge_length <= 0.0:
        return None
    position = float(opening.get("position", 0))
    # extractor stores door/window position as the opening center projected on
    # the wall axis, not the leading edge. Re-adding half-width here shifts the
    # point into the wrong room and breaks remainder-room usability checks.
    center = min(edge_length, max(0.0, position))
    ratio = center / edge_length
    return (
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
    )


def compute_circulation_reachability(
    *, space_plans: list[SpacePlan]
) -> dict[str, bool]:
    reachable: dict[str, bool] = {}
    pending = {
        space_plan["local_id"]: space_plan
        for space_plan in space_plans
        if space_plan.get("access_circulation") is not None
    }

    while pending:
        progressed = False
        for local_id, space_plan in list(pending.items()):
            access = space_plan.get("access_circulation")
            requirements = space_plan.get("required_openings")
            if access is None or requirements is None:
                reachable[local_id] = True
                pending.pop(local_id)
                progressed = True
                continue

            via_opening = access.get("via_door_opening_local_id")
            door_ids = set(requirements.get("door_satisfied_by_opening_local_ids", []))
            if via_opening is not None and via_opening not in door_ids:
                reachable[local_id] = False
                pending.pop(local_id)
                progressed = True
                continue

            source_id = access.get("reachable_from_space_local_id")
            if source_id is None or source_id == "corridor":
                reachable[local_id] = True
                pending.pop(local_id)
                progressed = True
                continue

            if source_id in reachable:
                reachable[local_id] = reachable[source_id]
                pending.pop(local_id)
                progressed = True
        if not progressed:
            for local_id in list(pending):
                reachable[local_id] = False
                pending.pop(local_id)
    return reachable


def validate_space_opening_closure(plan: SpaceOpeningClosurePlan) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    space_plans = plan.get("space_plans", [])
    if not space_plans:
        return issues

    valid_new_door_ids = {door_plan["local_id"] for door_plan in plan.get("door_plans", [])}
    valid_new_window_ids = {window_plan["local_id"] for window_plan in plan.get("window_plans", [])}
    reachability = compute_circulation_reachability(space_plans=space_plans)

    for space_plan in space_plans:
        requirements = space_plan.get("required_openings")
        if requirements is None:
            continue

        door_ids = list(requirements.get("door_satisfied_by_opening_local_ids", []))
        window_ids = list(requirements.get("window_satisfied_by_opening_local_ids", []))

        if len(door_ids) < requirements.get("needs_door_count", 0):
            issues.append(
                {
                    "code": f"space_{space_plan['local_id']}_missing_required_door",
                    "severity": "error",
                    "message": f"space_{space_plan['local_id']}_missing_required_door",
                }
            )
        if len(window_ids) < requirements.get("needs_window_count", 0):
            issues.append(
                {
                    "code": f"space_{space_plan['local_id']}_missing_required_window",
                    "severity": "error",
                    "message": f"space_{space_plan['local_id']}_missing_required_window",
                }
            )

        for door_id in door_ids:
            if door_id in valid_new_door_ids or door_id.startswith("existing:"):
                continue
            issues.append(
                {
                    "code": f"space_{space_plan['local_id']}_unknown_door_reference",
                    "severity": "error",
                    "message": f"space_{space_plan['local_id']}_unknown_door_reference",
                }
            )
            break
        for window_id in window_ids:
            if window_id in valid_new_window_ids or window_id.startswith("existing:"):
                continue
            issues.append(
                {
                    "code": f"space_{space_plan['local_id']}_unknown_window_reference",
                    "severity": "error",
                    "message": f"space_{space_plan['local_id']}_unknown_window_reference",
                }
            )
            break
        if not reachability.get(space_plan["local_id"], True):
            issues.append(
                {
                    "code": f"space_{space_plan['local_id']}_unreachable_from_circulation",
                    "severity": "error",
                    "message": f"space_{space_plan['local_id']}_unreachable_from_circulation",
                }
            )
    return issues


def _build_rejected_public_toilet_plan(
    *,
    floor: int,
    reason: str,
    message: str,
) -> ToiletInsertionPlan:
    return {
        "plan_schema_version": PLAN_SCHEMA_VERSION,
        "status": "rejected",
        "user_intent": "shared_toilet_corridor_carve",
        "floor": floor,
        "storey_id": "",
        "strategy": "corridor_end",
        "anchor_room_id": None,
        "anchor_room_name": None,
        "donor_room_id": "",
        "donor_room_name": "",
        "donor_room_type": "other",
        "donor_strategy_used": "corridor_end",
        "toilet_name": TOILET_NAME,
        "toilet_space_type": "bathroom",
        "toilet_locked": False,
        "preferred_width_mm": DEFAULT_TOILET_WIDTH_MM,
        "preferred_height_mm": DEFAULT_TOILET_DEPTH_MM,
        "toilet_world_polygon_mm": [],
        "toilet_local_origin_world_mm": (0.0, 0.0),
        "toilet_local_polygon_mm": [],
        "toilet_pset_updates": {},
        "donor_polygon_before_world_mm": [],
        "donor_polygon_after_world_mm": [],
        "bathroom_adjacency_kind": "none",
        "bathroom_shared_edge_length_mm": 0.0,
        "bathroom_shared_edge_segment_mm": None,
        "bathroom_partition_gap_mm": None,
        "bathroom_indirect_adjacency_via_donor": False,
        "exterior_wall_segment_mm": ((0.0, 0.0), (0.0, 0.0)),
        "interior_door_wall_segment_mm": ((0.0, 0.0), (0.0, 0.0)),
        "donor_remaining_min_clearance_mm": 0,
        "donor_existing_doors_inside_toilet_polygon": [],
        "donor_existing_windows_inside_toilet_polygon": [],
        "donor_reachability_after_carve": False,
        "entrance_segments_mm": [],
        "affected_space_ids": [],
        "untouched_space_ids": [],
        "required_new_walls": [],
        "donor_walls_to_reuse": [],
        "donor_walls_to_split": [],
        "donor_walls_to_delete": [],
        "space_plans": [],
        "wall_plans": [],
        "door_plan": {
            "local_id": "",
            "host_wall_local_id": "",
            "segment_along_wall_mm": (0.0, 0.0),
            "width_mm": 0,
            "height_mm": 0,
            "swing_in_space_id": "",
            "opens_toward_space_id": "",
            "swing_clearance_radius_mm": 0,
        },
        "door_plans": [],
        "window_plan": {
            "local_id": "",
            "host_wall_local_id": "",
            "segment_along_wall_mm": (0.0, 0.0),
            "width_mm": 0,
            "height_mm": 0,
            "sill_height_mm": 0,
            "inherits_size_from_opening_id": None,
        },
        "window_plans": [],
        "existing_openings_to_remove": [],
        "existing_openings_to_relocate": [],
        "existing_openings_plan": [],
        "forbidden_existing_openings": [],
        "bedroom_quality_metrics": None,
        "toilet_readability_metrics": {
            "dimensions_mm": (0, 0),
            "aspect_ratio": 0.0,
            "exterior_contact_length_mm": 0.0,
            "interior_contact_length_mm": 0.0,
            "perimeter_coverage_ratio": 0.0,
        },
        "validation_errors": [reason],
        "validation_warnings": [],
        "validation_issues": [{"code": reason, "severity": "error", "message": message}],
        "clarification_questions": [],
        "completeness_check": {
            "affected_openings_count": 0,
            "decisions_count": 0,
            "uncovered_opening_ids": [],
        },
        "split_remainder_room_name": None,
        "split_remainder_room_type": None,
        "split_operation": None,
        "score": 0.0,
    }


