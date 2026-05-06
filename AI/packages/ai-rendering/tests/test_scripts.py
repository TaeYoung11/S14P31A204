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


def test_front_side_semantic_mask_script_defaults_to_preview_dirs() -> None:
    """The preview mask script should stay scoped to front/side preview assets."""
    m = _load_script("generate_front_side_semantic_masks.py")

    assert m.DEFAULT_INPUT_DIR == m.ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
    assert m.DEFAULT_OUTPUT_DIR == m.ROOT / "outputs" / "ifc2img_front_side_mask_trial1" / "AC20-FZK-Haus"
    assert m.DEPTH_NAMES == ("depth_front.png", "depth_side.png")


def test_front_side_semantic_mask_display_path_returns_relative() -> None:
    """The preview mask script should print repo-relative paths when possible."""
    m = _load_script("generate_front_side_semantic_masks.py")

    inside = m.ROOT / "outputs" / "semantic_mask_front.png"
    result = m._display_path(inside)

    assert not result.is_absolute()
    assert result == Path("outputs") / "semantic_mask_front.png"


def test_front_side_inpaint_mask_script_defaults_to_preview_dirs() -> None:
    """The inpaint mask script should target the current 4-image front/side sample."""
    m = _load_script("generate_front_side_inpaint_masks.py")

    assert m.DEFAULT_DEPTH_DIR == m.ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
    assert m.DEFAULT_STYLED_DIR == m.ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
    assert m.DEFAULT_OUTPUT_DIR == m.ROOT / "outputs" / "ifc2img_front_side_inpaint_mask_trial1" / "AC20-FZK-Haus"
    assert m.PRESETS == ("scandinavian", "korean_villa")
    assert m.VIEWS == ("front", "side")


def test_front_side_inpaint_mask_display_path_returns_relative() -> None:
    """The inpaint mask script should print repo-relative paths when possible."""
    m = _load_script("generate_front_side_inpaint_masks.py")

    inside = m.ROOT / "outputs" / "inpaint_mask_scandinavian_day_front.png"
    result = m._display_path(inside)

    assert not result.is_absolute()
    assert result == Path("outputs") / "inpaint_mask_scandinavian_day_front.png"


def test_front_side_wide_ground_inpaint_script_defaults_to_korean_side() -> None:
    """The wide-ground inpaint experiment should start with the current Korean side slot."""
    m = _load_script("run_front_side_wide_ground_inpaint.py")

    assert m.DEFAULT_INPUT_DIR == m.ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
    assert (
        m.DEFAULT_OUTPUT_DIR
        == m.ROOT / "outputs" / "ifc2img_front_side_inpaint_wide_ground_trial1" / "AC20-FZK-Haus"
    )
    assert m.DEFAULT_PRESET == "korean_villa"
    assert m.DEFAULT_VIEW == "side"
    assert m.DEFAULT_STRENGTH == 0.60


def test_front_full_width_ground_control_script_defaults_to_front_preview() -> None:
    """The front-only full-width ground control script should be preview-scoped."""
    m = _load_script("generate_front_full_width_ground_control.py")

    assert m.DEFAULT_INPUT_DIR == m.ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
    assert (
        m.DEFAULT_OUTPUT_DIR
        == m.ROOT / "outputs" / "ifc2img_front_full_width_ground_control_trial1" / "AC20-FZK-Haus"
    )


def test_front_semantic_ground_control_script_defaults_to_front_preview() -> None:
    """The front-only semantic ground control script should only create previews."""
    m = _load_script("generate_front_semantic_ground_control.py")

    assert m.DEFAULT_INPUT_DIR == m.ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
    assert (
        m.DEFAULT_OUTPUT_DIR
        == m.ROOT / "outputs" / "ifc2img_front_semantic_ground_control_trial1" / "AC20-FZK-Haus"
    )
    assert m.DEFAULT_GROUND_CLASS == "neutral"


def test_korean_villa_prompt_prior_trial_defaults_to_side_simple_mass() -> None:
    """The Korean-villa prior trial should isolate one side-view prompt variant."""
    m = _load_script("run_korean_villa_prompt_prior_trial.py")

    assert m.DEFAULT_INPUT_DIR == m.ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
    assert (
        m.DEFAULT_OUTPUT_DIR
        == m.ROOT / "outputs" / "ifc2img_korean_villa_prompt_prior_trial1" / "AC20-FZK-Haus"
    )
    assert m.DEFAULT_VIEW == "side"
    assert m.DEFAULT_VARIANT == "simple_mass"
    assert "single-volume house" in m.SIMPLE_MASS_PROMPT
    assert "piloti" in m.COMPACT_NEGATIVE
    assert "short_ground" in m.VARIANTS
    assert m.SHORT_GROUND_PROMPT.startswith("RAW photo, simple Korean house")
    assert "flat_plaza" in m.VARIANTS
    assert "flat concrete plaza" in m.FLAT_PLAZA_PROMPT
    assert "front_open_ground" in m.VARIANTS
    assert "open flat paved ground in front" in m.FRONT_OPEN_GROUND_PROMPT
    assert "dark wall" in m.COMPACT_NEGATIVE
    assert "front_white_facade" in m.VARIANTS
    assert m.FRONT_WHITE_FACADE_PROMPT.startswith("RAW photo, outdoor daylight, white concrete facade")
    assert "black facade" in m.COMPACT_NEGATIVE


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

