from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_serializer, model_validator

from ai_domain.worker_messages.payloads_2d import TwoDLlmCommandPayload
from ai_domain.worker_messages.payloads_3d import ThreeDLlmCommandPayload
from ai_domain.worker_messages.payloads_ifc_edit import IfcEditCommandPayload
from ai_domain.worker_messages.payloads_ifc_generate import IfcGenerateCommandPayload
from ai_domain.worker_messages.payloads_sd import SdRenderCommandPayload

StorageUrl = Annotated[str, Field(min_length=1, max_length=2048)]


class CommandInputRef(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    sourceSceneStorageUrl: StorageUrl | None = Field(default=None, alias="source_scene_storage_url")
    sourceImageStorageUrl: StorageUrl | None = Field(default=None, alias="source_image_storage_url")
    sourceIfcStorageUrl: StorageUrl | None = Field(default=None, alias="source_ifc_storage_url")
    commandJsonStorageUrl: StorageUrl | None = Field(default=None, alias="command_json_storage_url")


class ExpectedOutputRef(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    editPlanStorageUrl: StorageUrl | None = Field(default=None, alias="edit_plan_storage_url")
    draftPlanStorageUrl: StorageUrl | None = Field(default=None, alias="draft_plan_storage_url")
    threeDPlanStorageUrl: StorageUrl | None = Field(default=None, alias="three_d_plan_storage_url")
    renderImageStorageUrl: StorageUrl | None = Field(default=None, alias="render_image_storage_url")
    renderManifestStorageUrl: StorageUrl | None = Field(
        default=None,
        alias="render_manifest_storage_url",
    )
    renderPhotoFrontDiagonalLeftStorageUrl: StorageUrl | None = Field(
        default=None,
        alias="render_photo_front_diagonal_left_storage_url",
    )
    renderPhotoFrontDiagonalRightStorageUrl: StorageUrl | None = Field(
        default=None,
        alias="render_photo_front_diagonal_right_storage_url",
    )
    ifcStorageUrl: StorageUrl | None = Field(default=None, alias="ifc_storage_url")
    validationReportStorageUrl: StorageUrl | None = Field(
        default=None,
        alias="validation_report_storage_url",
    )
    errorDetailStorageUrl: StorageUrl | None = Field(
        default=None,
        alias="error_detail_storage_url",
    )

    @model_validator(mode="after")
    def validate_has_output(self) -> ExpectedOutputRef:
        if not self.model_dump(exclude_none=True):
            raise ValueError("expectedOutput must contain at least one storage URL")
        return self


class CommandMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    messageId: str = Field(min_length=1, max_length=128, alias="message_id")
    schemaVersion: str = Field(pattern="^v1$", alias="schema_version")
    messageType: str = Field(pattern="^COMMAND$", alias="message_type")
    commandType: str = Field(
        alias="command_type",
        pattern="^(TWO_D_LLM_GENERATE|THREE_D_LLM_GENERATE|SD_RENDER_GENERATE|IFC_GENERATE_FROM_BUBBLE|IFC_EDIT_APPLY)$"
    )
    routingKey: str = Field(min_length=1, max_length=255, alias="routing_key")
    jobId: str = Field(min_length=1, max_length=128, alias="job_id")
    jobStepId: str = Field(min_length=1, max_length=128, alias="job_step_id")
    stepNo: int = Field(ge=1, alias="step_no")
    totalSteps: int = Field(ge=1, alias="total_steps")
    projectId: str = Field(min_length=1, max_length=128, alias="project_id")
    requestedBy: str = Field(min_length=1, max_length=128, alias="requested_by")
    sourceRevisionId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        alias="source_revision_id",
    )
    sourceSceneStateId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        alias="source_scene_state_id",
    )
    sourceSceneType: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        alias="source_scene_type",
    )
    targetRevisionId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        alias="target_revision_id",
    )
    expectedOutputArtifactId: str = Field(
        min_length=1,
        max_length=128,
        alias="expected_output_artifact_id",
    )
    input: CommandInputRef | None = Field(default=None, alias="input")
    expectedOutput: ExpectedOutputRef = Field(alias="expected_output")
    payload: object = Field(alias="payload")
    attemptNo: int = Field(ge=0, alias="attempt_no")
    maxAttempts: int = Field(ge=1, alias="max_attempts")
    idempotencyKey: str = Field(min_length=1, max_length=255, alias="idempotency_key")
    correlationId: str = Field(min_length=1, max_length=255, alias="correlation_id")
    createdAt: datetime = Field(alias="created_at")

    @model_validator(mode="after")
    def validate_step_range(self) -> CommandMessage:
        if self.stepNo > self.totalSteps:
            raise ValueError("stepNo cannot be greater than totalSteps")
        return self

    @model_validator(mode="after")
    def validate_payload(self) -> CommandMessage:
        adapters = {
            "TWO_D_LLM_GENERATE": TypeAdapter(TwoDLlmCommandPayload),
            "THREE_D_LLM_GENERATE": TypeAdapter(ThreeDLlmCommandPayload),
            "SD_RENDER_GENERATE": TypeAdapter(SdRenderCommandPayload),
            "IFC_GENERATE_FROM_BUBBLE": TypeAdapter(IfcGenerateCommandPayload),
            "IFC_EDIT_APPLY": TypeAdapter(IfcEditCommandPayload),
        }
        self.payload = adapters[self.commandType].validate_python(self.payload)
        return self

    @field_serializer("createdAt", when_used="always")
    def serialize_created_at(self, value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")
