from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class TwoDLlmCommandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    userInstruction: str = Field(min_length=1)
    sourceSceneStorageUrl: str = Field(min_length=1, max_length=2048)
