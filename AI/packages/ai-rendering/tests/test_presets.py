"""img2img YAML preset registry의 목록, 로딩, 검증 규칙을 확인한다.

이 파일은 `img2img.presets` 전용 테스트다. 실제 torch/GPU는 사용하지 않고,
기본 preset 파일과 임시 YAML 디렉터리를 이용해 preset 이름 정렬, base preset 상속,
unknown field 차단, required field 검증, 경로 traversal 방어가 동작하는지 확인한다.
"""

from pathlib import Path

import pytest

from ai_rendering.img2img import presets
from ai_rendering.img2img.exceptions import PresetNotFoundError
from ai_rendering.img2img.pipeline import RenderParams


@pytest.fixture
def preset_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):  # type: ignore[type-arg]
    """preset params/prompts 디렉터리를 임시 경로로 바꿔 YAML 케이스를 격리한다."""
    params_dir = tmp_path / "params"
    prompts_dir = tmp_path / "prompts"
    params_dir.mkdir()
    prompts_dir.mkdir()
    monkeypatch.setattr(presets, "_PRESET_DIR", params_dir)
    monkeypatch.setattr(presets, "_PROMPTS_DIR", prompts_dir)
    return params_dir, prompts_dir


def test_list_presets_returns_sorted() -> None:
    """preset 목록은 UI와 batch 처리에서 안정적으로 쓰이도록 정렬된 이름을 반환해야 한다."""
    assert presets.list_presets() == ["industrial", "japanese", "scandinavian"]


def test_load_preset_returns_renderparams() -> None:
    """기본 preset을 로드하면 renderer에 바로 넘길 수 있는 RenderParams가 만들어져야 한다."""
    p = presets.load_preset("scandinavian")
    assert isinstance(p, RenderParams)
    assert p.prompt
    assert p.strength == 0.67
    assert p.controlnet_conditioning_scale == pytest.approx(0.3)


def test_load_preset_base_preset_uses_base_params(
    preset_dirs: tuple[Path, Path],
) -> None:
    """prompt YAML이 base_preset을 지정하면 base params 값을 상속해야 한다."""
    params_dir, prompts_dir = preset_dirs
    (params_dir / "base.yaml").write_text("strength: 0.65\n", encoding="utf-8")
    (prompts_dir / "variant.yaml").write_text(
        "base_preset: base\nprompt: variant prompt\n", encoding="utf-8"
    )
    p = presets.load_preset("variant")
    assert p.prompt == "variant prompt"
    assert p.strength == 0.65


def test_load_preset_missing_raises() -> None:
    """없는 preset 이름은 잘못된 설정으로 보고 PresetNotFoundError를 발생시켜야 한다."""
    with pytest.raises(PresetNotFoundError, match="not found"):
        presets.load_preset("nonexistent_preset_xyz")


def test_load_preset_unknown_field_in_params_raises(
    preset_dirs: tuple[Path, Path],
) -> None:
    """params YAML에 RenderParams가 모르는 필드가 있으면 조용히 무시하지 않아야 한다."""
    params_dir, prompts_dir = preset_dirs
    (prompts_dir / "bad.yaml").write_text("prompt: test\n", encoding="utf-8")
    (params_dir / "bad.yaml").write_text("strength: 0.7\nseed: 42\n", encoding="utf-8")

    with pytest.raises(PresetNotFoundError, match="unknown fields"):
        presets.load_preset("bad")


def test_load_preset_unknown_field_in_prompts_raises(
    preset_dirs: tuple[Path, Path],
) -> None:
    """prompt YAML에 허용되지 않은 key가 있으면 preset 오타를 빠르게 드러내야 한다."""
    params_dir, prompts_dir = preset_dirs
    (prompts_dir / "bad.yaml").write_text(
        "prompt: test\nextra_key: oops\n", encoding="utf-8"
    )
    (params_dir / "bad.yaml").write_text("strength: 0.7\n", encoding="utf-8")

    with pytest.raises(PresetNotFoundError, match="unknown fields"):
        presets.load_preset("bad")


def test_load_preset_missing_required_field_raises(
    preset_dirs: tuple[Path, Path],
) -> None:
    """prompt YAML에 필수 prompt가 빠지면 렌더링 전에 명확한 preset 오류로 중단해야 한다."""
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
    """preset 이름은 파일명으로 쓰이므로 경로 traversal과 애매한 이름을 거절해야 한다."""
    with pytest.raises(PresetNotFoundError, match="invalid preset name"):
        presets.load_preset(bad_name)
