"""pipeline 모듈 테스트 — 공개 API + RenderParams/Result + mocked render 흐름.

torch/diffusers 지연 임포트 덕에 의존성 미설치에서도 import 가능한지 확인.
실제 SD 로드/렌더는 스프린트 내 로컬 검증 완료 — 여기선 API/로직만 본다.
"""

from pathlib import Path

from PIL import Image

from ai_rendering.img2img import RenderParams, RenderResult, config


def test_public_api_imports() -> None:
    """from ai_rendering.img2img import ... — 8개 공식 심볼 모두 성공 + __all__ 일치."""
    from ai_rendering.img2img import (  # noqa: F401
        Img2ImgRenderer,
        InvalidInputError,
        PresetNotFoundError,
        RenderError,
        RenderParams,
        RenderResult,
        list_presets,
        load_preset,
    )

    from ai_rendering import img2img

    expected = {
        "Img2ImgRenderer",
        "RenderParams",
        "RenderResult",
        "RenderError",
        "InvalidInputError",
        "PresetNotFoundError",
        "load_preset",
        "list_presets",
    }
    assert set(img2img.__all__) == expected


def test_renderer_has_render_with_presets_method() -> None:
    """MR2 에서 추가된 render_with_presets 가 클래스에 붙어있는지."""
    from ai_rendering.img2img import Img2ImgRenderer

    assert hasattr(Img2ImgRenderer, "render_with_presets")
    assert callable(Img2ImgRenderer.render_with_presets)


# ========== RenderParams ==========


def test_render_params_loads_defaults_from_config() -> None:
    """prompt 만으로 생성 시 나머지 필드는 config.py 기본값에서 와야 함."""
    p = RenderParams(prompt="a building")
    assert p.strength == config.DEFAULT_STRENGTH
    assert p.guidance_scale == config.DEFAULT_GUIDANCE_SCALE
    assert p.num_inference_steps == config.DEFAULT_NUM_INFERENCE_STEPS
    assert p.negative_prompt == config.DEFAULT_NEGATIVE
    assert p.seed is None


def test_render_params_accepts_seed() -> None:
    p = RenderParams(prompt="x", seed=42)
    assert p.seed == 42


# ========== RenderResult.save ==========


def _make_result() -> RenderResult:
    return RenderResult(
        image=Image.new("RGB", (8, 8), "red"),
        params=RenderParams(prompt="x"),
        input_size=(100, 50),
        output_size=(8, 8),
    )


def test_render_result_save_creates_parent_dir(tmp_path: Path) -> None:
    """저장 경로의 부모 디렉토리가 없으면 mkdir -p 해야 함."""
    deep = tmp_path / "a" / "b" / "c" / "out.png"
    _make_result().save(deep)
    assert deep.exists()


def test_render_result_save_returns_path(tmp_path: Path) -> None:
    """.save() 는 저장된 경로를 Path 로 반환."""
    out = _make_result().save(tmp_path / "out.png")
    assert isinstance(out, Path)
    assert out.exists()


def test_render_result_save_accepts_str_path(tmp_path: Path) -> None:
    """str 경로도 지원 (Path 로 내부 변환)."""
    out = _make_result().save(str(tmp_path / "out.png"))
    assert isinstance(out, Path)
    assert out.exists()


# ========== Mocked render / render_with_presets ==========


def test_renderer_render_returns_render_result(mock_renderer, input_dir: Path) -> None:  # type: ignore[no-untyped-def]
    """mocked pipe 로 render() 호출 시 RenderResult 반환, pipe 1회 호출."""
    src = input_dir / "image (17).png"
    result = mock_renderer.render(src, RenderParams(prompt="test"))
    assert isinstance(result, RenderResult)
    assert result.input_size[0] > 0
    # mock_renderer 의 더미 이미지가 (768, 448) 이므로 output_size 도 그대로
    assert result.output_size == (768, 448)
    mock_renderer.pipe.assert_called_once()


def test_render_with_presets_iterates_all_names(mock_renderer, input_dir: Path) -> None:  # type: ignore[no-untyped-def]
    """3 프리셋 전부 처리 → dict 키 일치 + pipe 3회 호출."""
    src = input_dir / "image (17).png"
    results = mock_renderer.render_with_presets(
        src, preset_names=["scandinavian", "industrial", "japanese"]
    )
    assert set(results.keys()) == {"scandinavian", "industrial", "japanese"}
    assert mock_renderer.pipe.call_count == 3


def test_render_with_presets_applies_overrides(mock_renderer, input_dir: Path) -> None:  # type: ignore[no-untyped-def]
    """overrides (seed=42 등) 가 각 RenderResult.params 에 반영되어야."""
    src = input_dir / "image (17).png"
    results = mock_renderer.render_with_presets(
        src, preset_names=["scandinavian"], seed=42
    )
    assert results["scandinavian"].params.seed == 42
