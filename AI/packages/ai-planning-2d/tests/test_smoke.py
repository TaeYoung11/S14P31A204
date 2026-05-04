"""
ai-planning-2d 스모크 테스트
실행: uv run pytest packages/ai-planning-2d/tests/test_smoke.py -v
"""

import json

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.pset
import ifcopenshell.api.root
import pytest

from ai_planning_2d import (
    ActionType,
    CommandBatch,
    FloorNLPCommand,
    FloorPlanEngine,
    IFCCommand,
    IFCContext,
    extract_ifc_context,
    shape_to_rects,
    to_ifc_commands,
)
from ai_planning_2d.validator import validate_command_batch


@pytest.fixture
def ifc_ctx() -> IFCContext:
    return {
        "spaces": [
            {
                "id": "sp-001",
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
                "id": "sp-002",
                "name": "침실",
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
                "name": "침실",
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
                "name": "거실",
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
                "name": "침실",
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
                "name": "침실",
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


def test_add_room(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "주방",
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
    assert batch.commands[0].params["properties"]["name"] == "주방"


def test_add_room_unknown_floor(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "창고",
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
        target_room_name="거실",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert not batch.requires_clarification
    assert len(batch.commands) == 1
    assert batch.commands[0].target_id == "sp-001"


def test_remove_locked_room(locked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="거실",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, locked_ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "거실" in batch.clarification_question
    assert "잠겨 있어 삭제할 수 없습니다" in batch.clarification_question


def test_remove_room_duplicate_ask_floor(ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="침실",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None


def test_remove_locked_room_apply_to_all_blocked(partial_locked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="침실",
        apply_to_all=True,
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, partial_locked_ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "침실" in batch.clarification_question


def test_remove_room_not_found(ifc_ctx):
    cmd = FloorNLPCommand(
        action="remove_room",
        target_room_name="서재",
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, ifc_ctx)
    assert batch.requires_clarification


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


def test_resize_locked_room(locked_ifc_ctx):
    cmd = FloorNLPCommand(
        action="resize_room",
        target_room_name="거실",
        resize_shape="L",
        resize_width=6000,
        resize_height=8000,
        resize_rects=shape_to_rects("L", 6000, 8000),
        confidence=0.95,
    )
    batch = to_ifc_commands(cmd, locked_ifc_ctx)
    assert batch.requires_clarification
    assert batch.clarification_question is not None
    assert "거실" in batch.clarification_question
    assert "잠겨 있어 크기를 변경할 수 없습니다" in batch.clarification_question


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


def test_validate_too_small_dimension(ifc_ctx):
    cmd = FloorNLPCommand(
        action="add_room",
        new_room={
            "name": "창고",
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
            "name": "거실",
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
                        "name": "테스트",
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
                        "name": "테스트",
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
    result = await engine.parse_command("침실 4000x5000 추가해줘")
    assert result.action == "add_room"
    assert result.new_room is not None
    assert result.new_room.rects is not None


@pytest.mark.asyncio
async def test_engine_remove_room():
    engine = FloorPlanEngine()
    result = await engine.parse_command("거실 없애줘")
    assert result.action == "remove_room"
    assert result.target_room_name is not None


@pytest.mark.asyncio
async def test_engine_clarification():
    engine = FloorPlanEngine()
    result = await engine.parse_command("방 좀 바꿔줘")
    assert result.needs_clarification


@pytest.mark.asyncio
async def test_engine_relative_resize_with_context(ifc_ctx):
    engine = FloorPlanEngine()
    result = await engine.parse_command("침실을 조금 더 넓게 해줘", ifc_ctx)
    assert result.action == "resize_room"
    assert result.target_room_name == "침실"
    assert not result.needs_clarification
    assert result.resize_width is not None and result.resize_width > 3000
    assert result.resize_height is not None and result.resize_height > 4000


@pytest.mark.asyncio
async def test_engine_compound_command_clarification():
    engine = FloorPlanEngine()
    result = await engine.parse_command("거실 없애고 서재 추가해줘")
    assert result.needs_clarification


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
    ifcopenshell.api.aggregate.assign_object(ifc, products=[storey_a, storey_b], relating_object=building)

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
        opening = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcOpeningElement", name="Opening")
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
