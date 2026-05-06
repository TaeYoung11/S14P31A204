"""ifc2img/style.py 테스트 — DepthStyleRenderer 호출 흐름 + 결과 래퍼.

torch/diffusers 지연 임포트 덕에 의존성 미설치에서도 import 가능.
실제 SD 로드는 3-Step 6 (E2E) 에서 검증 — 여기선 API/로직만 본다.
"""

from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pytest
from PIL import Image

from ai_rendering.ifc2img import (
    DepthStyleParams,
    DepthStyleRenderer,
    DepthStyleResult,
    IFCRenderError,
    IFCView,
)
from ai_rendering.ifc2img.style import (
    ADE20K_BUILDING_RGB,
    ADE20K_GRASS_RGB,
    ADE20K_ROAD_RGB,
    ADE20K_SKY_RGB,
    FRONT_SIDE_MASK_CONTROL_RGB,
    FRONT_SIDE_SEMANTIC_CONTROL_SCALE,
    FRONT_SIDE_NEGATIVE_TERMS,
    SEMANTIC_BACKGROUND_RGB,
    SEMANTIC_BUILDING_RGB,
    SEMANTIC_GROUND_RGB,
    _apply_front_side_semantic_mask_to_control,
    _build_front_side_inpaint_mask,
    _build_front_side_seg_control,
    _build_front_side_semantic_mask,
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
    r.semantic_controlnet_model_id = None
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


def test_render_with_view_front_prepends_ground_line_prefix(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """FRONT prompt should front-load ground-contact constraints."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt.startswith("front facade at ground line")
    assert call_prompt.endswith(base_prompt)
    assert "ground line" in call_prompt
    assert "no foundation wall" in call_prompt


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


def test_render_with_view_front_appends_foundation_negative_terms(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """FRONT/SIDE should receive extra lower-façade suppression negatives."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(
        prompt="RAW photo, scandinavian house",
        negative_prompt="(worst quality:1.4)",
    )

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT)

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative.endswith(FRONT_SIDE_NEGATIVE_TERMS)


def test_build_front_side_semantic_mask_marks_building_geometry() -> None:
    """Existing non-background geometry should become the building class."""
    control = Image.new("RGB", (24, 24), (0, 0, 0))
    arr = np.array(control)
    arr[4:14, 8:16] = [255, 255, 255]

    mask = _build_front_side_semantic_mask(Image.fromarray(arr, mode="RGB"))
    mask_arr = np.array(mask)

    assert np.all(mask_arr[6, 10] == SEMANTIC_BUILDING_RGB)
    assert np.all(mask_arr[2, 2] == SEMANTIC_BACKGROUND_RGB)


def test_build_front_side_semantic_mask_adds_local_ground_band() -> None:
    """Ground band should appear below the facade but not fill the far lower frame."""
    control = Image.new("RGB", (24, 24), (0, 0, 0))
    arr = np.array(control)
    arr[4:14, 8:16] = [255, 255, 255]

    mask = _build_front_side_semantic_mask(Image.fromarray(arr, mode="RGB"))
    mask_arr = np.array(mask)

    ground_pixels = np.all(mask_arr == SEMANTIC_GROUND_RGB, axis=2)
    assert np.any(ground_pixels[13:16, 7:17])
    assert np.all(mask_arr[20, 1] == SEMANTIC_BACKGROUND_RGB)
    assert np.all(mask_arr[20, 22] == SEMANTIC_BACKGROUND_RGB)


def test_apply_front_side_semantic_mask_to_control_adds_weak_ground_hint() -> None:
    """Opt-in blend should add a faint ground cue without changing geometry."""
    control = Image.new("RGB", (24, 24), (0, 0, 0))
    arr = np.array(control)
    arr[4:14, 8:16] = [255, 255, 255]

    blended = _apply_front_side_semantic_mask_to_control(
        Image.fromarray(arr, mode="RGB")
    )
    blended_arr = np.array(blended)
    semantic_mask = _build_front_side_semantic_mask(Image.fromarray(arr, mode="RGB"))
    ground_pixels = np.all(np.array(semantic_mask) == SEMANTIC_GROUND_RGB, axis=2)
    ground_y, ground_x = np.nonzero(ground_pixels)
    sample_y = int(ground_y[0])
    sample_x = int(ground_x[0])

    assert np.all(blended_arr[6, 10] == [255, 255, 255])
    assert np.all(blended_arr[2, 2] == [0, 0, 0])
    assert 0 < int(blended_arr[sample_y, sample_x, 0]) < FRONT_SIDE_MASK_CONTROL_RGB[0]


def test_render_front_side_semantic_mask_is_opt_in(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """Default render path should keep the original control image unchanged."""
    depth = Image.new("RGB", (24, 24), (0, 0, 0))
    arr = np.array(depth)
    arr[4:14, 8:16] = [255, 255, 255]
    depth = Image.fromarray(arr, mode="RGB")
    params = DepthStyleParams(prompt="x")

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT)

    control = np.array(mock_depth_renderer.pipe.call_args.kwargs["image"])
    semantic_mask = _build_front_side_semantic_mask(depth)
    ground_pixels = np.all(np.array(semantic_mask) == SEMANTIC_GROUND_RGB, axis=2)
    ground_y, ground_x = np.nonzero(ground_pixels)
    assert np.all(control[int(ground_y[0]), int(ground_x[0])] == [0, 0, 0])


