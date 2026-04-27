"""Layout import 수동 Pydantic 모델.

현재는 shared schema 대응 수동 Pydantic 모델을 사용하며,
schema codegen 도입 시 generated 모델로 대체할 수 있다.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LayoutImportBaseModel(BaseModel):
    """layout import 입력 모델 공통 설정."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class RoomType(StrEnum):
    LIVING = "living"
    BEDROOM = "bedroom"
    KITCHEN = "kitchen"
    BATHROOM = "bathroom"
    OFFICE = "office"
    CORRIDOR = "corridor"
    OTHER = "other"


class ModelingDefaults(LayoutImportBaseModel):
    """v1에서 허용하는 선택적 모델링 기본값."""

    space_height_mm: int | None = Field(default=None, gt=0, strict=True)


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

    @model_validator(mode="after")
    def validate_distinct_room_ids(self) -> AdjacencyInput:
        if self.from_room_id == self.to_room_id:
            raise ValueError("from_room_id와 to_room_id는 서로 달라야 합니다.")
        return self


class BoundaryInput(LayoutImportBaseModel):
    """층별 외곽 polygon 입력."""

    floor: int = Field(ge=1)
    polygon: list[tuple[float, float]] = Field(min_length=3)

    @model_validator(mode="after")
    def validate_polygon_shape(self) -> BoundaryInput:
        points = self.polygon
        # NOTE:
        # 마지막 점이 첫 점과 같은 닫힌 polygon은 현재 검증 단계에서만 허용합니다.
        # 즉, 검증 시에는 마지막 중복 점을 제외해 검사하지만 self.polygon 자체는
        # 아직 정규화하지 않습니다.
        # 이후 boundaries를 geometry 생성에 사용하게 되면, 마지막 중복 점을 제거한
        # canonical form으로 저장할지 별도 정책 결정을 해야 합니다.
        if len(points) > 1 and points[0] == points[-1]:
            points = points[:-1]

        unique_points = set(points)
        if len(unique_points) < 3:
            raise ValueError("polygon은 서로 다른 점이 최소 3개 이상이어야 합니다.")

        doubled_area = 0.0
        for index, (x1, y1) in enumerate(points):
            x2, y2 = points[(index + 1) % len(points)]
            doubled_area += x1 * y2 - x2 * y1

        if doubled_area == 0:
            raise ValueError("polygon은 면적이 0이면 안 됩니다.")

        return self


class RoomInput(LayoutImportBaseModel):
    """방/공간 입력."""

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
