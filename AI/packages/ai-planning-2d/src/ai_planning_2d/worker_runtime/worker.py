"""Worker adapters for the 2D IFC editing pipeline."""

from __future__ import annotations

import asyncio
import logging
import tempfile
from collections.abc import Coroutine, Sequence
from pathlib import Path
from typing import Any, Protocol, TypeVar

from ai_common.adapters.storage.s3_client import S3Client, parse_s3_url
from ai_common.config import S3Settings
from ai_common.errors import (
    ClarificationRequiredError,
    NonRetryableWorkerError,
    RetryableWorkerError,
    ValidationWorkerError,
    WorkerError,
)
from ai_common.storage.paths import (
    clarification_detail_key,
    error_detail_key,
    pad_step,
    planner_2d_command_key,
    preview_result_key,
)
from ai_common.worker_sdk.base_worker import BaseWorker, EventPublisher
from ai_common.worker_sdk.event_factory import CompletedResult, WorkerResult
from ai_domain import CommandMessage, EventOutputRef, TwoDLlmCommandPayload
from ai_domain.worker_messages.payloads_2d import ConversationHistoryMessage
from openai.types.chat import ChatCompletionMessageParam
from pydantic import ValidationError

from ..ifc_extractor import (
    UnsupportedIfcLengthUnitError,
    UnsupportedIfcSchemaError,
    extract_ifc_context,
)
from ..schemas import (
    ClarificationAlternative,
    ClarificationArtifact,
    ErrorDetailArtifact,
    FloorNLPCommand,
    PreviewResultArtifact,
    TwoDCommandArtifact,
    ValidationReportArtifact,
)
from ..session_pipeline import LLM2DPipeline

_T = TypeVar("_T")
_STEP_IFC_HEADER = b"ISO-10303-21;"
_logger = logging.getLogger(__name__)


