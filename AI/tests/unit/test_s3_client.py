from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from ai_common.adapters.storage.s3_client import ClientError, S3Client, resolve_s3_write_target
from ai_common.config import S3Settings


@pytest.fixture
def s3_settings() -> S3Settings:
    return S3Settings(
        bucket="test-bucket",
        endpoint_url="http://localhost:9000",
        access_key_id="minioadmin",
        secret_access_key="minioadmin",
    )


@pytest.fixture
def mock_boto3_client(s3_settings: S3Settings):
    with patch("ai_common.adapters.storage.s3_client.boto3") as mock_boto3:
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        yield mock_client


def test_write_bytes_calls_put_object_and_returns_url(
    s3_settings: S3Settings,
    mock_boto3_client: MagicMock,
) -> None:
    client = S3Client(s3_settings)
    url = client.write_bytes("path/file.png", b"data")

    mock_boto3_client.put_object.assert_called_once_with(
        Bucket="test-bucket",
        Key="path/file.png",
        Body=b"data",
        ContentType="application/octet-stream",
    )
    assert url == "s3://test-bucket/path/file.png"


def test_write_bytes_uses_explicit_bucket(
    s3_settings: S3Settings,
    mock_boto3_client: MagicMock,
) -> None:
    client = S3Client(s3_settings)
    url = client.write_bytes("key.json", b"{}", bucket="other-bucket")

    call_kwargs = mock_boto3_client.put_object.call_args.kwargs
    assert call_kwargs["Bucket"] == "other-bucket"
    assert url == "s3://other-bucket/key.json"


def test_read_bytes_calls_get_object(
    s3_settings: S3Settings,
    mock_boto3_client: MagicMock,
) -> None:
    body_mock = MagicMock()
    body_mock.read.return_value = b"content"
    mock_boto3_client.get_object.return_value = {"Body": body_mock}

    client = S3Client(s3_settings)
    result = client.read_bytes("s3://test-bucket/path/file.json")

    mock_boto3_client.get_object.assert_called_once_with(
        Bucket="test-bucket",
        Key="path/file.json",
    )
    assert result == b"content"


def test_object_exists_returns_false_on_404(
    s3_settings: S3Settings,
    mock_boto3_client: MagicMock,
) -> None:
    error_response = {"Error": {"Code": "404", "Message": "Not Found"}}
    mock_boto3_client.head_object.side_effect = ClientError(error_response, "HeadObject")

    client = S3Client(s3_settings)
    assert client.object_exists("s3://test-bucket/missing.ifc") is False


def test_object_exists_raises_on_non_404_error(
    s3_settings: S3Settings,
    mock_boto3_client: MagicMock,
) -> None:
    error_response = {"Error": {"Code": "403", "Message": "Forbidden"}}
    mock_boto3_client.head_object.side_effect = ClientError(error_response, "HeadObject")

    client = S3Client(s3_settings)
    with pytest.raises(ClientError):
        client.object_exists("s3://test-bucket/secret.ifc")


def test_object_exists_returns_true_when_present(
    s3_settings: S3Settings,
    mock_boto3_client: MagicMock,
) -> None:
    mock_boto3_client.head_object.return_value = {"ContentLength": 1024}

    client = S3Client(s3_settings)
    assert client.object_exists("s3://test-bucket/exists.ifc") is True


def test_endpoint_url_none_excluded_from_boto3_kwargs() -> None:
    settings = S3Settings(bucket="test-bucket")  # endpoint_url=None by default
    with patch("ai_common.adapters.storage.s3_client.boto3") as mock_boto3:
        mock_boto3.client.return_value = MagicMock()
        S3Client(settings)
        call_kwargs = mock_boto3.client.call_args.kwargs
        assert "endpoint_url" not in call_kwargs


def test_write_bytes_to_ref_uses_explicit_s3_url_target(
    s3_settings: S3Settings,
    mock_boto3_client: MagicMock,
) -> None:
    client = S3Client(s3_settings)

    target = client.write_bytes_to_ref("s3://other-bucket/path/model.ifc", b"ifc-data")

    mock_boto3_client.put_object.assert_called_once_with(
        Bucket="other-bucket",
        Key="path/model.ifc",
        Body=b"ifc-data",
        ContentType="application/octet-stream",
    )
    assert target.reference == "s3://other-bucket/path/model.ifc"
    assert target.canonical_url == "s3://other-bucket/path/model.ifc"


def test_write_bytes_to_ref_uses_default_bucket_for_relative_key(
    s3_settings: S3Settings,
    mock_boto3_client: MagicMock,
) -> None:
    client = S3Client(s3_settings)

    target = client.write_bytes_to_ref("projects/project-1/model.ifc", b"ifc-data")

    mock_boto3_client.put_object.assert_called_once_with(
        Bucket="test-bucket",
        Key="projects/project-1/model.ifc",
        Body=b"ifc-data",
        ContentType="application/octet-stream",
    )
    assert target.reference == "projects/project-1/model.ifc"
    assert target.canonical_url == "s3://test-bucket/projects/project-1/model.ifc"


def test_resolve_s3_write_target_rejects_leading_slash_relative_key() -> None:
    with pytest.raises(ValueError, match="leading slash"):
        resolve_s3_write_target("/projects/project-1/model.ifc", "test-bucket")
