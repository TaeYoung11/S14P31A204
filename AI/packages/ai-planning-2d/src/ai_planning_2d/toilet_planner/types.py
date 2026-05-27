"""Shared constants and typed plan shapes for toilet planning."""

from __future__ import annotations

from typing import Literal, TypedDict

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
