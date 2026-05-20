from __future__ import annotations

from types import SimpleNamespace

import pytest

import ai_planning_3d.engine as engine_module
from ai_planning_3d.command import (
    LLM3DChanges,
    LLM3DCommand,
    LLM3DCommandType,
    LLM3DElementType,
    LLM3DTarget,
)
from ai_planning_3d.engine import LLM3DEngine, SYSTEM_PROMPT
from ai_planning_3d.pipeline import LLM3DPipeline


class _AsyncCreateRecorder:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []

    async def __call__(self, **kwargs):
        self.calls.append(kwargs)
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


def _sample_modify_command(raw_instruction: str = "wall is #AABBCC") -> LLM3DCommand:
    return LLM3DCommand(
        command_type=LLM3DCommandType.MODIFY,
        target=LLM3DTarget(element_type=LLM3DElementType.WALL),
        changes=LLM3DChanges(color="#AABBCC"),
        create_info=None,
        confidence=1.0,
        raw_instruction=raw_instruction,
    )


def _set_structured_create(engine: LLM3DEngine, recorder: _AsyncCreateRecorder) -> None:
    engine.client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=recorder))
    )


def _set_raw_create(engine: LLM3DEngine, recorder: _AsyncCreateRecorder) -> None:
    engine._raw_client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=recorder))
    )


def _raw_json_response(content: str):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content),
            )
        ],
    )


class _FakeLogger:
    def __init__(
        self,
        records: list[tuple[str, str, dict[str, object]]] | None = None,
        context: dict[str, object] | None = None,
    ) -> None:
        self.records = records if records is not None else []
        self.context = context or {}

    def bind(self, **fields: object) -> _FakeLogger:
        return _FakeLogger(self.records, {**self.context, **fields})

    def info(self, event: str, *args: object, **fields: object) -> None:
        del args
        self.records.append(("info", event, {**self.context, **fields}))

    def warning(self, event: str, *args: object, **fields: object) -> None:
        del args
        self.records.append(("warning", event, {**self.context, **fields}))

    def error(self, event: str, *args: object, **fields: object) -> None:
        del args
        self.records.append(("error", event, {**self.context, **fields}))


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


@pytest.mark.asyncio
async def test_parse_command_sends_default_reasoning_effort(monkeypatch):
    monkeypatch.delenv("LLM_REASONING_EFFORT", raising=False)
    engine = LLM3DEngine()
    recorder = _AsyncCreateRecorder([_sample_modify_command()])
    _set_structured_create(engine, recorder)

    parsed = await engine.parse_command("wall is #AABBCC")

    assert parsed.changes is not None
    assert parsed.changes.color == "#AABBCC"
    assert recorder.calls[0]["extra_body"] == {"reasoning_effort": "none"}


@pytest.mark.asyncio
async def test_parse_command_omits_reasoning_effort_when_disabled(monkeypatch):
    monkeypatch.setenv("LLM_REASONING_EFFORT", "off")
    engine = LLM3DEngine()
    recorder = _AsyncCreateRecorder([_sample_modify_command()])
    _set_structured_create(engine, recorder)

    await engine.parse_command("wall is #AABBCC")

    assert "extra_body" not in recorder.calls[0]


@pytest.mark.asyncio
async def test_parse_command_retries_without_reasoning_extra_body(monkeypatch):
    monkeypatch.delenv("LLM_REASONING_EFFORT", raising=False)
    engine = LLM3DEngine()
    recorder = _AsyncCreateRecorder(
        [
            RuntimeError("unsupported reasoning_effort"),
            _sample_modify_command(),
        ]
    )
    _set_structured_create(engine, recorder)

    parsed = await engine.parse_command("wall is #AABBCC")

    assert parsed.changes is not None
    assert parsed.changes.color == "#AABBCC"
    assert recorder.calls[0]["extra_body"] == {"reasoning_effort": "none"}
    assert "extra_body" not in recorder.calls[1]


@pytest.mark.asyncio
async def test_raw_json_fallback_retries_without_reasoning_extra_body(monkeypatch):
    monkeypatch.delenv("LLM_REASONING_EFFORT", raising=False)
    engine = LLM3DEngine()
    content = (
        '{"command_type":"MODIFY","target":{"element_type":"IfcWall"},'
        '"changes":{"color":"#AABBCC"},"create_info":null,"confidence":1,'
        '"raw_instruction":"wall is #AABBCC","ambiguity_question":null}'
    )
    recorder = _AsyncCreateRecorder(
        [
            RuntimeError("unsupported reasoning_effort"),
            _raw_json_response(content),
        ]
    )
    _set_raw_create(engine, recorder)

    parsed = await engine._parse_command_raw_json("wall is #AABBCC", "system")

    assert parsed is not None
    assert parsed.changes is not None
    assert parsed.changes.color == "#AABBCC"
    assert recorder.calls[0]["extra_body"] == {"reasoning_effort": "none"}
    assert "extra_body" not in recorder.calls[1]


def test_pipeline_model_name_none_uses_llm_model_env(monkeypatch):
    monkeypatch.setenv("LLM_MODEL_NAME", "qwen2.5:7b")

    pipeline = LLM3DPipeline(model_name=None)

    assert pipeline.engine.model == "qwen2.5:7b"


def test_llm_3d_engine_logs_config_without_api_key(monkeypatch):
    fake_logger = _FakeLogger()
    monkeypatch.setattr(engine_module, "logger", fake_logger)
    monkeypatch.setenv("LLM_API_KEY", "secret-local-key")

    LLM3DEngine(
        model="log-model",
        base_url="http://ollama:11434/v1",
        timeout=12,
        log_context={"jobId": "job-log-1"},
    )

    [record] = [
        fields
        for _, event, fields in fake_logger.records
        if event == "llm3d_engine_configured"
    ]
    assert record["jobId"] == "job-log-1"
    assert record["model"] == "log-model"
    assert record["baseUrl"] == "http://ollama:11434/v1"
    assert record["timeoutSeconds"] == 12
    assert "apiKey" not in record
    assert "api_key" not in record
    assert "secret-local-key" not in repr(fake_logger.records)


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


def test_system_prompt_includes_demo_shortcut_guidance():
    assert "DEMO SHORTCUT REQUESTS" in SYSTEM_PROMPT
    assert "/방생성" in SYSTEM_PROMPT
    assert "/창문수정" in SYSTEM_PROMPT
    assert "IfcDoor" in SYSTEM_PROMPT
