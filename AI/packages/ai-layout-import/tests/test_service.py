from __future__ import annotations

import json
import math
from pathlib import Path
from uuid import UUID

import ifcopenshell
import pytest
from pydantic import ValidationError

import ai_layout_import.service as service_module
from ai_domain import LayoutImportV1, LayoutImportV2, parse_layout_import
from ai_layout_import import convert_layout_to_ifc


def _base_room(
    *,
    room_id: str = "room-living-01",
    name: str = "Living Room",
    room_type: str = "living",
    floor: int = 1,
    x: float = 5000.0,
    y: float = 4000.0,
    angle: float = 0.0,
    zone_id: str | None = None,
) -> dict[str, object]:
    room: dict[str, object] = {
        "id": room_id,
        "name": name,
        "type": room_type,
        "width": 4200,
        "height": 3800,
        "floor": floor,
        "x": x,
        "y": y,
        "angle": angle,
        "locked": False,
    }
    if zone_id is not None:
        room["zoneId"] = zone_id
    return room


def _make_request(
    *,
    schema_version: str = "v1",
    name: str = "sample-project",
    rooms: list[dict[str, object]],
    modeling_defaults: dict[str, object] | None = None,
    zones: list[dict[str, object]] | None = None,
    adjacency: list[dict[str, object]] | None = None,
    boundaries: list[dict[str, object]] | None = None,
    generation_options: dict[str, object] | None = None,
    generation_policy: dict[str, object] | None = None,
) -> LayoutImportV1 | LayoutImportV2:
    payload: dict[str, object] = {
        "schema_version": schema_version,
        "id": str(UUID("550e8400-e29b-41d4-a716-446655440000")),
        "name": name,
        "rooms": rooms,
    }
    if zones is not None:
        payload["zones"] = zones
    if adjacency is not None:
        payload["adjacency"] = adjacency
    if boundaries is not None:
        payload["boundaries"] = boundaries
    if modeling_defaults is not None:
        payload["modeling_defaults"] = modeling_defaults
    if generation_options is not None:
        payload["generation_options"] = generation_options
    if generation_policy is not None:
        payload["generation_policy"] = generation_policy
    return parse_layout_import(payload)


def _open_generated_ifc(
    tmp_path: Path,
    request: LayoutImportV1 | LayoutImportV2,
    filename: str,
) -> ifcopenshell.file:
    output = tmp_path / filename
    convert_layout_to_ifc(request, output)
    assert output.exists()
    return ifcopenshell.open(str(output))


def _property_sets_by_name(
    entity: ifcopenshell.entity_instance,
) -> dict[str, ifcopenshell.entity_instance]:
    psets: dict[str, ifcopenshell.entity_instance] = {}
    for rel in getattr(entity, "IsDefinedBy", []) or []:
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        pset = rel.RelatingPropertyDefinition
        if pset is not None and pset.is_a("IfcPropertySet"):
            psets[pset.Name] = pset
    return psets


def _properties_by_name(
    pset: ifcopenshell.entity_instance,
) -> dict[str, ifcopenshell.entity_instance]:
    return {prop.Name: prop for prop in pset.HasProperties or []}


def _unwrap_property_value(prop: ifcopenshell.entity_instance) -> str | bool:
    nominal = prop.NominalValue
    if hasattr(nominal, "wrappedValue"):
        return nominal.wrappedValue
    return nominal


def _body_item(entity: ifcopenshell.entity_instance) -> ifcopenshell.entity_instance:
    return entity.Representation.Representations[0].Items[0]


def _named_entities(
    model: ifcopenshell.file,
    ifc_type: str,
) -> dict[str, ifcopenshell.entity_instance]:
    return {entity.Name: entity for entity in model.by_type(ifc_type)}


def _containment_map_for_types(
    model: ifcopenshell.file,
    ifc_types: set[str],
) -> dict[str, str]:
    containment: dict[str, str] = {}
    for rel in model.by_type("IfcRelContainedInSpatialStructure"):
        for element in rel.RelatedElements or []:
            if element.is_a() in ifc_types:
                containment[element.Name] = rel.RelatingStructure.Name
    return containment


