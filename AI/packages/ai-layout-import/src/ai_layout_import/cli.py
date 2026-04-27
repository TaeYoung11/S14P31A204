"""CLI for JSON to IFC conversion."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any
from collections.abc import Sequence

from ai_layout_import.worker import run_layout_import_job


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert layout JSON to IFC.")
    parser.add_argument("--input", required=True, help="Path to layout import JSON file.")
    parser.add_argument("--output", required=True, help="Path to output IFC file.")
    args = parser.parse_args(argv)

    input_path = Path(args.input)
    try:
        payload = json.loads(input_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return _print_error(
            code="input_error",
            message="입력 JSON 파싱에 실패했습니다.",
            details=[{"type": "json_decode_error", "msg": str(exc)}],
        )
    except OSError as exc:
        return _print_error(
            code="input_error",
            message="입력 파일을 읽을 수 없습니다.",
            details=[{"type": type(exc).__name__, "msg": str(exc)}],
        )

    if not isinstance(payload, dict):
        return _print_error(
            code="input_error",
            message="입력 JSON의 최상위 구조는 object여야 합니다.",
            details=[{"type": "invalid_payload_type", "msg": type(payload).__name__}],
        )

    result = run_layout_import_job(payload, args.output)
    stream = sys.stdout if result["ok"] else sys.stderr
    print(json.dumps(result, ensure_ascii=False), file=stream)
    return 0 if result["ok"] else _exit_code_for(result["code"])


def _print_error(code: str, message: str, details: list[dict[str, Any]]) -> int:
    result = {
        "ok": False,
        "code": code,
        "message": message,
        "details": details,
    }
    print(json.dumps(result, ensure_ascii=False), file=sys.stderr)
    return _exit_code_for(code)


def _exit_code_for(code: str) -> int:
    if code in {"validation_error", "input_error"}:
        return 2
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
