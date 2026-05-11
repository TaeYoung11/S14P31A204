from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field, model_validator

from .validation import PlanStatus, ValidationIssue

PLAN_SCHEMA_VERSION = "v14"


class UserIntent(StrEnum):
    SHARED_TOILET_ANY_STRATEGY = "shared_toilet_any_strategy"
    SHARED_TOILET_SPLIT_BIG_ROOM = "shared_toilet_split_big_room"
    SHARED_TOILET_CORRIDOR_CARVE = "shared_toilet_corridor_carve"


class RequiredOpenings(BaseModel):
    needs_door_count: int = Field(ge=0)
    needs_window_count: int = Field(ge=0)
    door_satisfied_by_opening_local_ids: list[str] = Field(default_factory=list)
    window_satisfied_by_opening_local_ids: list[str] = Field(default_factory=list)


class AccessCirculation(BaseModel):
    reachable_from_space_local_id: str | None = None
    via_opening_local_id: str | None = None


class SpacePlan(BaseModel):
    local_id: str
    global_id: str | None = None
    is_new: bool
    source_space_id: str | None = None
    polygon_world_mm: list[tuple[float, float]]
    polygon_local_mm: list[tuple[float, float]]
    placement_world_mm: tuple[float, float]
    name: str
    space_type: str
    locked: bool = False
    walls_bounding_local_ids: list[str] = Field(default_factory=list)
    openings_local_ids: list[str] = Field(default_factory=list)
    required_openings: RequiredOpenings
    access_circulation: AccessCirculation


class WallPlan(BaseModel):
    local_id: str
    kind: str
    start_mm: tuple[float, float]
    end_mm: tuple[float, float]
    thickness_mm: int = Field(gt=0)
    bounded_space_local_ids: list[str] = Field(default_factory=list)
    hosts_opening_local_ids: list[str] = Field(default_factory=list)
    representation_template_global_id: str


class OpeningPlan(BaseModel):
    local_id: str
    opening_kind: str
    host_wall_local_id: str
    segment_along_wall_mm: tuple[float, float]
    width_mm: int = Field(gt=0)
    height_mm: int = Field(gt=0)
    sill_height_mm: int = Field(ge=0)
    swing_in_space_local_id: str | None = None
    opens_toward_space_local_id: str | None = None
    operation_type: str | None = None
    serves_door_requirement_of_space_local_id: str | None = None
    serves_window_requirement_of_space_local_id: str | None = None
    representation_template_global_id: str

    @model_validator(mode="after")
    def validate_segment_order(self) -> OpeningPlan:
        start_mm, end_mm = self.segment_along_wall_mm
        if end_mm <= start_mm:
            raise ValueError("segment_along_wall_mm must be an increasing pair.")
        return self


class PlanV14(BaseModel):
    plan_schema_version: str = Field(default=PLAN_SCHEMA_VERSION)
    plan_status: PlanStatus
    storey_id: str
    floor_entrance_space_id: str | None = None
    house_kr_fingerprint_match: bool = False
    user_intent: UserIntent | None = None
    expected_resulting_space_names: list[str] | None = None
    expected_resulting_space_types: list[str] | None = None
    affected_zone_polygon_mm: list[tuple[float, float]]
    space_plans: list[SpacePlan] = Field(default_factory=list)
    final_walls: list[WallPlan] = Field(default_factory=list)
    final_openings: list[OpeningPlan] = Field(default_factory=list)
    validation_issues: list[ValidationIssue] = Field(default_factory=list)
    validation_warnings: list[ValidationIssue] = Field(default_factory=list)
    representation_templates_used: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_schema_version(self) -> PlanV14:
        if self.plan_schema_version != PLAN_SCHEMA_VERSION:
            raise ValueError(f"Unsupported plan schema version: {self.plan_schema_version}")
        return self


__all__ = [
    "PLAN_SCHEMA_VERSION",
    "AccessCirculation",
    "OpeningPlan",
    "PlanV14",
    "RequiredOpenings",
    "SpacePlan",
    "UserIntent",
    "WallPlan",
]
