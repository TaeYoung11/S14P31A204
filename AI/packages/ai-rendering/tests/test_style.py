"""ifc2img/style.py의 depth-to-style 렌더 계약과 semantic control 옵션을 검증한다.

이 파일은 실제 torch/diffusers 모델을 로드하지 않고 `DepthStyleRenderer`를 mock으로 구성해
prompt 조립, negative term 병합, ControlNet 입력 구성, preset별 render option resolver를 확인한다.
front/side 하단 벽 환각과 FRONT_DIAGONAL ground 환각을 줄이기 위해 도입한 semantic mask,
ground-plane-aware mask, attenuation 옵션이 의도한 view와 preset에만 적용되는지도 함께 검증한다.
"""

from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pytest
from PIL import Image

from ai_rendering.ifc2img import (
    DepthStyleParams,
    DepthStyleRenderer,
    DepthStyleRenderOptions,
    DepthStyleResult,
    IFCRenderError,
    IFCView,
    load_preset,
    resolve_preset_background_params,
    resolve_preset_view_render_options,
)
from ai_rendering.ifc2img.style import (
    ADE20K_BUILDING_RGB,
    ADE20K_GRASS_RGB,
    ADE20K_ROAD_RGB,
    ADE20K_SKY_RGB,
    BACKGROUND_INPAINT_NEGATIVE_TERMS,
    BACKGROUND_PRIORS_BY_PRESET,
    FRONT_DIAGONAL_NEGATIVE_TERMS,
    FRONT_SIDE_NEGATIVE_TERMS,
    SEMANTIC_BACKGROUND_RGB,
    SEMANTIC_BUILDING_RGB,
    SEMANTIC_GROUND_RGB,
    _append_negative_terms,
    _apply_front_diagonal_ground_plane_control_attenuation,
    _build_front_diagonal_building_mask,
    _build_front_diagonal_ground_mask,
    _build_front_diagonal_ground_plane_aware_mask,
    _build_front_diagonal_ground_seg_control,
    _build_front_full_width_ground_mask,
    _build_front_full_width_seg_control,
    _build_front_side_seg_control,
    _build_front_side_semantic_mask,
)
@pytest.fixture
def mock_depth_renderer() -> DepthStyleRenderer:
    """실제 SD/ControlNet pipeline 없이 render 호출 인자만 관찰하는 renderer fixture를 만든다."""
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
    """render 결과가 이미지, params, depth/output size를 담은 DepthStyleResult인지 확인한다."""
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
    """depth image가 pipe의 control 입력으로 전달되고 prompt/해상도 인자가 유지되는지 확인한다."""
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
    """seed가 있을 때 torch.Generator를 만들고 manual_seed로 재현성을 고정하는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x", seed=42)

    mock_depth_renderer.render(depth, params)

    mock_depth_renderer._torch.Generator.assert_called_once_with(device="cpu")
    mock_depth_renderer._torch.Generator.return_value.manual_seed.assert_called_once_with(42)


def test_seedless_render_no_generator(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """seed가 없으면 generator를 만들지 않고 pipe에 None을 전달해야 한다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x", seed=None)

    mock_depth_renderer.render(depth, params)

    assert mock_depth_renderer.pipe.call_args.kwargs["generator"] is None
    mock_depth_renderer._torch.Generator.assert_not_called()


