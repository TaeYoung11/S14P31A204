from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_domain import ThreeDLlmCommandPayload


def test_three_d_llm_command_payload_accepts_camel_case() -> None:
    payload = ThreeDLlmCommandPayload.model_validate(
        {
            "schema_version": "v1",
            "userInstruction": "2층 벽을 이동해줘",
            "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
        }
    )

    assert payload.schemaVersion == "v1"
    assert payload.userInstruction == "2층 벽을 이동해줘"
    assert payload.sourceSceneStorageUrl == "s3://batang-artifacts/input/house.ifc"


def test_three_d_llm_command_payload_accepts_snake_case() -> None:
    payload = ThreeDLlmCommandPayload.model_validate(
        {
            "schema_version": "v1",
            "user_instruction": "2층 벽을 이동해줘",
            "source_scene_storage_url": "s3://batang-artifacts/input/house.ifc",
        }
    )

    assert payload.schemaVersion == "v1"
    assert payload.userInstruction == "2층 벽을 이동해줘"
    assert payload.sourceSceneStorageUrl == "s3://batang-artifacts/input/house.ifc"


def test_three_d_llm_command_payload_defaults_missing_schema_version_to_v1() -> None:
    payload = ThreeDLlmCommandPayload.model_validate(
        {
            "userInstruction": "2층 벽을 이동해줘",
            "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
        }
    )

    assert payload.schemaVersion == "v1"


def test_three_d_llm_command_payload_rejects_unknown_schema_version() -> None:
    with pytest.raises(ValidationError):
        ThreeDLlmCommandPayload.model_validate(
            {
                "schema_version": "v2",
                "userInstruction": "2층 벽을 이동해줘",
                "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
            }
        )
