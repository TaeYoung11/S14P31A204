"""Worker adapters for the 2D IFC editing pipeline."""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from collections.abc import Coroutine
from pathlib import Path
from typing import Any, Protocol, TypeVar

from ai_common.config import S3Settings
from ai_common.adapters.storage.s3_client import S3Client, parse_s3_url
from ai_common.errors import (
    ClarificationRequiredError,
    NonRetryableWorkerError,
    RetryableWorkerError,
    ValidationWorkerError,
)
from ai_common.worker_sdk.base_worker import BaseWorker, EventPublisher
from ai_common.worker_sdk.event_factory import CompletedResult, WorkerResult
from ai_domain import CommandMessage, EventOutputRef, TwoDLlmCommandPayload
from pydantic import ValidationError

from .ifc_extractor import (
    UnsupportedIfcLengthUnitError,
    UnsupportedIfcSchemaError,
    extract_ifc_context,
)
from .session_pipeline import LLM2DPipeline

_T = TypeVar("_T")
_STEP_IFC_HEADER = b"ISO-10303-21;"
_logger = logging.getLogger(__name__)


class StorageClient(Protocol):
    def read_bytes(self, url: str) -> bytes: ...

    def write_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        bucket: str | None = None,
    ) -> str: ...


def run_two_d_llm_job(
    payload: dict[str, Any],
    *,
    input_path: str | Path,
    output_path: str | Path,
) -> dict[str, Any]:
    """Validate payload and execute the 2D pipeline on local files."""

    try:
        request = TwoDLlmCommandPayload.model_validate(payload)
    except ValidationError as exc:
        return _error_result(
            code="validation_error",
            message="input validation failed",
            details=exc.errors(),
        )

    try:
        result = _run_async(
            _run_pipeline(
                user_instruction=request.userInstruction,
                input_path=str(Path(input_path)),
                output_path=str(Path(output_path)),
                project_id="local-2d",
                base_revision_id=None,
                clarification_request_id=f"2d-local-{Path(input_path).stem}",
            )
        )
    except ClarificationRequiredError as exc:
        return {
            "ok": False,
            "code": "clarification_required",
            "message": exc.message,
            "clarification_request_id": exc.clarification_request_id,
        }
    except NonRetryableWorkerError as exc:
        return _error_result(
            code=exc.code,
            message=exc.message,
            details=[],
        )
    except Exception as exc:  # pragma: no cover - defensive wrapper
        return _error_result(
            code="pipeline_error",
            message="2D pipeline execution failed",
            details=[{"type": type(exc).__name__, "msg": str(exc)}],
        )

    return {
        "ok": True,
        "output_path": str(Path(output_path)),
        "result": result,
    }


