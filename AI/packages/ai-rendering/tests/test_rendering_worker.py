"""ai_rendering.worker 진입점 테스트."""

from __future__ import annotations

from pathlib import Path

import pytest

from ai_common.errors import NonRetryableWorkerError, RetryableWorkerError, ValidationWorkerError
from ai_common.worker_sdk.event_factory import CompletedResult, FailedResult
from ai_domain.worker_messages.event import EventMessage

from ai_rendering.ifc2img.exceptions import IFCRenderError
from ai_rendering.ifc2img.storage import Ifc2ImgStorageError
from ai_rendering.worker import RenderingWorker


class FakeEventPublisher:
    """BaseWorker.handle()이 발행하는 lifecycle event를 메모리에 보관한다."""

    def __init__(self) -> None:
        self.events: list[EventMessage] = []

    def publish(self, event: EventMessage) -> None:
        self.events.append(event)


class CommandLike:
    """CommandMessage 전체를 만들지 않고 worker routing에 필요한 필드만 흉내 낸다."""

    messageId = "msg-1"
    commandType = "SD_RENDER_GENERATE"
    routingKey = "command.sd-render.generate"
    jobId = "job-1"
    jobStepId = "step-1"
    stepNo = 1
    totalSteps = 1
    projectId = "project-1"
    requestedBy = "user-1"
    expectedOutputArtifactId = "artifact-1"
    attemptNo = 0
    maxAttempts = 1
    idempotencyKey = "idem-1"
    correlationId = "corr-1"
    sourceRevisionId = None
    sourceSceneStateId = None
    sourceSceneType = None
    targetRevisionId = None

    def __init__(self, render_mode: str = "ifc2img") -> None:
        self.payload = PayloadLike(render_mode)


class PayloadLike:
    def __init__(self, render_mode: str) -> None:
        self.renderMode = render_mode


def test_rendering_worker_routes_ifc2img_command_to_runner(tmp_path: Path) -> None:
    """ifc2img 명령은 전용 runner로 전달되고 manifest URL이 완료 output이 된다."""

    calls: list[tuple[object, object, Path]] = []
    settings = object()
    command = CommandLike()

    def runner(
        received_command: object,
        received_settings: object,
        received_work_dir: Path,
    ) -> dict[str, object]:
        calls.append((received_command, received_settings, received_work_dir))
        return {
            "status": "succeeded",
            "renderMode": "ifc2img",
            "preset": "korean_house",
            "manifestStorageUrl": "s3://bucket/output/manifest.json",
            "photos": [],
        }

    worker = RenderingWorker(
        worker_id="rendering-worker-1",
        event_publisher=FakeEventPublisher(),
        s3_settings=settings,
        work_root=tmp_path,
        ifc2img_runner=runner,
    )

    result = worker.process(command)

    assert isinstance(result, CompletedResult)
    assert result.output.storageUrl == "s3://bucket/output/manifest.json"
    assert result.progress == 1.0
    assert calls == [(command, settings, tmp_path / "job-1" / "step-1")]


def test_rendering_worker_rejects_unsupported_render_mode(tmp_path: Path) -> None:
    """ifc2img가 아닌 renderMode는 아직 구현된 경로가 아니므로 즉시 거절한다."""

    runner_calls: list[object] = []

    def runner(*args: object) -> dict[str, object]:
        runner_calls.append(args)
        return {}

    worker = RenderingWorker(
        worker_id="rendering-worker-1",
        event_publisher=FakeEventPublisher(),
        s3_settings=object(),
        work_root=tmp_path,
        ifc2img_runner=runner,
    )

    with pytest.raises(ValidationWorkerError, match="renderMode='ifc2img'"):
        worker.process(CommandLike(render_mode="sd"))

    assert runner_calls == []


def test_rendering_worker_maps_ifc2img_validation_error(tmp_path: Path) -> None:
    """ifc2img command mapping 단계의 ValueError는 입력 검증 실패로 변환한다."""

    def runner(*args: object) -> dict[str, object]:
        raise ValueError("sourceIfcStorageUrl is required")

    worker = RenderingWorker(
        worker_id="rendering-worker-1",
        event_publisher=FakeEventPublisher(),
        s3_settings=object(),
        work_root=tmp_path,
        ifc2img_runner=runner,
    )

    with pytest.raises(ValidationWorkerError, match="sourceIfcStorageUrl"):
        worker.process(CommandLike())