def _shared_walls(model: ifcopenshell.file) -> dict[str, ifcopenshell.entity_instance]:
    return {
        name: entity
        for name, entity in _named_entities(model, "IfcWall").items()
        if name.startswith("Shared Wall ")
    }


def _boundary_walls(model: ifcopenshell.file) -> dict[str, ifcopenshell.entity_instance]:
    return {
        name: entity
        for name, entity in _named_entities(model, "IfcWall").items()
        if name.startswith("Boundary Wall ")
    }


def _styled_items(
    item: ifcopenshell.entity_instance,
) -> list[ifcopenshell.entity_instance]:
    return list(getattr(item, "StyledByItem", []) or [])


def _style_hex(entity: ifcopenshell.entity_instance) -> str | None:
    body_item = _body_item(entity)
    for styled_item in _styled_items(body_item):
        for assignment in getattr(styled_item, "Styles", []):
            if not assignment.is_a("IfcPresentationStyleAssignment"):
                continue
            for style in getattr(assignment, "Styles", []):
                if not style.is_a("IfcSurfaceStyle"):
                    continue
                for element in getattr(style, "Styles", []):
                    if element.is_a("IfcSurfaceStyleShading"):
                        color = element.SurfaceColour
                        return _rgb_to_hex(color.Red, color.Green, color.Blue)
    return None


def _assert_no_style(entity: ifcopenshell.entity_instance) -> None:
    assert _style_hex(entity) is None


def _rgb_to_hex(red: float, green: float, blue: float) -> str:
    red_hex = round(red * 255)
    green_hex = round(green * 255)
    blue_hex = round(blue * 255)
    return f"#{red_hex:02X}{green_hex:02X}{blue_hex:02X}"


def test_apply_zone_style_skips_entities_without_representation() -> None:
    model = ifcopenshell.file(schema="IFC4")
    wall = model.create_entity("IfcWall")

    service_module._apply_zone_style(model, wall, "#FF5733", {})

    assert len(model.by_type("IfcStyledItem")) == 0


def test_convert_layout_to_ifc_creates_single_room_space(tmp_path: Path) -> None:
    request = _make_request(
        rooms=[_base_room()],
        modeling_defaults={"space_height_mm": 3000},
    )

    model = _open_generated_ifc(tmp_path, request, "single-room.ifc")

    assert len(model.by_type("IfcProject")) == 1
    assert len(model.by_type("IfcBuildingStorey")) == 1
    assert len(model.by_type("IfcSpace")) == 1

    space = model.by_type("IfcSpace")[0]
    body = space.Representation.Representations[0].Items[0]
    assert body.is_a("IfcExtrudedAreaSolid")
    assert body.Depth == pytest.approx(3.0)
    assert body.SweptArea.is_a("IfcRectangleProfileDef")
    assert body.SweptArea.XDim == pytest.approx(4.2)
    assert body.SweptArea.YDim == pytest.approx(3.8)
    assert len(model.by_type("IfcZone")) == 0
    assert len(model.by_type("IfcRelAssignsToGroup")) == 0

    room_pset = _property_sets_by_name(space)["Pset_BatangLayoutImportRoom"]
    room_props = _properties_by_name(room_pset)
    assert _unwrap_property_value(room_props["RoomId"]) == "room-living-01"
    assert _unwrap_property_value(room_props["RoomType"]) == "living"
    assert _unwrap_property_value(room_props["Locked"]) is False
    assert "ZoneId" not in room_props


def test_convert_layout_to_ifc_creates_zone_and_assigns_space(tmp_path: Path) -> None:
    request = _make_request(
        rooms=[_base_room(zone_id="zone-common")],
        zones=[
            {
                "id": "zone-common",
                "name": "Common",
                "color": "#FF5733",
            }
        ],
        modeling_defaults={"space_height_mm": 3000},
    )

    model = _open_generated_ifc(tmp_path, request, "zone-assignment.ifc")

    zones = model.by_type("IfcZone")
    spaces = model.by_type("IfcSpace")
    assert len(zones) == 1
    assert len(spaces) == 1
    assert zones[0].Name == "Common"

    group_assignments = model.by_type("IfcRelAssignsToGroup")
    assert len(group_assignments) == 1
    assert group_assignments[0].RelatingGroup == zones[0]
    assert list(group_assignments[0].RelatedObjects) == [spaces[0]]

    room_pset = _property_sets_by_name(spaces[0])["Pset_BatangLayoutImportRoom"]
    room_props = _properties_by_name(room_pset)
    assert _unwrap_property_value(room_props["RoomId"]) == "room-living-01"
    assert _unwrap_property_value(room_props["RoomType"]) == "living"
    assert _unwrap_property_value(room_props["Locked"]) is False
    assert _unwrap_property_value(room_props["ZoneId"]) == "zone-common"

    zone_pset = _property_sets_by_name(zones[0])["Pset_BatangLayoutImportZone"]
    zone_props = _properties_by_name(zone_pset)
    assert _unwrap_property_value(zone_props["ZoneId"]) == "zone-common"
    assert _unwrap_property_value(zone_props["ZoneColor"]) == "#FF5733"


