
from pydantic import BaseModel, Field

from ai_domain import RoomType


class Room(BaseModel):
    id: str
    name: str
    type: RoomType
    floor: int
    x: float | None = None
    y: float | None = None
    locked: bool = False
    polygon: list[tuple[float, float]]  # 필수


class AdjacencyEntry(BaseModel):
    space_a_id: str | None = None
    space_b_id: str | None = None
    from_room_id: str | None = None
    to_room_id: str | None = None
    strength: float


class FloorBoundary(BaseModel):
    floor: int
    polygon: list[tuple[float, float]] | None = None
    outer_polygon: list[tuple[float, float]] | None = None
    holes: list[list[tuple[float, float]]] = Field(default_factory=list)


class FloorProject(BaseModel):
    id: str
    name: str
    rooms: list[Room] = Field(default_factory=list)
    adjacency: list[AdjacencyEntry] = Field(default_factory=list)
    boundaries: list[FloorBoundary] = Field(default_factory=list)
