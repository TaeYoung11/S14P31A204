from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, cast
from uuid import uuid4

from ai_common.context import RequestContext, get_context


def build_message(
    payload: dict[str, Any],
    schema: str,
    schema_version: str = "v1",
) -> dict[str, Any]:
    if not schema:
        raise ValueError("schema는 비어 있을 수 없습니다")
    if not schema_version:
        raise ValueError("schema_version은 비어 있을 수 없습니다")

    ctx = get_context()
    envelope = {
        "message_id": str(uuid4()),
        "schema": schema,
        "schema_version": schema_version,
        "request_id": ctx.request_id,
        "correlation_id": ctx.correlation_id,
        "project_id": ctx.project_id,
        "job_id": ctx.job_id,
        "revision_id": ctx.revision_id,
        "causation_id": ctx.message_id,
        "created_at": _now_utc(),
    }
    return {"envelope": envelope, "payload": payload}


def context_from_envelope(message: dict[str, Any]) -> RequestContext:
    envelope_obj = message.get("envelope")
    if not isinstance(envelope_obj, dict):
        raise ValueError("message에는 envelope 객체가 있어야 합니다")
    envelope = cast(dict[str, Any], envelope_obj)

    return RequestContext(
        request_id=_required_str(envelope, "request_id"),
        correlation_id=_required_str(envelope, "correlation_id"),
        project_id=_optional_str(envelope, "project_id"),
        job_id=_optional_str(envelope, "job_id"),
        revision_id=_optional_str(envelope, "revision_id"),
        message_id=_required_str(envelope, "message_id"),
        causation_id=_optional_str(envelope, "causation_id"),
    )


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _required_str(envelope: dict[str, Any], key: str) -> str:
    value = envelope.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"envelope.{key}는 비어 있지 않은 string이어야 합니다")
    return value


def _optional_str(envelope: dict[str, Any], key: str) -> str | None:
    value = envelope.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value:
        raise ValueError(f"envelope.{key}는 null 또는 비어 있지 않은 string이어야 합니다")
    return value
