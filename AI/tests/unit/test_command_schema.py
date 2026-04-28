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
