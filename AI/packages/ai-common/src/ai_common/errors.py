"""Shared worker error hierarchy and error payload helpers."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True, eq=False)
class WorkerError(Exception):
    """Base exception for shared worker runtime failures."""

    code: str
    message: str
    retryable: bool = False
    clarification_possible: bool = False
    detail_storage_url: str | None = None

    def __post_init__(self) -> None:
        Exception.__init__(self, self.message)

    def __str__(self) -> str:
        return self.message


@dataclass(slots=True, eq=False)
class RetryableWorkerError(WorkerError):
    """Failure that can be retried by the worker runtime."""

    retryable: bool = True
    clarification_possible: bool = False


@dataclass(slots=True, eq=False)
class NonRetryableWorkerError(WorkerError):
    """Failure that should not be retried automatically."""

    retryable: bool = False
    clarification_possible: bool = False


@dataclass(slots=True, eq=False)
class ValidationWorkerError(NonRetryableWorkerError):
    """Failure caused by invalid input or domain validation."""


@dataclass(slots=True, eq=False)
class ConfigurationError(NonRetryableWorkerError):
    """Failure caused by invalid worker configuration."""


@dataclass(slots=True, eq=False)
class ClarificationRequiredError(WorkerError):
    """Failure that requires a clarification request before continuing."""

    clarification_request_id: str = ""
    retryable: bool = False
    clarification_possible: bool = True
    preview_data: dict[str, object] | None = None

    def __post_init__(self) -> None:
        WorkerError.__post_init__(self)
        if not self.clarification_request_id:
            raise ValueError("clarification_request_id is required")


def to_event_error_payload(error: WorkerError) -> dict[str, object]:
    """Convert a shared worker error into the EventError payload shape."""

    payload: dict[str, object] = {
        "code": error.code,
        "message": error.message,
        "retryable": error.retryable,
        "clarificationPossible": error.clarification_possible,
    }
    if error.detail_storage_url is not None:
        payload["detailStorageUrl"] = error.detail_storage_url
    return payload


__all__ = [
    "ClarificationRequiredError",
    "ConfigurationError",
    "NonRetryableWorkerError",
    "RetryableWorkerError",
    "ValidationWorkerError",
    "WorkerError",
    "to_event_error_payload",
]
