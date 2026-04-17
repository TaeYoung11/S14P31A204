from pydantic import BaseModel, Field
from typing import Optional, Literal, List
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
    id: str = Field(..., description="UUID string for the room")
    name: str = Field(..., description="Name of the room")
    type: RoomType = Field(..., description="Type of the room")
    width: float = Field(..., description="Width in meters")
    height: float = Field(..., description="Height in meters")
    floor: int = Field(..., description="Floor number (1 = 1F, 2 = 2F, etc.)")
    x: Optional[float] = Field(None, description="X coordinate from simulation")
    y: Optional[float] = Field(None, description="Y coordinate from simulation")
    angle: Optional[float] = Field(0.0, description="Rotation in radians")
    locked: bool = Field(False, description="If True, room position is locked during simulation")


class AdjacencyEntry(BaseModel):
    from_room_id: str = Field(..., description="UUID of the first room")
    to_room_id: str = Field(..., description="UUID of the second room")
    strength: float = Field(..., description="Connection strength (0.0 to 1.0)")


class FloorBoundary(BaseModel):
    floor: int = Field(..., description="Floor number")
    polygon: List[tuple[float, float]] = Field(..., description="List of (x, y) coordinates in meters")


class FloorProject(BaseModel):
    id: str = Field(..., description="UUID of the floor project")
    name: str = Field(..., description="Project name")
    rooms: List[Room] = Field(default_factory=list)
    adjacency: List[AdjacencyEntry] = Field(default_factory=list)
    boundaries: List[FloorBoundary] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SimulationRequest(BaseModel):
    project_id: str
    iterations: int = 300
    alpha_decay: float = 0.0228


class SimulationResult(BaseModel):
    project_id: str
    rooms: List[Room]
    energy: float
    converged: bool


class ExportRequest(BaseModel):
    project_id: str
    format: Literal["ifc", "json", "dxf"]
    include_floors: List[int]


class FloorNLPCommand(BaseModel):
    """자연어로 방 배치를 수정하는 명령 (BIMCommand 패턴 동일)"""
    action: Literal["add_room", "remove_room", "resize_room",
                    "set_adjacency", "lock_room", "unlock_room"]
    target_room_name: Optional[str] = None
    new_room: Optional[Room] = None
    adjacency_target: Optional[str] = None
    adjacency_strength: Optional[float] = None
    resize_width: Optional[float] = None
    resize_height: Optional[float] = None
    confidence: float = 1.0
    needs_clarification: bool = False
    clarification_question: Optional[str] = None
