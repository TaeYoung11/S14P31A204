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
from ai_planning_2d.validator import validate_command_batch


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {"id": "sp-001", "name": "\uac70\uc2e4", "floor": 1, "width": 5000, "height": 7000},
            {"id": "sp-002", "name": "\uce68\uc2e4", "floor": 1, "width": 3000, "height": 4000},
            {"id": "sp-003", "name": "\uce68\uc2e4", "floor": 2, "width": 3000, "height": 4000},
        ],
        "storeys": [
            {"id": "st-001", "floor": 1},
            {"id": "st-002", "floor": 2},
        ],
    }


@pytest.fixture
def locked_ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {
                "id": "sp-001",
                "name": "\uac70\uc2e4",
                "floor": 1,
                "width": 5000,
                "height": 7000,
                "locked": True,
            },
        ],
        "storeys": [
            {"id": "st-001", "floor": 1},
        ],
    }


@pytest.fixture
def unlocked_ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {
                "id": "sp-001",
                "name": "\uac70\uc2e4",
                "floor": 1,
                "width": 5000,
                "height": 7000,
                "locked": False,
            },
        ],
        "storeys": [
            {"id": "st-001", "floor": 1},
        ],
    }


@pytest.fixture
def partial_locked_ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {
                "id": "sp-002",
                "name": "\uce68\uc2e4",
                "floor": 1,
                "width": 3000,
                "height": 4000,
                "locked": False,
            },
            {
                "id": "sp-003",
                "name": "\uce68\uc2e4",
                "floor": 2,
                "width": 3000,
                "height": 4000,
                "locked": True,
            },
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
# to_ifc_commands - add_room
# ---------------------------------------------------------------------------

