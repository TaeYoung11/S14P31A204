"""presets 모듈 테스트 — load_preset, list_presets.

torch/GPU 미필요.
오염된 YAML 테스트는 tmp_path + monkeypatch 로 _PRESET_DIR / _PROMPTS_DIR 를
임시 치환 → 실제 프리셋/프롬프트 디렉토리 안 건드림.
"""

from pathlib import Path

import pytest

from ai_rendering.img2img import presets
from ai_rendering.img2img.exceptions import PresetNotFoundError
from ai_rendering.img2img.pipeline import RenderParams


@pytest.fixture
def preset_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):  # type: ignore[type-arg]
    """_PRESET_DIR(파라미터)와 _PROMPTS_DIR(프롬프트)를 tmp_path 하위로 격리."""
    params_dir = tmp_path / "params"
    prompts_dir = tmp_path / "prompts"
    params_dir.mkdir()
    prompts_dir.mkdir()
    monkeypatch.setattr(presets, "_PRESET_DIR", params_dir)
    monkeypatch.setattr(presets, "_PROMPTS_DIR", prompts_dir)
    return params_dir, prompts_dir


def test_list_presets_returns_sorted() -> None:
    assert presets.list_presets() == ["industrial", "japanese", "korean", "scandinavian"]


def test_load_preset_returns_renderparams() -> None:
    p = presets.load_preset("scandinavian")
    assert isinstance(p, RenderParams)
    assert p.prompt
    assert p.strength == 0.7


def test_load_preset_base_preset_uses_base_params(
    preset_dirs: tuple[Path, Path],
) -> None:
    params_dir, prompts_dir = preset_dirs
    (params_dir / "base.yaml").write_text("strength: 0.65\n", encoding="utf-8")
    (prompts_dir / "variant.yaml").write_text(
        "base_preset: base\nprompt: variant prompt\n", encoding="utf-8"
    )
    p = presets.load_preset("variant")
    assert p.prompt == "variant prompt"
    assert p.strength == 0.65


def test_load_preset_missing_raises() -> None:
    with pytest.raises(PresetNotFoundError, match="not found"):
        presets.load_preset("nonexistent_preset_xyz")


def test_load_preset_unknown_field_in_params_raises(
    preset_dirs: tuple[Path, Path],
) -> None:
    params_dir, prompts_dir = preset_dirs
    (prompts_dir / "bad.yaml").write_text("prompt: test\n", encoding="utf-8")
    (params_dir / "bad.yaml").write_text("strength: 0.7\nseed: 42\n", encoding="utf-8")

    with pytest.raises(PresetNotFoundError, match="unknown fields"):
        presets.load_preset("bad")


def test_load_preset_unknown_field_in_prompts_raises(
    preset_dirs: tuple[Path, Path],
) -> None:
    params_dir, prompts_dir = preset_dirs
    (prompts_dir / "bad.yaml").write_text("prompt: test\nextra_key: oops\n", encoding="utf-8")
    (params_dir / "bad.yaml").write_text("strength: 0.7\n", encoding="utf-8")

    with pytest.raises(PresetNotFoundError, match="unknown fields"):
        presets.load_preset("bad")


def test_load_preset_missing_required_field_raises(
    preset_dirs: tuple[Path, Path],
) -> None:
    params_dir, prompts_dir = preset_dirs
    (prompts_dir / "bad.yaml").write_text("negative_prompt: foo\n", encoding="utf-8")
    (params_dir / "bad.yaml").write_text("strength: 0.7\n", encoding="utf-8")

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
