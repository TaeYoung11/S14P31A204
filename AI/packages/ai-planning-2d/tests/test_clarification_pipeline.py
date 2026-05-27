"""session_pipeline clarification alternatives + fill 필드 테스트.

LLM 없이 FloorPlanEngine을 mock하여 pipeline 로직만 검증한다.
"""

from __future__ import annotations

import pytest

from ai_planning_2d import FloorNLPCommand, IFCContext, LLM2DPipeline
from ai_planning_2d.planning.engine import FloorPlanEngine


def _two_floor_living_ctx() -> IFCContext:
    """1층·2층에 '거실'이 각각 하나씩 있는 최소 IFC 컨텍스트."""
    return {
        "spaces": [
            {
                "id": "sp-living-1f",
                "name": "거실",
                "type": "living",
                "floor": 1,
                "polygon": [(0, 0), (5000, 0), (5000, 7000), (0, 7000)],
                "width": 5000,
                "height": 7000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-living-2f",
                "name": "거실",
                "type": "living",
                "floor": 2,
                "polygon": [(0, 0), (5000, 0), (5000, 7000), (0, 7000)],
                "width": 5000,
                "height": 7000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
        ],
        "adjacency": [],
        "walls": [],
        "doors": [],
        "windows": [],
        "boundaries": [],
        "storeys": [
            {"id": "st-001", "floor": 1, "elevation": 0.0},
            {"id": "st-002", "floor": 2, "elevation": 3000.0},
        ],
    }


def _single_floor_living_ctx() -> IFCContext:
    """1층에 '거실' 하나만 있는 컨텍스트."""
    return {
        "spaces": [
            {
                "id": "sp-living-1f",
                "name": "거실",
                "type": "living",
                "floor": 1,
                "polygon": [(0, 0), (5000, 0), (5000, 7000), (0, 7000)],
                "width": 5000,
                "height": 7000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
        ],
        "adjacency": [],
        "walls": [],
        "doors": [],
        "windows": [],
        "boundaries": [],
        "storeys": [{"id": "st-001", "floor": 1, "elevation": 0.0}],
    }


def _remove_room_cmd(target_room_name: str, target_floor: int | None = None) -> FloorNLPCommand:
    return FloorNLPCommand(
        action="remove_room",
        target_room_name=target_room_name,
        target_floor=target_floor,
        needs_clarification=False,
        clarification_question=None,
        confidence=0.9,
        apply_to_all=False,
        resize_shape="rect",
    )


def _resize_room_cmd(target_room_name: str, target_floor: int | None = None) -> FloorNLPCommand:
    return FloorNLPCommand(
        action="resize_room",
        target_room_name=target_room_name,
        target_floor=target_floor,
        resize_width=6000,
        resize_height=8000,
        resize_rects=[{"x": 0, "y": 0, "width": 6000, "height": 8000}],
        needs_clarification=False,
        clarification_question=None,
        confidence=0.9,
        apply_to_all=False,
        resize_shape="rect",
    )


def _merge_windows_cmd(target_room_name: str, target_floor: int | None = None) -> FloorNLPCommand:
    return FloorNLPCommand(
        action="merge_windows",
        target_room_name=target_room_name,
        target_floor=target_floor,
        needs_clarification=False,
        clarification_question=None,
        confidence=0.9,
        apply_to_all=False,
        resize_shape="rect",
    )


@pytest.mark.asyncio
async def test_remove_room_duplicate_floors_generates_alternatives() -> None:
    """동일 이름 방이 복수 층에 있을 때 alternatives + fill이 생성되어야 한다."""
    ctx = _two_floor_living_ctx()

    class MockEngine(FloorPlanEngine):
        async def parse_command(self, user_text: str, ifc_context=None, **_):
            return _remove_room_cmd("거실")

    pipeline = LLM2DPipeline(ifc_context=ctx, engine=MockEngine())
    result = await pipeline.execute_preview("거실 없애줘")

    assert result["status"] == "alternatives"
    alts = result.get("alternatives", [])
    assert len(alts) == 2

    floors = {alt["fill"]["target_floor"] for alt in alts}
    assert floors == {1, 2}

    for alt in alts:
        assert "alternative_id" in alt
        assert "title" in alt
        assert "fill" in alt
        assert alt["fill"]["target_room_name"] == "거실"


@pytest.mark.asyncio
async def test_resize_room_duplicate_floors_generates_alternatives() -> None:
    """resize_room 도 동일 이름 복수 층이면 alternatives + fill 생성."""
    ctx = _two_floor_living_ctx()

    class MockEngine(FloorPlanEngine):
        async def parse_command(self, user_text: str, ifc_context=None, **_):
            return _resize_room_cmd("거실")

    pipeline = LLM2DPipeline(ifc_context=ctx, engine=MockEngine())
    result = await pipeline.execute_preview("거실 크기 바꿔줘")

    assert result["status"] == "alternatives"
    alts = result.get("alternatives", [])
    assert len(alts) == 2
    for alt in alts:
        assert "fill" in alt
        assert alt["fill"]["target_room_name"] == "거실"


@pytest.mark.asyncio
async def test_merge_windows_duplicate_floors_generates_alternatives() -> None:
    ctx = _two_floor_living_ctx()
    pipeline = LLM2DPipeline(ifc_context=ctx)

    result = await pipeline.execute_command_preview(_merge_windows_cmd("거실"))

    assert result["status"] == "alternatives"
    alts = result.get("alternatives", [])
    assert len(alts) == 2
    assert {alt["fill"]["target_floor"] for alt in alts} == {1, 2}
    for alt in alts:
        floor = alt["fill"]["target_floor"]
        assert alt["fill"]["target_room_name"] == "거실"
        assert alt["fill"]["action"] == "merge_windows"
        assert alt["title"] == f"{floor}층 거실"
        assert alt["prompt"] == f"{floor}층 거실 창문 2개 통창으로 변경"


@pytest.mark.asyncio
async def test_remove_room_single_floor_is_not_alternatives() -> None:
    """동일 이름 방이 하나뿐이면 alternatives 생성 안 함 (다른 clarification reason)."""
    ctx = _single_floor_living_ctx()

    class MockEngine(FloorPlanEngine):
        async def parse_command(self, user_text: str, ifc_context=None, **_):
            return _remove_room_cmd("없는방")

    pipeline = LLM2DPipeline(ifc_context=ctx, engine=MockEngine())
    result = await pipeline.execute_preview("없는방 없애줘")

    assert result["status"] == "needs_clarification"
    assert "alternatives" not in result or result.get("alternatives") == []


@pytest.mark.asyncio
async def test_remove_room_policy_alternative_has_fill() -> None:
    """_remove_room_alternatives_preview 의 alternatives에 fill 필드가 있어야 한다."""
    ctx = _single_floor_living_ctx()

    class MockEngine(FloorPlanEngine):
        async def parse_command(self, user_text: str, ifc_context=None, **_):
            return _remove_room_cmd("거실", target_floor=1)

    pipeline = LLM2DPipeline(ifc_context=ctx, engine=MockEngine())
    result = await pipeline.execute_preview("거실 없애줘")

    if result["status"] == "alternatives":
        alts = result.get("alternatives", [])
        for alt in alts:
            assert "fill" in alt, f"alternative {alt.get('alternative_id')} has no fill"