def test_add_room(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "\uc8fc\ubc29", "type": "kitchen",
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
    assert batch.commands[0].params["properties"]["name"] == "\uc8fc\ubc29"


def test_add_room_unknown_floor(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "\ucc3d\uace0", "type": "other",
            "shape": "rect", "width": 2000, "height": 2000,
            "floor": 5,
            "rects": shape_to_rects("rect", 2000, 2000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "5" in batch.clarification_question


# ---------------------------------------------------------------------------
# to_ifc_commands - remove_room
# ---------------------------------------------------------------------------

def test_remove_room(ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="\uac70\uc2e4",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 1
    assert batch.commands[0].target_id == "sp-001"


def test_remove_locked_room(locked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="\uac70\uc2e4",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, locked_ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "\uac70\uc2e4" in batch.clarification_question
    assert "\uc7a0\uaca8 \uc788\uc5b4 \uc0ad\uc81c\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4" in batch.clarification_question


def test_remove_unlocked_room_passes(unlocked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="\uac70\uc2e4",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, unlocked_ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 1
    assert batch.commands[0].target_id == "sp-001"


def test_remove_room_duplicate_ask_floor(ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="\uce68\uc2e4",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None


def test_remove_room_apply_to_all(ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="\uce68\uc2e4",
        apply_to_all=True,
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 2


def test_remove_locked_room_apply_to_all_blocked(partial_locked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="\uce68\uc2e4",
        apply_to_all=True,
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, partial_locked_ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "\uce68\uc2e4" in batch.clarification_question


def test_remove_room_not_found(ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="\uc11c\uc7ac",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification


# ---------------------------------------------------------------------------
# to_ifc_commands - resize_room
# ---------------------------------------------------------------------------

def test_resize_room(ifc_ctx):
    cmd = FloorNLPCommand(
        action="resize_room",
        target_room_name="\uac70\uc2e4",
        resize_shape="L",
        resize_width=6000,
        resize_height=8000,
        resize_rects=shape_to_rects("L", 6000, 8000),
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert batch.commands[0].params["geometry"]["dimensions"]["width"] == 6000


def test_resize_locked_room(locked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="resize_room",
        target_room_name="\uac70\uc2e4",
        resize_shape="L",
        resize_width=6000,
        resize_height=8000,
        resize_rects=shape_to_rects("L", 6000, 8000),
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, locked_ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "\uac70\uc2e4" in batch.clarification_question
    assert "\uc7a0\uaca8 \uc788\uc5b4 \ud06c\uae30\ub97c \ubcc0\uacbd\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4" in batch.clarification_question


def test_resize_unlocked_room_passes(unlocked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="resize_room",
        target_room_name="\uac70\uc2e4",
        resize_shape="rect",
        resize_width=6000,
        resize_height=8000,
        resize_rects=shape_to_rects("rect", 6000, 8000),
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, unlocked_ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 1
    assert batch.commands[0].target_id == "sp-001"
    assert batch.commands[0].params["geometry"]["dimensions"]["width"] == 6000


# ---------------------------------------------------------------------------
# to_ifc_commands - needs_clarification 전달
# ---------------------------------------------------------------------------

def test_needs_clarification_passthrough():
    cmd = FloorNLPCommand(
        action="add_room",
        confidence=0.3,
        needs_clarification=True,
        clarification_question="\uc5b4\ub5a4 \ubc29\uc744 \ucd94\uac00\ud560\uae4c\uc694?",
    )
    batch = to_ifc_commands(cmd)
    assert batch.requires_clarification
    assert batch.clarification_question == "\uc5b4\ub5a4 \ubc29\uc744 \ucd94\uac00\ud560\uae4c\uc694?"


# ---------------------------------------------------------------------------
# validate_command_batch - 물리 검증

def test_validate_normal_batch(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "\uc8fc\ubc29", "type": "kitchen",
            "shape": "rect", "width": 3000, "height": 4000,
            "floor": 1,
            "rects": shape_to_rects("rect", 3000, 4000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification


def test_validate_too_small_dimension(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "\ucc3d\uace0", "type": "other",
            "shape": "rect", "width": 100, "height": 100,
            "floor": 1,
            "rects": shape_to_rects("rect", 100, 100),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None


def test_validate_too_large_dimension(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "\uac70\uc2e4", "type": "living",
            "shape": "rect", "width": 50000, "height": 50000,
            "floor": 1,
            "rects": shape_to_rects("rect", 50000, 50000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None


def test_validate_disconnected_rects():
    from ai_planning_2d.command import ActionType, IFCCommand
    batch = CommandBatch(
        commands=[
            IFCCommand(
                action=ActionType.CREATE_SPACE,
                target_id=None,
                params={
                    "entity_type": "Space",
                    "metadata": {"storey_id": "st-001"},
                    "geometry": {
                        "location": [0, 0, 0],
                        "direction": [1, 0, 0],
                        "dimensions": {"width": 4000, "height": 4000},
                    },
                    "properties": {
                        "name": "\ud14c\uc2a4\ud2b8",
                        "shape": "L",
                        "rects": [
                            {"x": 0, "y": 0, "width": 1000, "height": 1000},
                            {"x": 3000, "y": 3000, "width": 1000, "height": 1000},
                        ],
                    },
                },
                confidence=0.9,
            )
        ],
        requires_clarification=False,
    )
    result = validate_command_batch(batch)
    assert result.requires_clarification


def _make_space_batch(rects: list[dict], width: int = 4000, height: int = 4000) -> CommandBatch:
    from ai_planning_2d.command import ActionType, IFCCommand
    return CommandBatch(
        commands=[
            IFCCommand(
                action=ActionType.CREATE_SPACE,
                target_id=None,
                params={
                    "entity_type": "Space",
                    "metadata": {"storey_id": "st-001"},
                    "geometry": {
                        "location": [0, 0, 0],
                        "direction": [1, 0, 0],
                        "dimensions": {"width": width, "height": height},
                    },
                    "properties": {"name": "\ud14c\uc2a4\ud2b8", "shape": "L", "rects": rects},
                },
                confidence=0.9,
            )
        ],
        requires_clarification=False,
    )


def test_validate_rects_exceed_bounds():
    batch = _make_space_batch(
        rects=[
            {"x": 0, "y": 0, "width": 3000, "height": 2000},
            {"x": 0, "y": 2000, "width": 1500, "height": 5000},
        ],
        width=4000,
        height=4000,
    )
    result = validate_command_batch(batch)
    assert result.requires_clarification
    assert result.clarification_question is not None


def test_validate_overlapping_rects():
    batch = _make_space_batch(
        rects=[
            {"x": 0, "y": 0, "width": 2000, "height": 2000},
            {"x": 1000, "y": 0, "width": 2000, "height": 2000},
        ],
    )
    result = validate_command_batch(batch)
    assert result.requires_clarification
    assert result.clarification_question is not None


def test_validate_negative_coordinate():
    batch = _make_space_batch(
        rects=[{"x": -100, "y": 0, "width": 2000, "height": 2000}],
    )
    result = validate_command_batch(batch)
    assert result.requires_clarification
    assert result.clarification_question is not None


def test_validate_update_space_also_checked(ifc_ctx):
    cmd = FloorNLPCommand(
        action="resize_room",
        target_room_name="\uac70\uc2e4",
        resize_shape="rect",
        resize_width=100,
        resize_height=100,
        resize_rects=shape_to_rects("rect", 100, 100),
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None


def test_validate_L_shape_normal(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "\uac70\uc2e4", "type": "living",
            "shape": "L", "width": 6000, "height": 8000,
            "floor": 1,
            "rects": shape_to_rects("L", 6000, 8000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification


def test_validate_U_shape_normal(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "\ubcf5\ub3c4", "type": "corridor",
            "shape": "U", "width": 8000, "height": 6000,
            "floor": 1,
            "rects": shape_to_rects("U", 8000, 6000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification


def test_validate_rects_none_passes():
    from ai_planning_2d.command import ActionType, IFCCommand
    batch = CommandBatch(
        commands=[
            IFCCommand(
                action=ActionType.CREATE_SPACE,
                target_id=None,
                params={
                    "entity_type": "Space",
                    "metadata": {"storey_id": "st-001"},
                    "geometry": {
                        "location": [0, 0, 0],
                        "direction": [1, 0, 0],
                        "dimensions": {"width": 3000, "height": 4000},
                    },
                    "properties": {"name": "\ud14c\uc2a4\ud2b8", "shape": "rect", "rects": None},
                },
                confidence=0.9,
            )
        ],
        requires_clarification=False,
    )
    result = validate_command_batch(batch)
    assert not result.requires_clarification


def test_validate_resize_L_shape_bounds(ifc_ctx):
    cmd = FloorNLPCommand(
        action="resize_room",
        target_room_name="\uac70\uc2e4",
        resize_shape="L",
        resize_width=6000,
        resize_height=8000,
        resize_rects=shape_to_rects("L", 6000, 8000),
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification


# ---------------------------------------------------------------------------
# LLM 테스트 (Ollama 실행 필요)
# ---------------------------------------------------------------------------

@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_add_room():
    engine = FloorPlanEngine()
    result = await engine.parse_command("\uce68\uc2e4 4000x5000 \ucd94\uac00\ud574\uc918")
    assert result.action == "add_room"
    assert result.new_room is not None
    assert result.new_room.rects is not None


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_remove_room():
    engine = FloorPlanEngine()
    result = await engine.parse_command("\uac70\uc2e4 \uc5c6\uc560\uc918")
    assert result.action == "remove_room"
    assert result.target_room_name is not None


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_clarification():
    engine = FloorPlanEngine()
    result = await engine.parse_command("\ubc29 \uc880 \ubc14\uafcd\uc918")
    assert result.needs_clarification


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_full_pipeline(ifc_ctx):
    engine = FloorPlanEngine()
    cmd = await engine.parse_command("\uac70\uc2e4 \uc5c6\uc560\uc918", ifc_ctx)
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert isinstance(batch, CommandBatch)


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_relative_resize_with_context(ifc_ctx):
    engine = FloorPlanEngine()
    result = await engine.parse_command("\uce68\uc2e4\uc744 \uc870\uae08 \ub354 \ub113\uac8c \ud574\uc918", ifc_ctx)
    assert result.action == "resize_room"
    assert result.target_room_name == "\uce68\uc2e4"
    assert not result.needs_clarification
    assert result.resize_width is not None and result.resize_width > 3000
    assert result.resize_height is not None and result.resize_height > 4000


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_compound_command_clarification():
    engine = FloorPlanEngine()
    result = await engine.parse_command("\uac70\uc2e4 \uc5c6\uc560\uace0 \uc11c\uc7ac \ucd94\uac00\ud574\uc918")
    assert result.needs_clarification


@pytest.mark.llm
@pytest.mark.asyncio
async def test_engine_no_dimension_clarification():
    engine = FloorPlanEngine()
    result = await engine.parse_command("2\uce35\uc5d0 \ubc29 \ud558\ub098 \ucd94\uac00\ud574\uc918")
    assert result.needs_clarification
