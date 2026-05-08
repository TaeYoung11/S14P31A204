"""ifc2img worker에서 사용할 object storage adapter."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .service import Ifc2ImgStorageAdapter


class _S3ClientProtocol(Protocol):
    def read_bytes(self, url: str) -> bytes:
        """storage URL에서 bytes를 읽는다."""
        ...

    def write_bytes_to_ref(
        self,
        reference: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> Any:
        """예약된 storage reference에 bytes를 업로드한다."""
        ...


@dataclass(frozen=True)
class S3Ifc2ImgStorageAdapter(Ifc2ImgStorageAdapter):
    """S3Client를 ifc2img storage adapter interface에 맞춰 감싸는 얇은 adapter."""

    s3_client: _S3ClientProtocol

    def download_ifc(self, source_storage_url: str, destination_path: Path) -> Path:
        """S3의 IFC object를 로컬 worker 작업 파일로 내려받는다."""
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        destination_path.write_bytes(self.s3_client.read_bytes(source_storage_url))
        return destination_path

    def upload_file(
        self,
        local_path: Path,
        target_storage_url: str,
        *,
        content_type: str,
    ) -> str:
        """로컬 결과 파일을 S3 reference에 업로드하고 최종 storage URL을 반환한다."""
        uploaded = self.s3_client.write_bytes_to_ref(
            target_storage_url,
            local_path.read_bytes(),
            content_type=content_type,
        )
        return str(getattr(uploaded, "canonical_url", target_storage_url))


def create_s3_ifc2img_storage_adapter(settings: object) -> S3Ifc2ImgStorageAdapter:
    """ai_common S3Client를 lazy import해 실제 ifc2img S3 adapter를 만든다."""
    from ai_common.adapters.storage import S3Client

    return S3Ifc2ImgStorageAdapter(S3Client(settings))
