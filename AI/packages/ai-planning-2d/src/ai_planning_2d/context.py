"""기존 호출부와의 호환을 위해 간단한 평면 컨텍스트 모델을 제공한다."""

from pydantic import BaseModel, Field, model_validator

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

    @model_validator(mode="after")
    def validate_id_pair(self):
        has_canonical = self.space_a_id is not None and self.space_b_id is not None
        has_legacy = self.from_room_id is not None and self.to_room_id is not None
        if not has_canonical and not has_legacy:
            raise ValueError(
                "space_a_id/space_b_id 또는 from_room_id/to_room_id 중 하나의 쌍이 필요합니다."
            )
        return self


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
