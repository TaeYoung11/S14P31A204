from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SdRenderCommandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    renderMode: Literal["sd", "ifc2img"] = "sd"
    prompt: str | None = Field(default=None, min_length=1)
    negativePrompt: str | None = None
    sourceImageStorageUrl: str | None = Field(default=None, min_length=1, max_length=2048)
    preset: str | None = Field(default=None, min_length=1, max_length=128)
    timeOfDay: Literal["DAY", "NIGHT"] | None = None

    @model_validator(mode="after")
    def validate_mode_specific_fields(self) -> SdRenderCommandPayload:
        if self.renderMode == "sd" and self.prompt is None:
            raise ValueError("prompt is required when renderMode is sd")
        return self