def test_convert_layout_to_ifc_keeps_unzoned_room_without_group_assignment(
    tmp_path: Path,
) -> None:
    request = _make_request(
        rooms=[_base_room()],
        zones=[
            {
                "id": "zone-common",
                "name": "Common",
                "color": "#FF5733",
            }
        ],
        modeling_defaults={"space_height_mm": 3000},
    )

    model = _open_generated_ifc(tmp_path, request, "unzoned-room.ifc")

    assert len(model.by_type("IfcZone")) == 1
    assert len(model.by_type("IfcSpace")) == 1
    assert len(model.by_type("IfcRelAssignsToGroup")) == 0

    room_pset = _property_sets_by_name(model.by_type("IfcSpace")[0])[
        "Pset_BatangLayoutImportRoom"
    ]
    room_props = _properties_by_name(room_pset)
    assert "ZoneId" not in room_props


def test_convert_layout_to_ifc_creates_multi_floor_storeys_and_space_links(
    tmp_path: Path,
) -> None:
    request = _make_request(
        rooms=[
            _base_room(),
            _base_room(
                room_id="room-bed-01",
                name="Bedroom",
                room_type="bedroom",
                floor=2,
                x=9000.0,
                y=4000.0,
                angle=math.pi / 2,
            ),
        ],
        modeling_defaults={"space_height_mm": 3000},
    )

    model = _open_generated_ifc(tmp_path, request, "multi-floor.ifc")

    storeys = {storey.Name: storey for storey in model.by_type("IfcBuildingStorey")}
    assert len(storeys) == 2
    assert sorted(storeys) == ["1F", "2F"]
    assert storeys["1F"].Elevation == pytest.approx(0.0)
    assert storeys["2F"].Elevation == pytest.approx(3.0)
    second_storey_location = tuple(
        storeys["2F"].ObjectPlacement.RelativePlacement.Location.Coordinates
    )
    assert second_storey_location == pytest.approx((0.0, 0.0, 3.0))

    spaces = {space.Name: space for space in model.by_type("IfcSpace")}
    assert len(spaces) == 2
    bedroom_space = spaces["Bedroom"]
    bedroom_location = tuple(
        bedroom_space.ObjectPlacement.RelativePlacement.Location.Coordinates
    )
    assert bedroom_location == pytest.approx((9.0, 4.0, 0.0))
    bedroom_direction = tuple(
        bedroom_space.ObjectPlacement.RelativePlacement.RefDirection.DirectionRatios
    )
    assert bedroom_direction[0] == pytest.approx(0.0, abs=1e-9)
    assert bedroom_direction[1] == pytest.approx(1.0, abs=1e-9)

    containment_by_space = {
        rel.RelatedElements[0].Name: rel.RelatingStructure.Name
        for rel in model.by_type("IfcRelContainedInSpatialStructure")
    }
    assert containment_by_space == {"Living Room": "1F", "Bedroom": "2F"}


def test_convert_layout_to_ifc_uses_default_space_height_fallback(tmp_path: Path) -> None:
    request = _make_request(rooms=[_base_room()])

    model = _open_generated_ifc(tmp_path, request, "fallback.ifc")

    space = model.by_type("IfcSpace")[0]
    body = space.Representation.Representations[0].Items[0]
    assert body.Depth == pytest.approx(2.7)


