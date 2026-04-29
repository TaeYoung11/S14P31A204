from __future__ import annotations

from pathlib import Path

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


def test_worker_adapter_returns_validation_error_for_v2_missing_default(tmp_path: Path) -> None:
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

    assert result["ok"] is False
    assert result["code"] == "validation_error"
    assert "wall_thickness_mm" in str(result["details"])
    assert output_path.exists() is False
