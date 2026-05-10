"""Door/window chat command runner through planning-3d and authoring opening logic."""

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
_CHAT_COMMAND = "1층 거실 북쪽 방에 문 만들고 2층에 남쪽과 북쪽에 창문 1개씩 만들어줘"
_OUT_DIR = Path.home() / "Downloads" / "batang_history"


@pytest.mark.parametrize(
    ("command", "expected_type"),
    [
        ("1층 창문 만들어줘", "CREATE"),
        ("1층 창문 생성해줘", "CREATE"),
        ("1층 창문 넣어줘", "CREATE"),
        ("1층 창문 배치해줘", "CREATE"),
        ("창문 없애줘", "DELETE"),
        ("창문 삭제해줘", "DELETE"),
        ("창문 빼줘", "DELETE"),
        ("창문 제거해줘", "DELETE"),
    ],
)
def test_door_window_command_verbs(command, expected_type):
    pipeline = LLM3DPipeline()
    parsed = pipeline.engine.parse_command_heuristic(command)

    assert parsed.command_type == expected_type


def test_pipeline_splits_connected_create_commands():
    commands = LLM3DPipeline.split_chat_commands(
        "1층 거실 남쪽 방에 문 만들고 2층에 창문 3개 만들어줘"
    )

    assert commands == ["1층 거실 남쪽 방에 문 만들", "2층에 창문 3개 만들어줘"]


def test_pipeline_expands_direction_pair_each_commands():
    commands = LLM3DPipeline.split_chat_commands(
        "1층 거실 남쪽 방에 문 만들고 2층에 남쪽과 북쪽에 창문 1개씩 만들어줘"
    )

    assert commands == [
        "1층 거실 남쪽 방에 문 만들",
        "2층 남쪽에 창문 1개 만들어줘",
        "2층 북쪽에 창문 1개 만들어줘",
    ]


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


@pytest.mark.asyncio
@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample IFC not found")
async def test_chat_window_command_creates_opening_relationships(tmp_path):
    output_ifc = tmp_path / f"{_SAMPLE_IFC.stem}_window_command.ifc"
    log_path = tmp_path / f"{_SAMPLE_IFC.stem}_window_command.json"

    [record] = await run_door_window_chat_commands(
        _SAMPLE_IFC,
        ["1층 거실 남쪽 벽에 창문 만들어줘"],
        output_ifc,
        log_path,
    )

    assert log_path.exists()
    assert record["preview_status"] == "preview_ready"
    assert record["ifc_written"] is True
    assert record["apply_status"] == "applied"

    before = record["before"]
    after = record["after"]
    assert after["windows"] == before["windows"] + 1
    assert after["openings"] == before["openings"] + 1
    assert after["voids"] == before["voids"] + 1
    assert after["fills"] == before["fills"] + 1


@pytest.mark.asyncio
@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample IFC not found")
async def test_chat_door_command_creates_opening_relationships(tmp_path):
    output_ifc = tmp_path / f"{_SAMPLE_IFC.stem}_door_command.ifc"
    log_path = tmp_path / f"{_SAMPLE_IFC.stem}_door_command.json"

    [record] = await run_door_window_chat_commands(
        _SAMPLE_IFC,
        ["1층 거실 남쪽 벽에 문 만들어줘"],
        output_ifc,
        log_path,
    )

    assert log_path.exists()
    assert record["preview_status"] == "preview_ready"
    assert record["ifc_written"] is True
    assert record["apply_status"] == "applied"

    before = record["before"]
    after = record["after"]
    assert after["doors"] == before["doors"] + 1
    assert after["openings"] == before["openings"] + 1
    assert after["voids"] == before["voids"] + 1
    assert after["fills"] == before["fills"] + 1


@pytest.mark.asyncio
@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample IFC not found")
async def test_single_chat_can_apply_multiple_door_window_commands(tmp_path):
    output_ifc = tmp_path / f"{_SAMPLE_IFC.stem}_multi_command.ifc"
    log_path = tmp_path / f"{_SAMPLE_IFC.stem}_multi_command.json"
    chat = "1층 거실에 문을 만들어주고, 2층 화장실에 창문 만들어줘."

    records = await run_door_window_chat_commands(
        _SAMPLE_IFC,
        [chat],
        output_ifc,
        log_path,
    )

    assert log_path.exists()
    assert len(records) == 2
    assert output_ifc.exists()
    assert all(record["preview_status"] == "preview_ready" for record in records)
    assert all(record["apply_status"] == "applied" for record in records)

    before = records[0]["before"]
    after = records[-1]["after"]
    assert after["doors"] == before["doors"] + 1
    assert after["windows"] == before["windows"] + 1
    assert after["openings"] == before["openings"] + 2
    assert after["voids"] == before["voids"] + 2
    assert after["fills"] == before["fills"] + 2


