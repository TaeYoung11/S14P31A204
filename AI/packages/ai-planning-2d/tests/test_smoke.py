"""
ai-planning-2d ?ㅻえ???뚯뒪??
?ㅽ뻾: uv run pytest packages/ai-planning-2d/tests/test_smoke.py -v
"""

import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.pset
import ifcopenshell.api.root
import pytest

import ai_authoring.engine_3d as engine_3d_module
import ai_planning_2d.executor as executor_module
import ai_planning_2d.session_pipeline as session_pipeline_module
from ai_domain import IfcEditCommandPayload
from ai_planning_2d.policies import plan_resize_room
from ai_planning_2d import (
    ActionType,
    CommandBatch,
    FloorNLPCommand,
    FloorPlanEngine,
    build_engine_request,
    LLM2DPipeline,
    IFCCommand,
    IFCContext,
    apply_space_plan,
    extract_ifc_context,
    shape_to_rects,
    to_ifc_commands,
)
from ai_planning_2d.add_room_placement import suggest_add_room_start_mm
from ai_planning_2d.engine import _apply_relative_adjustment, _infer_resize_direction
from ai_planning_2d.remove_healing import build_remove_merge_plan
from ai_planning_2d.toilet_demo import build_toilet_insertion_geometry_plan
from ai_planning_2d.validator import validate_command_batch


@pytest.fixture
def ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {
                "id": "sp-001",
                "name": "嫄곗떎",
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
                "id": "sp-002",
                "name": "移⑥떎",
                "type": "bedroom",
                "floor": 1,
                "polygon": [(0, 0), (3000, 0), (3000, 4000), (0, 4000)],
                "width": 3000,
                "height": 4000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-003",
                "name": "移⑥떎",
                "type": "bedroom",
                "floor": 2,
                "polygon": [(0, 0), (3000, 0), (3000, 4000), (0, 4000)],
                "width": 3000,
                "height": 4000,
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


@pytest.fixture
def locked_ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {
                "id": "sp-001",
                "name": "嫄곗떎",
                "type": "living",
                "floor": 1,
                "polygon": [(0, 0), (5000, 0), (5000, 7000), (0, 7000)],
                "width": 5000,
                "height": 7000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": True,
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
        ],
    }


