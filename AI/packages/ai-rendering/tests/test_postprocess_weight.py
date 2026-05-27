"""Tests for RealESRGAN weight checksum verification + atomic download."""

from __future__ import annotations

import hashlib
from pathlib import Path
from unittest import mock

import pytest

from ai_rendering.ifc2img.exceptions import IFCRenderError
from ai_rendering.ifc2img.postprocess import (
    _sha256_of_file,
    ensure_realesrgan_weight,
)


def _write_payload(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def _sha(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def test_ensure_realesrgan_weight_passthrough_when_cache_checksum_matches(
    tmp_path: Path,
) -> None:
    """Cached weight with matching SHA256 is returned without re-downloading."""
    weight = tmp_path / "RealESRGAN_x4plus.pth"
    payload = b"valid-weight-bytes"
    _write_payload(weight, payload)

    with mock.patch(
        "urllib.request.urlretrieve",
    ) as urlretrieve:
        result = ensure_realesrgan_weight(
            weight_path=weight,
            expected_sha256=_sha(payload),
        )

    urlretrieve.assert_not_called()
    assert result == weight
    assert weight.read_bytes() == payload


def test_ensure_realesrgan_weight_replaces_corrupt_cache(tmp_path: Path) -> None:
    """A cache file with the wrong SHA256 (partial / stale) is replaced."""
    weight = tmp_path / "RealESRGAN_x4plus.pth"
    _write_payload(weight, b"corrupt-truncated-bytes")
    good_payload = b"correctly-downloaded-bytes"

    def fake_urlretrieve(url: str, dst: str) -> None:
        Path(dst).write_bytes(good_payload)

    with mock.patch(
        "urllib.request.urlretrieve",
        side_effect=fake_urlretrieve,
    ) as urlretrieve:
        result = ensure_realesrgan_weight(
            weight_path=weight,
            weight_url="https://example.invalid/weight.pth",
            expected_sha256=_sha(good_payload),
        )

    urlretrieve.assert_called_once()
    assert result == weight
    assert weight.read_bytes() == good_payload
    assert not weight.with_name(weight.name + ".partial").exists()


def test_ensure_realesrgan_weight_raises_when_download_checksum_mismatches(
    tmp_path: Path,
) -> None:
    """A freshly downloaded file with wrong checksum fails before being kept."""
    weight = tmp_path / "RealESRGAN_x4plus.pth"
    bad_payload = b"upstream-substituted-or-tampered-bytes"

    def fake_urlretrieve(url: str, dst: str) -> None:
        Path(dst).write_bytes(bad_payload)

    with mock.patch(
        "urllib.request.urlretrieve",
        side_effect=fake_urlretrieve,
    ):
        with pytest.raises(IFCRenderError, match="checksum mismatch"):
            ensure_realesrgan_weight(
                weight_path=weight,
                expected_sha256="0" * 64,
            )

    assert not weight.exists()
    assert not weight.with_name(weight.name + ".partial").exists()


def test_ensure_realesrgan_weight_cleans_up_partial_on_network_error(
    tmp_path: Path,
) -> None:
    """If urlretrieve dies mid-download, the .partial sibling does not linger."""
    weight = tmp_path / "RealESRGAN_x4plus.pth"

    def failing_urlretrieve(url: str, dst: str) -> None:
        Path(dst).write_bytes(b"partial...")
        raise ConnectionError("network dropped")

    with mock.patch(
        "urllib.request.urlretrieve",
        side_effect=failing_urlretrieve,
    ):
        with pytest.raises(ConnectionError):
            ensure_realesrgan_weight(
                weight_path=weight,
                expected_sha256="0" * 64,
            )

    assert not weight.exists()
    assert not weight.with_name(weight.name + ".partial").exists()


def test_sha256_of_file_streams_large_files(tmp_path: Path) -> None:
    """Helper hashes via streaming so multi-MB files do not blow up memory."""
    payload = b"A" * (3 * 1024 * 1024)
    path = tmp_path / "blob.bin"
    path.write_bytes(payload)
    assert _sha256_of_file(path) == hashlib.sha256(payload).hexdigest()
