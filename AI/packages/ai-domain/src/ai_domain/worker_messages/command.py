from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

from ai_domain.worker_messages.payloads_2d import TwoDLlmCommandPayload
from ai_domain.worker_messages.payloads_3d import ThreeDLlmCommandPayload
from ai_domain.worker_messages.payloads_ifc_edit import IfcEditCommandPayload
from ai_domain.worker_messages.payloads_ifc_generate import IfcGenerateCommandPayload
from ai_domain.worker_messages.payloads_sd import SdRenderCommandPayload

StorageUrl = Annotated[str, Field(min_length=1, max_length=2048)]


class CommandInputRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceSceneStorageUrl: StorageUrl | None = None
    sourceImageStorageUrl: StorageUrl | None = None
    sourceIfcStorageUrl: StorageUrl | None = None
    commandJsonStorageUrl: StorageUrl | None = None


class ExpectedOutputRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    editPlanStorageUrl: StorageUrl | None = None
    draftPlanStorageUrl: StorageUrl | None = None
    threeDPlanStorageUrl: StorageUrl | None = None
    renderImageStorageUrl: StorageUrl | None = None
    ifcStorageUrl: StorageUrl | None = None
    validationReportStorageUrl: StorageUrl | None = None
    errorDetailStorageUrl: StorageUrl | None = None

    @model_validator(mode="after")
    def validate_has_output(self) -> ExpectedOutputRef:
        if not self.model_dump(exclude_none=True):
            raise ValueError("expectedOutput must contain at least one storage URL")
        return self


class CommandMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messageId: str = Field(min_length=1, max_length=128)
    schemaVersion: str = Field(pattern="^v1$")
    messageType: str = Field(pattern="^COMMAND$")
    commandType: str = Field(
        pattern="^(TWO_D_LLM_GENERATE|THREE_D_LLM_GENERATE|SD_RENDER_GENERATE|IFC_GENERATE_FROM_BUBBLE|IFC_EDIT_APPLY)$"
    )
    routingKey: str = Field(min_length=1, max_length=255)
    jobId: str = Field(min_length=1, max_length=128)
    jobStepId: str = Field(min_length=1, max_length=128)
    stepNo: int = Field(ge=1)
    totalSteps: int = Field(ge=1)
    projectId: str = Field(min_length=1, max_length=128)
    requestedBy: str = Field(min_length=1, max_length=128)
    sourceRevisionId: str | None = Field(default=None, min_length=1, max_length=128)
    sourceSceneStateId: str | None = Field(default=None, min_length=1, max_length=128)
    sourceSceneType: str | None = Field(default=None, min_length=1, max_length=64)
    targetRevisionId: str | None = Field(default=None, min_length=1, max_length=128)
    expectedOutputArtifactId: str = Field(min_length=1, max_length=128)
    input: CommandInputRef | None = None
    expectedOutput: ExpectedOutputRef
    payload: object
    attemptNo: int = Field(ge=0)
    maxAttempts: int = Field(ge=1)
    idempotencyKey: str = Field(min_length=1, max_length=255)
    correlationId: str = Field(min_length=1, max_length=255)
    createdAt: datetime

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
