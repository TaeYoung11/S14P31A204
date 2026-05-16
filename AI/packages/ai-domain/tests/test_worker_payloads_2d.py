from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_domain import TwoDLlmCommandPayload


def test_two_d_llm_command_payload_accepts_camel_case() -> None:
    payload = TwoDLlmCommandPayload.model_validate(
        {
            "schema_version": "v1",
            "userInstruction": "거실에 문을 만들어줘",
            "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
        }
    )

    assert payload.userInstruction == "거실에 문을 만들어줘"
    assert payload.sourceSceneStorageUrl == "s3://batang-artifacts/input/house.ifc"


def test_two_d_llm_command_payload_accepts_snake_case() -> None:
    payload = TwoDLlmCommandPayload.model_validate(
        {
            "schema_version": "v1",
            "user_instruction": "거실에 문을 만들어줘",
            "source_scene_storage_url": "s3://batang-artifacts/input/house.ifc",
        }
    )

    assert payload.userInstruction == "거실에 문을 만들어줘"
    assert payload.sourceSceneStorageUrl == "s3://batang-artifacts/input/house.ifc"


def test_two_d_llm_command_payload_defaults_missing_schema_version_to_v1() -> None:
    payload = TwoDLlmCommandPayload.model_validate(
        {
            "user_instruction": "거실에 문을 만들어줘",
            "source_scene_storage_url": "s3://batang-artifacts/input/house.ifc",
        }
    )

    assert payload.schemaVersion == "v1"


def test_two_d_llm_command_payload_rejects_unknown_schema_version() -> None:
    with pytest.raises(ValidationError):
        TwoDLlmCommandPayload.model_validate(
            {
                "schema_version": "v2",
                "user_instruction": "거실에 문을 만들어줘",
                "source_scene_storage_url": "s3://batang-artifacts/input/house.ifc",
            }
        )


def test_two_d_llm_command_payload_ignores_unknown_wire_fields() -> None:
    payload = TwoDLlmCommandPayload.model_validate(
        {
            "schema_version": "v1",
            "user_instruction": "거실에 문을 만들어줘",
            "source_scene_storage_url": "s3://batang-artifacts/input/house.ifc",
            "source_scene": {},
            "conversation_history": [],
            "planner_options": {"max_commands": 3},
            "tracing_id": "trace-123",
        }
    )

    assert payload.userInstruction == "거실에 문을 만들어줘"
    assert payload.sourceSceneStorageUrl == "s3://batang-artifacts/input/house.ifc"
