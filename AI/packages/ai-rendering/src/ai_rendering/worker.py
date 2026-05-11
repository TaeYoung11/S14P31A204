"""ai-rendering 패키지의 공용 worker 진입점."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_common.errors import (
    NonRetryableWorkerError,
    RetryableWorkerError,
    ValidationWorkerError,
)
from ai_common.worker_sdk.base_worker import BaseWorker, EventPublisher
from ai_common.worker_sdk.event_factory import CompletedResult, WorkerResult
from ai_domain.worker_messages.event import EventOutputRef

from ai_rendering.ifc2img.exceptions import IFCRenderError
from ai_rendering.ifc2img.service import Ifc2ImgWorkerSuccessResponse
from ai_rendering.ifc2img.storage import Ifc2ImgStorageError
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

        if _has_source_ifc(command):
            return self._process_ifc2img_command(command)

        raise _unsupported_render_input_error()

    def _process_ifc2img_command(self, command: object) -> CompletedResult:
        """ifc2img 명령을 실행하고 manifest URL을 worker 완료 output으로 변환한다."""

        work_dir = self._resolve_work_dir(command)
        try:
            response = self._ifc2img_runner(command, self._s3_settings, work_dir)
        except Ifc2ImgStorageError as exc:
            raise _storage_worker_error(exc) from exc
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

        return _to_completed_result(response)

    def _resolve_work_dir(self, command: object) -> Path:
        """job 단위 임시 작업 디렉터리를 만들어 병렬 실행 결과가 섞이지 않게 한다."""

        job_id = _safe_path_part(getattr(command, "jobId", None), "job")
        step_id = _safe_path_part(getattr(command, "jobStepId", None), "step")
        return self._work_root / job_id / step_id


def _read_command_field(source: object | None, field_name: str) -> object:
    if source is None:
        return None
    if isinstance(source, dict):
        return source.get(field_name)
    return getattr(source, field_name, None)


def _has_source_ifc(command: object) -> bool:
    input_ref = _read_command_field(command, "input")
    source_ifc_url = _read_command_field(input_ref, "sourceIfcStorageUrl")
    return isinstance(source_ifc_url, str) and bool(source_ifc_url)


def _unsupported_render_input_error() -> ValidationWorkerError:
    return ValidationWorkerError(
        code="UNSUPPORTED_RENDER_INPUT",
        message=(
            "ai-rendering worker currently supports ifc2img commands with "
            "command.input.sourceIfcStorageUrl only"
        ),
    )


def _to_completed_result(response: Ifc2ImgWorkerSuccessResponse) -> CompletedResult:
    """ifc2img 성공 응답을 worker SDK 완료 결과로 변환한다."""

    return CompletedResult(
        output=EventOutputRef(storageUrl=response["manifestStorageUrl"]),
        progress=1.0,
    )


def _storage_worker_error(
    error: Ifc2ImgStorageError,
) -> RetryableWorkerError | ValidationWorkerError:
    if error.retryable:
        return RetryableWorkerError(code=error.code, message=error.message)
    return ValidationWorkerError(code=error.code, message=error.message)


def _safe_path_part(value: Any, fallback: str) -> str:
    """명령 ID를 파일 경로 조각으로 쓸 수 있도록 위험한 구분자만 치환한다."""

    text = str(value or fallback)
    return text.replace("\\", "_").replace("/", "_")


__all__ = ["RenderingWorker"]
