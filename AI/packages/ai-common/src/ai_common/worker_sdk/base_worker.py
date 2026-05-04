"""Protocol-based shared worker loop primitives."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Protocol

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
        self._publish(build_started_event(context, self.worker_id))

        try:
            result = self.process(command)
            terminal_result = self._coerce_result(result)
        except ClarificationRequiredError as error:
            terminal_result = ClarificationResult(error=error)
        except WorkerError as error:
            terminal_result = FailedResult(error=error)
        except Exception as error:
            terminal_result = FailedResult(error=self._build_unhandled_error(error))

        self._publish(build_terminal_event(context, self.worker_id, terminal_result))
        return terminal_result

    def emit_progress(self, context: WorkerContext, progress: float) -> EventMessage:
        """Publish an explicit progress event for the given runtime context."""

        event = build_progress_event(context, self.worker_id, progress)
        self._publish(event)
        return event

    def _publish(self, event: EventMessage) -> None:
        self.event_publisher.publish(event)

    def _coerce_result(self, result: object) -> WorkerResult:
        if isinstance(
            result,
            (CompletedResult, FailedResult, ClarificationResult, ProgressResult),
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


__all__ = ["BaseWorker", "EventPublisher"]