def test_convert_layout_to_ifc_persists_project_and_storey_metadata_as_json(
    tmp_path: Path,
) -> None:
    request = _make_request(
        rooms=[
            _base_room(),
            _base_room(
                room_id="room-bed-01",
                name="Bedroom",
                room_type="bedroom",
                floor=2,
                x=9000.0,
                y=4000.0,
            ),
        ],
        adjacency=[
            {
                "from_room_id": "room-living-01",
                "to_room_id": "room-bed-01",
                "strength": 0.6,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [4200.0, 0.0],
                    [4200.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={"space_height_mm": 3000},
    )

    model = _open_generated_ifc(tmp_path, request, "metadata-json.ifc")

    project = model.by_type("IfcProject")[0]
    project_pset = _property_sets_by_name(project)["Pset_BatangLayoutImportProject"]
    project_props = _properties_by_name(project_pset)
    adjacency_json = _unwrap_property_value(project_props["AdjacencyJson"])
    assert isinstance(adjacency_json, str)
    assert json.loads(adjacency_json) == [
        {
            "from_room_id": "room-living-01",
            "to_room_id": "room-bed-01",
            "strength": 0.6,
        }
    ]

    storeys = {storey.Name: storey for storey in model.by_type("IfcBuildingStorey")}
    storey_1_pset = _property_sets_by_name(storeys["1F"])["Pset_BatangLayoutImportStorey"]
    storey_1_props = _properties_by_name(storey_1_pset)
    boundary_json = _unwrap_property_value(storey_1_props["BoundaryJson"])
    assert isinstance(boundary_json, str)
    assert json.loads(boundary_json) == {
        "floor": 1,
        "polygon": [
            [0.0, 0.0],
            [4200.0, 0.0],
            [4200.0, 3800.0],
            [0.0, 3800.0],
        ],
    }
    assert "Pset_BatangLayoutImportStorey" not in _property_sets_by_name(storeys["2F"])

    assert len(model.by_type("IfcWall")) == 0
    assert len(model.by_type("IfcSlab")) == 0
    assert len(model.by_type("IfcRoof")) == 0


def test_convert_layout_to_ifc_does_not_create_walls_slabs_or_roofs(tmp_path: Path) -> None:
    request = _make_request(
        rooms=[_base_room()],
        modeling_defaults={"space_height_mm": 3000},
    )

    model = _open_generated_ifc(tmp_path, request, "no-elements.ifc")

    assert len(model.by_type("IfcWall")) == 0
    assert len(model.by_type("IfcSlab")) == 0
    assert len(model.by_type("IfcRoof")) == 0


def test_convert_layout_to_ifc_generates_v2_boundary_elements_for_single_floor(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[_base_room(zone_id="zone-common", x=2100.0, y=1900.0)],
        zones=[
            {
                "id": "zone-common",
                "name": "Common",
                "color": "#FF5733",
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [4200.0, 0.0],
                    [4200.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-single-floor-elements.ifc")

    assert len(model.by_type("IfcSpace")) == 1
    assert len(model.by_type("IfcWall")) == 4
    assert len(model.by_type("IfcSlab")) == 1
    assert len(model.by_type("IfcRoof")) == 1

    walls = _named_entities(model, "IfcWall")
    wall = walls["Boundary Wall 1-1"]
    wall_body = _body_item(wall)
    assert wall_body.is_a("IfcExtrudedAreaSolid")
    assert wall_body.Depth == pytest.approx(3.0)
    assert wall_body.SweptArea.is_a("IfcRectangleProfileDef")
    assert wall_body.SweptArea.XDim == pytest.approx(4.2)
    assert wall_body.SweptArea.YDim == pytest.approx(0.2)
    assert _style_hex(wall) == "#FF5733"

    slab = _named_entities(model, "IfcSlab")["Boundary Slab 1"]
    slab_body = _body_item(slab)
    assert slab_body.is_a("IfcExtrudedAreaSolid")
    assert slab_body.Depth == pytest.approx(0.18)
    assert slab_body.SweptArea.is_a("IfcArbitraryClosedProfileDef")
    assert _style_hex(slab) == "#FF5733"

    roof = _named_entities(model, "IfcRoof")["Boundary Roof 1"]
    roof_body = _body_item(roof)
    assert roof_body.is_a("IfcExtrudedAreaSolid")
    assert roof_body.Depth == pytest.approx(0.4)
    assert roof_body.SweptArea.is_a("IfcArbitraryClosedProfileDef")
    assert _style_hex(roof) == "#FF5733"
    roof_location = tuple(roof.ObjectPlacement.RelativePlacement.Location.Coordinates)
    assert roof_location == pytest.approx((0.0, 0.0, 3.0))

    containment = _containment_map_for_types(model, {"IfcWall", "IfcSlab", "IfcRoof"})
    assert containment == {
        "Boundary Wall 1-1": "1F",
        "Boundary Wall 1-2": "1F",
        "Boundary Wall 1-3": "1F",
        "Boundary Wall 1-4": "1F",
        "Boundary Slab 1": "1F",
        "Boundary Roof 1": "1F",
    }


def test_convert_layout_to_ifc_generates_v2_boundary_elements_for_multiple_floors(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(floor=1),
            _base_room(
                room_id="room-bed-01",
                name="Bedroom",
                room_type="bedroom",
                floor=2,
                x=9000.0,
                y=4000.0,
            ),
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [4200.0, 0.0],
                    [4200.0, 3800.0],
                    [0.0, 3800.0],
                ],
            },
            {
                "floor": 2,
                "polygon": [
                    [0.0, 0.0],
                    [3600.0, 0.0],
                    [3600.0, 3200.0],
                    [0.0, 3200.0],
                ],
            },
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-multi-floor-elements.ifc")

    assert len(model.by_type("IfcWall")) == 8
    assert len(model.by_type("IfcSlab")) == 2
    assert len(model.by_type("IfcRoof")) == 1

    containment = _containment_map_for_types(model, {"IfcWall", "IfcSlab", "IfcRoof"})
    assert containment == {
        "Boundary Wall 1-1": "1F",
        "Boundary Wall 1-2": "1F",
        "Boundary Wall 1-3": "1F",
        "Boundary Wall 1-4": "1F",
        "Boundary Wall 2-1": "2F",
        "Boundary Wall 2-2": "2F",
        "Boundary Wall 2-3": "2F",
        "Boundary Wall 2-4": "2F",
        "Boundary Slab 1": "1F",
        "Boundary Slab 2": "2F",
        "Boundary Roof 2": "2F",
    }

    roof = _named_entities(model, "IfcRoof")["Boundary Roof 2"]
    roof_body = _body_item(roof)
    assert roof_body.Depth == pytest.approx(0.4)
    roof_location = tuple(roof.ObjectPlacement.RelativePlacement.Location.Coordinates)
    assert roof_location == pytest.approx((0.0, 0.0, 3.0))


def test_convert_layout_to_ifc_skips_walls_when_generate_walls_is_false(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [4200.0, 0.0],
                    [4200.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
        generation_options={
            "generate_spaces": True,
            "generate_walls": False,
            "generate_slabs": True,
            "generate_roof": True,
            "generate_openings": False,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-no-walls.ifc")

    assert len(model.by_type("IfcWall")) == 0
    assert len(model.by_type("IfcSlab")) == 1
    assert len(model.by_type("IfcRoof")) == 1


def test_convert_layout_to_ifc_skips_slabs_when_generate_slabs_is_false(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [4200.0, 0.0],
                    [4200.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
        generation_options={
            "generate_spaces": True,
            "generate_walls": True,
            "generate_slabs": False,
            "generate_roof": True,
            "generate_openings": False,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-no-slabs.ifc")

    assert len(model.by_type("IfcWall")) == 4
    assert len(model.by_type("IfcSlab")) == 0
    assert len(model.by_type("IfcRoof")) == 1


def test_convert_layout_to_ifc_skips_roof_when_generate_roof_is_false(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [4200.0, 0.0],
                    [4200.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
        generation_options={
            "generate_spaces": True,
            "generate_walls": True,
            "generate_slabs": True,
            "generate_roof": False,
            "generate_openings": False,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-no-roof.ifc")

    assert len(model.by_type("IfcWall")) == 4
    assert len(model.by_type("IfcSlab")) == 1
    assert len(model.by_type("IfcRoof")) == 0


def test_convert_layout_to_ifc_generates_shared_wall_for_same_floor_adjacency(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(
                room_id="room-left-01",
                name="Left Room",
                x=2100.0,
                y=1900.0,
                zone_id="zone-common",
            ),
            _base_room(
                room_id="room-right-01",
                name="Right Room",
                room_type="bedroom",
                x=6300.0,
                y=1900.0,
                zone_id="zone-common",
            ),
        ],
        zones=[
            {
                "id": "zone-common",
                "name": "Common",
                "color": "#FF5733",
            }
        ],
        adjacency=[
            {
                "from_room_id": "room-left-01",
                "to_room_id": "room-right-01",
                "strength": 0.8,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [8400.0, 0.0],
                    [8400.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-shared-wall.ifc")

    assert len(model.by_type("IfcWall")) == 5
    assert len(_boundary_walls(model)) == 4
    assert len(_shared_walls(model)) == 1
    shared_wall = _shared_walls(model)["Shared Wall 1-1"]
    shared_wall_body = _body_item(shared_wall)
    assert shared_wall_body.is_a("IfcExtrudedAreaSolid")
    assert shared_wall_body.Depth == pytest.approx(3.0)
    assert shared_wall_body.SweptArea.is_a("IfcRectangleProfileDef")
    assert shared_wall_body.SweptArea.XDim == pytest.approx(3.8)
    assert shared_wall_body.SweptArea.YDim == pytest.approx(0.2)
    assert _style_hex(shared_wall) == "#FF5733"

    containment = _containment_map_for_types(model, {"IfcWall", "IfcSlab", "IfcRoof"})
    assert sum(1 for name in containment if name.startswith("Boundary Wall ")) == 4
    assert sum(1 for name in containment if name.startswith("Shared Wall ")) == 1
    assert containment["Shared Wall 1-1"] == "1F"

    project = model.by_type("IfcProject")[0]
    project_pset = _property_sets_by_name(project)["Pset_BatangLayoutImportProject"]
    project_props = _properties_by_name(project_pset)
    adjacency_json = _unwrap_property_value(project_props["AdjacencyJson"])
    assert isinstance(adjacency_json, str)
    assert json.loads(adjacency_json) == [
        {
            "from_room_id": "room-left-01",
            "to_room_id": "room-right-01",
            "strength": 0.8,
        }
    ]
    assert _property_sets_by_name(shared_wall) == {}


def test_convert_layout_to_ifc_keeps_v2_boundary_elements_unstyled_without_zone(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [4200.0, 0.0],
                    [4200.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-unzoned-no-style.ifc")

    wall = _named_entities(model, "IfcWall")["Boundary Wall 1-1"]
    slab = _named_entities(model, "IfcSlab")["Boundary Slab 1"]
    roof = _named_entities(model, "IfcRoof")["Boundary Roof 1"]
    _assert_no_style(wall)
    _assert_no_style(slab)
    _assert_no_style(roof)


def test_convert_layout_to_ifc_keeps_mixed_zone_floor_plate_unstyled(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(
                room_id="room-left-01",
                name="Left Room",
                x=2100.0,
                y=1900.0,
                zone_id="zone-common",
            ),
            _base_room(
                room_id="room-right-01",
                name="Right Room",
                room_type="bedroom",
                x=6300.0,
                y=1900.0,
                zone_id="zone-private",
            ),
        ],
        zones=[
            {
                "id": "zone-common",
                "name": "Common",
                "color": "#FF5733",
            },
            {
                "id": "zone-private",
                "name": "Private",
                "color": "#335CFF",
            },
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [8400.0, 0.0],
                    [8400.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-mixed-zone-floor-plate.ifc")

    slab = _named_entities(model, "IfcSlab")["Boundary Slab 1"]
    roof = _named_entities(model, "IfcRoof")["Boundary Roof 1"]
    _assert_no_style(slab)
    _assert_no_style(roof)


def test_convert_layout_to_ifc_keeps_shared_wall_unstyled_when_zones_differ(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(
                room_id="room-left-01",
                name="Left Room",
                x=2100.0,
                y=1900.0,
                zone_id="zone-common",
            ),
            _base_room(
                room_id="room-right-01",
                name="Right Room",
                room_type="bedroom",
                x=6300.0,
                y=1900.0,
                zone_id="zone-private",
            ),
        ],
        zones=[
            {
                "id": "zone-common",
                "name": "Common",
                "color": "#FF5733",
            },
            {
                "id": "zone-private",
                "name": "Private",
                "color": "#335CFF",
            },
        ],
        adjacency=[
            {
                "from_room_id": "room-left-01",
                "to_room_id": "room-right-01",
                "strength": 0.8,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [8400.0, 0.0],
                    [8400.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-shared-wall-different-zone.ifc")

    shared_wall = _shared_walls(model)["Shared Wall 1-1"]
    _assert_no_style(shared_wall)


def test_convert_layout_to_ifc_dedupes_bidirectional_shared_wall_adjacency(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(
                room_id="room-left-01",
                name="Left Room",
                x=2100.0,
                y=1900.0,
            ),
            _base_room(
                room_id="room-right-01",
                name="Right Room",
                room_type="bedroom",
                x=6300.0,
                y=1900.0,
            ),
        ],
        adjacency=[
            {
                "from_room_id": "room-left-01",
                "to_room_id": "room-right-01",
                "strength": 0.8,
            },
            {
                "from_room_id": "room-right-01",
                "to_room_id": "room-left-01",
                "strength": 0.8,
            },
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [8400.0, 0.0],
                    [8400.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-shared-wall-dedupe.ifc")

    assert len(model.by_type("IfcWall")) == 5
    assert len(_boundary_walls(model)) == 4
    assert len(_shared_walls(model)) == 1
    assert "Shared Wall 1-1" in _shared_walls(model)


def test_convert_layout_to_ifc_rejects_v2_adjacency_without_shared_segment(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(room_id="room-left-01", name="Left Room", x=2100.0, y=1900.0),
            _base_room(room_id="room-right-01", name="Right Room", x=9000.0, y=1900.0),
        ],
        adjacency=[
            {
                "from_room_id": "room-left-01",
                "to_room_id": "room-right-01",
                "strength": 0.8,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [11100.0, 0.0],
                    [11100.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    with pytest.raises(ValueError, match="must resolve to an interior shared segment"):
        convert_layout_to_ifc(request, tmp_path / "missing-shared-segment.ifc")


def test_convert_layout_to_ifc_rejects_v2_cross_floor_shared_wall_adjacency(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(room_id="room-floor-1", name="First Floor Room", floor=1),
            _base_room(
                room_id="room-floor-2",
                name="Second Floor Room",
                floor=2,
                x=2100.0,
                y=1900.0,
            ),
        ],
        adjacency=[
            {
                "from_room_id": "room-floor-1",
                "to_room_id": "room-floor-2",
                "strength": 0.8,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [[0.0, 0.0], [4200.0, 0.0], [4200.0, 3800.0], [0.0, 3800.0]],
            },
            {
                "floor": 2,
                "polygon": [[0.0, 0.0], [4200.0, 0.0], [4200.0, 3800.0], [0.0, 3800.0]],
            },
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    with pytest.raises(ValueError, match="must be on the same floor"):
        convert_layout_to_ifc(request, tmp_path / "cross-floor-shared-wall.ifc")


def test_convert_layout_to_ifc_rejects_v2_rotated_room_shared_wall_adjacency(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(room_id="room-left-01", name="Left Room", x=2100.0, y=1900.0),
            _base_room(
                room_id="room-right-01",
                name="Right Room",
                room_type="bedroom",
                x=6300.0,
                y=1900.0,
                angle=math.pi / 4,
            ),
        ],
        adjacency=[
            {
                "from_room_id": "room-left-01",
                "to_room_id": "room-right-01",
                "strength": 0.8,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [8400.0, 0.0],
                    [8400.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    with pytest.raises(ValueError, match="does not support rotated room"):
        convert_layout_to_ifc(request, tmp_path / "rotated-shared-wall.ifc")


def test_convert_layout_to_ifc_rejects_v2_shared_wall_that_matches_exterior_boundary_subset(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            {
                "id": "room-wide",
                "name": "Wide Room",
                "type": "living",
                "width": 4200,
                "height": 3800,
                "floor": 1,
                "x": 2100.0,
                "y": 1900.0,
                "angle": 0.0,
                "locked": False,
            },
            {
                "id": "room-narrow",
                "name": "Narrow Room",
                "type": "bedroom",
                "width": 2000,
                "height": 3800,
                "floor": 1,
                "x": 1000.0,
                "y": 1900.0,
                "angle": 0.0,
                "locked": False,
            },
        ],
        adjacency=[
            {
                "from_room_id": "room-wide",
                "to_room_id": "room-narrow",
                "strength": 0.8,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [8400.0, 0.0],
                    [8400.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    with pytest.raises(ValueError, match="must resolve to an interior shared segment"):
        convert_layout_to_ifc(request, tmp_path / "shared-wall-on-exterior-subset.ifc")


def test_layout_import_request_rejects_unknown_zone_reference_before_conversion() -> None:
    with pytest.raises(ValidationError, match="zoneId must reference an existing zone"):
        _make_request(
            rooms=[_base_room(zone_id="missing-zone")],
        )


def test_convert_layout_to_ifc_rejects_v2_missing_wall_default(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            }
        ],
        modeling_defaults={
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    with pytest.raises(ValueError, match="wall_thickness_mm"):
        convert_layout_to_ifc(request, tmp_path / "missing-wall-default.ifc")


def test_convert_layout_to_ifc_rejects_v2_missing_slab_default(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            }
        ],
        modeling_defaults={
            "wall_thickness_mm": 200,
            "roof_height_mm": 400,
        },
    )

    with pytest.raises(ValueError, match="slab_thickness_mm"):
        convert_layout_to_ifc(request, tmp_path / "missing-slab-default.ifc")


def test_convert_layout_to_ifc_rejects_v2_missing_roof_default(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            }
        ],
        modeling_defaults={
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
        },
    )

    with pytest.raises(ValueError, match="roof_height_mm"):
        convert_layout_to_ifc(request, tmp_path / "missing-roof-default.ifc")


def test_convert_layout_to_ifc_rejects_v2_missing_floor_boundary_for_walls(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(floor=1),
            _base_room(
                room_id="room-bed-01",
                name="Bedroom",
                room_type="bedroom",
                floor=2,
                x=9000.0,
                y=4000.0,
            ),
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            }
        ],
        modeling_defaults={
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    with pytest.raises(ValueError, match="missing boundaries for walls on floors: 2"):
        convert_layout_to_ifc(request, tmp_path / "missing-wall-boundary.ifc")


def test_convert_layout_to_ifc_rejects_v2_missing_top_floor_boundary_for_roof(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(floor=1),
            _base_room(
                room_id="room-bed-01",
                name="Bedroom",
                room_type="bedroom",
                floor=2,
                x=9000.0,
                y=4000.0,
            ),
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            }
        ],
        modeling_defaults={
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
        generation_options={
            "generate_spaces": True,
            "generate_walls": False,
            "generate_slabs": False,
            "generate_roof": True,
            "generate_openings": False,
        },
    )

    with pytest.raises(ValueError, match="missing boundary for roof generation on floor 2"):
        convert_layout_to_ifc(request, tmp_path / "missing-roof-boundary.ifc")


def test_convert_layout_to_ifc_reuses_style_assignment_for_same_color(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[_base_room(zone_id="zone-common", x=2100.0, y=1900.0)],
        zones=[
            {
                "id": "zone-common",
                "name": "Common",
                "color": "#FF5733",
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [4200.0, 0.0],
                    [4200.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "style-reuse.ifc")

    # There are 4 boundary walls, 1 slab, and 1 roof = 6 entities sharing the same color.
    assert len(model.by_type("IfcWall")) == 4
    assert len(model.by_type("IfcSlab")) == 1
    assert len(model.by_type("IfcRoof")) == 1

    # But they should all share the exact same style assignment entity thanks to the cache.
    assignments = model.by_type("IfcPresentationStyleAssignment")
    assert len(assignments) == 1
    
    # Verify that at least one of these entities actually uses this assignment
    wall = _named_entities(model, "IfcWall")["Boundary Wall 1-1"]
    style_ids = [
        s.id() 
        for styled_item in _styled_items(_body_item(wall)) 
        for s in getattr(styled_item, "Styles", [])
    ]
    assert assignments[0].id() in style_ids
