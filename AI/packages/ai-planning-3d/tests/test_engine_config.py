from __future__ import annotations

from ai_planning_3d.command import LLM3DElementType, LLM3DTarget
from ai_planning_3d.engine import LLM3DEngine


def test_llm_3d_engine_uses_llm_env(monkeypatch):
    monkeypatch.setenv("LLM_MODEL_NAME", "llama3.1:8b")
    monkeypatch.setenv("LLM_BASE_URL", "http://ollama:11434/v1")
    monkeypatch.setenv("LLM_API_KEY", "local-ollama")
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "45")
    monkeypatch.setenv("LLM_RAW_JSON_FALLBACK_ENABLED", "false")
    monkeypatch.setenv("LLM_RAW_JSON_FALLBACK_TIMEOUT_SECONDS", "7")
    monkeypatch.setenv("OPENAI_API_KEY", "should-be-ignored")

    engine = LLM3DEngine()

    assert engine.model == "llama3.1:8b"
    assert engine.base_url == "http://ollama:11434/v1"
    assert str(engine._raw_client.base_url) == "http://ollama:11434/v1/"
    assert engine._raw_client.api_key == "local-ollama"
    assert engine._raw_client.timeout == 45.0
    assert engine.raw_json_fallback_enabled is False
    assert engine.raw_json_fallback_timeout == 7.0


def test_llm_3d_engine_explicit_args_override_env(monkeypatch):
    monkeypatch.setenv("LLM_MODEL_NAME", "env-model")
    monkeypatch.setenv("LLM_BASE_URL", "http://env-ollama:11434/v1")
    monkeypatch.setenv("LLM_API_KEY", "env-key")
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "45")

    engine = LLM3DEngine(
        model="explicit-model",
        base_url="http://explicit-ollama:11434/v1",
        api_key="explicit-key",
        timeout=0,
    )

    assert engine.model == "explicit-model"
    assert engine.base_url == "http://explicit-ollama:11434/v1"
    assert str(engine._raw_client.base_url) == "http://explicit-ollama:11434/v1/"
    assert engine._raw_client.api_key == "explicit-key"
    assert engine._raw_client.timeout == 0


def test_llm_3d_engine_defaults_to_ollama_without_llm_env(monkeypatch):
    for key in (
        "LLM_MODEL_NAME",
        "LLM_BASE_URL",
        "LLM_API_KEY",
        "LLM_TIMEOUT_SECONDS",
    ):
        monkeypatch.delenv(key, raising=False)

    engine = LLM3DEngine()

    assert engine.model == "gemma3:4b"
    assert engine.base_url == "http://localhost:11434/v1"
    assert engine._raw_client.api_key == "ollama"
    assert engine._raw_client.timeout == 30.0


def test_llm_3d_engine_ignores_invalid_timeout_env(monkeypatch):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "invalid")

    engine = LLM3DEngine()

    assert engine.model == "gemma3:4b"
    assert engine._raw_client.timeout == 30.0


def test_llm_3d_engine_extracts_raw_json_object():
    content = """
    ```json
    {"command_type":"MODIFY","target":{"element_type":"IfcRoof"},"changes":{"color":"#AABBCC"},"create_info":null,"confidence":1,"raw_instruction":"sample","ambiguity_question":null}
    ```
    """

    parsed = LLM3DEngine._json_object_from_text(content)

    assert parsed["command_type"] == "MODIFY"
    assert parsed["changes"] == {"color": "#AABBCC"}


def test_llm_3d_engine_detects_explicit_target_reference():
    wall_color_request = "\ubaa8\ub4e0 \ubcbd\uc758 \uc0c9\uc0c1\uc744 \ubcc0\uacbd\ud574\uc918"
    targetless_color_request = "\ubaa8\ub4e0 \uc0c9\uc0c1\uc744 \ubcc0\uacbd\ud574\uc918"

    assert LLM3DEngine._has_explicit_target_reference(wall_color_request)
    assert not LLM3DEngine._has_explicit_target_reference(targetless_color_request)
    assert LLM3DEngine._has_explicit_target_reference(
        targetless_color_request,
        LLM3DTarget(global_id="0123456789ABCDEFGHIJKL"),
    )
    assert LLM3DEngine._has_explicit_target_reference(
        "\uc120\ud0dd\ud55c \uc694\uc18c \uc0c9 \ubc14\uafd4\uc918",
        LLM3DTarget(element_type=LLM3DElementType.DOOR),
    )


def test_llm_3d_engine_detects_multiple_target_value_pairs():
    request = "\ubcbd\uc740 #FF0000, \ubb38\uc740 #0000FF\ub85c \ubc14\uafd4\uc918"

    assert LLM3DEngine._has_multiple_target_value_pairs(request)
    assert not LLM3DEngine._has_multiple_target_value_pairs(
        "\ubaa8\ub4e0 \ubcbd\uc744 #FF0000\ub85c \ubc14\uafd4\uc918"
    )
