from __future__ import annotations

from ai_planning_3d.engine import LLM3DEngine


def test_llm_3d_engine_uses_llm_env(monkeypatch):
    monkeypatch.setenv("LLM_MODEL_NAME", "llama3.1:8b")
    monkeypatch.setenv("LLM_BASE_URL", "http://ollama:11434/v1")
    monkeypatch.setenv("LLM_API_KEY", "local-ollama")
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "45")
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-be-used")

    engine = LLM3DEngine()

    assert engine.model == "llama3.1:8b"
    assert engine.base_url == "http://ollama:11434/v1"
    assert str(engine._raw_client.base_url) == "http://ollama:11434/v1/"
    assert engine._raw_client.api_key == "local-ollama"
    assert engine._raw_client.timeout == 45.0


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


def test_llm_3d_engine_defaults_to_ollama_without_openai_key(monkeypatch):
    for key in (
        "LLM_MODEL_NAME",
        "LLM_BASE_URL",
        "LLM_API_KEY",
        "LLM_TIMEOUT_SECONDS",
        "OPENAI_API_KEY",
    ):
        monkeypatch.delenv(key, raising=False)

    engine = LLM3DEngine()

    assert engine.model == "qwen2.5:7b"
    assert engine.base_url == "http://localhost:11434/v1"
    assert engine._raw_client.api_key == "ollama"
    assert engine._raw_client.timeout == 30.0


def test_llm_3d_engine_ignores_invalid_timeout_env(monkeypatch):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "invalid")

    engine = LLM3DEngine()

    assert engine.model == "qwen2.5:7b"
    assert engine._raw_client.timeout == 30.0