@pytest.fixture
def partial_locked_ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {
                "id": "sp-002",
                "name": "移⑥떎",
                "type": "bedroom",
                "floor": 1,
                "polygon": [(0, 0), (3000, 0), (3000, 4000), (0, 4000)],
                "width": 3000,
                "height": 4000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-003",
                "name": "移⑥떎",
                "type": "bedroom",
                "floor": 2,
                "polygon": [(0, 0), (3000, 0), (3000, 4000), (0, 4000)],
                "width": 3000,
                "height": 4000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": True,
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


def test_suggest_add_room_start_mm_prefers_adjacent_slot_inside_boundary():
    ctx: IFCContext = {
        "spaces": [
            {
                "id": "sp-1",
                "name": "room-a",
                "type": "other",
                "floor": 1,
                "polygon": [(0, 0), (2000, 0), (2000, 2000), (0, 2000)],
                "width": 2000,
                "height": 2000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            }
        ],
        "adjacency": [],
        "walls": [],
        "doors": [],
        "windows": [],
        "boundaries": [
            {
                "floor": 1,
                "outer_polygon": [(0, 0), (6000, 0), (6000, 3000), (0, 3000)],
                "holes": [],
            }
        ],
        "storeys": [{"id": "st-001", "floor": 1, "elevation": 0.0}],
    }

    start = suggest_add_room_start_mm(ctx, floor=1, width=1500, height=1500)

    assert start is not None
    assert start[0] == 2000
    assert 0 <= start[1] <= 500


def test_suggest_add_room_start_mm_returns_none_when_no_feasible_slot():
    ctx: IFCContext = {
        "spaces": [
            {
                "id": "sp-1",
                "name": "room-a",
                "type": "other",
                "floor": 1,
                "polygon": [(0, 0), (1500, 0), (1500, 3000), (0, 3000)],
                "width": 1500,
                "height": 3000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-2",
                "name": "room-b",
                "type": "other",
                "floor": 1,
                "polygon": [(1500, 0), (3000, 0), (3000, 3000), (1500, 3000)],
                "width": 1500,
                "height": 3000,
                "x": 1500.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            }
        ],
        "adjacency": [],
        "walls": [],
        "doors": [],
        "windows": [],
        "boundaries": [
            {
                "floor": 1,
                "outer_polygon": [(0, 0), (3000, 0), (3000, 3000), (0, 3000)],
                "holes": [],
            }
        ],
        "storeys": [{"id": "st-001", "floor": 1, "elevation": 0.0}],
    }

    start = suggest_add_room_start_mm(ctx, floor=1, width=1000, height=1000)

    assert start is None


def test_add_room(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "二쇰갑",
            "type": "kitchen",
            "shape": "rect",
            "width": 3000,
            "height": 4000,
            "floor": 1,
            "rects": shape_to_rects("rect", 3000, 4000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 1
    assert batch.commands[0].params["metadata"]["storey_id"] == "st-001"
    assert batch.commands[0].params["properties"]["name"] == "二쇰갑"


def test_add_room_unknown_floor(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "李쎄퀬",
            "type": "other",
            "shape": "rect",
            "width": 2000,
            "height": 2000,
            "floor": 5,
            "rects": shape_to_rects("rect", 2000, 2000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "5" in batch.clarification_question


def test_remove_room(ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name=ifc_ctx["spaces"][0]["name"],
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 1
    assert batch.commands[0].target_id == "sp-001"


def test_remove_locked_room(locked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name=locked_ifc_ctx["spaces"][0]["name"],
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, locked_ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "嫄곗떎" in batch.clarification_question
    assert "잠겨" in batch.clarification_question


def test_remove_room_duplicate_ask_floor(ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="移⑥떎",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None


def test_remove_locked_room_apply_to_all_blocked(partial_locked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="移⑥떎",
        apply_to_all=True,
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, partial_locked_ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "移⑥떎" in batch.clarification_question


def test_remove_room_not_found(ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="?쒖옱",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification


def test_resize_room(ifc_ctx):
    cmd = FloorNLPCommand(
        action="resize_room",
        target_room_name=ifc_ctx["spaces"][0]["name"],
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
        target_room_name=locked_ifc_ctx["spaces"][0]["name"],
        resize_shape="L",
        resize_width=6000,
        resize_height=8000,
        resize_rects=shape_to_rects("L", 6000, 8000),
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, locked_ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "嫄곗떎" in batch.clarification_question
    assert "잠겨" in batch.clarification_question


def test_needs_clarification_passthrough():
    cmd = FloorNLPCommand(
        action="add_room",
        confidence=0.3,
        needs_clarification=True,
        clarification_question="?대뼡 諛⑹쓣 異붽??좉퉴??",
    )
    batch = to_ifc_commands(cmd)
    assert batch.requires_clarification
    assert batch.clarification_question == "?대뼡 諛⑹쓣 異붽??좉퉴??"


def test_validate_too_small_dimension(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "李쎄퀬",
            "type": "other",
            "shape": "rect",
            "width": 100,
            "height": 100,
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
            "name": "嫄곗떎",
            "type": "living",
            "shape": "rect",
            "width": 50000,
            "height": 50000,
            "floor": 1,
            "rects": shape_to_rects("rect", 50000, 50000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None


def test_validate_disconnected_rects():
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
                        "name": "test-space",
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


def test_validate_negative_coordinate():
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
                        "name": "test-space",
                        "shape": "L",
                        "rects": [
                            {"x": -100, "y": 0, "width": 2000, "height": 2000},
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
    assert result.clarification_question is not None


@pytest.mark.asyncio
async def test_engine_add_room():
    engine = FloorPlanEngine()
    result = await engine.parse_command("移⑥떎 4000x5000 異붽??댁쨾")
    assert result.action == "add_room"
    if result.new_room is not None:
        assert result.new_room.rects is not None
    else:
        assert result.needs_clarification


@pytest.mark.asyncio
async def test_engine_remove_room():
    engine = FloorPlanEngine()
    result = await engine.parse_command("거실 삭제해줘")
    assert result.action == "remove_room"
    assert result.target_room_name is not None


def test_engine_reads_model_settings_from_env(monkeypatch):
    monkeypatch.setenv("2D_LLM_MODEL_NAME", "gms-2d-model")
    monkeypatch.setenv("MODEL_ENDPOINT", "https://gms.example/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "secret-key")

    engine = FloorPlanEngine()

    assert engine.model == "gms-2d-model"
    assert engine.base_url == "https://gms.example/v1"
    assert engine.api_key == "secret-key"


@pytest.mark.asyncio
async def test_engine_clarification():
    engine = FloorPlanEngine()
    result = await engine.parse_command("방 좀 바꿔줘")
    assert result.needs_clarification


@pytest.mark.asyncio
async def test_engine_relative_resize_with_context(ifc_ctx):
    command = FloorNLPCommand(
        action="resize_room",
        target_room_name=ifc_ctx["spaces"][1]["name"],
        resize_shape="rect",
        resize_width=3000,
        resize_height=4000,
        confidence=0.95,
    )
    result = _apply_relative_adjustment(command, "조금 더 넓혀줘", ifc_ctx)
    assert result.action == "resize_room"
    assert result.target_room_name == ifc_ctx["spaces"][1]["name"]
    assert result.resize_width is not None and result.resize_width > 3000
    assert result.resize_height is not None and result.resize_height > 4000
    assert not result.needs_clarification


@pytest.mark.asyncio
async def test_engine_simple_resize_with_context(ifc_ctx):
    target_space = next(space for space in ifc_ctx["spaces"] if space["type"] == "living")
    engine = FloorPlanEngine()

    result = await engine.parse_command(f"{target_space['name']}을 조금 더 넓혀줘", ifc_ctx)

    assert result.action == "resize_room"
    assert result.target_room_name == target_space["name"]
    assert result.target_floor == target_space["floor"]
    assert result.resize_width is not None and result.resize_width > target_space["width"]
    assert result.resize_height is not None and result.resize_height > target_space["height"]
    assert not result.needs_clarification


def _cartesian_point(ifc: ifcopenshell.file, x: float, y: float, z: float = 0.0):
    return ifc.create_entity("IfcCartesianPoint", Coordinates=(x, y, z))


def _local_placement(
    ifc: ifcopenshell.file,
    x: float = 0.0,
    y: float = 0.0,
    z: float = 0.0,
    ref_direction: tuple[float, float, float] | None = None,
):
    kwargs = {"Location": _cartesian_point(ifc, x, y, z)}
    if ref_direction is not None:
        kwargs["RefDirection"] = ifc.create_entity("IfcDirection", DirectionRatios=ref_direction)
    axis = ifc.create_entity("IfcAxis2Placement3D", **kwargs)
    return ifc.create_entity("IfcLocalPlacement", RelativePlacement=axis)


def _wall_global_segment(wall) -> tuple[tuple[float, float], tuple[float, float]]:
    placement = wall.ObjectPlacement.RelativePlacement
    location = tuple(placement.Location.Coordinates)
    ref_direction = tuple(placement.RefDirection.DirectionRatios)
    axis = next(
        rep for rep in wall.Representation.Representations if rep.RepresentationIdentifier == "Axis"
    )
    start_local = tuple(axis.Items[0].Points[0].Coordinates)
    end_local = tuple(axis.Items[0].Points[1].Coordinates)

    def _to_global(point: tuple[float, float]) -> tuple[float, float]:
        return (
            location[0] + ref_direction[0] * point[0],
            location[1] + ref_direction[1] * point[0],
        )

    return _to_global(start_local), _to_global(end_local)


def _axis_representation(
    ifc: ifcopenshell.file,
    start: tuple[float, float],
    end: tuple[float, float],
):
    polyline = ifc.create_entity(
        "IfcPolyline",
        Points=(
            ifc.create_entity("IfcCartesianPoint", Coordinates=start),
            ifc.create_entity("IfcCartesianPoint", Coordinates=end),
        ),
    )
    shape = ifc.create_entity(
        "IfcShapeRepresentation",
        RepresentationIdentifier="Axis",
        RepresentationType="Curve2D",
        Items=(polyline,),
    )
    return ifc.create_entity("IfcProductDefinitionShape", Representations=(shape,))


def _footprint_representation(
    ifc: ifcopenshell.file,
    points: list[tuple[float, float]],
):
    polyline = ifc.create_entity(
        "IfcPolyline",
        Points=tuple(
            ifc.create_entity("IfcCartesianPoint", Coordinates=point) for point in points
        ),
    )
    curve_set = ifc.create_entity("IfcGeometricCurveSet", Elements=(polyline,))
    shape = ifc.create_entity(
        "IfcShapeRepresentation",
        RepresentationIdentifier="FootPrint",
        RepresentationType="GeometricCurveSet",
        Items=(curve_set,),
    )
    return ifc.create_entity("IfcProductDefinitionShape", Representations=(shape,))


def _attach_space_pset(
    ifc: ifcopenshell.file,
    space,
    *,
    width: int = 4000,
    height: int = 5000,
    space_type: str = "living",
    locked: bool = False,
    rects: list[dict] | None = None,
):
    pset = ifcopenshell.api.pset.add_pset(ifc, product=space, name="Batang_SpaceDimensions")
    properties = {
        "Width": width,
        "Height": height,
        "SpaceType": space_type,
        "Locked": locked,
    }
    if rects is not None:
        properties["Rects"] = json.dumps(rects)
    ifcopenshell.api.pset.edit_pset(ifc, pset=pset, properties=properties)


def _write_ifc(tmp_path, ifc: ifcopenshell.file) -> str:
    path = tmp_path / f"{ifc.schema.lower()}-sample.ifc"
    ifc.write(str(path))
    return str(path)


def _make_minimal_ifc(
    *,
    schema: str = "IFC4",
    wall_space_count: int = 2,
    reverse_wall_axis: bool = False,
    include_window: bool = False,
    include_wall_body: bool = False,
    storey_elevations: tuple[float, float] = (0.0, 3.0),
):
    ifc = ifcopenshell.file(schema=schema)

    project = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcProject", name="Project")
    site = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcBuilding", name="Building")
    storey_a = ifcopenshell.api.root.create_entity(
        ifc, ifc_class="IfcBuildingStorey", name="Level A"
    )
    storey_b = ifcopenshell.api.root.create_entity(
        ifc, ifc_class="IfcBuildingStorey", name="Level B"
    )
    storey_a.Elevation = storey_elevations[0]
    storey_b.Elevation = storey_elevations[1]

    ifcopenshell.api.aggregate.assign_object(ifc, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(ifc, products=[building], relating_object=site)
    ifcopenshell.api.aggregate.assign_object(
        ifc, products=[storey_a, storey_b], relating_object=building
    )

    space_a = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcSpace", name="Living")
    space_a.ObjectPlacement = _local_placement(ifc, 0.0, 0.0, 0.0)
    _attach_space_pset(
        ifc,
        space_a,
        width=4000,
        height=5000,
        space_type="living",
        locked=True,
        rects=[{"x": 0, "y": 0, "width": 4000, "height": 5000}],
    )

    space_b = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcSpace", name="Bedroom")
    space_b.ObjectPlacement = _local_placement(ifc, 4.0, 0.0, 0.0)
    _attach_space_pset(
        ifc,
        space_b,
        width=3000,
        height=4000,
        space_type="bedroom",
        locked=False,
        rects=[{"x": 0, "y": 0, "width": 3000, "height": 4000}],
    )

    ifcopenshell.api.aggregate.assign_object(ifc, products=[space_a], relating_object=storey_a)
    ifcopenshell.api.aggregate.assign_object(ifc, products=[space_b], relating_object=storey_b)

    wall = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcWall", name="Wall")
    wall.ObjectPlacement = _local_placement(ifc, 0.0, 0.0, 0.0)
    if include_wall_body:
        wall.Representation = executor_module._create_wall_representation(
            model=ifc,
            length_m=5.0,
            thickness_m=0.25,
            height_m=2.7,
            context=executor_module._ensure_body_context(ifc),
        )
    else:
        wall.Representation = _axis_representation(
            ifc,
            (5.0, 0.0) if reverse_wall_axis else (0.0, 0.0),
            (0.0, 0.0) if reverse_wall_axis else (5.0, 0.0),
        )
    ifcopenshell.api.aggregate.assign_object(ifc, products=[wall], relating_object=storey_a)

    wall_pset = ifcopenshell.api.pset.add_pset(ifc, product=wall, name="Batang_WallDimensions")
    ifcopenshell.api.pset.edit_pset(ifc, pset=wall_pset, properties={"Thickness": 250})

    if wall_space_count >= 1:
        ifc.create_entity(
            "IfcRelSpaceBoundary",
            GlobalId=ifcopenshell.guid.new(),
            RelatingSpace=space_a,
            RelatedBuildingElement=wall,
        )
    if wall_space_count >= 2:
        ifc.create_entity(
            "IfcRelSpaceBoundary",
            GlobalId=ifcopenshell.guid.new(),
            RelatingSpace=space_b,
            RelatedBuildingElement=wall,
        )

    window = None
    if include_window:
        opening = ifcopenshell.api.root.create_entity(
            ifc, ifc_class="IfcOpeningElement", name="Opening"
        )
        window = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcWindow", name="Window")
        window.ObjectPlacement = _local_placement(ifc, 2.0, 0.0, 0.9)
        window.OverallWidth = 1.2
        window.OverallHeight = 1.5
        ifc.create_entity(
            "IfcRelVoidsElement",
            GlobalId=ifcopenshell.guid.new(),
            RelatingBuildingElement=wall,
            RelatedOpeningElement=opening,
        )
        ifc.create_entity(
            "IfcRelFillsElement",
            GlobalId=ifcopenshell.guid.new(),
            RelatingOpeningElement=opening,
            RelatedBuildingElement=window,
        )

    return {
        "ifc": ifc,
        "storey_a": storey_a,
        "storey_b": storey_b,
        "space_a": space_a,
        "space_b": space_b,
        "wall": wall,
        "window": window,
    }


def test_extract_storeys_sorted_by_elevation(tmp_path):
    bundle = _make_minimal_ifc(storey_elevations=(3.0, 0.0))
    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))

    assert [storey["id"] for storey in context["storeys"]] == [
        bundle["storey_b"].GlobalId,
        bundle["storey_a"].GlobalId,
    ]
    assert [storey["floor"] for storey in context["storeys"]] == [1, 2]
    assert context["storeys"][0]["elevation"] == 0.0
    assert context["storeys"][1]["elevation"] == 3000.0


def test_extract_space_from_pset(tmp_path):
    bundle = _make_minimal_ifc()
    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))

    space = next(space for space in context["spaces"] if space["id"] == bundle["space_a"].GlobalId)
    assert space["width"] == 4000
    assert space["height"] == 5000
    assert space["type"] == "living"
    assert space["locked"] is True


def test_extract_space_polygon_from_rect(tmp_path):
    bundle = _make_minimal_ifc()
    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))

    space = next(space for space in context["spaces"] if space["id"] == bundle["space_a"].GlobalId)
    assert space["polygon"] == [(0.0, 0.0), (4000.0, 0.0), (4000.0, 5000.0), (0.0, 5000.0)]


def test_extract_space_name_prefers_long_name(tmp_path):
    bundle = _make_minimal_ifc()
    bundle["space_a"].Name = "101"
    bundle["space_a"].LongName = "嫄곗떎"
    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))

    space = next(space for space in context["spaces"] if space["id"] == bundle["space_a"].GlobalId)
    assert space["name"] == "嫄곗떎"
    assert space["type"] == "living"


def test_extract_space_polygon_from_footprint(tmp_path):
    bundle = _make_minimal_ifc()
    bundle["space_a"].Representation = _footprint_representation(
        bundle["ifc"],
        [(0.0, 0.0), (4.0, 0.0), (4.0, 5.0), (0.0, 5.0), (0.0, 0.0)],
    )
    space_pset = next(
        rel.RelatingPropertyDefinition
        for rel in bundle["space_a"].IsDefinedBy
        if rel.RelatingPropertyDefinition.Name == "Batang_SpaceDimensions"
    )
    ifcopenshell.api.pset.edit_pset(
        bundle["ifc"],
        pset=space_pset,
        properties={"Width": None, "Height": None},
    )

    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))
    space = next(space for space in context["spaces"] if space["id"] == bundle["space_a"].GlobalId)
    assert space["polygon"] == [(0.0, 0.0), (4000.0, 0.0), (4000.0, 5000.0), (0.0, 5000.0)]
    assert space["width"] == 4000
    assert space["height"] == 5000


def test_wall_kind_exterior(tmp_path):
    bundle = _make_minimal_ifc(wall_space_count=1)
    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))

    wall = context["walls"][0]
    assert wall["space_ids"] == [bundle["space_a"].GlobalId]
    assert wall["kind"] == "EXTERIOR"


def test_wall_kind_partition(tmp_path):
    bundle = _make_minimal_ifc(wall_space_count=0)
    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))

    wall = context["walls"][0]
    assert wall["space_ids"] == []
    assert wall["kind"] == "PARTITION"


def test_wall_kind_interior(tmp_path):
    bundle = _make_minimal_ifc(wall_space_count=2)
    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))

    wall = context["walls"][0]
    assert wall["space_ids"] == sorted([bundle["space_a"].GlobalId, bundle["space_b"].GlobalId])
    assert wall["kind"] == "INTERIOR"


def test_wall_start_end_normalized(tmp_path):
    bundle = _make_minimal_ifc(reverse_wall_axis=True)
    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))

    wall = context["walls"][0]
    assert wall["start"][0] < wall["end"][0]


def test_window_exterior_only(tmp_path):
    bundle = _make_minimal_ifc(wall_space_count=2, include_window=True)
    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))

    assert len(context["windows"]) == 1
    assert context["windows"][0]["adjacent_space_id"] in {
        bundle["space_a"].GlobalId,
        bundle["space_b"].GlobalId,
    }


def test_ifc2x3_raises(tmp_path):
    bundle = {"ifc": ifcopenshell.file(schema="IFC2X3")}
    with pytest.raises(ValueError):
        extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))


def test_ifc4x3_is_accepted(tmp_path):
    bundle = {"ifc": ifcopenshell.file(schema="IFC4X3")}
    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))
    assert context["spaces"] == []
    assert context["storeys"] == []


