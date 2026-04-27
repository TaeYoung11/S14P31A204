from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EngineRequestInlineRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(pattern="^v1$")
    request_id: str = Field(min_length=1, max_length=128)
    mode: str = Field(pattern="^(preview|apply)$")
    project_id: str = Field(min_length=1, max_length=128)
    base_revision_id: str | None = Field(default=None, min_length=1, max_length=128)
    operations: list[dict[str, object]] = Field(min_length=1)


class IfcEditCommandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    engineRequest: EngineRequestInlineRef | None = None
    commandJsonStorageUrl: str | None = Field(default=None, min_length=1, max_length=2048)

    @model_validator(mode="after")
    def validate_command_source(self) -> IfcEditCommandPayload:
        if self.engineRequest is None and self.commandJsonStorageUrl is None:
            raise ValueError("engineRequest or commandJsonStorageUrl must be provided")
        if self.engineRequest is not None and self.commandJsonStorageUrl is not None:
            raise ValueError("engineRequest and commandJsonStorageUrl cannot be provided together")
        return self
