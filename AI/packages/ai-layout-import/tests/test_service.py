from __future__ import annotations

import math
from pathlib import Path

import ifcopenshell
import pytest

from ai_domain import LayoutImportV1
from ai_layout_import import convert_layout_to_ifc


def test_convert_layout_to_ifc_creates_spaces_with_geometry_and_storey_links(
    tmp_path: Path,
) -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
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
            "modeling_defaults": {"space_height_mm": 3000},
        }
    )
    output = tmp_path / "model.ifc"

    convert_layout_to_ifc(request, output)

    assert output.exists()

    model = ifcopenshell.open(str(output))

    assert model.schema == "IFC4"
    assert len(model.by_type("IfcProject")) == 1
    assert len(model.by_type("IfcSite")) == 1
    assert len(model.by_type("IfcBuilding")) == 1
    assert len(model.by_type("IfcBuildingStorey")) == 2
    assert len(model.by_type("IfcSpace")) == 2
    assert len(model.by_type("IfcWall")) == 0
    assert len(model.by_type("IfcSlab")) == 0
    assert len(model.by_type("IfcRoof")) == 0

    storeys = {storey.Name: storey for storey in model.by_type("IfcBuildingStorey")}
    assert sorted(storeys) == ["1F", "2F"]
    assert storeys["1F"].Elevation == pytest.approx(0.0)
    assert storeys["2F"].Elevation == pytest.approx(3.0)

    second_storey_point = (
        storeys["2F"]
        .ObjectPlacement.RelativePlacement.Location.Coordinates
    )
    assert second_storey_point == pytest.approx((0.0, 0.0, 3.0))

    related_pairs = {
        (
            rel.RelatingObject.is_a(),
            tuple(obj.is_a() for obj in rel.RelatedObjects),
        )
        for rel in model.by_type("IfcRelAggregates")
    }
    assert ("IfcProject", ("IfcSite",)) in related_pairs
    assert ("IfcSite", ("IfcBuilding",)) in related_pairs
    assert ("IfcBuilding", ("IfcBuildingStorey", "IfcBuildingStorey")) in related_pairs

    spaces = {space.Name: space for space in model.by_type("IfcSpace")}
    living_space = spaces["거실"]
    bedroom_space = spaces["안방"]

    living_body = living_space.Representation.Representations[0].Items[0]
    assert living_body.is_a("IfcExtrudedAreaSolid")
    assert living_body.Depth == pytest.approx(3.0)
    assert living_body.SweptArea.XDim == pytest.approx(4.2)
    assert living_body.SweptArea.YDim == pytest.approx(3.8)

    bedroom_body = bedroom_space.Representation.Representations[0].Items[0]
    assert bedroom_body.Depth == pytest.approx(3.0)
    assert bedroom_body.SweptArea.XDim == pytest.approx(3.6)
    assert bedroom_body.SweptArea.YDim == pytest.approx(3.2)

    living_location = (
        living_space.ObjectPlacement.RelativePlacement.Location.Coordinates
    )
    assert living_location == pytest.approx((5.0, 4.0, 0.0))

    bedroom_location = (
        bedroom_space.ObjectPlacement.RelativePlacement.Location.Coordinates
    )
    assert bedroom_location == pytest.approx((9.0, 4.0, 0.0))

    bedroom_direction = (
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
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
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
        }
    )
    output = tmp_path / "model.ifc"

    convert_layout_to_ifc(request, output)

    model = ifcopenshell.open(str(output))
    space = model.by_type("IfcSpace")[0]
    body = space.Representation.Representations[0].Items[0]
    assert body.Depth == pytest.approx(2.7)
    assert model.by_type("IfcBuildingStorey")[0].Elevation == pytest.approx(0.0)


def test_convert_layout_to_ifc_rejects_unknown_zone_reference(tmp_path: Path) -> None:
    request = LayoutImportV1.model_validate(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
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
            ],
        }
    )

    with pytest.raises(ValueError, match="알 수 없는 zone 참조"):
        convert_layout_to_ifc(request, tmp_path / "model.ifc")
