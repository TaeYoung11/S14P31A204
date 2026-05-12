"""Tests for IfcDoor/IfcWindow host wall opening relationships."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.root
import ifcopenshell.util.element
import ifcopenshell.util.placement
import pytest

import ai_authoring.operations  # noqa: F401
from ai_authoring.engine_3d import (
    create_door_with_opening,
    create_wall,
    create_window_with_opening,
    create_window_with_template_reuse,
    delete_element,
    find_host_wall,
)
from ai_authoring.operations.registry import get


def _make_model():
    model = ifcopenshell.file(schema="IFC4")
    project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="Project")
    site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="1F")
    storey.Elevation = 0.0

    model_ctx = model.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Model",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        ),
    )
    body_ctx = model.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="Body",
        ContextType="Model",
        ParentContext=model_ctx,
        TargetView="MODEL_VIEW",
    )
    project.RepresentationContexts = [model_ctx]

    ifcopenshell.api.aggregate.assign_object(model, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(model, products=[building], relating_object=site)
    ifcopenshell.api.aggregate.assign_object(model, products=[storey], relating_object=building)
    return model, storey, body_ctx


def _single_body_item(element):
    body = next(
        rep
        for rep in element.Representation.Representations
        if rep.RepresentationIdentifier == "Body"
    )
    return body.Items[0]


def test_find_host_wall_by_global_id():
    model, storey, _ = _make_model()
    wall = create_wall(
        model, storey, length_mm=3000, width_mm=200, height_mm=2400, x_mm=0, y_mm=0, z_mm=0
    )
    assert wall is not None

    found = find_host_wall(model, wall.GlobalId, 0.0, 0.0, 0.0)
    assert found is not None
    assert found.GlobalId == wall.GlobalId


def test_find_host_wall_by_proximity():
    model, storey, _ = _make_model()
    wall = create_wall(
        model, storey, length_mm=3000, width_mm=200, height_mm=2400, x_mm=100, y_mm=100, z_mm=0
    )
    assert wall is not None

    found = find_host_wall(model, None, 100.0, 100.0, 0.0)
    assert found is not None
    assert found.GlobalId == wall.GlobalId


def test_find_host_wall_by_proximity_uses_storey_relative_placement():
    model, storey, _ = _make_model()
    storey.ObjectPlacement = model.create_entity(
        "IfcLocalPlacement",
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity(
                "IfcCartesianPoint",
                Coordinates=(5000.0, 2000.0, 0.0),
            ),
        ),
    )
    wall = create_wall(
        model, storey, length_mm=3000, width_mm=200, height_mm=2400, x_mm=100, y_mm=100, z_mm=0
    )
    assert wall is not None

    found = find_host_wall(model, None, 5100.0, 2100.0, 0.0)
    assert found is not None
    assert found.GlobalId == wall.GlobalId


def test_find_host_wall_invalid_global_id_does_not_fall_back_to_proximity():
    model, storey, _ = _make_model()
    create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)

    found = find_host_wall(model, "0000000000000000000000", 0.0, 0.0, 0.0)
    assert found is None


def test_find_host_wall_returns_none_when_too_far():
    model, storey, _ = _make_model()
    create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)

    found = find_host_wall(model, None, 99999.0, 99999.0, 0.0)
    assert found is None


def test_door_creates_opening_and_relations_with_host_wall():
    model, storey, body_ctx = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    assert wall is not None

    door = create_door_with_opening(
        model,
        storey,
        length_mm=900,
        width_mm=200,
        height_mm=2100,
        x_mm=500,
        y_mm=0,
        z_mm=0,
        host_wall=wall,
        sill_height_mm=0.0,
    )

    assert door is not None
    assert door.is_a("IfcDoor")
    openings = model.by_type("IfcOpeningElement")
    assert len(openings) == 1
    opening = openings[0]
    assert opening.Representation is not None
    assert opening.Representation.Representations[0].ContextOfItems == body_ctx

    assert len(list(wall.HasOpenings)) == 1
    rel_void = list(wall.HasOpenings)[0]
    assert rel_void.is_a("IfcRelVoidsElement")
    assert rel_void.RelatedOpeningElement == opening

    assert len(list(opening.HasFillings)) == 1
    rel_fill = list(opening.HasFillings)[0]
    assert rel_fill.is_a("IfcRelFillsElement")
    assert rel_fill.RelatedBuildingElement == door
    assert list(door.FillsVoids)[0] == rel_fill
    assert _single_body_item(wall).is_a("IfcBooleanResult")


def test_door_without_host_wall_is_rejected():
    model, storey, _ = _make_model()

    door = create_door_with_opening(model, storey, host_wall=None)

    assert door is None
    assert len(model.by_type("IfcDoor")) == 0
    assert len(model.by_type("IfcOpeningElement")) == 0
    assert len(model.by_type("IfcRelVoidsElement")) == 0
    assert len(model.by_type("IfcRelFillsElement")) == 0


def test_window_creates_opening_and_relations_with_host_wall():
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    assert wall is not None

    window = create_window_with_opening(
        model,
        storey,
        length_mm=1200,
        width_mm=200,
        height_mm=1200,
        x_mm=1000,
        y_mm=0,
        z_mm=0,
        host_wall=wall,
        sill_height_mm=900.0,
    )

    assert window is not None
    assert window.is_a("IfcWindow")
    openings = model.by_type("IfcOpeningElement")
    assert len(openings) == 1
    opening = openings[0]
    assert list(wall.HasOpenings)[0].RelatedOpeningElement == opening
    assert list(opening.HasFillings)[0].RelatedBuildingElement == window
    assert list(window.FillsVoids)[0].RelatingOpeningElement == opening


def test_window_without_host_wall_is_rejected():
    model, storey, _ = _make_model()

    window = create_window_with_opening(model, storey, host_wall=None)

    assert window is None
    assert len(model.by_type("IfcWindow")) == 0
    assert len(model.by_type("IfcOpeningElement")) == 0


def test_window_sill_height_applied_to_opening_placement():
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    assert wall is not None

    window = create_window_with_opening(model, storey, host_wall=wall, sill_height_mm=900.0)
    assert window is not None

    opening = model.by_type("IfcOpeningElement")[0]
    opening_z = float(opening.ObjectPlacement.RelativePlacement.Location.Coordinates[2])
    window_z = float(window.ObjectPlacement.RelativePlacement.Location.Coordinates[2])
    assert opening_z == pytest.approx(900.0)
    assert window_z == pytest.approx(0.0)


def test_window_template_reuse_restores_deleted_house_kr_window_position():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    model = ifcopenshell.open(str(house_kr))
    target_window_id = "1srAI$R4T8ihLXSNHmUSET"

    template_window = model.by_guid(target_window_id)
    assert template_window is not None
    template_opening = list(template_window.FillsVoids)[0].RelatingOpeningElement
    host_wall = list(template_opening.VoidsElements)[0].RelatingBuildingElement
    storey = ifcopenshell.util.element.get_container(template_window)
    target_matrix = ifcopenshell.util.placement.get_local_placement(
        template_opening.ObjectPlacement
    )
    target_x_mm = float(target_matrix[0, 3]) * 1000.0
    target_y_mm = float(target_matrix[1, 3]) * 1000.0
    target_z_mm = float(target_matrix[2, 3]) * 1000.0
    target_width_mm = int(round(float(template_window.OverallWidth) * 1000.0))
    target_height_mm = int(round(float(template_window.OverallHeight) * 1000.0))
    expected_opening_origin = [target_x_mm, target_y_mm, target_z_mm]
    template_body = template_window.Representation.Representations[0].Items[0].MappingSource
    template_styled_count = sum(
        len(getattr(item, "StyledByItem", None) or [])
        for item in template_body.MappedRepresentation.Items
    )

    delete_element(model, template_window)
    recreated = create_window_with_template_reuse(
        model,
        storey,
        length_mm=target_width_mm,
        width_mm=200,
        height_mm=target_height_mm,
        x_mm=target_x_mm,
        y_mm=target_y_mm,
        z_mm=0.0,
        host_wall=host_wall,
        sill_height_mm=target_z_mm,
    )

    assert recreated is not None
    recreated_opening = list(recreated.FillsVoids)[0].RelatingOpeningElement
    recreated_matrix = ifcopenshell.util.placement.get_local_placement(
        recreated_opening.ObjectPlacement
    )
    recreated_origin = [
        float(recreated_matrix[0, 3]) * 1000.0,
        float(recreated_matrix[1, 3]) * 1000.0,
        float(recreated_matrix[2, 3]) * 1000.0,
    ]
    assert recreated_origin == pytest.approx(expected_opening_origin, abs=1.0)
    recreated_body = recreated.Representation.Representations[0].Items[0].MappingSource
    recreated_styled_count = sum(
        len(getattr(item, "StyledByItem", None) or [])
        for item in recreated_body.MappedRepresentation.Items
    )
    assert recreated_styled_count == template_styled_count


def test_transform_handler_skips_host_relative_window_when_requested():
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    assert wall is not None
    window = create_window_with_opening(
        model,
        storey,
        length_mm=1200,
        width_mm=200,
        height_mm=1200,
        x_mm=1000,
        y_mm=0,
        z_mm=0,
        host_wall=wall,
        sill_height_mm=900.0,
    )
    assert window is not None
    original_coords = tuple(window.ObjectPlacement.RelativePlacement.Location.Coordinates)

    transform_handler = get("transform_elements")
    moved = transform_handler.execute(
        model,
        None,
        {
            "translate_mm": {"x": 1000.0, "y": 0.0, "z": 0.0},
            "skip_if_host_relative": True,
        },
        {"global_ids": [window.GlobalId]},
    )

    assert moved == []
    assert tuple(window.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        original_coords
    )


def test_create_element_handler_door_with_host_wall():
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    assert wall is not None

    handler = get("create_element")
    door = handler.execute(
        model,
        storey,
        {
            "element_type": "IfcDoor",
            "storey": "1F",
            "coordinate_space": "PROJECT_ABSOLUTE_MM",
            "start_mm": {"x": 500.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"length": 900, "width": 200, "height": 2100},
            "host_wall_global_id": wall.GlobalId,
            "sill_height_mm": 0.0,
        },
    )

    assert door is not None
    assert door.is_a("IfcDoor")
    assert len(model.by_type("IfcOpeningElement")) == 1
    assert len(list(wall.HasOpenings)) == 1


def test_create_element_handler_window_uses_default_sill_height():
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    assert wall is not None

    handler = get("create_element")
    window = handler.execute(
        model,
        storey,
        {
            "element_type": "IfcWindow",
            "storey": "1F",
            "coordinate_space": "PROJECT_ABSOLUTE_MM",
            "start_mm": {"x": 1000.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"length": 1200, "width": 200, "height": 1200},
            "host_wall_global_id": wall.GlobalId,
        },
    )

    assert window is not None
    assert window.is_a("IfcWindow")
    opening = model.by_type("IfcOpeningElement")[0]
    z_coord = float(opening.ObjectPlacement.RelativePlacement.Location.Coordinates[2])
    assert z_coord == pytest.approx(900.0)


def test_create_element_handler_window_template_reuse_restores_house_kr_window_position():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    model = ifcopenshell.open(str(house_kr))
    target_window_id = "1srAI$R4T8ihLXSNHmUSET"

    template_window = model.by_guid(target_window_id)
    assert template_window is not None
    template_opening = list(template_window.FillsVoids)[0].RelatingOpeningElement
    host_wall = list(template_opening.VoidsElements)[0].RelatingBuildingElement
    storey = ifcopenshell.util.element.get_container(template_window)
    target_matrix = ifcopenshell.util.placement.get_local_placement(
        template_opening.ObjectPlacement
    )
    target_x_mm = float(target_matrix[0, 3]) * 1000.0
    target_y_mm = float(target_matrix[1, 3]) * 1000.0
    target_z_mm = float(target_matrix[2, 3]) * 1000.0
    target_width_mm = int(round(float(template_window.OverallWidth) * 1000.0))
    target_height_mm = int(round(float(template_window.OverallHeight) * 1000.0))
    expected_opening_origin = [target_x_mm, target_y_mm, target_z_mm]
    template_body = template_window.Representation.Representations[0].Items[0].MappingSource
    template_styled_count = sum(
        len(getattr(item, "StyledByItem", None) or [])
        for item in template_body.MappedRepresentation.Items
    )

    delete_element(model, template_window)
    handler = get("create_element")
    created = handler.execute(
        model,
        storey,
        {
            "element_type": "IfcWindow",
            "storey": getattr(storey, "Name", "1F"),
            "coordinate_space": "PROJECT_ABSOLUTE_MM",
            "start_mm": {"x": target_x_mm, "y": target_y_mm, "z": 0.0},
            "dimensions_mm": {"length": target_width_mm, "width": 200, "height": target_height_mm},
            "host_wall_global_id": host_wall.GlobalId,
            "require_template_reuse": True,
            "sill_height_mm": target_z_mm,
        },
    )

    assert created is not None
    created_opening = list(created.FillsVoids)[0].RelatingOpeningElement
    created_matrix = ifcopenshell.util.placement.get_local_placement(
        created_opening.ObjectPlacement
    )
    created_origin = [
        float(created_matrix[0, 3]) * 1000.0,
        float(created_matrix[1, 3]) * 1000.0,
        float(created_matrix[2, 3]) * 1000.0,
    ]
    assert created_origin == pytest.approx(expected_opening_origin, abs=1.0)
    created_body = created.Representation.Representations[0].Items[0].MappingSource
    created_styled_count = sum(
        len(getattr(item, "StyledByItem", None) or [])
        for item in created_body.MappedRepresentation.Items
    )
    assert created_styled_count == template_styled_count


def test_create_element_handler_rejects_door_without_host_wall():
    model, storey, _ = _make_model()
    handler = get("create_element")

    door = handler.execute(
        model,
        storey,
        {
            "element_type": "IfcDoor",
            "storey": "1F",
            "coordinate_space": "PROJECT_ABSOLUTE_MM",
            "start_mm": {"x": 500.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"length": 900, "width": 200, "height": 2100},
        },
    )

    assert door is None
    assert len(model.by_type("IfcDoor")) == 0
    assert len(model.by_type("IfcOpeningElement")) == 0


def test_ifc_persists_relations_after_save(tmp_path):
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    door = create_door_with_opening(model, storey, host_wall=wall)
    assert door is not None

    out = tmp_path / "out.ifc"
    model.write(str(out))

    reloaded = ifcopenshell.open(str(out))
    reloaded_wall = reloaded.by_type("IfcWall")[0]
    opening = list(reloaded_wall.HasOpenings)[0].RelatedOpeningElement
    filling = list(opening.HasFillings)[0].RelatedBuildingElement

    assert opening.is_a("IfcOpeningElement")
    assert opening.Representation is not None
    assert filling.is_a("IfcDoor")


def test_delete_window_removes_only_its_opening_boolean():
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=4000, width_mm=200, height_mm=2400)
    first = create_window_with_opening(model, storey, host_wall=wall, x_mm=900)
    second = create_window_with_opening(model, storey, host_wall=wall, x_mm=2500)
    assert first is not None
    assert second is not None

    assert delete_element(model, first)
    assert len(model.by_type("IfcWindow")) == 1
    assert len(model.by_type("IfcOpeningElement")) == 1
    assert wall.Representation.Representations[0].Items[0].is_a("IfcBooleanResult")

    assert delete_element(model, second)
    assert len(model.by_type("IfcWindow")) == 0
    assert len(model.by_type("IfcOpeningElement")) == 0
    assert not wall.Representation.Representations[0].Items[0].is_a("IfcBooleanResult")


def test_delete_wall_void_handler_deletes_parametric_door_pair():
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    door = create_door_with_opening(model, storey, host_wall=wall)
    assert door is not None
    door_id = door.GlobalId

    handler = get("delete_wall_void")
    deleted = handler.execute(
        model,
        None,
        {"expected_kind": "door", "allowed_host_body_class": "parametric"},
        {"global_ids": [door_id]},
    )

    assert deleted == [door_id]
    assert len(model.by_type("IfcDoor")) == 0
    assert len(model.by_type("IfcOpeningElement")) == 0
    assert len(model.by_type("IfcRelVoidsElement")) == 0
    assert len(model.by_type("IfcRelFillsElement")) == 0


def test_delete_wall_void_handler_deletes_parametric_window_pair():
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    window = create_window_with_opening(model, storey, host_wall=wall)
    assert window is not None
    window_id = window.GlobalId

    handler = get("delete_wall_void")
    deleted = handler.execute(
        model,
        None,
        {"expected_kind": "window", "allowed_host_body_class": "parametric"},
        {"global_ids": [window_id]},
    )

    assert deleted == [window_id]
    assert len(model.by_type("IfcWindow")) == 0
    assert len(model.by_type("IfcOpeningElement")) == 0
    assert len(model.by_type("IfcRelVoidsElement")) == 0
    assert len(model.by_type("IfcRelFillsElement")) == 0


def test_delete_wall_void_handler_deletes_parametric_bare_opening():
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    opening = ifcopenshell.api.root.create_entity(
        model, ifc_class="IfcOpeningElement", name="Bare Opening"
    )
    opening.ObjectPlacement = model.create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=wall.ObjectPlacement,
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(1.0, 0.0, 1.0)),
        ),
    )
    model.create_entity(
        "IfcRelVoidsElement",
        GlobalId=ifcopenshell.guid.new(),
        RelatingBuildingElement=wall,
        RelatedOpeningElement=opening,
    )
    opening_id = opening.GlobalId

    handler = get("delete_wall_void")
    deleted = handler.execute(
        model,
        None,
        {"expected_kind": "opening", "allowed_host_body_class": "parametric"},
        {"global_ids": [opening_id]},
    )

    assert deleted == [opening_id]
    assert len(model.by_type("IfcOpeningElement")) == 0
    assert len(model.by_type("IfcRelVoidsElement")) == 0


def test_delete_wall_void_handler_rejects_filled_opening_target():
    model, storey, _ = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    window = create_window_with_opening(model, storey, host_wall=wall)
    assert window is not None
    opening = list(window.FillsVoids)[0].RelatingOpeningElement

    handler = get("delete_wall_void")
    with pytest.raises(ValueError, match="bare IfcOpeningElement"):
        handler.execute(
            model,
            None,
            {"expected_kind": "opening", "allowed_host_body_class": "parametric"},
            {"global_ids": [opening.GlobalId]},
        )


def test_delete_wall_void_handler_rejects_bcr_hosted_house_kr_window():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    model = ifcopenshell.open(str(house_kr))
    target_gid = "1zOBw0Gej5Wf0QAJfHnOc0"

    handler = get("delete_wall_void")
    with pytest.raises(ValueError, match="parametric host walls"):
        handler.execute(
            model,
            None,
            {"expected_kind": "window", "allowed_host_body_class": "parametric"},
            {"global_ids": [target_gid]},
        )

    assert model.by_guid(target_gid) is not None


def test_engine_request_v2_schema_accepts_door_host_fields():
    schema_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "schemas"
        / "engine_request.v2.schema.json"
    )
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    properties = schema["$defs"]["createElementParameters"]["properties"]

    assert "host_wall_global_id" in properties
    assert "sill_height_mm" in properties
    assert "opening_offset_mm" in properties


_AI_ROOT = Path(__file__).resolve().parents[3]
_SAMPLE_IFC = _AI_ROOT / "tests" / "sample_shinchan.ifc"
_OUT_DIR = Path.home() / "Downloads" / "batang_history"

_SCENARIOS = [
    ("1F", "1F_Anbang_South", True, 3500, 6000, 400, "north", 900, 2100, 0,
     "#8B4513", "Anbang door"),
    ("1F", "1F_Living_South", True, 7500, 3000, 400, "north", 900, 2100, 0,
     "#A0522D", "Living south door"),
    ("1F", "1F_Hall_South", True, 11000, 4000, 400, "north", 1000, 2100, 0,
     "#5C3317", "Entrance door"),
    ("1F", "1F_In_Entrance", True, 11500, 6000, 400, "north", 800, 2100, 0,
     "#6B4226", "Entrance-living door"),
    ("1F", "1F_North_All", False, 3000, 9800, 400, "north", 1200, 1200, 900,
     "#ADD8E6", "North window 1"),
    ("1F", "1F_North_All", False, 6000, 9800, 400, "north", 1200, 1200, 900,
     "#ADD8E6", "North window 2"),
    ("1F", "1F_North_All", False, 9000, 9800, 400, "north", 1200, 1200, 900,
     "#ADD8E6", "North window 3"),
    ("1F", "1F_Hall_East", False, 12800, 5500, 400, "east", 1000, 1000, 900,
     "#87CEEB", "Hall east window"),
    ("1F", "1F_Anbang_West", False, 2000, 7500, 400, "west", 1200, 1200, 900,
     "#B0E0E6", "Anbang west window"),
    ("1F", "1F_Living_East", False, 9800, 3500, 400, "east", 1000, 1000, 900,
     "#87CEEB", "Living east window"),
    ("2F", "2F_Ext_S", True, 9500, 5000, 3600, "north", 1200, 2100, 0,
     "#CD853F", "2F balcony door"),
    ("2F", "2F_In_Room_Div", True, 8500, 7000, 3600, "north", 900, 2100, 0,
     "#A0522D", "2F room divider door"),
    ("2F", "2F_Ext_W", False, 7000, 6500, 3600, "west", 1200, 1200, 900,
     "#ADD8E6", "2F west window 1"),
    ("2F", "2F_Ext_W", False, 7000, 8500, 3600, "west", 1200, 1200, 900,
     "#ADD8E6", "2F west window 2"),
    ("2F", "2F_Ext_N", False, 9000, 9800, 3600, "north", 1500, 1200, 900,
     "#87CEEB", "2F north window"),
    ("2F", "2F_Ext_E", False, 12800, 7000, 3600, "east", 1200, 1200, 900,
     "#B0E0E6", "2F east window"),
]


def _build_door_window_sample(ifc_out: Path, log_out: Path) -> dict[str, int]:
    """Create a visual door/window opening sample from sample_shinchan.ifc."""
    model = ifcopenshell.open(str(_SAMPLE_IFC))
    wall_map = {wall.Name: wall for wall in model.by_type("IfcWall")}
    storey_map = {storey.Name: storey for storey in model.by_type("IfcBuildingStorey")}

    lines: list[str] = [f"=== door/window opening sample [{datetime.now().isoformat()}] ===", ""]
    ok, fail = 0, 0
    before = {
        "doors": len(model.by_type("IfcDoor")),
        "windows": len(model.by_type("IfcWindow")),
        "openings": len(model.by_type("IfcOpeningElement")),
        "voids": len(model.by_type("IfcRelVoidsElement")),
        "fills": len(model.by_type("IfcRelFillsElement")),
    }

    for scenario in _SCENARIOS:
        (
            storey_name,
            wall_name,
            is_door,
            x,
            y,
            z,
            direction,
            width,
            height,
            sill,
            color,
            label,
        ) = scenario
        storey = storey_map.get(storey_name)
        host_wall = wall_map.get(wall_name)
        if storey is None or host_wall is None:
            msg = f"[SKIP] {label}: storey={storey_name!r}, wall={wall_name!r}"
            print(msg)
            lines.append(msg)
            fail += 1
            continue

        create_fn = create_door_with_opening if is_door else create_window_with_opening
        element = create_fn(
            model,
            storey,
            length_mm=width,
            width_mm=200,
            height_mm=height,
            x_mm=x,
            y_mm=y,
            z_mm=z,
            direction=direction,
            color=color,
            host_wall=host_wall,
            sill_height_mm=sill,
        )
        kind = "door" if is_door else "window"
        if element is None:
            msg = f"[FAIL] {label} ({kind}) host={host_wall.Name}"
            fail += 1
        else:
            msg = f"[OK] {label} ({kind}) host={host_wall.Name} gid={element.GlobalId}"
            ok += 1
        print(msg)
        lines.append(msg)

    ifc_out.parent.mkdir(parents=True, exist_ok=True)
    log_out.parent.mkdir(parents=True, exist_ok=True)
    model.write(str(ifc_out))

    after = {
        "doors": len(model.by_type("IfcDoor")),
        "windows": len(model.by_type("IfcWindow")),
        "openings": len(model.by_type("IfcOpeningElement")),
        "voids": len(model.by_type("IfcRelVoidsElement")),
        "fills": len(model.by_type("IfcRelFillsElement")),
    }
    stats = {
        key: after[key] - before[key]
        for key in ("doors", "windows", "openings", "voids", "fills")
    }
    stats["failed"] = fail
    lines.extend(
        [
            "",
            f"[done] ok={ok}, failed={fail}",
            f"[ifc] {ifc_out}",
            f"[log] {log_out}",
            f"[stats] {stats}",
        ]
    )
    log_out.write_text("\n".join(lines), encoding="utf-8")
    return stats


@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample_shinchan.ifc not found")
def test_e2e_door_window_on_shinchan_ifc(tmp_path):
    stats = _build_door_window_sample(
        ifc_out=tmp_path / "shinchan_with_openings.ifc",
        log_out=tmp_path / "shinchan_with_openings.log",
    )

    assert stats["failed"] == 0
    assert stats["doors"] == 6
    assert stats["windows"] == 10
    assert stats["openings"] == 16
    assert stats["voids"] == 16
    assert stats["fills"] == 16


if __name__ == "__main__":
    if not _SAMPLE_IFC.exists():
        print(f"[ERROR] sample IFC not found: {_SAMPLE_IFC}")
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        _build_door_window_sample(
            ifc_out=_OUT_DIR / f"shinchan_openings_{timestamp}.ifc",
            log_out=_OUT_DIR / f"shinchan_openings_{timestamp}.log",
        )
