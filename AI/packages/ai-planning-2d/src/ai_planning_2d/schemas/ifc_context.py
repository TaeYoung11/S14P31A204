from __future__ import annotations

from typing import TypedDict


class SpaceContext(TypedDict):
    id: str
    name: str
    type: str
    floor: int
    polygon: list[tuple[float, float]]
    width: int | None
    height: int | None
    x: float | None
    y: float | None
    angle: float | None
    locked: bool
    zone_id: str | None


class AdjacencyContext(TypedDict):
    space_a_id: str
    space_b_id: str
    strength: float


class WallContext(TypedDict):
    id: str
    floor: int
    start: tuple[float, float]
    end: tuple[float, float]
    thickness: int
    space_ids: list[str]
    kind: str | None
    body_class: str | None


class DoorContext(TypedDict):
    id: str
    floor: int
    host_wall_id: str
    host_wall_body_class: str | None
    from_space_id: str | None
    to_space_id: str | None
    width: int
    height: int
    position: int
    opening_type: str
    swing_into_id: str | None
    hinge_side: str | None


class WindowContext(TypedDict):
    id: str
    floor: int
    host_wall_id: str
    host_wall_body_class: str | None
    adjacent_space_id: str | None
    width: int
    height: int
    sill_height: int
    position: int


class OpeningContext(TypedDict):
    id: str
    floor: int
    host_wall_id: str
    host_wall_body_class: str | None
    filled_by_id: str | None
    filled_by_kind: str | None


class BoundaryContext(TypedDict):
    floor: int
    outer_polygon: list[tuple[float, float]]
    holes: list[list[tuple[float, float]]]


class StoreyContext(TypedDict):
    id: str
    floor: int
    elevation: float | None


class IFCContext(TypedDict):
    spaces: list[SpaceContext]
    adjacency: list[AdjacencyContext]
    walls: list[WallContext]
    openings: list[OpeningContext]
    doors: list[DoorContext]
    windows: list[WindowContext]
    boundaries: list[BoundaryContext]
    storeys: list[StoreyContext]


__all__ = [
    "AdjacencyContext",
    "BoundaryContext",
    "DoorContext",
    "IFCContext",
    "OpeningContext",
    "SpaceContext",
    "StoreyContext",
    "WallContext",
    "WindowContext",
]
