"""clarification 전체 흐름 smoke 테스트.

MinIO/BE 없이 TwoDLlmWorker + FakeStorageClient로 실제 경로를 검증한다.
- preview_data를 가진 ClarificationRequiredError → MinIO 아티팩트 업로드
- 이벤트에 detailStorageUrl 포함
- IFC output이 업로드되지 않음 (clarification은 미완료 상태)
- 업로드 아티팩트가 clarification/detail.v1.json 하나뿐임
"""

from __future__ import annotations

import json

import pytest

from ai_common.errors import ClarificationRequiredError
from ai_common.storage.paths import clarification_detail_key
from ai_planning_2d.schemas import ClarificationArtifact
from ai_planning_2d.worker import TwoDLlmWorker

from test_worker import FakeStorageClient, InMemoryPublisher, _command


# ---------------------------------------------------------------------------
# smoke 시나리오용 preview fixture
# ---------------------------------------------------------------------------


def _alternatives_preview() -> dict:
    return {
        "status": "alternatives",
        "summary": "어느 층 거실을 삭제할까요?",
        "command": {
            "action": "remove_room",
            "target_room_name": "거실",
            "confidence": 0.7,
            "needs_clarification": False,
            "clarification_question": None,
        },
        "command_batch": {"commands": [], "requires_clarification": True},
        "alternatives": [
            {
                "alternative_id": "remove_room-거실-1f",
                "title": "1층 거실 삭제",
                "description": "1층 거실에 대해 작업합니다.",
                "fill": {"target_floor": 1, "target_room_name": "거실"},
                "affected_entities": ["sp-living-1f"],
                "warnings": [],
                "metrics": [],
            },
            {
                "alternative_id": "remove_room-거실-2f",
                "title": "2층 거실 삭제",
                "description": "2층 거실에 대해 작업합니다.",
                "fill": {"target_floor": 2, "target_room_name": "거실"},
                "affected_entities": ["sp-living-2f"],
                "warnings": [],
                "metrics": [],
            },
        ],
    }


def _worker_with_fake_pipeline(
    monkeypatch: pytest.MonkeyPatch,
    preview: dict,
) -> tuple[TwoDLlmWorker, FakeStorageClient, InMemoryPublisher]:
    storage = FakeStorageClient()
    storage.read_map["s3://batang-artifacts/input/house.ifc"] = b"ISO-10303-21;source-ifc"
    publisher = InMemoryPublisher()
    worker = TwoDLlmWorker(
        worker_id="2d-llm-smoke-1",
        event_publisher=publisher,
        s3_client=storage,
    )

    async def _fake_run_pipeline(*, clarification_request_id: str, **_):
        raise ClarificationRequiredError(
            code="CLARIFICATION_REQUIRED",
            message=str(preview.get("summary", "clarification required")),
            clarification_request_id=clarification_request_id,
            preview_data=preview,
        )

    monkeypatch.setattr("ai_planning_2d.worker_runtime.worker._run_pipeline", _fake_run_pipeline)
    return worker, storage, publisher


# ---------------------------------------------------------------------------
# 테스트
# ---------------------------------------------------------------------------


def test_worker_clarification_emits_valid_artifact_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """MinIO에 업로드된 JSON이 ClarificationArtifact 스키마를 정확히 준수해야 한다."""
    worker, storage, _ = _worker_with_fake_pipeline(monkeypatch, _alternatives_preview())

    worker.handle(_command())

    key = clarification_detail_key("project-alpha", "job-2d-worker-001", 1)
    raw = storage.writes[f"s3://batang-artifacts/{key}"]
    artifact = ClarificationArtifact.model_validate(json.loads(raw))

    assert artifact.schema_version == "v1"
    assert artifact.kind == "alternatives"
    assert artifact.question == "어느 층 거실을 삭제할까요?"
    assert len(artifact.alternatives) == 2
    assert artifact.alternatives[0].fill["target_floor"] == 1
    assert artifact.alternatives[1].fill["target_floor"] == 2
    assert artifact.job_id == "job-2d-worker-001"
    assert artifact.step_no == 1
    assert artifact.timestamp is not None


def test_worker_clarification_does_not_write_ifc_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """clarification 시 IFC output이 MinIO에 업로드되어서는 안 된다."""
    worker, storage, _ = _worker_with_fake_pipeline(monkeypatch, _alternatives_preview())

    worker.handle(_command())

    ifc_url = "s3://batang-artifacts/output/result.ifc"
    assert ifc_url not in storage.writes


def test_worker_clarification_writes_only_clarification_artifact(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """clarification 시 MinIO 업로드는 detail.v1.json 하나만이어야 한다."""
    worker, storage, _ = _worker_with_fake_pipeline(monkeypatch, _alternatives_preview())

    worker.handle(_command())

    assert len(storage.writes) == 1
    written_url = next(iter(storage.writes))
    assert written_url.endswith("clarification/detail.v1.json")


def test_worker_clarification_event_url_matches_artifact_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """이벤트의 detailStorageUrl이 실제 업로드된 MinIO URL과 일치해야 한다."""
    worker, storage, publisher = _worker_with_fake_pipeline(
        monkeypatch, _alternatives_preview()
    )

    worker.handle(_command())

    clarification_event = publisher.events[1]
    assert clarification_event.status == "clarification_required"
    event_url = clarification_event.error.detailStorageUrl

    assert event_url is not None
    assert event_url in storage.writes
