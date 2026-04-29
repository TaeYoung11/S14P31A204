from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

StorageUrl = Annotated[str, Field(min_length=1, max_length=2048)]


class EventOutputRef(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    storageUrl: StorageUrl | None = Field(default=None, alias="storage_url")
    validationReportStorageUrl: StorageUrl | None = Field(
        default=None,
        alias="validation_report_storage_url",
    )
    errorDetailStorageUrl: StorageUrl | None = Field(
        default=None,
        alias="error_detail_storage_url",
    )


class EventError(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    code: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1)
    retryable: bool
    clarificationPossible: bool = Field(alias="clarification_possible")
    detailStorageUrl: StorageUrl | None = Field(default=None, alias="detail_storage_url")


class EventMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    eventId: str = Field(min_length=1, max_length=128, alias="event_id")
    schemaVersion: str = Field(pattern="^v1$", alias="schema_version")
    messageType: str = Field(pattern="^EVENT$", alias="message_type")
    eventType: str = Field(min_length=1, max_length=128, alias="event_type")
    routingKey: str = Field(min_length=1, max_length=255, alias="routing_key")
    jobId: str = Field(min_length=1, max_length=128, alias="job_id")
    jobStepId: str = Field(min_length=1, max_length=128, alias="job_step_id")
    stepNo: int = Field(ge=1, alias="step_no")
    totalSteps: int = Field(ge=1, alias="total_steps")
    projectId: str = Field(min_length=1, max_length=128, alias="project_id")
    workerType: str = Field(min_length=1, max_length=128, alias="worker_type")
    workerId: str = Field(min_length=1, max_length=128, alias="worker_id")
    sourceRevisionId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        alias="source_revision_id",
    )
    targetRevisionId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        alias="target_revision_id",
    )
    outputArtifactId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        alias="output_artifact_id",
    )
    status: str = Field(pattern="^(started|progress|completed|failed|clarification_required)$")
    progress: float | None = Field(default=None, ge=0, le=1)
    output: EventOutputRef | None = None
    error: EventError | None = None
    clarificationRequestId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        alias="clarification_request_id",
    )
    idempotencyKey: str = Field(min_length=1, max_length=255, alias="idempotency_key")
    correlationId: str = Field(min_length=1, max_length=255, alias="correlation_id")
    occurredAt: datetime = Field(alias="occurred_at")

    @model_validator(mode="after")
    def validate_status_requirements(self) -> EventMessage:
        if self.status == "progress" and self.progress is None:
            raise ValueError("progress is required when status is progress")
        if self.status == "failed" and self.error is None:
            raise ValueError("error is required when status is failed")
        if self.status == "clarification_required" and self.clarificationRequestId is None:
            raise ValueError(
                "clarificationRequestId is required when status is clarification_required"
            )
        if self.status == "completed" and self.output is None:
            raise ValueError("output is required when status is completed")
        return self

    @field_serializer("occurredAt", when_used="always")
    def serialize_occurred_at(self, value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")
