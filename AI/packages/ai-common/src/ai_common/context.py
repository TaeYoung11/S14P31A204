from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass, field
from uuid import uuid4


def _new_id() -> str:
    return str(uuid4())


@dataclass(slots=True)
class RequestContext:
    """로그와 큐 메시지로 전파되는 요청 단위 ID 묶음."""

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
