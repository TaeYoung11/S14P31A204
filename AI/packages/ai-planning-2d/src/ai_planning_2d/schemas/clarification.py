from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_serializer


class ClarificationFill(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_floor: int | None = Field(default=None, ge=1)
    target_room_name: str | None = Field(default=None, min_length=1)
    action: Literal["insert_toilet"] | None = None

    @model_serializer(mode="wrap")
    def serialize_without_none(self, handler):
        return {key: value for key, value in handler(self).items() if value is not None}


class ClarificationAlternative(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alternative_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    fill: ClarificationFill
    affected_entities: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)


class ClarificationArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default="v1", pattern="^v1$")
    kind: Literal["needs_clarification", "alternatives"]
    question: str = Field(min_length=1)
    alternatives: list[ClarificationAlternative] = Field(default_factory=list)
    parsed_command_preview: dict[str, Any] | None = None
    policy_plan: dict[str, Any] | None = None
    job_id: str = Field(min_length=1)
    step_no: int = Field(ge=1)
    clarification_request_id: str = Field(min_length=1)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @field_serializer("timestamp", when_used="always")
    def serialize_timestamp(self, value: datetime) -> str:
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


__all__ = ["ClarificationAlternative", "ClarificationArtifact", "ClarificationFill"]
