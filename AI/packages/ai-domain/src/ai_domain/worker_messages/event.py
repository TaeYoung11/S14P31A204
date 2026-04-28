from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

StorageUrl = Annotated[str, Field(min_length=1, max_length=2048)]


class EventOutputRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    storageUrl: StorageUrl | None = None
    validationReportStorageUrl: StorageUrl | None = None
    errorDetailStorageUrl: StorageUrl | None = None


class EventError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1)
    retryable: bool
    clarificationPossible: bool
    detailStorageUrl: StorageUrl | None = None


class EventMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eventId: str = Field(min_length=1, max_length=128)
    schemaVersion: str = Field(pattern="^v1$")
    messageType: str = Field(pattern="^EVENT$")
    eventType: str = Field(min_length=1, max_length=128)
    routingKey: str = Field(min_length=1, max_length=255)
    jobId: str = Field(min_length=1, max_length=128)
    jobStepId: str = Field(min_length=1, max_length=128)
    stepNo: int = Field(ge=1)
    totalSteps: int = Field(ge=1)
    projectId: str = Field(min_length=1, max_length=128)
    workerType: str = Field(min_length=1, max_length=128)
    workerId: str = Field(min_length=1, max_length=128)
    sourceRevisionId: str | None = Field(default=None, min_length=1, max_length=128)
    targetRevisionId: str | None = Field(default=None, min_length=1, max_length=128)
    outputArtifactId: str | None = Field(default=None, min_length=1, max_length=128)
    status: str = Field(pattern="^(started|progress|completed|failed|clarification_required)$")
    progress: float | None = Field(default=None, ge=0, le=1)
    output: EventOutputRef | None = None
    error: EventError | None = None
    idempotencyKey: str = Field(min_length=1, max_length=255)
    correlationId: str = Field(min_length=1, max_length=255)
    occurredAt: datetime

    @model_validator(mode="after")
    def validate_status_requirements(self) -> EventMessage:
        if self.status in {"failed", "clarification_required"} and self.error is None:
            raise ValueError("error is required when status is failed or clarification_required")
        return self
