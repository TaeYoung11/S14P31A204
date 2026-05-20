from __future__ import annotations

import asyncio
from typing import Any

from ai_planning_3d.command import (
    LLM3DChanges,
    LLM3DCommand,
    LLM3DCommandType,
    LLM3DElementType,
    LLM3DTarget,
)
from ai_planning_3d.pipeline import LLM3DPipeline, PreviewSession
import ai_planning_3d.pipeline as pipeline_module


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


class _QueryEngine:
    def __init__(self, matched: list[dict[str, Any]], model: object | None = object()) -> None:
        self._matched = matched
        self._model = model

    def find_elements(self, command: LLM3DCommand) -> list[dict[str, Any]]:
        del command
        return self._matched

    def get_last_query_reason(self) -> str:
        return ""

    def get_model(self) -> object | None:
        return self._model


def _command() -> LLM3DCommand:
    return LLM3DCommand(
        command_type=LLM3DCommandType.MODIFY,
        target=LLM3DTarget(element_type=LLM3DElementType.ROOF, select_all=True),
        changes=LLM3DChanges(color="#AABBCC"),
        raw_instruction="roof is #AABBCC",
    )


def _matched() -> list[dict[str, Any]]:
    return [
        {
            "global_id": "roof-global-id-1",
            "element_type": "IfcRoof",
            "name": "Roof 1",
            "dims": {"z_mm": 0.0, "height_mm": 2400.0, "width_mm": 200.0},
        }
    ]


def _pipeline(fake_logger: _FakeLogger) -> LLM3DPipeline:
    pipeline = object.__new__(LLM3DPipeline)
    pipeline._logger = fake_logger
    pipeline._log_context = {"jobId": "job-pipeline-log"}
    pipeline.query_engine = _QueryEngine(_matched())
    pipeline._structural_validator = None
    pipeline.store = {}
    pipeline._scale = 1.0
    return pipeline


def test_pipeline_logs_preview_status_and_session() -> None:
    fake_logger = _FakeLogger()
    pipeline = _pipeline(fake_logger)

    result = asyncio.run(pipeline.execute_command_preview(_command()))

    assert result["status"] == "preview_ready"
    completed = next(
        fields
        for _, event, fields in fake_logger.records
        if event == "llm3d_preview_completed"
    )
    assert completed["sessionId"] == result["session_id"]
    assert completed["matchedCount"] == 1
    assert completed["structuralWarningCount"] == 0
    assert completed["selectAll"] is True


def test_pipeline_logs_apply_status(monkeypatch) -> None:
    fake_logger = _FakeLogger()
    pipeline = _pipeline(fake_logger)
    command = _command()
    session = PreviewSession("session-apply-log", command, _matched())
    pipeline.store = {session.session_id: session}

    def fake_apply(**kwargs: object) -> dict[str, object]:
        assert kwargs["log_context"] == {"jobId": "job-pipeline-log"}
        return {
            "status": "applied",
            "applied_count": 1,
            "missing_ids": [],
            "failed_ids": [],
        }

    monkeypatch.setattr(pipeline_module, "apply_llm3d_modify_delete_to_ifc", fake_apply)

    result = asyncio.run(pipeline.execute_apply(session.session_id))

    assert result["status"] == "applied"
    completed = next(
        fields
        for _, event, fields in fake_logger.records
        if event == "llm3d_apply_completed"
    )
    assert completed["sessionId"] == "session-apply-log"
    assert completed["applyStatus"] == "applied"
    assert completed["appliedCount"] == 1


def test_pipeline_logs_chat_split_for_blocked_preview() -> None:
    fake_logger = _FakeLogger()
    pipeline = _pipeline(fake_logger)

    async def fake_preview(command_text: str) -> dict[str, object]:
        return {"status": "not_found", "summary": command_text}

    pipeline.execute_preview = fake_preview  # type: ignore[method-assign]

    records = asyncio.run(pipeline.execute_chat_to_ifc("roof #AABBCC, wall #112233", "out.ifc"))

    assert records[0]["apply_status"] == "preview_blocked"
    split = next(
        fields
        for _, event, fields in fake_logger.records
        if event == "llm3d_chat_split"
    )
    assert split["commandCount"] == 2
