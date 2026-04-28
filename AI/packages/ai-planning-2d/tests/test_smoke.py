"""
ai-planning-2d 스모크 테스트
실행: uv run pytest packages/ai-planning-2d/tests/test_smoke.py -v
LLM 포함: uv run pytest packages/ai-planning-2d/tests/test_smoke.py -v -m llm
"""
import pytest

from ai_planning_2d import (
    CommandBatch,
    FloorNLPCommand,
    FloorPlanEngine,
    IFCContext,
    shape_to_rects,
    to_ifc_commands,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {"id": "sp-001", "name": "거실", "floor": 1, "width": 5000, "height": 7000},
            {"id": "sp-002", "name": "침실", "floor": 1, "width": 3000, "height": 4000},
            {"id": "sp-003", "name": "침실", "floor": 2, "width": 3000, "height": 4000},
        ],
        "storeys": [
            {"id": "st-001", "floor": 1},
            {"id": "st-002", "floor": 2},
        ],
    }


# ---------------------------------------------------------------------------
# shape_to_rects
# ---------------------------------------------------------------------------

def test_shape_rect():
    result = shape_to_rects("rect", 4000, 5000)
    assert result == [{"x": 0, "y": 0, "width": 4000, "height": 5000}]


def test_shape_L():
    result = shape_to_rects("L", 6000, 8000)
    assert len(result) == 2
    total_area = sum(r["width"] * r["height"] for r in result)
    assert total_area == 6000 * 4000 + 3000 * 4000


def test_shape_U():
    result = shape_to_rects("U", 8000, 6000)
    assert len(result) == 3


def test_shape_unknown_fallback():
    result = shape_to_rects("X", 3000, 3000)
    assert result == [{"x": 0, "y": 0, "width": 3000, "height": 3000}]


# ---------------------------------------------------------------------------
# to_ifc_commands — add_room
# ---------------------------------------------------------------------------

def test_add_room(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "주방", "type": "kitchen",
            "shape": "rect", "width": 3000, "height": 4000,
            "floor": 1,
            "rects": shape_to_rects("rect", 3000, 4000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 1
    assert batch.commands[0].params["metadata"]["storey_id"] == "st-001"
    assert batch.commands[0].params["properties"]["name"] == "주방"


def test_add_room_unknown_floor(ifc_ctx):
    """존재하지 않는 층 → clarification"""
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "창고", "type": "other",
            "shape": "rect", "width": 2000, "height": 2000,
            "floor": 5,
            "rects": shape_to_rects("rect", 2000, 2000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "5층" in batch.clarification_question


# ---------------------------------------------------------------------------
# to_ifc_commands — remove_room
# ---------------------------------------------------------------------------

def test_remove_room(ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="거실",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 1
    assert batch.commands[0].target_id == "sp-001"


def test_remove_room_duplicate_ask_floor(ifc_ctx):
    """같은 이름 방 여러 개 + apply_to_all=False → 층 질문"""
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="침실",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "몇 층" in batch.clarification_question


def test_remove_room_apply_to_all(ifc_ctx):
    """apply_to_all=True → 모든 동명 방 삭제"""
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="침실",
        apply_to_all=True,
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 2


def test_remove_room_not_found(ifc_ctx):
    """없는 방 → clarification"""
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="서재",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification


# ---------------------------------------------------------------------------
# to_ifc_commands — resize_room
# ---------------------------------------------------------------------------

def test_resize_room(ifc_ctx):
    cmd = FloorNLPCommand(
        action="resize_room",
        target_room_name="거실",
        resize_shape="L",
        resize_width=6000,
        resize_height=8000,
        resize_rects=shape_to_rects("L", 6000, 8000),
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert batch.commands[0].params["geometry"]["dimensions"]["width"] == 6000


# ---------------------------------------------------------------------------
# to_ifc_commands — needs_clarification 전달
# ---------------------------------------------------------------------------

def test_needs_clarification_passthrough():
    cmd = FloorNLPCommand(
        action="add_room",
        confidence=0.3,
        needs_clarification=True,
        clarification_question="어떤 방을 추가할까요?",
    )
    batch = to_ifc_commands(cmd)
    assert batch.requires_clarification
    assert batch.clarification_question == "어떤 방을 추가할까요?"


# ---------------------------------------------------------------------------
# LLM 테스트 (Ollama 실행 필요)
# ---------------------------------------------------------------------------

@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_add_room():
    engine = FloorPlanEngine()
    result = await engine.parse_command("침실 4000x5000 추가해줘")
    assert result.action == "add_room"
    assert result.new_room is not None
    assert result.new_room.rects is not None


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_remove_room():
    engine = FloorPlanEngine()
    result = await engine.parse_command("거실 없애줘")
    assert result.action == "remove_room"
    assert result.target_room_name is not None


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_clarification():
    engine = FloorPlanEngine()
    result = await engine.parse_command("방 좀 바꿔줘")
    assert result.needs_clarification


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_full_pipeline(ifc_ctx):
    """자연어 → FloorNLPCommand → CommandBatch 전체 흐름"""
    engine = FloorPlanEngine()
    cmd = await engine.parse_command("거실 없애줘", ifc_ctx)
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert isinstance(batch, CommandBatch)


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_relative_resize_with_context(ifc_ctx):
    """ifc_context 치수 기반 상대적 크기 조정"""
    engine = FloorPlanEngine()
    result = await engine.parse_command("침실을 조금 더 넓게 해줘", ifc_ctx)
    assert result.action == "resize_room"
    assert result.target_room_name == "침실"
    assert not result.needs_clarification
    assert result.resize_width is not None and result.resize_width > 3000
    assert result.resize_height is not None and result.resize_height > 4000



@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_compound_command_clarification():
    """복합 명령 → clarification"""
    engine = FloorPlanEngine()
    result = await engine.parse_command("거실 없애고 서재 추가해줘")
    assert result.needs_clarification


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_no_dimension_clarification():
    """치수 없이 방 추가 → clarification"""
    engine = FloorPlanEngine()
    result = await engine.parse_command("2층에 방 하나 추가해줘")
    assert result.needs_clarification
