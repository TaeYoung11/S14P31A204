"""Object storage adapters backed by boto3."""

from ai_common.adapters.storage.s3_client import (
    ResolvedS3WriteTarget,
    S3Client,
    S3Location,
    parse_s3_url,
    resolve_s3_write_target,
)

__all__ = [
    "ResolvedS3WriteTarget",
    "S3Client",
    "S3Location",
    "parse_s3_url",
    "resolve_s3_write_target",
]