@pytest.mark.asyncio
@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample IFC not found")
async def test_single_chat_can_apply_connected_command_with_window_count(tmp_path):
    output_ifc = tmp_path / f"{_SAMPLE_IFC.stem}_count_command.ifc"
    log_path = tmp_path / f"{_SAMPLE_IFC.stem}_count_command.json"
    chat = "1층 거실 남쪽 방에 문 만들고 2층에 창문 3개 만들어줘"

    records = await run_door_window_chat_commands(
        _SAMPLE_IFC,
        [chat],
        output_ifc,
        log_path,
    )

    assert log_path.exists()
    assert len(records) == 4
    assert output_ifc.exists()
    assert all(record["preview_status"] == "preview_ready" for record in records)
    assert all(record["apply_status"] == "applied" for record in records)

    before = records[0]["before"]
    after = records[-1]["after"]
    assert after["doors"] == before["doors"] + 1
    assert after["windows"] == before["windows"] + 3
    assert after["openings"] == before["openings"] + 4
    assert after["voids"] == before["voids"] + 4
    assert after["fills"] == before["fills"] + 4
    if _SAMPLE_IFC.stem == "sample_shinchan":
        window_x_values = [
            record["command"]["create_info"]["start_point"]["x"]
            for record in records
            if record["command"]["create_info"]["element_type"] == "IfcWindow"
        ]
        assert len(set(window_x_values)) == 3
        assert all(not 9200.0 <= x <= 10600.0 for x in window_x_values)


@pytest.mark.asyncio
@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample IFC not found")
async def test_single_chat_can_apply_south_and_north_windows(tmp_path):
    output_ifc = tmp_path / f"{_SAMPLE_IFC.stem}_direction_pair.ifc"
    log_path = tmp_path / f"{_SAMPLE_IFC.stem}_direction_pair.json"
    chat = "1층 거실 남쪽 방에 문 만들고 2층에 남쪽과 북쪽에 창문 1개씩 만들어줘"

    records = await run_door_window_chat_commands(
        _SAMPLE_IFC,
        [chat],
        output_ifc,
        log_path,
    )

    assert log_path.exists()
    assert len(records) == 3
    assert output_ifc.exists()
    assert all(record["preview_status"] == "preview_ready" for record in records)
    assert all(record["apply_status"] == "applied" for record in records)

    before = records[0]["before"]
    after = records[-1]["after"]
    assert after["doors"] == before["doors"] + 1
    assert after["windows"] == before["windows"] + 2
    assert after["openings"] == before["openings"] + 3
    assert after["voids"] == before["voids"] + 3
    assert after["fills"] == before["fills"] + 3

    directions = [
        record["command"]["create_info"]["direction"]
        for record in records
        if record["command"]["create_info"]["element_type"] == "IfcWindow"
    ]
    assert directions == ["South", "North"]

    output_model = ifcopenshell.open(str(output_ifc))
    host_names = [
        output_model.by_guid(record["command"]["create_info"]["host_wall_global_id"]).Name
        for record in records
        if record["command"]["create_info"]["element_type"] == "IfcWindow"
    ]
    assert all("rail" not in host_name.lower() for host_name in host_names)
    assert all("fence" not in host_name.lower() for host_name in host_names)
    if _SAMPLE_IFC.stem == "sample_shinchan":
        assert host_names == ["2F_Ext_S", "2F_Ext_N"]
        window_x_values = [
            record["command"]["create_info"]["start_point"]["x"]
            for record in records
            if record["command"]["create_info"]["element_type"] == "IfcWindow"
        ]
        assert all(not 9200.0 <= x <= 10600.0 for x in window_x_values)
        door_record = next(
            record for record in records
            if record["command"]["create_info"]["element_type"] == "IfcDoor"
        )
        door_host_id = door_record["command"]["create_info"]["host_wall_global_id"]
        assert output_model.by_guid(door_host_id).Name == "1F_Living_South"


@pytest.mark.asyncio
@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample IFC not found")
async def test_single_chat_can_create_then_delete_door(tmp_path):
    output_ifc = tmp_path / f"{_SAMPLE_IFC.stem}_door_delete.ifc"
    log_path = tmp_path / f"{_SAMPLE_IFC.stem}_door_delete.json"
    chat = "1층 거실에 문 만들어줘. 문 없애줘"

    records = await run_door_window_chat_commands(
        _SAMPLE_IFC,
        [chat],
        output_ifc,
        log_path,
    )

    assert log_path.exists()
    assert len(records) == 2
    assert output_ifc.exists()
    assert all(record["preview_status"] == "preview_ready" for record in records)
    assert all(record["apply_status"] == "applied" for record in records)

    before = records[0]["before"]
    after = records[-1]["after"]
    assert after["doors"] == before["doors"]
    assert after["openings"] == before["openings"]
    assert after["voids"] == before["voids"]
    assert after["fills"] == before["fills"]


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
