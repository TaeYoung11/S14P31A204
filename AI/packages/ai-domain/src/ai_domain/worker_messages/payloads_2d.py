from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class TwoDLlmCommandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    userInstruction: str = Field(min_length=1)
    sourceSceneStorageUrl: str | None = Field(
        default=None,
        min_length=1,
        max_length=2048,
        description=(
            "Deprecated. The 2D worker reads IFC input from command.input.sourceIfcStorageUrl "
            "and ignores this field."
        ),
    )
