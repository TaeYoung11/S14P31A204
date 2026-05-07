"""Manual Pydantic models for the layout import contract."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal, TypeAlias
from uuid import UUID

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    model_validator,
)


class LayoutImportBaseModel(BaseModel):
    """Common model settings for layout import payloads."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class RoomType(StrEnum):
    LIVING = "living"
    BEDROOM = "bedroom"
    KITCHEN = "kitchen"
    BATHROOM = "bathroom"
    OFFICE = "office"
    CORRIDOR = "corridor"
    OTHER = "other"


class BoundaryWallMode(StrEnum):
    OUTER_BOUNDARY = "outer_boundary"


class SharedWallPolicy(StrEnum):
    FROM_ADJACENCY = "from_adjacency"


class RoofShape(StrEnum):
    FLAT = "flat"


class OpeningPolicy(StrEnum):
    EXPLICIT_ONLY = "explicit_only"


class OpeningType(StrEnum):
    DOOR = "door"
    WINDOW = "window"


class ModelingDefaultsV1(LayoutImportBaseModel):
    """Optional modeling defaults supported by v1."""

    space_height_mm: int | None = Field(default=None, gt=0, strict=True)


class ModelingDefaultsV2(LayoutImportBaseModel):
    """Optional modeling defaults supported by v2."""

    space_height_mm: int | None = Field(default=None, gt=0, strict=True)
    wall_thickness_mm: int | None = Field(default=None, gt=0, strict=True)
    slab_thickness_mm: int | None = Field(default=None, gt=0, strict=True)
    roof_height_mm: int | None = Field(default=None, gt=0, strict=True)


class GenerationOptionsV2(LayoutImportBaseModel):
    """Generation toggles introduced in v2."""

    generate_spaces: bool = True
    generate_walls: bool = True
    generate_slabs: bool = True
    generate_roof: bool = True
    generate_openings: bool = False


class GenerationPolicyV2(LayoutImportBaseModel):
    """Generation policies supported in v2."""

    boundary_wall_mode: BoundaryWallMode = BoundaryWallMode.OUTER_BOUNDARY
    shared_wall_policy: SharedWallPolicy = SharedWallPolicy.FROM_ADJACENCY
    roof_shape: RoofShape = RoofShape.FLAT


class GenerationPolicyV3(GenerationPolicyV2):
    """Generation policies supported in v3."""

    opening_policy: OpeningPolicy = OpeningPolicy.EXPLICIT_ONLY


class ZoneInput(LayoutImportBaseModel):
    """Zone metadata input."""

    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


PolygonRing: TypeAlias = list[tuple[float, float]]
PolygonHoles: TypeAlias = list[Annotated[PolygonRing, Field(min_length=3)]]


class AdjacencyInput(LayoutImportBaseModel):
    """Adjacency relationship between rooms."""

    from_room_id: str | None = Field(default=None, min_length=1, max_length=128)
    to_room_id: str | None = Field(default=None, min_length=1, max_length=128)
    room_a_id: str | None = Field(default=None, min_length=1, max_length=128)
    room_b_id: str | None = Field(default=None, min_length=1, max_length=128)
    strength: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def validate_room_id_pair(self) -> AdjacencyInput:
        has_canonical_pair = self.room_a_id is not None or self.room_b_id is not None
        has_legacy_pair = self.from_room_id is not None or self.to_room_id is not None

        if self.room_a_id is None and self.room_b_id is not None:
            raise ValueError("room_a_id and room_b_id must both be provided together")
        if self.room_a_id is not None and self.room_b_id is None:
            raise ValueError("room_a_id and room_b_id must both be provided together")
        if self.from_room_id is None and self.to_room_id is not None:
            raise ValueError("from_room_id and to_room_id must both be provided together")
        if self.from_room_id is not None and self.to_room_id is None:
            raise ValueError("from_room_id and to_room_id must both be provided together")
        if has_canonical_pair and has_legacy_pair:
            raise ValueError(
                "room_a_id/room_b_id and from_room_id/to_room_id "
                "cannot be provided together"
            )
        if not has_canonical_pair and not has_legacy_pair:
            raise ValueError(
                "either room_a_id/room_b_id or from_room_id/to_room_id must be provided"
            )
        return self

    @model_validator(mode="after")
    def validate_distinct_room_ids(self) -> AdjacencyInput:
        if self.room_a_id is not None:
            if self.room_a_id == self.room_b_id:
                raise ValueError("room_a_id and room_b_id must be different")
            return self

        if self.from_room_id == self.to_room_id:
            raise ValueError("from_room_id and to_room_id must be different")
        return self


