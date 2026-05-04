"""Typed worker results and shared event construction helpers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, TypeAlias
from uuid import uuid4

from ai_common.errors import ClarificationRequiredError, WorkerError, to_event_error_payload
from ai_common.worker_sdk.context import WorkerContext
from ai_common.worker_sdk.lifecycle import (
    CLARIFICATION_REQUIRED,
    COMPLETED,
    FAILED,
    PROGRESS,
    STARTED,
    LifecycleStatus,
    build_event_routing_key,
    build_event_type,
    build_worker_type,
)
from ai_domain.worker_messages.event import EventError, EventMessage, EventOutputRef


@dataclass(slots=True)
class CompletedResult:
    """Successful worker result with an output payload."""

    output: EventOutputRef | dict[str, object]
    progress: float | None = None
    status: Literal["completed"] = "completed"


@dataclass(slots=True)
class FailedResult:
    """Failed worker result backed by a shared worker error."""

    error: WorkerError
    status: Literal["failed"] = "failed"


@dataclass(slots=True)
class ClarificationResult:
    """Worker result that requests clarification before continuing."""

    error: ClarificationRequiredError
    status: Literal["clarification_required"] = "clarification_required"


@dataclass(slots=True)
class ProgressResult:
    """Optional non-terminal worker result used for progress events."""

    progress: float
    status: Literal["progress"] = "progress"


WorkerResult: TypeAlias = CompletedResult | FailedResult | ClarificationResult | ProgressResult


def build_started_event(context: WorkerContext, worker_id: str) -> EventMessage:
    """Build a started lifecycle event."""

    return _build_event(context, worker_id, STARTED)


def build_progress_event(
    context: WorkerContext,
    worker_id: str,
    progress: float,
) -> EventMessage:
    """Build a progress lifecycle event."""

    return _build_event(context, worker_id, PROGRESS, progress=progress)


def build_completed_event(
    context: WorkerContext,
    worker_id: str,
    result: CompletedResult,
) -> EventMessage:
    """Build a completed lifecycle event from a successful worker result."""

    return _build_event(
        context,
        worker_id,
        COMPLETED,
        output=_coerce_output(result.output),
        progress=result.progress,
    )


def build_failed_event(
    context: WorkerContext,
    worker_id: str,
    result: FailedResult,
) -> EventMessage:
    """Build a failed lifecycle event from a shared worker error."""

    return _build_event(
        context,
        worker_id,
        FAILED,
        error=EventError.model_validate(to_event_error_payload(result.error)),
    )


def build_clarification_event(
    context: WorkerContext,
    worker_id: str,
    result: ClarificationResult,
) -> EventMessage:
    """Build a clarification-required lifecycle event."""

    return _build_event(
        context,
        worker_id,
        CLARIFICATION_REQUIRED,
        error=EventError.model_validate(to_event_error_payload(result.error)),
        clarification_request_id=result.error.clarification_request_id,
    )


def build_terminal_event(
    context: WorkerContext,
    worker_id: str,
    result: WorkerResult,
) -> EventMessage:
    """Build the terminal lifecycle event for a typed worker result."""

    if isinstance(result, CompletedResult):
        return build_completed_event(context, worker_id, result)
    if isinstance(result, ClarificationResult):
        return build_clarification_event(context, worker_id, result)
    if isinstance(result, ProgressResult):
        return build_progress_event(context, worker_id, result.progress)
    return build_failed_event(context, worker_id, result)


def _build_event(
    context: WorkerContext,
    worker_id: str,
    status: LifecycleStatus,
    *,
    output: EventOutputRef | None = None,
    error: EventError | None = None,
    progress: float | None = None,
    clarification_request_id: str | None = None,
) -> EventMessage:
    worker_type = build_worker_type(context.command_type)
    return EventMessage.model_validate(
        {
            "eventId": str(uuid4()),
            "schemaVersion": "v1",
            "messageType": "EVENT",
            "eventType": build_event_type(context.command_type, status),
            "routingKey": build_event_routing_key(context.command_type, status),
            "jobId": context.job_id,
            "jobStepId": context.job_step_id,
            "stepNo": context.step_no,
            "totalSteps": context.total_steps,
            "projectId": context.project_id,
            "workerType": worker_type,
            "workerId": worker_id,
            "sourceRevisionId": context.source_revision_id,
            "targetRevisionId": context.target_revision_id,
            "outputArtifactId": context.expected_output_artifact_id,
            "status": status,
            "progress": progress,
            "output": output,
            "error": error,
            "clarificationRequestId": clarification_request_id,
            "idempotencyKey": context.idempotency_key,
            "correlationId": context.correlation_id,
            "occurredAt": _now_utc(),
        }
    )


def _coerce_output(output: EventOutputRef | dict[str, object]) -> EventOutputRef:
    if isinstance(output, EventOutputRef):
        return output
    return EventOutputRef.model_validate(output)


def _now_utc() -> datetime:
    return datetime.now(UTC)


__all__ = [
    "ClarificationResult",
    "CompletedResult",
    "FailedResult",
    "ProgressResult",
    "WorkerResult",
    "build_clarification_event",
    "build_completed_event",
    "build_failed_event",
    "build_progress_event",
    "build_started_event",
    "build_terminal_event",
]
