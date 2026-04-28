from __future__ import annotations

import json
import math
from pathlib import Path
from uuid import UUID

import ifcopenshell
import pytest

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


def test_convert_layout_to_ifc_accepts_v2_request_and_remains_space_only(tmp_path: Path) -> None:
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

    model = _open_generated_ifc(tmp_path, request, "v2-space-only.ifc")

    assert len(model.by_type("IfcSpace")) == 1
    assert len(model.by_type("IfcWall")) == 0
    assert len(model.by_type("IfcSlab")) == 0
    assert len(model.by_type("IfcRoof")) == 0


def test_convert_layout_to_ifc_rejects_unknown_zone_reference(tmp_path: Path) -> None:
    request = _make_request(
        rooms=[_base_room(zone_id="missing-zone")],
    )

    with pytest.raises(ValueError, match="unknown zone reference"):
        convert_layout_to_ifc(request, tmp_path / "invalid-zone.ifc")


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
