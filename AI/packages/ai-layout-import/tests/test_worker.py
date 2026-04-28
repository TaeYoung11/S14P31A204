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
        },
        output_path,
    )

    assert result == {"ok": True, "output_path": str(output_path)}
    assert output_path.exists()


def test_worker_adapter_returns_validation_error_dict(tmp_path: Path) -> None:
    output_path = tmp_path / "worker.ifc"

    result = run_layout_import_job(
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
                    "zoneId": "missing-zone",
                }
            ],
        },
        output_path,
    )

    assert result["ok"] is False
    assert result["code"] == "validation_error"
    assert result["message"] == "입력 검증에 실패했습니다."
    assert output_path.exists() is False
