"""ifc2img/style.py ?뚯뒪????DepthStyleRenderer ?몄텧 ?먮쫫 + 寃곌낵 ?섑띁.

torch/diffusers 吏???꾪룷???뺤뿉 ?섏〈??誘몄꽕移섏뿉?쒕룄 import 媛??
?ㅼ젣 SD 濡쒕뱶??3-Step 6 (E2E) ?먯꽌 寃利????ш린??API/濡쒖쭅留?蹂몃떎.
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
    EYE_NEGATIVE_TERMS,
    FRONT_SIDE_SEMANTIC_CONTROL_SCALE,
    FRONT_SIDE_NEGATIVE_TERMS,
    SEMANTIC_BACKGROUND_RGB,
    SEMANTIC_BUILDING_RGB,
    SEMANTIC_GROUND_RGB,
    _append_negative_terms,
    _apply_eye_ground_plane_control_attenuation,
    _build_eye_building_mask,
    _build_eye_ground_mask,
    _build_eye_ground_plane_aware_mask,
    _build_eye_ground_seg_control,
    _build_front_full_width_ground_mask,
    _build_front_full_width_seg_control,
    _build_front_side_seg_control,
    _build_front_side_semantic_mask,
)
@pytest.fixture
def mock_depth_renderer() -> DepthStyleRenderer:
    """DepthStyleRenderer ???ㅼ젣 SD/ControlNet 濡쒕뱶 ?놁씠 濡쒖쭅留??뚯뒪?몄슜.

    __new__濡?__init__ ?고쉶 ??torch/diffusers 濡쒕뱶 ?뚰뵾.
    pipe(...) ?몄텧? MagicMock??.images[0]???붾? PIL ?대?吏 諛섑솚?섍쾶 ?명똿.
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
    """render() ??DepthStyleResult, image/params/depth_size/output_size 紐⑤몢 梨꾩썙吏?"""
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
    """pipe ?몄텧 ??image= ?몄옄??control(depth) ?대?吏媛 ?꾨떖?쒕떎."""
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
    """seed媛 吏?뺣릺硫?torch.Generator.manual_seed媛 ?몄텧?쒕떎."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x", seed=42)

    mock_depth_renderer.render(depth, params)

    mock_depth_renderer._torch.Generator.assert_called_once_with(device="cpu")
    mock_depth_renderer._torch.Generator.return_value.manual_seed.assert_called_once_with(42)


def test_seedless_render_no_generator(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """seed=None?대㈃ generator=None??pipe???꾨떖?쒕떎."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x", seed=None)

    mock_depth_renderer.render(depth, params)

    assert mock_depth_renderer.pipe.call_args.kwargs["generator"] is None
    mock_depth_renderer._torch.Generator.assert_not_called()


