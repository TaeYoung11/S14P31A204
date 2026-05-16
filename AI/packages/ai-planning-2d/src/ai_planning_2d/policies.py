"""Compatibility wrapper for room planning policies."""

from __future__ import annotations

from .planning.policies import (
    RemoveRoomPolicyResult,
    ResizeRoomPolicyResult,
    plan_remove_room,
    plan_resize_room,
)

__all__ = [
    "RemoveRoomPolicyResult",
    "ResizeRoomPolicyResult",
    "plan_remove_room",
    "plan_resize_room",
]
