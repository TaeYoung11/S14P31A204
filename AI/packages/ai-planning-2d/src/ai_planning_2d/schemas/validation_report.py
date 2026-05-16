from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .validation import ValidationIssue


class ValidationReportArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default="v1", pattern="^v1$")
    artifact_id: str = Field(min_length=1)
    job_id: str = Field(min_length=1)
    step_no: int = Field(ge=1)
    plan_validation_issues: list[ValidationIssue] = Field(default_factory=list)
    plan_validation_warnings: list[ValidationIssue] = Field(default_factory=list)
    preview_warnings: list[str] = Field(default_factory=list)
    ifc_validation_issues: list[ValidationIssue] | None = None


__all__ = ["ValidationReportArtifact"]
