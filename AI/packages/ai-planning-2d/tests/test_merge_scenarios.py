from __future__ import annotations

from pathlib import Path

import pytest

from ai_planning_2d import (
    FloorNLPCommand,
    FloorPlanEngine,
    IFCContext,
    LLM2DPipeline,
    extract_ifc_context,
)


def _policy_ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {
                "id": "sp-left",
                "name": "left",
                "type": "other",
                "floor": 1,
                "polygon": [(0, 0), (3000, 0), (3000, 3000), (0, 3000)],
                "width": 3000,
                "height": 3000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-center",
                "name": "center",
                "type": "other",
                "floor": 1,
                "polygon": [(3000, 0), (5000, 0), (5000, 3000), (3000, 3000)],
                "width": 2000,
                "height": 3000,
                "x": 3000.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-right",
                "name": "right",
                "type": "other",
                "floor": 1,
                "polygon": [(5000, 0), (7000, 0), (7000, 3000), (5000, 3000)],
                "width": 2000,
                "height": 3000,
                "x": 5000.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
        ],
        "adjacency": [],
        "walls": [
            {
                "id": "wall-left",
                "floor": 1,
                "start": (3000, 0),
                "end": (3000, 3000),
                "thickness": 200,
                "space_ids": ["sp-left", "sp-center"],
                "kind": "INTERIOR",
            },
            {
                "id": "wall-right",
                "floor": 1,
                "start": (5000, 0),
                "end": (5000, 3000),
                "thickness": 200,
                "space_ids": ["sp-center", "sp-right"],
                "kind": "INTERIOR",
            },
        ],
        "doors": [],
        "windows": [],
        "boundaries": [],
        "storeys": [{"id": "st-001", "floor": 1, "elevation": 0.0}],
    }


@pytest.mark.asyncio
async def test_engine_parse_explicit_merge_remove_command_with_context() -> None:
    engine = FloorPlanEngine()
    ctx = _policy_ifc_ctx()

    result = await engine.parse_command("center를 left와 합쳐줘", ctx)

    assert result.action == "remove_room"
    assert result.target_room_name == "center"
    assert result.adjacency_target == "left"
    assert result.target_floor == 1


@pytest.mark.asyncio
async def test_pipeline_preview_remove_room_respects_explicit_merge_target() -> None:
    pipeline = LLM2DPipeline(ifc_context=_policy_ifc_ctx())
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        adjacency_target="right",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "alternatives"
    assert preview["policy_plan"]["reason"] == "preferred_adjacent_absorber"
    assert preview["policy_plan"]["merge_target_space_id"] == "sp-right"
    assert preview["alternatives"]


@pytest.mark.asyncio
async def test_pipeline_execute_preview_house_kr_explicit_merge_target_user_text() -> None:
    fixture = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(fixture))
    pipeline = LLM2DPipeline(ifc_path=str(fixture), ifc_context=ctx)

    preview = await pipeline.execute_preview("침실을 거실과 합쳐줘")

    merge_target_name_by_id = {space["id"]: space["name"] for space in ctx["spaces"]}
    assert preview["status"] == "alternatives"
    assert preview["command"]["action"] == "remove_room"
    assert preview["command"]["adjacency_target"] == "거실"
    assert preview["policy_plan"]["reason"] == "preferred_adjacent_absorber"
    assert merge_target_name_by_id[preview["policy_plan"]["merge_target_space_id"]] == "거실"
