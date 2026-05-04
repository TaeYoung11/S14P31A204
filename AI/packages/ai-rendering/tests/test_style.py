"""ifc2img/style.py 테스트 — DepthStyleRenderer 호출 흐름 + 결과 래퍼.

torch/diffusers 지연 임포트 덕에 의존성 미설치에서도 import 가능.
실제 SD 로드는 3-Step 6 (E2E) 에서 검증 — 여기선 API/로직만 본다.
"""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from PIL import Image

from ai_rendering.ifc2img import (
    DepthStyleParams,
    DepthStyleRenderer,
    DepthStyleResult,
    IFCRenderError,
    IFCView,
)
@pytest.fixture
def mock_depth_renderer() -> DepthStyleRenderer:
    """DepthStyleRenderer — 실제 SD/ControlNet 로드 없이 로직만 테스트용.

    __new__로 __init__ 우회 → torch/diffusers 로드 회피.
    pipe(...) 호출은 MagicMock이 .images[0]에 더미 PIL 이미지 반환하게 세팅.
    """
    r = DepthStyleRenderer.__new__(DepthStyleRenderer)
    r.model_id = "mock"
    r.controlnet_model_id = "mock-cn"
    r.device = "cpu"
    r.dtype = "float32"  # type: ignore[assignment]
    r.pipe = MagicMock()
    r._torch = MagicMock()
    r.pipe.return_value.images = [Image.new("RGB", (768, 448), "gray")]
    return r


def test_render_returns_result(mock_depth_renderer: DepthStyleRenderer) -> None:
    """render() → DepthStyleResult, image/params/depth_size/output_size 모두 채워짐."""
    depth = Image.new("L", (768, 448), 128)
    params = DepthStyleParams(prompt="a scandinavian living room")

    result = mock_depth_renderer.render(depth, params)

    assert isinstance(result, DepthStyleResult)
    assert result.image.size == (768, 448)
    assert result.params is params
    assert result.depth_size == (768, 448)
    assert result.output_size == (768, 448)


