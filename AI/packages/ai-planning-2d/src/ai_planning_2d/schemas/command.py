from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from .plan_v14 import UserIntent


class NewRoom(BaseModel):
    name: str = Field(..., description="Name of the room to create.")
    type: Literal[
        "living",
        "bedroom",
        "kitchen",
        "bathroom",
        "office",
        "corridor",
        "other",
    ]
    shape: Literal["rect", "L", "U"] = Field("rect", description="Room shape.")
    width: int = Field(..., gt=0, description="Width in mm.")
    height: int = Field(..., gt=0, description="Height in mm.")
    rects: list[dict[str, int]] | None = Field(
        None,
        description="shape_to_rects() output: list of {x, y, width, height}.",
    )
    floor: int = Field(..., ge=1, description="Target floor number.")


class FloorNLPCommand(BaseModel):
    action: Literal[
        "add_room",
        "create_wall",
        "create_door",
        "delete_wall",
        "delete_wall_void",
        "insert_toilet",
        "remove_room",
        "resize_room",
        "set_adjacency",
        "lock_room",
        "unlock_room",
    ]
    target_room_name: str | None = Field(None, description="Target room name.")
    target_wall_id: str | None = Field(None, description="Target wall GlobalId.")
    target_element_id: str | None = Field(None, description="Target element GlobalId.")
    target_floor: int | None = Field(None, ge=1, description="Target floor number.")
    new_room: NewRoom | None = Field(None, description="Room payload for add_room.")
    adjacency_target: str | None = Field(None, description="Adjacency target room name.")
    adjacency_strength: float | None = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Adjacency strength between 0.0 and 1.0.",
    )
    confidence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Parser confidence score.",
    )
    resize_shape: Literal["rect", "L", "U"] = Field(
        "rect",
        description="Requested shape for resize_room.",
    )
    resize_width: int | None = Field(None, gt=0, description="Requested width in mm.")
    resize_height: int | None = Field(None, gt=0, description="Requested height in mm.")
    resize_rects: list[dict[str, int]] | None = Field(
        None,
        description="shape_to_rects() output for resize_room.",
    )
    resize_direction: Literal["north", "south", "east", "west"] | None = Field(
        None,
        description="Preferred resize direction.",
    )
    apply_to_all: bool = Field(
        False,
        description="Whether to apply to all matched rooms with the same name.",
    )
    element_width_mm: int | None = Field(
        None,
        gt=0,
        description="Requested width for local element creation in mm.",
    )
    element_height_mm: int | None = Field(
        None,
        gt=0,
        description="Requested height for local element creation in mm.",
    )
    user_intent: UserIntent | None = Field(
        None,
        description="Optional user intent hint for demo-specific insert_toilet planning.",
    )
    needs_clarification: bool = False
    clarification_question: str | None = None

    @model_validator(mode="after")
    def validate_action_fields(self) -> FloorNLPCommand:
        if self.needs_clarification:
            return self
        if self.action == "add_room" and self.new_room is None:
            raise ValueError("add_room requires new_room.")
        if self.action == "create_wall" and self.target_room_name is None:
            raise ValueError("create_wall requires target_room_name.")
        if self.action == "create_door" and self.target_wall_id is None:
            raise ValueError("create_door requires target_wall_id.")
        if self.action == "delete_wall" and self.target_wall_id is None:
            raise ValueError("delete_wall requires target_wall_id.")
        if self.action == "delete_wall_void" and self.target_element_id is None:
            raise ValueError("delete_wall_void requires target_element_id.")
        if self.action == "resize_room" and self.target_room_name is None:
            raise ValueError("resize_room requires target_room_name.")
        if self.action == "set_adjacency" and self.adjacency_target is None:
            raise ValueError("set_adjacency requires adjacency_target.")
        if (
            self.action in ("remove_room", "lock_room", "unlock_room")
            and self.target_room_name is None
        ):
            raise ValueError(f"{self.action} requires target_room_name.")
        return self


class ActionType(StrEnum):
    CREATE_SPACE = "create_space"
    UPDATE_SPACE = "update_space"
    DELETE_SPACE = "delete_space"
    CREATE_WALL = "create_wall"
    UPDATE_WALL = "update_wall"
    DELETE_WALL = "delete_wall"
    CREATE_DOOR = "create_door"
    UPDATE_DOOR = "update_door"
    DELETE_DOOR = "delete_door"
    DELETE_WALL_VOID = "delete_wall_void"
    CREATE_WINDOW = "create_window"
    UPDATE_WINDOW = "update_window"
    DELETE_WINDOW = "delete_window"
    CREATE_STAIR = "create_stair"
    UPDATE_STAIR = "update_stair"
    DELETE_STAIR = "delete_stair"


class IFCCommand(BaseModel):
    action: ActionType
    target_id: str | None = Field(
        None,
        description="IFC GlobalId. Create actions must use None.",
    )
    params: dict[str, Any] = Field(
        default_factory=dict,
        description="Execution payload including geometry, placement, metadata, and properties.",
    )
    confidence: float = Field(..., ge=0.0, le=1.0)
    reason: str | None = None

    @model_validator(mode="after")
    def validate_target_id(self) -> IFCCommand:
        create_actions = {
            ActionType.CREATE_SPACE,
            ActionType.CREATE_WALL,
            ActionType.CREATE_DOOR,
            ActionType.CREATE_WINDOW,
            ActionType.CREATE_STAIR,
        }
        if self.action in create_actions:
            if self.target_id is not None:
                raise ValueError("Create action must use target_id=None.")
        elif self.target_id is None:
            raise ValueError("Non-create action requires target_id.")
        return self


class CommandBatch(BaseModel):
    commands: list[IFCCommand] = Field(default_factory=list)
    requires_clarification: bool
    clarification_question: str | None = None
    failed_command_indices: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_clarification(self) -> CommandBatch:
        if self.requires_clarification:
            if not self.clarification_question:
                raise ValueError(
                    "clarification_question is required when requires_clarification is True."
                )
        elif self.clarification_question is not None:
            raise ValueError(
                "clarification_question must be None when requires_clarification is False."
            )
        return self


__all__ = [
    "ActionType",
    "CommandBatch",
    "FloorNLPCommand",
    "IFCCommand",
    "NewRoom",
]
