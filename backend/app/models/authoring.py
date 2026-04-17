from __future__ import annotations

from enum import Enum
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.bim_command import ElementType, Material


class ProjectStartMode(str, Enum):
    BLANK = "blank"
    UPLOAD = "upload"


class BlankProjectConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ifc_schema: Literal["IFC4"] = Field("IFC4", alias="schema")
    storey_count: int = Field(1, ge=1, le=20)
    storey_height_mm: float = Field(3000.0, gt=0)
    base_elevation_mm: float = 0.0


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    start_mode: ProjectStartMode = ProjectStartMode.UPLOAD
    blank_model: Optional[BlankProjectConfig] = None


class AuthoringMode(str, Enum):
    PREVIEW = "preview"
    APPLY = "apply"
    CANCEL = "cancel"


class AuthoringAction(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class Vector3(BaseModel):
    x: float
    y: float
    z: float = 0.0


class AuthoringDimensions(BaseModel):
    width: Optional[float] = Field(default=None, gt=0)
    depth: Optional[float] = Field(default=None, gt=0)
    height: Optional[float] = Field(default=None, gt=0)
    thickness: Optional[float] = Field(default=None, gt=0)
    length: Optional[float] = Field(default=None, gt=0)
    sill_height: Optional[float] = Field(default=None, ge=0)
    pitch: Optional[float] = Field(default=None, ge=0, le=89)
    riser_count: Optional[int] = Field(default=None, ge=1)


class AuthoringGeometry(BaseModel):
    start: Optional[Vector3] = None
    end: Optional[Vector3] = None
    position: Optional[Vector3] = None
    rotation: Optional[Vector3] = None
    dimensions: Optional[AuthoringDimensions] = None
    template: Optional[str] = None


class AuthoringTarget(BaseModel):
    element_guid: Optional[str] = None
    storey_guid: Optional[str] = None
    host_guid: Optional[str] = None


class AuthoringSemantics(BaseModel):
    material: Material = Material.CONCRETE
    type_name: Optional[str] = None
    psets: Dict[str, Dict[str, object]] = Field(default_factory=dict)


class AuthoringOperation(BaseModel):
    operation_id: str = Field(..., min_length=6, max_length=120)
    base_revision: int = Field(0, ge=0)
    mode: AuthoringMode
    action: AuthoringAction
    element_type: ElementType
    target: AuthoringTarget = Field(default_factory=AuthoringTarget)
    geometry: AuthoringGeometry = Field(default_factory=AuthoringGeometry)
    semantics: AuthoringSemantics = Field(default_factory=AuthoringSemantics)


class AuthoringSessionRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=100)


class AuthoringSessionResponse(BaseModel):
    session_id: str
    display_name: str
    project_id: str
    model_revision: int


class PreviewBoundingBox(BaseModel):
    min: Vector3
    max: Vector3


class AuthoringPreview(BaseModel):
    operation_id: str
    session_id: str
    action: AuthoringAction
    element_type: ElementType
    label: str
    storey_guid: Optional[str] = None
    host_guid: Optional[str] = None
    geometry: Dict[str, object]
    semantics: Dict[str, object]
    bbox: PreviewBoundingBox
    lock_scope: str
    lock_scope_key: str
    warnings: List[str] = Field(default_factory=list)


class AuthoringCommitRequest(BaseModel):
    session_id: str
    operation: AuthoringOperation


class AuthoringResponse(BaseModel):
    status: Literal["success", "error"]
    mode: AuthoringMode
    project_id: str
    model_revision: int
    session_id: Optional[str] = None
    preview: Optional[AuthoringPreview] = None
    changes: List[Dict[str, object]] = Field(default_factory=list)
    message: Optional[str] = None