def test_pipe_failure_wrapped_in_ifcrendererror(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """pipe(...)媛 ?덉쇅瑜??섏?硫?IFCRenderError濡??섑븨?섏뼱???쒕떎."""
    mock_depth_renderer.pipe.side_effect = RuntimeError("CUDA OOM")
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    with pytest.raises(IFCRenderError, match="Render failed"):
        mock_depth_renderer.render(depth, params)


def test_l_mode_depth_converted_to_rgb(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """?낅젰 depth媛 mode='L'?댁뼱??ControlNet?먮뒗 3梨꾨꼸(RGB)濡??꾨떖?쒕떎."""
    depth_l = Image.new("L", (768, 448), 100)
    assert depth_l.mode == "L"

    mock_depth_renderer.render(depth_l, DepthStyleParams(prompt="x"))

    control = mock_depth_renderer.pipe.call_args.kwargs["image"]
    assert control.mode == "RGB"


def test_result_save_creates_parent_dir(tmp_path: Path) -> None:
    """DepthStyleResult.save()??遺紐??붾젆?좊━瑜??먮룞 ?앹꽦?쒕떎."""
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
    """ifc2img 怨듦컻 ?щ낵: IFC ?뚮뜑 3 + style 3 + presets 2 + view helper 1 = 9媛?"""
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


def test_resolve_preset_view_render_options_fixes_korean_villa_candidate() -> None:
    """korean_villa front candidate should be pinned as the selected safe path."""
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
    """korean_house front/side candidates should be explicit per-view choices."""
    front = resolve_preset_view_render_options("korean_house", IFCView.FRONT)
    side = resolve_preset_view_render_options("korean_house", IFCView.SIDE)
    eye_ne = resolve_preset_view_render_options("korean_house", IFCView.EYE_NE)
    eye_nw = resolve_preset_view_render_options("korean_house", IFCView.EYE_NW)
    eye_se = resolve_preset_view_render_options("korean_house", IFCView.EYE_SE)

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

    assert eye_ne.use_eye_ground_semantic_control is True
    assert eye_ne.use_eye_ground_plane_control_attenuation is True
    assert eye_ne.front_side_ground_class == "grass"
    assert eye_ne.front_side_semantic_control_scale == 0.25
    assert eye_ne.requires_semantic_controlnet is True

    assert eye_nw.use_eye_ground_semantic_control is True
    assert eye_nw.use_eye_ground_plane_control_attenuation is True
    assert eye_nw.front_side_ground_class == "grass"
    assert eye_nw.front_side_semantic_control_scale == 0.35
    assert eye_nw.requires_semantic_controlnet is True

    assert eye_se.use_eye_ground_semantic_control is True
    assert eye_se.use_eye_ground_plane_control_attenuation is True
    assert eye_se.front_side_ground_class == "grass"
    assert eye_se.front_side_semantic_control_scale == 0.35
    assert eye_se.requires_semantic_controlnet is True


def test_resolve_preset_view_render_options_defaults_for_other_paths() -> None:
    """Candidate options should not silently affect unrelated presets/views."""
    default = DepthStyleRenderOptions()

    assert resolve_preset_view_render_options("scandinavian", IFCView.FRONT) == default
    assert resolve_preset_view_render_options("scandinavian", IFCView.EYE_NE) == default
    assert resolve_preset_view_render_options("korean_house", None) == default


def test_resolve_preset_background_params_uses_yard_only_priors() -> None:
    """Background inpaint prompts should be separated from house material prompts."""
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
    """Unknown background preset names should fail before running generation."""
    with pytest.raises(IFCRenderError, match="unknown background preset"):
        resolve_preset_background_params("unknown")


def test_depth_style_render_options_as_kwargs_matches_render_options() -> None:
    """Fixed candidates should be directly passable into DepthStyleRenderer.render()."""
    options = DepthStyleRenderOptions(
        use_front_side_semantic_control=True,
        use_eye_ground_semantic_control=True,
        front_side_ground_class="neutral",
        front_side_semantic_control_scale=0.25,
    )

    assert options.as_render_kwargs() == {
        "use_front_side_semantic_control": True,
        "use_front_full_width_semantic_control": False,
        "use_eye_ground_semantic_control": True,
        "use_eye_ground_plane_aware_semantic_control": False,
        "use_eye_ground_plane_control_attenuation": False,
        "front_side_ground_class": "neutral",
        "front_side_semantic_control_scale": 0.25,
        "eye_ground_plane_control_attenuation_strength": 0.18,
    }


# --- B-1 ??DepthStyleRenderer.render(view=...) ?몄옄 ---


def test_render_with_view_appends_suffix_to_prompt(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """B-1 ??view=TOP ?꾨떖 ??pipe ?몄텧 prompt???섍꼍 suffix ?ы븿.

    EYE_*/FRONT/SIDE??鍮?suffix?대?濡??⑹꽦 寃利앹뿉??紐낆떆 ?몄텧???쒖젏(TOP) ?ъ슜.
    suffix ?⑹꽦 硫붿빱?덉쬁 ?먯껜??紐⑤뱺 view?먯꽌 ?숈씪.
    """
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(prompt=base_prompt)

    mock_depth_renderer.render(depth, params, view=IFCView.EYE_NE)

    call_prompt = mock_depth_renderer.pipe.call_args.kwargs["prompt"]
    assert call_prompt.startswith("eye-level diagonal view")
    assert len(call_prompt) > len(base_prompt)
    assert "aerial" in call_prompt or "roof" in call_prompt


def test_render_without_view_uses_raw_prompt(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """B-1 ??view=None (default) ??prompt 洹몃?濡?(backward compat)."""
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
    assert call_prompt.startswith("open flat ground in front")
    assert call_prompt.endswith(base_prompt)
    assert "facade touches ground" in call_prompt
    assert "no foreground wall" in call_prompt
    assert "no foundation wall" in call_prompt
    assert "no retaining wall" in call_prompt


# --- C-1 ?먭린 ????render(view=...) negative ?⑹꽦 ?명봽??蹂댁〈 ?뚭? 諛⑹뼱 ---

def test_render_with_view_front_softens_scandinavian_concrete_wall_prior(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """Scandinavian FRONT prompt should reduce concrete wall/plinth prior."""
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
    """Scandinavian SIDE prompt should reduce side wall/plinth prior."""
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
    assert "dry ground around house" in call_prompt
    assert "no pool" in call_prompt
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


def test_render_with_view_eye_nw_appends_water_negative_terms(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """EYE views should suppress pool/reflection hallucinations."""
    depth = Image.new("L", (768, 448), 100)
    base_negative = "(worst quality:1.4), interior"
    params = DepthStyleParams(
        prompt="RAW photo, scandinavian house",
        negative_prompt=base_negative,
    )

    mock_depth_renderer.render(depth, params, view=IFCView.EYE_NW)

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative.startswith(base_negative)
    assert call_negative.endswith(EYE_NEGATIVE_TERMS)


def test_render_with_view_eye_ne_deduplicates_water_negative_terms(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """EYE negative terms should stay compact when presets already contain them."""
    depth = Image.new("L", (768, 448), 100)
    base_negative = "(worst quality:1.4), water"
    params = DepthStyleParams(
        prompt="RAW photo, scandinavian house",
        negative_prompt=base_negative,
    )

    mock_depth_renderer.render(depth, params, view=IFCView.EYE_NE)

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative.count("water") == 1
    assert "pool" in call_negative
    assert "reflection" in call_negative
    assert "mirror floor" in call_negative


def test_render_with_view_front_appends_foundation_negative_terms(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """FRONT/SIDE should receive extra lower-fa챌ade suppression negatives."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(
        prompt="RAW photo, scandinavian house",
        negative_prompt="(worst quality:1.4)",
    )

    mock_depth_renderer.render(depth, params, view=IFCView.FRONT)

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative.endswith(FRONT_SIDE_NEGATIVE_TERMS)


def test_append_negative_terms_deduplicates_terms() -> None:
    """Shared front/side negatives should not push prompts over the CLIP budget."""
    result = _append_negative_terms(
        "low quality, stone wall, retaining wall",
        "stone wall, retaining wall, extra lower floor",
    )

    assert result == "low quality, stone wall, retaining wall, extra lower floor"


def test_append_negative_terms_prefers_weighted_duplicate() -> None:
    """Weighted duplicates should replace the unweighted term without duplication."""
    result = _append_negative_terms(
        "low quality, stone wall, retaining wall, raised platform",
        "(stone wall:1.2), (retaining wall:1.25), (raised platform:1.2)",
    )

    assert result == (
        "low quality, (stone wall:1.2), (retaining wall:1.25), "
        "(raised platform:1.2)"
    )


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


def test_build_front_full_width_ground_mask_marks_lower_background_only() -> None:
    """FRONT full-width ground mask should fill lower non-building areas."""
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
    """Expanded lower support geometry should be treated as front ground."""
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
    """Preview seg map should encode front sky/building/full-width ground."""
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
    """Front semantic map should not leave lower support slabs as building."""
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


def test_build_eye_ground_mask_marks_lower_background_only() -> None:
    """EYE ground cue should target lower exterior background, not roof sky."""
    control = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(control)
    arr[6:20, 10:22] = [255, 255, 255]

    mask = _build_eye_ground_mask(Image.fromarray(arr, mode="RGB"))
    mask_arr = np.array(mask)

    assert mask_arr[26, 2] == 255
    assert mask_arr[26, 30] == 255
    assert mask_arr[16, 16] == 0
    assert mask_arr[4, 2] == 0


def test_build_eye_ground_seg_control_uses_neutral_ground() -> None:
    """EYE semantic map should encode building, sky, and dry neutral ground."""
    control = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(control)
    arr[6:20, 10:22] = [255, 255, 255]

    seg = _build_eye_ground_seg_control(
        Image.fromarray(arr, mode="RGB"),
        ground_class="neutral",
    )
    seg_arr = np.array(seg)

    assert np.all(seg_arr[10, 16] == ADE20K_BUILDING_RGB)
    assert np.all(seg_arr[2, 2] == ADE20K_SKY_RGB)
    assert np.all(seg_arr[26, 2] == ADE20K_ROAD_RGB)
    assert np.all(seg_arr[26, 30] == ADE20K_ROAD_RGB)


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


def test_render_front_full_width_semantic_control_requires_semantic_model(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """Full-width semantic control is opt-in and requires a seg ControlNet."""
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


def test_render_front_full_width_semantic_control_passes_two_control_images(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """FRONT full-width semantic control should pass depth + full-width seg."""
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


def test_render_eye_ground_semantic_control_requires_semantic_model(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """EYE ground semantic control is opt-in and requires a seg ControlNet."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    with pytest.raises(IFCRenderError, match="EYE ground semantic control"):
        mock_depth_renderer.render(
            depth,
            params,
            view=IFCView.EYE_NE,
            use_eye_ground_semantic_control=True,
        )


def test_render_eye_ground_semantic_control_passes_two_control_images(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """EYE ground semantic control should pass depth + EYE ground seg."""
    mock_depth_renderer.semantic_controlnet_model_id = "mock-seg"
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 10:22] = [255, 255, 255]
    depth = Image.fromarray(arr, mode="RGB")
    params = DepthStyleParams(prompt="x", controlnet_conditioning_scale=1.15)

    mock_depth_renderer.render(
        depth,
        params,
        view=IFCView.EYE_SE,
        use_eye_ground_semantic_control=True,
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


def test_render_eye_ground_plane_aware_semantic_control_reclassifies_slab(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """EYE render can opt into ground-plane-aware semantic control."""
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
        view=IFCView.EYE_NE,
        use_eye_ground_semantic_control=True,
        use_eye_ground_plane_aware_semantic_control=True,
        front_side_ground_class="grass",
        front_side_semantic_control_scale=0.25,
    )

    call_kwargs = mock_depth_renderer.pipe.call_args.kwargs
    seg_arr = np.array(call_kwargs["image"][1])

    assert np.all(seg_arr[24, 16] == ADE20K_GRASS_RGB)
    assert np.all(seg_arr[8, 16] == ADE20K_BUILDING_RGB)


def test_render_eye_ground_plane_control_attenuation_updates_depth_control(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """EYE attenuation should alter depth control before pipe invocation."""
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [240, 240, 240]
    depth = Image.fromarray(arr, mode="RGB")
    params = DepthStyleParams(prompt="x", controlnet_conditioning_scale=1.15)

    mock_depth_renderer.render(
        depth,
        params,
        view=IFCView.EYE_NE,
        use_eye_ground_plane_control_attenuation=True,
        eye_ground_plane_control_attenuation_strength=0.18,
    )

    control_arr = np.array(mock_depth_renderer.pipe.call_args.kwargs["image"])
    original = np.array(depth)

    assert np.any(control_arr[24, 16] != original[24, 16])
    assert np.all(control_arr[8, 16] == original[8, 16])


def test_build_eye_ground_plane_aware_mask_reclassifies_lower_geometry() -> None:
    """Ground-plane-aware EYE preview should include the lower geometry shell."""
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [220, 220, 220]
    depth = Image.fromarray(arr, mode="RGB")

    regular = np.array(_build_eye_ground_mask(depth))
    aware = np.array(_build_eye_ground_plane_aware_mask(depth, shell_ratio=0.25))

    assert regular[24, 16] == 0
    assert aware[24, 16] == 255
    assert aware[8, 16] == 0


def test_build_eye_building_mask_excludes_lower_ground_plane_shell() -> None:
    """EYE building mask should protect upper body and exclude lower slab geometry."""
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [220, 220, 220]
    depth = Image.fromarray(arr, mode="RGB")

    mask = np.array(_build_eye_building_mask(depth, ground_shell_ratio=0.08))

    assert mask[8, 16] == 255
    assert mask[22, 16] == 255
    assert mask[24, 16] == 0
    assert mask[2, 2] == 0


def test_apply_eye_ground_plane_control_attenuation_only_changes_ground_plane() -> None:
    """Attenuation should soften only the selected lower ground-plane pixels."""
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [240, 240, 240]
    depth = Image.fromarray(arr, mode="RGB")

    attenuated = np.array(
        _apply_eye_ground_plane_control_attenuation(depth, strength=0.24)
    )
    original = np.array(depth)

    assert np.any(attenuated[24, 16] != original[24, 16])
    assert np.all(attenuated[8, 16] == original[8, 16])
    assert np.all(attenuated[2, 2] == original[2, 2])


def test_build_eye_ground_seg_control_can_include_ground_plane_geometry() -> None:
    """The EYE semantic preview can opt into slab-like geometry as grass."""
    depth = Image.new("RGB", (32, 32), (0, 0, 0))
    arr = np.array(depth)
    arr[6:20, 12:20] = [180, 180, 180]
    arr[21:27, 7:25] = [220, 220, 220]
    depth = Image.fromarray(arr, mode="RGB")

    seg = np.array(
        _build_eye_ground_seg_control(
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
    """The full-width semantic option should be a no-op for SIDE."""
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
    """view=None (default) ??negative_prompt 洹몃?濡?(backward compat)."""
    depth = Image.new("L", (768, 448), 100)
    base_negative = "(worst quality:1.4), interior"
    params = DepthStyleParams(
        prompt="x",
        negative_prompt=base_negative,
    )

    mock_depth_renderer.render(depth, params)  # view=None

    call_negative = mock_depth_renderer.pipe.call_args.kwargs["negative_prompt"]
    assert call_negative == base_negative


# per-view negative suffix infra (C-1) + cn_scale override infra (C-2) ?먭린.
# ???명봽??紐⑤몢 render() 寃쎈줈?먯꽌 ?몄텧 ?먯껜媛 ?쒓굅??dead code.


def test_render_without_view_uses_params_cn_scale(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """view=None (default) ??params.cn_scale 洹몃?濡?(backward compat)."""
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
    """寃곌낵 params 諛섏쁺 ??view ?꾨떖 ??result.params???⑹꽦??媛믪씠 ?ㅼ뼱媛?

    ?몄텧?먭? result.params.prompt濡?*?ㅼ젣 SD pipe???꾨떖??媛???異붿쟻?????덉뼱??
    ??(?붾쾭源?濡쒓렇/?ы쁽??. EYE_*/FRONT/SIDE??鍮?suffix?대?濡?寃利앹뿉??紐낆떆
    ?몄텧 ?쒖젏(TOP, suffix 蹂댁쑀)???ъ슜.
    """
    depth = Image.new("L", (768, 448), 100)
    base_prompt = "RAW photo, scandinavian house"
    params = DepthStyleParams(
        prompt=base_prompt,
        negative_prompt="(worst quality:1.4)",
        controlnet_conditioning_scale=1.0,
    )

    result = mock_depth_renderer.render(depth, params, view=IFCView.EYE_NE)

    # TOP? prompt suffix ?곸슜 ???(cn_scale override??None default)
    assert result.params is not params  # ???몄뒪?댁뒪 (view-aware ?⑹꽦 ?곸슜)
    assert result.params.prompt.startswith("eye-level diagonal view")
    assert len(result.params.prompt) > len(base_prompt)  # suffix 異붽???
    assert result.params.controlnet_conditioning_scale == 1.0  # base 洹몃?濡?
    # ?먮낯 params??蹂寃??놁쓬 (immutability 蹂댁옣 ??dc_replace?????몄뒪?댁뒪 諛섑솚)
    assert params.prompt == base_prompt


def test_render_result_params_identity_preserved_when_view_none(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """view=None ??result.params??input params? ?숈씪 ?몄뒪?댁뒪 (backward compat)."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    result = mock_depth_renderer.render(depth, params)  # view=None

    assert result.params is params