class TwoDLlmWorker(BaseWorker):
    """BaseWorker-compatible 2D LLM worker."""

    def __init__(
        self,
        *,
        worker_id: str,
        event_publisher: EventPublisher,
        s3_client: StorageClient,
    ) -> None:
        super().__init__(worker_id=worker_id, event_publisher=event_publisher)
        self.s3_client = s3_client

    def process(self, command: object) -> WorkerResult:
        if not isinstance(command, CommandMessage):
            raise NonRetryableWorkerError(
                code="INVALID_COMMAND_TYPE",
                message="TwoDLlmWorker expects a CommandMessage instance",
            )
        if not isinstance(command.payload, TwoDLlmCommandPayload):
            raise NonRetryableWorkerError(
                code="INVALID_PAYLOAD_TYPE",
                message="TwoDLlmWorker expects a TwoDLlmCommandPayload payload",
            )

        payload = command.payload
        if payload.sourceSceneStorageUrl is not None and (
            command.input is None or command.input.sourceIfcStorageUrl is None
        ):
            _logger.warning(
                "deprecated_source_scene_storage_url_ignored",
                extra={
                    "job_step_id": command.jobStepId,
                    "source_scene_storage_url": payload.sourceSceneStorageUrl,
                },
            )
        source_url = _resolve_source_ifc_url(command)

        with tempfile.TemporaryDirectory(prefix="ai-2d-worker-") as temp_dir:
            temp_root = Path(temp_dir)
            source_path = temp_root / "input.ifc"
            source_path.write_bytes(_download_source_ifc(self.s3_client, source_url))

            output_path = temp_root / "output.ifc"
            result = _run_async(
                _run_pipeline(
                    user_instruction=payload.userInstruction,
                    input_path=str(source_path),
                    output_path=str(output_path),
                    project_id=command.projectId,
                    base_revision_id=command.sourceRevisionId,
                    clarification_request_id=f"2d-{command.jobStepId}",
                )
            )
            plan_bytes: bytes | None = None
            if command.expectedOutput.editPlanStorageUrl is not None:
                plan_bytes = _build_edit_plan_bytes(result)

            uploaded_plan_url: str | None = None
            if command.expectedOutput.editPlanStorageUrl is not None and plan_bytes is not None:
                uploaded_plan_url = _write_to_storage_url(
                    self.s3_client,
                    command.expectedOutput.editPlanStorageUrl,
                    plan_bytes,
                    content_type="application/json; charset=utf-8",
                )

            uploaded_ifc_url: str | None = None
            if command.expectedOutput.ifcStorageUrl is not None:
                uploaded_ifc_url = _write_to_storage_url(
                    self.s3_client,
                    command.expectedOutput.ifcStorageUrl,
                    output_path.read_bytes(),
                    content_type="application/x-step",
                )

        uploaded_output_url = uploaded_ifc_url or uploaded_plan_url
        if uploaded_output_url is None:
            raise AssertionError("expectedOutput guarantees at least one uploaded artifact")

        return CompletedResult(
            output=EventOutputRef.model_validate(
                {
                    "storageUrl": uploaded_output_url,
                }
            ),
            progress=1.0,
        )


def build_two_d_llm_worker(
    *,
    worker_id: str,
    event_publisher: EventPublisher,
    s3_settings: S3Settings,
) -> TwoDLlmWorker:
    return TwoDLlmWorker(
        worker_id=worker_id,
        event_publisher=event_publisher,
        s3_client=S3Client(s3_settings),
    )


async def _run_pipeline(
    *,
    user_instruction: str,
    input_path: str,
    output_path: str,
    project_id: str,
    base_revision_id: str | None,
    clarification_request_id: str,
) -> dict[str, Any]:
    try:
        ifc_context = extract_ifc_context(input_path)
    except UnsupportedIfcSchemaError as exc:
        raise ValidationWorkerError(
            code="UNSUPPORTED_IFC_SCHEMA",
            message=str(exc),
        ) from exc
    except UnsupportedIfcLengthUnitError as exc:
        raise ValidationWorkerError(
            code="UNSUPPORTED_IFC_LENGTH_UNIT",
            message=str(exc),
        ) from exc
    except ValueError as exc:
        raise ValidationWorkerError(
            code="INVALID_SOURCE_IFC_FILE",
            message=f"failed to parse source IFC: {exc}",
        ) from exc
    except Exception as exc:
        raise ValidationWorkerError(
            code="INVALID_SOURCE_IFC_FILE",
            message=f"failed to parse source IFC: {exc}",
        ) from exc
    try:
        pipeline = LLM2DPipeline(
            ifc_path=input_path,
            ifc_context=ifc_context,
            project_id=project_id,
            base_revision_id=base_revision_id,
        )
    except Exception as exc:
        raise RetryableWorkerError(
            code="ENGINE_INIT_FAILED",
            message=f"failed to initialize 2D planning engine: {exc}",
        ) from exc
    preview = await pipeline.execute_preview(user_instruction)

    status = preview.get("status")
    if status == "needs_clarification":
        raise ClarificationRequiredError(
            code="CLARIFICATION_REQUIRED",
            message=str(preview.get("summary") or "clarification required"),
            clarification_request_id=clarification_request_id,
        )
    if status in {"unsupported", "failed_quality_check"}:
        raise NonRetryableWorkerError(
            code="PREVIEW_REJECTED",
            message=str(preview.get("summary") or status),
        )
    if status != "preview_ready":
        raise NonRetryableWorkerError(
            code="UNEXPECTED_PREVIEW_STATUS",
            message=f"unexpected preview status: {status}",
        )

    apply_result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    apply_status = apply_result.get("status")
    if apply_status == "applied":
        return {
            "preview": preview,
            "apply": apply_result,
        }
    if apply_status == "session_not_found":
        raise NonRetryableWorkerError(
            code="SESSION_LOST",
            message=str(apply_result.get("summary") or apply_status),
        )
    raise NonRetryableWorkerError(
        code="APPLY_FAILED",
        message=str(apply_result.get("summary") or apply_status),
    )


