from __future__ import annotations

import json
import signal
from pathlib import Path

import pytest

import ai_planning_2d
import ai_planning_2d.worker as worker_module
from ai_common.storage.paths import (
    clarification_detail_key,
    planner_2d_command_key,
    preview_result_key,
)
from ai_common.adapters.rabbitmq.consumer import RabbitMQConsumer
from ai_common.adapters.rabbitmq.kombu_client import get_command_queue
from ai_common.errors import ClarificationRequiredError, NonRetryableWorkerError
from ai_common.worker_sdk.base_worker import EventPublisher
from ai_domain import CommandMessage
from ai_domain.worker_messages.event import EventMessage
from ai_planning_2d.ifc_extractor import UnsupportedIfcLengthUnitError, UnsupportedIfcSchemaError
from ai_planning_2d.schemas import ClarificationArtifact
from ai_planning_2d.worker import TwoDLlmWorker, run_two_d_llm_job
from ai_planning_2d.worker_app import WORKER_TYPE, build_settings, run_two_d_llm_worker


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
        self.default_bucket = "batang-artifacts"

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

    def write_json(
        self,
        key: str,
        payload: object,
        *,
        bucket: str | None = None,
        indent: int = 2,
    ) -> str:
        return self.write_bytes(
            key,
            json.dumps(payload, ensure_ascii=False, indent=indent).encode("utf-8"),
            content_type="application/json; charset=utf-8",
            bucket=bucket,
        )


def _raise(exc: Exception) -> None:
    raise exc


def _command(
    *,
    source_ifc_url: str | None = "s3://batang-artifacts/input/house.ifc",
    source_scene_url: str = "s3://batang-artifacts/input/house.ifc",
    edit_plan_url: str | None = (
        "s3://batang-artifacts/projects/project-alpha/jobs/job-2d-worker-001/"
        "steps/001/engine/engine-request.v2.json"
    ),
    validation_report_url: str | None = (
        "s3://batang-artifacts/projects/project-alpha/jobs/job-2d-worker-001/"
        "steps/001/engine/validation-report.v1.json"
    ),
    error_detail_url: str | None = (
        "s3://batang-artifacts/projects/project-alpha/jobs/job-2d-worker-001/"
        "steps/001/error/error-detail.v1.json"
    ),
    ifc_output_url: str | None = "s3://batang-artifacts/output/result.ifc",
) -> CommandMessage:
    input_payload: dict[str, str] = {"sourceSceneStorageUrl": source_scene_url}
    if source_ifc_url is not None:
        input_payload["sourceIfcStorageUrl"] = source_ifc_url

    expected_output: dict[str, str] = {}
    if edit_plan_url is not None:
        expected_output["editPlanStorageUrl"] = edit_plan_url
    if validation_report_url is not None:
        expected_output["validationReportStorageUrl"] = validation_report_url
    if error_detail_url is not None:
        expected_output["errorDetailStorageUrl"] = error_detail_url
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
                "schema_version": "v1",
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
    engine_request = {
        "engineRequest": {
            "schema_version": "v1",
            "request_id": request_id,
            "project_id": "project-alpha",
            "mode": "apply",
            "base_revision_id": "rev-source-001",
            "operations": [],
        },
        "commandJsonStorageUrl": None,
    }
    return {
        "preview": {
            "status": "preview_ready",
            "summary": "ok",
            "command": {
                "action": "remove_room",
                "target_room_name": "침실",
                "target_floor": 1,
                "confidence": 0.9,
                "resize_shape": "rect",
                "apply_to_all": False,
                "needs_clarification": False,
                "clarification_question": None,
            },
            "command_batch": {
                "commands": [
                    {
                        "action": "delete_space",
                        "target_id": "space-bedroom-1",
                        "params": {},
                        "confidence": 0.9,
                        "reason": "test",
                    }
                ],
                "requires_clarification": False,
                "clarification_question": None,
                "failed_command_indices": [],
            },
            "policy_plan": {
                "status": "planned",
                "reason": "dominant_adjacent_absorber",
                "target_space_id": "space-bedroom-1",
                "merge_target_space_id": "space-living-1",
            },
            "matched_count": 1,
            "validation_warnings": [],
            "engine_request": engine_request,
            "engine_capabilities": {"shared_payload": True},
        },
        "apply": {
            "status": "applied",
            "apply_mode": "shared_authoring",
            "engine_request": engine_request,
        },
    }


