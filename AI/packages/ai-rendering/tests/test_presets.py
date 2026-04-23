"""presets 모듈 테스트 — load_preset, list_presets.

torch/GPU 미필요.
오염된 YAML 테스트는 tmp_path + monkeypatch 로 _PRESET_DIR 을 임시 치환 →
실제 프리셋 디렉토리 안 건드림.
"""

from pathlib import Path

import pytest

from img2img import presets
from img2img.exceptions import PresetNotFoundError
from img2img.pipeline import RenderParams


def test_list_presets_returns_sorted() -> None:
    assert presets.list_presets() == ["industrial", "japanese", "scandinavian"]


def test_load_preset_returns_renderparams() -> None:
    p = presets.load_preset("scandinavian")
    assert isinstance(p, RenderParams)
    assert p.prompt  # 비어있지 않음
    assert p.strength == 0.7


def test_load_preset_missing_raises() -> None:
    with pytest.raises(PresetNotFoundError, match="not found"):
        presets.load_preset("nonexistent_preset_xyz")


def test_load_preset_unknown_field_raises(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text("prompt: test\nseed: 42\n", encoding="utf-8")
    monkeypatch.setattr(presets, "_PRESET_DIR", tmp_path)

    with pytest.raises(PresetNotFoundError, match="unknown fields"):
        presets.load_preset("bad")


def test_load_preset_missing_required_field_raises(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text("strength: 0.7\n", encoding="utf-8")
    monkeypatch.setattr(presets, "_PRESET_DIR", tmp_path)

    with pytest.raises(PresetNotFoundError, match="missing required"):
        presets.load_preset("bad")


@pytest.mark.parametrize(
    "bad_name",
    [
        "../etc/hosts",
        "subdir/foo",
        "..\\foo",
        "",
        ".hidden",
        "/absolute/path",
        "name with space",
        "name.dot",
    ],
)
def test_load_preset_rejects_invalid_names(bad_name: str) -> None:
    """경로 구분자·상대경로·빈 문자열 등은 파일 시스템 접근 전에 차단."""
    with pytest.raises(PresetNotFoundError, match="invalid preset name"):
        presets.load_preset(bad_name)