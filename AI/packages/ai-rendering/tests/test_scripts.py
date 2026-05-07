"""Importlib-based tests for ad-hoc scripts under scripts/."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts"


def _load_script(name: str) -> ModuleType:
    """Load scripts/<name> as a module without executing it as __main__."""
    path = SCRIPTS_DIR / name
    spec = importlib.util.spec_from_file_location(f"_script_{name.replace('.py', '')}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_returns_relative_for_root_internal_path(script_name: str) -> None:
    """ROOT-internal paths should be shown as repo-relative paths."""
    m = _load_script(script_name)

    inside = m.ROOT / "outputs" / "foo.png"
    result = m._display_path(inside)

    assert not result.is_absolute()
    assert result == Path("outputs") / "foo.png"


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_returns_absolute_for_root_external_path(script_name: str) -> None:
    """ROOT-external paths should fall back to absolute paths."""
    m = _load_script(script_name)

    outside = m.ROOT.parent.parent / "definitely_outside_repo_root_xyz" / "foo.png"
    result = m._display_path(outside)

    assert result == outside
    assert result.is_absolute()


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_does_not_raise_value_error(script_name: str) -> None:
    """display_path helpers should swallow relative_to failures."""
    m = _load_script(script_name)
    outside = Path("/some/absolute/external/path/foo.png").resolve()

    m._display_path(outside)


def test_eye_auto_background_mask_script_defaults_to_latest_eye_smoke() -> None:
    """The EYE auto-background mask script should preview full outside repaint targets."""
    m = _load_script("generate_eye_auto_background_masks.py")

    assert (
        m.DEFAULT_INPUT_DIR
        == m.ROOT
        / "outputs"
        / "ifc2img_eye_ground_extent_105_style_smoke1"
        / "AC20-FZK-Haus"
    )
    assert (
        m.DEFAULT_OUTPUT_DIR
        == m.ROOT
        / "outputs"
        / "ifc2img_eye_auto_background_mask_tight_preview1"
        / "AC20-FZK-Haus"
    )
    assert m.DEFAULT_PRESET == "korean_house"
    assert m.DEPTH_NAMES == ("depth_eye_ne.png", "depth_eye_nw.png", "depth_eye_se.png")
    assert m.DEFAULT_PROTECT_EXPAND_PX == 5
    assert m.DEFAULT_TARGET_FEATHER_RADIUS == 4


def test_eye_auto_background_inpaint_script_defaults_to_korean_house_eye_smoke() -> None:
    """The EYE auto-background smoke should use the full outside target masks."""
    m = _load_script("run_eye_auto_background_inpaint.py")

    assert (
        m.DEFAULT_INPUT_DIR
        == m.ROOT
        / "outputs"
        / "ifc2img_eye_ground_extent_105_style_smoke1"
        / "AC20-FZK-Haus"
    )
    assert (
        m.DEFAULT_MASK_DIR
        == m.ROOT
        / "outputs"
        / "ifc2img_eye_auto_background_mask_tight_preview1"
        / "AC20-FZK-Haus"
    )
    assert (
        m.DEFAULT_OUTPUT_DIR
        == m.ROOT
        / "outputs"
        / "ifc2img_eye_auto_background_inpaint_smoke1"
        / "AC20-FZK-Haus"
    )
    assert m.DEFAULT_PRESET == "korean_house"
    assert m.DEFAULT_VIEWS == ("eye_ne", "eye_nw", "eye_se")
    assert m.DEFAULT_BACKGROUND_MODE == "guided"
    assert m.BACKGROUND_MODES == ("guided", "free")
    assert m.DEFAULT_STRENGTH == 0.55
    assert m.EYE_STRIP_CLEANUP_BACKGROUND_MODE == "free"
    assert m.EYE_STRIP_CLEANUP_BOTTOM_STRIP_RATIO == 0.10
    assert m.EYE_STRIP_CLEANUP_BOTTOM_STRIP_PREFILL_MODE == "feather"
    assert m.EYE_STRIP_CLEANUP_SECOND_PASS_BOTTOM_STRIP_RATIO == 0.28
    assert m.EYE_STRIP_CLEANUP_SECOND_PASS_STRENGTH == 1.0
    assert m.EYE_STRIP_CLEANUP_SECOND_PASS_FEATHER_RATIO == 0.45
    assert m.DEFAULT_BOTTOM_STRIP_RATIO == 0.10
    assert m.DEFAULT_BOTTOM_STRIP_PREFILL_MODE == "solid"
    assert m.BOTTOM_STRIP_PREFILL_MODES == ("solid", "feather")
    assert m.BOTTOM_STRIP_COLORS["neutral_paved"] == (134, 130, 120)
    assert m.DEFAULT_SECOND_PASS_BOTTOM_STRIP_RATIO == 0.16
    assert m.DEFAULT_SECOND_PASS_STRENGTH == 0.75
    assert "letters" in m.BOTTOM_STRIP_SECOND_PASS_NEGATIVE
    assert "logo" in m.BOTTOM_STRIP_SECOND_PASS_NEGATIVE
    assert "sign" in m.BOTTOM_STRIP_SECOND_PASS_NEGATIVE
    assert "caption" in m.BOTTOM_STRIP_SECOND_PASS_NEGATIVE


def test_eye_auto_background_inpaint_strip_cleanup_flag_applies_success_preset() -> None:
    """The cleanup flag should map to the successful EYE lower-strip combo."""
    m = _load_script("run_eye_auto_background_inpaint.py")

    args = m._parse_args(["--eye-strip-cleanup"])

    assert args.eye_strip_cleanup
    assert args.background_mode == "free"
    assert args.prefill_bottom_strip
    assert args.bottom_strip_ratio == 0.10
    assert args.bottom_strip_color == "neutral_paved"
    assert args.bottom_strip_prefill_mode == "feather"
    assert args.second_pass_bottom_strip
    assert args.second_pass_bottom_strip_ratio == 0.28
    assert args.second_pass_strength == 1.0
    assert args.second_pass_feather_ratio == 0.45


def test_eye_auto_background_inpaint_strip_cleanup_is_opt_in() -> None:
    """Defaults should stay conservative unless the cleanup flag is enabled."""
    m = _load_script("run_eye_auto_background_inpaint.py")

    args = m._parse_args([])

    assert not args.eye_strip_cleanup
    assert args.background_mode == "guided"
    assert not args.prefill_bottom_strip
    assert args.bottom_strip_prefill_mode == "solid"
    assert not args.second_pass_bottom_strip
    assert args.second_pass_bottom_strip_ratio == 0.16
    assert args.second_pass_strength == 0.75
    assert args.second_pass_feather_ratio == 0.35


def test_eye_auto_background_inpaint_script_can_resolve_free_prompt() -> None:
    """Free mode should remove explicit yard/ground material instructions."""
    m = _load_script("run_eye_auto_background_inpaint.py")

    prompt, negative = m._resolve_background_prompt_pair("korean_house", "free")

    assert prompt == (
        "realistic Korean residential setting, natural daylight, "
        "background matching the house"
    )
    assert "dry grass" not in prompt
    assert "flat ground" not in prompt
    assert "yard" not in prompt
    assert "pool" in negative
    assert "display base" in negative
    assert "foreground grass strip" in negative
    assert "retaining wall" not in negative


def test_eye_auto_background_inpaint_script_keeps_guided_prompt() -> None:
    """Guided mode should preserve the existing preset-specific background prior."""
    m = _load_script("run_eye_auto_background_inpaint.py")

    prompt, negative = m._resolve_background_prompt_pair("korean_house", "guided")

    assert "dry grass" in prompt
    assert "flat ground around house" in prompt
    assert "retaining wall" in negative


def test_eye_auto_background_inpaint_prefills_bottom_strip_only() -> None:
    """Bottom strip prefill should only replace the configured lower band."""
    from PIL import Image

    m = _load_script("run_eye_auto_background_inpaint.py")
    source = Image.new("RGB", (10, 10), (20, 30, 40))

    result = m._prefill_bottom_strip(
        source,
        ratio=0.2,
        color_name="neutral_paved",
        mode="solid",
    )

    assert result.getpixel((5, 7)) == (20, 30, 40)
    assert result.getpixel((5, 8)) == m.BOTTOM_STRIP_COLORS["neutral_paved"]
    assert result.getpixel((5, 9)) == m.BOTTOM_STRIP_COLORS["neutral_paved"]


def test_eye_auto_background_inpaint_feather_prefill_blends_bottom_strip() -> None:
    """Feather prefill should ramp from original pixels toward the target color."""
    from PIL import Image

    m = _load_script("run_eye_auto_background_inpaint.py")
    source = Image.new("RGB", (4, 4), (10, 20, 30))

    result = m._prefill_bottom_strip(
        source,
        ratio=0.5,
        color_name="neutral_paved",
        mode="feather",
    )

    assert result.getpixel((2, 1)) == (10, 20, 30)
    assert result.getpixel((2, 2)) == (10, 20, 30)
    assert result.getpixel((2, 3)) == m.BOTTOM_STRIP_COLORS["neutral_paved"]


def test_eye_auto_background_inpaint_makes_feathered_bottom_mask() -> None:
    """Second-pass lower strip mask should feather at the top and fill the bottom."""
    m = _load_script("run_eye_auto_background_inpaint.py")

    mask = m._make_bottom_strip_mask((4, 10), ratio=0.4, feather_ratio=0.5)

    assert mask.getpixel((2, 5)) == 0
    assert 0 < mask.getpixel((2, 6)) < 255
    assert mask.getpixel((2, 7)) == 255
    assert mask.getpixel((2, 9)) == 255


def test_ifc_to_styled_render_plan_detects_semantic_slots() -> None:
    """Production wrapper should know when preset/view options need semantic CN."""
    m = _load_script("ifc_to_styled.py")

    plan = m._resolve_render_plan(
        [m.IFCView.FRONT, m.IFCView.SIDE],
        ["korean_house", "scandinavian"],
    )

    assert m._render_plan_requires_semantic_controlnet(plan)
    assert (
        m._render_option_label("korean_house", m.IFCView.FRONT)
        == "use_front_full_width_semantic_control, ground=neutral, semantic_scale=0.35"
    )
    assert (
        m._render_option_label("korean_house", m.IFCView.SIDE)
        == "use_front_side_semantic_control, ground=neutral, semantic_scale=0.35"
    )
    assert m._render_option_label("scandinavian", m.IFCView.FRONT) == "depth-only"
    assert m._render_option_label("scandinavian", m.IFCView.SIDE) == "depth-only"


def test_ifc_to_styled_creates_semantic_renderer_only_when_needed() -> None:
    """Semantic CN setup should be automatic and explicit at renderer creation."""
    m = _load_script("ifc_to_styled.py")

    class FakeRenderer:
        def __init__(self, **kwargs: object) -> None:
            self.kwargs = kwargs

    depth_renderer, depth_mode = m._create_depth_style_renderer(
        FakeRenderer,
        requires_semantic=False,
    )
    semantic_renderer, semantic_mode = m._create_depth_style_renderer(
        FakeRenderer,
        requires_semantic=True,
    )

    assert depth_mode == "depth-only"
    assert depth_renderer.kwargs == {}
    assert semantic_mode == "depth+semantic"
    assert semantic_renderer.kwargs == {
        "semantic_controlnet_model_id": m.DEFAULT_CONTROLNET_SEG_ID
    }


def test_ifc_to_styled_render_depths_can_enable_auto_zoom(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Production wrapper should expose iterative fill-aware depth zoom."""
    from PIL import Image

    m = _load_script("ifc_to_styled.py")
    inits: list[dict[str, object]] = []

    class FakeIFCRenderer:
        def __init__(self, **kwargs: object) -> None:
            inits.append(kwargs)

        def render_views(self, _ifc_path: Path, views: list[object]) -> dict[object, Image.Image]:
            return {
                view: Image.new("L", (4, 4), 128)
                for view in views
            }

    monkeypatch.setattr(m, "IFCRenderer", FakeIFCRenderer)

    paths = m._render_depths(
        tmp_path / "dummy.ifc",
        [m.IFCView.EYE_NE],
        tmp_path / "out",
        auto_zoom=True,
        eye_target_ratio=0.25,
        iter_tolerance=0.05,
    )

    expected_overrides = {
        m.IFCView.EYE_NE: 0.25,
        m.IFCView.EYE_NW: 0.25,
        m.IFCView.EYE_SE: 0.25,
    }
    assert inits == [
        {
            "width": 768,
            "height": 448,
            "auto_zoom": m.AutoZoomMode.ITERATIVE,
            "iter_tolerance": 0.05,
            "view_target_overrides": expected_overrides,
            "view_ground_extent_overrides": {},
        }
    ]
    assert paths[m.IFCView.EYE_NE].name == "depth_eye_ne.png"
    assert paths[m.IFCView.EYE_NE].exists()


