from __future__ import annotations

import json
from pathlib import Path

from ai_common.worker_sdk.base_worker import EventPublisher
from ai_domain import CommandMessage
from ai_domain.worker_messages.event import EventMessage
from ai_layout_import.runtime import IfcGenerateWorker
from tests.unit.schema_assert import load_json, validate_json_schema


ROOT = Path(__file__).resolve().parents[4]
EVENT_SCHEMA_PATH = ROOT / "shared" / "schemas" / "messages" / "event_message.schema.json"


class InMemoryPublisher(EventPublisher):
    def __init__(self) -> None:
        self.events: list[EventMessage] = []

    def publish(self, event: EventMessage) -> None:
        self.events.append(event)


class FakeStorageClient:
    def __init__(self) -> None:
        self.binary_uploads: list[tuple[str, bytes, str]] = []
        self.text_uploads: list[tuple[str, str, str]] = []

    def write_bytes_to_ref(
        self,
        reference: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> object:
        self.binary_uploads.append((reference, data, content_type))
        return type(
            "ResolvedTarget",
            (),
            {
                "reference": reference,
                "canonical_url": f"s3://test-bucket/{reference}",
            },
        )()

    def write_text_to_ref(
        self,
        reference: str,
        text: str,
        encoding: str = "utf-8",
        content_type: str = "text/plain; charset=utf-8",
    ) -> object:
        self.text_uploads.append((reference, text, content_type))
        return type(
            "ResolvedTarget",
            (),
            {
                "reference": reference,
                "canonical_url": f"s3://test-bucket/{reference}",
            },
        )()


def _command(
    *,
    layout_import: dict[str, object],
    ifc_ref: str | None,
    report_ref: str | None,
) -> CommandMessage:
    expected_output: dict[str, object] = {}
    if ifc_ref is not None:
        expected_output["ifc_storage_url"] = ifc_ref
    if report_ref is not None:
        expected_output["validation_report_storage_url"] = report_ref

    return CommandMessage.model_validate(
        {
            "message_id": "msg-ifc-generate-001",
            "schema_version": "v1",
            "message_type": "COMMAND",
            "command_type": "IFC_GENERATE_FROM_BUBBLE",
            "routing_key": "command.ifc-generate.from-bubble",
            "job_id": "job-ifc-generate-001",
            "job_step_id": "job-step-ifc-generate-001",
            "step_no": 1,
            "total_steps": 1,
            "project_id": "project-layout-001",
            "requested_by": "user-002",
            "source_revision_id": "rev-layout-source-001",
            "source_scene_state_id": "layout-scene-001",
            "source_scene_type": "LAYOUT_IMPORT",
            "target_revision_id": "rev-layout-target-001",
            "expected_output_artifact_id": "artifact-ifc-generate-001",
            "expected_output": expected_output,
            "payload": {"layout_import": layout_import},
            "attempt_no": 0,
            "max_attempts": 3,
            "idempotency_key": "job-ifc-generate-001:1",
            "correlation_id": "corr-ifc-generate-001",
            "created_at": "2026-04-27T09:15:00Z",
        }
    )


def _valid_v2_layout_import() -> dict[str, object]:
    return {
        "schema_version": "v2",
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "sample-project",
        "rooms": [
            {
                "id": "room-living-01",
                "name": "Living Room",
                "type": "living",
                "width": 4200,
                "height": 3800,
                "floor": 1,
                "x": 5000.0,
                "y": 4000.0,
                "angle": 0.0,
                "locked": False,
            }
        ],
        "boundaries": [
            {
                "floor": 1,
                "polygon": [
                    [0.0, 0.0],
                    [4200.0, 0.0],
                    [4200.0, 3800.0],
                    [0.0, 3800.0],
                ],
            }
        ],
        "modeling_defaults": {
            "space_height_mm": 3000,
            "wall_thickness_mm": 200,
            "slab_thickness_mm": 180,
            "roof_height_mm": 400,
        },
    }


def test_ifc_generate_worker_publishes_completed_event_and_echoes_reserved_refs() -> None:
    publisher = InMemoryPublisher()
    storage = FakeStorageClient()
    worker = IfcGenerateWorker(
        worker_id="ifc-generate-worker-1",
        event_publisher=publisher,
        storage_client=storage,
    )
    command = _command(
        layout_import=_valid_v2_layout_import(),
        ifc_ref="projects/project-layout-001/revisions/rev-layout-target-001/ifc/model.v1.ifc",
        report_ref=(
            "projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/001/engine/validation-report.v1.json"
        ),
    )

    result = worker.handle(command)

    assert result.status == "completed"
    assert len(publisher.events) == 2
    assert publisher.events[0].status == "started"
    assert publisher.events[1].status == "completed"
    assert publisher.events[1].output is not None
    assert (
        publisher.events[1].output.storageUrl
        == "projects/project-layout-001/revisions/rev-layout-target-001/ifc/model.v1.ifc"
    )
    assert (
        publisher.events[1].output.validationReportStorageUrl
        == (
            "projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/001/engine/validation-report.v1.json"
        )
    )
    assert (
        storage.binary_uploads[0][0]
        == "projects/project-layout-001/revisions/rev-layout-target-001/ifc/model.v1.ifc"
    )
    assert (
        storage.text_uploads[0][0]
        == (
            "projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/001/engine/validation-report.v1.json"
        )
    )

    schema = load_json(EVENT_SCHEMA_PATH)
    validate_json_schema(publisher.events[1].model_dump(by_alias=True, exclude_none=True), schema)

    report = json.loads(storage.text_uploads[0][1])
    assert report["status"] == "completed"
    assert report["layoutImport"]["schemaVersion"] == "v2"
    assert report["layoutImport"]["roomCount"] == 1


def test_ifc_generate_worker_maps_validation_failure_and_uploads_detail_report() -> None:
    publisher = InMemoryPublisher()
    storage = FakeStorageClient()
    worker = IfcGenerateWorker(
        worker_id="ifc-generate-worker-1",
        event_publisher=publisher,
        storage_client=storage,
    )
    invalid_layout_import = _valid_v2_layout_import()
    invalid_layout_import["modeling_defaults"] = {
        "space_height_mm": 3000,
        "slab_thickness_mm": 180,
        "roof_height_mm": 400,
    }
    command = _command(
        layout_import=invalid_layout_import,
        ifc_ref="projects/project-layout-001/revisions/rev-layout-target-001/ifc/model.v1.ifc",
        report_ref=(
            "projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/001/engine/validation-report.v1.json"
        ),
    )

    result = worker.handle(command)

    assert result.status == "failed"
    assert len(publisher.events) == 2
    assert publisher.events[1].status == "failed"
    assert publisher.events[1].error is not None
    assert publisher.events[1].error.code == "validation_error"
    assert publisher.events[1].error.retryable is False
    assert (
        publisher.events[1].error.detailStorageUrl
        == (
            "projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/001/engine/validation-report.v1.json"
        )
    )
    assert storage.binary_uploads == []
    assert (
        storage.text_uploads[0][0]
        == (
            "projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/001/engine/validation-report.v1.json"
        )
    )

    schema = load_json(EVENT_SCHEMA_PATH)
    validate_json_schema(publisher.events[1].model_dump(by_alias=True, exclude_none=True), schema)

    report = json.loads(storage.text_uploads[0][1])
    assert report["status"] == "failed"
    assert report["error"]["code"] == "validation_error"
    assert "wall_thickness_mm" in report["error"]["message"]


def test_ifc_generate_worker_accepts_canonical_s3_refs() -> None:
    publisher = InMemoryPublisher()
    storage = FakeStorageClient()
    worker = IfcGenerateWorker(
        worker_id="ifc-generate-worker-1",
        event_publisher=publisher,
        storage_client=storage,
    )
    command = _command(
        layout_import=_valid_v2_layout_import(),
        ifc_ref="s3://batang/projects/project-layout-001/revisions/rev-layout-target-001/ifc/model.v1.ifc",
        report_ref=(
            "s3://batang/projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/001/engine/validation-report.v1.json"
        ),
    )

    result = worker.handle(command)

    assert result.status == "completed"
    assert publisher.events[1].status == "completed"
    assert storage.binary_uploads[0][0].startswith("s3://batang/")
    assert storage.text_uploads[0][0].startswith("s3://batang/")


def test_ifc_generate_worker_rejects_legacy_ifc_storage_path() -> None:
    publisher = InMemoryPublisher()
    storage = FakeStorageClient()
    worker = IfcGenerateWorker(
        worker_id="ifc-generate-worker-1",
        event_publisher=publisher,
        storage_client=storage,
    )
    command = _command(
        layout_import=_valid_v2_layout_import(),
        ifc_ref="projects/project-layout-001/revisions/rev-layout-target-001/model.ifc",
        report_ref=(
            "projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/001/engine/validation-report.v1.json"
        ),
    )

    result = worker.handle(command)

    assert result.status == "failed"
    assert publisher.events[1].error is not None
    assert publisher.events[1].error.code == "invalid_ifc_storage_url"
    assert storage.binary_uploads == []
    assert (
        storage.text_uploads[0][0]
        == (
            "projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/001/engine/validation-report.v1.json"
        )
    )
    report = json.loads(storage.text_uploads[0][1])
    assert report["status"] == "failed"
    assert report["error"]["code"] == "invalid_ifc_storage_url"


def test_ifc_generate_worker_rejects_validation_report_without_project_prefix() -> None:
    publisher = InMemoryPublisher()
    storage = FakeStorageClient()
    worker = IfcGenerateWorker(
        worker_id="ifc-generate-worker-1",
        event_publisher=publisher,
        storage_client=storage,
    )
    command = _command(
        layout_import=_valid_v2_layout_import(),
        ifc_ref="projects/project-layout-001/revisions/rev-layout-target-001/ifc/model.v1.ifc",
        report_ref="jobs/job-ifc-generate-001/steps/001/engine/validation-report.v1.json",
    )

    result = worker.handle(command)

    assert result.status == "failed"
    assert publisher.events[1].error is not None
    assert publisher.events[1].error.code == "invalid_validation_report_storage_url"
    assert storage.binary_uploads == []
    assert storage.text_uploads == []


def test_ifc_generate_worker_rejects_validation_report_without_zero_padding() -> None:
    publisher = InMemoryPublisher()
    storage = FakeStorageClient()
    worker = IfcGenerateWorker(
        worker_id="ifc-generate-worker-1",
        event_publisher=publisher,
        storage_client=storage,
    )
    command = _command(
        layout_import=_valid_v2_layout_import(),
        ifc_ref="projects/project-layout-001/revisions/rev-layout-target-001/ifc/model.v1.ifc",
        report_ref=(
            "projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/1/engine/validation-report.v1.json"
        ),
    )

    result = worker.handle(command)

    assert result.status == "failed"
    assert publisher.events[1].error is not None
    assert publisher.events[1].error.code == "invalid_validation_report_storage_url"
    assert storage.binary_uploads == []
    assert storage.text_uploads == []


def test_ifc_generate_worker_rejects_validation_report_with_mismatched_step_number() -> None:
    publisher = InMemoryPublisher()
    storage = FakeStorageClient()
    worker = IfcGenerateWorker(
        worker_id="ifc-generate-worker-1",
        event_publisher=publisher,
        storage_client=storage,
    )
    command = _command(
        layout_import=_valid_v2_layout_import(),
        ifc_ref="projects/project-layout-001/revisions/rev-layout-target-001/ifc/model.v1.ifc",
        report_ref=(
            "projects/project-layout-001/jobs/job-ifc-generate-001/"
            "steps/002/engine/validation-report.v1.json"
        ),
    )

    result = worker.handle(command)

    assert result.status == "failed"
    assert publisher.events[1].error is not None
    assert publisher.events[1].error.code == "invalid_validation_report_storage_url"
    assert storage.binary_uploads == []
    assert storage.text_uploads == []
