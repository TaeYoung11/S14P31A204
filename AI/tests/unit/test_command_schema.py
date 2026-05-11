from __future__ import annotations

import json
import re
from pathlib import Path

from ai_domain import CommandMessage
from .schema_assert import load_json, validate_json_schema


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
        "https://a204.batang/shared/schemas/engine_request.v2.schema.json": load_json(
            SCHEMA_ROOT / "engine_request.v2.schema.json"
        ),
        "https://a204.batang/shared/schemas/two_d_llm_generate.payload.schema.json": load_json(
            SCHEMA_ROOT / "two_d_llm_generate.payload.schema.json"
        ),
        "https://a204.batang/shared/schemas/three_d_llm_generate.payload.schema.json": load_json(
            SCHEMA_ROOT / "three_d_llm_generate.payload.schema.json"
        ),
        "https://a204.batang/shared/schemas/sd_render_generate.payload.schema.json": load_json(
            SCHEMA_ROOT / "sd_render_generate.payload.schema.json"
        ),
        "https://a204.batang/shared/schemas/scene_2d_snapshot_v1.schema.json": load_json(
            SCHEMA_ROOT / "scene_2d_snapshot_v1.schema.json"
        ),
    }
    for name in [
        "command_2d_llm.json",
        "command_3d_llm.json",
        "command_sd_render.json",
        "command_ifc_generate.json",
        "command_ifc_edit.json",
    ]:
        raw = load_json(SAMPLE_ROOT / name)
        CommandMessage.model_validate(raw)
        validate_json_schema(
            _schema_ready_command(raw),
            schema,
            store=store,
        )


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


def test_ifc_generate_payload_accepts_snake_case_layout_import_from_be() -> None:
    data = load_json(SAMPLE_ROOT / "command_ifc_generate.json")
    payload = data.pop("payload")
    data["payload"] = {
        "layout_import": _schema_ready_command({"payload": payload})["payload"]["layout_import"]
    }

    model = CommandMessage.model_validate(data)

    assert model.commandType == "IFC_GENERATE_FROM_BUBBLE"
    assert model.payload.layoutImport.name == "sample-project"


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


def _to_snake_case_data(value: object) -> object:
    if isinstance(value, dict):
        return {
            _to_snake_case_key(str(key)): _to_snake_case_data(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_to_snake_case_data(item) for item in value]
    return value


def _to_snake_case_key(key: str) -> str:
    first_pass = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", key)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", first_pass).lower()


def _schema_ready_command(raw: dict[str, object]) -> dict[str, object]:
    normalized = _to_snake_case_data(raw)
    if not isinstance(normalized, dict):
        raise AssertionError("normalized command payload must be an object")

    payload = normalized.get("payload")
    command_type = normalized.get("command_type")
    if command_type == "SD_RENDER_GENERATE":
        normalized["payload"] = raw["payload"]
        return normalized
    if isinstance(payload, dict) and command_type in {
        "TWO_D_LLM_GENERATE",
        "THREE_D_LLM_GENERATE",
    }:
        payload.setdefault("schema_version", "v1")
    if (
        isinstance(payload, dict)
        and command_type == "IFC_GENERATE_FROM_BUBBLE"
        and isinstance(payload.get("layout_import"), dict)
    ):
        rooms = payload["layout_import"].get("rooms")
        if isinstance(rooms, list):
            for room in rooms:
                if isinstance(room, dict) and "zone_id" in room:
                    room["zoneId"] = room.pop("zone_id")

    return normalized
