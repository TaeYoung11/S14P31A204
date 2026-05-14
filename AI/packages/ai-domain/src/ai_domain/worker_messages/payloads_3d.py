from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ThreeDLlmCommandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schemaVersion: Literal["v1"] = Field(alias="schema_version")
    userInstruction: str = Field(min_length=1, alias="user_instruction")
    sourceSceneStorageUrl: str = Field(min_length=1, max_length=2048, alias="source_scene_storage_url")
