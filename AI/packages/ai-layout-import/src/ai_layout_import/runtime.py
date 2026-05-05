"""End-to-end worker runtime for IFC generate commands."""

from __future__ import annotations

import json
import os
from pathlib import Path
from tempfile import mkstemp
from typing import Protocol, cast

from ai_common.errors import (
    ConfigurationError,
    RetryableWorkerError,
    ValidationWorkerError,
    WorkerError,
)
from ai_common.logging import get_logger
from ai_common.worker_sdk.base_worker import BaseWorker, EventPublisher
from ai_common.worker_sdk.event_factory import CompletedResult
from ai_domain import CommandMessage, LayoutImportV1, LayoutImportV2
from ai_domain.worker_messages.payloads_ifc_generate import IfcGenerateCommandPayload
from ai_layout_import.service import convert_layout_to_ifc

try:
    from ai_common.adapters.storage.s3_client import ClientError, ResolvedS3WriteTarget
except Exception:  # pragma: no cover - exercised in local fallback only
    ClientError = Exception  # type: ignore[assignment]
    ResolvedS3WriteTarget = object  # type: ignore[assignment,misc]

_logger = get_logger(__name__)


class StorageClient(Protocol):
    def write_bytes_to_ref(
        self,
        reference: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> ResolvedS3WriteTarget:
        """Upload bytes using the reserved storage reference."""

    def write_text_to_ref(
        self,
        reference: str,
        text: str,
        encoding: str = "utf-8",
        content_type: str = "text/plain; charset=utf-8",
    ) -> ResolvedS3WriteTarget:
        """Upload text using the reserved storage reference."""


class IfcGenerateWorker(BaseWorker):
    """Worker loop implementation for IFC generate commands."""

    def __init__(
        self,
        *,
        worker_id: str,
        event_publisher: EventPublisher,
        storage_client: StorageClient,
        temp_root: str | Path | None = None,
    ) -> None:
        super().__init__(worker_id=worker_id, event_publisher=event_publisher)
        self._storage = storage_client
        self._temp_root = Path(temp_root) if temp_root is not None else _default_temp_root()

    def process(self, command: object) -> CompletedResult:
        if not isinstance(command, CommandMessage):
            raise ConfigurationError(
                code="invalid_command_type",
                message="IFC generate worker expects a validated CommandMessage",
            )

        ifc_ref = command.expectedOutput.ifcStorageUrl
        if ifc_ref is None:
            raise ConfigurationError(
                code="missing_ifc_storage_url",
                message="expected_output.ifc_storage_url is required for IFC generate commands",
            )

        payload = cast(IfcGenerateCommandPayload, command.payload)
        request = payload.layoutImport
        validation_ref = command.expectedOutput.validationReportStorageUrl
        temp_fd, temp_path = mkstemp(
            prefix="ifc-generate-",
            suffix=".ifc",
            dir=self._temp_root,
        )
        os.close(temp_fd)
        output_path = Path(temp_path)

        try:
            convert_layout_to_ifc(request, output_path)
            uploaded_target = self._storage.write_bytes_to_ref(
                ifc_ref,
                output_path.read_bytes(),
                content_type="application/octet-stream",
            )

            report = _build_validation_report(
                command=command,
                request=request,
                status="completed",
                ifc_canonical_url=getattr(uploaded_target, "canonical_url", None),
            )
            if validation_ref is not None:
                self._storage.write_text_to_ref(
                    validation_ref,
                    json.dumps(report, ensure_ascii=False, indent=2),
                    content_type="application/json; charset=utf-8",
                )
        except ValueError as exc:
            raise self._build_failed_error(
                command=command,
                request=request,
                error=ValidationWorkerError(
                    code="validation_error",
                    message=str(exc) or "input validation failed",
                ),
            ) from exc
        except ModuleNotFoundError as exc:
            raise self._build_failed_error(
                command=command,
                request=request,
                error=ConfigurationError(
                    code="storage_configuration_error",
                    message=str(exc) or "storage dependencies are not installed",
                ),
            ) from exc
        except ClientError as exc:
            raise self._build_failed_error(
                command=command,
                request=request,
                error=RetryableWorkerError(
                    code="storage_client_error",
                    message=str(exc) or "object storage request failed",
                ),
            ) from exc
        except OSError as exc:
            raise self._build_failed_error(
                command=command,
                request=request,
                error=RetryableWorkerError(
                    code="io_error",
                    message=str(exc) or "temporary I/O failure",
                ),
            ) from exc
        finally:
            _cleanup_temp_file(output_path, command.jobId, command.idempotencyKey)

        output: dict[str, object] = {"storageUrl": ifc_ref}
        if validation_ref is not None:
            output["validationReportStorageUrl"] = validation_ref
        return CompletedResult(output=output, progress=1.0)

    def _build_failed_error(
        self,
        *,
        command: CommandMessage,
        request: LayoutImportV1 | LayoutImportV2,
        error: WorkerError,
    ) -> WorkerError:
        validation_ref = command.expectedOutput.validationReportStorageUrl
        if validation_ref is None:
            return error

        report = _build_validation_report(
            command=command,
            request=request,
            status="failed",
            error_code=error.code,
            error_message=error.message,
            retryable=error.retryable,
            clarification_possible=error.clarification_possible,
        )
        try:
            self._storage.write_text_to_ref(
                validation_ref,
                json.dumps(report, ensure_ascii=False, indent=2),
                content_type="application/json; charset=utf-8",
            )
        except Exception as upload_exc:  # pragma: no cover - best-effort path
            _logger.warning(
                "validation_report_upload_failed",
                jobId=command.jobId,
                idempotencyKey=command.idempotencyKey,
                reference=validation_ref,
                error=str(upload_exc),
            )
            return error

        error.detail_storage_url = validation_ref
        return error


def _default_temp_root() -> Path:
    configured_root = os.getenv("AI_WORKER_TEMP_DIR")
    if configured_root:
        temp_root = Path(configured_root)
    else:
        temp_root = Path.cwd() / ".tmp" / "ai-layout-import"
    temp_root.mkdir(parents=True, exist_ok=True)
    return temp_root


def _cleanup_temp_file(output_path: Path, job_id: str, idempotency_key: str) -> None:
    try:
        output_path.unlink()
    except FileNotFoundError:
        return
    except OSError as exc:  # pragma: no cover - platform-dependent cleanup race
        _logger.warning(
            "ifc_generate_temp_file_cleanup_failed",
            jobId=job_id,
            idempotencyKey=idempotency_key,
            tempFile=str(output_path),
            error=str(exc),
        )


def _build_validation_report(
    *,
    command: CommandMessage,
    request: LayoutImportV1 | LayoutImportV2,
    status: str,
    ifc_canonical_url: str | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    retryable: bool | None = None,
    clarification_possible: bool | None = None,
) -> dict[str, object]:
    report: dict[str, object] = {
        "status": status,
        "commandType": command.commandType,
        "jobId": command.jobId,
        "jobStepId": command.jobStepId,
        "projectId": command.projectId,
        "requestedBy": command.requestedBy,
        "targetRevisionId": command.targetRevisionId,
        "expectedOutputArtifactId": command.expectedOutputArtifactId,
        "idempotencyKey": command.idempotencyKey,
        "correlationId": command.correlationId,
        "layoutImport": {
            "schemaVersion": request.schema_version,
            "roomCount": len(request.rooms),
            "zoneCount": len(request.zones or []),
            "boundaryCount": len(request.boundaries or []),
            "adjacencyCount": len(request.adjacency or []),
        },
    }
    if ifc_canonical_url is not None:
        report["storage"] = {"ifcCanonicalUrl": ifc_canonical_url}
    if error_code is not None or error_message is not None:
        report["error"] = {
            "code": error_code,
            "message": error_message,
            "retryable": retryable,
            "clarificationPossible": clarification_possible,
        }
    return report


__all__ = ["IfcGenerateWorker", "StorageClient"]
