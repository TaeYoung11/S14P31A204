"""Worker runtime context models built from camelCase Python command objects."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class WorkerContext:
    """Normalized runtime metadata extracted from a Python command model."""

    message_id: str
    command_type: str
    routing_key: str
    job_id: str
    job_step_id: str
    step_no: int
    total_steps: int
    project_id: str
    requested_by: str
    expected_output_artifact_id: str
    attempt_no: int
    max_attempts: int
    idempotency_key: str
    correlation_id: str
    source_revision_id: str | None
    source_scene_state_id: str | None
    source_scene_type: str | None
    target_revision_id: str | None

    @classmethod
    def from_command(cls, command: object) -> WorkerContext:
        """Build runtime context from the canonical camelCase Python command model."""

        return cls(
            message_id=_required_attr(command, "messageId"),
            command_type=_required_attr(command, "commandType"),
            routing_key=_required_attr(command, "routingKey"),
            job_id=_required_attr(command, "jobId"),
            job_step_id=_required_attr(command, "jobStepId"),
            step_no=_required_int_attr(command, "stepNo"),
            total_steps=_required_int_attr(command, "totalSteps"),
            project_id=_required_attr(command, "projectId"),
            requested_by=_required_attr(command, "requestedBy"),
            expected_output_artifact_id=_required_attr(command, "expectedOutputArtifactId"),
            attempt_no=_required_int_attr(command, "attemptNo"),
            max_attempts=_required_int_attr(command, "maxAttempts"),
            idempotency_key=_required_attr(command, "idempotencyKey"),
            correlation_id=_required_attr(command, "correlationId"),
            source_revision_id=_optional_str_attr(command, "sourceRevisionId"),
            source_scene_state_id=_optional_str_attr(command, "sourceSceneStateId"),
            source_scene_type=_optional_str_attr(command, "sourceSceneType"),
            target_revision_id=_optional_str_attr(command, "targetRevisionId"),
        )

    def to_log_fields(self) -> dict[str, str | int]:
        """Return canonical camelCase runtime metadata for logging."""

        return {
            "jobId": self.job_id,
            "jobStepId": self.job_step_id,
            "projectId": self.project_id,
            "idempotencyKey": self.idempotency_key,
            "correlationId": self.correlation_id,
            "commandType": self.command_type,
            "messageId": self.message_id,
            "stepNo": self.step_no,
            "totalSteps": self.total_steps,
            "attemptNo": self.attempt_no,
            "maxAttempts": self.max_attempts,
        }


def _required_attr(source: object, name: str) -> str:
    value = getattr(source, name, None)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name} is required")
    return value


def _required_int_attr(source: object, name: str) -> int:
    value = getattr(source, name, None)
    if not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    return value


def _optional_str_attr(source: object, name: str) -> str | None:
    value = getattr(source, name, None)
    if value is None:
        return None
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name} must be a non-empty string when provided")
    return value


__all__ = ["WorkerContext"]
