"""Protocol-based shared worker loop primitives."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Protocol

from ai_common.errors import (
    ClarificationRequiredError,
    NonRetryableWorkerError,
    WorkerError,
)
from ai_common.worker_sdk.context import WorkerContext
from ai_common.worker_sdk.event_factory import (
    ClarificationResult,
    CompletedResult,
    FailedResult,
    ProgressResult,
    WorkerResult,
    build_progress_event,
    build_started_event,
    build_terminal_event,
)
from ai_domain.worker_messages.event import EventMessage

_logger: Any | None = None


class EventPublisher(Protocol):
    """Protocol boundary for publishing worker lifecycle events."""

    def publish(self, event: EventMessage) -> None:
        """Publish a single lifecycle event."""


class BaseWorker(ABC):
    """Concrete-library-independent worker loop with shared event emission."""

    def __init__(self, *, worker_id: str, event_publisher: EventPublisher) -> None:
        self.worker_id = worker_id
        self.event_publisher = event_publisher

    @abstractmethod
    def process(self, command: object) -> WorkerResult:
        """Process a canonical command object and return a terminal worker result."""

    def handle(self, command: object) -> WorkerResult:
        """Run the shared worker loop for a single command."""

        context = WorkerContext.from_command(command)
        started_event = build_started_event(context, self.worker_id)
        self._log_event_publish_started(started_event)
        self._publish(started_event)
        self._log_event_publish_completed(started_event)

        try:
            result = self.process(command)
            terminal_result = self._coerce_result(result)
        except ClarificationRequiredError as error:
            _logger.warning(
                "worker_clarification_required",
                extra={
                    "workerId": self.worker_id,
                    "code": error.code,
                    "errorMessage": error.message,
                },
            )
            terminal_result = ClarificationResult(error=error)
        except WorkerError as error:
            _logger.error(
                "worker_failed",
                extra={
                    "workerId": self.worker_id,
                    "code": error.code,
                    "errorMessage": error.message,
                    "retryable": error.retryable,
                },
            )
            terminal_result = FailedResult(error=error)
        except Exception as error:
            _logger.exception(
                "worker_unhandled_exception",
                extra={
                    "workerId": self.worker_id,
                    "error": str(error),
                },
            )
            terminal_result = FailedResult(error=self._build_unhandled_error(error))

        terminal_event = build_terminal_event(context, self.worker_id, terminal_result)
        self._log_event_publish_started(terminal_event)
        self._publish(terminal_event)
        self._log_event_publish_completed(terminal_event)
        return terminal_result

    def emit_progress(self, context: WorkerContext, progress: float) -> EventMessage:
        """Publish an explicit progress event for the given runtime context."""

        event = build_progress_event(context, self.worker_id, progress)
        self._publish(event)
        return event

    def _publish(self, event: EventMessage) -> None:
        self.event_publisher.publish(event)

    def _log_event_publish_started(self, event: EventMessage) -> None:
        _get_logger().info(
            "worker_lifecycle_event_publish_started",
            workerId=self.worker_id,
            eventType=event.eventType,
            routingKey=event.routingKey,
            status=event.status,
            jobId=event.jobId,
            jobStepId=event.jobStepId,
            correlationId=event.correlationId,
        )

    def _log_event_publish_completed(self, event: EventMessage) -> None:
        _get_logger().info(
            "worker_lifecycle_event_publish_completed",
            workerId=self.worker_id,
            eventType=event.eventType,
            routingKey=event.routingKey,
            status=event.status,
            eventId=event.eventId,
            jobId=event.jobId,
            jobStepId=event.jobStepId,
            correlationId=event.correlationId,
        )

    def _coerce_result(self, result: object) -> WorkerResult:
        if isinstance(
            result,
            CompletedResult | FailedResult | ClarificationResult | ProgressResult,
        ):
            return result
        raise TypeError(
            "process() must return CompletedResult, FailedResult, "
            "ClarificationResult, or ProgressResult"
        )

    def _build_unhandled_error(self, error: Exception) -> NonRetryableWorkerError:
        message = str(error) or "Unhandled worker exception"
        return NonRetryableWorkerError(
            code="UNHANDLED_WORKER_EXCEPTION",
            message=message,
        )


def _get_logger() -> Any:
    global _logger
    if _logger is None:
        from ai_common.logging import get_logger

        _logger = get_logger(__name__)
    return _logger


__all__ = ["BaseWorker", "EventPublisher"]
