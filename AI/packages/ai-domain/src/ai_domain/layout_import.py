"""Layout import 수동 Pydantic 모델.

현재는 shared schema 대응 수동 Pydantic 모델을 사용하며,
schema codegen 도입 시 generated 모델로 대체할 수 있다.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LayoutImportBaseModel(BaseModel):
    """layout import 입력 모델 공통 설정."""

    model_config = ConfigDict(extra="forbid")


class RoomType(str, Enum):
    LIVING = "living"
    BEDROOM = "bedroom"
    KITCHEN = "kitchen"
    BATHROOM = "bathroom"
    OFFICE = "office"
    CORRIDOR = "corridor"
    OTHER = "other"


class ModelingDefaults(LayoutImportBaseModel):
    """v1에서 허용하는 선택적 모델링 기본값."""

    space_height_m: float | None = Field(default=None, gt=0)


class ZoneInput(LayoutImportBaseModel):
    """zone 메타데이터 입력."""

    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


class AdjacencyInput(LayoutImportBaseModel):
    """방 사이 인접 관계 입력."""

    from_room_id: str = Field(min_length=1, max_length=128)
    to_room_id: str = Field(min_length=1, max_length=128)
    strength: float = Field(ge=0, le=1)


class BoundaryInput(LayoutImportBaseModel):
    """층별 외곽 polygon 입력."""

    floor: int = Field(ge=1)
    polygon: list[tuple[float, float]] = Field(min_length=3)


class RoomInput(LayoutImportBaseModel):
    """방/공간 입력."""

    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    type: RoomType
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    floor: int = Field(ge=1)
    x: float
    y: float
    angle: float
    locked: bool
    zoneId: str | None = Field(default=None, min_length=1, max_length=128)


class LayoutImportV1(LayoutImportBaseModel):
    """신규 IFC import를 위한 v1 요청 모델."""

    schema_version: Literal["v1"]
    id: UUID
    name: str = Field(min_length=1, max_length=255)
    rooms: list[RoomInput] = Field(min_length=1)
    zones: list[ZoneInput] | None = None
    adjacency: list[AdjacencyInput] | None = None
    boundaries: list[BoundaryInput] | None = None
    modeling_defaults: ModelingDefaults | None = None
