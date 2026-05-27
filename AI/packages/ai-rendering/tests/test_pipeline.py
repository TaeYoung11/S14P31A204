"""img2img pipeline의 public API, params/result 모델, mock 렌더 경로를 검증한다.

이 테스트는 실제 torch/diffusers pipeline을 로드하지 않고, fixture에서 만든 mock renderer로
호출 인자와 반환 타입만 확인한다. 목적은 무거운 모델 실행 없이도 외부에서 기대하는 API
표면, 기본 파라미터, 결과 저장 동작, ControlNet 전달 인자가 깨지지 않았는지 빠르게 잡는 것이다.
"""

from pathlib import Path

import pytest
from PIL import Image

from ai_rendering.img2img import RenderParams, RenderResult, config


def test_public_api_imports() -> None:
    """img2img 패키지에서 외부 사용자가 기대하는 public symbol을 import할 수 있어야 한다."""
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
        "ControlNetRenderer",
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
    """Img2ImgRenderer가 preset 여러 개를 한 번에 처리하는 편의 API를 제공하는지 확인한다."""
    from ai_rendering.img2img import Img2ImgRenderer

    assert hasattr(Img2ImgRenderer, "render_with_presets")
    assert callable(Img2ImgRenderer.render_with_presets)


# ========== RenderParams ==========


def test_render_params_loads_defaults_from_config() -> None:
    """prompt만 넘겨도 config.py의 기본 sampling 값들이 RenderParams에 채워져야 한다."""
    p = RenderParams(prompt="a building")
    assert p.strength == config.DEFAULT_STRENGTH
    assert p.guidance_scale == config.DEFAULT_GUIDANCE_SCALE
    assert p.num_inference_steps == config.DEFAULT_NUM_INFERENCE_STEPS
    assert p.negative_prompt == config.DEFAULT_NEGATIVE
    assert p.seed is None


def test_render_params_accepts_seed() -> None:
    """재현 가능한 렌더링을 위해 seed 값은 RenderParams에 그대로 보존되어야 한다."""
    p = RenderParams(prompt="x", seed=42)
    assert p.seed == 42


# ========== RenderResult.save ==========


def _make_result() -> RenderResult:
    """저장 동작만 검증할 수 있는 작은 RenderResult fixture를 만든다."""
    return RenderResult(
        image=Image.new("RGB", (8, 8), "red"),
        params=RenderParams(prompt="x"),
        input_size=(100, 50),
        output_size=(8, 8),
    )


def test_render_result_save_creates_parent_dir(tmp_path: Path) -> None:
    """결과 저장 시 부모 디렉터리가 없으면 자동으로 생성되어야 한다."""
    deep = tmp_path / "a" / "b" / "c" / "out.png"
    _make_result().save(deep)
    assert deep.exists()


def test_render_result_save_returns_path(tmp_path: Path) -> None:
    """`.save()`는 후속 처리에서 바로 쓸 수 있도록 저장된 Path를 반환해야 한다."""
    out = _make_result().save(tmp_path / "out.png")
    assert isinstance(out, Path)
    assert out.exists()


def test_render_result_save_accepts_str_path(tmp_path: Path) -> None:
    """호출자가 문자열 경로를 넘겨도 Path 입력과 같은 방식으로 저장되어야 한다."""
    out = _make_result().save(str(tmp_path / "out.png"))
    assert isinstance(out, Path)
    assert out.exists()


# ========== Mocked render / render_with_presets ==========


def test_renderer_render_returns_render_result(mock_renderer, input_dir: Path) -> None:  # type: ignore[no-untyped-def]
    """mocked img2img renderer가 pipeline 호출 결과를 RenderResult로 감싸는지 확인한다."""
    src = input_dir / "input (1).jpg"
    result = mock_renderer.render(src, RenderParams(prompt="test"))
    assert isinstance(result, RenderResult)
    assert result.input_size[0] > 0
    assert result.output_size == (768, 448)
    mock_renderer.pipe.assert_called_once()


