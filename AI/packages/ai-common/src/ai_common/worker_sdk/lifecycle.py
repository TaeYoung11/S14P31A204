"""Lifecycle status and event naming helpers for worker runtime events."""

from __future__ import annotations

from typing import Literal, TypeAlias

LifecycleStatus: TypeAlias = Literal[
    "started",
    "progress",
    "completed",
    "failed",
    "clarification_required",
]

STARTED: LifecycleStatus = "started"
PROGRESS: LifecycleStatus = "progress"
COMPLETED: LifecycleStatus = "completed"
FAILED: LifecycleStatus = "failed"
CLARIFICATION_REQUIRED: LifecycleStatus = "clarification_required"

TERMINAL_STATUSES = frozenset({COMPLETED, FAILED, CLARIFICATION_REQUIRED})

_COMMAND_TYPE_MAP = {
    "TWO_D_LLM_GENERATE": {
        "worker_type": "TWO_D_LLM",
        "event_base": "TWO_D_LLM",
        "routing_segment": "2d-llm",
    },
    "THREE_D_LLM_GENERATE": {
        "worker_type": "THREE_D_LLM",
        "event_base": "THREE_D_LLM",
        "routing_segment": "3d-llm",
    },
    "SD_RENDER_GENERATE": {
        "worker_type": "SD_RENDER_GENERATE",
        "event_base": "SD_RENDER_GENERATE",
        "routing_segment": "sd-render",
    },
    "IFC_GENERATE_FROM_BUBBLE": {
        "worker_type": "IFC_GENERATE_FROM_BUBBLE",
        "event_base": "IFC_GENERATE_FROM_BUBBLE",
        "routing_segment": "ifc-generate",
    },
    "IFC_EDIT_APPLY": {
        "worker_type": "IFC_EDIT_APPLY",
        "event_base": "IFC_EDIT_APPLY",
        "routing_segment": "ifc-edit",
    },
}


def build_event_type(command_type: str, status: LifecycleStatus) -> str:
    """Build an eventType string that matches the current event schema enum set."""

    event_base = _lookup_command_type(command_type)["event_base"]
    return f"{event_base}_{status.upper()}"


def build_worker_type(command_type: str) -> str:
    """Build the canonical workerType string for runtime events."""

    return _lookup_command_type(command_type)["worker_type"]


def build_event_routing_key(worker_type: str, status: LifecycleStatus) -> str:
    """Build a stable event routing key from workerType and lifecycle status."""

    routing_segment = _lookup_worker_type(worker_type)["routing_segment"]
    return f"event.{routing_segment}.{status.replace('_', '-')}"


def is_terminal_status(status: LifecycleStatus) -> bool:
    """Return whether a lifecycle status is terminal."""

    return status in TERMINAL_STATUSES


def _lookup_command_type(command_type: str) -> dict[str, str]:
    try:
        return _COMMAND_TYPE_MAP[command_type]
    except KeyError as exc:
        raise ValueError(f"Unsupported command_type: {command_type}") from exc


def _lookup_worker_type(worker_type: str) -> dict[str, str]:
    for entry in _COMMAND_TYPE_MAP.values():
        if entry["worker_type"] == worker_type:
            return entry
    raise ValueError(f"Unsupported worker_type: {worker_type}")


__all__ = [
    "CLARIFICATION_REQUIRED",
    "COMPLETED",
    "FAILED",
    "LifecycleStatus",
    "PROGRESS",
    "STARTED",
    "TERMINAL_STATUSES",
    "build_event_routing_key",
    "build_event_type",
    "build_worker_type",
    "is_terminal_status",
]
