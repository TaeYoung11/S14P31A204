"""Shared runtime utilities used across AI worker packages."""

from __future__ import annotations

from importlib import import_module
from typing import Any

from ai_common.config import WorkerSettings, load_worker_settings
from ai_common.errors import (
    ClarificationRequiredError,
    ConfigurationError,
    NonRetryableWorkerError,
    RetryableWorkerError,
    ValidationWorkerError,
    WorkerError,
)

_LAZY_EXPORTS = {
    "HealthServer": ("ai_common.health", "HealthServer"),
    "config": ("ai_common.config", None),
    "configure_logging": ("ai_common.logging", "configure_logging"),
    "errors": ("ai_common.errors", None),
    "get_idempotency_key": ("ai_common.idempotency", "get_idempotency_key"),
    "get_logger": ("ai_common.logging", "get_logger"),
    "health": ("ai_common.health", None),
    "idempotency": ("ai_common.idempotency", None),
    "logging": ("ai_common.logging", None),
    "start_health_server": ("ai_common.health", "start_health_server"),
    "worker_sdk": ("ai_common.worker_sdk", None),
}


def __getattr__(name: str) -> Any:
    try:
        module_name, attr_name = _LAZY_EXPORTS[name]
    except KeyError as exc:  # pragma: no cover - normal Python fallback
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}") from exc

    module = import_module(module_name)
    value = module if attr_name is None else getattr(module, attr_name)
    globals()[name] = value
    return value


__all__ = [
    "ClarificationRequiredError",
    "ConfigurationError",
    "HealthServer",
    "NonRetryableWorkerError",
    "RetryableWorkerError",
    "ValidationWorkerError",
    "WorkerError",
    "WorkerSettings",
    "config",
    "configure_logging",
    "errors",
    "get_idempotency_key",
    "get_logger",
    "health",
    "idempotency",
    "load_worker_settings",
    "logging",
    "start_health_server",
    "worker_sdk",
]
