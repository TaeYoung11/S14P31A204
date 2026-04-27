from __future__ import annotations

import math
from pathlib import Path
from uuid import UUID

import ifcopenshell
import pytest

from ai_domain import LayoutImportV1
from ai_layout_import import convert_layout_to_ifc


def _make_request(
    *,
    name: str = "sample-project",
    rooms: list[dict],
    modeling_defaults: dict | None = None,
    zones: list[dict] | None = None,
) -> LayoutImportV1:
    return LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": str(UUID("550e8400-e29b-41d4-a716-446655440000")),
            "name": name,
            "rooms": rooms,
            "zones": zones,
            "modeling_defaults": modeling_defaults,
        }
    )


def _open_generated_ifc(
    tmp_path: Path,
    request: LayoutImportV1,
    filename: str,
) -> ifcopenshell.file:
    output = tmp_path / filename
    convert_layout_to_ifc(request, output)
    assert output.exists()
    return ifcopenshell.open(str(output))


def test_convert_layout_to_ifc_creates_single_room_space(tmp_path: Path) -> None:
    request = _make_request(
        rooms=[
            {
                "id": "room-living-01",
                "name": "거실",
                "type": "living",
                "width": 4200,
                "height": 3800,
                "floor": 1,
                "x": 5000.0,
                "y": 4000.0,
                "angle": 0.0,
                "locked": False,
            }
        ],
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


def test_convert_layout_to_ifc_creates_multi_floor_storeys_and_space_links(
    tmp_path: Path,
) -> None:
    request = _make_request(
        rooms=[
            {
                "id": "room-living-01",
                "name": "거실",
                "type": "living",
                "width": 4200,
                "height": 3800,
                "floor": 1,
                "x": 5000.0,
                "y": 4000.0,
                "angle": 0.0,
                "locked": False,
            },
            {
                "id": "room-bed-01",
                "name": "안방",
                "type": "bedroom",
                "width": 3600,
                "height": 3200,
                "floor": 2,
                "x": 9000.0,
                "y": 4000.0,
                "angle": math.pi / 2,
                "locked": False,
            },
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
    bedroom_space = spaces["안방"]
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
    assert containment_by_space == {"거실": "1F", "안방": "2F"}


def test_convert_layout_to_ifc_uses_default_space_height_fallback(tmp_path: Path) -> None:
    request = _make_request(
        rooms=[
            {
                "id": "room-living-01",
                "name": "거실",
                "type": "living",
                "width": 4200,
                "height": 3800,
                "floor": 1,
                "x": 5000.0,
                "y": 4000.0,
                "angle": 0.0,
                "locked": False,
            }
        ]
    )

    model = _open_generated_ifc(tmp_path, request, "fallback.ifc")

    space = model.by_type("IfcSpace")[0]
    body = space.Representation.Representations[0].Items[0]
    assert body.Depth == pytest.approx(2.7)


def test_convert_layout_to_ifc_does_not_create_walls_slabs_or_roofs(tmp_path: Path) -> None:
    request = _make_request(
        rooms=[
            {
                "id": "room-living-01",
                "name": "거실",
                "type": "living",
                "width": 4200,
                "height": 3800,
                "floor": 1,
                "x": 5000.0,
                "y": 4000.0,
                "angle": 0.0,
                "locked": False,
            }
        ],
        modeling_defaults={"space_height_mm": 3000},
    )

    model = _open_generated_ifc(tmp_path, request, "no-elements.ifc")

    assert len(model.by_type("IfcWall")) == 0
    assert len(model.by_type("IfcSlab")) == 0
    assert len(model.by_type("IfcRoof")) == 0


def test_convert_layout_to_ifc_rejects_unknown_zone_reference(tmp_path: Path) -> None:
    request = _make_request(
        rooms=[
            {
                "id": "room-living-01",
                "name": "거실",
                "type": "living",
                "width": 4200,
                "height": 3800,
                "floor": 1,
                "x": 5000.0,
                "y": 4000.0,
                "angle": 0.0,
                "locked": False,
                "zoneId": "zone-common",
            }
        ]
    )

    with pytest.raises(ValueError, match="알 수 없는 zone 참조"):
        convert_layout_to_ifc(request, tmp_path / "invalid-zone.ifc")
