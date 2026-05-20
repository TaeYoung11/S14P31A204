from __future__ import annotations

from typing import Any

import ai_authoring.llm3d_apply as llm3d_apply


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


class _Model:
    def __init__(self) -> None:
        self.written_path: str | None = None

    def by_guid(self, global_id: str) -> object | None:
        del global_id
        return object()

    def write(self, output_path: str) -> None:
        self.written_path = output_path


def test_llm3d_modify_delete_apply_logs_started_and_completed(monkeypatch) -> None:
    fake_logger = _FakeLogger()
    monkeypatch.setattr(llm3d_apply, "logger", fake_logger)
    monkeypatch.setattr(llm3d_apply, "modify_color", lambda *args: True)
    model = _Model()
    command: dict[str, Any] = {
        "command_type": "MODIFY",
        "target": {"element_type": "IfcRoof", "select_all": True},
        "changes": {"color": "#AABBCC"},
    }
    matched = [{"global_id": "roof-global-id-1", "element_type": "IfcRoof"}]

    result = llm3d_apply.apply_llm3d_modify_delete_to_ifc(
        model=model,  # type: ignore[arg-type]
        command=command,
        matched=matched,
        output_path="out.ifc",
        scale=1.0,
        failure_summary="not applied",
        log_context={"jobId": "job-apply-log"},
    )

    assert result["status"] == "applied"
    started = next(
        fields
        for _, event, fields in fake_logger.records
        if event == "llm3d_authoring_apply_started"
    )
    assert started["jobId"] == "job-apply-log"
    assert started["commandType"] == "MODIFY"
    assert started["changeKeys"] == ["color"]
    completed = next(
        fields
        for _, event, fields in fake_logger.records
        if event == "llm3d_authoring_apply_completed"
    )
    assert completed["applyStatus"] == "applied"
    assert completed["appliedCount"] == 1
    assert completed["targetIds"] == ["roof-global-id-1"]
