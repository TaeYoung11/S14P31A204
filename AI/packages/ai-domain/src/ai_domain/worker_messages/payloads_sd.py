from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SdRenderCommandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1)
    negativePrompt: str | None = None
    sourceImageStorageUrl: str | None = Field(default=None, min_length=1, max_length=2048)
