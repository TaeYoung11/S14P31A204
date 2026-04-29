"""Shared helpers for extracting and propagating idempotency keys."""

from __future__ import annotations


def get_idempotency_key(command: object) -> str:
    """Extract the camelCase idempotency key from an object or dict."""

    value: object | None
    if isinstance(command, dict):
        value = command.get("idempotencyKey")
    else:
        value = getattr(command, "idempotencyKey", None)

    if not isinstance(value, str) or not value:
        raise ValueError("idempotencyKey is required")
    return value


def copy_idempotency_key(source: object, target: dict[str, object]) -> dict[str, object]:
    """Copy idempotencyKey from a source object into a target mapping."""

    target["idempotencyKey"] = get_idempotency_key(source)
    return target


def build_idempotency_fields(idempotency_key: str) -> dict[str, str]:
    """Build the canonical idempotency log or payload field mapping."""

    if not idempotency_key:
        raise ValueError("idempotencyKey is required")
    return {"idempotencyKey": idempotency_key}


__all__ = [
    "build_idempotency_fields",
    "copy_idempotency_key",
    "get_idempotency_key",
]
