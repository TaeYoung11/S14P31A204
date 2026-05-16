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
        return pipeline.engine.parse_command_heuristic(user_text)

    pipeline.engine.parse_command = parse  # type: ignore[method-assign]


def _stair_count(ifc_path: Path) -> int:
    return len(ifcopenshell.open(str(ifc_path)).by_type("IfcStair"))


def test_pipeline_splits_stair_chat_command():
    commands = LLM3DPipeline.split_chat_commands(_CHAT_COMMAND)

    assert commands == [_CHAT_COMMAND]


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
        command_output_path = output_path
        if len(commands) > 1:
            command_output_path = output_path.with_name(
                f"{output_path.stem}_{index:02d}{output_path.suffix}"
            )
        input_for_command = current_ifc
        pipeline = LLM3DPipeline(ifc_path=str(current_ifc))
        _use_heuristic_chat_parser(pipeline)
        before_stairs = _stair_count(current_ifc)
        command_records = await pipeline.execute_chat_to_ifc(command, str(command_output_path))
        after_stairs = (
            _stair_count(command_output_path) if command_output_path.exists() else before_stairs
        )
        if command_output_path.exists() and any(
            record.get("ifc_written") for record in command_records
        ):
            current_ifc = command_output_path

        for record in command_records:
            record["batch_index"] = index
            record["input_ifc"] = str(input_for_command)
            record["before_stairs"] = before_stairs
            record["after_stairs"] = after_stairs
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
        assert record["apply_status"] in {"not_applied", "preview_blocked"}
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
