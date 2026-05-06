"""Shared structlog bootstrap and log context binding helpers."""

from __future__ import annotations

import logging as stdlib_logging
from json import dumps as json_dumps
from typing import Any

try:
    import structlog
    from structlog.stdlib import BoundLogger
except Exception:  # pragma: no cover - exercised in local fallback only
    structlog = None  # type: ignore[assignment]
    BoundLogger = Any  # type: ignore[misc,assignment]

from ai_common.config import WorkerSettings
from ai_common.context import RequestContext, get_context

_LOG_KEY_ALIASES = {
    "request_id": "requestId",
    "requestId": "requestId",
    "correlation_id": "correlationId",
    "correlationId": "correlationId",
    "project_id": "projectId",
    "projectId": "projectId",
    "job_id": "jobId",
    "jobId": "jobId",
    "revision_id": "revisionId",
    "revisionId": "revisionId",
    "message_id": "messageId",
    "messageId": "messageId",
    "causation_id": "causationId",
    "causationId": "causationId",
    "idempotency_key": "idempotencyKey",
    "idempotencyKey": "idempotencyKey",
    "worker_type": "workerType",
    "workerType": "workerType",
    "worker_id": "workerId",
    "workerId": "workerId",
    "environment": "environment",
}


class _KeywordBoundLogger:
    def __init__(
        self,
        logger: stdlib_logging.Logger,
        context: dict[str, Any] | None = None,
    ) -> None:
        self._logger = logger
        self._context = context or {}

    def bind(self, **fields: Any) -> _KeywordBoundLogger:
        return _KeywordBoundLogger(
            self._logger,
            {**self._context, **_canonicalize_extra_fields(fields)},
        )

    def __getattr__(self, name: str) -> Any:
        target = getattr(self._logger, name)
        if not callable(target):
            return target

        def wrapper(event: str, *args: Any, **kwargs: Any) -> Any:
            context = {**self._context, **_canonicalize_extra_fields(kwargs)}
            if context:
                event = f"{event} | {json_dumps(context, ensure_ascii=False, sort_keys=True)}"
            return target(event, *args)

        return wrapper


def configure_logging(settings: WorkerSettings) -> None:
    """Configure the shared structlog + stdlib logging pipeline."""

    stdlib_logging.basicConfig(
        format="%(message)s",
        level=getattr(stdlib_logging, settings.log_level, stdlib_logging.INFO),
        force=True,
    )
    if structlog is None:
        return

    renderer: structlog.types.Processor
    if settings.log_json:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        renderer,
    ]
    structlog.reset_defaults()
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> BoundLogger:
    """Return a shared bound logger instance."""

    if structlog is None:
        return _KeywordBoundLogger(stdlib_logging.getLogger(name))
    return structlog.get_logger(name)


def build_log_context(
    *,
    context: RequestContext | None = None,
    idempotency_key: str | None = None,
    worker_type: str | None = None,
    worker_id: str | None = None,
    environment: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """Build canonical camelCase log fields from request and worker metadata."""

    request_context = context if context is not None else get_context()
    fields = request_context.to_canonical_log_fields(
        idempotency_key=idempotency_key,
        worker_type=worker_type,
        worker_id=worker_id,
        environment=environment,
    )
    fields.update(_canonicalize_extra_fields(extra))
    return fields


def bind_worker_logger(
    logger: BoundLogger,
    settings: WorkerSettings,
    **extra: Any,
) -> BoundLogger:
    """Bind worker-scoped metadata to a logger."""

    fields = _canonicalize_extra_fields(
        {
            "workerType": settings.worker_type,
            "workerId": settings.worker_id,
            "environment": settings.environment,
            **extra,
        }
    )
    if hasattr(logger, "bind"):
        return logger.bind(**fields)
    return stdlib_logging.LoggerAdapter(logger, fields)  # type: ignore[return-value]


def bind_request_logger(
    logger: BoundLogger,
    context: RequestContext | None = None,
    **extra: Any,
) -> BoundLogger:
    """Bind request-scoped metadata to a logger."""

    fields = build_log_context(context=context, **extra)
    if hasattr(logger, "bind"):
        return logger.bind(**fields)
    return stdlib_logging.LoggerAdapter(logger, fields)  # type: ignore[return-value]


def _canonicalize_extra_fields(fields: dict[str, Any]) -> dict[str, Any]:
    canonical: dict[str, Any] = {}
    for key, value in fields.items():
        if value is None:
            continue
        canonical_key = _LOG_KEY_ALIASES.get(key, key)
        canonical[canonical_key] = value
    return canonical


__all__ = [
    "bind_request_logger",
    "bind_worker_logger",
    "build_log_context",
    "configure_logging",
    "get_logger",
]
