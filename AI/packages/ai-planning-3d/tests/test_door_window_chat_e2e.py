"""Door/window chat command runner through planning-3d and authoring opening logic."""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime
from pathlib import Path

import ifcopenshell

from ai_planning_3d.pipeline import LLM3DPipeline

_AI_ROOT = Path(__file__).resolve().parents[3]
_SAMPLE_IFC = _AI_ROOT / "tests" / "sample_batang.ifc"
# 직접 실행할 때 채팅 문장은 여기만 수정하면 됩니다.
_CHAT_COMMAND = "1층 거실 북쪽 방에 문 만들고 2층에 남쪽과 북쪽에 창문 1개씩 만들어줘"
_OUT_DIR = Path.home() / "Downloads" / "batang_history"


def _use_heuristic_chat_parser(pipeline: LLM3DPipeline) -> None:
    async def parse(user_text: str, ifc_context: str | None = None):  # noqa: ARG001
        return pipeline.engine.parse_command_heuristic(user_text)

    pipeline.engine.parse_command = parse  # type: ignore[method-assign]


def _counts(ifc_path: Path) -> dict[str, int]:
    model = ifcopenshell.open(str(ifc_path))
    return {
        "doors": len(model.by_type("IfcDoor")),
        "windows": len(model.by_type("IfcWindow")),
        "openings": len(model.by_type("IfcOpeningElement")),
        "voids": len(model.by_type("IfcRelVoidsElement")),
        "fills": len(model.by_type("IfcRelFillsElement")),
    }


async def run_door_window_chat_commands(
    ifc_path: Path,
    commands: list[str],
    output_path: Path,
    log_path: Path | None = None,
) -> list[dict[str, object]]:
    """Run door/window chat commands and record creation or preview-block reasons."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []
    before = _counts(ifc_path)
    for command in commands:
        pipeline = LLM3DPipeline(ifc_path=str(ifc_path))
        _use_heuristic_chat_parser(pipeline)
        command_records = await pipeline.execute_chat_to_ifc(command, str(output_path))
        records.extend(command_records)

    after = _counts(output_path) if output_path.exists() else before
    for record in records:
        record["input_ifc"] = str(ifc_path)
        record["before"] = before
        record["after"] = after
        if record.get("ifc_written"):
            record["final_output_ifc"] = str(output_path)

    if log_path is not None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    return records


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

    output = args.output or _OUT_DIR / f"{args.input.stem}_door_window_chat_{timestamp}.ifc"
    log = args.log or _OUT_DIR / f"{args.input.stem}_door_window_chat_{timestamp}.json"
    commands = args.commands or [_CHAT_COMMAND]
    result = asyncio.run(run_door_window_chat_commands(args.input, commands, output, log))
    print(json.dumps(result, ensure_ascii=False, indent=2))