def test_ifc_to_styled_builds_eye_target_overrides() -> None:
    """EYE target ratio override should stay scoped to diagonal EYE views."""
    m = _load_script("ifc_to_styled.py")

    assert m._build_eye_target_overrides(None) == {}
    assert m._build_eye_target_overrides(0.25) == {
        m.IFCView.EYE_NE: 0.25,
        m.IFCView.EYE_NW: 0.25,
        m.IFCView.EYE_SE: 0.25,
    }
    with pytest.raises(SystemExit):
        m._build_eye_target_overrides(1.5)


def test_ifc_to_styled_builds_eye_ground_extent_overrides() -> None:
    """EYE ground extent override should stay scoped to diagonal EYE views."""
    m = _load_script("ifc_to_styled.py")

    assert m._build_eye_ground_extent_overrides(None) == {}
    assert m._build_eye_ground_extent_overrides(0.9) == {
        m.IFCView.EYE_NE: 0.9,
        m.IFCView.EYE_NW: 0.9,
        m.IFCView.EYE_SE: 0.9,
    }
    with pytest.raises(SystemExit):
        m._build_eye_ground_extent_overrides(0.0)


def test_ifc_to_styled_render_depths_passes_eye_ground_extent_override(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Production wrapper should pass EYE ground geometry override to IFCRenderer."""
    from PIL import Image

    m = _load_script("ifc_to_styled.py")
    inits: list[dict[str, object]] = []

    class FakeIFCRenderer:
        def __init__(self, **kwargs: object) -> None:
            inits.append(kwargs)

        def render_views(self, _ifc_path: Path, views: list[object]) -> dict[object, Image.Image]:
            return {
                view: Image.new("L", (4, 4), 128)
                for view in views
            }

    monkeypatch.setattr(m, "IFCRenderer", FakeIFCRenderer)

    m._render_depths(
        tmp_path / "dummy.ifc",
        [m.IFCView.EYE_NE],
        tmp_path / "out",
        eye_ground_extent_factor=0.9,
    )

    expected_ground_overrides = {
        m.IFCView.EYE_NE: 0.9,
        m.IFCView.EYE_NW: 0.9,
        m.IFCView.EYE_SE: 0.9,
    }
    assert inits[0]["view_ground_extent_overrides"] == expected_ground_overrides


def test_ifc_to_styled_render_styles_passes_resolved_options(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Production wrapper should pass resolver kwargs into render calls."""
    from PIL import Image

    import ai_rendering.ifc2img as ifc2img

    m = _load_script("ifc_to_styled.py")
    calls: list[dict[str, object]] = []
    renderer_inits: list[dict[str, object]] = []

    class FakeResult:
        def save(self, path: Path) -> Path:
            path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (4, 4), (123, 123, 123)).save(path)
            return path

    class FakeRenderer:
        def __init__(self, **kwargs: object) -> None:
            self.device = "fake"
            self.kwargs = kwargs
            renderer_inits.append(kwargs)

        def render(self, _depth: Image.Image, _params: object, **kwargs: object) -> FakeResult:
            calls.append({"renderer_kwargs": self.kwargs, **kwargs})
            return FakeResult()

    monkeypatch.setattr(ifc2img, "DepthStyleRenderer", FakeRenderer)

    front_depth = tmp_path / "depth_front.png"
    side_depth = tmp_path / "depth_side.png"
    Image.new("RGB", (8, 8), (0, 0, 0)).save(front_depth)
    Image.new("RGB", (8, 8), (0, 0, 0)).save(side_depth)

    m._render_styles(
        {
            m.IFCView.FRONT: front_depth,
            m.IFCView.SIDE: side_depth,
        },
        ["korean_house", "scandinavian"],
        tmp_path / "styled",
    )

    assert len(calls) == 4
    assert {} in renderer_inits
    assert {"semantic_controlnet_model_id": m.DEFAULT_CONTROLNET_SEG_ID} in renderer_inits

    korean_front = next(
        c for c in calls if c["view"] is m.IFCView.FRONT and c["use_front_full_width_semantic_control"]
    )
    korean_side = next(
        c for c in calls if c["view"] is m.IFCView.SIDE and c["use_front_side_semantic_control"]
    )
    scandinavian_calls = [
        c for c in calls if c["renderer_kwargs"] == {} and not c["use_front_side_semantic_control"]
    ]

    assert korean_front["renderer_kwargs"] == {
        "semantic_controlnet_model_id": m.DEFAULT_CONTROLNET_SEG_ID
    }
    assert korean_front["front_side_ground_class"] == "neutral"
    assert korean_front["front_side_semantic_control_scale"] == 0.35
    assert korean_side["renderer_kwargs"] == {
        "semantic_controlnet_model_id": m.DEFAULT_CONTROLNET_SEG_ID
    }
    assert korean_side["front_side_ground_class"] == "neutral"
    assert korean_side["front_side_semantic_control_scale"] == 0.35
    assert len(scandinavian_calls) == 2


