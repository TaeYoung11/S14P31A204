"""End-to-end stair command runner from chat text through planning-3d."""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime
from pathlib import Path

import ifcopenshell
import pytest

from ai_planning_3d.pipeline import LLM3DPipeline

_AI_ROOT = Path(__file__).resolve().parents[3]
_SAMPLE_IFC = _AI_ROOT / "tests" / "sample_batang.ifc"
_CHAT_COMMAND = "1층 거실에 계단 만들어줘"
_OUT_DIR = Path.home() / "Downloads" / "batang_history"


def _use_heuristic_chat_parser(pipeline: LLM3DPipeline) -> None:
    async def parse(user_text: str, ifc_context: str | None = None):  # noqa: ARG001
        return pipeline.engine._heuristic_parse(user_text)

    pipeline.engine.parse_command = parse  # type: ignore[method-assign]


def _stair_count(ifc_path: Path) -> int:
    return len(ifcopenshell.open(str(ifc_path)).by_type("IfcStair"))


async def run_stair_chat_commands(
    ifc_path: Path,
    commands: list[str],
    output_path: Path,
    log_path: Path | None = None,
) -> list[dict[str, object]]:
    """Run chat commands against an IFC and record why apply did or did not happen."""
    current_ifc = ifc_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []

    for index, command in enumerate(commands, start=1):
        pipeline = LLM3DPipeline(ifc_path=str(current_ifc))
        _use_heuristic_chat_parser(pipeline)
        before_stairs = _stair_count(current_ifc)
        preview = await pipeline.execute_preview(command)

        record: dict[str, object] = {
            "index": index,
            "input_ifc": str(current_ifc),
            "instruction": command,
            "before_stairs": before_stairs,
            "preview_status": preview.get("status"),
            "summary": preview.get("summary"),
            "collision_warnings": preview.get("collision_warnings", []),
            "structural_warnings": preview.get("structural_warnings", []),
            "command": preview.get("command"),
            "apply_status": "not_applied",
            "ifc_written": False,
            "output_ifc": None,
            "after_stairs": before_stairs,
        }

        if preview.get("status") != "preview_ready":
            record["not_applied_reason"] = (
                preview.get("summary")
                or "Preview did not reach preview_ready, so IFC was not written."
            )
            records.append(record)
            continue

        result = await pipeline.execute_apply(
            str(preview["session_id"]),
            output_path=str(output_path),
        )
        record["apply_status"] = result.get("status")
        record["apply_summary"] = result.get("summary")

        if result.get("status") == "applied" and output_path.exists():
            current_ifc = output_path
            record["ifc_written"] = True
            record["output_ifc"] = str(output_path)
            record["after_stairs"] = _stair_count(output_path)
        else:
            record["not_applied_reason"] = result.get("summary") or "IFC was not written."

        records.append(record)

    if log_path is not None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    return records


@pytest.mark.asyncio
@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample IFC not found")
async def test_chat_stair_command_reports_apply_or_block_reason(tmp_path):
    output_ifc = tmp_path / f"{_SAMPLE_IFC.stem}_stair_command.ifc"
    log_path = tmp_path / f"{_SAMPLE_IFC.stem}_stair_command.json"

    [record] = await run_stair_chat_commands(
        _SAMPLE_IFC,
        [_CHAT_COMMAND],
        output_ifc,
        log_path,
    )

    assert log_path.exists()
    assert record["preview_status"] in {"preview_ready", "needs_clarification", "not_found"}
    if record["ifc_written"]:
        assert output_ifc.exists()
        assert record["apply_status"] == "applied"
        assert record["output_ifc"] == str(output_ifc)
    else:
        assert not output_ifc.exists()
        assert record["apply_status"] == "not_applied"
        assert record["not_applied_reason"]


if __name__ == "__main__":
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=_SAMPLE_IFC)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--log", type=Path)
    parser.add_argument(
        "--command",
        action="append",
        dest="commands",
        help="Chat command to run. Can be passed more than once.",
    )
    args = parser.parse_args()

    output = args.output or _OUT_DIR / f"{args.input.stem}_stair_chat_{timestamp}.ifc"
    log = args.log or _OUT_DIR / f"{args.input.stem}_stair_chat_{timestamp}.json"
    commands = args.commands or [_CHAT_COMMAND]
    result = asyncio.run(run_stair_chat_commands(args.input, commands, output, log))
    print(json.dumps(result, ensure_ascii=False, indent=2))