def test_render_with_presets_iterates_all_names(mock_renderer, input_dir: Path) -> None:  # type: ignore[no-untyped-def]
    """여러 preset 이름을 넘기면 각 preset별 결과 dict와 동일한 횟수의 pipe 호출이 생겨야 한다."""
    src = input_dir / "input (1).jpg"
    results = mock_renderer.render_with_presets(
        src, preset_names=["scandinavian", "industrial", "japanese"]
    )
    assert set(results.keys()) == {"scandinavian", "industrial", "japanese"}
    assert mock_renderer.pipe.call_count == 3


def test_render_with_presets_applies_overrides(mock_renderer, input_dir: Path) -> None:  # type: ignore[no-untyped-def]
    """preset 렌더링에 넘긴 override 값은 각 RenderResult.params에 반영되어야 한다."""
    src = input_dir / "input (1).jpg"
    results = mock_renderer.render_with_presets(
        src, preset_names=["scandinavian"], seed=42
    )
    assert results["scandinavian"].params.seed == 42


# ========== ControlNetRenderer ==========


def test_controlnet_renderer_has_render_method() -> None:
    """ControlNetRenderer가 일반 renderer와 동일하게 render 진입점을 제공하는지 확인한다."""
    from ai_rendering.img2img import ControlNetRenderer

    assert hasattr(ControlNetRenderer, "render")
    assert callable(ControlNetRenderer.render)


def test_controlnet_renderer_render_returns_render_result(
    mock_controlnet_renderer, input_dir: Path  # type: ignore[no-untyped-def]
) -> None:
    """mocked ControlNet renderer도 결과를 RenderResult로 감싸고 pipe를 한 번 호출해야 한다."""
    src = input_dir / "input (1).jpg"
    result = mock_controlnet_renderer.render(src, RenderParams(prompt="test", seed=42))
    assert isinstance(result, RenderResult)
    assert result.input_size[0] > 0
    assert result.output_size == (768, 448)
    mock_controlnet_renderer.pipe.assert_called_once()


def test_controlnet_renderer_passes_control_image_to_pipe(
    mock_controlnet_renderer, input_dir: Path  # type: ignore[no-untyped-def]
) -> None:
    """ControlNet 경로에서는 전처리된 control image가 pipe 호출 인자로 전달되어야 한다."""
    src = input_dir / "input (1).jpg"
    mock_controlnet_renderer.render(src, RenderParams(prompt="test", seed=1))
    call_kwargs = mock_controlnet_renderer.pipe.call_args.kwargs
    assert "control_image" in call_kwargs
    assert call_kwargs["control_image"] is not None


def test_controlnet_renderer_passes_conditioning_scale_to_pipe(
    mock_controlnet_renderer, input_dir: Path  # type: ignore[no-untyped-def]
) -> None:
    """RenderParams의 ControlNet conditioning scale이 pipe 호출에 그대로 전달되어야 한다."""
    src = input_dir / "input (1).jpg"
    params = RenderParams(prompt="test", seed=1, controlnet_conditioning_scale=0.3)
    mock_controlnet_renderer.render(src, params)
    call_kwargs = mock_controlnet_renderer.pipe.call_args.kwargs
    assert call_kwargs["controlnet_conditioning_scale"] == pytest.approx(0.3)


def test_controlnet_renderer_result_params_preserve_cn_scale(
    mock_controlnet_renderer, input_dir: Path  # type: ignore[no-untyped-def]
) -> None:
    """렌더링 결과에 포함된 params에도 ControlNet conditioning scale이 보존되어야 한다."""
    src = input_dir / "input (1).jpg"
    params = RenderParams(prompt="test", seed=1, controlnet_conditioning_scale=0.6)
    result = mock_controlnet_renderer.render(src, params)
    assert result.params.controlnet_conditioning_scale == pytest.approx(0.6)
