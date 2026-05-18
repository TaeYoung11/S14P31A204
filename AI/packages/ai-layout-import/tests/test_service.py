from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any
from uuid import UUID

import ifcopenshell
import pytest
from pydantic import ValidationError

import ai_layout_import.service as service_module
from ai_domain import LayoutImportV1, LayoutImportV2, LayoutImportV3, parse_layout_import
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
    openings: list[dict[str, object]] | None = None,
) -> LayoutImportV1 | LayoutImportV2 | LayoutImportV3:
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
    if openings is not None:
        payload["openings"] = openings
    return parse_layout_import(payload)


def _open_generated_ifc(
    tmp_path: Path,
    request: LayoutImportV1 | LayoutImportV2 | LayoutImportV3,
    filename: str,
) -> ifcopenshell.file:
    output = tmp_path / filename
    convert_layout_to_ifc(request, output)
    assert output.exists()
    return ifcopenshell.open(str(output))


def _convert_request(
    tmp_path: Path,
    request: LayoutImportV1 | LayoutImportV2 | LayoutImportV3,
    filename: str,
) -> tuple[service_module.LayoutImportNormalizationSummary, ifcopenshell.file]:
    output = tmp_path / filename
    summary = convert_layout_to_ifc(request, output)
    assert output.exists()
    return summary, ifcopenshell.open(str(output))


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


def _unwrap_property_value(prop: ifcopenshell.entity_instance) -> Any:
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


def _local_placement_location(
    entity: ifcopenshell.entity_instance,
) -> tuple[float, float, float]:
    return tuple(entity.ObjectPlacement.RelativePlacement.Location.Coordinates)


def _opening_dimensions(
    entity: ifcopenshell.entity_instance,
) -> tuple[float, float, float]:
    body = _body_item(entity)
    profile = body.SweptArea
    return profile.XDim, profile.YDim, body.Depth


