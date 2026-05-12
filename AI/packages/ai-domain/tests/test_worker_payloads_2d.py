from __future__ import annotations

from ai_domain import TwoDLlmCommandPayload


def test_two_d_llm_command_payload_accepts_camel_case() -> None:
    payload = TwoDLlmCommandPayload.model_validate(
        {
            "userInstruction": "거실에 문을 만들어줘",
            "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
        }
    )

    assert payload.userInstruction == "거실에 문을 만들어줘"
    assert payload.sourceSceneStorageUrl == "s3://batang-artifacts/input/house.ifc"


def test_two_d_llm_command_payload_accepts_snake_case() -> None:
    payload = TwoDLlmCommandPayload.model_validate(
        {
            "user_instruction": "거실에 문을 만들어줘",
            "source_scene_storage_url": "s3://batang-artifacts/input/house.ifc",
        }
    )

    assert payload.userInstruction == "거실에 문을 만들어줘"
    assert payload.sourceSceneStorageUrl == "s3://batang-artifacts/input/house.ifc"
