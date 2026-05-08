from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from .validation import ValidationIssue


class ErrorDetailArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default="v1", pattern="^v1$")
    error_code: str = Field(min_length=1)
    error_message: str = Field(min_length=1)
    error_class: str = Field(min_length=1)
    job_id: str = Field(min_length=1)
    step_no: int = Field(ge=1)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    validation_issues: list[ValidationIssue] | None = None
    uploaded_artifacts: list[str] = Field(default_factory=list)
    failed_artifact: str | None = None

    @field_serializer("timestamp", when_used="always")
    def serialize_timestamp(self, value: datetime) -> str:
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


__all__ = ["ErrorDetailArtifact"]
