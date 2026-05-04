from __future__ import annotations

import pytest

from ai_common.adapters.storage.s3_client import S3Location, parse_s3_url


def test_parse_valid_simple_url() -> None:
    result = parse_s3_url("s3://bucket/path/file.json")
    assert result == S3Location("bucket", "path/file.json")


def test_parse_nested_key() -> None:
    result = parse_s3_url("s3://my-bucket/a/b/c/file.ifc")
    assert result == S3Location("my-bucket", "a/b/c/file.ifc")


def test_parse_single_segment_key() -> None:
    result = parse_s3_url("s3://bucket/file.png")
    assert result == S3Location("bucket", "file.png")


def test_parse_rejects_https_scheme() -> None:
    with pytest.raises(ValueError, match="s3://bucket/key"):
        parse_s3_url("https://bucket.s3.amazonaws.com/key")


def test_parse_rejects_bare_bucket_no_slash() -> None:
    with pytest.raises(ValueError, match="s3://bucket/key"):
        parse_s3_url("s3://bucket")


def test_parse_rejects_trailing_slash_empty_key() -> None:
    with pytest.raises(ValueError):
        parse_s3_url("s3://bucket/")


def test_parse_rejects_plain_path() -> None:
    with pytest.raises(ValueError):
        parse_s3_url("/local/path/file.json")
