from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ConversationHistoryMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class ThreeDLlmCommandPayload(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    userInstruction: str = Field(min_length=1, alias="user_instruction")
    sourceSceneStorageUrl: str = Field(
        min_length=1,
        max_length=2048,
        alias="source_scene_storage_url",
    )
    conversationHistory: list[ConversationHistoryMessage] = Field(
        default_factory=list,
        alias="conversation_history",
    )
    plannerOptions: dict[str, Any] = Field(default_factory=dict, alias="planner_options")
