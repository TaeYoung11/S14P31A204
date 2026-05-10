"""ifc2img S3 storage adapter tests."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest

from ai_rendering.ifc2img.service import PHOTO_PNG_CONTENT_TYPE
from ai_rendering.ifc2img.storage import (
    Ifc2ImgStorageError,
    S3Ifc2ImgStorageAdapter,
    create_s3_ifc2img_storage_adapter,
)


@dataclass(frozen=True)
class FakeUploadedTarget:
    canonical_url: str


class FakeS3Client:
    def __init__(self) -> None:
        self.reads: list[str] = []
        self.writes: list[tuple[str, bytes, str]] = []
        self.read_map: dict[str, bytes] = {}
        self.canonical_url = "s3://bucket/output/photo.png"

    def read_bytes(self, url: str) -> bytes:
        self.reads.append(url)
        return self.read_map[url]

    def write_bytes_to_ref(
        self,
        reference: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> FakeUploadedTarget:
        self.writes.append((reference, data, content_type))
        return FakeUploadedTarget(self.canonical_url)


class FakeS3ClientWithSettings(FakeS3Client):
    def __init__(self, settings: object) -> None:
        super().__init__()
        self.settings = settings


class FakeS3ClientWithoutCanonicalUrl(FakeS3Client):
    def write_bytes_to_ref(
        self,
        reference: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> object:
        self.writes.append((reference, data, content_type))
        return object()


class FakeFailingReadS3Client(FakeS3Client):
    def __init__(self, error: Exception) -> None:
        super().__init__()
        self.error = error

    def read_bytes(self, url: str) -> bytes:
        self.reads.append(url)
        raise self.error


class FakeFailingWriteS3Client(FakeS3Client):
    def __init__(self, error: Exception) -> None:
        super().__init__()
        self.error = error

    def write_bytes_to_ref(
        self,
        reference: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> object:
        self.writes.append((reference, data, content_type))
        raise self.error


def test_s3_ifc2img_storage_adapter_downloads_ifc_to_local_path(tmp_path: Path) -> None:
    """S3 IFC bytes를 worker 로컬 파일로 내려받고 경로를 반환한다."""
    client = FakeS3Client()
    client.read_map["s3://bucket/input/model.ifc"] = b"ISO-10303-21;"
    adapter = S3Ifc2ImgStorageAdapter(client)

    local_path = adapter.download_ifc(
        "s3://bucket/input/model.ifc",
        tmp_path / "nested" / "source.ifc",
    )

    assert local_path == tmp_path / "nested" / "source.ifc"
    assert local_path.read_bytes() == b"ISO-10303-21;"
    assert client.reads == ["s3://bucket/input/model.ifc"]


def test_s3_ifc2img_storage_adapter_maps_invalid_source_url(tmp_path: Path) -> None:
    """잘못된 source URL은 재시도하지 않는 storage validation 오류로 감싼다."""

    client = FakeFailingReadS3Client(ValueError("invalid url"))
    adapter = S3Ifc2ImgStorageAdapter(client)

    with pytest.raises(Ifc2ImgStorageError) as exc_info:
        adapter.download_ifc("not-a-storage-url", tmp_path / "source.ifc")

    assert exc_info.value.code == "INVALID_STORAGE_URL"
    assert exc_info.value.retryable is False
    assert "not-a-storage-url" in exc_info.value.message


def test_s3_ifc2img_storage_adapter_maps_source_download_failure(tmp_path: Path) -> None:
    """S3 object missing 같은 다운로드 실패는 재시도 가능한 storage 오류로 감싼다."""

    client = FakeFailingReadS3Client(RuntimeError("NoSuchKey"))
    adapter = S3Ifc2ImgStorageAdapter(client)

    with pytest.raises(Ifc2ImgStorageError) as exc_info:
        adapter.download_ifc("s3://bucket/missing.ifc", tmp_path / "source.ifc")

    assert exc_info.value.code == "IFC_SOURCE_DOWNLOAD_FAILED"
    assert exc_info.value.retryable is True
    assert "NoSuchKey" in exc_info.value.message


def test_s3_ifc2img_storage_adapter_uploads_file_with_content_type(
    tmp_path: Path,
) -> None:
    """로컬 photo 파일을 S3 reference에 업로드하고 canonical URL을 반환한다."""
    client = FakeS3Client()
    adapter = S3Ifc2ImgStorageAdapter(client)
    photo_path = tmp_path / "photo.png"
    photo_path.write_bytes(b"png-bytes")

    uploaded_url = adapter.upload_file(
        photo_path,
        "s3://bucket/output/photo.png",
        content_type=PHOTO_PNG_CONTENT_TYPE,
    )

    assert uploaded_url == "s3://bucket/output/photo.png"
    assert client.writes == [
        ("s3://bucket/output/photo.png", b"png-bytes", PHOTO_PNG_CONTENT_TYPE)
    ]


def test_s3_ifc2img_storage_adapter_falls_back_to_requested_target_url(
    tmp_path: Path,
) -> None:
    """S3 client 결과에 canonical_url이 없으면 요청한 target URL을 그대로 반환한다."""
    client = FakeS3ClientWithoutCanonicalUrl()
    adapter = S3Ifc2ImgStorageAdapter(client)
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text("{}", encoding="utf-8")

    uploaded_url = adapter.upload_file(
        manifest_path,
        "s3://bucket/output/manifest.json",
        content_type="application/json; charset=utf-8",
    )

    assert uploaded_url == "s3://bucket/output/manifest.json"


def test_s3_ifc2img_storage_adapter_maps_invalid_output_url(tmp_path: Path) -> None:
    """잘못된 output URL은 재시도하지 않는 storage validation 오류로 감싼다."""

    client = FakeFailingWriteS3Client(ValueError("invalid output url"))
    adapter = S3Ifc2ImgStorageAdapter(client)
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text("{}", encoding="utf-8")

    with pytest.raises(Ifc2ImgStorageError) as exc_info:
        adapter.upload_file(
            manifest_path,
            "not-a-storage-url",
            content_type="application/json; charset=utf-8",
        )

    assert exc_info.value.code == "INVALID_STORAGE_URL"
    assert exc_info.value.retryable is False
    assert "not-a-storage-url" in exc_info.value.message


def test_s3_ifc2img_storage_adapter_maps_output_upload_failure(tmp_path: Path) -> None:
    """S3 put 실패는 worker가 재시도할 수 있는 upload storage 오류로 감싼다."""

    client = FakeFailingWriteS3Client(RuntimeError("timeout"))
    adapter = S3Ifc2ImgStorageAdapter(client)
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text("{}", encoding="utf-8")

    with pytest.raises(Ifc2ImgStorageError) as exc_info:
        adapter.upload_file(
            manifest_path,
            "s3://bucket/output/manifest.json",
            content_type="application/json; charset=utf-8",
        )

    assert exc_info.value.code == "IFC_OUTPUT_UPLOAD_FAILED"
    assert exc_info.value.retryable is True
    assert "timeout" in exc_info.value.message


def test_create_s3_ifc2img_storage_adapter_wraps_ai_common_s3_client(
    monkeypatch,
) -> None:
    """Factory는 ai_common S3Client를 lazy import해서 ifc2img adapter로 감싼다."""
    import ai_common.adapters.storage as storage_module

    instances: list[FakeS3ClientWithSettings] = []

    class FakeS3ClientFactory(FakeS3ClientWithSettings):
        def __init__(self, settings: object) -> None:
            super().__init__(settings)
            instances.append(self)

    settings = object()
    monkeypatch.setattr(storage_module, "S3Client", FakeS3ClientFactory)

    adapter = create_s3_ifc2img_storage_adapter(settings)

    assert isinstance(adapter, S3Ifc2ImgStorageAdapter)
    assert adapter.s3_client is instances[0]
    assert instances[0].settings is settings
