from __future__ import annotations

import json
from pathlib import Path

import pytest

import ai_planning_2d
from ai_common.errors import ClarificationRequiredError, NonRetryableWorkerError
from ai_common.worker_sdk.base_worker import EventPublisher
from ai_domain import CommandMessage
from ai_domain.worker_messages.event import EventMessage
from ai_planning_2d.ifc_extractor import UnsupportedIfcSchemaError
from ai_planning_2d.worker import TwoDLlmWorker, run_two_d_llm_job


class InMemoryPublisher(EventPublisher):
    def __init__(self) -> None:
        self.events: list[EventMessage] = []

    def publish(self, event: EventMessage) -> None:
        self.events.append(event)


class FakeStorageClient:
    def __init__(self) -> None:
        self.read_map: dict[str, bytes] = {}
        self.writes: dict[str, bytes] = {}
        self.read_error: Exception | None = None
        self.write_error: Exception | None = None

    def read_bytes(self, url: str) -> bytes:
        if self.read_error is not None:
            raise self.read_error
        return self.read_map[url]

    def write_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        bucket: str | None = None,
    ) -> str:
        if self.write_error is not None:
            raise self.write_error
        bucket_name = bucket or "default"
        url = f"s3://{bucket_name}/{key}"
        self.writes[url] = data
        return url


def _raise(exc: Exception) -> None:
    raise exc


def _command(
    *,
    source_ifc_url: str | None = "s3://batang-artifacts/input/house.ifc",
    source_scene_url: str = "s3://batang-artifacts/input/house.ifc",
    edit_plan_url: str | None = "s3://batang-artifacts/output/edit-plan.json",
    ifc_output_url: str | None = "s3://batang-artifacts/output/result.ifc",
) -> CommandMessage:
    input_payload: dict[str, str] = {"sourceSceneStorageUrl": source_scene_url}
    if source_ifc_url is not None:
        input_payload["sourceIfcStorageUrl"] = source_ifc_url

    expected_output: dict[str, str] = {}
    if edit_plan_url is not None:
        expected_output["editPlanStorageUrl"] = edit_plan_url
    if ifc_output_url is not None:
        expected_output["ifcStorageUrl"] = ifc_output_url

    return CommandMessage.model_validate(
        {
            "messageId": "msg-2d-worker-001",
            "schemaVersion": "v1",
            "messageType": "COMMAND",
            "commandType": "TWO_D_LLM_GENERATE",
            "routingKey": "command.2d-llm.generate",
            "jobId": "job-2d-worker-001",
            "jobStepId": "job-step-2d-worker-001",
            "stepNo": 1,
            "totalSteps": 1,
            "projectId": "project-alpha",
            "requestedBy": "user-001",
            "sourceRevisionId": "rev-source-001",
            "sourceSceneStateId": "scene-state-001",
            "sourceSceneType": "SCENE_2D",
            "targetRevisionId": "rev-target-001",
            "expectedOutputArtifactId": "artifact-2d-plan-001",
            "input": input_payload,
            "expectedOutput": expected_output,
            "payload": {
                "userInstruction": "1층 욕실을 삭제해줘",
                "sourceSceneStorageUrl": source_scene_url,
            },
            "attemptNo": 0,
            "maxAttempts": 3,
            "idempotencyKey": "job-2d-worker-001:1",
            "correlationId": "corr-2d-worker-001",
            "createdAt": "2026-05-06T09:00:00Z",
        }
    )


def _applied_result(request_id: str = "req-2d-001") -> dict[str, object]:
    return {
        "preview": {"status": "preview_ready", "summary": "ok"},
        "apply": {
            "status": "applied",
            "apply_mode": "shared_authoring",
            "ifc_edit_payload": {
                "engineRequest": {
                    "schema_version": "v1",
                    "request_id": request_id,
                    "project_id": "project-alpha",
                    "mode": "apply",
                    "base_revision_id": "rev-source-001",
                    "operations": [],
                }
            },
        },
    }


def test_run_two_d_llm_job_validation_error(tmp_path: Path) -> None:
    output_path = tmp_path / "worker.ifc"

    result = run_two_d_llm_job(
        {
            "userInstruction": "",
            "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
        },
        input_path=tmp_path / "input.ifc",
        output_path=output_path,
    )

    assert result["ok"] is False
    assert result["code"] == "validation_error"


