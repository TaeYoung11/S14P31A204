#!/usr/bin/env python3
"""Bootstrap S3 / MinIO buckets required by the AI worker.

Reads all settings from environment variables — no hardcoded values.

Usage:
    S3_BUCKET=batang-artifacts S3_ENDPOINT_URL=http://localhost:9000 \\
    S3_ACCESS_KEY_ID=minioadmin S3_SECRET_ACCESS_KEY=minioadmin \\
    python scripts/create_minio_buckets.py
"""

from __future__ import annotations

import sys

import boto3
from botocore.exceptions import ClientError

from ai_common.config import S3Settings


def _build_client(settings: S3Settings):
    kwargs: dict[str, object] = {"region_name": settings.region}
    if settings.endpoint_url is not None:
        kwargs["endpoint_url"] = settings.endpoint_url
    if settings.access_key_id is not None:
        kwargs["aws_access_key_id"] = settings.access_key_id
    if settings.secret_access_key is not None:
        kwargs["aws_secret_access_key"] = settings.secret_access_key
    return boto3.client("s3", **kwargs)  # type: ignore[arg-type]


def main() -> None:
    settings = S3Settings()
    client = _build_client(settings)
    bucket = settings.bucket

    try:
        client.head_bucket(Bucket=bucket)
        print(f"Bucket '{bucket}' already exists.")
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code in ("404", "NoSuchBucket"):
            client.create_bucket(Bucket=bucket)
            print(f"Bucket '{bucket}' created.")
        elif code == "403":
            print(
                f"Access Denied (403): You do not have permission to access bucket '{bucket}'.",
                file=sys.stderr,
            )
            sys.exit(1)
        else:
            print(f"Error checking bucket '{bucket}': {exc}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