def test_render_front_side_semantic_mask_blends_only_for_front_side_views(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """The opt-in mask should affect FRONT/SIDE only, not unrelated views."""
    depth = Image.new("RGB", (24, 24), (0, 0, 0))
    arr = np.array(depth)
    arr[4:14, 8:16] = [255, 255, 255]
    depth = Image.fromarray(arr, mode="RGB")
    params = DepthStyleParams(prompt="x")

    mock_depth_renderer.render(
        depth,
        params,
        view=IFCView.FRONT,
        use_front_side_semantic_mask=True,
    )
    front_control = np.array(mock_depth_renderer.pipe.call_args.kwargs["image"])
    mock_depth_renderer.render(
        depth,
        params,
        view=IFCView.EYE_NE,
        use_front_side_semantic_mask=True,
    )
    eye_control = np.array(mock_depth_renderer.pipe.call_args.kwargs["image"])
    semantic_mask = _build_front_side_semantic_mask(depth)
    ground_pixels = np.all(np.array(semantic_mask) == SEMANTIC_GROUND_RGB, axis=2)
    ground_y, ground_x = np.nonzero(ground_pixels)
    sample_y = int(ground_y[0])
    sample_x = int(ground_x[0])

    assert front_control[sample_y, sample_x, 0] > 0
    assert np.all(eye_control[sample_y, sample_x] == [0, 0, 0])


def test_build_front_side_seg_control_uses_ade20k_colors() -> None:
    """Seg control should encode building/ground/sky as semantic colors."""
    control = Image.new("RGB", (24, 24), (0, 0, 0))
    arr = np.array(control)
    arr[4:14, 8:16] = [255, 255, 255]

    seg = _build_front_side_seg_control(Image.fromarray(arr, mode="RGB"))
    seg_arr = np.array(seg)
    ground_pixels = np.all(
        np.array(_build_front_side_semantic_mask(Image.fromarray(arr, mode="RGB")))
        == SEMANTIC_GROUND_RGB,
        axis=2,
    )
    ground_y, ground_x = np.nonzero(ground_pixels)

    assert np.all(seg_arr[6, 10] == ADE20K_BUILDING_RGB)
    assert np.all(seg_arr[1, 10] == ADE20K_SKY_RGB)
    assert np.all(seg_arr[int(ground_y[0]), int(ground_x[0])] == ADE20K_GRASS_RGB)


def test_build_front_side_seg_control_can_use_neutral_ground() -> None:
    """Mini-sweep support: ground can be encoded as neutral road-like color."""
    control = Image.new("RGB", (24, 24), (0, 0, 0))
    arr = np.array(control)
    arr[4:14, 8:16] = [255, 255, 255]

    seg = _build_front_side_seg_control(
        Image.fromarray(arr, mode="RGB"),
        ground_class="neutral",
    )
    ground_pixels = np.all(
        np.array(_build_front_side_semantic_mask(Image.fromarray(arr, mode="RGB")))
        == SEMANTIC_GROUND_RGB,
        axis=2,
    )
    ground_y, ground_x = np.nonzero(ground_pixels)

    assert np.all(np.array(seg)[int(ground_y[0]), int(ground_x[0])] == ADE20K_ROAD_RGB)


def test_build_front_side_inpaint_mask_targets_lower_local_region() -> None:
    """Inpaint mask should repaint below the facade while protecting upper details."""
    control = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(control)
    arr[6:18, 10:22] = [255, 255, 255]

    mask = _build_front_side_inpaint_mask(Image.fromarray(arr, mode="RGB"))
    mask_arr = np.array(mask)

    assert mask.mode == "L"
    assert mask_arr[8, 16] == 0
    assert mask_arr[20, 16] == 255
    assert mask_arr[20, 2] == 0
    assert mask_arr[20, 30] == 0


def test_render_front_side_semantic_control_requires_semantic_model(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """Semantic control is opt-in and should fail clearly without a seg ControlNet."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    with pytest.raises(IFCRenderError, match="semantic_controlnet_model_id"):
        mock_depth_renderer.render(
            depth,
            params,
            view=IFCView.FRONT,
            use_front_side_semantic_control=True,
        )


def test_render_front_side_semantic_control_passes_two_control_images(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """With a seg ControlNet loaded, FRONT/SIDE should pass depth + seg controls."""
    mock_depth_renderer.semantic_controlnet_model_id = "mock-seg"
    depth = Image.new("RGB", (24, 24), (0, 0, 0))
    arr = np.array(depth)
    arr[4:14, 8:16] = [255, 255, 255]
    depth = Image.fromarray(arr, mode="RGB")
    params = DepthStyleParams(prompt="x", controlnet_conditioning_scale=1.15)

    mock_depth_renderer.render(
        depth,
        params,
        view=IFCView.FRONT,
        use_front_side_semantic_control=True,
        front_side_ground_class="neutral",
        front_side_semantic_control_scale=0.55,
    )

    call_kwargs = mock_depth_renderer.pipe.call_args.kwargs
    assert len(call_kwargs["image"]) == 2
    assert call_kwargs["image"][0].size == (24, 24)
    assert call_kwargs["image"][1].size == (24, 24)
    assert call_kwargs["controlnet_conditioning_scale"] == [
        1.15,
        0.55,
    ]


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
