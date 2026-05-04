"""Thin worker adapter for layout import execution."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import ValidationError

from ai_domain import parse_layout_import
from ai_layout_import.service import convert_layout_to_ifc


def run_layout_import_job(payload: dict[str, Any], output_path: str | Path) -> dict[str, Any]:
    """Validate payload and run layout import conversion."""

    try:
        request = parse_layout_import(payload)
    except ValidationError as exc:
        return _error_result(
            code="validation_error",
            message="input validation failed",
            details=exc.errors(),
        )

    try:
        convert_layout_to_ifc(request, output_path)
    except ValueError as exc:
        return _error_result(
            code="validation_error",
            message="input validation failed",
            details=[{"type": "value_error", "msg": str(exc)}],
        )
    except Exception as exc:
        return _error_result(
            code="conversion_error",
            message="IFC generation failed",
            details=[{"type": type(exc).__name__, "msg": str(exc)}],
        )

    return {
        "ok": True,
        "output_path": str(Path(output_path)),
    }


def _error_result(code: str, message: str, details: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "ok": False,
        "code": code,
        "message": message,
        "details": details,
    }
