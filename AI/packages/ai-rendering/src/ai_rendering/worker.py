"""ai-rendering 패키지의 공용 worker 진입점."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_common.errors import NonRetryableWorkerError, ValidationWorkerError
from ai_common.worker_sdk.base_worker import BaseWorker, EventPublisher
from ai_common.worker_sdk.event_factory import CompletedResult, WorkerResult
from ai_domain.worker_messages.event import EventOutputRef

from ai_rendering.ifc2img.exceptions import IFCRenderError
from ai_rendering.ifc2img.service import IFC2IMG_WORKER_RENDER_MODE, Ifc2ImgWorkerSuccessResponse
from ai_rendering.ifc2img.worker import run_ifc2img_worker_command

Ifc2ImgCommandRunner = Callable[..., Ifc2ImgWorkerSuccessResponse]


class RenderingWorker(BaseWorker):
    """SD_RENDER_GENERATE 명령을 renderMode별 내부 렌더링 경로로 라우팅한다."""

    def __init__(
        self,
        *,
        worker_id: str,
        event_publisher: EventPublisher,
        s3_settings: object,
        work_root: Path | str,
        ifc2img_runner: Ifc2ImgCommandRunner = run_ifc2img_worker_command,
    ) -> None:
        super().__init__(worker_id=worker_id, event_publisher=event_publisher)
        self._s3_settings = s3_settings
        self._work_root = Path(work_root)
        self._ifc2img_runner = ifc2img_runner

    def process(self, command: object) -> WorkerResult:
        """명령 payload의 renderMode를 확인하고 지원하는 렌더링 경로를 실행한다."""

        render_mode = _read_render_mode(command)
        if render_mode == IFC2IMG_WORKER_RENDER_MODE:
            return self._process_ifc2img_command(command)

        raise _unsupported_render_mode_error(render_mode)

    def _process_ifc2img_command(self, command: object) -> CompletedResult:
        """ifc2img 명령을 실행하고 manifest URL을 worker 완료 output으로 변환한다."""

        work_dir = self._resolve_work_dir(command)
        try:
            response = self._ifc2img_runner(command, self._s3_settings, work_dir)
        except ValueError as exc:
            raise ValidationWorkerError(
                code="INVALID_IFC2IMG_COMMAND",
                message=str(exc),
            ) from exc
        except IFCRenderError as exc:
            raise NonRetryableWorkerError(
                code="IFC2IMG_RENDER_FAILED",
                message=str(exc),
            ) from exc

        return CompletedResult(
            output=EventOutputRef(storageUrl=response["manifestStorageUrl"]),
            progress=1.0,
        )

    def _resolve_work_dir(self, command: object) -> Path:
        """job 단위 임시 작업 디렉터리를 만들어 병렬 실행 결과가 섞이지 않게 한다."""

        job_id = _safe_path_part(getattr(command, "jobId", None), "job")
        step_id = _safe_path_part(getattr(command, "jobStepId", None), "step")
        return self._work_root / job_id / step_id


def _read_render_mode(command: object) -> str | None:
    payload = getattr(command, "payload", None)
    return getattr(payload, "renderMode", None)


def _unsupported_render_mode_error(render_mode: str | None) -> ValidationWorkerError:
    return ValidationWorkerError(
        code="UNSUPPORTED_RENDER_MODE",
        message=(
            "ai-rendering worker currently supports "
            f"renderMode='{IFC2IMG_WORKER_RENDER_MODE}' only; got {render_mode!r}"
        ),
    )


def _safe_path_part(value: Any, fallback: str) -> str:
    """명령 ID를 파일 경로 조각으로 쓸 수 있도록 위험한 구분자만 치환한다."""

    text = str(value or fallback)
    return text.replace("\\", "_").replace("/", "_")


__all__ = ["RenderingWorker"]
