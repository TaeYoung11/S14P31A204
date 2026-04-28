
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
    from_room_id: str
    to_room_id: str
    strength: float


class FloorBoundary(BaseModel):
    floor: int
    polygon: list[tuple[float, float]]


class FloorProject(BaseModel):
    id: str
    name: str
    rooms: list[Room] = Field(default_factory=list)
    adjacency: list[AdjacencyEntry] = Field(default_factory=list)
    boundaries: list[FloorBoundary] = Field(default_factory=list)