def test_run_two_d_llm_job_success(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    input_path = tmp_path / "input.ifc"
    output_path = tmp_path / "worker.ifc"
    input_path.write_bytes(b"ISO-10303-21;")

    async def _fake_run_pipeline(**_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result()

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = run_two_d_llm_job(
        {
            "userInstruction": "1층 욕실을 삭제해줘",
            "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
        },
        input_path=input_path,
        output_path=output_path,
    )

    assert result["ok"] is True
    assert result["output_path"] == str(output_path)
    assert output_path.read_bytes() == b"updated-ifc"
    assert result["result"]["apply"]["status"] == "applied"


def test_run_two_d_llm_job_clarification(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    input_path = tmp_path / "input.ifc"
    output_path = tmp_path / "worker.ifc"
    input_path.write_bytes(b"ISO-10303-21;")

    async def _fake_run_pipeline(
        *,
        clarification_request_id: str,
        **_: object,
    ) -> dict[str, object]:
        raise ClarificationRequiredError(
            code="CLARIFICATION_REQUIRED",
            message="clarification needed",
            clarification_request_id=clarification_request_id,
        )

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = run_two_d_llm_job(
        {
            "userInstruction": "1층 욕실을 삭제해줘",
            "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
        },
        input_path=input_path,
        output_path=output_path,
    )

    assert result["ok"] is False
    assert result["code"] == "clarification_required"
    assert result["clarification_request_id"] == "2d-local-input"


def test_two_d_llm_worker_uploads_ifc_and_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    publisher = InMemoryPublisher()
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=publisher,
        s3_client=storage,
    )

    async def _fake_run_pipeline(*, output_path: str, **_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result()

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "completed"
    assert publisher.events[0].status == "started"
    assert publisher.events[1].status == "completed"
    assert publisher.events[1].output is not None
    assert publisher.events[1].output.storageUrl == "s3://batang-artifacts/output/result.ifc"
    assert storage.writes["s3://batang-artifacts/output/result.ifc"] == b"updated-ifc"
    uploaded_plan = json.loads(storage.writes["s3://batang-artifacts/output/edit-plan.json"])
    assert uploaded_plan["engineRequest"]["request_id"] == "req-2d-001"
    assert "preview" not in uploaded_plan


def test_two_d_llm_worker_prefers_source_ifc_input_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/source.ifc"] = b"ISO-10303-21;source-ifc"
    storage.read_map["s3://batang-artifacts/input/scene.json"] = b'{"scene":true}'
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    async def _fake_run_pipeline(
        *,
        input_path: str,
        output_path: str,
        **_: object,
    ) -> dict[str, object]:
        assert Path(input_path).read_bytes() == b"ISO-10303-21;source-ifc"
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result("req-2d-002")

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(
        _command(
            source_ifc_url="s3://batang-artifacts/input/source.ifc",
            source_scene_url="s3://batang-artifacts/input/scene.json",
        )
    )

    assert result.status == "completed"


def test_two_d_llm_worker_requires_source_ifc_url() -> None:
    storage = FakeStorageClient()
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    result = worker.handle(_command(source_ifc_url=None))

    assert result.status == "failed"
    assert result.error.code == "MISSING_SOURCE_IFC_URL"


def test_two_d_llm_worker_logs_deprecated_scene_url_when_ifc_url_missing(
    caplog: pytest.LogCaptureFixture,
) -> None:
    storage = FakeStorageClient()
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    with caplog.at_level("WARNING"):
        result = worker.handle(
            _command(
                source_ifc_url=None,
                source_scene_url="s3://batang-artifacts/input/scene-only.json",
            )
        )

    assert result.status == "failed"
    assert result.error.code == "MISSING_SOURCE_IFC_URL"
    assert "deprecated_source_scene_storage_url_ignored" in caplog.text


def test_two_d_llm_worker_ignores_scene_url_without_ifc_url() -> None:
    storage = FakeStorageClient()
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    result = worker.handle(
        _command(
            source_ifc_url=None,
            source_scene_url="s3://batang-artifacts/input/scene-only.json",
        )
    )

    assert result.status == "failed"
    assert result.error.code == "MISSING_SOURCE_IFC_URL"


def test_two_d_llm_worker_rejects_non_ifc_source() -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b'{"scene":true}'
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "INVALID_SOURCE_IFC_FILE"


def test_two_d_llm_worker_reports_unsupported_ifc_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    monkeypatch.setattr(
        "ai_planning_2d.worker.extract_ifc_context",
        lambda _: _raise(UnsupportedIfcSchemaError("Unsupported IFC schema: IFC2X3")),
    )

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "UNSUPPORTED_IFC_SCHEMA"


def test_two_d_llm_worker_emits_clarification_with_job_step_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    publisher = InMemoryPublisher()
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=publisher,
        s3_client=storage,
    )

    async def _fake_run_pipeline(
        *,
        clarification_request_id: str,
        **_: object,
    ) -> dict[str, object]:
        raise ClarificationRequiredError(
            code="CLARIFICATION_REQUIRED",
            message="clarification needed",
            clarification_request_id=clarification_request_id,
        )

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "clarification_required"
    assert publisher.events[1].clarificationRequestId == "2d-job-step-2d-worker-001"


def test_two_d_llm_worker_preview_rejected_maps_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    async def _fake_run_pipeline(**_: object) -> dict[str, object]:
        raise NonRetryableWorkerError(code="PREVIEW_REJECTED", message="unsupported")

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "PREVIEW_REJECTED"


def test_two_d_llm_worker_invalid_command_type() -> None:
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=FakeStorageClient(),
    )

    with pytest.raises(NonRetryableWorkerError, match="CommandMessage instance"):
        worker.process(object())


def test_two_d_llm_worker_invalid_payload_type() -> None:
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=FakeStorageClient(),
    )
    command = _command()
    command.payload = object()

    result = worker.handle(command)

    assert result.status == "failed"
    assert result.error.code == "INVALID_PAYLOAD_TYPE"


