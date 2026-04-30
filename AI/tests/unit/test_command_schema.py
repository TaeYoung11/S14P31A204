from __future__ import annotations

import json
from pathlib import Path

from ai_domain import CommandMessage
from tests.unit.schema_assert import load_json, validate_json_schema


ROOT = Path(__file__).resolve().parents[3]
SCHEMA_ROOT = ROOT / "shared" / "schemas"
COMMAND_SCHEMA_PATH = SCHEMA_ROOT / "messages" / "command_message.schema.json"
SAMPLE_ROOT = ROOT / "AI" / "sample_messages"


def test_sample_commands_pass_json_schema_validation() -> None:
    schema = json.loads(COMMAND_SCHEMA_PATH.read_text(encoding="utf-8"))
    store = {
        "https://a204.batang/shared/schemas/layout_import_v1.schema.json": load_json(
            SCHEMA_ROOT / "layout_import_v1.schema.json"
        ),
        "https://a204.batang/shared/schemas/layout_import_v2.schema.json": load_json(
            SCHEMA_ROOT / "layout_import_v2.schema.json"
        ),
        "https://a204.batang/shared/schemas/engine_request.schema.json": load_json(
            SCHEMA_ROOT / "engine_request.schema.json"
        ),
    }
    for name in [
        "command_2d_llm.json",
        "command_3d_llm.json",
        "command_sd_render.json",
        "command_ifc_generate.json",
        "command_ifc_edit.json",
    ]:
        validate_json_schema(load_json(SAMPLE_ROOT / name), schema, store=store)


def test_sample_commands_pass_pydantic_validation() -> None:
    for name in [
        "command_2d_llm.json",
        "command_3d_llm.json",
        "command_sd_render.json",
        "command_ifc_generate.json",
        "command_ifc_edit.json",
    ]:
        data = load_json(SAMPLE_ROOT / name)
        model = CommandMessage.model_validate(data)
        assert model.commandType


def test_ifc_generate_payload_rejects_ifc_edit_fields() -> None:
    data = load_json(SAMPLE_ROOT / "command_ifc_generate.json")
    data["payload"] = {
        "commandJsonStorageUrl": "s3://batang-artifacts/jobs/job/steps/1/ifc-command.json"
    }
    try:
        CommandMessage.model_validate(data)
    except ValueError:
        return
    raise AssertionError("ifc_generate payload must reject ifc_edit fields")


def test_ifc_generate_payload_accepts_v2_layout_import() -> None:
    data = load_json(SAMPLE_ROOT / "command_ifc_generate.json")
    data["payload"]["layoutImport"] = {
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
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    }

    model = CommandMessage.model_validate(data)
    assert model.commandType == "IFC_GENERATE_FROM_BUBBLE"


def test_ifc_edit_payload_rejects_layout_import_fields() -> None:
    data = load_json(SAMPLE_ROOT / "command_ifc_edit.json")
    data["payload"] = load_json(SAMPLE_ROOT / "command_ifc_generate.json")["payload"]
    try:
        CommandMessage.model_validate(data)
    except ValueError:
        return
    raise AssertionError("ifc_edit payload must reject layout import fields")


def test_step_no_cannot_exceed_total_steps() -> None:
    data = load_json(SAMPLE_ROOT / "command_2d_llm.json")
    data["stepNo"] = 4
    data["totalSteps"] = 3
    try:
        CommandMessage.model_validate(data)
    except ValueError:
        return
    raise AssertionError("stepNo greater than totalSteps must be rejected")


def test_ifc_edit_inline_engine_request_rejects_invalid_operation_shape() -> None:
    data = load_json(SAMPLE_ROOT / "command_ifc_edit.json")
    data["payload"] = {
        "engineRequest": {
            "schema_version": "v1",
            "request_id": "req-001",
            "mode": "preview",
            "project_id": "project-001",
            "base_revision_id": "rev-001",
            "operations": [{}],
        }
    }
    try:
        CommandMessage.model_validate(data)
    except ValueError:
        return
    raise AssertionError("ifc_edit inline engineRequest must reject invalid operation items")
