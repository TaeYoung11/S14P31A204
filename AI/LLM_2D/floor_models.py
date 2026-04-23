from pydantic import BaseModel, Field
from typing import Optional, List, Tuple
from enum import Enum


class RoomType(str, Enum):
    LIVING = "living"
    BEDROOM = "bedroom"
    KITCHEN = "kitchen"
    BATHROOM = "bathroom"
    OFFICE = "office"
    CORRIDOR = "corridor"
    OTHER = "other"


class Room(BaseModel):
    id: str
    name: str
    type: RoomType
    floor: int
    x: Optional[float] = None
    y: Optional[float] = None
    locked: bool = False
    polygon: List[Tuple[float, float]]  # 필수


class AdjacencyEntry(BaseModel):
    from_room_id: str
    to_room_id: str
    strength: float


class FloorBoundary(BaseModel):
    floor: int
    polygon: List[Tuple[float, float]]


class FloorProject(BaseModel):
    id: str
    name: str
    rooms: List[Room] = []
    adjacency: List[AdjacencyEntry] = []
    boundaries: List[FloorBoundary] = []