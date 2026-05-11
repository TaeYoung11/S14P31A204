"""ifc2img worker entry helpers."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from .service import (
    DEFAULT_PHOTO_PRESET,
    Ifc2ImgStorageAdapter,
    Ifc2ImgWorkerRequest,
    Ifc2ImgWorkerSuccessResponse,
    handle_ifc2img_worker_request,
    run_ifc2img_photo_pipeline,
    validate_ifc2img_worker_request,
)
from .storage import create_s3_ifc2img_storage_adapter

StorageAdapterFactory = Callable[[object], Ifc2ImgStorageAdapter]


def _read_command_field(source: object, field_name: str) -> object:
    if isinstance(source, dict):
        return source.get(field_name)
    return getattr(source, field_name, None)


def _require_command_field(source: object, field_name: str, error_path: str) -> str:
    value = _read_command_field(source, field_name)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{error_path} is required for ifc2img worker command")
    return value


def _optional_command_field(source: object, field_name: str) -> str | None:
    value = _read_command_field(source, field_name)
    if isinstance(value, str) and value:
        return value
    return None


def map_worker_command_to_ifc2img_request(command: object) -> Ifc2ImgWorkerRequest:
    """공통 worker command를 ifc2img 내부 request 계약으로 변환한다."""
    input_ref = _read_command_field(command, "input")
    expected_output = _read_command_field(command, "expectedOutput")
    payload = _read_command_field(command, "payload")

    command_type = _require_command_field(command, "commandType", "command.commandType")
    source_ifc_url = _require_command_field(
        input_ref,
        "sourceIfcStorageUrl",
        "command.input.sourceIfcStorageUrl",
    )
    manifest_url = _optional_command_field(expected_output, "renderManifestStorageUrl")
    legacy_output_prefix = _optional_command_field(expected_output, "renderImageStorageUrl")
    if manifest_url is None and legacy_output_prefix is None:
        raise ValueError(
            "command.expectedOutput.renderManifestStorageUrl is required "
            "for ifc2img worker command"
        )
    output_refs: dict[str, str] = {}
    if manifest_url is not None:
        output_refs["renderManifestStorageUrl"] = manifest_url
    if legacy_output_prefix is not None:
        output_refs["renderImageStorageUrl"] = legacy_output_prefix
    for field_name in (
        "renderPhotoFrontDiagonalLeftStorageUrl",
        "renderPhotoFrontDiagonalRightStorageUrl",
    ):
        value = _optional_command_field(expected_output, field_name)
        if value is not None:
            output_refs[field_name] = value
    preset = _read_command_field(payload, "preset")
    if not isinstance(preset, str) or not preset:
        preset = DEFAULT_PHOTO_PRESET

    return {
        "commandType": command_type,  # type: ignore[typeddict-item]
        "input": {"sourceIfcStorageUrl": source_ifc_url},
        "expectedOutput": output_refs,
        "payload": {
            "renderMode": "ifc2img",
            "preset": preset,
        },
    }


def run_ifc2img_worker_request(
    request: Ifc2ImgWorkerRequest,
    s3_settings: object,
    work_dir: Path | str,
    *,
    storage_factory: StorageAdapterFactory = create_s3_ifc2img_storage_adapter,
    pipeline: Any = run_ifc2img_photo_pipeline,
) -> Ifc2ImgWorkerSuccessResponse:
    """S3 설정과 worker 요청을 받아 ifc2img handler까지 실행하는 진입점."""
    validate_ifc2img_worker_request(request)
    storage = storage_factory(s3_settings)
    return handle_ifc2img_worker_request(
        request,
        storage,
        work_dir,
        pipeline=pipeline,
    )


def run_ifc2img_worker_command(
    command: object,
    s3_settings: object,
    work_dir: Path | str,
    *,
    storage_factory: StorageAdapterFactory = create_s3_ifc2img_storage_adapter,
    pipeline: Any = run_ifc2img_photo_pipeline,
) -> Ifc2ImgWorkerSuccessResponse:
    """공통 worker command를 ifc2img request로 매핑한 뒤 entry를 실행한다."""
    request = map_worker_command_to_ifc2img_request(command)
    return run_ifc2img_worker_request(
        request,
        s3_settings,
        work_dir,
        storage_factory=storage_factory,
        pipeline=pipeline,
    )
