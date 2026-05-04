from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from ai_common.worker_sdk.context import WorkerContext


def _new_id() -> str:
    return str(uuid4())


@dataclass(slots=True)
class RequestContext:
    """Request-scoped identifiers shared across logs and message envelopes."""

    request_id: str = field(default_factory=_new_id)
    correlation_id: str = ""
    project_id: str | None = None
    job_id: str | None = None
    revision_id: str | None = None
    message_id: str | None = None
    causation_id: str | None = None

    def __post_init__(self) -> None:
        if not self.correlation_id:
            self.correlation_id = self.request_id

    def to_log_fields(self) -> dict[str, str]:
        return {
            "request_id": self.request_id,
            "correlation_id": self.correlation_id,
            **self._optional_fields(),
        }

    def to_canonical_log_fields(
        self,
        *,
        idempotency_key: str | None = None,
        worker_type: str | None = None,
        worker_id: str | None = None,
        environment: str | None = None,
    ) -> dict[str, Any]:
        """Build camelCase log fields for runtime logging."""

        fields: dict[str, Any] = {
            "requestId": self.request_id,
            "correlationId": self.correlation_id,
            "projectId": self.project_id,
            "jobId": self.job_id,
            "revisionId": self.revision_id,
            "messageId": self.message_id,
            "causationId": self.causation_id,
            "idempotencyKey": idempotency_key,
            "workerType": worker_type,
            "workerId": worker_id,
            "environment": environment,
        }
        return {key: value for key, value in fields.items() if value is not None}

    def to_message_envelope(self) -> dict[str, str]:
        return self.to_log_fields()

    def _optional_fields(self) -> dict[str, str]:
        fields = {
            "project_id": self.project_id,
            "job_id": self.job_id,
            "revision_id": self.revision_id,
            "message_id": self.message_id,
            "causation_id": self.causation_id,
        }
        return {key: value for key, value in fields.items() if value is not None}

    @classmethod
    def from_worker_context(cls, worker_context: WorkerContext) -> RequestContext:
        """Project worker runtime metadata into request lineage fields."""

        return cls(
            request_id=worker_context.message_id,
            correlation_id=worker_context.correlation_id,
            project_id=worker_context.project_id,
            job_id=worker_context.job_id,
            revision_id=worker_context.target_revision_id or worker_context.source_revision_id,
            message_id=worker_context.message_id,
        )


_current_context: ContextVar[RequestContext | None] = ContextVar(
    "request_context",
    default=None,
)


def get_context() -> RequestContext:
    ctx = _current_context.get()
    if ctx is None:
        ctx = RequestContext()
        _current_context.set(ctx)
    return ctx


def set_context(ctx: RequestContext) -> Token[RequestContext | None]:
    return _current_context.set(ctx)


def clear_context() -> Token[RequestContext | None]:
    return _current_context.set(None)