class StorageClient(Protocol):
    @property
    def default_bucket(self) -> str: ...

    def read_bytes(self, url: str) -> bytes: ...

    def write_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        bucket: str | None = None,
    ) -> str: ...

    def write_json(
        self,
        key: str,
        payload: object,
        *,
        bucket: str | None = None,
        indent: int = 2,
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
                conversation_history=_conversation_history_to_openai_messages(
                    request.conversationHistory
                ),
                input_path=str(Path(input_path)),
                output_path=str(Path(output_path)),
                project_id="local-2d",
                base_revision_id=None,
                clarification_request_id=f"2d-local-{Path(input_path).stem}",
                selected_wall_id=_selected_wall_id_from_planner_options(
                    request.plannerOptions
                ),
                planner_options=request.plannerOptions,
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
        uploaded_artifacts: list[str] = []
        failed_artifact: str | None = None
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

        try:
            source_url = _resolve_source_ifc_url(command)
            _warn_expected_output_step_padding(command)
            inherited_bucket = _resolve_bucket(
                command,
                default_bucket=self.s3_client.default_bucket,
            )

            with tempfile.TemporaryDirectory(prefix="ai-2d-worker-") as temp_dir:
                temp_root = Path(temp_dir)
                source_path = temp_root / "input.ifc"
                source_path.write_bytes(_download_source_ifc(self.s3_client, source_url))

                output_path = temp_root / "output.ifc"
                result = _run_async(
                    _run_pipeline(
                        user_instruction=payload.userInstruction,
                        conversation_history=_conversation_history_to_openai_messages(
                            payload.conversationHistory
                        ),
                        selected_wall_id=_selected_wall_id_from_planner_options(
                            payload.plannerOptions
                        ),
                        planner_options=payload.plannerOptions,
                        input_path=str(source_path),
                        output_path=str(output_path),
                        project_id=command.projectId,
                        base_revision_id=command.sourceRevisionId,
                        clarification_request_id=f"2d-{command.jobStepId}",
                    )
                )

                preview = result["preview"]
                engine_request_payload = _build_engine_request_payload(result)
                two_d_command_artifact = _build_two_d_command_artifact(
                    user_instruction=payload.userInstruction,
                    preview=preview,
                )
                preview_result_artifact = _build_preview_result_artifact(preview)
                validation_report_artifact = _build_validation_report_artifact(command, preview)

                _write_observability_artifact(
                    self.s3_client,
                    artifact_kind="2d_command",
                    key=planner_2d_command_key(command.projectId, command.jobId, command.stepNo),
                    payload=two_d_command_artifact.model_dump(mode="json"),
                    bucket=inherited_bucket,
                )
                _write_observability_artifact(
                    self.s3_client,
                    artifact_kind="preview_result",
                    key=preview_result_key(command.projectId, command.jobId, command.stepNo),
                    payload=preview_result_artifact.model_dump(mode="json"),
                    bucket=inherited_bucket,
                )

                uploaded_engine_request_url: str | None = None
                if command.expectedOutput.editPlanStorageUrl is not None:
                    failed_artifact = "engine-request.v2.json"
                    uploaded_engine_request_url = _write_json_to_storage_url(
                        self.s3_client,
                        command.expectedOutput.editPlanStorageUrl,
                        engine_request_payload,
                    )
                    uploaded_artifacts.append(uploaded_engine_request_url)

                uploaded_validation_report_url: str | None = None
                if command.expectedOutput.validationReportStorageUrl is not None:
                    failed_artifact = "validation-report.v1.json"
                    uploaded_validation_report_url = _write_json_to_storage_url(
                        self.s3_client,
                        command.expectedOutput.validationReportStorageUrl,
                        validation_report_artifact.model_dump(mode="json"),
                    )
                    uploaded_artifacts.append(uploaded_validation_report_url)

                uploaded_ifc_url: str | None = None
                if command.expectedOutput.ifcStorageUrl is not None:
                    failed_artifact = "model.v1.ifc"
                    uploaded_ifc_url = _write_to_storage_url(
                        self.s3_client,
                        command.expectedOutput.ifcStorageUrl,
                        output_path.read_bytes(),
                        content_type="application/x-step",
                    )
                    uploaded_artifacts.append(uploaded_ifc_url)

            uploaded_output_url = (
                uploaded_ifc_url
                or uploaded_engine_request_url
                or uploaded_validation_report_url
            )
            if uploaded_output_url is None:
                raise NonRetryableWorkerError(
                    code="NO_OUTPUT",
                    message="worker did not upload a primary output artifact",
                )

            return CompletedResult(
                output=EventOutputRef.model_validate({"storageUrl": uploaded_output_url}),
                progress=1.0,
            )
        except ClarificationRequiredError as exc:
            if exc.preview_data is not None:
                try:
                    inherited_bucket = _resolve_bucket(
                        command,
                        default_bucket=self.s3_client.default_bucket,
                    )
                    clarification_url = _upload_clarification_artifact(
                        s3_client=self.s3_client,
                        preview=exc.preview_data,
                        project_id=command.projectId,
                        job_id=command.jobId,
                        step_no=command.stepNo,
                        clarification_request_id=exc.clarification_request_id,
                        bucket=inherited_bucket,
                    )
                    # Reuse detail_storage_url so existing BE/FE contracts can fetch
                    # the clarification artifact without a new field. The event status
                    # remains clarification_required; this URL is not a failure detail.
                    exc.detail_storage_url = clarification_url
                except Exception as upload_exc:
                    raise RetryableWorkerError(
                        code="CLARIFICATION_ARTIFACT_UPLOAD_FAILED",
                        message="failed to upload clarification artifact",
                    ) from upload_exc
            raise
        except WorkerError as error:
            detail_url = _write_error_detail_best_effort(
                self.s3_client,
                command=command,
                error=error,
                uploaded_artifacts=uploaded_artifacts,
                failed_artifact=failed_artifact,
            )
            if detail_url is not None:
                error.detail_storage_url = detail_url
            raise
        except Exception as exc:
            error = NonRetryableWorkerError(
                code="UNHANDLED_WORKER_EXCEPTION",
                message=str(exc) or "Unhandled worker exception",
            )
            detail_url = _write_error_detail_best_effort(
                self.s3_client,
                command=command,
                error=error,
                uploaded_artifacts=uploaded_artifacts,
                failed_artifact=failed_artifact,
            )
            if detail_url is not None:
                error.detail_storage_url = detail_url
            raise error from exc


def _upload_clarification_artifact(
    *,
    s3_client: StorageClient,
    preview: dict[str, Any],
    project_id: str,
    job_id: str,
    step_no: int,
    clarification_request_id: str,
    bucket: str | None,
) -> str:
    status = str(preview.get("status", "needs_clarification"))
    kind = "alternatives" if status == "alternatives" else "needs_clarification"
    raw_alternatives = preview.get("alternatives") or []
    alternatives = [
        ClarificationAlternative(
            alternative_id=str(a.get("alternative_id", "")),
            title=str(a.get("title", "")),
            prompt=str(a["prompt"]) if a.get("prompt") else None,
            description=str(a.get("description", "")),
            fill=dict(a.get("fill") or {}),
            affected_entities=list(a.get("affected_entities") or []),
            warnings=list(a.get("warnings") or []),
            metrics=list(a.get("metrics") or []),
        )
        for a in raw_alternatives
        if isinstance(a, dict)
    ]
    artifact = ClarificationArtifact(
        kind=kind,
        question=str(preview.get("summary") or "clarification required"),
        alternatives=alternatives,
        parsed_command_preview=preview.get("command"),
        policy_plan=preview.get("policy_plan"),
        job_id=job_id,
        step_no=step_no,
        clarification_request_id=clarification_request_id,
    )
    key = clarification_detail_key(project_id, job_id, step_no)
    return s3_client.write_json(key, artifact.model_dump(mode="json"), bucket=bucket)


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
    conversation_history: list[ChatCompletionMessageParam] | None,
    input_path: str,
    output_path: str,
    project_id: str,
    base_revision_id: str | None,
    clarification_request_id: str,
    selected_wall_id: str | None = None,
    planner_options: dict[str, Any] | None = None,
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
    command = await pipeline.engine.parse_command(
        user_instruction,
        pipeline.ifc_context,
        conversation_history=conversation_history,
        selected_wall_id=selected_wall_id,
    )
    command = _apply_planner_options_to_command(command, planner_options)
    preview = await pipeline.execute_command_preview(command)

    status = preview.get("status")
    if status in {"needs_clarification", "alternatives"}:
        raise ClarificationRequiredError(
            code="CLARIFICATION_REQUIRED",
            message=str(preview.get("summary") or "clarification required"),
            clarification_request_id=clarification_request_id,
            preview_data=preview,
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


def _write_json_to_storage_url(
    client: StorageClient,
    target_url: str,
    payload: object,
) -> str:
    try:
        loc = parse_s3_url(target_url)
    except ValueError as exc:
        raise ValidationWorkerError(
            code="INVALID_STORAGE_URL",
            message=str(exc),
        ) from exc

    try:
        return client.write_json(loc.key, payload, bucket=loc.bucket)
    except Exception as exc:
        raise RetryableWorkerError(
            code="STORAGE_WRITE_FAILED",
            message=f"failed to upload worker output to {target_url}: {exc}",
        ) from exc


def _resolve_source_ifc_url(command: CommandMessage) -> str:
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


def _build_engine_request_payload(result: dict[str, Any]) -> dict[str, Any]:
    apply_payload = result.get("apply", {}).get("engine_request")
    if apply_payload is None:
        raise NonRetryableWorkerError(
            code="MISSING_EDIT_PLAN",
            message="worker result did not contain an engine request payload",
        )
    return apply_payload


def _build_two_d_command_artifact(
    *,
    user_instruction: str,
    preview: dict[str, Any],
) -> TwoDCommandArtifact:
    return TwoDCommandArtifact.model_validate(
        {
            "user_instruction": user_instruction,
            "parsed_command": preview["command"],
            "command_batch": preview["command_batch"],
            "needs_clarification": preview.get("status") in {"needs_clarification", "alternatives"},
            "clarification_question": (
                preview.get("summary")
                if preview.get("status") in {"needs_clarification", "alternatives"}
                else None
            ),
        }
    )


def _build_preview_result_artifact(preview: dict[str, Any]) -> PreviewResultArtifact:
    return PreviewResultArtifact.model_validate(
        {
            "status": preview["status"],
            "summary": preview["summary"],
            "command": preview["command"],
            "command_batch": preview["command_batch"],
            "policy_plan": preview.get("policy_plan"),
            "matched_count": preview.get("matched_count", 0),
            "validation_warnings": preview.get("validation_warnings", []),
            "engine_request": preview.get("engine_request"),
            "ifc_edit_payload": preview.get("ifc_edit_payload"),
            "engine_capabilities": preview.get("engine_capabilities", {}),
        }
    )


def _build_validation_report_artifact(
    command: CommandMessage,
    preview: dict[str, Any],
) -> ValidationReportArtifact:
    return ValidationReportArtifact.model_validate(
        {
            "artifact_id": command.expectedOutputArtifactId,
            "job_id": command.jobId,
            "step_no": command.stepNo,
            "plan_validation_issues": [],
            "plan_validation_warnings": [],
            "preview_warnings": preview.get("validation_warnings", []),
            "ifc_validation_issues": None,
        }
    )


def _write_observability_artifact(
    client: StorageClient,
    *,
    artifact_kind: str,
    key: str,
    payload: object,
    bucket: str,
) -> None:
    try:
        client.write_json(key, payload, bucket=bucket)
    except Exception as exc:
        _logger.warning(
            "observability_artifact_write_failed",
            extra={
                "artifact_kind": artifact_kind,
                "key": key,
                "bucket": bucket,
                "error_class": type(exc).__name__,
                "error_message": str(exc),
            },
        )


def _write_error_detail_best_effort(
    client: StorageClient,
    *,
    command: CommandMessage,
    error: WorkerError,
    uploaded_artifacts: list[str],
    failed_artifact: str | None,
) -> str | None:
    target_url = command.expectedOutput.errorDetailStorageUrl
    try:
        if target_url is not None:
            location = parse_s3_url(target_url)
            bucket = location.bucket
            key = location.key
        else:
            bucket = _resolve_bucket(command, default_bucket=client.default_bucket)
            key = error_detail_key(command.projectId, command.jobId, command.stepNo)
        artifact = ErrorDetailArtifact(
            error_code=error.code,
            error_message=error.message,
            error_class=type(error).__name__,
            job_id=command.jobId,
            step_no=command.stepNo,
            validation_issues=None,
            uploaded_artifacts=uploaded_artifacts,
            failed_artifact=failed_artifact,
        )
        return client.write_json(key, artifact.model_dump(mode="json"), bucket=bucket)
    except Exception as exc:  # pragma: no cover - best effort path
        _logger.warning(
            "error_detail_write_failed",
            extra={
                "job_id": command.jobId,
                "step_no": pad_step(command.stepNo),
                "error_class": type(exc).__name__,
                "error_message": str(exc),
            },
        )
        return None


def _resolve_bucket(command: CommandMessage, *, default_bucket: str) -> str:
    urls = [
        command.expectedOutput.editPlanStorageUrl,
        command.expectedOutput.ifcStorageUrl,
        command.expectedOutput.validationReportStorageUrl,
        command.expectedOutput.errorDetailStorageUrl,
    ]
    buckets: list[str] = []
    for url in urls:
        if url is None:
            continue
        try:
            buckets.append(parse_s3_url(url).bucket)
        except ValueError:
            continue
    if not buckets:
        return default_bucket
    if len(set(buckets)) > 1:
        _logger.warning(
            "expected_output_bucket_mismatch",
            extra={
                "job_id": command.jobId,
                "step_no": pad_step(command.stepNo),
                "buckets": buckets,
                "chosen_bucket": buckets[0],
            },
        )
    return buckets[0]


def _warn_expected_output_step_padding(command: CommandMessage) -> None:
    expected_segment = f"/steps/{pad_step(command.stepNo)}/"
    for field_name, url in (
        ("editPlanStorageUrl", command.expectedOutput.editPlanStorageUrl),
        ("ifcStorageUrl", command.expectedOutput.ifcStorageUrl),
        ("validationReportStorageUrl", command.expectedOutput.validationReportStorageUrl),
        ("errorDetailStorageUrl", command.expectedOutput.errorDetailStorageUrl),
    ):
        if url is None:
            continue
        try:
            key = parse_s3_url(url).key
        except ValueError:
            continue
        if expected_segment.strip("/") not in key:
            _logger.warning(
                "expected_output_step_padding_mismatch",
                extra={
                    "field_name": field_name,
                    "url": url,
                    "expected_segment": expected_segment,
                },
            )


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


def _error_result(code: str, message: str, details: Sequence[object]) -> dict[str, Any]:
    return {
        "ok": False,
        "code": code,
        "message": message,
        "details": details,
    }


def _apply_planner_options_to_command(
    command: FloorNLPCommand,
    planner_options: dict[str, Any] | None,
) -> FloorNLPCommand:
    if not isinstance(planner_options, dict):
        return command

    updates: dict[str, Any] = {}
    action = planner_options.get("action")
    if action in {"insert_toilet", "merge_windows"}:
        updates["action"] = action
        updates["needs_clarification"] = False
        updates["clarification_question"] = None

    target_floor = planner_options.get("target_floor")
    if isinstance(target_floor, int) and not isinstance(target_floor, bool) and target_floor >= 1:
        updates["target_floor"] = target_floor

    target_room_name = planner_options.get("target_room_name")
    if isinstance(target_room_name, str) and target_room_name.strip():
        updates["target_room_name"] = target_room_name.strip()

    if not updates:
        return command

    payload = command.model_dump()
    payload.update(updates)
    try:
        return FloorNLPCommand.model_validate(payload)
    except ValidationError:
        _logger.warning(
            "invalid_planner_options_ignored",
            extra={"planner_options": planner_options},
        )
        return command


def _selected_wall_id_from_planner_options(
    planner_options: dict[str, Any] | None,
) -> str | None:
    if not isinstance(planner_options, dict):
        return None
    # host_wall_global_id를 우선 확인 (3D 워커와 동일한 키 이름)
    # selectedWallId는 이전 FE 계약과의 하위 호환을 위해 fallback으로 유지
    for key in ("host_wall_global_id", "selectedWallId"):
        value = planner_options.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def _conversation_history_to_openai_messages(
    history: Sequence[ConversationHistoryMessage] | None,
) -> list[ChatCompletionMessageParam]:
    if not history:
        return []

    messages: list[ChatCompletionMessageParam] = []
    for item in history:
        if item.content.strip():
            messages.append({"role": item.role, "content": item.content})
    return messages


__all__ = [
    "TwoDLlmWorker",
    "build_two_d_llm_worker",
    "run_two_d_llm_job",
]
"""2D 계획 워커의 메시지 처리와 아티팩트 생성 흐름을 담당한다."""
