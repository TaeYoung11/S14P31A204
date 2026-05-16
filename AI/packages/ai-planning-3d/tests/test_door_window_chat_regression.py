"""Regression tests for door/window chat command parsing and IFC application."""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell
import pytest

sys.path.append(str(Path(__file__).resolve().parent))

from ai_planning_3d.command import (
    LLM3DCommand,
    LLM3DCommandType,
    LLM3DCreateInfo,
    LLM3DElementType,
    LLM3DPoint3D,
)
from ai_planning_3d.pipeline import LLM3DPipeline
from test_door_window_chat_e2e import _SAMPLE_IFC, run_door_window_chat_commands


def test_split_chat_commands_keeps_complete_request_sentences():
    commands = LLM3DPipeline.split_chat_commands("문 만들고 창문 만들어줘")

    assert commands == ["문 만들어줘", "창문 만들어줘"]


@pytest.mark.parametrize(
    ("command", "expected_type"),
    [
        ("1층 창문 만들어줘", "CREATE"),
        ("1층 창문 생성해줘", "CREATE"),
        ("1층 창문 넣어줘", "CREATE"),
        ("1층 창문 배치해줘", "CREATE"),
        ("1층 화장실에 문 달아줘", "CREATE"),
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


@pytest.mark.parametrize(
    "command",
    [
        "창문 위치를 옮겨달라",
        "문 색을 바꿔달라",
    ],
)
def test_door_window_request_verbs_do_not_treat_suffix_dal_as_create(command):
    pipeline = LLM3DPipeline()
    parsed = pipeline.engine.parse_command_heuristic(command)

    assert parsed.command_type != "CREATE"


def test_door_window_delete_select_all_requires_explicit_all_expression():
    pipeline = LLM3DPipeline()

    single = pipeline.engine.parse_command_heuristic("창문 삭제해줘")
    all_windows = pipeline.engine.parse_command_heuristic("모든 창문 삭제해줘")

    assert single.target.select_all is False
    assert all_windows.target.select_all is True


@pytest.mark.asyncio
@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample IFC not found")
async def test_door_host_wall_missing_returns_wall_clarification_options():
    pipeline = LLM3DPipeline(ifc_path=str(_SAMPLE_IFC))
    command = LLM3DCommand(
        command_type=LLM3DCommandType.CREATE,
        raw_instruction="create a door far from every wall",
        create_info=LLM3DCreateInfo(
            element_type=LLM3DElementType.DOOR,
            storey="1F",
            start_point=LLM3DPoint3D(x=999_000.0, y=999_000.0, z=0.0),
            length_mm=900.0,
            width_mm=200.0,
            height_mm=2100.0,
            direction=None,
        ),
    )

    result = await pipeline.execute_command_preview(command)

    assert result["status"] == "needs_clarification"
    assert result["session_id"]
    assert result["clarification_questions"]
    [question] = result["clarification_questions"]
    assert question["trigger"] == "custom"
    assert question["context"]["apply_field"] == "host_wall_global_id"
    assert question["options"]
    first_option = question["options"][0]
    assert first_option["id"] == first_option["value"]
    assert first_option["label"]

    command.create_info.host_wall_global_id = first_option["value"]
    resolved = await pipeline.execute_command_preview(command)

    assert resolved["status"] == "preview_ready"
    assert command.create_info.host_wall_global_id == first_option["value"]


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

    records = await run_door_window_chat_commands(
        _SAMPLE_IFC,
        ["1층 거실에 문을 만들어주고, 2층 화장실에 창문 만들어줘."],
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
    records = await run_door_window_chat_commands(
        _SAMPLE_IFC,
        ["1층 거실 남쪽 방에 문 만들고 2층에 창문 3개 만들어줘"],
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
    records = await run_door_window_chat_commands(
        _SAMPLE_IFC,
        ["1층 거실 북쪽 방에 문 만들고 2층에 남쪽과 북쪽에 창문 1개씩 만들어줘"],
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

    records = await run_door_window_chat_commands(
        _SAMPLE_IFC,
        ["1층 거실에 문 만들어줘. 문 없애줘"],
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
