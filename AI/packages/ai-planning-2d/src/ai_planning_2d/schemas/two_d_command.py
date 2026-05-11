from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from .command import CommandBatch, FloorNLPCommand


class TwoDCommandArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default="v1", pattern="^v1$")
    user_instruction: str = Field(min_length=1)
    parsed_command: FloorNLPCommand
    command_batch: CommandBatch
    needs_clarification: bool = False
    clarification_question: str | None = None
    parsed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @field_serializer("parsed_at", when_used="always")
    def serialize_parsed_at(self, value: datetime) -> str:
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


__all__ = ["TwoDCommandArtifact"]