def test_rendering_worker_maps_ifc2img_render_error(tmp_path: Path) -> None:
    """렌더링 내부 실패는 재시도하지 않는 worker 실패로 변환한다."""

    def runner(*args: object) -> dict[str, object]:
        raise IFCRenderError("render failed")

    worker = RenderingWorker(
        worker_id="rendering-worker-1",
        event_publisher=FakeEventPublisher(),
        s3_settings=object(),
        work_root=tmp_path,
        ifc2img_runner=runner,
    )

    with pytest.raises(NonRetryableWorkerError, match="render failed"):
        worker.process(CommandLike())


def test_rendering_worker_maps_retryable_storage_error(tmp_path: Path) -> None:
    """S3 download/upload 장애는 retryable worker error로 변환한다."""

    def runner(*args: object) -> dict[str, object]:
        raise Ifc2ImgStorageError(
            code="IFC_SOURCE_DOWNLOAD_FAILED",
            message="failed to download source IFC",
        )

    worker = RenderingWorker(
        worker_id="rendering-worker-1",
        event_publisher=FakeEventPublisher(),
        s3_settings=object(),
        work_root=tmp_path,
        ifc2img_runner=runner,
    )

    with pytest.raises(RetryableWorkerError) as exc_info:
        worker.process(CommandLike())

    assert exc_info.value.code == "IFC_SOURCE_DOWNLOAD_FAILED"
    assert exc_info.value.retryable is True


def test_rendering_worker_maps_invalid_storage_url(tmp_path: Path) -> None:
    """잘못된 storage URL은 재시도하지 않는 validation worker error로 변환한다."""

    def runner(*args: object) -> dict[str, object]:
        raise Ifc2ImgStorageError(
            code="INVALID_STORAGE_URL",
            message="invalid IFC source storage URL",
            retryable=False,
        )

    worker = RenderingWorker(
        worker_id="rendering-worker-1",
        event_publisher=FakeEventPublisher(),
        s3_settings=object(),
        work_root=tmp_path,
        ifc2img_runner=runner,
    )

    with pytest.raises(ValidationWorkerError) as exc_info:
        worker.process(CommandLike())

    assert exc_info.value.code == "INVALID_STORAGE_URL"
    assert exc_info.value.retryable is False


def test_rendering_worker_handle_publishes_completed_event(tmp_path: Path) -> None:
    """BaseWorker.handle()을 통하면 started/completed 이벤트까지 발행된다."""

    publisher = FakeEventPublisher()

    def runner(*args: object) -> dict[str, object]:
        return {
            "status": "succeeded",
            "renderMode": "ifc2img",
            "preset": "korean_house",
            "manifestStorageUrl": "s3://bucket/output/manifest.json",
            "photos": [],
        }

    worker = RenderingWorker(
        worker_id="rendering-worker-1",
        event_publisher=publisher,
        s3_settings=object(),
        work_root=tmp_path,
        ifc2img_runner=runner,
    )

    result = worker.handle(CommandLike())

    assert isinstance(result, CompletedResult)
    assert [event.status for event in publisher.events] == ["started", "completed"]
    assert publisher.events[-1].output is not None
    assert publisher.events[-1].output.storageUrl == "s3://bucket/output/manifest.json"


def test_rendering_worker_handle_publishes_failed_event(tmp_path: Path) -> None:
    """지원하지 않는 renderMode도 handle()에서는 failed 이벤트로 정리된다."""

    publisher = FakeEventPublisher()
    worker = RenderingWorker(
        worker_id="rendering-worker-1",
        event_publisher=publisher,
        s3_settings=object(),
        work_root=tmp_path,
    )

    result = worker.handle(CommandLike(render_mode="sd"))

    assert isinstance(result, FailedResult)
    assert [event.status for event in publisher.events] == ["started", "failed"]
    assert publisher.events[-1].error is not None
    assert publisher.events[-1].error.code == "UNSUPPORTED_RENDER_MODE"