def test_pipe_failure_wrapped_in_ifcrendererror(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """diffusion pipe 실패가 외부 호출자에게 IFCRenderError로 감싸져 전달되는지 확인한다."""
    mock_depth_renderer.pipe.side_effect = RuntimeError("CUDA OOM")
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    with pytest.raises(IFCRenderError, match="Render failed"):
        mock_depth_renderer.render(depth, params)


def test_l_mode_depth_converted_to_rgb(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """흑백 depth control image가 ControlNet에 맞는 RGB 이미지로 변환되는지 확인한다."""
    depth_l = Image.new("L", (768, 448), 100)
    assert depth_l.mode == "L"

    mock_depth_renderer.render(depth_l, DepthStyleParams(prompt="x"))

    control = mock_depth_renderer.pipe.call_args.kwargs["image"]
    assert control.mode == "RGB"


def test_result_save_creates_parent_dir(tmp_path: Path) -> None:
    """DepthStyleResult.save가 부모 디렉터리를 만들고 저장 경로를 반환하는지 확인한다."""
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
    """ifc2img public API가 renderer, style, preset, view helper를 노출하는지 확인한다."""
    from ai_rendering import ifc2img

    expected = {
        "IFCRenderer",
        "IFCView",
        "IFCRenderError",
        "DepthStyleParams",
        "DepthStyleResult",
        "DepthStyleRenderer",
        "DepthStyleRenderOptions",
        "resolve_preset_background_params",
        "resolve_preset_view_render_options",
        "list_presets",
        "load_preset",
        "build_view_prompt",
    }
    assert set(ifc2img.__all__) == expected


def test_package_root_does_not_eager_load_renderer() -> None:
    """가벼운 package root import가 Open3D renderer 모듈을 즉시 로드하지 않는지 확인한다."""
    import importlib
    import sys

    from ai_rendering import ifc2img

    sys.modules.pop("ai_rendering.ifc2img.renderer", None)
    importlib.reload(ifc2img)

    assert "ai_rendering.ifc2img.renderer" not in sys.modules


def test_resolve_preset_view_render_options_fixes_korean_villa_candidate() -> None:
    """korean_villa front 후보가 선택된 semantic control 경로로 고정되어 있는지 확인한다."""
    front = resolve_preset_view_render_options("korean_villa", IFCView.FRONT)
    side = resolve_preset_view_render_options("korean_villa", IFCView.SIDE)

    assert isinstance(front, DepthStyleRenderOptions)
    assert front.use_front_full_width_semantic_control is True
    assert front.use_front_side_semantic_control is False
    assert front.front_side_ground_class == "neutral"
    assert front.front_side_semantic_control_scale == 0.25
    assert front.requires_semantic_controlnet is True
    assert side == DepthStyleRenderOptions()


def test_resolve_preset_view_render_options_fixes_korean_house_candidate() -> None:
    """korean_house view별 후보 옵션을 유지하는지 확인한다."""
    front = resolve_preset_view_render_options("korean_house", IFCView.FRONT)
    side = resolve_preset_view_render_options("korean_house", IFCView.SIDE)
    front_diagonal_right = resolve_preset_view_render_options(
        "korean_house",
        IFCView.FRONT_DIAGONAL_RIGHT,
    )
    front_diagonal_left = resolve_preset_view_render_options(
        "korean_house",
        IFCView.FRONT_DIAGONAL_LEFT,
    )

    assert front.use_front_full_width_semantic_control is True
    assert front.use_front_side_semantic_control is False
    assert front.front_side_ground_class == "neutral"
    assert front.front_side_semantic_control_scale == 0.35
    assert front.requires_semantic_controlnet is True

    assert side.use_front_full_width_semantic_control is False
    assert side.use_front_side_semantic_control is True
    assert side.front_side_ground_class == "neutral"
    assert side.front_side_semantic_control_scale == 0.35
    assert side.requires_semantic_controlnet is True

    assert front_diagonal_right.use_front_diagonal_ground_semantic_control is True
    assert front_diagonal_right.use_front_diagonal_ground_plane_control_attenuation is True
    assert front_diagonal_right.front_side_ground_class == "grass"
    assert front_diagonal_right.front_side_semantic_control_scale == 0.25
    assert front_diagonal_right.requires_semantic_controlnet is True

    assert front_diagonal_left.use_front_diagonal_ground_semantic_control is True
    assert front_diagonal_left.use_front_diagonal_ground_plane_control_attenuation is True
    assert front_diagonal_left.front_side_ground_class == "grass"
    assert front_diagonal_left.front_side_semantic_control_scale == 0.25
    assert front_diagonal_left.requires_semantic_controlnet is True



def test_resolve_preset_view_render_options_defaults_for_other_paths() -> None:
    """semantic control이 필요 없는 preset/view 조합은 기본 render option을 반환해야 한다."""
    default = DepthStyleRenderOptions()

    assert resolve_preset_view_render_options("scandinavian", IFCView.FRONT) == default
    assert (
        resolve_preset_view_render_options(
            "scandinavian",
            IFCView.FRONT_DIAGONAL_RIGHT,
        )
        == default
    )
    assert resolve_preset_view_render_options("korean_house", None) == default


def test_resolve_preset_background_params_uses_yard_only_priors() -> None:
    """Preset별 yard/background prior를 분리해 가져오는지 확인한다."""
    korean = resolve_preset_background_params("korean_house")
    villa = resolve_preset_background_params("korean_villa")
    scandi = resolve_preset_background_params("scandinavian")

    assert korean.prompt == BACKGROUND_PRIORS_BY_PRESET["korean_house"]
    assert "Korean residential yard" in korean.prompt
    assert "white concrete facade" not in korean.prompt
    assert "simple tile roof" not in korean.prompt
    assert "villa yard" in villa.prompt
    assert "nordic gravel yard" in scandi.prompt
    assert korean.negative_prompt == BACKGROUND_INPAINT_NEGATIVE_TERMS
    assert "white platform" in korean.negative_prompt
    assert korean.guidance_scale == 6.0
    assert korean.controlnet_conditioning_scale == 0.65


def test_resolve_preset_background_params_rejects_unknown() -> None:
    """등록되지 않은 background preset 요청은 명확한 렌더 오류로 거절해야 한다."""
    with pytest.raises(IFCRenderError, match="unknown background preset"):
        resolve_preset_background_params("unknown")


def test_depth_style_render_options_as_kwargs_matches_render_options() -> None:
    """DepthStyleRenderOptions가 render 호출 kwargs로 안정적으로 변환되는지 확인한다."""
    options = DepthStyleRenderOptions(
        use_front_side_semantic_control=True,
        use_front_diagonal_ground_semantic_control=True,
        front_side_ground_class="neutral",
        front_side_semantic_control_scale=0.25,
    )

    assert options.as_render_kwargs() == {
        "use_front_side_semantic_control": True,
        "use_front_full_width_semantic_control": False,
        "use_front_diagonal_ground_semantic_control": True,
        "use_front_diagonal_ground_plane_aware_semantic_control": False,
        "use_front_diagonal_ground_plane_control_attenuation": False,
        "front_side_ground_class": "neutral",
        "front_side_semantic_control_scale": 0.25,
        "front_diagonal_ground_plane_control_attenuation_strength": 0.18,
    }


# 상세한 검증 의도는 해당 테스트 docstring에 기록한다.


def test_depth_style_render_options_rejects_front_semantic_conflict() -> None:
    """front semantic control 옵션 두 종류가 동시에 켜지는 잘못된 조합을 생성 시점에 막는다."""
    with pytest.raises(IFCRenderError, match="mutually exclusive"):
        DepthStyleRenderOptions(
            use_front_full_width_semantic_control=True,
            use_front_side_semantic_control=True,
        )


def test_render_with_view_appends_suffix_to_prompt(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """view를 넘긴 render가 view-aware prompt 조립 결과를 pipe에 전달하는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT_DIAGONAL_RIGHT)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt.startswith("front diagonal view")
    assert len(call_prompt) > len(base_prompt)
    assert "aerial" in call_prompt or "roof" in call_prompt


def test_render_without_view_uses_raw_prompt(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """view가 없으면 renderer가 원본 prompt를 그대로 사용해야 한다."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params)  # view=None (default)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt == base_prompt


def test_render_with_view_front_prepends_ground_line_prefix(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """front view prompt 앞쪽에 facade와 ground contact 조건이 붙는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt.startswith("open flat ground in front")
    assert call_prompt.endswith(base_prompt)
    assert "facade touches ground" in call_prompt
    assert "no foreground wall" in call_prompt
    assert "no foundation wall" in call_prompt
    assert "no retaining wall" in call_prompt


# 상세한 검증 의도는 해당 테스트 docstring에 기록한다.

def test_render_with_view_front_softens_scandinavian_concrete_wall_prior(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """scandinavian front prompt의 벽체 prior가 과해지지 않도록 약화되는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    params = load_preset("scandinavian", "day")

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt.startswith("open paved ground")
    assert "house on ground" in call_prompt
    assert "no front wall" in call_prompt
    assert "no foundation wall" not in call_prompt
    assert "no retaining wall" not in call_prompt
    assert "light painted house facade" in call_prompt
    assert "white concrete facade" not in call_prompt


def test_render_with_view_side_softens_scandinavian_concrete_wall_prior(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """scandinavian side prompt에서도 concrete wall prior가 과해지지 않도록 조정되는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    params = load_preset("scandinavian", "day")

    mock_depth_renderer.render(depth, params, view=IFCView.SIDE)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt.startswith("open ground beside house")
    assert "house on ground" in call_prompt
    assert "no side wall" in call_prompt
    assert "side facade at ground line" not in call_prompt
    assert "no foundation wall" not in call_prompt
    assert "light painted house facade" in call_prompt
    assert "white concrete facade" not in call_prompt


def test_render_with_view_front_diagonal_prepends_ground_sky_prefix(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """FRONT_DIAGONAL view prompt 앞쪽에 대각선 시점과 ground/sky 위치 조건이 붙는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT_DIAGONAL_RIGHT)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt.startswith("front diagonal view")
    assert call_prompt.endswith(base_prompt)
    assert "building on flat ground" in call_prompt
    assert "dry ground around house" in call_prompt
    assert "no pool" in call_prompt
    assert "not aerial" in call_prompt


def test_render_with_view_front_diagonal_removes_blue_sky_prior(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """대각선 view에서 blue sky cue를 제거하는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = (
        "RAW photo, scandinavian house, during sunny daytime, natural sunlight, blue sky"
    )
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT_DIAGONAL_RIGHT)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert "blue sky" not in call_prompt
    assert "building on flat ground" in call_prompt
    assert "natural sunlight" in call_prompt


def test_render_with_view_front_diagonal_left_appends_water_negative_terms(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """FRONT_DIAGONAL view negative에 pool/water/reflection 계열 억제어가 추가되는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    base_negative = "(worst quality:1.4), interior"
    params = DepthStyleParams(
        prompt="RAW photo, scandinavian house",
        negative_prompt=base_negative,
    )

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT_DIAGONAL_LEFT)

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative.startswith(base_negative)
    assert call_negative.endswith(FRONT_DIAGONAL_NEGATIVE_TERMS)


def test_render_with_view_front_diagonal_right_deduplicates_water_negative_terms(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """FRONT_DIAGONAL negative term 추가 시 기존 단어가 중복되지 않는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    base_negative = "(worst quality:1.4), water"
    params = DepthStyleParams(
        prompt="RAW photo, scandinavian house",
        negative_prompt=base_negative,
    )

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT_DIAGONAL_RIGHT)

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative.count("water") == 1
    assert "pool" in call_negative
    assert "reflection" in call_negative
    assert "mirror floor" in call_negative


def test_render_with_view_front_appends_foundation_negative_terms(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """front/side view에서 하단 층, 옹벽, platform 계열 negative가 추가되는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(
        prompt="RAW photo, scandinavian house",
        negative_prompt="(worst quality:1.4)",
    )

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT)

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative.endswith(FRONT_SIDE_NEGATIVE_TERMS)


def test_append_negative_terms_deduplicates_terms() -> None:
    """negative term 병합 helper가 중복 단어를 제거하는지 확인한다."""
    result = _append_negative_terms(
        "low quality, stone wall, retaining wall",
        "stone wall, retaining wall, extra lower floor",
    )

    assert result == "low quality, stone wall, retaining wall, extra lower floor"


def test_append_negative_terms_prefers_weighted_duplicate() -> None:
    """동일 term이 있으면 더 강한 weighted 표현을 우선 유지하는지 확인한다."""
    result = _append_negative_terms(
        "low quality, stone wall, retaining wall, raised platform",
        "(stone wall:1.2), (retaining wall:1.25), (raised platform:1.2)",
    )

    assert result == (
        "low quality, (stone wall:1.2), (retaining wall:1.25), "
        "(raised platform:1.2)"
    )


def test_build_front_side_semantic_mask_marks_building_geometry() -> None:
    """front/side semantic mask가 depth geometry 영역을 building으로 표시하는지 확인한다."""
    control = Image.new("RGB", (24, 24), (0, 0, 0))
    arr = np.array(control)
    arr[4:14, 8:16] = [255, 255, 255]

    mask = _build_front_side_semantic_mask(Image.fromarray(arr, mode="RGB"))
    mask_arr = np.array(mask)

    assert np.all(mask_arr[6, 10] == SEMANTIC_BUILDING_RGB)
    assert np.all(mask_arr[2, 2] == SEMANTIC_BACKGROUND_RGB)


def test_build_front_side_semantic_mask_adds_local_ground_band() -> None:
    """front/side semantic mask가 건물 하단 주변에 국소 ground band를 추가하는지 확인한다."""
    control = Image.new("RGB", (24, 24), (0, 0, 0))
    arr = np.array(control)
    arr[4:14, 8:16] = [255, 255, 255]

    mask = _build_front_side_semantic_mask(Image.fromarray(arr, mode="RGB"))
    mask_arr = np.array(mask)

    ground_pixels = np.all(mask_arr == SEMANTIC_GROUND_RGB, axis=2)
    assert np.any(ground_pixels[13:16, 7:17])
    assert np.all(mask_arr[20, 1] == SEMANTIC_BACKGROUND_RGB)
    assert np.all(mask_arr[20, 22] == SEMANTIC_BACKGROUND_RGB)


def test_build_front_full_width_ground_mask_marks_lower_background_only() -> None:
    """front full-width ground mask가 하단 배경만 ground로 잡고 건물은 보호하는지 확인한다."""
    control = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(control)
    arr[6:18, 10:22] = [255, 255, 255]

    mask = _build_front_full_width_ground_mask(Image.fromarray(arr, mode="RGB"))
    mask_arr = np.array(mask)

    assert mask_arr[22, 2] == 255
    assert mask_arr[22, 30] == 255
    assert mask_arr[16, 16] == 0
    assert mask_arr[4, 2] == 0


def test_build_front_full_width_ground_mask_reclassifies_lower_slab() -> None:
    """front full-width mask가 하단 slab처럼 보이는 영역을 ground로 재분류하는지 확인한다."""
    control = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(control)
    arr[6:18, 10:22] = [255, 255, 255]
    arr[18:22, 6:26] = [255, 255, 255]

    mask = _build_front_full_width_ground_mask(Image.fromarray(arr, mode="RGB"))
    mask_arr = np.array(mask)

    assert mask_arr[17, 16] == 0
    assert mask_arr[18, 16] == 255
    assert mask_arr[20, 8] == 255
    assert mask_arr[24, 2] == 255


def test_build_front_full_width_seg_control_uses_ade20k_classes() -> None:
    """front full-width semantic control이 ADE20K building/ground 색을 쓰는지 확인한다."""
    control = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(control)
    arr[6:18, 10:22] = [255, 255, 255]

    seg = _build_front_full_width_seg_control(
        Image.fromarray(arr, mode="RGB"),
        ground_class="neutral",
    )
    seg_arr = np.array(seg)

    assert np.all(seg_arr[10, 16] == ADE20K_BUILDING_RGB)
    assert np.all(seg_arr[2, 2] == ADE20K_SKY_RGB)
    assert np.all(seg_arr[24, 2] == ADE20K_ROAD_RGB)
    assert np.all(seg_arr[24, 30] == ADE20K_ROAD_RGB)
    assert np.all(seg_arr[16, 16] == ADE20K_BUILDING_RGB)


def test_build_front_full_width_seg_control_reclassifies_lower_slab_as_ground() -> None:
    """front full-width semantic control이 하단 slab 영역을 ground class로 바꾸는지 확인한다."""
    control = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(control)
    arr[6:18, 10:22] = [255, 255, 255]
    arr[18:22, 6:26] = [255, 255, 255]

    seg = _build_front_full_width_seg_control(
        Image.fromarray(arr, mode="RGB"),
        ground_class="neutral",
    )
    seg_arr = np.array(seg)

    assert np.all(seg_arr[17, 16] == ADE20K_BUILDING_RGB)
    assert np.all(seg_arr[18, 16] == ADE20K_ROAD_RGB)
    assert np.all(seg_arr[20, 8] == ADE20K_ROAD_RGB)


def test_build_front_diagonal_ground_mask_marks_lower_background_only() -> None:
    """FRONT_DIAGONAL ground mask가 하단 배경만 선택하고 건물 geometry는 유지하는지 확인한다."""
    control = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(control)
    arr[6:20, 10:22] = [255, 255, 255]

    mask = _build_front_diagonal_ground_mask(Image.fromarray(arr, mode="RGB"))
    mask_arr = np.array(mask)

    assert mask_arr[26, 2] == 255
    assert mask_arr[26, 30] == 255
    assert mask_arr[16, 16] == 0
    assert mask_arr[4, 2] == 0


def test_build_front_diagonal_ground_seg_control_uses_neutral_ground() -> None:
    """FRONT_DIAGONAL ground semantic control이 선택한 ground class 색을 사용하는지 확인한다."""
    control = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(control)
    arr[6:20, 10:22] = [255, 255, 255]

    seg = _build_front_diagonal_ground_seg_control(
        Image.fromarray(arr, mode="RGB"),
        ground_class="neutral",
    )
    seg_arr = np.array(seg)

    assert np.all(seg_arr[10, 16] == ADE20K_BUILDING_RGB)
    assert np.all(seg_arr[2, 2] == ADE20K_SKY_RGB)
    assert np.all(seg_arr[26, 2] == ADE20K_ROAD_RGB)
    assert np.all(seg_arr[26, 30] == ADE20K_ROAD_RGB)


def test_build_front_side_seg_control_uses_ade20k_colors() -> None:
    """front/side semantic control이 ADE20K sky/building/grass 색을 쓰는지 확인한다."""
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
    """front/side semantic control의 ground class를 neutral로 바꿀 수 있는지 확인한다."""
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


def test_render_front_side_semantic_control_requires_semantic_model(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """front/side semantic control은 semantic ControlNet 모델이 없으면 실행되지 않아야 한다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    with pytest.raises(IFCRenderError, match="semantic_controlnet_model_id"):
        mock_depth_renderer.render(
            depth,
            params,
            view=IFCView.FRONT,
            use_front_side_semantic_control=True,
        )


def test_render_front_full_width_semantic_control_requires_semantic_model(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """front full-width semantic control도 semantic ControlNet 모델이 필요함을 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    with pytest.raises(IFCRenderError, match="front full-width semantic control"):
        mock_depth_renderer.render(
            depth,
            params,
            view=IFCView.FRONT,
            use_front_full_width_semantic_control=True,
        )


def test_render_front_side_semantic_control_passes_two_control_images(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """front/side semantic control이 depth와 semantic image를 pipe에 전달하는지 확인한다."""
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


def test_render_front_full_width_semantic_control_passes_two_control_images(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """front full-width semantic control도 두 control image와 scale을 전달하는지 확인한다."""
    mock_depth_renderer.semantic_controlnet_model_id = "mock-seg"
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:18, 10:22] = [255, 255, 255]
    depth = Image.fromarray(arr, mode="RGB")
    params = DepthStyleParams(prompt="x", controlnet_conditioning_scale=1.15)

    mock_depth_renderer.render(
        depth,
        params,
        view=IFCView.FRONT,
        use_front_full_width_semantic_control=True,
        front_side_ground_class="neutral",
        front_side_semantic_control_scale=0.25,
    )

    call_kwargs = mock_depth_renderer.pipe.call_args.kwargs
    seg_arr = np.array(call_kwargs["image"][1])

    assert len(call_kwargs["image"]) == 2
    assert np.all(seg_arr[24, 2] == ADE20K_ROAD_RGB)
    assert np.all(seg_arr[2, 2] == ADE20K_SKY_RGB)
    assert np.all(seg_arr[10, 16] == ADE20K_BUILDING_RGB)
    assert call_kwargs["controlnet_conditioning_scale"] == [
        1.15,
        0.25,
    ]


def test_render_rejects_front_semantic_control_conflict(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """render 호출 단계에서도 front semantic control 상호배타 조건을 다시 검증한다."""
    mock_depth_renderer.semantic_controlnet_model_id = "mock-semantic-cn"
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x", controlnet_conditioning_scale=1.15)

    with pytest.raises(IFCRenderError, match="cannot be enabled together"):
        mock_depth_renderer.render(
            depth,
            params,
            view=IFCView.FRONT,
            use_front_full_width_semantic_control=True,
            use_front_side_semantic_control=True,
        )

    mock_depth_renderer.pipe.assert_not_called()


def test_render_front_diagonal_ground_semantic_control_requires_semantic_model(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """대각선 ground semantic control은 semantic ControlNet 모델이 필요하다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    with pytest.raises(IFCRenderError, match="FRONT_DIAGONAL ground semantic control"):
        mock_depth_renderer.render(
            depth,
            params,
            view=IFCView.FRONT_DIAGONAL_RIGHT,
            use_front_diagonal_ground_semantic_control=True,
        )


def test_render_front_diagonal_ground_semantic_control_passes_two_control_images(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """대각선 semantic control이 depth와 ground control을 함께 전달하는지 확인한다."""
    mock_depth_renderer.semantic_controlnet_model_id = "mock-seg"
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 10:22] = [255, 255, 255]
    depth = Image.fromarray(arr, mode="RGB")
    params = DepthStyleParams(prompt="x", controlnet_conditioning_scale=1.15)

    mock_depth_renderer.render(
        depth,
        params,
        view=IFCView.FRONT_DIAGONAL_LEFT,
        use_front_diagonal_ground_semantic_control=True,
        front_side_ground_class="neutral",
        front_side_semantic_control_scale=0.25,
    )

    call_kwargs = mock_depth_renderer.pipe.call_args.kwargs
    seg_arr = np.array(call_kwargs["image"][1])

    assert len(call_kwargs["image"]) == 2
    assert np.all(seg_arr[26, 2] == ADE20K_ROAD_RGB)
    assert np.all(seg_arr[2, 2] == ADE20K_SKY_RGB)
    assert np.all(seg_arr[10, 16] == ADE20K_BUILDING_RGB)
    assert call_kwargs["controlnet_conditioning_scale"] == [
        1.15,
        0.25,
    ]


def test_render_front_diagonal_ground_plane_aware_semantic_control_reclassifies_slab(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """대각선 ground-plane-aware control이 하단 geometry를 ground로 재분류한다."""
    mock_depth_renderer.semantic_controlnet_model_id = "mock-seg"
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [220, 220, 220]
    depth = Image.fromarray(arr, mode="RGB")
    params = DepthStyleParams(prompt="x", controlnet_conditioning_scale=1.15)

    mock_depth_renderer.render(
        depth,
        params,
        view=IFCView.FRONT_DIAGONAL_RIGHT,
        use_front_diagonal_ground_semantic_control=True,
        use_front_diagonal_ground_plane_aware_semantic_control=True,
        front_side_ground_class="grass",
        front_side_semantic_control_scale=0.25,
    )

    call_kwargs = mock_depth_renderer.pipe.call_args.kwargs
    seg_arr = np.array(call_kwargs["image"][1])

    assert np.all(seg_arr[24, 16] == ADE20K_GRASS_RGB)
    assert np.all(seg_arr[8, 16] == ADE20K_BUILDING_RGB)


def test_render_front_diagonal_ground_plane_control_attenuation_updates_depth_control(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """대각선 attenuation 옵션이 ground plane의 depth control 강도를 낮춘다."""
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [240, 240, 240]
    depth = Image.fromarray(arr, mode="RGB")
    params = DepthStyleParams(prompt="x", controlnet_conditioning_scale=1.15)

    mock_depth_renderer.render(
        depth,
        params,
        view=IFCView.FRONT_DIAGONAL_RIGHT,
        use_front_diagonal_ground_plane_control_attenuation=True,
        front_diagonal_ground_plane_control_attenuation_strength=0.18,
    )

    control_arr = np.array(mock_depth_renderer.pipe.call_args.kwargs["image"])
    original = np.array(depth)

    assert np.any(control_arr[24, 16] != original[24, 16])
    assert np.all(control_arr[8, 16] == original[8, 16])


def test_build_front_diagonal_ground_plane_aware_mask_reclassifies_lower_geometry() -> None:
    """ground-plane-aware mask가 하단 geometry shell을 ground 후보로 선택한다."""
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [220, 220, 220]
    depth = Image.fromarray(arr, mode="RGB")

    regular = np.array(_build_front_diagonal_ground_mask(depth))
    aware = np.array(_build_front_diagonal_ground_plane_aware_mask(depth, shell_ratio=0.25))

    assert regular[24, 16] == 0
    assert aware[24, 16] == 255
    assert aware[8, 16] == 0


def test_build_front_diagonal_ground_plane_aware_mask_shell_uses_object_height() -> None:
    """대각선 ground shell 두께가 객체 높이를 기준으로 계산되는지 확인한다."""
    depth = Image.new("RGB", (100, 100), (0, 0, 0))
    arr = np.array(depth)
    arr[10:50, 45:55] = [180, 180, 180]
    depth = Image.fromarray(arr, mode="RGB")

    aware = np.array(_build_front_diagonal_ground_plane_aware_mask(depth, shell_ratio=0.10))

    assert aware[46, 50] == 255
    assert aware[44, 50] == 0


def test_build_front_diagonal_building_mask_excludes_lower_ground_plane_shell() -> None:
    """대각선 building protect mask가 하단 ground shell을 제외하는지 확인한다."""
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [220, 220, 220]
    depth = Image.fromarray(arr, mode="RGB")

    mask = np.array(_build_front_diagonal_building_mask(depth, ground_shell_ratio=0.08))

    assert mask[8, 16] == 255
    assert mask[22, 16] == 255
    assert mask[24, 16] == 0
    assert mask[2, 2] == 0


def test_apply_front_diagonal_ground_plane_control_attenuation_only_changes_ground_plane() -> None:
    """attenuation helper가 ground plane 영역만 수정하고 건물 depth는 보존하는지 확인한다."""
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [240, 240, 240]
    depth = Image.fromarray(arr, mode="RGB")

    attenuated = np.array(
        _apply_front_diagonal_ground_plane_control_attenuation(depth, strength=0.24)
    )
    original = np.array(depth)

    assert np.any(attenuated[24, 16] != original[24, 16])
    assert np.all(attenuated[8, 16] == original[8, 16])
    assert np.all(attenuated[2, 2] == original[2, 2])


def test_build_front_diagonal_ground_seg_control_can_include_ground_plane_geometry() -> None:
    """대각선 semantic control이 ground plane geometry까지 ground로 포함한다."""
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [220, 220, 220]
    depth = Image.fromarray(arr, mode="RGB")

    seg = np.array(
        _build_front_diagonal_ground_seg_control(
            depth,
            ground_class="grass",
            include_ground_plane=True,
        )
    )

    assert np.all(seg[24, 16] == ADE20K_GRASS_RGB)
    assert np.all(seg[8, 16] == ADE20K_BUILDING_RGB)


def test_render_front_full_width_semantic_control_is_front_only(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """front full-width semantic control이 side view에 잘못 적용되지 않는지 확인한다."""
    mock_depth_renderer.semantic_controlnet_model_id = "mock-seg"
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:18, 10:22] = [255, 255, 255]
    depth = Image.fromarray(arr, mode="RGB")
    params = DepthStyleParams(prompt="x")

    mock_depth_renderer.render(
        depth,
        params,
        view=IFCView.SIDE,
        use_front_full_width_semantic_control=True,
    )

    call_kwargs = mock_depth_renderer.pipe.call_args.kwargs
    assert not isinstance(call_kwargs["image"], list)


def test_render_without_view_uses_raw_negative(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """view가 없으면 negative prompt도 원본 params 값을 그대로 사용해야 한다."""
    depth = Image.new("L", (768, 448), 100)
    base_negative = "(worst quality:1.4), interior"
    params = DepthStyleParams(
        prompt="x",
        negative_prompt=base_negative,
    )

    mock_depth_renderer.render(depth, params)  # view=None

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative == base_negative


# 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
# 상세한 검증 의도는 해당 테스트 docstring에 기록한다.


def test_render_without_view_uses_params_cn_scale(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """view가 없을 때 params의 ControlNet scale이 그대로 pipe에 전달되는지 확인한다."""
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
    """view-aware prompt/negative 조립 결과가 DepthStyleResult.params에도 반영되는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(
        prompt=base_prompt,
        negative_prompt="(worst quality:1.4)",
        controlnet_conditioning_scale=1.0,
    )

    result = mock_depth_renderer.render(depth, params, view=IFCView.FRONT_DIAGONAL_RIGHT)

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert result.params is not params
    assert result.params.prompt.startswith("front diagonal view")
    assert len(result.params.prompt) > len(base_prompt)
    assert result.params.controlnet_conditioning_scale == 1.0
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert params.prompt == base_prompt


def test_render_result_params_identity_preserved_when_view_none(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """view가 없으면 결과 params가 원본 객체 identity를 유지하는지 확인한다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    result = mock_depth_renderer.render(depth, params)  # view=None

    assert result.params is params





