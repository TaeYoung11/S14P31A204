"""Thin worker adapter for layout import execution."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import ValidationError

from ai_domain import LayoutImportV1
from ai_layout_import.service import convert_layout_to_ifc


def run_layout_import_job(payload: dict[str, Any], output_path: str | Path) -> dict[str, Any]:
    """Validate payload and run layout import conversion."""

    try:
        request = LayoutImportV1.model_validate(payload)
    except ValidationError as exc:
        return _error_result(
            code="validation_error",
            message="입력 검증에 실패했습니다.",
            details=exc.errors(),
        )

    try:
        convert_layout_to_ifc(request, output_path)
    except ValueError as exc:
        return _error_result(
            code="validation_error",
            message="입력 검증에 실패했습니다.",
            details=[{"type": "value_error", "msg": str(exc)}],
        )
    except Exception as exc:
        return _error_result(
            code="conversion_error",
            message="IFC 생성에 실패했습니다.",
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