def test_non_meter_length_unit_is_rejected(tmp_path):
    bundle = _make_minimal_ifc()
    project = next(iter(bundle["ifc"].by_type("IfcProject")))
    project.UnitsInContext = bundle["ifc"].create_entity(
        "IfcUnitAssignment",
        Units=[
            bundle["ifc"].create_entity(
                "IfcSIUnit",
                UnitType="LENGTHUNIT",
                Name="METRE",
                Prefix="MILLI",
            )
        ],
    )

    with pytest.raises(ValueError, match="Unsupported IFC length unit prefix"):
        extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))


def test_missing_length_unit_is_rejected(tmp_path):
    bundle = _make_minimal_ifc()
    project = next(iter(bundle["ifc"].by_type("IfcProject")))
    project.UnitsInContext = bundle["ifc"].create_entity("IfcUnitAssignment", Units=[])

    with pytest.raises(ValueError, match="missing LENGTHUNIT"):
        extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))


def test_bool_numeric_pset_value_falls_back_to_bbox(tmp_path):
    bundle = _make_minimal_ifc()
    space_pset = next(
        rel.RelatingPropertyDefinition
        for rel in bundle["space_a"].IsDefinedBy
        if rel.RelatingPropertyDefinition.Name == "Batang_SpaceDimensions"
    )
    ifcopenshell.api.pset.edit_pset(
        bundle["ifc"],
        pset=space_pset,
        properties={"Width": True, "Height": True},
    )

    context = extract_ifc_context(_write_ifc(tmp_path, bundle["ifc"]))
    space = next(space for space in context["spaces"] if space["id"] == bundle["space_a"].GlobalId)
    assert space["width"] == 4000
    assert space["height"] == 5000


def test_extract_house_kr_spaces_and_names():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    context = extract_ifc_context(str(house_kr))

    assert len(context["spaces"]) == 7
    assert len(context["boundaries"]) == 2
    assert {space["name"] for space in context["spaces"]} >= {
        "\uac70\uc2e4",
        "\uce68\uc2e4",
        "\uc8fc\ubc29",
        "\ubcf5\ub3c4",
        "\uc695\uc2e4",
        "\uc11c\uc7ac",
    }
    assert {space["type"] for space in context["spaces"]} >= {
        "living",
        "bedroom",
        "kitchen",
        "bathroom",
        "office",
        "corridor",
    }


@pytest.mark.asyncio
async def test_pipeline_preview_resize_room_boundary_overflow(policy_ifc_ctx):
    pipeline = LLM2DPipeline(ifc_context=policy_ifc_ctx)
    command = FloorNLPCommand(
        action="resize_room",
        target_room_name="center",
        resize_shape="rect",
        resize_width=6000,
        resize_height=5000,
        resize_rects=shape_to_rects("rect", 6000, 5000),
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert preview["policy_plan"]["status"] == "unsupported"
    assert preview["policy_plan"]["reason"] == "resize_outside_boundary"


@pytest.fixture
def policy_ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {
                "id": "sp-center",
                "name": "center",
                "type": "other",
                "floor": 1,
                "polygon": [(2000, 0), (5000, 0), (5000, 5000), (2000, 5000)],
                "width": 3000,
                "height": 5000,
                "x": 2000.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-left",
                "name": "left",
                "type": "bedroom",
                "floor": 1,
                "polygon": [(0, 0), (2000, 0), (2000, 5000), (0, 5000)],
                "width": 2000,
                "height": 5000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-right-top",
                "name": "right-top",
                "type": "bedroom",
                "floor": 1,
                "polygon": [(5000, 0), (9000, 0), (9000, 2500), (5000, 2500)],
                "width": 4000,
                "height": 2500,
                "x": 5000.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-right-bottom",
                "name": "right-bottom",
                "type": "bedroom",
                "floor": 1,
                "polygon": [(5000, 2500), (9000, 2500), (9000, 5000), (5000, 5000)],
                "width": 4000,
                "height": 2500,
                "x": 5000.0,
                "y": 2500.0,
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
                "start": (2000, 0),
                "end": (2000, 5000),
                "thickness": 200,
                "space_ids": ["sp-center", "sp-left"],
                "kind": "INTERIOR",
            },
            {
                "id": "wall-right-top",
                "floor": 1,
                "start": (5000, 0),
                "end": (5000, 2500),
                "thickness": 200,
                "space_ids": ["sp-center", "sp-right-top"],
                "kind": "INTERIOR",
            },
            {
                "id": "wall-right-bottom",
                "floor": 1,
                "start": (5000, 2500),
                "end": (5000, 5000),
                "thickness": 200,
                "space_ids": ["sp-center", "sp-right-bottom"],
                "kind": "INTERIOR",
            },
        ],
        "doors": [
            {
                "id": "door-left",
                "floor": 1,
                "host_wall_id": "wall-left",
                "from_space_id": "sp-center",
                "to_space_id": "sp-left",
                "width": 900,
                "height": 2100,
                "position": 1000,
                "opening_type": "swing",
                "swing_into_id": None,
                "hinge_side": None,
            }
        ],
        "windows": [],
        "boundaries": [
            {
                "floor": 1,
                "outer_polygon": [(0, 0), (9000, 0), (9000, 5000), (0, 5000)],
                "holes": [],
            }
        ],
        "storeys": [{"id": "st-001", "floor": 1, "elevation": 0.0}],
    }


@pytest.mark.asyncio
async def test_pipeline_preview_remove_room(policy_ifc_ctx):
    pipeline = LLM2DPipeline(ifc_context=policy_ifc_ctx)
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "alternatives"
    assert preview["policy_plan"]["status"] == "planned"
    assert preview["policy_plan"]["merge_target_space_id"] == "sp-left"
    assert "session_id" not in preview
    assert "engine_request" not in preview
    assert "session_id" not in preview
    assert preview["alternatives"][0]["alternative_id"] == "merge-primary"


@pytest.mark.asyncio
async def test_pipeline_preview_resize_room_auto_selects_only_valid_direction(policy_ifc_ctx):
    right_top = next(space for space in policy_ifc_ctx["spaces"] if space["id"] == "sp-right-top")
    right_top["polygon"] = [(5000, 0), (9000, 0), (9000, 5000), (5000, 5000)]
    right_top["height"] = 5000
    right_bottom = next(
        space for space in policy_ifc_ctx["spaces"] if space["id"] == "sp-right-bottom"
    )
    right_bottom["floor"] = 2
    right_wall = next(wall for wall in policy_ifc_ctx["walls"] if wall["id"] == "wall-right-top")
    right_wall["end"] = (5000, 5000)

    pipeline = LLM2DPipeline(ifc_context=policy_ifc_ctx)
    command = FloorNLPCommand(
        action="resize_room",
        target_room_name="center",
        resize_shape="rect",
        resize_width=2000,
        resize_height=5000,
        resize_rects=shape_to_rects("rect", 2000, 5000),
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert preview["policy_plan"]["reason"] == "single_direction_resize"
    assert preview["policy_plan"]["direction"] == "west"
    assert "session_id" not in preview


@pytest.mark.asyncio
async def test_pipeline_preview_room_actions_do_not_expose_local_fallback_apply(policy_ifc_ctx):
    pipeline = LLM2DPipeline(ifc_context=policy_ifc_ctx)
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "alternatives"
    assert "engine_capabilities" not in preview or preview["engine_capabilities"].get(
        "local_fallback_actions", []
    ) == []


def test_infer_resize_direction():
    assert _infer_resize_direction("거실을 동쪽으로 넓혀줘") == "east"
    assert _infer_resize_direction("서재를 왼쪽으로 줄여줘") == "west"
    assert _infer_resize_direction("복도를 위쪽으로 늘려줘") == "north"
    assert _infer_resize_direction("욕실을 남쪽으로 조금 줄여줘") == "south"
    assert _infer_resize_direction("거실을 조금 넓혀줘") is None


@pytest.mark.asyncio
async def test_pipeline_preview_resize_room_uses_explicit_direction(policy_ifc_ctx):
    right_top = next(space for space in policy_ifc_ctx["spaces"] if space["id"] == "sp-right-top")
    right_top["polygon"] = [(5000, 0), (9000, 0), (9000, 5000), (5000, 5000)]
    right_top["height"] = 5000
    right_bottom = next(
        space for space in policy_ifc_ctx["spaces"] if space["id"] == "sp-right-bottom"
    )
    right_bottom["floor"] = 2
    right_wall = next(wall for wall in policy_ifc_ctx["walls"] if wall["id"] == "wall-right-top")
    right_wall["end"] = (5000, 5000)

    pipeline = LLM2DPipeline(ifc_context=policy_ifc_ctx)
    command = FloorNLPCommand(
        action="resize_room",
        target_room_name="center",
        resize_shape="rect",
        resize_width=2000,
        resize_height=5000,
        resize_rects=shape_to_rects("rect", 2000, 5000),
        resize_direction="west",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert preview["policy_plan"]["direction"] == "west"


def test_plan_resize_room_rejects_geometry_healing_required():
    ctx: IFCContext = {
        "spaces": [
            {
                "id": "sp-center",
                "name": "center",
                "type": "other",
                "floor": 1,
                "polygon": [(2000, 0), (5000, 0), (5000, 5000), (2000, 5000)],
                "width": 3000,
                "height": 5000,
                "x": 2000.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-left",
                "name": "left",
                "type": "bedroom",
                "floor": 1,
                "polygon": [(0, 0), (2000, 0), (2000, 5000), (0, 5000)],
                "width": 2000,
                "height": 5000,
                "x": 0.0,
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
                "start": (2000, 0),
                "end": (2000, 5000),
                "thickness": 200,
                "space_ids": ["sp-center", "sp-left"],
                "kind": "INTERIOR",
            },
            {
                "id": "wall-top",
                "floor": 1,
                "start": (2000, 5000),
                "end": (5000, 5000),
                "thickness": 200,
                "space_ids": ["sp-center"],
                "kind": "EXTERIOR",
            },
        ],
        "doors": [],
        "windows": [],
        "boundaries": [],
        "storeys": [{"id": "st-001", "floor": 1, "elevation": 0.0}],
    }

    result = plan_resize_room(
        target_space_id="sp-center",
        new_width=2000,
        new_height=5000,
        preferred_direction="west",
        ifc_context=ctx,
    )

    assert result["status"] == "unsupported"
    assert result["reason"] == "resize_geometry_healing_required"


@pytest.mark.asyncio
async def test_pipeline_apply_returns_deferred_command_batch(policy_ifc_ctx):
    pipeline = LLM2DPipeline(ifc_context=policy_ifc_ctx)
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "alternatives"
    assert preview["command_batch"]["commands"][0]["action"] == "delete_space"
    assert preview["policy_plan"]["status"] == "planned"
    assert "session_id" not in preview
    assert "engine_request" not in preview


def test_apply_space_plan_remove_room(tmp_path):
    bundle = _make_minimal_ifc()
    ifcopenshell.api.aggregate.assign_object(
        bundle["ifc"],
        products=[bundle["space_b"]],
        relating_object=bundle["storey_a"],
    )
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "remove-room.ifc")

    result = apply_space_plan(
        ifc_path=input_path,
        output_path=output_path,
        command=FloorNLPCommand(
            action="remove_room",
            target_room_name="Living",
            confidence=0.95,
        ),
        policy_plan={
            "status": "planned",
            "target_space_id": bundle["space_a"].GlobalId,
        },
    )

    assert result["status"] == "not_applied"
    assert "planning-assist only" in result["summary"]


def test_apply_space_plan_resize_room_west_moves_anchor(tmp_path):
    bundle = _make_minimal_ifc()
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "resize-room.ifc")

    result = apply_space_plan(
        ifc_path=input_path,
        output_path=output_path,
        command=FloorNLPCommand(
            action="resize_room",
            target_room_name="Living",
            resize_shape="rect",
            resize_width=5000,
            resize_height=5000,
            resize_rects=shape_to_rects("rect", 5000, 5000),
            confidence=0.95,
        ),
        policy_plan={
            "status": "planned",
            "target_space_id": bundle["space_a"].GlobalId,
            "direction": "west",
        },
    )

    assert result["status"] == "not_applied"
    assert "planning-assist only" in result["summary"]