class BoundaryInput(LayoutImportBaseModel):
    """Floor boundary polygon input."""

    floor: int = Field(ge=1)
    polygon_mm: PolygonRing | None = Field(
        default=None,
        min_length=3,
        serialization_alias="polygon",
        validation_alias=AliasChoices("polygon_mm", "polygon"),
    )
    outer_polygon_mm: PolygonRing | None = Field(default=None, min_length=3)
    holes_mm: PolygonHoles | None = None

    @model_validator(mode="after")
    def validate_polygon_shape(self) -> BoundaryInput:
        if self.outer_polygon_mm is None and self.polygon_mm is None:
            raise ValueError("either outer_polygon_mm or polygon_mm must be provided")
        if self.outer_polygon_mm is not None and self.polygon_mm is not None:
            raise ValueError("outer_polygon_mm and polygon_mm cannot be provided together")
        if self.holes_mm is not None:
            if self.outer_polygon_mm is None:
                raise ValueError("holes_mm requires outer_polygon_mm")
            if self.polygon_mm is not None:
                raise ValueError("holes_mm cannot be used with polygon_mm")

        points = self.outer_polygon_mm if self.outer_polygon_mm is not None else self.polygon_mm
        if points is None:
            # This should be unreachable due to the check at the beginning of the validator
            raise ValueError("polygon data is missing")

        if len(points) > 1 and points[0] == points[-1]:
            points = points[:-1]

        unique_points = set(points)
        if len(unique_points) < 3:
            raise ValueError("polygon must contain at least 3 distinct points")

        doubled_area = 0.0
        for index, (x1, y1) in enumerate(points):
            x2, y2 = points[(index + 1) % len(points)]
            doubled_area += x1 * y2 - x2 * y1

        if doubled_area == 0:
            raise ValueError("polygon area must be non-zero")

        return self


class RoomInput(LayoutImportBaseModel):
    """Room input."""

    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    type: RoomType
    width: int = Field(gt=0, strict=True)
    height: int = Field(gt=0, strict=True)
    floor: int = Field(ge=1)
    x: float
    y: float
    angle: float
    locked: bool
    zone_id: str | None = Field(
        default=None,
        alias="zoneId",
        min_length=1,
        max_length=128,
    )


class OpeningInput(LayoutImportBaseModel):
    """Explicit opening input for v3."""

    id: str = Field(min_length=1, max_length=128)
    type: OpeningType
    floor: int = Field(ge=1)
    host_wall_ref: str = Field(min_length=1, max_length=255)
    x: float
    y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_host_wall_ref(self) -> OpeningInput:
        if self.host_wall_ref.startswith("wall-boundary-"):
            parts = self.host_wall_ref.split("-")
            if (
                len(parts) == 5
                and parts[0] == "wall"
                and parts[1] == "boundary"
                and parts[3] == "seg"
            ):
                try:
                    floor = int(parts[2])
                    segment_index = int(parts[4])
                except ValueError as exc:  # pragma: no cover - defensive
                    raise ValueError(
                        "opening.host_wall_ref must use a supported wall reference pattern"
                    ) from exc
                if floor >= 1 and segment_index >= 1:
                    return self

        if self.host_wall_ref.startswith("wall-room-"):
            remainder = self.host_wall_ref[len("wall-room-") :]
            room_ids = remainder.split("-")
            if len(room_ids) >= 4 and all(part != "" for part in room_ids):
                return self

        raise ValueError("opening.host_wall_ref must use a supported wall reference pattern")


