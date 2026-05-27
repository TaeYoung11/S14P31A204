from __future__ import annotations

from pathlib import Path

import ifcopenshell

from ai_layout_import.worker import run_layout_import_job


def test_worker_adapter_creates_ifc_from_payload(tmp_path: Path) -> None:
    output_path = tmp_path / "worker.ifc"

    result = run_layout_import_job(
        {
            "schema_version": "v1",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
                {
                    "id": "room-living-01",
                    "name": "Living Room",
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
        },
        output_path,
    )

    assert result == {"ok": True, "output_path": str(output_path)}
    assert output_path.exists()


def test_worker_adapter_applies_defaults_for_v2_missing_modeling_value(tmp_path: Path) -> None:
    output_path = tmp_path / "worker.ifc"

    result = run_layout_import_job(
        {
            "schema_version": "v2",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
                {
                    "id": "room-living-01",
                    "name": "Living Room",
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
            "boundaries": [
                {
                    "floor": 1,
                    "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
                }
            ],
            "modeling_defaults": {
                "slab_thickness_mm": 180,
                "roof_height_mm": 400,
            },
        },
        output_path,
    )

    assert result == {"ok": True, "output_path": str(output_path)}
    assert output_path.exists()


def test_worker_adapter_writes_optimized_room_placement_for_strength_payload(
    tmp_path: Path,
) -> None:
    output_path = tmp_path / "worker-optimized.ifc"

    result = run_layout_import_job(
        {
            "schema_version": "v2",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "sample-project",
            "rooms": [
                {
                    "id": "room-left-01",
                    "name": "Left Room",
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
                    "id": "room-right-01",
                    "name": "Right Room",
                    "type": "bedroom",
                    "width": 4200,
                    "height": 3800,
                    "floor": 1,
                    "x": 9000.0,
                    "y": 1900.0,
                    "angle": 0.0,
                    "locked": False,
                },
            ],
            "adjacency": [
                {
                    "from_room_id": "room-left-01",
                    "to_room_id": "room-right-01",
                    "strength": 1.0,
                }
            ],
            "boundaries": [
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
            "modeling_defaults": {
                "space_height_mm": 3000,
                "wall_thickness_mm": 200,
                "slab_thickness_mm": 180,
                "roof_height_mm": 400,
            },
        },
        output_path,
    )

    assert result == {"ok": True, "output_path": str(output_path)}
    model = ifcopenshell.open(str(output_path))
    spaces = {space.Name: space for space in model.by_type("IfcSpace")}
    right_room_location = tuple(
        spaces["Right Room"].ObjectPlacement.RelativePlacement.Location.Coordinates
    )
    assert right_room_location == (6.3, 1.9, 0.0)