def test_apply_space_plan_remove_room_removes_related_wall_and_window(tmp_path):
    bundle = _make_minimal_ifc(wall_space_count=2, include_window=True)
    ifcopenshell.api.aggregate.assign_object(
        bundle["ifc"],
        products=[bundle["space_b"]],
        relating_object=bundle["storey_a"],
    )
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "remove-room-related.ifc")

    result = apply_space_plan(
        ifc_path=input_path,
        output_path=output_path,
        command=FloorNLPCommand(
            action="remove_room",
            target_room_name="Living",
            confidence=0.95,
        ),
        policy_plan={
            "status": "planned",
            "target_space_id": bundle["space_a"].GlobalId,
            "remove_wall_ids": [bundle["wall"].GlobalId],
            "remove_opening_ids": [bundle["window"].GlobalId],
        },
    )

    assert result["status"] == "not_applied"
    assert "planning-assist only" in result["summary"]


def test_apply_space_plan_resize_room_moves_related_wall_and_window(tmp_path):
    bundle = _make_minimal_ifc(include_window=True)
    bundle["wall"].ObjectPlacement = _local_placement(bundle["ifc"], 0.0, 0.0, 0.0)
    bundle["wall"].Representation = _axis_representation(bundle["ifc"], (0.0, 0.0), (0.0, 5.0))
    bundle["window"].ObjectPlacement = _local_placement(bundle["ifc"], 0.0, 2.0, 0.9)
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "resize-room-related.ifc")

    result = apply_space_plan(
        ifc_path=input_path,
        output_path=output_path,
        command=FloorNLPCommand(
            action="resize_room",
            target_room_name="Living",
            resize_shape="rect",
            resize_width=5000,
            resize_height=5000,
            resize_rects=shape_to_rects("rect", 5000, 5000),
            confidence=0.95,
        ),
        policy_plan={
            "status": "planned",
            "target_space_id": bundle["space_a"].GlobalId,
            "direction": "west",
            "affected_wall_ids": [bundle["wall"].GlobalId],
            "affected_opening_ids": [bundle["window"].GlobalId],
        },
    )

    assert result["status"] == "not_applied"
    assert "planning-assist only" in result["summary"]


def test_apply_space_plan_resize_room_isolated_moves_opening_even_when_wall_uses_segment_update(
    tmp_path, monkeypatch
):
    bundle = _make_minimal_ifc(include_window=True)
    bundle["wall"].ObjectPlacement = _local_placement(bundle["ifc"], 0.0, 0.0, 0.0)
    bundle["wall"].Representation = _axis_representation(bundle["ifc"], (0.0, 0.0), (0.0, 5.0))
    bundle["window"].ObjectPlacement = _local_placement(bundle["ifc"], 0.0, 2.0, 0.9)
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "resize-room-isolated-opening.ifc")

    monkeypatch.setattr(
        executor_module,
        "build_isolated_rectangular_resize_wall_plans",
        lambda **kwargs: [
            {
                "wall_id": bundle["wall"].GlobalId,
                "start_mm": (-1000.0, 0.0),
                "end_mm": (-1000.0, 5000.0),
            }
        ],
    )

    result = apply_space_plan(
        ifc_path=input_path,
        output_path=output_path,
        command=FloorNLPCommand(
            action="resize_room",
            target_room_name="Living",
            resize_shape="rect",
            resize_width=5000,
            resize_height=5000,
            resize_rects=shape_to_rects("rect", 5000, 5000),
            confidence=0.95,
        ),
        policy_plan={
            "status": "planned",
            "target_space_id": bundle["space_a"].GlobalId,
            "direction": "west",
            "affected_wall_ids": [bundle["wall"].GlobalId],
            "affected_opening_ids": [bundle["window"].GlobalId],
            "affected_space_id": None,
        },
        ifc_context={
            "spaces": [],
            "walls": [],
            "doors": [],
            "windows": [],
            "adjacency": [],
            "boundaries": [],
            "storeys": [],
        },
    )

    assert result["status"] == "not_applied"
    assert "planning-assist only" in result["summary"]


def test_apply_space_plan_resize_room_skips_double_move_for_host_relative_window(tmp_path):
    bundle = _make_minimal_ifc(include_window=True)
    bundle["wall"].ObjectPlacement = _local_placement(bundle["ifc"], 0.0, 0.0, 0.0)
    bundle["wall"].Representation = _axis_representation(bundle["ifc"], (0.0, 0.0), (0.0, 5.0))
    opening = list(bundle["wall"].HasOpenings)[0].RelatedOpeningElement
    opening.ObjectPlacement = bundle["ifc"].create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=bundle["wall"].ObjectPlacement,
        RelativePlacement=bundle["ifc"].create_entity(
            "IfcAxis2Placement3D",
            Location=_cartesian_point(bundle["ifc"], 0.0, 2.0, 0.9),
        ),
    )
    bundle["window"].ObjectPlacement = bundle["ifc"].create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=opening.ObjectPlacement,
        RelativePlacement=bundle["ifc"].create_entity(
            "IfcAxis2Placement3D",
            Location=_cartesian_point(bundle["ifc"], 0.0, 0.0, 0.0),
        ),
    )
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "resize-room-host-relative-window.ifc")

    result = apply_space_plan(
        ifc_path=input_path,
        output_path=output_path,
        command=FloorNLPCommand(
            action="resize_room",
            target_room_name="Living",
            resize_shape="rect",
            resize_width=5000,
            resize_height=5000,
            resize_rects=shape_to_rects("rect", 5000, 5000),
            confidence=0.95,
        ),
        policy_plan={
            "status": "planned",
            "target_space_id": bundle["space_a"].GlobalId,
            "direction": "west",
            "affected_wall_ids": [bundle["wall"].GlobalId],
            "affected_opening_ids": [bundle["window"].GlobalId],
        },
    )

    assert result["status"] == "not_applied"
    assert "planning-assist only" in result["summary"]


def test_apply_space_plan_resize_room_updates_affected_space(tmp_path):
    bundle = _make_minimal_ifc()
    ifcopenshell.api.aggregate.assign_object(
        bundle["ifc"],
        products=[bundle["space_b"]],
        relating_object=bundle["storey_a"],
    )
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "resize-room-affected.ifc")

    result = apply_space_plan(
        ifc_path=input_path,
        output_path=output_path,
        command=FloorNLPCommand(
            action="resize_room",
            target_room_name="Living",
            resize_shape="rect",
            resize_width=5000,
            resize_height=5000,
            resize_rects=shape_to_rects("rect", 5000, 5000),
            confidence=0.95,
        ),
        policy_plan={
            "status": "planned",
            "target_space_id": bundle["space_a"].GlobalId,
            "direction": "east",
            "affected_space_id": bundle["space_b"].GlobalId,
            "affected_wall_ids": [],
            "affected_opening_ids": [],
        },
    )

    assert result["status"] == "not_applied"
    assert "planning-assist only" in result["summary"]


@pytest.mark.asyncio
async def test_pipeline_apply_remove_room_writes_ifc(tmp_path, policy_ifc_ctx):
    bundle = _make_minimal_ifc()
    pipeline_context = dict(policy_ifc_ctx)
    pipeline_context["spaces"] = [
        {**policy_ifc_ctx["spaces"][0], "id": bundle["space_a"].GlobalId, "name": "center"},
        {**policy_ifc_ctx["spaces"][1], "id": bundle["space_b"].GlobalId, "name": "left"},
    ]
    pipeline_context["walls"] = []
    pipeline_context["doors"] = []
    pipeline_context["windows"] = []
    input_path = _write_ifc(tmp_path, bundle["ifc"])

    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=pipeline_context)
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "alternatives"
    assert "session_id" not in preview


def test_apply_space_plan_add_room_creates_ifc_space(tmp_path):
    bundle = _make_minimal_ifc()
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "add-room.ifc")
    command = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "Kitchen",
            "type": "kitchen",
            "shape": "rect",
            "width": 3200,
            "height": 2800,
            "floor": 1,
            "rects": shape_to_rects("rect", 3200, 2800),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(
        command,
        extract_ifc_context(input_path),
    )

    result = apply_space_plan(
        ifc_path=input_path,
        output_path=output_path,
        command=command,
        command_batch=batch,
        policy_plan=None,
    )

    assert result["status"] == "not_applied"
    assert "planning-assist only" in result["summary"]


@pytest.mark.asyncio
async def test_pipeline_apply_add_room_writes_ifc(tmp_path):
    bundle = _make_minimal_ifc()
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=extract_ifc_context(input_path))
    command = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "Study",
            "type": "office",
            "shape": "rect",
            "width": 3000,
            "height": 2600,
            "floor": 1,
            "rects": shape_to_rects("rect", 3000, 2600),
        },
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert "auto-applied" in preview["summary"]
    assert "session_id" not in preview
    assert "engine_request" not in preview


@pytest.mark.asyncio
async def test_pipeline_apply_add_room_roundtrip_extracts_space(tmp_path):
    bundle = _make_minimal_ifc()
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=extract_ifc_context(input_path))
    command = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "Guest",
            "type": "bedroom",
            "shape": "rect",
            "width": 3100,
            "height": 2700,
            "floor": 1,
            "rects": shape_to_rects("rect", 3100, 2700),
        },
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert "auto-applied" in preview["summary"]
    assert "session_id" not in preview


@pytest.mark.asyncio
async def test_pipeline_preview_house_kr_add_room_reports_no_feasible_slot():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=extract_ifc_context(str(house_kr)),
    )
    command = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "Blocked Demo Room",
            "type": "other",
            "shape": "rect",
            "width": 2800,
            "height": 2400,
            "floor": 1,
            "rects": shape_to_rects("rect", 2800, 2400),
        },
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert "not auto-applied" in preview["summary"]

@pytest.mark.asyncio
async def test_pipeline_preview_add_room_emits_create_element(tmp_path):
    bundle = _make_minimal_ifc()
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    pipeline = LLM2DPipeline(
        ifc_path=input_path,
        ifc_context=extract_ifc_context(input_path),
        project_id="proj-2d",
        base_revision_id="rev-1",
    )
    command = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "Preview Room",
            "type": "office",
            "shape": "rect",
            "width": 2600,
            "height": 2400,
            "floor": 1,
            "rects": shape_to_rects("rect", 2600, 2400),
        },
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    geometry = preview["command_batch"]["commands"][0]["params"]["geometry"]
    assert geometry["location"][:2] != [0.0, 0.0]
    assert "engine_request" not in preview
    assert "ifc_edit_payload" not in preview


