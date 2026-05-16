from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ConversationHistoryMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class TwoDLlmCommandPayload(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    userInstruction: str = Field(min_length=1, alias="user_instruction")
    plannerOptions: dict[str, Any] | None = Field(default=None, alias="planner_options")
    sourceScene: dict[str, Any] | None = Field(default=None, alias="source_scene")
    sourceSceneStorageUrl: str | None = Field(
        default=None,
        min_length=1,
        max_length=2048,
        alias="source_scene_storage_url",
        description=(
            "Deprecated. The 2D worker reads IFC input from command.input.sourceIfcStorageUrl "
            "and ignores this field."
        ),
    )
    conversationHistory: list[ConversationHistoryMessage] = Field(
        default_factory=list,
        alias="conversation_history",
    )