def test_two_d_llm_worker_engine_init_failure_is_retryable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    monkeypatch.setattr("ai_planning_2d.worker.extract_ifc_context", lambda _: {"spaces": []})
    monkeypatch.setattr(
        "ai_planning_2d.worker.LLM2DPipeline",
        lambda **_: _raise(RuntimeError("engine init failed")),
    )

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "ENGINE_INIT_FAILED"
    assert result.error.retryable is True


def test_two_d_llm_worker_storage_read_failure_is_retryable() -> None:
    storage = FakeStorageClient()
    storage.read_error = RuntimeError("temporary read failure")
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "STORAGE_READ_FAILED"
    assert result.error.retryable is True


def test_two_d_llm_worker_storage_write_failure_is_retryable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    storage.write_error = RuntimeError("temporary write failure")
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    async def _fake_run_pipeline(*, output_path: str, **_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result("req-2d-003")

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "STORAGE_WRITE_FAILED"
    assert result.error.retryable is True


def test_two_d_llm_worker_plan_upload_failure_happens_before_ifc_upload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    write_calls: list[str] = []

    def _write_bytes(
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        bucket: str | None = None,
    ) -> str:
        bucket_name = bucket or "default"
        url = f"s3://{bucket_name}/{key}"
        write_calls.append(url)
        if url.endswith("edit-plan.json"):
            raise RuntimeError("plan upload failure")
        storage.writes[url] = data
        return url

    storage.write_bytes = _write_bytes  # type: ignore[method-assign]

    async def _fake_run_pipeline(*, output_path: str, **_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result("req-2d-004")

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "STORAGE_WRITE_FAILED"
    assert result.error.retryable is True
    assert write_calls == ["s3://batang-artifacts/output/edit-plan.json"]
    assert "s3://batang-artifacts/output/result.ifc" not in storage.writes


def test_two_d_llm_worker_builds_plan_before_upload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    async def _fake_run_pipeline(*, output_path: str, **_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return {
            "preview": {"status": "preview_ready", "summary": "ok"},
            "apply": {"status": "applied", "apply_mode": "shared_authoring"},
        }

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "MISSING_EDIT_PLAN"
    assert storage.writes == {}


def test_two_d_llm_worker_supports_ifc_only_output(monkeypatch: pytest.MonkeyPatch) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    async def _fake_run_pipeline(*, output_path: str, **_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result("req-2d-005")

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command(edit_plan_url=None))

    assert result.status == "completed"
    assert "s3://batang-artifacts/output/edit-plan.json" not in storage.writes


def test_two_d_llm_worker_rejects_invalid_storage_url(monkeypatch: pytest.MonkeyPatch) -> None:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    async def _fake_run_pipeline(*, output_path: str, **_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result("req-2d-006")

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command(ifc_output_url="not-an-s3-url"))

    assert result.status == "failed"
    assert result.error.code == "INVALID_STORAGE_URL"


def test_run_two_d_llm_job_rejects_active_event_loop(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    input_path = tmp_path / "input.ifc"
    output_path = tmp_path / "worker.ifc"
    input_path.write_bytes(b"ISO-10303-21;")

    async def _fake_run_pipeline(**_: object) -> dict[str, object]:
        return _applied_result()

    monkeypatch.setattr("ai_planning_2d.worker._run_pipeline", _fake_run_pipeline)
    monkeypatch.setattr("ai_planning_2d.worker.asyncio.get_running_loop", lambda: object())

    result = run_two_d_llm_job(
        {
            "userInstruction": "1층 욕실을 삭제해줘",
            "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
        },
        input_path=input_path,
        output_path=output_path,
    )

    assert result["ok"] is False
    assert result["code"] == "UNSUPPORTED_ASYNC_HOST"


def test_package_lazy_worker_import() -> None:
    assert ai_planning_2d.TwoDLlmWorker is not None


def test_package_lazy_worker_import_wraps_import_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "ai_planning_2d.import_module",
        lambda *_args, **_kwargs: _raise(ImportError("missing boto3")),
    )

    with pytest.raises(AttributeError):
        ai_planning_2d.__getattr__("TwoDLlmWorker")