@pytest.mark.asyncio
async def test_pipeline_preview_resize_room_emits_transform_and_update(policy_ifc_ctx):
    pipeline = LLM2DPipeline(ifc_context=policy_ifc_ctx)
    command = FloorNLPCommand(
        action="resize_room",
        target_room_name="center",
        resize_shape="rect",
        resize_width=4000,
        resize_height=5000,
        resize_rects=shape_to_rects("rect", 4000, 5000),
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert preview["policy_plan"]["direction"] == "west"
    assert "adjacent space may change together" in preview["summary"]
    assert "engine_request" not in preview
    assert "ifc_edit_payload" not in preview


@pytest.mark.asyncio
async def test_pipeline_preview_house_kr_resize_room_with_direction_is_ready():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    gallery = next(space for space in ctx["spaces"] if space["floor"] == 2)
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=ctx,
    )
    command = FloorNLPCommand(
        action="resize_room",
        target_room_name=gallery["name"],
        resize_shape="rect",
        resize_width=10400,
        resize_height=gallery["height"],
        resize_rects=shape_to_rects("rect", 10400, gallery["height"]),
        resize_direction="west",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert preview["policy_plan"]["direction"] == "west"
    assert "engine_request" not in preview


@pytest.mark.asyncio
async def test_pipeline_apply_house_kr_resize_room_updates_boundary_walls(tmp_path):
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    gallery = next(space for space in ctx["spaces"] if space["floor"] == 2)
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=ctx,
    )
    command = FloorNLPCommand(
        action="resize_room",
        target_room_name=gallery["name"],
        resize_shape="rect",
        resize_width=10400,
        resize_height=gallery["height"],
        resize_rects=shape_to_rects("rect", 10400, gallery["height"]),
        resize_direction="west",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert preview["policy_plan"]["direction"] == "west"


@pytest.mark.asyncio
async def test_pipeline_preview_house_kr_remove_room_is_ready():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    bathroom = next(space for space in ctx["spaces"] if space["type"] == "bathroom")
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=ctx,
    )
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name=bathroom["name"],
        target_floor=bathroom["floor"],
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "alternatives"
    assert preview["policy_plan"]["merge_target_space_id"] is not None
    assert preview["alternatives"]
    assert "engine_request" not in preview


@pytest.mark.asyncio
async def test_pipeline_execute_preview_house_kr_remove_room_user_text():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=ctx,
    )

    preview = await pipeline.execute_preview("침실을 없애고 거실과 합쳐줘")
    merge_target_name_by_id = {space["id"]: space["name"] for space in ctx["spaces"]}

    assert preview["status"] == "alternatives"
    assert preview["command"]["action"] == "remove_room"
    assert preview["command"]["target_room_name"] == "침실"
    assert preview["policy_plan"]["reason"] == "preferred_adjacent_absorber"
    assert (
        merge_target_name_by_id[preview["policy_plan"]["merge_target_space_id"]]
        == "거실"
    )


@pytest.mark.asyncio
async def test_pipeline_apply_house_kr_remove_room_writes_ifc(tmp_path):
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    bathroom = next(space for space in ctx["spaces"] if space["type"] == "bathroom")
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=ctx,
    )
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name=bathroom["name"],
        target_floor=bathroom["floor"],
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "alternatives"
    assert preview["alternatives"]
    assert "session_id" not in preview


@pytest.mark.asyncio
async def test_pipeline_execute_preview_house_kr_resize_room_user_text():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    bedroom = next(
        space for space in ctx["spaces"] if space["name"] == "침실" and space["floor"] == 1
    )
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=ctx,
    )

    preview = await pipeline.execute_preview("침실을 서쪽으로 넓혀줘")

    assert preview["status"] == "needs_clarification"
    assert preview["command"]["action"] == "resize_room"
    assert preview["command"]["target_room_name"] == "침실"
    assert preview["command"]["resize_width"] > bedroom["width"]
    assert preview["command"]["resize_height"] >= bedroom["height"]


@pytest.mark.asyncio
@pytest.mark.skip(reason="resize_room apply is planning-assist only on this branch")
async def test_pipeline_execute_apply_house_kr_resize_room_user_text(tmp_path):
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    output_path = str(tmp_path / "house-kr-resize-room-user-text.ifc")
    ctx = extract_ifc_context(str(house_kr))
    bedroom = next(
        space for space in ctx["spaces"] if space["name"] == "침실" and space["floor"] == 1
    )
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=ctx,
    )

    preview = await pipeline.execute_preview("침실을 서쪽으로 넓혀줘")
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    updated_ctx = extract_ifc_context(output_path)
    updated_bedroom = next(space for space in updated_ctx["spaces"] if space["id"] == bedroom["id"])

    assert preview["status"] == "alternatives"
    assert result["status"] == "applied"
    assert result["apply_mode"] == "shared_authoring"
    assert updated_bedroom["width"] == preview["command"]["resize_width"]
    assert updated_bedroom["height"] == preview["command"]["resize_height"]


@pytest.mark.asyncio
@pytest.mark.skip(reason="remove_room apply payload flow is not used on this branch")
async def test_pipeline_apply_remove_room_returns_shared_payload_even_on_local_apply(
    tmp_path,
    policy_ifc_ctx,
):
    bundle = _make_minimal_ifc()
    pipeline_context = dict(policy_ifc_ctx)
    pipeline_context["spaces"] = [
        {**policy_ifc_ctx["spaces"][0], "id": bundle["space_a"].GlobalId, "name": "center"},
        {**policy_ifc_ctx["spaces"][1], "id": bundle["space_b"].GlobalId, "name": "left"},
    ]
    pipeline_context["walls"] = []
    pipeline_context["doors"] = []
    pipeline_context["windows"] = []
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "pipeline-remove-shared.ifc")
    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=pipeline_context)
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)

    assert result["status"] == "applied"
    assert result["apply_mode"] == "shared_authoring"
    assert result["engine_request"]["mode"] == "apply"
    assert [op["type"] for op in result["engine_request"]["operations"]] == [
        "update_element_properties",
        "delete_elements",
    ]
    payload = IfcEditCommandPayload.model_validate(result["ifc_edit_payload"])
    assert payload.engineRequest is not None
    assert payload.engineRequest.mode == "apply"


@pytest.mark.asyncio
@pytest.mark.skip(reason="remove_room no longer produces shared apply sessions on this branch")
async def test_pipeline_preview_and_apply_share_request_id(policy_ifc_ctx, tmp_path):
    bundle = _make_minimal_ifc()
    pipeline_context = dict(policy_ifc_ctx)
    pipeline_context["spaces"] = [
        {**policy_ifc_ctx["spaces"][0], "id": bundle["space_a"].GlobalId, "name": "center"},
        {**policy_ifc_ctx["spaces"][1], "id": bundle["space_b"].GlobalId, "name": "left"},
    ]
    pipeline_context["walls"] = []
    pipeline_context["doors"] = []
    pipeline_context["windows"] = []
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "pipeline-remove-request-id.ifc")
    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=pipeline_context)
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)

    assert preview["engine_request"]["request_id"] == preview["session_id"]
    assert result["engine_request"]["request_id"] == preview["session_id"]


@pytest.mark.asyncio
@pytest.mark.skip(reason="remove_room no longer reaches shared-authoring apply on this branch")
async def test_pipeline_apply_falls_back_when_shared_authoring_fails(
    tmp_path,
    policy_ifc_ctx,
    monkeypatch,
):
    bundle = _make_minimal_ifc()
    pipeline_context = dict(policy_ifc_ctx)
    pipeline_context["spaces"] = [
        {**policy_ifc_ctx["spaces"][0], "id": bundle["space_a"].GlobalId, "name": "center"},
        {**policy_ifc_ctx["spaces"][1], "id": bundle["space_b"].GlobalId, "name": "left"},
    ]
    pipeline_context["walls"] = []
    pipeline_context["doors"] = []
    pipeline_context["windows"] = []
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "pipeline-remove-fallback.ifc")
    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=pipeline_context)
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )

    def _raise_shared_apply(*args, **kwargs):
        raise RuntimeError("shared apply exploded")

    monkeypatch.setattr(session_pipeline_module, "apply_ifc_edit_payload", _raise_shared_apply)

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)

    assert result["status"] == "applied"
    assert result["apply_mode"] == "local_fallback"
    assert "shared apply exploded" in result["fallback_reason"]


@pytest.mark.asyncio
@pytest.mark.skip(reason="remove_room no longer reaches shared-authoring apply on this branch")
async def test_pipeline_apply_does_not_fallback_on_contract_error(
    tmp_path,
    policy_ifc_ctx,
    monkeypatch,
):
    bundle = _make_minimal_ifc()
    pipeline_context = dict(policy_ifc_ctx)
    pipeline_context["spaces"] = [
        {**policy_ifc_ctx["spaces"][0], "id": bundle["space_a"].GlobalId, "name": "center"},
        {**policy_ifc_ctx["spaces"][1], "id": bundle["space_b"].GlobalId, "name": "left"},
    ]
    pipeline_context["walls"] = []
    pipeline_context["doors"] = []
    pipeline_context["windows"] = []
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "pipeline-remove-no-fallback.ifc")
    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=pipeline_context)
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )

    def _raise_shared_apply(*args, **kwargs):
        raise ValueError("shared payload mismatch")

    monkeypatch.setattr(session_pipeline_module, "apply_ifc_edit_payload", _raise_shared_apply)

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)

    assert result["status"] == "apply_failed"
    assert result["apply_mode"] == "shared_authoring"
    assert "shared payload mismatch" in result["summary"]


def test_to_ifc_commands_create_door_on_selected_wall(ifc_ctx):
    ctx = dict(ifc_ctx)
    ctx["walls"] = [
        {
            "id": "wall-1",
            "floor": 1,
            "start": (0.0, 0.0),
            "end": (5000.0, 0.0),
            "thickness": 250,
            "space_ids": ["sp-001"],
            "kind": "EXTERIOR",
        }
    ]
    command = FloorNLPCommand(
        action="create_door",
        target_wall_id="wall-1",
        target_floor=1,
        element_width_mm=1000,
        element_height_mm=2200,
        confidence=0.95,
    )

    batch = to_ifc_commands(command, ctx)

    assert batch.requires_clarification is False
    assert len(batch.commands) == 1
    ifc_command = batch.commands[0]
    assert ifc_command.action == ActionType.CREATE_DOOR
    assert ifc_command.params["metadata"]["host_wall_id"] == "wall-1"
    assert ifc_command.params["geometry"]["location"] == [2500.0, 0.0, 0.0]
    assert ifc_command.params["geometry"]["dimensions"] == {"width": 1000, "height": 2200}