class LayoutImportCommon(LayoutImportBaseModel):
    """Fields shared across layout import versions."""

    id: UUID
    name: str = Field(min_length=1, max_length=255)
    rooms: list[RoomInput] = Field(min_length=1)
    zones: list[ZoneInput] | None = None
    adjacency: list[AdjacencyInput] | None = None
    boundaries: list[BoundaryInput] | None = None

    @model_validator(mode="after")
    def validate_unique_entity_ids(self) -> LayoutImportCommon:
        room_ids = [room.id for room in self.rooms]
        if len(room_ids) != len(set(room_ids)):
            raise ValueError("room.id values must be unique")

        if self.zones is not None:
            zone_ids = [zone.id for zone in self.zones]
            if len(zone_ids) != len(set(zone_ids)):
                raise ValueError("zone.id values must be unique")

        return self

    @model_validator(mode="after")
    def validate_boundary_floor_uniqueness(self) -> LayoutImportCommon:
        if self.boundaries is None:
            return self

        boundary_floors = [boundary.floor for boundary in self.boundaries]
        if len(boundary_floors) != len(set(boundary_floors)):
            raise ValueError("boundaries must not contain duplicate floor values")

        return self

    @model_validator(mode="after")
    def validate_adjacency_room_references(self) -> LayoutImportCommon:
        if self.adjacency is None:
            return self

        room_ids = {room.id for room in self.rooms}
        for adjacency in self.adjacency:
            if adjacency.room_a_id is not None:
                if adjacency.room_a_id not in room_ids:
                    raise ValueError(
                        "adjacency.room_a_id must reference an existing room: "
                        f"{adjacency.room_a_id}"
                    )
                if adjacency.room_b_id not in room_ids:
                    raise ValueError(
                        "adjacency.room_b_id must reference an existing room: "
                        f"{adjacency.room_b_id}"
                    )
                continue

            if adjacency.from_room_id not in room_ids:
                raise ValueError(
                    "adjacency.from_room_id must reference an existing room: "
                    f"{adjacency.from_room_id}"
                )
            if adjacency.to_room_id not in room_ids:
                raise ValueError(
                    "adjacency.to_room_id must reference an existing room: "
                    f"{adjacency.to_room_id}"
                )

        return self

    @model_validator(mode="after")
    def validate_zone_references(self) -> LayoutImportCommon:
        zone_ids = {zone.id for zone in self.zones or []}
        for room in self.rooms:
            if room.zone_id is None:
                continue
            if room.zone_id not in zone_ids:
                raise ValueError(
                    f"room.zoneId must reference an existing zone: {room.zone_id}"
                )

        return self


class LayoutImportV1(LayoutImportCommon):
    """v1 request model for new IFC import."""

    schema_version: Literal["v1"]
    modeling_defaults: ModelingDefaultsV1 | None = None


class LayoutImportV2(LayoutImportCommon):
    """v2 request model for new IFC import."""

    schema_version: Literal["v2"]
    generation_options: GenerationOptionsV2 = Field(default_factory=GenerationOptionsV2)
    modeling_defaults: ModelingDefaultsV2 | None = None
    generation_policy: GenerationPolicyV2 = Field(default_factory=GenerationPolicyV2)

    @model_validator(mode="after")
    def validate_unsupported_generation_options(self) -> LayoutImportV2:
        if not self.generation_options.generate_spaces:
            raise ValueError("generate_spaces=false is not supported in this ticket")

        if self.generation_options.generate_openings:
            raise ValueError("opening rules are not supported in this ticket")

        return self


class LayoutImportV3(LayoutImportCommon):
    """v3 request model for explicit openings validation."""

    schema_version: Literal["v3"]
    generation_options: GenerationOptionsV2 = Field(default_factory=GenerationOptionsV2)
    modeling_defaults: ModelingDefaultsV2 | None = None
    generation_policy: GenerationPolicyV3 = Field(default_factory=GenerationPolicyV3)
    openings: list[OpeningInput] | None = None

    @model_validator(mode="after")
    def validate_generation_options(self) -> LayoutImportV3:
        if not self.generation_options.generate_spaces:
            raise ValueError("generate_spaces=false is not supported in this ticket")

        if self.openings:
            if not self.generation_options.generate_openings:
                raise ValueError("explicit openings require generate_openings=true")
            if self.generation_policy.opening_policy is not OpeningPolicy.EXPLICIT_ONLY:
                raise ValueError("explicit openings require opening_policy=explicit_only")

        return self

    @model_validator(mode="after")
    def validate_opening_ids(self) -> LayoutImportV3:
        if self.openings is None:
            return self

        opening_ids = [opening.id for opening in self.openings]
        if len(opening_ids) != len(set(opening_ids)):
            raise ValueError("opening.id values must be unique")

        return self


LayoutImportRequest: TypeAlias = Annotated[
    LayoutImportV1 | LayoutImportV2 | LayoutImportV3,
    Field(discriminator="schema_version"),
]


_LAYOUT_IMPORT_REQUEST_ADAPTER = TypeAdapter(LayoutImportRequest)


def parse_layout_import(payload: object) -> LayoutImportV1 | LayoutImportV2:
    """Parse any supported layout import payload."""

    return _LAYOUT_IMPORT_REQUEST_ADAPTER.validate_python(payload)
