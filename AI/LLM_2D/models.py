from pydantic import BaseModel, Field, model_validator
from typing import Literal, Optional, List, Tuple

class NewRoom(BaseModel):
    name: str = Field(..., description="방 이름")
    type: Literal[
        "living", "bedroom", "kitchen",
        "bathroom", "office", "corridor", "other"
    ]
    shape: Literal["rect", "L", "U", "O"] = Field(
        "rect", description="방 형태"
    )
    width: float = Field(..., description="전체 가로 크기 (미터)")
    height: float = Field(..., description="전체 세로 크기 (미터)")
    polygon: Optional[List[Tuple[float, float]]] = Field(
        None, description="꼭짓점 좌표 리스트 (코드에서 자동 생성)"
    )
    floor: int = Field(..., description="층 번호")

class FloorNLPCommand(BaseModel):
    action: Literal[
        "add_room",
        "remove_room",
        "resize_room",
        "set_adjacency",
        "lock_room",
        "unlock_room"
    ]
    target_room_name: Optional[str] = Field(
        None, description="수정할 방 이름 (예: 안방, 거실)"
    )
    target_floor: Optional[int] = Field(
        None, description="대상 방의 층 번호 (같은 이름 방이 여러 층일 때)"
    )
    new_room: Optional[NewRoom] = Field(
        None, description="추가할 방 정보 (action=add_room일 때)"
    )
    resize_polygon: Optional[List[Tuple[float, float]]] = Field(
        None, description="변경할 방의 새 polygon 좌표 (action=resize_room일 때)"
    )
    adjacency_target: Optional[str] = Field(
        None, description="인접하게 할 방 이름"
    )
    adjacency_strength: Optional[float] = Field(
        None, ge=0.0, le=1.0, description="인접 강도 0.0 ~ 1.0"
    )
    confidence: float = Field(
        default=0.5, ge=0.0, le=1.0, description="명령 해석 확신도"
    )
    resize_shape: Literal["rect", "L", "U", "O"] = Field(
        "rect", description="변경할 방 형태"
    )
    resize_width: Optional[float] = Field(
        None, description="변경할 전체 가로 크기 (미터)"
    )
    resize_height: Optional[float] = Field(
        None, description="변경할 전체 세로 크기 (미터)"
    )
    apply_to_all: bool = Field(
        False, description="같은 이름 방 전체에 적용할지 여부"
    )
    needs_clarification: bool = False
    clarification_question: Optional[str] = None

    @model_validator(mode="after")
    def validate_action_fields(self):
        if self.needs_clarification:
            return self
        if self.action == "add_room":
            if self.new_room is None:
                raise ValueError("add_room 액션에는 new_room이 필요합니다.")
        if self.action == "resize_room":
            if self.target_room_name is None:
                raise ValueError("resize_room 액션에는 target_room_name이 필요합니다.")
        if self.action == "set_adjacency":
            if self.adjacency_target is None:
                raise ValueError("set_adjacency 액션에는 adjacency_target이 필요합니다.")
        if self.action in ("remove_room", "lock_room", "unlock_room"):
            if self.target_room_name is None:
                raise ValueError(f"{self.action} 액션에는 target_room_name이 필요합니다.")
        return self