@pytest.mark.asyncio
async def test_engine_parse_command_recovers_create_wall_from_selected_room(ifc_ctx):
    ctx = dict(ifc_ctx)
    ctx["spaces"] = [
        {
            "id": "sp-living",
            "name": "거실",
            "type": "living",
            "floor": 1,
            "polygon": [(0.0, 0.0), (4000.0, 0.0), (4000.0, 3000.0), (0.0, 3000.0)],
            "width": 4000,
            "height": 3000,
            "x": 0.0,
            "y": 0.0,
            "angle": 0.0,
            "locked": False,
            "zone_id": None,
        }
    ]
    engine = FloorPlanEngine()

    command = await engine.parse_command("[거실] 여기에 가벽을 세워줘", ctx)

    assert command.action == "create_wall"
    assert command.target_room_name == "거실"
    assert command.target_floor == 1


def test_to_ifc_commands_create_wall_on_locked_house_kr_candidate():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    living_room_name = next(
        space["name"] for space in ctx["spaces"] if space["id"] == "0Lt8gR_E9ESeGH5uY_g9e9"
    )
    command = FloorNLPCommand(
        action="create_wall",
        target_room_name=living_room_name,
        target_floor=1,
        confidence=0.95,
    )

    batch = to_ifc_commands(command, ctx)

    assert batch.requires_clarification is True
    assert batch.commands == []
    assert batch.clarification_question


@pytest.mark.asyncio
async def test_engine_parse_command_recovers_create_door_from_selected_wall_id(ifc_ctx):
    ctx = dict(ifc_ctx)
    ctx["walls"] = [
        {
            "id": "wall-1",
            "floor": 1,
            "start": (0.0, 0.0),
            "end": (5000.0, 0.0),
            "thickness": 250,
            "space_ids": ["sp-001"],
            "kind": "EXTERIOR",
        }
    ]
    engine = FloorPlanEngine()

    command = await engine.parse_command("[wall-1] 여기에 문을 만들어줘", ctx)

    assert command.action == "create_door"
    assert command.target_wall_id == "wall-1"
    assert command.element_width_mm == 900
    assert command.element_height_mm == 2100


@pytest.mark.asyncio
async def test_pipeline_apply_create_door_requires_existing_template(tmp_path):
    bundle = _make_minimal_ifc(include_wall_body=True)
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    ctx = extract_ifc_context(input_path)
    wall_id = ctx["walls"][0]["id"]
    output_path = str(tmp_path / "pipeline-create-door.ifc")
    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=ctx)
    command = FloorNLPCommand(
        action="create_door",
        target_wall_id=wall_id,
        target_floor=1,
        element_width_mm=900,
        element_height_mm=2100,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)

    assert preview["status"] == "preview_ready"
    assert preview["engine_request"]["operations"][0]["type"] == "create_element"
    assert (
        preview["engine_request"]["operations"][0]["parameters"]["host_wall_global_id"] == wall_id
    )
    assert result["status"] == "applied"
    assert result["apply_mode"] == "shared_authoring"
    assert result["created_ids"] == []
    applied_model = ifcopenshell.open(output_path)
    assert applied_model.by_type("IfcDoor") == []
    assert applied_model.by_type("IfcOpeningElement") == []


@pytest.mark.asyncio
async def test_pipeline_apply_create_door_on_house_kr_reuses_template(tmp_path):
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    wall = next(
        wall for wall in ctx["walls"] if wall.get("floor") == 1 and wall.get("kind") == "INTERIOR"
    )
    before_model = ifcopenshell.open(str(house_kr))
    before_opening_ids = {opening.GlobalId for opening in before_model.by_type("IfcOpeningElement")}
    output_path = str(tmp_path / "house-kr-create-door.ifc")
    pipeline = LLM2DPipeline(ifc_path=str(house_kr), ifc_context=ctx)
    command = FloorNLPCommand(
        action="create_door",
        target_wall_id=wall["id"],
        target_floor=1,
        element_width_mm=900,
        element_height_mm=2100,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    updated_ctx = extract_ifc_context(output_path)

    assert preview["status"] == "preview_ready"
    assert result["status"] == "applied"
    assert result["apply_mode"] == "shared_authoring"
    assert len(updated_ctx["doors"]) == len(ctx["doors"]) + 1
    created_door_ctx = next(
        door for door in updated_ctx["doors"] if door["id"] in result["created_ids"]
    )
    assert created_door_ctx["host_wall_id"] == wall["id"]
    applied_model = ifcopenshell.open(output_path)
    after_opening_ids = {opening.GlobalId for opening in applied_model.by_type("IfcOpeningElement")}
    created_opening_ids = after_opening_ids - before_opening_ids
    assert len(created_opening_ids) == 1
    created_door = applied_model.by_guid(result["created_ids"][0])
    assert created_door is not None
    assert created_door.Name
    assert len(getattr(created_door, "ContainedInStructure", []) or []) == 1
    assert float(created_door.OverallWidth or 0.0) > 0.0
    assert float(created_door.OverallHeight or 0.0) > 0.0
    rep_types = {
        rep.RepresentationType
        for rep in getattr(created_door.Representation, "Representations", []) or []
    }
    assert "SweptSolid" not in rep_types
    assert "Box" in {
        rep.RepresentationIdentifier
        for rep in getattr(created_door.Representation, "Representations", []) or []
    }
    assert len(getattr(created_door, "FillsVoids", []) or []) == 1


@pytest.mark.asyncio
@pytest.mark.skip(
    reason="create_wall auto-apply is disabled until a validated House_KR candidate exists"
)
async def test_pipeline_apply_create_wall_on_house_kr_locked_candidate(tmp_path):
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    before_model = ifcopenshell.open(str(house_kr))
    before_wall_ids = {wall.GlobalId for wall in before_model.by_type("IfcWall")}
    output_path = str(tmp_path / "house-kr-create-wall.ifc")
    pipeline = LLM2DPipeline(ifc_path=str(house_kr), ifc_context=ctx)
    command = FloorNLPCommand(
        action="create_wall",
        target_room_name="거실",
        target_floor=1,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    updated_ctx = extract_ifc_context(output_path)

    assert preview["status"] == "preview_ready"
    assert preview["engine_request"]["operations"][0]["type"] == "create_element"
    assert preview["engine_request"]["operations"][0]["parameters"]["element_type"] == "IfcWall"
    assert result["status"] == "applied"
    assert result["apply_mode"] == "shared_authoring"
    assert len(updated_ctx["walls"]) == len(ctx["walls"]) + 1

    applied_model = ifcopenshell.open(output_path)
    after_walls = {wall.GlobalId for wall in applied_model.by_type("IfcWall")}
    created_wall_ids = after_walls - before_wall_ids
    assert len(created_wall_ids) == 1
    created_wall = applied_model.by_guid(next(iter(created_wall_ids)))
    assert created_wall is not None
    assert created_wall.is_a("IfcWallStandardCase")
    assert created_wall.Name == "거실 가벽"
    assert len(getattr(created_wall, "ContainedInStructure", []) or []) == 1
    assert len(getattr(created_wall, "IsTypedBy", []) or []) == 1
    body_item = engine_3d_module._wall_body_item(created_wall)
    assert body_item is not None
    assert body_item.is_a("IfcExtrudedAreaSolid")
    assert engine_3d_module._wall_y_bounds(created_wall) == pytest.approx((-0.24, 0.0))
    path_connects = [
        rel
        for rel in (
            list(getattr(created_wall, "ConnectedTo", []) or [])
            + list(getattr(created_wall, "ConnectedFrom", []) or [])
        )
        if rel.is_a("IfcRelConnectsPathElements")
    ]
    assert len(path_connects) == 2


@pytest.mark.asyncio
async def test_pipeline_preview_create_wall_on_house_kr_requires_clarification():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    living_room_name = next(
        space["name"] for space in ctx["spaces"] if space["id"] == "0Lt8gR_E9ESeGH5uY_g9e9"
    )
    pipeline = LLM2DPipeline(ifc_path=str(house_kr), ifc_context=ctx)
    command = FloorNLPCommand(
        action="create_wall",
        target_room_name=living_room_name,
        target_floor=1,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert "session_id" not in preview
    assert preview["summary"]


def test_translate_relative_placement_location_does_not_mutate_shared_point():
    model = ifcopenshell.file(schema="IFC4")
    shared_point = model.create_entity("IfcCartesianPoint", Coordinates=(1.0, 2.0, 0.0))
    placement_a = model.create_entity(
        "IfcAxis2Placement3D",
        Location=shared_point,
        Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
    )
    placement_b = model.create_entity(
        "IfcAxis2Placement3D",
        Location=shared_point,
        Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
    )

    executor_module._translate_relative_placement_location(
        model=model,
        relative_placement=placement_a,
        offset_x_m=3.0,
        offset_y_m=4.0,
    )

    assert tuple(placement_a.Location.Coordinates) == (4.0, 6.0, 0.0)
    assert tuple(placement_b.Location.Coordinates) == (1.0, 2.0, 0.0)
    assert placement_a.Location != placement_b.Location


def test_remove_related_products_cleans_bare_wall_openings():
    bundle = _make_minimal_ifc(include_window=True)
    wall = bundle["wall"]
    model = bundle["ifc"]
    opening_ids = [
        rel.RelatedOpeningElement.GlobalId
        for rel in getattr(wall, "HasOpenings", []) or []
        if getattr(rel, "RelatedOpeningElement", None) is not None
    ]

    assert opening_ids
    executor_module._remove_related_products(model, [wall.GlobalId])

    for opening_id in opening_ids:
        with pytest.raises(RuntimeError):
            model.by_guid(opening_id)


def test_build_engine_request_remove_room_deduplicates_selector(policy_ifc_ctx):
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )
    batch = to_ifc_commands(command, policy_ifc_ctx)
    with pytest.raises(ValueError, match="planning-assist only"):
        build_engine_request(
            mode="preview",
            request_id="req-1",
            project_id="proj-1",
            base_revision_id="rev-1",
            command=command,
            command_batch=batch,
            policy_plan={
                "status": "planned",
                "target_space_id": "sp-center",
                "merge_target_space_id": "sp-left",
                "remove_wall_ids": ["wall-left", "wall-left"],
                "remove_opening_ids": ["door-left", "door-left"],
            },
            ifc_context=policy_ifc_ctx,
        )


def test_build_remove_merge_plan_rejects_large_gap():
    ctx: IFCContext = {
        "spaces": [
            {
                "id": "sp-target",
                "name": "target",
                "type": "other",
                "floor": 1,
                "polygon": [(0, 0), (2000, 0), (2000, 2000), (0, 2000)],
                "width": 2000,
                "height": 2000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-merge",
                "name": "merge",
                "type": "other",
                "floor": 1,
                "polygon": [(2400, 0), (4400, 0), (4400, 2000), (2400, 2000)],
                "width": 2000,
                "height": 2000,
                "x": 2400.0,
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
        "storeys": [],
    }

    assert (
        build_remove_merge_plan(
            ifc_context=ctx,
            target_space_id="sp-target",
            merge_target_space_id="sp-merge",
        )
        is None
    )


def test_build_engine_request_add_room_requires_storey_id(ifc_ctx):
    command = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "Invalid",
            "type": "other",
            "shape": "rect",
            "width": 2000,
            "height": 2000,
            "floor": 1,
            "rects": shape_to_rects("rect", 2000, 2000),
        },
        confidence=0.95,
    )
    batch = CommandBatch(
        commands=[
            IFCCommand(
                action=ActionType.CREATE_SPACE,
                target_id=None,
                params={
                    "entity_type": "Space",
                    "metadata": {},
                    "geometry": {"dimensions": {"width": 2000, "height": 2000}},
                    "properties": {"name": "Invalid"},
                },
                confidence=0.95,
            )
        ],
        requires_clarification=False,
    )

    with pytest.raises(ValueError, match="planning-assist only"):
        build_engine_request(
            mode="preview",
            request_id="req-2",
            project_id="proj-2",
            command=command,
            command_batch=batch,
            policy_plan=None,
            ifc_context=ifc_ctx,
        )


def test_build_engine_request_add_room_rejects_when_no_feasible_placement():
    ctx: IFCContext = {
        "spaces": [
            {
                "id": "sp-1",
                "name": "filled",
                "type": "other",
                "floor": 1,
                "polygon": [(0, 0), (1500, 0), (1500, 3000), (0, 3000)],
                "width": 1500,
                "height": 3000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-2",
                "name": "filled-2",
                "type": "other",
                "floor": 1,
                "polygon": [(1500, 0), (3000, 0), (3000, 3000), (1500, 3000)],
                "width": 1500,
                "height": 3000,
                "x": 1500.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            }
        ],
        "adjacency": [],
        "walls": [],
        "doors": [],
        "windows": [],
        "boundaries": [
            {
                "floor": 1,
                "outer_polygon": [(0, 0), (3000, 0), (3000, 3000), (0, 3000)],
                "holes": [],
            }
        ],
        "storeys": [{"id": "st-001", "floor": 1, "elevation": 0.0}],
    }
    command = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "Blocked",
            "type": "other",
            "shape": "rect",
            "width": 1000,
            "height": 1000,
            "floor": 1,
            "rects": shape_to_rects("rect", 1000, 1000),
        },
        confidence=0.95,
    )
    batch = to_ifc_commands(command, ctx)

    with pytest.raises(ValueError, match="planning-assist only"):
        build_engine_request(
            mode="preview",
            request_id="req-2b",
            project_id="proj-2b",
            command=command,
            command_batch=batch,
            policy_plan=None,
            ifc_context=ctx,
        )