def _write_to_storage_url(
    client: StorageClient,
    target_url: str,
    data: bytes,
    *,
    content_type: str,
) -> str:
    try:
        loc = parse_s3_url(target_url)
    except ValueError as exc:
        raise ValidationWorkerError(
            code="INVALID_STORAGE_URL",
            message=str(exc),
        ) from exc

    try:
        return client.write_bytes(
            loc.key,
            data,
            content_type=content_type,
            bucket=loc.bucket,
        )
    except Exception as exc:
        raise RetryableWorkerError(
            code="STORAGE_WRITE_FAILED",
            message=f"failed to upload worker output to {target_url}: {exc}",
        ) from exc


def _resolve_source_ifc_url(
    command: CommandMessage,
) -> str:
    if command.input is not None and command.input.sourceIfcStorageUrl is not None:
        return command.input.sourceIfcStorageUrl
    raise ValidationWorkerError(
        code="MISSING_SOURCE_IFC_URL",
        message="input.sourceIfcStorageUrl is required for TWO_D_LLM_GENERATE worker input",
    )


def _download_source_ifc(client: StorageClient, source_url: str) -> bytes:
    try:
        data = client.read_bytes(source_url)
    except Exception as exc:
        raise RetryableWorkerError(
            code="STORAGE_READ_FAILED",
            message=f"failed to download source IFC from {source_url}: {exc}",
        ) from exc

    if not _looks_like_step_ifc(data):
        raise ValidationWorkerError(
            code="INVALID_SOURCE_IFC_FILE",
            message=(
                "downloaded source object is not a STEP-21 IFC file; "
                "expected header ISO-10303-21"
            ),
        )
    return data


def _looks_like_step_ifc(data: bytes) -> bool:
    return data.lstrip().removeprefix(b"\xef\xbb\xbf").startswith(_STEP_IFC_HEADER)


def _build_edit_plan_bytes(result: dict[str, Any]) -> bytes:
    apply_payload = result.get("apply", {}).get("ifc_edit_payload")
    if apply_payload is None:
        raise NonRetryableWorkerError(
            code="MISSING_EDIT_PLAN",
            message="worker result did not contain an IFC edit payload",
        )
    return json.dumps(apply_payload, ensure_ascii=False, indent=2).encode("utf-8")


def _run_async(awaitable: Coroutine[Any, Any, _T]) -> _T:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(awaitable)

    if asyncio.iscoroutine(awaitable):
        awaitable.close()
    raise NonRetryableWorkerError(
        code="UNSUPPORTED_ASYNC_HOST",
        message=(
            "TwoDLlmWorker must run from a synchronous worker thread; "
            "calling it from an active asyncio event loop is unsupported"
        ),
    )


def _error_result(code: str, message: str, details: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "ok": False,
        "code": code,
        "message": message,
        "details": details,
    }


__all__ = [
    "TwoDLlmWorker",
    "build_two_d_llm_worker",
    "run_two_d_llm_job",
]
