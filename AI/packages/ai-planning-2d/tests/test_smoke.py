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

import ai_planning_2d.executor as executor_module
import ai_planning_2d.session_pipeline as session_pipeline_module
from ai_domain import IfcEditCommandPayload
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
        target_room_name="嫄곗떎",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 1
    assert batch.commands[0].target_id == "sp-001"


def test_remove_locked_room(locked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="嫄곗떎",
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
        target_room_name="嫄곗떎",
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
        target_room_name="嫄곗떎",
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

    assert context["windows"] == []


def test_ifc2x3_raises(tmp_path):
    bundle = {"ifc": ifcopenshell.file(schema="IFC2X3")}
    with pytest.raises(ValueError):
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

    assert preview["status"] == "failed_quality_check"
    assert preview["policy_plan"]["status"] == "planned"
    assert preview["validation_errors"]


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

    assert preview["status"] == "preview_ready"
    assert preview["policy_plan"]["status"] == "planned"
    assert preview["policy_plan"]["merge_target_space_id"] == "sp-left"
    assert preview["matched_count"] == 1
    assert preview["engine_request"]["mode"] == "preview"
    assert preview["engine_request"]["operations"][0]["type"] == "delete_elements"
    assert preview["ifc_edit_payload"]["engineRequest"]["mode"] == "preview"


@pytest.mark.asyncio
async def test_pipeline_preview_resize_room_needs_clarification(policy_ifc_ctx):
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
    assert preview["policy_plan"]["reason"] == "resize_direction_ambiguous"


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

    assert preview["status"] == "preview_ready"
    assert preview["policy_plan"]["direction"] == "west"


@pytest.mark.asyncio
async def test_pipeline_apply_returns_deferred_command_batch(policy_ifc_ctx):
    pipeline = LLM2DPipeline(ifc_context=policy_ifc_ctx)
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"])

    assert result["status"] == "apply_deferred"
    assert result["apply_mode"] == "shared_engine_request"
    assert result["command_batch"]["commands"][0]["action"] == "delete_space"
    assert result["policy_plan"]["status"] == "planned"
    assert result["engine_request"]["mode"] == "apply"
    assert result["ifc_edit_payload"]["engineRequest"]["mode"] == "apply"


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

    updated = ifcopenshell.open(output_path)
    assert result["status"] == "applied"
    with pytest.raises(RuntimeError):
        updated.by_guid(bundle["space_a"].GlobalId)


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

    updated = ifcopenshell.open(output_path)
    space = updated.by_guid(bundle["space_a"].GlobalId)
    body = space.Representation.Representations[0].Items[0]
    pset = next(
        rel.RelatingPropertyDefinition
        for rel in space.IsDefinedBy
        if rel.RelatingPropertyDefinition.Name == "Batang_SpaceDimensions"
    )

    assert result["status"] == "applied"
    assert body.SweptArea.XDim == pytest.approx(5.0)
    assert body.SweptArea.YDim == pytest.approx(5.0)
    assert tuple(space.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (-1.0, 0.0, 0.0)
    )
    props = {prop.Name: prop.NominalValue.wrappedValue for prop in pset.HasProperties}
    assert props["Width"] == 5000
    assert props["Height"] == 5000


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

    updated = ifcopenshell.open(output_path)
    assert result["status"] == "applied"
    with pytest.raises(RuntimeError):
        updated.by_guid(bundle["wall"].GlobalId)
    with pytest.raises(RuntimeError):
        updated.by_guid(bundle["window"].GlobalId)


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

    updated = ifcopenshell.open(output_path)
    wall = updated.by_guid(bundle["wall"].GlobalId)
    window = updated.by_guid(bundle["window"].GlobalId)
    assert result["status"] == "applied"
    assert tuple(wall.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (-1.0, 0.0, 0.0)
    )
    assert tuple(window.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (-1.0, 2.0, 0.9)
    )


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

    updated = ifcopenshell.open(output_path)
    target = updated.by_guid(bundle["space_a"].GlobalId)
    affected = updated.by_guid(bundle["space_b"].GlobalId)
    target_body = target.Representation.Representations[0].Items[0]
    affected_body = affected.Representation.Representations[0].Items[0]

    assert result["status"] == "applied"
    assert tuple(target.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (0.0, 0.0, 0.0)
    )
    assert target_body.SweptArea.XDim == pytest.approx(5.0)
    assert tuple(affected.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (5.0, 0.0, 0.0)
    )
    assert affected_body.SweptArea.XDim == pytest.approx(2.0)


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
    output_path = str(tmp_path / "pipeline-remove.ifc")

    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=pipeline_context)
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)

    updated = ifcopenshell.open(output_path)
    assert result["status"] == "applied"
    with pytest.raises(RuntimeError):
        updated.by_guid(bundle["space_a"].GlobalId)


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

    updated = ifcopenshell.open(output_path)
    created = updated.by_guid(result["created_space_id"])
    body = created.Representation.Representations[0].Items[0]
    pset = next(
        rel.RelatingPropertyDefinition
        for rel in created.IsDefinedBy
        if rel.RelatingPropertyDefinition.Name == "Batang_SpaceDimensions"
    )

    assert result["status"] == "applied"
    assert created.Name == "Kitchen"
    assert body.SweptArea.XDim == pytest.approx(3.2)
    assert body.SweptArea.YDim == pytest.approx(2.8)
    props = {prop.Name: prop.NominalValue.wrappedValue for prop in pset.HasProperties}
    assert props["Width"] == 3200
    assert props["Height"] == 2800
    assert props["SpaceType"] == "kitchen"


