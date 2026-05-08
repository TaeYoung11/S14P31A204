"""ifc2img worker entry helpers."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from .service import (
    Ifc2ImgStorageAdapter,
    Ifc2ImgWorkerRequest,
    Ifc2ImgWorkerSuccessResponse,
    handle_ifc2img_worker_request,
    run_ifc2img_photo_pipeline,
    validate_ifc2img_worker_request,
)
from .storage import create_s3_ifc2img_storage_adapter

StorageAdapterFactory = Callable[[object], Ifc2ImgStorageAdapter]


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
