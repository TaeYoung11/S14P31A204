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


def build_event_routing_key(command_type: str, status: LifecycleStatus) -> str:
    """Build a stable event routing key from commandType and lifecycle status."""

    routing_segment = _lookup_command_type(command_type)["routing_segment"]
    return f"event.{routing_segment}.{normalize_status_segment(status)}"


def is_terminal_status(status: LifecycleStatus) -> bool:
    """Return whether a lifecycle status is terminal."""

    return status in TERMINAL_STATUSES


def normalize_status_segment(status: LifecycleStatus) -> str:
    """Normalize a lifecycle status for routing-key segments."""

    return status.replace("_", "-")


def _lookup_command_type(command_type: str) -> dict[str, str]:
    try:
        return _COMMAND_TYPE_MAP[command_type]
    except KeyError as exc:
        raise ValueError(f"Unsupported command_type: {command_type}") from exc




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
    "normalize_status_segment",
]
