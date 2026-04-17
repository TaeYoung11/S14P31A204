from pydantic import BaseModel, Field
from typing import Literal, Optional, List
from enum import Enum

class ElementType(str, Enum):
    WALL = "wall"
    SLAB = "slab"
    COLUMN = "column"
    BEAM = "beam"
    WINDOW = "window"
    DOOR = "door"
    STAIR = "stair"
    ROOF = "roof"
    RAMP = "ramp"

class Material(str, Enum):
    CONCRETE = "concrete"
    GLASS = "glass"
    WOOD = "wood"
    BRICK = "brick"
    MARBLE = "marble"
    TILE = "tile"
    STEEL = "steel"
    GYPSUM = "gypsum"
    ALUMINUM = "aluminum"
    INSULATION = "insulation"
    ORANGE = "orange"
    RED = "red"
    YELLOW = "yellow"
    GREEN = "green"
    BLUE = "blue"
    WHITE = "white"
    BLACK = "black"
    GRAY = "gray"
    BROWN = "brown"
    BEIGE = "beige"

class Opening(BaseModel):
    type: Literal["window", "door"]
    count: int = 1
    width: Optional[float] = None   # mm
    height: Optional[float] = None  # mm
    position: Optional[str] = None  # "center", "left", "right"

class Position(BaseModel):
    x: float
    y: float
    z: float

class BIMChanges(BaseModel):
    material: Optional[Material] = None
    thickness: Optional[float] = None   # mm
    height: Optional[float] = None      # mm
    width: Optional[float] = None       # mm
    length: Optional[float] = None      # mm
    openings: Optional[List[Opening]] = None
    position: Optional[Position] = None

class BIMTarget(BaseModel):
    floor: Optional[int] = Field(None, description="층 번호. 불명확하면 None")
    room: Optional[str] = Field(None, description="방 이름 (예: 회의실, 로비)")
    element_type: ElementType
    direction: Optional[str] = Field(
        None, description="방향 (north/south/east/west 또는 외벽/내벽)"
    )
    element_guid: Optional[str] = Field(None, description="IFC GUID (특정 요소 지정 시)")

class QueryType(str, Enum):
    AREA_SUMMARY = "area_summary"
    ELEMENT_COUNT = "element_count"
    MATERIAL_LIST = "material_list"

class BIMCommand(BaseModel):
    action: Literal["modify", "add", "delete", "query", "unsupported"]
    target: BIMTarget
    changes: Optional[BIMChanges] = None
    query_type: Optional[QueryType] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    needs_clarification: bool = False
    clarification_question: Optional[str] = None
    original_text: str