def test_render_passes_depth_as_control(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """pipe 호출 시 image= 인자에 control(depth) 이미지가 전달된다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="industrial loft")

    mock_depth_renderer.render(depth, params)

    call_kwargs = mock_depth_renderer.pipe.call_args.kwargs
    assert "image" in call_kwargs
    assert call_kwargs["image"].size == (768, 448)
    assert call_kwargs["prompt"] == "industrial loft"
    assert call_kwargs["width"] == 768
    assert call_kwargs["height"] == 448


def test_seeded_render_uses_generator(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """seed가 지정되면 torch.Generator.manual_seed가 호출된다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x", seed=42)

    mock_depth_renderer.render(depth, params)

    mock_depth_renderer._torch.Generator.assert_called_once_with(device="cpu")
    mock_depth_renderer._torch.Generator.return_value.manual_seed.assert_called_once_with(42)


def test_seedless_render_no_generator(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """seed=None이면 generator=None이 pipe에 전달된다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x", seed=None)

    mock_depth_renderer.render(depth, params)

    assert mock_depth_renderer.pipe.call_args.kwargs["generator"] is None
    mock_depth_renderer._torch.Generator.assert_not_called()


def test_pipe_failure_wrapped_in_ifcrendererror(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """pipe(...)가 예외를 던지면 IFCRenderError로 래핑되어야 한다."""
    mock_depth_renderer.pipe.side_effect = RuntimeError("CUDA OOM")
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    with pytest.raises(IFCRenderError, match="Render failed"):
        mock_depth_renderer.render(depth, params)


def test_l_mode_depth_converted_to_rgb(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """입력 depth가 mode='L'이어도 ControlNet에는 3채널(RGB)로 전달된다."""
    depth_l = Image.new("L", (768, 448), 100)
    assert depth_l.mode == "L"

    mock_depth_renderer.render(depth_l, DepthStyleParams(prompt="x"))

    control = mock_depth_renderer.pipe.call_args.kwargs["image"]
    assert control.mode == "RGB"


def test_result_save_creates_parent_dir(tmp_path: Path) -> None:
    """DepthStyleResult.save()는 부모 디렉토리를 자동 생성한다."""
    img = Image.new("RGB", (10, 10), "white")
    result = DepthStyleResult(
        image=img,
        params=DepthStyleParams(prompt="x"),
        depth_size=(10, 10),
        output_size=(10, 10),
    )
    target = tmp_path / "sub" / "deeper" / "out.png"

    saved = result.save(target)

    assert saved == target
    assert target.exists()


def test_public_api_exports() -> None:
    """ifc2img 공개 심볼: IFC 렌더 3 + style 3 + presets 2 + view helper 1 = 9개."""
    from ai_rendering import ifc2img

    expected = {
        "IFCRenderer",
        "IFCView",
        "IFCRenderError",
        "DepthStyleParams",
        "DepthStyleResult",
        "DepthStyleRenderer",
        "list_presets",
        "load_preset",
        "build_view_prompt",
    }
    assert set(ifc2img.__all__) == expected


# --- B-1 — DepthStyleRenderer.render(view=...) 인자 ---


def test_render_with_view_appends_suffix_to_prompt(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """B-1 — view=TOP 전달 시 pipe 호출 prompt에 환경 suffix 포함.

    EYE_*/FRONT/SIDE는 빈 suffix이므로 합성 검증에는 명시 호출용 시점(TOP) 사용.
    suffix 합성 메커니즘 자체는 모든 view에서 동일.
    """
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params, view=IFCView.TOP)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt.startswith(base_prompt)
    assert len(call_prompt) > len(base_prompt)
    assert "aerial" in call_prompt or "roof" in call_prompt


def test_render_without_view_uses_raw_prompt(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """B-1 — view=None (default) 시 prompt 그대로 (backward compat)."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params)  # view=None (default)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt == base_prompt


def test_render_with_view_front_no_change(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """B-1 — view=FRONT (suffix='') 전달 시 prompt 그대로."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt == base_prompt


# --- C-1 폐기 후 — render(view=...) negative 합성 인프라 보존 회귀 방어 ---

def test_render_with_view_eye_prepends_ground_sky_prefix(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """EYE_* view prompt front-loads diagonal ground and sky placement cues."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params, view=IFCView.EYE_NE)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt.startswith("eye-level diagonal view")
    assert call_prompt.endswith(base_prompt)
    assert "building on flat ground" in call_prompt
    assert "foreground ground fills frame" in call_prompt
    assert "horizon behind house" in call_prompt
    assert "not aerial" in call_prompt


def test_render_with_view_eye_removes_blue_sky_prior(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """EYE_* view prompt removes the preset day blue-sky prior before pipe call."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = (
        "RAW photo, scandinavian house, during sunny daytime, natural sunlight, blue sky"
    )
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params, view=IFCView.EYE_NE)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert "blue sky" not in call_prompt
    assert "building on flat ground" in call_prompt
    assert "natural sunlight" in call_prompt


def test_render_with_view_eye_nw_keeps_base_negative_after_c1_rollback(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """C-1 폐기 — view=EYE_NW 전달해도 suffix 비어있어 base negative 그대로."""
    depth = Image.new("L", (768, 448), 100)
    base_negative = "(worst quality:1.4), interior"
    params = DepthStyleParams(
        prompt="RAW photo, scandinavian house",
        negative_prompt=base_negative,
    )

    mock_depth_renderer.render(depth, params, view=IFCView.EYE_NW)

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative == base_negative


def test_render_with_view_eye_ne_keeps_base_negative(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """EYE_NE도 빈 suffix → base 그대로 (안정 판정 시점)."""
    depth = Image.new("L", (768, 448), 100)
    base_negative = "(worst quality:1.4)"
    params = DepthStyleParams(
        prompt="RAW photo, scandinavian house",
        negative_prompt=base_negative,
    )

    mock_depth_renderer.render(depth, params, view=IFCView.EYE_NE)

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative == base_negative


def test_render_without_view_uses_raw_negative(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """view=None (default) 시 negative_prompt 그대로 (backward compat)."""
    depth = Image.new("L", (768, 448), 100)
    base_negative = "(worst quality:1.4), interior"
    params = DepthStyleParams(
        prompt="x",
        negative_prompt=base_negative,
    )

    mock_depth_renderer.render(depth, params)  # view=None

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative == base_negative


# per-view negative suffix infra (C-1) + cn_scale override infra (C-2) 폐기.
# 두 인프라 모두 render() 경로에서 호출 자체가 제거된 dead code.


def test_render_without_view_uses_params_cn_scale(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """view=None (default) 시 params.cn_scale 그대로 (backward compat)."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(
        prompt="x",
        controlnet_conditioning_scale=0.85,
    )

    mock_depth_renderer.render(depth, params)  # view=None

    sent_cn = mock_depth_renderer.pipe.call_args.kwargs["controlnet_conditioning_scale"]
    assert sent_cn == 0.85


def test_render_result_params_reflect_applied_view_composition(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """결과 params 반영 — view 전달 시 result.params에 합성된 값이 들어감.

    호출자가 result.params.prompt로 *실제 SD pipe에 전달된 값*을 추적할 수 있어야
    함 (디버깅/로그/재현성). EYE_*/FRONT/SIDE는 빈 suffix이므로 검증에는 명시
    호출 시점(TOP, suffix 보유)을 사용.
    """
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(
        prompt=base_prompt,
        negative_prompt="(worst quality:1.4)",
        controlnet_conditioning_scale=1.0,
    )

    result = mock_depth_renderer.render(depth, params, view=IFCView.TOP)

    # TOP은 prompt suffix 적용 대상 (cn_scale override는 None default)
    assert result.params is not params  # 새 인스턴스 (view-aware 합성 적용)
    assert result.params.prompt.startswith(base_prompt)
    assert len(result.params.prompt) > len(base_prompt)  # suffix 추가됨
    assert result.params.controlnet_conditioning_scale == 1.0  # base 그대로
    # 원본 params는 변경 없음 (immutability 보장 — dc_replace는 새 인스턴스 반환)
    assert params.prompt == base_prompt


def test_render_result_params_identity_preserved_when_view_none(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """view=None 시 result.params는 input params와 동일 인스턴스 (backward compat)."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    result = mock_depth_renderer.render(depth, params)  # view=None

    assert result.params is params