def test_run_two_d_llm_job_validation_error(tmp_path: Path) -> None:
    output_path = tmp_path / "worker.ifc"

    result = run_two_d_llm_job(
        {
            "schema_version": "v1",
            "userInstruction": "",
            "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
        },
        input_path=tmp_path / "input.ifc",
        output_path=output_path,
    )

    assert result["ok"] is False
    assert result["code"] == "validation_error"


def test_run_two_d_llm_job_accepts_snake_case_payload(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    input_path = tmp_path / "input.ifc"
    output_path = tmp_path / "worker.ifc"
    input_path.write_bytes(b"ISO-10303-21;")

    async def _fake_run_pipeline(**_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result()

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = run_two_d_llm_job(
        {
            "schema_version": "v1",
            "user_instruction": "1층에 문을 만들어줘",
            "source_scene_storage_url": "s3://batang-artifacts/input/house.ifc",
        },
        input_path=input_path,
        output_path=output_path,
    )

    assert result["ok"] is True
    assert result["output_path"] == str(output_path)
    assert output_path.read_bytes() == b"updated-ifc"
    assert result["result"]["apply"]["status"] == "applied"


def test_run_two_d_llm_job_ignores_unknown_payload_fields(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    input_path = tmp_path / "input.ifc"
    output_path = tmp_path / "worker.ifc"
    input_path.write_bytes(b"ISO-10303-21;")

    async def _fake_run_pipeline(**_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result()

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = run_two_d_llm_job(
        {
            "schema_version": "v1",
            "user_instruction": "1층에 문을 만들어줘",
            "source_scene_storage_url": "s3://batang-artifacts/input/house.ifc",
            "source_scene": {},
            "conversation_history": [],
            "planner_options": {"max_commands": 3},
            "request_metadata": {"trace_id": "trace-123"},
        },
        input_path=input_path,
        output_path=output_path,
    )

    assert result["ok"] is True
    assert result["output_path"] == str(output_path)
    assert output_path.read_bytes() == b"updated-ifc"
    assert result["result"]["apply"]["status"] == "applied"


def test_run_two_d_llm_job_success(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    input_path = tmp_path / "input.ifc"
    output_path = tmp_path / "worker.ifc"
    input_path.write_bytes(b"ISO-10303-21;")

    async def _fake_run_pipeline(**_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result()

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = run_two_d_llm_job(
        {
            "schema_version": "v1",
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

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = run_two_d_llm_job(
        {
            "schema_version": "v1",
            "userInstruction": "1층 욕실을 삭제해줘",
            "sourceSceneStorageUrl": "s3://batang-artifacts/input/house.ifc",
        },
        input_path=input_path,
        output_path=output_path,
    )

    assert result["ok"] is False
    assert result["code"] == "clarification_required"
    assert result["clarification_request_id"] == "2d-local-input"


def test_build_two_d_command_artifact_marks_alternatives_as_clarification() -> None:
    artifact = worker_module._build_two_d_command_artifact(
        user_instruction="침실을 없애줘",
        preview={
            "status": "alternatives",
            "summary": "Review the proposed merge alternative first.",
            "command": {
                "action": "remove_room",
                "target_room_name": "침실",
                "confidence": 0.9,
            },
            "command_batch": {"commands": [], "requires_clarification": False},
        },
    )

    assert artifact.needs_clarification is True
    assert artifact.clarification_question == "Review the proposed merge alternative first."


def test_build_preview_result_artifact_preserves_alternatives_status() -> None:
    artifact = worker_module._build_preview_result_artifact(
        {
            "status": "alternatives",
            "summary": "Review the proposed merge alternative first.",
            "command": {
                "action": "remove_room",
                "target_room_name": "침실",
                "confidence": 0.9,
            },
            "command_batch": {"commands": [], "requires_clarification": False},
            "policy_plan": {"status": "planned"},
            "alternatives": [{"alternative_id": "merge-primary"}],
        }
    )

    assert artifact.status == "alternatives"
    assert artifact.summary == "Review the proposed merge alternative first."


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

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "completed"
    assert publisher.events[0].status == "started"
    assert publisher.events[1].status == "completed"
    assert publisher.events[1].output is not None
    assert publisher.events[1].output.storageUrl == "s3://batang-artifacts/output/result.ifc"
    command_key = planner_2d_command_key("project-alpha", "job-2d-worker-001", 1)
    preview_key = preview_result_key("project-alpha", "job-2d-worker-001", 1)
    assert f"s3://batang-artifacts/{command_key}" in storage.writes
    assert f"s3://batang-artifacts/{preview_key}" in storage.writes
    assert storage.writes["s3://batang-artifacts/output/result.ifc"] == b"updated-ifc"
    uploaded_plan = json.loads(
        storage.writes[
            "s3://batang-artifacts/projects/project-alpha/jobs/job-2d-worker-001/"
            "steps/001/engine/engine-request.v2.json"
        ]
    )
    assert uploaded_plan["engineRequest"]["request_id"] == "req-2d-001"
    validation_report = json.loads(
        storage.writes[
            "s3://batang-artifacts/projects/project-alpha/jobs/job-2d-worker-001/"
            "steps/001/engine/validation-report.v1.json"
        ]
    )
    assert validation_report["schema_version"] == "v1"
    assert validation_report["artifact_id"] == "artifact-2d-plan-001"
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

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

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
        "ai_planning_2d.worker_runtime.worker.extract_ifc_context",
        lambda _: _raise(UnsupportedIfcSchemaError("Unsupported IFC schema: IFC2X3")),
    )

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "UNSUPPORTED_IFC_SCHEMA"


def test_two_d_llm_worker_reports_unsupported_ifc_length_unit(
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
        "ai_planning_2d.worker_runtime.worker.extract_ifc_context",
        lambda _: _raise(
            UnsupportedIfcLengthUnitError("Unsupported IFC length unit prefix: MILLI")
        ),
    )

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "UNSUPPORTED_IFC_LENGTH_UNIT"


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

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "clarification_required"
    assert publisher.events[1].clarificationRequestId == "2d-job-step-2d-worker-001"


def _clarification_preview(
    status: str = "alternatives",
    alternatives: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    """clarification preview dict 픽스처."""
    return {
        "status": status,
        "summary": "어느 층 거실을 삭제할까요?",
        "command": {
            "action": "remove_room",
            "target_room_name": "거실",
            "confidence": 0.6,
        },
        "command_batch": {"commands": [], "requires_clarification": True},
        "alternatives": alternatives if alternatives is not None else [
            {
                "alternative_id": "remove-living-1f",
                "title": "1층 거실 삭제",
                "description": "1층 거실을 삭제합니다.",
                "fill": {"target_floor": 1, "target_room_name": "거실"},
                "affected_entities": [],
                "warnings": [],
                "metrics": [],
            },
            {
                "alternative_id": "remove-living-2f",
                "title": "2층 거실 삭제",
                "description": "2층 거실을 삭제합니다.",
                "fill": {"target_floor": 2, "target_room_name": "거실"},
                "affected_entities": [],
                "warnings": [],
                "metrics": [],
            },
        ],
    }


def test_two_d_llm_worker_clarification_uploads_artifact(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """clarification 시 MinIO에 detail.v1.json이 업로드되어야 한다."""
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    async def _fake_run_pipeline(
        *,
        clarification_request_id: str,
        **_: object,
    ) -> dict[str, object]:
        raise ClarificationRequiredError(
            code="CLARIFICATION_REQUIRED",
            message="어느 층 거실을 삭제할까요?",
            clarification_request_id=clarification_request_id,
            preview_data=_clarification_preview(),
        )

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "clarification_required"
    expected_key = clarification_detail_key("project-alpha", "job-2d-worker-001", 1)
    expected_url = f"s3://batang-artifacts/{expected_key}"
    assert expected_url in storage.writes


def test_two_d_llm_worker_clarification_event_has_detail_storage_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """clarification 이벤트의 error.detailStorageUrl이 MinIO URL이어야 한다."""
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
            message="어느 층 거실을 삭제할까요?",
            clarification_request_id=clarification_request_id,
            preview_data=_clarification_preview(),
        )

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    worker.handle(_command())

    clarification_event = publisher.events[1]
    assert clarification_event.status == "clarification_required"
    assert clarification_event.error is not None
    assert clarification_event.error.detailStorageUrl is not None
    expected_key = clarification_detail_key("project-alpha", "job-2d-worker-001", 1)
    assert clarification_event.error.detailStorageUrl == f"s3://batang-artifacts/{expected_key}"


def test_two_d_llm_worker_clarification_artifact_structure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """업로드된 아티팩트 JSON이 ClarificationArtifact 스키마를 준수해야 한다."""
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    async def _fake_run_pipeline(
        *,
        clarification_request_id: str,
        **_: object,
    ) -> dict[str, object]:
        raise ClarificationRequiredError(
            code="CLARIFICATION_REQUIRED",
            message="어느 층 거실을 삭제할까요?",
            clarification_request_id=clarification_request_id,
            preview_data=_clarification_preview(),
        )

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    worker.handle(_command())

    expected_key = clarification_detail_key("project-alpha", "job-2d-worker-001", 1)
    raw = storage.writes[f"s3://batang-artifacts/{expected_key}"]
    payload = json.loads(raw)

    artifact = ClarificationArtifact.model_validate(payload)
    assert artifact.schema_version == "v1"
    assert artifact.kind == "alternatives"
    assert artifact.question == "어느 층 거실을 삭제할까요?"
    assert len(artifact.alternatives) == 2
    assert artifact.alternatives[0].fill == {"target_floor": 1, "target_room_name": "거실"}
    assert artifact.job_id == "job-2d-worker-001"
    assert artifact.step_no == 1


def test_two_d_llm_worker_needs_clarification_kind(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """status=needs_clarification(alternatives 없음)일 때 kind=needs_clarification이어야 한다."""
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    worker = TwoDLlmWorker(
        worker_id="2d-llm-worker-1",
        event_publisher=InMemoryPublisher(),
        s3_client=storage,
    )

    async def _fake_run_pipeline(
        *,
        clarification_request_id: str,
        **_: object,
    ) -> dict[str, object]:
        raise ClarificationRequiredError(
            code="CLARIFICATION_REQUIRED",
            message="어느 층 거실을 삭제할까요?",
            clarification_request_id=clarification_request_id,
            preview_data=_clarification_preview(status="needs_clarification", alternatives=[]),
        )

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    worker.handle(_command())

    expected_key = clarification_detail_key("project-alpha", "job-2d-worker-001", 1)
    raw = storage.writes[f"s3://batang-artifacts/{expected_key}"]
    payload = json.loads(raw)
    assert payload["kind"] == "needs_clarification"
    assert payload["alternatives"] == []


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

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

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

    monkeypatch.setattr(
        "ai_planning_2d.worker_runtime.worker.extract_ifc_context", lambda _: {"spaces": []}
    )
    monkeypatch.setattr(
        "ai_planning_2d.worker_runtime.worker.LLM2DPipeline",
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

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

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
        if url.endswith("engine-request.v2.json"):
            raise RuntimeError("plan upload failure")
        storage.writes[url] = data
        return url

    storage.write_bytes = _write_bytes  # type: ignore[method-assign]
    storage.write_json = (  # type: ignore[method-assign]
        lambda key, payload, bucket=None, indent=2: _write_bytes(
            key,
            json.dumps(payload, ensure_ascii=False, indent=indent).encode("utf-8"),
            content_type="application/json; charset=utf-8",
            bucket=bucket,
        )
    )

    async def _fake_run_pipeline(*, output_path: str, **_: object) -> dict[str, object]:
        Path(output_path).write_bytes(b"updated-ifc")
        return _applied_result("req-2d-004")

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "STORAGE_WRITE_FAILED"
    assert result.error.retryable is True
    assert write_calls == [
        (
            "s3://batang-artifacts/projects/project-alpha/jobs/job-2d-worker-001/"
            "steps/001/planner/2d-command.v1.json"
        ),
        (
            "s3://batang-artifacts/projects/project-alpha/jobs/job-2d-worker-001/"
            "steps/001/engine/preview-result.v2.json"
        ),
        (
            "s3://batang-artifacts/projects/project-alpha/jobs/job-2d-worker-001/"
            "steps/001/engine/engine-request.v2.json"
        ),
        (
            "s3://batang-artifacts/projects/project-alpha/jobs/job-2d-worker-001/"
            "steps/001/error/error-detail.v1.json"
        ),
    ]
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

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "MISSING_EDIT_PLAN"
    assert list(storage.writes) == [
        (
            "s3://batang-artifacts/projects/project-alpha/jobs/job-2d-worker-001/"
            "steps/001/error/error-detail.v1.json"
        )
    ]


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

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command(edit_plan_url=None, validation_report_url=None))

    assert result.status == "completed"
    assert not any(url.endswith("engine-request.v2.json") for url in storage.writes)


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

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command(ifc_output_url="not-an-s3-url"))

    assert result.status == "failed"
    assert result.error.code == "INVALID_STORAGE_URL"


def test_two_d_llm_worker_writes_error_detail_on_failure(
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
            "preview": _applied_result("req-2d-007")["preview"],
            "apply": {"status": "applied", "apply_mode": "shared_authoring"},
        }

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)

    result = worker.handle(_command())

    assert result.status == "failed"
    assert result.error.code == "MISSING_EDIT_PLAN"
    assert result.error.detail_storage_url is not None
    detail_payload = json.loads(storage.writes[result.error.detail_storage_url])
    assert detail_payload["schema_version"] == "v1"
    assert detail_payload["error_code"] == "MISSING_EDIT_PLAN"


def test_run_two_d_llm_job_rejects_active_event_loop(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    input_path = tmp_path / "input.ifc"
    output_path = tmp_path / "worker.ifc"
    input_path.write_bytes(b"ISO-10303-21;")

    async def _fake_run_pipeline(**_: object) -> dict[str, object]:
        return _applied_result()

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)
    monkeypatch.setattr(
        "ai_planning_2d.worker_runtime.worker.asyncio.get_running_loop", lambda: object()
    )

    result = run_two_d_llm_job(
        {
            "schema_version": "v1",
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


def test_two_d_worker_app_build_settings_sets_worker_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WORKER_ID", "2d-worker-1")
    monkeypatch.setenv("S3_BUCKET", "batang-artifacts")

    settings = build_settings()

    assert settings.worker_type == WORKER_TYPE


def test_two_d_worker_app_wires_consumer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WORKER_ID", "2d-worker-1")
    monkeypatch.setenv("S3_BUCKET", "batang-artifacts")

    class FakeHealth:
        def __init__(self) -> None:
            self.stopped = False

        def stop(self) -> None:
            self.stopped = True

    class FakePublisher(InMemoryPublisher):
        def __enter__(self):
            return self

        def __exit__(self, *_: object) -> None:
            return None

    fake_health = FakeHealth()
    calls: dict[str, object] = {}

    class FakeConsumer:
        def __init__(
            self,
            *,
            settings: object,
            worker_type: str,
            handler: object,
            stop_after: int | None = None,
        ) -> None:
            calls["worker_type"] = worker_type
            calls["handler"] = handler
            calls["stop_after"] = stop_after

        def run(self) -> None:
            calls["ran"] = True

    exit_code = run_two_d_llm_worker(
        once=True,
        health_server_factory=lambda _settings: fake_health,
        publisher_factory=lambda _settings: FakePublisher(),
        storage_factory=lambda _settings: FakeStorageClient(),
        consumer_factory=FakeConsumer,
    )

    assert exit_code == 0
    assert calls["worker_type"] == WORKER_TYPE
    assert calls["stop_after"] == 1
    assert calls["ran"] is True
    assert fake_health.stopped is True


def test_two_d_worker_queue_is_registered() -> None:
    queue = get_command_queue(WORKER_TYPE)

    assert queue.name == "batang.2d-llm.command.queue"


def test_two_d_worker_app_default_consumer_resolves_queue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WORKER_ID", "2d-worker-1")
    monkeypatch.setenv("S3_BUCKET", "batang-artifacts")

    class FakeHealth:
        def __init__(self) -> None:
            self.stopped = False

        def stop(self) -> None:
            self.stopped = True

    class FakePublisher(InMemoryPublisher):
        def __enter__(self):
            return self

        def __exit__(self, *_: object) -> None:
            return None

    fake_health = FakeHealth()
    run_calls: list[str] = []

    monkeypatch.setattr(
        "ai_common.adapters.rabbitmq.consumer.build_connection",
        lambda _settings: object(),
    )

    original_run = RabbitMQConsumer.run

    def _fake_run(self: RabbitMQConsumer) -> None:
        run_calls.append(self._queue.name)

    monkeypatch.setattr(RabbitMQConsumer, "run", _fake_run)

    exit_code = run_two_d_llm_worker(
        once=True,
        health_server_factory=lambda _settings: fake_health,
        publisher_factory=lambda _settings: FakePublisher(),
        storage_factory=lambda _settings: FakeStorageClient(),
    )

    monkeypatch.setattr(RabbitMQConsumer, "run", original_run)

    assert exit_code == 0
    assert run_calls == ["batang.2d-llm.command.queue"]
    assert fake_health.stopped is True


def test_two_d_worker_app_installs_shutdown_handlers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WORKER_ID", "2d-worker-1")
    monkeypatch.setenv("S3_BUCKET", "batang-artifacts")

    class FakeHealth:
        def stop(self) -> None:
            return None

    class FakePublisher(InMemoryPublisher):
        def __enter__(self):
            return self

        def __exit__(self, *_: object) -> None:
            return None

    registered_handlers: dict[signal.Signals, object] = {}

    class FakeConsumer:
        def __init__(
            self,
            *,
            settings: object,
            worker_type: str,
            handler: object,
            stop_after: int | None = None,
        ) -> None:
            self.should_stop = False

        def run(self) -> None:
            return None

    def _fake_signal(sig: signal.Signals, handler: object) -> None:
        registered_handlers[sig] = handler

    monkeypatch.setattr("ai_planning_2d.worker_runtime.app.signal.signal", _fake_signal)

    consumer_holder: dict[str, FakeConsumer] = {}

    def _consumer_factory(**kwargs: object) -> FakeConsumer:
        consumer = FakeConsumer(**kwargs)
        consumer_holder["consumer"] = consumer
        return consumer

    exit_code = run_two_d_llm_worker(
        once=True,
        health_server_factory=lambda _settings: FakeHealth(),
        publisher_factory=lambda _settings: FakePublisher(),
        storage_factory=lambda _settings: FakeStorageClient(),
        consumer_factory=_consumer_factory,
    )

    assert exit_code == 0
    assert signal.SIGTERM in registered_handlers
    assert signal.SIGINT in registered_handlers

    handler = registered_handlers[signal.SIGTERM]
    handler(signal.SIGTERM, None)
    assert consumer_holder["consumer"].should_stop is True