def test_build_engine_request_remove_room_rejects_empty_selector():
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="missing",
        confidence=0.95,
    )
    batch = CommandBatch(commands=[], requires_clarification=False)

    with pytest.raises(ValueError, match="planning-assist only"):
        build_engine_request(
            mode="preview",
            request_id="req-3",
            project_id="proj-3",
            command=command,
            command_batch=batch,
            policy_plan={},
            ifc_context=None,
        )






@pytest.mark.skip(reason="resize_room shared payload generation is disabled on this branch")
def test_build_engine_request_resize_east_splits_target_and_affected_transforms():
    ctx: IFCContext = {
        "spaces": [
            {
                "id": "sp-target",
                "name": "target",
                "type": "other",
                "floor": 1,
                "polygon": [(0, 0), (4000, 0), (4000, 5000), (0, 5000)],
                "width": 4000,
                "height": 5000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
            {
                "id": "sp-east",
                "name": "east",
                "type": "bedroom",
                "floor": 1,
                "polygon": [(4000, 0), (7000, 0), (7000, 5000), (4000, 5000)],
                "width": 3000,
                "height": 5000,
                "x": 4000.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            },
        ],
        "adjacency": [],
        "walls": [
            {
                "id": "wall-east",
                "floor": 1,
                "start": (4000, 0),
                "end": (4000, 5000),
                "thickness": 200,
                "space_ids": ["sp-target", "sp-east"],
                "kind": "INTERIOR",
            }
        ],
        "doors": [],
        "windows": [],
        "boundaries": [],
        "storeys": [{"id": "st-001", "floor": 1, "elevation": 0.0}],
    }
    command = FloorNLPCommand(
        action="resize_room",
        target_room_name="target",
        resize_shape="rect",
        resize_width=5000,
        resize_height=5000,
        resize_rects=shape_to_rects("rect", 5000, 5000),
        confidence=0.95,
    )
    batch = to_ifc_commands(command, ctx)
    engine_request = build_engine_request(
        mode="preview",
        request_id="req-4",
        project_id="proj-4",
        command=command,
        command_batch=batch,
        policy_plan={
            "status": "planned",
            "target_space_id": "sp-target",
            "direction": "east",
            "affected_space_id": "sp-east",
            "affected_wall_ids": ["wall-east"],
            "affected_opening_ids": [],
        },
        ifc_context=ctx,
    )

    assert [op.type for op in engine_request.operations] == [
        "transform_elements",
        "transform_elements",
        "update_element_properties",
        "update_element_properties",
    ]
    assert engine_request.operations[0].selector["global_ids"] == ["wall-east"]
    assert engine_request.operations[0].parameters["translate_mm"] == {
        "x": 1000.0,
        "y": 0.0,
        "z": 0.0,
    }
    assert engine_request.operations[1].selector["global_ids"] == ["sp-east"]
    assert engine_request.operations[1].parameters["translate_mm"] == {
        "x": 1000.0,
        "y": 0.0,
        "z": 0.0,
    }
    assert engine_request.operations[2].selector["global_ids"] == ["sp-target"]
    assert engine_request.operations[3].parameters["dimensions_mm"] == {
        "width": 2000,
        "height": 5000,
    }


@pytest.mark.skip(reason="resize_room shared payload generation is disabled on this branch")
def test_build_engine_request_resize_isolated_skips_boundary_transform():
    ctx: IFCContext = {
        "spaces": [
            {
                "id": "sp-target",
                "name": "target",
                "type": "other",
                "floor": 1,
                "polygon": [(0, 0), (4000, 0), (4000, 5000), (0, 5000)],
                "width": 4000,
                "height": 5000,
                "x": 0.0,
                "y": 0.0,
                "angle": 0.0,
                "locked": False,
                "zone_id": None,
            }
        ],
        "adjacency": [],
        "walls": [
            {
                "id": "wall-west",
                "floor": 1,
                "start": (0, 0),
                "end": (0, 5000),
                "thickness": 200,
                "space_ids": ["sp-target"],
                "kind": "EXTERIOR",
            },
            {
                "id": "wall-east",
                "floor": 1,
                "start": (4000, 0),
                "end": (4000, 5000),
                "thickness": 200,
                "space_ids": ["sp-target"],
                "kind": "EXTERIOR",
            },
            {
                "id": "wall-south",
                "floor": 1,
                "start": (0, 0),
                "end": (4000, 0),
                "thickness": 200,
                "space_ids": ["sp-target"],
                "kind": "EXTERIOR",
            },
            {
                "id": "wall-north",
                "floor": 1,
                "start": (0, 5000),
                "end": (4000, 5000),
                "thickness": 200,
                "space_ids": ["sp-target"],
                "kind": "EXTERIOR",
            },
        ],
        "doors": [],
        "windows": [],
        "boundaries": [],
        "storeys": [{"id": "st-001", "floor": 1, "elevation": 0.0}],
    }
    command = FloorNLPCommand(
        action="resize_room",
        target_room_name="target",
        resize_shape="rect",
        resize_width=3000,
        resize_height=5000,
        resize_rects=shape_to_rects("rect", 3000, 5000),
        resize_direction="west",
        confidence=0.95,
    )
    batch = to_ifc_commands(command, ctx)
    engine_request = build_engine_request(
        mode="preview",
        request_id="req-iso",
        project_id="proj-iso",
        command=command,
        command_batch=batch,
        policy_plan={
            "status": "planned",
            "target_space_id": "sp-target",
            "direction": "west",
            "affected_space_id": None,
            "affected_wall_ids": ["wall-west"],
            "affected_opening_ids": ["window-west"],
        },
        ifc_context=ctx,
    )

    assert [op.type for op in engine_request.operations] == [
        "transform_elements",
        "update_element_properties",
        "update_element_properties",
        "update_element_properties",
        "update_element_properties",
        "update_element_properties",
    ]
    assert engine_request.operations[0].id == "op-transform-shared-boundary-openings"
    assert engine_request.operations[1].id == "op-update-target-space"


@pytest.mark.asyncio
async def test_engine_parse_public_insert_toilet_command():
    engine = FloorPlanEngine()
    result = await engine.parse_command("1층에 공용 화장실 만들어줘")

    assert result.action == "insert_toilet"
    assert result.target_room_name is None
    assert result.target_floor == 1


@pytest.mark.asyncio
async def test_pipeline_preview_nobathroom_house_kr_routes_to_public_toilet_plan():
    fixture = Path(__file__).resolve().parents[3] / "scripts" / "House_KR_nobathroom.ifc"
    ctx = extract_ifc_context(str(fixture))
    pipeline = LLM2DPipeline(ifc_path=str(fixture), ifc_context=ctx)
    command = FloorNLPCommand(
        action="insert_toilet",
        target_room_name=None,
        target_floor=1,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "alternatives"
    assert preview["policy_plan"]["strategy"] == "corridor_end"
    assert preview["policy_plan"]["anchor_room_name"] is None
    assert preview["policy_plan"]["donor_room_name"] == "Big Room"
    assert "session_id" not in preview


@pytest.mark.asyncio
@pytest.mark.skip(reason="insert_toilet apply is planning-assist only on this branch")
async def test_pipeline_apply_nobathroom_big_room_split_clears_existing_openings_on_toilet_edges(
    tmp_path,
):
    fixture = Path(__file__).resolve().parents[3] / "scripts" / "House_KR_nobathroom.ifc"
    ctx = extract_ifc_context(str(fixture))
    output_path = str(tmp_path / "house-kr-nobathroom-insert-toilet.ifc")
    pipeline = LLM2DPipeline(
        ifc_path=str(fixture),
        ifc_context=ctx,
    )
    command = FloorNLPCommand(
        action="insert_toilet",
        target_floor=1,
        user_intent="shared_toilet_split_big_room",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)

    assert result["status"] == "applied"
    assert result["apply_mode"] == "local_demo_apply"

    plan = build_toilet_insertion_geometry_plan(
        ctx,
        floor=1,
        user_intent="shared_toilet_split_big_room",
    )
    assert plan is not None

    applied_model = ifcopenshell.open(output_path)

    for opening_kind, expected_name, local_id in (
        ("IfcWindow", "Toilet Window", plan["window_plan"]["host_wall_local_id"]),
        ("IfcDoor", "Toilet Door", plan["door_plan"]["host_wall_local_id"]),
    ):
        host_wall_plan = next(
            wall_plan
            for wall_plan in [*plan["donor_walls_to_reuse"], *plan["required_new_walls"]]
            if wall_plan["wall_local_id"] == local_id
        )
        if host_wall_plan["global_id"] is None:
            host_wall = next(
                wall
                for wall in applied_model.by_type("IfcWall")
                if wall.Name == f"Toilet Wall {local_id}"
            )
            host_segment = executor_module._wall_segment_from_entity(host_wall)
            base_offset = 0.0
        else:
            host_wall = applied_model.by_guid(host_wall_plan["global_id"])
            assert host_wall is not None
            host_segment = executor_module._wall_segment_from_entity(host_wall)
            base_offset = executor_module._offset_along_segment(
                host_segment,
                tuple(host_wall_plan["start_mm"]),
            )
        target_segment = (
            executor_module._point_along_segment(host_segment, base_offset),
            executor_module._point_along_segment(
                host_segment,
                base_offset
                + executor_module._segment_length_mm(
                    (tuple(host_wall_plan["start_mm"]), tuple(host_wall_plan["end_mm"]))
                ),
            ),
        )
        segment_names: list[str] = []
        for rel in list(getattr(host_wall, "HasOpenings", []) or []):
            opening = getattr(rel, "RelatedOpeningElement", None)
            if opening is None:
                continue
            point = executor_module._opening_world_point(opening)
            fills = list(getattr(opening, "HasFillings", []) or [])
            filled = fills[0].RelatedBuildingElement if fills else None
            if filled is None or not filled.is_a(opening_kind) or point is None:
                continue
            if executor_module._point_is_within_segment(
                point_mm=(float(point.x), float(point.y)),
                segment_mm=target_segment,
            ):
                segment_names.append(filled.Name)
        assert segment_names == [expected_name]

    toilet_door = next(
        door for door in applied_model.by_type("IfcDoor") if door.Name == "Toilet Door"
    )
    door_body = next(
        rep
        for rep in toilet_door.Representation.Representations
        if rep.RepresentationIdentifier == "Body"
    )
    assert door_body.RepresentationType in {"Brep", "MappedRepresentation"}

    toilet_window = next(
        window for window in applied_model.by_type("IfcWindow") if window.Name == "Toilet Window"
    )
    window_body = next(
        rep
        for rep in toilet_window.Representation.Representations
        if rep.RepresentationIdentifier == "Body"
    )
    assert window_body.RepresentationType in {"MappedRepresentation", "Brep"}
    for filler_name in ("Study Door", "Toilet Door", "Toilet Window"):
        filler = next(
            product
            for product in [*applied_model.by_type("IfcDoor"), *applied_model.by_type("IfcWindow")]
            if product.Name == filler_name
        )
        fills = list(getattr(filler, "FillsVoids", []) or [])
        assert fills, f"{filler_name} must fill an opening"
        opening = fills[0].RelatingOpeningElement
        assert filler.ObjectPlacement.PlacementRelTo == opening.ObjectPlacement
        voids = list(getattr(opening, "VoidsElements", []) or [])
        assert voids, f"{filler_name} opening must void a host wall"
        host_wall = voids[0].RelatingBuildingElement
        assert opening.ObjectPlacement.PlacementRelTo == host_wall.ObjectPlacement
    applied_ctx = extract_ifc_context(output_path)
    floor1_spaces = {
        space["name"]: space for space in applied_ctx["spaces"] if space["floor"] == 1
    }
    assert "서재" in floor1_spaces
    assert "화장실" in floor1_spaces
    floor1_doors = [door for door in applied_ctx["doors"] if door.get("floor") == 1]
    floor1_windows = [window for window in applied_ctx["windows"] if window.get("floor") == 1]
    assert any(
        door.get("from_space_id") == plan["donor_room_id"]
        or door.get("to_space_id") == plan["donor_room_id"]
        for door in floor1_doors
    )
    assert any(
        window.get("adjacent_space_id") == plan["donor_room_id"] for window in floor1_windows
    )
    assert "Public toilet" in preview["summary"]


def test_axis_aligned_rectangle_tolerates_small_point_noise():
    noisy_rectangle = [
        (0.0, 0.0),
        (4000.0, 0.0001),
        (3999.9999, 5000.0),
        (0.0, 5000.0001),
    ]

    assert plan_resize_room(
        target_space_id="sp-center",
        new_width=3000,
        new_height=5000,
        ifc_context={
            "spaces": [
                {
                    "id": "sp-center",
                    "name": "center",
                    "type": "other",
                    "floor": 1,
                    "polygon": noisy_rectangle,
                    "width": 4000,
                    "height": 5000,
                    "x": 0.0,
                    "y": 0.0,
                    "angle": 0.0,
                    "locked": False,
                    "zone_id": None,
                }
            ],
            "adjacency": [],
            "walls": [],
            "doors": [],
            "windows": [],
            "boundaries": [],
            "storeys": [],
        },
    )["reason"] != "non_rectangular_space"


@pytest.mark.asyncio
async def test_engine_parse_insert_toilet_command():
    engine = FloorPlanEngine()
    result = await engine.parse_command("욕실 옆에 화장실 만들어줘")

    assert result.action == "insert_toilet"
    assert result.target_room_name == "욕실"
    assert result.target_floor == 1


def test_build_toilet_insertion_geometry_plan_house_kr_prefers_bathroom_edge():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))

    plan = build_toilet_insertion_geometry_plan(ctx, floor=1)

    assert plan is not None
    assert plan["anchor_room_name"] == "욕실"
    assert plan["donor_room_name"] == "욕실"
    assert plan["strategy"] == "bathroom_edge"
    assert plan["donor_strategy_used"] == "bathroom_edge_full"


