from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TwoDLlmCommandPayload(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    schemaVersion: Literal["v1"] = Field(default="v1", alias="schema_version")
    userInstruction: str = Field(min_length=1, alias="user_instruction")
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
