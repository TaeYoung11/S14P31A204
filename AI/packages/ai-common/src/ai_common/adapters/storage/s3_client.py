"""S3 / MinIO object storage client with typed URL helpers.

All public methods accept and return ``s3://bucket/key`` URL strings.
No file content is embedded in MQ messages — callers obtain URLs from
CommandMessage input/expectedOutput and pass them here directly.
"""

from __future__ import annotations

import json
import re
from typing import NamedTuple

try:
    import boto3
except Exception:  # pragma: no cover - exercised in local fallback only
    boto3 = None  # type: ignore[assignment]

try:
    from botocore.exceptions import ClientError
except Exception:  # pragma: no cover - exercised in local fallback only
    class ClientError(Exception):
        def __init__(self, error_response: dict[str, dict[str, str]], operation_name: str) -> None:
            super().__init__(f"{operation_name}: {error_response}")
            self.response = error_response

from ai_common.config import S3Settings
from ai_common.logging import get_logger

_logger = get_logger(__name__)

_S3_URL_RE = re.compile(r"^s3://(?P<bucket>[^/]+)/(?P<key>.+)$")


class S3Location(NamedTuple):
    bucket: str
    key: str


class ResolvedS3WriteTarget(NamedTuple):
    reference: str
    bucket: str
    key: str
    canonical_url: str


def parse_s3_url(url: str) -> S3Location:
    """Parse an ``s3://bucket/key`` URL into its components.

    Raises ValueError for any URL that does not match the canonical format,
    including bare ``s3://bucket`` with no key.
    """
    match = _S3_URL_RE.match(url)
    if match is None:
        raise ValueError(
            f"Invalid S3 URL {url!r}: expected s3://bucket/key format"
        )
    return S3Location(bucket=match.group("bucket"), key=match.group("key"))


def resolve_s3_write_target(reference: str, default_bucket: str) -> ResolvedS3WriteTarget:
    """Resolve a reserved storage reference into a concrete bucket/key target.

    Accepts either canonical ``s3://bucket/key`` URLs or bucket-relative keys
    such as ``projects/<id>/model.ifc``. The original reference is preserved
    so callers can echo the reserved ref back in events unchanged.
    """
    if reference.startswith("s3://"):
        location = parse_s3_url(reference)
        return ResolvedS3WriteTarget(
            reference=reference,
            bucket=location.bucket,
            key=location.key,
            canonical_url=reference,
        )

    if not reference:
        raise ValueError("Storage reference must not be empty")
    if reference.startswith("/"):
        raise ValueError(
            "Invalid storage reference "
            f"{reference!r}: expected bucket-relative key without leading slash"
        )
    if "://" in reference:
        raise ValueError(
            "Invalid storage reference "
            f"{reference!r}: only s3://bucket/key or bucket-relative keys are supported"
        )

    return ResolvedS3WriteTarget(
        reference=reference,
        bucket=default_bucket,
        key=reference,
        canonical_url=f"s3://{default_bucket}/{reference}",
    )


class S3Client:
    """Thin boto3 wrapper supporting both AWS S3 and MinIO.

    Pass ``S3Settings.endpoint_url=None`` for AWS S3, or a URL such as
    ``http://minio:9000`` for a MinIO-compatible endpoint.
    """

    def __init__(self, settings: S3Settings) -> None:
        if boto3 is None:
            raise ModuleNotFoundError(
                "boto3 is required to use S3Client. Install ai-common runtime dependencies first."
            )
        kwargs: dict[str, object] = {"region_name": settings.region}
        if settings.endpoint_url is not None:
            kwargs["endpoint_url"] = settings.endpoint_url
        if settings.access_key_id is not None:
            kwargs["aws_access_key_id"] = settings.access_key_id
        if settings.secret_access_key is not None:
            kwargs["aws_secret_access_key"] = settings.secret_access_key

        self._client = boto3.client("s3", **kwargs)  # type: ignore[arg-type]
        self._default_bucket = settings.bucket

    @property
    def default_bucket(self) -> str:
        return self._default_bucket

    def read_bytes(self, url: str) -> bytes:
        """Download an object by its ``s3://bucket/key`` URL and return raw bytes."""
        loc = parse_s3_url(url)
        _logger.debug("s3_read", bucket=loc.bucket, key=loc.key)
        response = self._client.get_object(Bucket=loc.bucket, Key=loc.key)
        return response["Body"].read()  # type: ignore[no-any-return]

    def read_text(self, url: str, encoding: str = "utf-8") -> str:
        """Download an object and decode it as text."""
        return self.read_bytes(url).decode(encoding)

    def write_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        bucket: str | None = None,
    ) -> str:
        """Upload bytes and return the canonical ``s3://bucket/key`` URL."""
        target = bucket or self._default_bucket
        _logger.debug("s3_write", bucket=target, key=key, size=len(data))
        self._client.put_object(
            Bucket=target,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return f"s3://{target}/{key}"

    def write_bytes_to_ref(
        self,
        reference: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> ResolvedS3WriteTarget:
        """Upload bytes using a reserved storage reference."""
        target = resolve_s3_write_target(reference, self._default_bucket)
        _logger.debug("s3_write_ref", bucket=target.bucket, key=target.key, reference=reference)
        self._client.put_object(
            Bucket=target.bucket,
            Key=target.key,
            Body=data,
            ContentType=content_type,
        )
        return target

    def write_text(
        self,
        key: str,
        text: str,
        encoding: str = "utf-8",
        content_type: str = "text/plain; charset=utf-8",
        bucket: str | None = None,
    ) -> str:
        """Encode text and upload, returning the ``s3://bucket/key`` URL."""
        return self.write_bytes(
            key,
            text.encode(encoding),
            content_type=content_type,
            bucket=bucket,
        )

    def write_text_to_ref(
        self,
        reference: str,
        text: str,
        encoding: str = "utf-8",
        content_type: str = "text/plain; charset=utf-8",
    ) -> ResolvedS3WriteTarget:
        """Upload text using a reserved storage reference."""
        return self.write_bytes_to_ref(
            reference,
            text.encode(encoding),
            content_type=content_type,
        )

    def write_json(
        self,
        key: str,
        payload: object,
        *,
        bucket: str | None = None,
        indent: int = 2,
    ) -> str:
        """Serialize payload as UTF-8 JSON and upload it."""
        return self.write_text(
            key,
            json.dumps(payload, ensure_ascii=False, indent=indent),
            content_type="application/json; charset=utf-8",
            bucket=bucket,
        )

    def object_exists(self, url: str) -> bool:
        """Return True if the object at the given URL exists.

        Only 404 is treated as absence — any other error (e.g. permission
        denied) propagates so callers are not misled by silent failures.
        """
        loc = parse_s3_url(url)
        try:
            self._client.head_object(Bucket=loc.bucket, Key=loc.key)
            return True
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "404":
                return False
            raise