@pytest.mark.asyncio
async def test_pipeline_preview_house_kr_insert_toilet_routes_to_demo_plan():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=extract_ifc_context(str(house_kr)),
    )
    command = FloorNLPCommand(
        action="insert_toilet",
        target_room_name="욕실",
        target_floor=1,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "alternatives"
    assert preview["policy_plan"]["reason"] == "insert_toilet_demo"
    assert preview["policy_plan"]["anchor_room_name"] == "욕실"
    assert preview["policy_plan"]["donor_room_name"] == "욕실"
    assert "engine_request" not in preview


@pytest.mark.asyncio
@pytest.mark.skip(reason="insert_toilet apply is planning-assist only on this branch")
async def test_pipeline_apply_insert_toilet_creates_space_and_shrinks_donor(tmp_path):
    def _bbox(polygon: list[tuple[float, float]]) -> tuple[float, float, float, float]:
        xs = [point[0] for point in polygon]
        ys = [point[1] for point in polygon]
        return (min(xs), min(ys), max(xs), max(ys))

    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    expected_plan = build_toilet_insertion_geometry_plan(ctx, floor=1)
    assert expected_plan is not None

    output_path = str(tmp_path / "house-kr-insert-toilet.ifc")
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=ctx,
    )
    command = FloorNLPCommand(
        action="insert_toilet",
        target_room_name="욕실",
        target_floor=1,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    updated_ctx = extract_ifc_context(output_path)

    assert result["status"] == "applied"
    assert result["apply_mode"] == "local_demo_apply"
    toilet = next(
        space
        for space in updated_ctx["spaces"]
        if space["name"] == expected_plan["toilet_name"]
    )
    donor = next(
        space
        for space in updated_ctx["spaces"]
        if space["id"] == expected_plan["donor_room_id"]
    )

    assert _bbox(toilet["polygon"]) == _bbox(expected_plan["toilet_world_polygon_mm"])
    assert _bbox(donor["polygon"]) == _bbox(expected_plan["donor_polygon_after_world_mm"])


@pytest.mark.asyncio
@pytest.mark.skip(reason="insert_toilet apply is planning-assist only on this branch")
async def test_pipeline_apply_insert_toilet_adds_walls_and_door(tmp_path):
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ctx = extract_ifc_context(str(house_kr))
    output_path = str(tmp_path / "house-kr-insert-toilet-walls.ifc")
    pipeline = LLM2DPipeline(
        ifc_path=str(house_kr),
        ifc_context=ctx,
    )
    command = FloorNLPCommand(
        action="insert_toilet",
        target_room_name="욕실",
        target_floor=1,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    updated_ctx = extract_ifc_context(output_path)

    assert result["status"] == "applied"
    wall_segments = {
        tuple(sorted((tuple(wall["start"]), tuple(wall["end"]))))
        for wall in updated_ctx["walls"]
        if wall["floor"] == 1
    }
    expected_toilet_partition = tuple(sorted(((5910.0, 5990.0), (5910.0, 9700.0))))
    assert expected_toilet_partition in wall_segments

    applied_model = ifcopenshell.open(output_path)
    toilet_doors = [door for door in applied_model.by_type("IfcDoor") if door.Name == "Toilet Door"]
    assert len(toilet_doors) == 1
    toilet_windows = [
        window for window in applied_model.by_type("IfcWindow") if window.Name == "Toilet Window"
    ]
    assert len(toilet_windows) == 1
    plan = build_toilet_insertion_geometry_plan(ctx, floor=1)
    assert plan is not None
    north_wall = applied_model.by_guid("1bzfVsJqn8De5PukCrqylz")
    assert north_wall is not None
    north_wall_segment = executor_module._wall_segment_from_entity(north_wall)
    host_wall_plan = next(
        wall_plan
        for wall_plan in plan["donor_walls_to_reuse"]
        if wall_plan["wall_local_id"] == plan["window_plan"]["host_wall_local_id"]
    )
    base_offset = executor_module._offset_along_segment(
        north_wall_segment,
        tuple(host_wall_plan["start_mm"]),
    )
    target_segment = (
        executor_module._point_along_segment(
            north_wall_segment,
            base_offset + float(plan["window_plan"]["segment_along_wall_mm"][0]),
        ),
        executor_module._point_along_segment(
            north_wall_segment,
            base_offset + float(plan["window_plan"]["segment_along_wall_mm"][1]),
        ),
    )
    segment_windows: list[str] = []
    for rel in list(getattr(north_wall, "HasOpenings", []) or []):
        opening = getattr(rel, "RelatedOpeningElement", None)
        if opening is None:
            continue
        point = executor_module._opening_world_point(opening)
        fills = list(getattr(opening, "HasFillings", []) or [])
        filled = fills[0].RelatedBuildingElement if fills else None
        if filled is None or not filled.is_a("IfcWindow") or point is None:
            continue
        if executor_module._point_is_within_segment(
            point_mm=(float(point.x), float(point.y)),
            segment_mm=target_segment,
        ):
            segment_windows.append(filled.Name)
    assert segment_windows == ["Toilet Window"]
    return
    applied_ctx = extract_ifc_context(output_path)
    floor1_spaces = {space["name"]: space for space in applied_ctx["spaces"] if space["floor"] == 1}
    assert "서재" in floor1_spaces
    assert "화장실" in floor1_spaces
    floor1_doors = [door for door in applied_ctx["doors"] if door.get("floor") == 1]
    floor1_windows = [window for window in applied_ctx["windows"] if window.get("floor") == 1]
    assert any(
        (
            door.get("from_space_id") == plan["donor_room_id"]
            and door.get("to_space_id") == "3$f2p7VyLB7eox67SA_zKE"
        ) or (
            door.get("to_space_id") == plan["donor_room_id"]
            and door.get("from_space_id") == "3$f2p7VyLB7eox67SA_zKE"
        )
        for door in floor1_doors
    )
    assert any(
        window.get("adjacent_space_id") == plan["donor_room_id"]
        for window in floor1_windows
    )


@pytest.mark.asyncio
async def test_engine_parse_public_insert_toilet_sets_any_strategy_intent_v2():
    engine = FloorPlanEngine()
    result = await engine.parse_command("1층에 공용 화장실 만들어줘")

    assert result.action == "insert_toilet"
    assert result.user_intent == "shared_toilet_any_strategy"


@pytest.mark.asyncio
async def test_engine_parse_public_insert_toilet_sets_big_room_split_intent_v2():
    engine = FloorPlanEngine()
    user_text = "1층에 공용 화장실 만들어줘. 큰 방을 반으로 나눠서 만들어줘"
    result = await engine.parse_command(user_text)

    assert result.action == "insert_toilet"
    assert result.user_intent == "shared_toilet_split_big_room"