def test_ifc_to_styled_render_styles_passes_eye_ground_plane_aware_options(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Korean-house EYE slots should use the ground-plane-aware semantic option."""
    from PIL import Image

    import ai_rendering.ifc2img as ifc2img

    m = _load_script("ifc_to_styled.py")
    calls: list[dict[str, object]] = []

    class FakeResult:
        def save(self, path: Path) -> Path:
            path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (4, 4), (123, 123, 123)).save(path)
            return path

    class FakeRenderer:
        def __init__(self, **kwargs: object) -> None:
            self.device = "fake"

        def render(self, _depth: Image.Image, _params: object, **kwargs: object) -> FakeResult:
            calls.append(kwargs)
            return FakeResult()

    monkeypatch.setattr(ifc2img, "DepthStyleRenderer", FakeRenderer)
    depth = tmp_path / "depth_eye_ne.png"
    Image.new("RGB", (8, 8), (0, 0, 0)).save(depth)

    m._render_styles(
        {m.IFCView.EYE_NE: depth},
        ["korean_house"],
        tmp_path / "styled",
    )

    assert calls == [
        {
            "view": m.IFCView.EYE_NE,
            "use_front_side_semantic_mask": False,
            "use_front_side_semantic_control": False,
            "use_front_full_width_semantic_control": False,
            "use_eye_ground_semantic_control": True,
            "use_eye_ground_plane_aware_semantic_control": True,
            "use_eye_ground_plane_control_attenuation": True,
            "use_weighted_front_side_negative": False,
            "front_side_ground_class": "grass",
            "front_side_semantic_control_scale": 0.25,
            "eye_ground_plane_control_attenuation_strength": 0.18,
        }
    ]

