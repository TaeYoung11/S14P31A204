from __future__ import annotations

from pathlib import Path

import ifcopenshell
import pytest

from ai_domain import LayoutImportV1
from ai_layout_import import convert_layout_to_ifc


def test_convert_layout_to_ifc_creates_ifc4_bootstrap(tmp_path: Path) -> None:
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
                    "angle": 0.0,
                    "locked": False,
                },
            ],
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
    assert len(model.by_type("IfcSpace")) == 0

    storey_names = [storey.Name for storey in model.by_type("IfcBuildingStorey")]
    assert storey_names == ["1F", "2F"]

    rels = model.by_type("IfcRelAggregates")
    related_pairs = {
        (
            rel.RelatingObject.is_a(),
            tuple(obj.is_a() for obj in rel.RelatedObjects),
        )
        for rel in rels
    }
    assert ("IfcProject", ("IfcSite",)) in related_pairs
    assert ("IfcSite", ("IfcBuilding",)) in related_pairs
    assert ("IfcBuilding", ("IfcBuildingStorey", "IfcBuildingStorey")) in related_pairs


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