def _voided_opening_for_wall(
    model: ifcopenshell.file,
    wall: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance:
    matches = [
        rel.RelatedOpeningElement
        for rel in model.by_type("IfcRelVoidsElement")
        if rel.RelatingBuildingElement == wall
    ]
    assert len(matches) == 1
    return matches[0]


def _filled_element_for_opening(
    model: ifcopenshell.file,
    opening: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance:
    matches = [
        rel.RelatedBuildingElement
        for rel in model.by_type("IfcRelFillsElement")
        if rel.RelatingOpeningElement == opening
    ]
    assert len(matches) == 1
    return matches[0]


def _assert_opening_graph_is_well_formed(model: ifcopenshell.file) -> None:
    openings = list(model.by_type("IfcOpeningElement"))
    fills = [
        entity
        for entity in [*model.by_type("IfcDoor"), *model.by_type("IfcWindow")]
    ]
    void_rels = list(model.by_type("IfcRelVoidsElement"))
    fill_rels = list(model.by_type("IfcRelFillsElement"))

    assert len(void_rels) == len(openings)
    assert len(fill_rels) == len(fills)

    for opening in openings:
        opening_void_rels = [
            rel for rel in void_rels if rel.RelatedOpeningElement == opening
        ]
        opening_fill_rels = [
            rel for rel in fill_rels if rel.RelatingOpeningElement == opening
        ]
        assert len(opening_void_rels) == 1
        assert len(opening_fill_rels) == 1
        assert opening_void_rels[0].RelatingBuildingElement.is_a("IfcWall")
        filled_entity = opening_fill_rels[0].RelatedBuildingElement
        assert filled_entity.is_a("IfcDoor") or filled_entity.is_a("IfcWindow")

    for filled_entity in fills:
        entity_fill_rels = [
            rel for rel in fill_rels if rel.RelatedBuildingElement == filled_entity
        ]
        assert len(entity_fill_rels) == 1
        assert entity_fill_rels[0].RelatingOpeningElement.is_a("IfcOpeningElement")


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


def _room_boundary_walls(model: ifcopenshell.file) -> dict[str, ifcopenshell.entity_instance]:
    return {
        name: entity
        for name, entity in _named_entities(model, "IfcWall").items()
        if name.startswith("Room Wall ")
    }


def _shared_room_boundary_walls(
    model: ifcopenshell.file,
) -> dict[str, ifcopenshell.entity_instance]:
    return {
        name: entity
        for name, entity in _named_entities(model, "IfcWall").items()
        if name.startswith("Shared Room Wall ")
    }


def _space_boundaries_for_wall(
    model: ifcopenshell.file,
    wall: ifcopenshell.entity_instance,
) -> list[ifcopenshell.entity_instance]:
    return [
        rel
        for rel in model.by_type("IfcRelSpaceBoundary")
        if rel.RelatedBuildingElement == wall
    ]


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


def test_convert_layout_to_ifc_writes_semantic_room_metadata(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            {
                **_base_room(
                    room_id="bathroom-1",
                    name="화장실",
                    room_type="bathroom",
                ),
                "source_bubble_id": "bubble-bathroom-1",
                "original_label": "화장실",
                "original_type": "화장실",
                "material": "tile",
                "color": "#AABBCC",
            }
        ],
        modeling_defaults={"space_height_mm": 3000},
    )

    model = _open_generated_ifc(tmp_path, request, "semantic-room.ifc")

    space = model.by_type("IfcSpace")[0]
    psets = _property_sets_by_name(space)
    assert "Pset_BatangRoom" in psets
    props = _properties_by_name(psets["Pset_BatangRoom"])
    assert _unwrap_property_value(props["SourceBubbleId"]) == "bubble-bathroom-1"
    assert _unwrap_property_value(props["OriginalLabel"]) == "화장실"
    assert _unwrap_property_value(props["Material"]) == "tile"
    assert "화장실" in _unwrap_property_value(props["SearchText"])
    aliases = json.loads(_unwrap_property_value(props["RoomTypeAliasesJson"]))
    assert "bathroom" in aliases
    assert "toilet" in aliases


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
    assert len(model.by_type("IfcWall")) == 8
    assert len(_boundary_walls(model)) == 4
    assert len(_room_boundary_walls(model)) == 4
    assert len(model.by_type("IfcRelSpaceBoundary")) == 4
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
        "Room Wall 1-room-living-01-east": "1F",
        "Room Wall 1-room-living-01-north": "1F",
        "Room Wall 1-room-living-01-south": "1F",
        "Room Wall 1-room-living-01-west": "1F",
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

    assert len(model.by_type("IfcWall")) == 16
    assert len(_boundary_walls(model)) == 8
    assert len(_room_boundary_walls(model)) == 8
    assert len(model.by_type("IfcRelSpaceBoundary")) == 8
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
        "Room Wall 1-room-living-01-east": "1F",
        "Room Wall 1-room-living-01-north": "1F",
        "Room Wall 1-room-living-01-south": "1F",
        "Room Wall 1-room-living-01-west": "1F",
        "Room Wall 2-room-bed-01-east": "2F",
        "Room Wall 2-room-bed-01-north": "2F",
        "Room Wall 2-room-bed-01-south": "2F",
        "Room Wall 2-room-bed-01-west": "2F",
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

    assert len(model.by_type("IfcWall")) == 8
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

    assert len(model.by_type("IfcWall")) == 8
    assert len(model.by_type("IfcSlab")) == 1
    assert len(model.by_type("IfcRoof")) == 0


def test_convert_layout_to_ifc_creates_room_boundary_space_boundaries(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(
                room_id="bathroom-id",
                name="화장실",
                room_type="bathroom",
                x=2100.0,
                y=1900.0,
            )
        ],
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-room-boundary-walls.ifc")

    assert len(model.by_type("IfcWall")) == 4
    assert len(model.by_type("IfcRelSpaceBoundary")) == 4
    west_wall = _named_entities(model, "IfcWall")["Room Wall 1-bathroom-id-west"]
    west_wall_pset = _property_sets_by_name(west_wall)["Pset_BatangWall"]
    west_wall_props = _properties_by_name(west_wall_pset)
    assert _unwrap_property_value(west_wall_props["WallKind"]) == "ROOM_BOUNDARY"
    assert _unwrap_property_value(west_wall_props["Source"]) == "room_perimeter"
    assert json.loads(_unwrap_property_value(west_wall_props["BoundedRoomIdsJson"])) == [
        "bathroom-id"
    ]
    assert json.loads(_unwrap_property_value(west_wall_props["BoundedRoomNamesJson"])) == [
        "화장실"
    ]
    assert json.loads(_unwrap_property_value(west_wall_props["BoundedRoomTypesJson"])) == [
        "bathroom"
    ]
    assert json.loads(_unwrap_property_value(west_wall_props["WallSideByRoomJson"])) == {
        "bathroom-id": "west"
    }

    space = _named_entities(model, "IfcSpace")["화장실"]
    boundaries = _space_boundaries_for_wall(model, west_wall)
    assert len(boundaries) == 1
    assert boundaries[0].RelatingSpace == space
    assert boundaries[0].PhysicalOrVirtualBoundary == "PHYSICAL"
    assert boundaries[0].InternalOrExternalBoundary == "EXTERNAL"


def test_convert_layout_to_ifc_creates_room_boundary_walls_for_fractional_coordinates(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(
                room_id="fractional-room-id",
                name="Fractional Bathroom",
                room_type="bathroom",
                x=15586.956521739124,
                y=-3360.869565217394,
            )
        ],
        generation_options={
            "generate_spaces": True,
            "generate_walls": True,
            "generate_slabs": False,
            "generate_roof": False,
            "generate_openings": False,
        },
        modeling_defaults={
            "space_height_mm": 2700,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-fractional-room-boundary-walls.ifc")

    assert len(model.by_type("IfcWall")) == 4
    assert len(_room_boundary_walls(model)) == 4
    assert len(model.by_type("IfcRelSpaceBoundary")) == 4
    west_wall = _named_entities(model, "IfcWall")["Room Wall 1-fractional-room-id-west"]
    west_wall_props = _properties_by_name(
        _property_sets_by_name(west_wall)["Pset_BatangWall"]
    )
    assert json.loads(_unwrap_property_value(west_wall_props["WallSideByRoomJson"])) == {
        "fractional-room-id": "west"
    }
    assert _space_boundaries_for_wall(model, west_wall)[0].RelatingSpace.Name == (
        "Fractional Bathroom"
    )


def test_convert_layout_to_ifc_dedupes_fractional_shared_room_boundary_wall(
    tmp_path: Path,
) -> None:
    left_room = _base_room(
        room_id="fractional-left-id",
        name="Fractional Left",
        x=15586.956521739124,
        y=-3360.869565217394,
    )
    right_room = _base_room(
        room_id="fractional-right-id",
        name="Fractional Right",
        room_type="living",
        x=19786.956521739124,
        y=-3360.869565217394,
    )
    request = _make_request(
        schema_version="v2",
        rooms=[left_room, right_room],
        adjacency=[
            {
                "from_room_id": "fractional-left-id",
                "to_room_id": "fractional-right-id",
                "strength": 0.8,
            }
        ],
        generation_options={
            "generate_spaces": True,
            "generate_walls": True,
            "generate_slabs": False,
            "generate_roof": False,
            "generate_openings": False,
        },
        modeling_defaults={
            "space_height_mm": 2700,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-fractional-shared-room-wall.ifc")

    assert len(_shared_room_boundary_walls(model)) == 1
    shared_wall = next(iter(_shared_room_boundary_walls(model).values()))
    assert len(_space_boundaries_for_wall(model, shared_wall)) == 2
    shared_wall_props = _properties_by_name(
        _property_sets_by_name(shared_wall)["Pset_BatangWall"]
    )
    assert _unwrap_property_value(shared_wall_props["WallKind"]) == "SHARED_ROOM_BOUNDARY"
    assert json.loads(_unwrap_property_value(shared_wall_props["WallSideByRoomJson"])) == {
        "fractional-left-id": "east",
        "fractional-right-id": "west",
    }


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

    assert len(model.by_type("IfcWall")) == 12
    assert len(_boundary_walls(model)) == 4
    assert len(_shared_walls(model)) == 1
    assert len(_room_boundary_walls(model)) == 6
    assert len(_shared_room_boundary_walls(model)) == 1
    assert len(model.by_type("IfcRelSpaceBoundary")) == 8
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
    shared_wall_psets = _property_sets_by_name(shared_wall)
    assert "Pset_WallCommon" in shared_wall_psets
    assert "Pset_BatangWall" in shared_wall_psets
    shared_room_wall = next(iter(_shared_room_boundary_walls(model).values()))
    shared_room_wall_pset = _property_sets_by_name(shared_room_wall)["Pset_BatangWall"]
    shared_room_wall_props = _properties_by_name(shared_room_wall_pset)
    assert _unwrap_property_value(shared_room_wall_props["WallKind"]) == "SHARED_ROOM_BOUNDARY"
    assert json.loads(_unwrap_property_value(shared_room_wall_props["BoundedRoomIdsJson"])) == [
        "room-left-01",
        "room-right-01",
    ]
    assert json.loads(_unwrap_property_value(shared_room_wall_props["BoundedRoomNamesJson"])) == [
        "Left Room",
        "Right Room",
    ]
    assert json.loads(_unwrap_property_value(shared_room_wall_props["BoundedRoomTypesJson"])) == [
        "living",
        "bedroom",
    ]


def test_convert_layout_to_ifc_generates_v2_inferred_door_for_shared_wall(
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
            ),
        ],
        adjacency=[
            {
                "id": "conn-door-1",
                "from_room_id": "room-left-01",
                "to_room_id": "room-right-01",
                "strength": 0.6,
                "intent": "circulation",
                "connection_strength": "normal",
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
        generation_options={
            "generate_spaces": True,
            "generate_walls": True,
            "generate_slabs": True,
            "generate_roof": True,
            "generate_openings": True,
        },
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-inferred-door.ifc")

    assert len(model.by_type("IfcOpeningElement")) == 1
    assert len(model.by_type("IfcDoor")) == 1
    opening = model.by_type("IfcOpeningElement")[0]
    pset = _property_sets_by_name(opening)["Pset_BatangOpening"]
    props = _properties_by_name(pset)
    assert _unwrap_property_value(props["OpeningType"]) == "door"
    assert _unwrap_property_value(props["SourceConnectionId"]) == "conn-door-1"
    host_wall = next(
        rel.RelatingBuildingElement
        for rel in model.by_type("IfcRelVoidsElement")
        if rel.RelatedOpeningElement == opening
    )
    assert host_wall.Name.startswith("Shared Room Wall ")
    assert len(_space_boundaries_for_wall(model, host_wall)) == 2


def test_convert_layout_to_ifc_generates_v2_open_passage_for_strong_connection(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(room_id="room-left-01", name="Left Room", x=2100.0, y=1900.0),
            _base_room(
                room_id="room-right-01",
                name="Right Room",
                room_type="kitchen",
                x=6300.0,
                y=1900.0,
            ),
        ],
        adjacency=[
            {
                "id": "conn-open-1",
                "from_room_id": "room-left-01",
                "to_room_id": "room-right-01",
                "strength": 1.0,
                "intent": "open_passage",
                "connection_strength": "strong",
            }
        ],
        generation_options={
            "generate_spaces": True,
            "generate_walls": True,
            "generate_slabs": False,
            "generate_roof": False,
            "generate_openings": True,
        },
        modeling_defaults={
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v2-inferred-open-passage.ifc")

    assert len(model.by_type("IfcOpeningElement")) == 1
    assert len(model.by_type("IfcDoor")) == 0
    opening = model.by_type("IfcOpeningElement")[0]
    pset = _property_sets_by_name(opening)["Pset_BatangOpening"]
    props = _properties_by_name(pset)
    assert _unwrap_property_value(props["OpeningType"]) == "open_passage"
    host_wall = next(
        rel.RelatingBuildingElement
        for rel in model.by_type("IfcRelVoidsElement")
        if rel.RelatedOpeningElement == opening
    )
    assert host_wall.Name.startswith("Shared Room Wall ")


def test_convert_layout_to_ifc_optimizes_strong_adjacency_before_shared_wall_generation(
    tmp_path: Path,
) -> None:
    left_room = _base_room(
        room_id="room-left-01",
        name="Left Room",
        x=2100.0,
        y=1900.0,
        zone_id="zone-common",
    )
    left_room["locked"] = True
    request = _make_request(
        schema_version="v2",
        rooms=[
            left_room,
            _base_room(
                room_id="room-right-01",
                name="Right Room",
                room_type="bedroom",
                x=9000.0,
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
                "strength": 1.0,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [12000.0, 0.0],
                    [12000.0, 3800.0],
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

    summary, model = _convert_request(tmp_path, request, "v2-optimized-shared-wall.ifc")

    spaces = {space.Name: space for space in model.by_type("IfcSpace")}
    right_room_location = _local_placement_location(spaces["Right Room"])
    assert right_room_location == pytest.approx((6.3, 1.9, 0.0))
    assert len(_shared_walls(model)) == 1
    assert summary.hasWarnings is True
    assert summary.to_report_warnings() == {
        "defaultsApplied": {},
        "degradedFeatures": [],
        "missingBoundaryFloors": [],
        "availableBoundaryFloors": [1],
        "roomFloors": [1],
        "topFloorBoundaryMissing": False,
        "openingsDisabledBecauseWallsDisabled": False,
        "layoutOptimizationApplied": True,
        "movedRoomCount": 1,
        "satisfiedAdjacencyCount": 1,
        "unsatisfiedAdjacencyCount": 0,
        "unsatisfiedAdjacencyRefs": [],
        "skippedAdjacencyReasons": [],
    }
    assert summary.layoutOptimization.hasWarnings is False
    assert summary.layoutOptimization.to_report_warnings() == {
        "layoutOptimizationApplied": True,
        "movedRoomCount": 1,
        "satisfiedAdjacencyCount": 1,
        "unsatisfiedAdjacencyCount": 0,
        "unsatisfiedAdjacencyRefs": [],
        "skippedAdjacencyReasons": [],
    }
    assert summary.layoutOptimization.movedRoomCount == 1
    assert summary.layoutOptimization.satisfiedAdjacencyCount == 1


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

    assert len(model.by_type("IfcWall")) == 12
    assert len(_boundary_walls(model)) == 4
    assert len(_shared_walls(model)) == 1
    assert len(_shared_room_boundary_walls(model)) == 1
    assert "Shared Wall 1-1" in _shared_walls(model)


def test_convert_layout_to_ifc_warns_for_v2_adjacency_without_shared_segment(
    tmp_path: Path,
) -> None:
    left_room = _base_room(room_id="room-left-01", name="Left Room", x=2100.0, y=1900.0)
    right_room = _base_room(room_id="room-right-01", name="Right Room", x=9000.0, y=1900.0)
    left_room["locked"] = True
    right_room["locked"] = True
    request = _make_request(
        schema_version="v2",
        rooms=[left_room, right_room],
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

    summary, model = _convert_request(tmp_path, request, "missing-shared-segment.ifc")

    assert len(_shared_walls(model)) == 0
    assert summary.hasWarnings is True
    assert summary.layoutOptimization.unsatisfiedAdjacencyRefs == [
        "room-left-01<->room-right-01"
    ]
    assert summary.layoutOptimization.skippedAdjacencyReasons == [
        {
            "adjacencyRef": "room-left-01<->room-right-01",
            "reason": "both_rooms_locked",
        }
    ]


def test_convert_layout_to_ifc_warns_for_v2_cross_floor_shared_wall_adjacency(
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

    summary, model = _convert_request(tmp_path, request, "cross-floor-shared-wall.ifc")

    assert len(_shared_walls(model)) == 0
    assert summary.hasWarnings is True
    assert summary.layoutOptimization.skippedAdjacencyReasons == [
        {"adjacencyRef": "room-floor-1<->room-floor-2", "reason": "cross_floor"}
    ]


def test_convert_layout_to_ifc_rejects_v2_rotated_room_when_generating_walls(
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

    output = tmp_path / "rotated-shared-wall.ifc"
    with pytest.raises(
        ValueError,
        match="room boundary wall generation does not support rotated rooms: room-right-01",
    ):
        convert_layout_to_ifc(request, output)

    assert not output.exists()


def test_convert_layout_to_ifc_rejects_v3_rotated_room_when_generating_walls(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v3",
        rooms=[
            _base_room(
                room_id="room-rotated-01",
                name="Rotated Room",
                angle=math.pi / 4,
            )
        ],
        generation_options={
            "generate_spaces": True,
            "generate_walls": True,
            "generate_slabs": False,
            "generate_roof": False,
            "generate_openings": False,
        },
    )

    output = tmp_path / "v3-rotated-room-walls.ifc"
    with pytest.raises(
        ValueError,
        match="room boundary wall generation does not support rotated rooms: room-rotated-01",
    ):
        convert_layout_to_ifc(request, output)

    assert not output.exists()


def test_convert_layout_to_ifc_allows_v2_rotated_room_when_walls_disabled(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[
            _base_room(
                room_id="room-rotated-01",
                name="Rotated Room",
                angle=math.pi / 4,
            )
        ],
        generation_options={
            "generate_spaces": True,
            "generate_walls": False,
            "generate_slabs": False,
            "generate_roof": False,
            "generate_openings": False,
        },
    )

    _, model = _convert_request(tmp_path, request, "v2-rotated-room-no-walls.ifc")

    assert len(model.by_type("IfcWall")) == 0
    spaces = {space.Name: space for space in model.by_type("IfcSpace")}
    rotated_room_direction = tuple(
        spaces["Rotated Room"].ObjectPlacement.RelativePlacement.RefDirection.DirectionRatios
    )
    assert rotated_room_direction[0] == pytest.approx(math.cos(math.pi / 4))
    assert rotated_room_direction[1] == pytest.approx(math.sin(math.pi / 4))


def test_convert_layout_to_ifc_skips_v2_shared_wall_that_matches_exterior_boundary_subset(
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
                "locked": True,
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
                "locked": True,
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

    summary, model = _convert_request(tmp_path, request, "shared-wall-on-exterior-subset.ifc")

    assert len(_shared_walls(model)) == 0
    assert summary.hasWarnings is True
    assert summary.layoutOptimization.unsatisfiedAdjacencyRefs == ["room-narrow<->room-wide"]


def test_layout_import_request_rejects_unknown_zone_reference_before_conversion() -> None:
    with pytest.raises(ValidationError, match="zoneId must reference an existing zone"):
        _make_request(
            rooms=[_base_room(zone_id="missing-zone")],
        )


def test_convert_layout_to_ifc_applies_default_wall_thickness_when_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log_calls: list[tuple[str, dict[str, object]]] = []

    def fake_info(event: str, **kwargs: object) -> None:
        log_calls.append((event, kwargs))

    monkeypatch.setattr(service_module._logger, "info", fake_info)

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

    summary, model = _convert_request(tmp_path, request, "missing-wall-default.ifc")

    wall = _named_entities(model, "IfcWall")["Boundary Wall 1-1"]
    wall_body = _body_item(wall)
    assert wall_body.SweptArea.YDim == pytest.approx(0.2)
    assert summary.defaultsApplied == {"wall_thickness_mm": 200}
    assert summary.degradedFeatures == []
    assert summary.hasWarnings is True
    assert log_calls == [
        (
            "layout_import_modeling_defaults_applied",
            {
                "source": "fe_payload_missing",
                "schemaVersion": "v2",
                "missingFields": ["wall_thickness_mm"],
                "appliedDefaults": {"wall_thickness_mm": 200},
            },
        )
    ]


def test_convert_layout_to_ifc_applies_default_slab_thickness_when_missing(tmp_path: Path) -> None:
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

    model = _open_generated_ifc(tmp_path, request, "missing-slab-default.ifc")

    slab = _named_entities(model, "IfcSlab")["Boundary Slab 1"]
    slab_body = _body_item(slab)
    assert slab_body.Depth == pytest.approx(0.15)


def test_convert_layout_to_ifc_applies_default_roof_height_when_missing(tmp_path: Path) -> None:
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

    model = _open_generated_ifc(tmp_path, request, "missing-roof-default.ifc")

    roof = _named_entities(model, "IfcRoof")["Boundary Roof 1"]
    roof_body = _body_item(roof)
    assert roof_body.Depth == pytest.approx(1.0)


def test_convert_layout_to_ifc_disables_boundary_driven_features_when_floor_boundary_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log_calls: list[tuple[str, dict[str, object]]] = []

    def fake_warning(event: str, **kwargs: object) -> None:
        log_calls.append((event, kwargs))

    monkeypatch.setattr(service_module._logger, "warning", fake_warning)

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

    summary, model = _convert_request(tmp_path, request, "missing-wall-boundary.ifc")

    assert len(model.by_type("IfcWall")) == 11
    assert len(model.by_type("IfcRelSpaceBoundary")) == 8
    assert len(model.by_type("IfcSlab")) == 0
    assert len(model.by_type("IfcRoof")) == 0
    assert len(model.by_type("IfcSpace")) == 2
    assert summary.defaultsApplied == {}
    assert summary.degradedFeatures == ["generate_slabs", "generate_roof"]
    assert summary.missingBoundaryFloors == [2]
    assert summary.availableBoundaryFloors == [1]
    assert summary.roomFloors == [1, 2]
    assert summary.topFloorBoundaryMissing is True
    assert summary.openingsDisabledBecauseWallsDisabled is False
    assert summary.hasWarnings is True
    assert log_calls == [
        (
            "layout_import_generation_options_degraded",
            {
                "source": "fe_payload_missing",
                "schemaVersion": "v2",
                "disabledFeatures": ["generate_slabs", "generate_roof"],
                "missingBoundaryFloors": [2],
                "availableBoundaryFloors": [1],
                "roomFloors": [1, 2],
                "topFloorBoundaryMissing": True,
                "openingsDisabledBecauseWallsDisabled": False,
            },
        )
    ]


def test_convert_layout_to_ifc_disables_roof_when_top_floor_boundary_missing(
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

    model = _open_generated_ifc(tmp_path, request, "missing-roof-boundary.ifc")

    assert len(model.by_type("IfcWall")) == 0
    assert len(model.by_type("IfcSlab")) == 0
    assert len(model.by_type("IfcRoof")) == 0
    assert len(model.by_type("IfcSpace")) == 2


def test_convert_layout_to_ifc_keeps_spaces_when_boundaries_are_missing(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v2",
        rooms=[_base_room()],
        modeling_defaults={
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "missing-boundaries-spaces-only.ifc")

    assert len(model.by_type("IfcSpace")) == 1
    assert len(model.by_type("IfcWall")) == 4
    assert len(_room_boundary_walls(model)) == 4
    assert len(model.by_type("IfcRelSpaceBoundary")) == 4
    assert len(model.by_type("IfcSlab")) == 0
    assert len(model.by_type("IfcRoof")) == 0


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

    # There are 4 site boundary walls, 4 room boundary walls, 1 slab, and 1 roof.
    assert len(model.by_type("IfcWall")) == 8
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


def test_convert_layout_to_ifc_generates_v3_explicit_door_and_window_entities(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v3",
        rooms=[
            _base_room(x=5000.0, y=4000.0),
            _base_room(
                room_id="room-bed-01",
                name="Bedroom",
                room_type="bedroom",
                x=9200.0,
                y=4000.0,
            ),
        ],
        adjacency=[
            {
                "from_room_id": "room-living-01",
                "to_room_id": "room-bed-01",
                "strength": 0.8,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [14000.0, 0.0],
                    [14000.0, 9000.0],
                    [0.0, 9000.0],
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
            "generate_roof": True,
            "generate_openings": True,
        },
        generation_policy={
            "boundary_wall_mode": "outer_boundary",
            "shared_wall_policy": "from_adjacency",
            "roof_shape": "flat",
            "opening_policy": "explicit_only",
        },
        openings=[
            {
                "id": "opening-door-01",
                "type": "door",
                "floor": 1,
                "host_wall_ref": "wall-room-room-living-01-room-bed-01",
                "x": 7100.0,
                "y": 4000.0,
                "width": 900.0,
                "height": 2100.0,
            },
            {
                "id": "opening-window-01",
                "type": "window",
                "floor": 1,
                "host_wall_ref": "wall-boundary-1-seg-2",
                "x": 14000.0,
                "y": 4000.0,
                "width": 1200.0,
                "height": 1200.0,
            },
        ],
    )

    summary, model = _convert_request(tmp_path, request, "v3-explicit-openings.ifc")

    assert summary.defaultsApplied == {}
    assert summary.degradedFeatures == []
    assert summary.hasWarnings is False
    assert len(model.by_type("IfcWall")) == 12
    assert len(model.by_type("IfcOpeningElement")) == 2
    assert len(model.by_type("IfcDoor")) == 1
    assert len(model.by_type("IfcWindow")) == 1
    assert len(model.by_type("IfcRelVoidsElement")) == 2
    assert len(model.by_type("IfcRelFillsElement")) == 2
    _assert_opening_graph_is_well_formed(model)

    shared_wall = next(iter(_shared_room_boundary_walls(model).values()))
    boundary_wall = _named_entities(model, "IfcWall")["Boundary Wall 1-2"]

    door_opening = _voided_opening_for_wall(model, shared_wall)
    window_opening = _voided_opening_for_wall(model, boundary_wall)
    assert door_opening.Name == "opening-door-01"
    assert window_opening.Name == "opening-window-01"

    door = _filled_element_for_opening(model, door_opening)
    window = _filled_element_for_opening(model, window_opening)
    assert door.is_a("IfcDoor")
    assert window.is_a("IfcWindow")
    assert door.Name == "Door opening-door-01"
    assert window.Name == "Window opening-window-01"

    assert _local_placement_location(door_opening) == pytest.approx((1.45, 0.0, 0.0))
    assert _local_placement_location(window_opening) == pytest.approx((3.4, 0.0, 0.9))
    assert _local_placement_location(door) == pytest.approx((0.0, 0.0, 0.0))
    assert _local_placement_location(window) == pytest.approx((0.0, 0.0, 0.0))

    assert _opening_dimensions(door_opening) == pytest.approx((0.9, 0.2, 2.1))
    assert _opening_dimensions(door) == pytest.approx((0.9, 0.2, 2.1))
    assert _opening_dimensions(window_opening) == pytest.approx((1.2, 0.2, 1.2))
    assert _opening_dimensions(window) == pytest.approx((1.2, 0.2, 1.2))

    containment = _containment_map_for_types(model, {"IfcDoor", "IfcWindow"})
    assert containment["Door opening-door-01"] == "1F"
    assert containment["Window opening-window-01"] == "1F"


def test_convert_layout_to_ifc_accepts_v3_reversed_shared_wall_ref(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v3",
        rooms=[
            _base_room(x=5000.0, y=4000.0),
            _base_room(
                room_id="room-bed-01",
                name="Bedroom",
                room_type="bedroom",
                x=9200.0,
                y=4000.0,
            ),
        ],
        adjacency=[
            {
                "from_room_id": "room-living-01",
                "to_room_id": "room-bed-01",
                "strength": 0.8,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [14000.0, 0.0],
                    [14000.0, 9000.0],
                    [0.0, 9000.0],
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
            "generate_roof": True,
            "generate_openings": True,
        },
        openings=[
            {
                "id": "opening-door-01",
                "type": "door",
                "floor": 1,
                "host_wall_ref": "wall-room-room-bed-01-room-living-01",
                "x": 7100.0,
                "y": 4000.0,
                "width": 900.0,
                "height": 2100.0,
            }
        ],
    )

    model = _open_generated_ifc(tmp_path, request, "v3-reversed-shared-ref.ifc")

    assert len(model.by_type("IfcWall")) == 12
    assert len(model.by_type("IfcOpeningElement")) == 1
    assert len(model.by_type("IfcDoor")) == 1
    assert len(model.by_type("IfcRelVoidsElement")) == 1
    assert len(model.by_type("IfcRelFillsElement")) == 1
    _assert_opening_graph_is_well_formed(model)

    shared_wall = next(iter(_shared_room_boundary_walls(model).values()))
    door_opening = _voided_opening_for_wall(model, shared_wall)
    door = _filled_element_for_opening(model, door_opening)
    assert door_opening.Name == "opening-door-01"
    assert door.is_a("IfcDoor")
    assert door.Name == "Door opening-door-01"


def test_convert_layout_to_ifc_accepts_v3_room_side_wall_ref(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v3",
        rooms=[_base_room(x=5000.0, y=4000.0)],
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
            "generate_roof": False,
            "generate_openings": True,
        },
        openings=[
            {
                "id": "opening-door-west",
                "type": "door",
                "floor": 1,
                "host_wall_ref": "wall-room-room-living-01-west",
                "x": 2900.0,
                "y": 4000.0,
                "width": 900.0,
                "height": 2100.0,
            }
        ],
    )

    model = _open_generated_ifc(tmp_path, request, "v3-room-side-ref.ifc")

    west_wall = _named_entities(model, "IfcWall")["Room Wall 1-room-living-01-west"]
    opening = _voided_opening_for_wall(model, west_wall)
    door = _filled_element_for_opening(model, opening)
    assert opening.Name == "opening-door-west"
    assert door.Name == "Door opening-door-west"
    assert len(_space_boundaries_for_wall(model, west_wall)) == 1


def test_convert_layout_to_ifc_keeps_v3_without_explicit_openings_free_of_opening_entities(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v3",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [10000.0, 0.0],
                    [10000.0, 8000.0],
                    [0.0, 8000.0],
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
            "generate_roof": True,
            "generate_openings": True,
        },
    )

    model = _open_generated_ifc(tmp_path, request, "v3-no-explicit-openings.ifc")

    assert len(model.by_type("IfcOpeningElement")) == 0
    assert len(model.by_type("IfcDoor")) == 0
    assert len(model.by_type("IfcWindow")) == 0


def test_convert_layout_to_ifc_disables_openings_when_walls_are_degraded_off(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log_calls: list[tuple[str, dict[str, object]]] = []

    def fake_warning(event: str, **kwargs: object) -> None:
        log_calls.append((event, kwargs))

    monkeypatch.setattr(service_module._logger, "warning", fake_warning)

    request = _make_request(
        schema_version="v3",
        rooms=[_base_room()],
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
            "generate_roof": True,
            "generate_openings": True,
        },
        openings=[
            {
                "id": "opening-door-01",
                "type": "door",
                "floor": 1,
                "host_wall_ref": "wall-boundary-1-seg-1",
                "x": 2100.0,
                "y": 0.0,
                "width": 900.0,
                "height": 2100.0,
            }
        ],
    )

    summary, model = _convert_request(
        tmp_path,
        request,
        "v3-openings-disabled-without-boundaries.ifc",
    )

    assert len(model.by_type("IfcSpace")) == 1
    assert len(model.by_type("IfcWall")) == 4
    assert len(model.by_type("IfcRelSpaceBoundary")) == 4
    assert len(model.by_type("IfcOpeningElement")) == 0
    assert len(model.by_type("IfcDoor")) == 0
    assert len(model.by_type("IfcWindow")) == 0
    assert summary.defaultsApplied == {}
    assert summary.degradedFeatures == [
        "generate_slabs",
        "generate_roof",
        "generate_openings",
    ]
    assert summary.missingBoundaryFloors == [1]
    assert summary.availableBoundaryFloors == []
    assert summary.roomFloors == [1]
    assert summary.topFloorBoundaryMissing is True
    assert summary.openingsDisabledBecauseWallsDisabled is False
    assert summary.hasWarnings is True
    assert log_calls == [
        (
            "layout_import_generation_options_degraded",
            {
                "source": "fe_payload_missing",
                "schemaVersion": "v3",
                "disabledFeatures": [
                    "generate_slabs",
                    "generate_roof",
                    "generate_openings",
                ],
                "missingBoundaryFloors": [1],
                "availableBoundaryFloors": [],
                "roomFloors": [1],
                "topFloorBoundaryMissing": True,
                "openingsDisabledBecauseWallsDisabled": False,
            },
        )
    ]


def test_convert_layout_to_ifc_rejects_v3_opening_with_unknown_boundary_ref(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v3",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [10000.0, 0.0],
                    [10000.0, 8000.0],
                    [0.0, 8000.0],
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
            "generate_roof": True,
            "generate_openings": True,
        },
        openings=[
            {
                "id": "opening-window-01",
                "type": "window",
                "floor": 1,
                "host_wall_ref": "wall-boundary-1-seg-99",
                "x": 10000.0,
                "y": 4000.0,
                "width": 1200.0,
                "height": 1200.0,
            }
        ],
    )

    with pytest.raises(ValueError, match="must reference a generated host wall"):
        convert_layout_to_ifc(request, tmp_path / "invalid-boundary-opening.ifc")


def test_convert_layout_to_ifc_rejects_v3_opening_with_unknown_shared_wall_ref(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v3",
        rooms=[
            _base_room(x=5000.0, y=4000.0),
            _base_room(
                room_id="room-bed-01",
                name="Bedroom",
                room_type="bedroom",
                x=9200.0,
                y=4000.0,
            ),
        ],
        adjacency=[
            {
                "from_room_id": "room-living-01",
                "to_room_id": "room-bed-01",
                "strength": 0.8,
            }
        ],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [14000.0, 0.0],
                    [14000.0, 9000.0],
                    [0.0, 9000.0],
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
            "generate_roof": True,
            "generate_openings": True,
        },
        openings=[
            {
                "id": "opening-door-01",
                "type": "door",
                "floor": 1,
                "host_wall_ref": "wall-room-room-living-01-room-missing-01",
                "x": 7100.0,
                "y": 4000.0,
                "width": 900.0,
                "height": 2100.0,
            }
        ],
    )

    with pytest.raises(ValueError, match="must reference a generated host wall"):
        convert_layout_to_ifc(request, tmp_path / "invalid-shared-opening.ifc")


def test_convert_layout_to_ifc_rejects_v3_opening_off_the_host_wall(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v3",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [10000.0, 0.0],
                    [10000.0, 8000.0],
                    [0.0, 8000.0],
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
            "generate_roof": True,
            "generate_openings": True,
        },
        openings=[
            {
                "id": "opening-window-01",
                "type": "window",
                "floor": 1,
                "host_wall_ref": "wall-boundary-1-seg-2",
                "x": 9900.0,
                "y": 4000.0,
                "width": 1200.0,
                "height": 1200.0,
            }
        ],
    )

    with pytest.raises(ValueError, match="center must lie on the host wall segment"):
        convert_layout_to_ifc(request, tmp_path / "off-wall-opening.ifc")


def test_convert_layout_to_ifc_rejects_v3_opening_width_that_exceeds_host_wall(
    tmp_path: Path,
) -> None:
    request = _make_request(
        schema_version="v3",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [10000.0, 0.0],
                    [10000.0, 8000.0],
                    [0.0, 8000.0],
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
            "generate_roof": True,
            "generate_openings": True,
        },
        openings=[
            {
                "id": "opening-window-01",
                "type": "window",
                "floor": 1,
                "host_wall_ref": "wall-boundary-1-seg-2",
                "x": 10000.0,
                "y": 4000.0,
                "width": 9000.0,
                "height": 1200.0,
            }
        ],
    )

    with pytest.raises(ValueError, match="width must fit within the host wall segment"):
        convert_layout_to_ifc(request, tmp_path / "oversized-opening.ifc")


def test_convert_layout_to_ifc_rejects_v3_opening_floor_mismatch(tmp_path: Path) -> None:
    request = _make_request(
        schema_version="v3",
        rooms=[_base_room()],
        boundaries=[
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [10000.0, 0.0],
                    [10000.0, 8000.0],
                    [0.0, 8000.0],
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
            "generate_roof": True,
            "generate_openings": True,
        },
        openings=[
            {
                "id": "opening-window-01",
                "type": "window",
                "floor": 2,
                "host_wall_ref": "wall-boundary-1-seg-2",
                "x": 10000.0,
                "y": 4000.0,
                "width": 1200.0,
                "height": 1200.0,
            }
        ],
    )

    with pytest.raises(ValueError, match="opening.floor must match the referenced host wall floor"):
        convert_layout_to_ifc(request, tmp_path / "floor-mismatch-opening.ifc")
