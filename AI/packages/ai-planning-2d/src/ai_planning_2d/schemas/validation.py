from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class PlanStatus(StrEnum):
    PLANNED = "planned"
    NEEDS_CLARIFICATION = "needs_clarification"
    REJECTED = "rejected"


class ValidationSeverity(StrEnum):
    ERROR = "error"
    WARNING = "warning"


class ValidationIssue(BaseModel):
    code: str
    severity: ValidationSeverity
    message: str
    context: dict[str, Any] = Field(default_factory=dict)


__all__ = ["PlanStatus", "ValidationIssue", "ValidationSeverity"]
