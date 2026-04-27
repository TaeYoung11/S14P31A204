from __future__ import annotations

import json
from pathlib import Path

from ai_layout_import.cli import main


def test_cli_creates_ifc_from_json_input(tmp_path: Path, capsys) -> None:
    input_path = tmp_path / "layout.json"
    output_path = tmp_path / "model.ifc"
    input_path.write_text(
        json.dumps(
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
                "modeling_defaults": {"space_height_mm": 3000},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    exit_code = main(["--input", str(input_path), "--output", str(output_path)])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert output_path.exists()
    result = json.loads(captured.out)
    assert result["ok"] is True
    assert result["output_path"] == str(output_path)
    assert captured.err == ""


def test_cli_returns_validation_error_as_json(tmp_path: Path, capsys) -> None:
    input_path = tmp_path / "invalid-layout.json"
    output_path = tmp_path / "model.ifc"
    input_path.write_text(
        json.dumps(
            {
                "schema_version": "v1",
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "sample-project",
                "rooms": [],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    exit_code = main(["--input", str(input_path), "--output", str(output_path)])
    captured = capsys.readouterr()

    assert exit_code == 2
    result = json.loads(captured.err)
    assert result["ok"] is False
    assert result["code"] == "validation_error"
    assert result["message"] == "입력 검증에 실패했습니다."
    assert output_path.exists() is False
