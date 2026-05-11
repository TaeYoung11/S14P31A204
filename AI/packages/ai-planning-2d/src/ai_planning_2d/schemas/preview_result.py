from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .command import CommandBatch, FloorNLPCommand


class PreviewResultArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default="v2", pattern="^v2$")
    status: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    command: FloorNLPCommand
    command_batch: CommandBatch
    policy_plan: dict[str, Any] | None = None
    matched_count: int = Field(ge=0)
    validation_warnings: list[str] = Field(default_factory=list)
    engine_request: dict[str, Any] | None = None
    ifc_edit_payload: dict[str, Any] | None = None
    engine_capabilities: dict[str, Any] = Field(default_factory=dict)


__all__ = ["PreviewResultArtifact"]
