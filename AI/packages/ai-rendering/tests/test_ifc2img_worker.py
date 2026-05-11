"""ifc2img worker entry tests."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from ai_rendering.ifc2img.exceptions import IFCRenderError
from ai_rendering.ifc2img.service import (
    Ifc2ImgPhotoJobResult,
    Ifc2ImgPhotoViewResult,
    Ifc2ImgWorkerRequest,
)
from ai_rendering.ifc2img.views import IFCView
from ai_rendering.ifc2img.worker import (
    map_worker_command_to_ifc2img_request,
    run_ifc2img_worker_command,
    run_ifc2img_worker_request,
)


class FakeStorageAdapter:
    def __init__(self) -> None:
        self.downloads: list[tuple[str, Path]] = []
        self.uploads: list[tuple[Path, str, str]] = []

    def download_ifc(self, source_storage_url: str, destination_path: Path) -> Path:
        self.downloads.append((source_storage_url, destination_path))
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        destination_path.write_text("ISO-10303-21;", encoding="utf-8")
        return destination_path

    def upload_file(
        self,
        local_path: Path,
        target_storage_url: str,
        *,
        content_type: str,
    ) -> str:
        self.uploads.append((local_path, target_storage_url, content_type))
        return target_storage_url


class CommandLike:
    def __init__(self) -> None:
        self.commandType = "SD_RENDER_GENERATE"
        self.input = InputLike()
        self.expectedOutput = ExpectedOutputLike()
        self.payload = PayloadLike()


class InputLike:
    sourceIfcStorageUrl = "s3://bucket/input/model.ifc"


class ExpectedOutputLike:
    renderManifestStorageUrl = "s3://bucket/output/job-1/manifest.v1.json"
    renderPhotoFrontDiagonalLeftStorageUrl = (
        "s3://bucket/output/job-1/photo_front_diagonal_left.png"
    )
    renderPhotoFrontDiagonalRightStorageUrl = (
        "s3://bucket/output/job-1/photo_front_diagonal_right.png"
    )


class PayloadLike:
    renderMode = "ifc2img"
    preset = "scandinavian"


def _worker_request() -> Ifc2ImgWorkerRequest:
    return {
        "commandType": "SD_RENDER_GENERATE",
        "input": {"sourceIfcStorageUrl": "s3://bucket/input/model.ifc"},
        "expectedOutput": {
            "renderManifestStorageUrl": "s3://bucket/output/job-1/manifest.v1.json",
            "renderPhotoFrontDiagonalLeftStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_left.png"
            ),
            "renderPhotoFrontDiagonalRightStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_right.png"
            ),
        },
        "payload": {"renderMode": "ifc2img", "preset": "korean_house"},
    }


def _worker_command_dict() -> dict[str, object]:
    return {
        "commandType": "SD_RENDER_GENERATE",
        "input": {"sourceIfcStorageUrl": "s3://bucket/input/model.ifc"},
        "expectedOutput": {
            "renderManifestStorageUrl": "s3://bucket/output/job-1/manifest.v1.json",
            "renderPhotoFrontDiagonalLeftStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_left.png"
            ),
            "renderPhotoFrontDiagonalRightStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_right.png"
            ),
        },
        "payload": {"renderMode": "ifc2img", "preset": "korean_house"},
    }


def _fake_pipeline(
    ifc_path: Path,
    output_dir: Path,
    *,
    preset: str,
) -> Ifc2ImgPhotoJobResult:
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.json"
    photo_path = output_dir / "photo_front_diagonal_left.png"
    depth_path = output_dir / "depth_front_diagonal_left.png"
    manifest_path.write_text("{}", encoding="utf-8")
    photo_path.write_bytes(b"png")
    depth_path.write_bytes(b"depth")
    return Ifc2ImgPhotoJobResult(
        preset=preset,
        output_dir=output_dir,
        outputs=(
            Ifc2ImgPhotoViewResult(
                view="front_diagonal_left",
                internal_view=IFCView.FRONT_DIAGONAL_LEFT,
                photo_path=photo_path,
                depth_path=depth_path,
                width=8,
                height=4,
            ),
        ),
        manifest_path=manifest_path,
    )


def test_worker_entry_creates_storage_adapter_and_runs_handler(tmp_path: Path) -> None:
    """worker entry는 S3 settings로 adapter를 만들고 handler 실행 결과를 반환한다."""
    settings = object()
    storage = FakeStorageAdapter()
    factory_calls: list[object] = []

    def storage_factory(received_settings: object) -> FakeStorageAdapter:
        factory_calls.append(received_settings)
        return storage

    response = run_ifc2img_worker_request(
        _worker_request(),
        settings,
        tmp_path / "work",
        storage_factory=storage_factory,
        pipeline=_fake_pipeline,
    )

    assert factory_calls == [settings]
    assert storage.downloads == [
        ("s3://bucket/input/model.ifc", tmp_path / "work" / "input" / "source.ifc")
    ]
    assert response["manifestStorageUrl"] == "s3://bucket/output/job-1/manifest.v1.json"
    assert response["photos"] == [
        {
            "view": "front_diagonal_left",
            "storageUrl": "s3://bucket/output/job-1/photo_front_diagonal_left.png",
            "width": 8,
            "height": 4,
        }
    ]


def test_worker_command_mapping_builds_ifc2img_request_from_dict() -> None:
    """공통 worker command dict에서 ifc2img request 필드를 정확히 추출한다."""
    request = map_worker_command_to_ifc2img_request(_worker_command_dict())

    assert request == _worker_request()


def test_worker_command_mapping_supports_command_like_object() -> None:
    """Pydantic command처럼 attribute로 접근되는 객체도 같은 request로 변환한다."""
    request = map_worker_command_to_ifc2img_request(CommandLike())

    assert request == {
        "commandType": "SD_RENDER_GENERATE",
        "input": {"sourceIfcStorageUrl": "s3://bucket/input/model.ifc"},
        "expectedOutput": {
            "renderManifestStorageUrl": "s3://bucket/output/job-1/manifest.v1.json",
            "renderPhotoFrontDiagonalLeftStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_left.png"
            ),
            "renderPhotoFrontDiagonalRightStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_right.png"
            ),
        },
        "payload": {"renderMode": "ifc2img", "preset": "scandinavian"},
    }


def test_worker_command_mapping_uses_default_preset_when_missing() -> None:
    """preset이 없으면 photo pipeline 기본 preset으로 보정한다."""
    command = _worker_command_dict()
    command["payload"] = {"prompt": "render from IFC"}

    request = map_worker_command_to_ifc2img_request(command)

    assert request["payload"]["preset"] == "korean_house"
    assert request["payload"]["renderMode"] == "ifc2img"


def test_worker_command_mapping_ignores_shared_payload_render_mode_default() -> None:
    """shared SD payload 기본값과 무관하게 IFC 입력 command는 ifc2img로 변환한다."""
    command = _worker_command_dict()
    command["payload"] = {"renderMode": "sd", "prompt": "render from IFC"}

    request = map_worker_command_to_ifc2img_request(command)

    assert request["payload"]["renderMode"] == "ifc2img"


@pytest.mark.parametrize(
    ("command", "message"),
    [
        (
            {
                "commandType": "SD_RENDER_GENERATE",
                "input": {},
                "expectedOutput": {
                    "renderManifestStorageUrl": "s3://bucket/output/job-1/manifest.v1.json"
                },
                "payload": {"renderMode": "ifc2img", "preset": "korean_house"},
            },
            "command.input.sourceIfcStorageUrl",
        ),
        (
            {
                "commandType": "SD_RENDER_GENERATE",
                "input": {"sourceIfcStorageUrl": "s3://bucket/input/model.ifc"},
                "expectedOutput": {},
                "payload": {"renderMode": "ifc2img", "preset": "korean_house"},
            },
            "command.expectedOutput.renderManifestStorageUrl",
        ),
    ],
)
def test_worker_command_mapping_rejects_missing_required_fields(
    command: dict[str, object],
    message: str,
) -> None:
    """필수 storage URL과 renderMode가 없으면 handler 진입 전에 실패한다."""
    with pytest.raises(ValueError, match=message):
        map_worker_command_to_ifc2img_request(command)


def test_worker_command_entry_maps_command_then_runs_request_entry(tmp_path: Path) -> None:
    """공통 worker command entry는 mapping 후 기존 request entry를 실행한다."""
    settings = object()
    storage = FakeStorageAdapter()

    def storage_factory(_settings: object) -> FakeStorageAdapter:
        return storage

    response = run_ifc2img_worker_command(
        _worker_command_dict(),
        settings,
        tmp_path / "work",
        storage_factory=storage_factory,
        pipeline=_fake_pipeline,
    )

    assert response["preset"] == "korean_house"
    assert response["manifestStorageUrl"] == "s3://bucket/output/job-1/manifest.v1.json"


def test_worker_entry_rejects_invalid_request_before_storage_creation(
    tmp_path: Path,
) -> None:
    """지원하지 않는 요청은 S3 adapter 생성 전에 실패해야 한다."""
    bad_request: dict[str, Any] = _worker_request()
    bad_request["payload"] = {"renderMode": "img2img", "preset": "korean_house"}
    factory_calls: list[object] = []

    def storage_factory(received_settings: object) -> FakeStorageAdapter:
        factory_calls.append(received_settings)
        return FakeStorageAdapter()

    with pytest.raises(IFCRenderError, match="unsupported renderMode"):
        run_ifc2img_worker_request(
            bad_request,  # type: ignore[arg-type]
            object(),
            tmp_path / "work",
            storage_factory=storage_factory,
            pipeline=_fake_pipeline,
        )

    assert factory_calls == []