@pytest.mark.asyncio
async def test_pipeline_apply_add_room_writes_ifc(tmp_path):
    bundle = _make_minimal_ifc()
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "pipeline-add.ifc")
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
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)

    updated = ifcopenshell.open(output_path)
    created = updated.by_guid(result["created_space_id"])
    assert result["status"] == "applied"
    assert result["apply_mode"] == "shared_authoring"
    assert result["engine_request"]["operations"][0]["type"] == "create_element"
    assert created.Name == "Study"


@pytest.mark.asyncio
async def test_pipeline_apply_add_room_roundtrip_extracts_space(tmp_path):
    bundle = _make_minimal_ifc()
    input_path = _write_ifc(tmp_path, bundle["ifc"])
    output_path = str(tmp_path / "pipeline-add-roundtrip.ifc")
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
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    ctx = extract_ifc_context(output_path)

    assert result["status"] == "applied"
    guest = next(space for space in ctx["spaces"] if space["id"] == result["created_space_id"])
    assert guest["name"] == "Guest"
    assert guest["width"] == 3100
    assert guest["height"] == 2700


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

    assert preview["status"] == "unsupported"
    assert "feasible placement" in preview["summary"]

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

    assert preview["status"] == "preview_ready"
    geometry = preview["command_batch"]["commands"][0]["params"]["geometry"]
    assert geometry["location"][:2] != [0.0, 0.0]
    assert preview["engine_request"]["project_id"] == "proj-2d"
    assert preview["engine_request"]["base_revision_id"] == "rev-1"
    assert preview["engine_request"]["operations"][0]["type"] == "create_element"
    payload = IfcEditCommandPayload.model_validate(preview["ifc_edit_payload"])
    assert payload.engineRequest is not None
    assert payload.engineRequest.operations[0].type == "create_element"


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

    assert preview["status"] == "preview_ready"
    operation_types = [op["type"] for op in preview["engine_request"]["operations"]]
    assert operation_types == [
        "transform_elements",
        "transform_elements",
        "update_element_properties",
        "update_element_properties",
    ]
    assert preview["engine_request"]["operations"][0]["selector"]["global_ids"] == ["sp-center"]
    assert preview["engine_request"]["operations"][0]["parameters"]["translate_mm"] == {
        "x": -1000.0,
        "y": 0.0,
        "z": 0.0,
    }
    assert preview["engine_request"]["operations"][1]["selector"]["global_ids"] == [
        "wall-left",
        "door-left",
    ]
    assert preview["engine_request"]["operations"][1]["parameters"]["translate_mm"] == {
        "x": -1000.0,
        "y": 0.0,
        "z": 0.0,
    }
    assert preview["engine_request"]["operations"][3]["selector"]["global_ids"] == ["sp-left"]
    assert preview["engine_request"]["operations"][3]["parameters"]["dimensions_mm"] == {
        "width": 1000,
        "height": 5000,
    }
    payload = IfcEditCommandPayload.model_validate(preview["ifc_edit_payload"])
    assert payload.engineRequest is not None
    assert [op.type for op in payload.engineRequest.operations] == operation_types


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

    assert preview["status"] == "preview_ready"
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

    assert preview["status"] == "preview_ready"
    assert preview["policy_plan"]["merge_target_space_id"] is not None


@pytest.mark.asyncio
async def test_pipeline_apply_house_kr_remove_room_writes_ifc(tmp_path):
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    output_path = str(tmp_path / "house-kr-remove-room.ifc")
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
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    updated_ctx = extract_ifc_context(output_path)

    assert result["status"] == "applied"
    assert result["apply_mode"] == "shared_authoring"
    assert len(updated_ctx["spaces"]) == len(ctx["spaces"]) - 1


@pytest.mark.asyncio
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
    assert result["engine_request"]["operations"][0]["type"] == "delete_elements"
    payload = IfcEditCommandPayload.model_validate(result["ifc_edit_payload"])
    assert payload.engineRequest is not None
    assert payload.engineRequest.mode == "apply"


@pytest.mark.asyncio
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


def test_build_engine_request_remove_room_deduplicates_selector(policy_ifc_ctx):
    command = FloorNLPCommand(
        action="remove_room",
        target_room_name="center",
        confidence=0.95,
    )
    batch = to_ifc_commands(command, policy_ifc_ctx)
    engine_request = build_engine_request(
        mode="preview",
        request_id="req-1",
        project_id="proj-1",
        base_revision_id="rev-1",
        command=command,
        command_batch=batch,
        policy_plan={
            "status": "planned",
            "target_space_id": "sp-center",
            "remove_wall_ids": ["wall-left", "wall-left"],
            "remove_opening_ids": ["door-left", "door-left"],
        },
        ifc_context=policy_ifc_ctx,
    )

    selector_ids = engine_request.operations[0].selector["global_ids"]
    assert selector_ids == ["door-left", "wall-left", "sp-center"]
    assert engine_request.base_revision_id == "rev-1"


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

    with pytest.raises(ValueError, match="storey_id"):
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

    with pytest.raises(ValueError, match="feasible placement"):
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

    with pytest.raises(ValueError, match="no target global_ids"):
        build_engine_request(
            mode="preview",
            request_id="req-3",
            project_id="proj-3",
            command=command,
            command_batch=batch,
            policy_plan={},
            ifc_context=None,
        )






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

