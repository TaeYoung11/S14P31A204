"""Soft-lock helper tests.

Covers prompt assembly and visible-category detection. The actual diffusion
renderer is GPU/model bound and is exercised through the G-4 sweep script
rather than this unit test file.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from ai_rendering.ifc2img.semantics import (
    IfcColorCandidate,
    IfcColorSummary,
    IfcSemanticCategoryColorSummary,
)
from ai_rendering.ifc2img.soft_lock import (
    ADE20K_BUILDING_RGB,
    ADE20K_GRASS_RGB,
    ADE20K_ROAD_RGB,
    ADE20K_SKY_RGB,
    CATEGORY_ORDER,
    DAY_NEGATIVE,
    DAY_SCENE_SUFFIX,
    NEUTRAL_DAY_CATEGORY_PHRASE,
    NEUTRAL_NIGHT_CATEGORY_PHRASE,
    NEUTRAL_STYLE_PROFILE,
    NIGHT_NEGATIVE,
    NIGHT_SCENE_SUFFIX,
    SHINCHAN_DAY_CATEGORY_PHRASE,
    SHINCHAN_NIGHT_CATEGORY_PHRASE,
    SHINCHAN_STYLE_PROFILE,
    StylePrompt,
    build_ade20k_seg_control,
    build_region_aware_negative_prompt,
    build_region_aware_prompt,
    building_mask_from_no_background,
    style_profile_from_ifc_color_summary,
    visible_categories_from_element_masks,
)


def _ifc_color_summary(
    category_rgbs: dict[str, tuple[float, float, float]],
) -> IfcColorSummary:
    categories = {}
    for semantic, rgb in category_rgbs.items():
        candidate = IfcColorCandidate(source="material", rgb=rgb)
        categories[semantic] = IfcSemanticCategoryColorSummary(
            category=semantic,
            color=candidate,
            candidates=(candidate,),
        )
    return IfcColorSummary(
        source_ifc_path=Path("test.ifc"),
        categories=categories,
        elements=(),
    )


def test_build_region_aware_prompt_defaults_to_neutral_profile() -> None:
    """Without a style_profile or IFC summary the renderer stays IFC-agnostic."""
    prompt = build_region_aware_prompt(
        visible_categories={"door", "roof", "wall", "window"},
        time_of_day="DAY",
    )
    expected = ", ".join(
        [NEUTRAL_DAY_CATEGORY_PHRASE[cat] for cat in CATEGORY_ORDER]
        + [DAY_SCENE_SUFFIX]
    )
    assert prompt == expected
    assert "red" not in prompt and "blue" not in prompt


def test_build_region_aware_prompt_uses_explicit_shinchan_profile() -> None:
    """Caller-supplied SHINCHAN_STYLE_PROFILE restores the shinchan-tuned palette."""
    prompt = build_region_aware_prompt(
        visible_categories={"door", "roof", "wall", "window"},
        time_of_day="DAY",
        style_profile=SHINCHAN_STYLE_PROFILE,
    )
    expected = ", ".join(
        [SHINCHAN_DAY_CATEGORY_PHRASE[cat] for cat in CATEGORY_ORDER]
        + [DAY_SCENE_SUFFIX]
    )
    assert prompt == expected


def test_build_region_aware_prompt_derives_palette_from_ifc_color_summary() -> None:
    """An IFC color summary drives palette colors when no profile is given."""
    summary = _ifc_color_summary(
        {
            "ROOF": (0.2, 0.7, 0.2),
            "WALL": (0.1, 0.1, 0.1),
        }
    )
    prompt = build_region_aware_prompt(
        visible_categories={"roof", "wall"},
        time_of_day="DAY",
        ifc_color_summary=summary,
    )
    assert "green tile roof" in prompt
    assert "gray plaster walls" in prompt or "black plaster walls" in prompt
    assert prompt.endswith(DAY_SCENE_SUFFIX)


def test_build_region_aware_prompt_explicit_profile_overrides_summary() -> None:
    """When both are passed, explicit style_profile wins over derived summary."""
    summary = _ifc_color_summary({"ROOF": (0.2, 0.7, 0.2)})
    prompt = build_region_aware_prompt(
        visible_categories={"roof"},
        time_of_day="DAY",
        style_profile=SHINCHAN_STYLE_PROFILE,
        ifc_color_summary=summary,
    )
    assert SHINCHAN_DAY_CATEGORY_PHRASE["roof"] in prompt
    assert "green tile roof" not in prompt


def test_build_region_aware_prompt_skips_missing_categories() -> None:
    prompt = build_region_aware_prompt(
        visible_categories={"roof", "wall"},
        time_of_day="DAY",
        style_profile=SHINCHAN_STYLE_PROFILE,
    )
    assert SHINCHAN_DAY_CATEGORY_PHRASE["roof"] in prompt
    assert SHINCHAN_DAY_CATEGORY_PHRASE["wall"] in prompt
    assert SHINCHAN_DAY_CATEGORY_PHRASE["window"] not in prompt
    assert SHINCHAN_DAY_CATEGORY_PHRASE["door"] not in prompt
    assert prompt.endswith(DAY_SCENE_SUFFIX)


def test_build_region_aware_prompt_night_uses_night_phrases_and_suffix() -> None:
    prompt = build_region_aware_prompt(
        visible_categories={"roof", "window"},
        time_of_day="NIGHT",
        style_profile=SHINCHAN_STYLE_PROFILE,
    )
    assert SHINCHAN_NIGHT_CATEGORY_PHRASE["roof"] in prompt
    assert SHINCHAN_NIGHT_CATEGORY_PHRASE["window"] in prompt
    assert prompt.endswith(NIGHT_SCENE_SUFFIX)


def test_style_profile_from_ifc_color_summary_neutral_fallback_for_unknown_categories() -> None:
    """Categories without a usable IFC color stay on the neutral phrase."""
    summary = _ifc_color_summary({"ROOF": (0.7, 0.2, 0.2)})
    profile = style_profile_from_ifc_color_summary(summary)
    assert isinstance(profile, StylePrompt)
    assert profile.day_phrases["wall"] == NEUTRAL_DAY_CATEGORY_PHRASE["wall"]
    assert profile.night_phrases["wall"] == NEUTRAL_NIGHT_CATEGORY_PHRASE["wall"]
    assert "tile roof" in profile.day_phrases["roof"]
    assert "tile roof" in profile.night_phrases["roof"]


def test_neutral_style_profile_contains_no_color_words() -> None:
    """The default profile must not leak shinchan color choices."""
    for phrase in NEUTRAL_STYLE_PROFILE.day_phrases.values():
        for color in ("red", "white", "blue", "tan", "green"):
            assert color not in phrase, phrase
    for phrase in NEUTRAL_STYLE_PROFILE.night_phrases.values():
        for color in ("red", "white", "blue", "tan", "green"):
            assert color not in phrase, phrase


def test_build_region_aware_prompt_with_no_visible_categories_uses_suffix_only() -> None:
    prompt = build_region_aware_prompt(
        visible_categories=set(),
        time_of_day="DAY",
    )
    assert prompt == DAY_SCENE_SUFFIX


def test_build_region_aware_prompt_rejects_unknown_time_of_day() -> None:
    with pytest.raises(ValueError):
        build_region_aware_prompt(visible_categories={"roof"}, time_of_day="EVENING")


def test_build_region_aware_negative_prompt_day_vs_night() -> None:
    assert build_region_aware_negative_prompt(time_of_day="DAY") == DAY_NEGATIVE
    assert build_region_aware_negative_prompt(time_of_day="NIGHT") == NIGHT_NEGATIVE


def test_build_region_aware_negative_prompt_rejects_unknown_time() -> None:
    with pytest.raises(ValueError):
        build_region_aware_negative_prompt(time_of_day="DUSK")


def test_build_ade20k_seg_control_paints_building_sky_and_ground() -> None:
    mask = Image.new("L", (8, 8), 0)
    for x in range(3, 6):
        for y in range(3, 6):
            mask.putpixel((x, y), 255)
    seg = build_ade20k_seg_control(building_mask=mask, ground_class="grass")
    assert seg.size == (8, 8)
    assert seg.getpixel((0, 0)) == ADE20K_SKY_RGB
    assert seg.getpixel((4, 4)) == ADE20K_BUILDING_RGB
    assert seg.getpixel((0, 7)) == ADE20K_GRASS_RGB


def test_build_ade20k_seg_control_uses_road_when_requested() -> None:
    mask = Image.new("L", (6, 6), 0)
    for x in range(1, 5):
        for y in range(2, 4):
            mask.putpixel((x, y), 255)
    seg = build_ade20k_seg_control(building_mask=mask, ground_class="road")
    assert seg.getpixel((0, 5)) == ADE20K_ROAD_RGB


def test_build_ade20k_seg_control_handles_empty_mask() -> None:
    mask = Image.new("L", (4, 8), 0)
    seg = build_ade20k_seg_control(building_mask=mask, ground_class="grass")
    assert seg.getpixel((0, 0)) == ADE20K_SKY_RGB
    assert seg.getpixel((0, 7)) == ADE20K_GRASS_RGB


def test_building_mask_from_no_background_keeps_nonzero_alpha(tmp_path: Path) -> None:
    rgba = Image.new("RGBA", (4, 4), (0, 0, 0, 0))
    rgba.putpixel((1, 1), (10, 20, 30, 200))
    rgba.putpixel((2, 2), (50, 60, 70, 255))
    path = tmp_path / "building.png"
    rgba.save(path)
    mask = building_mask_from_no_background(path)
    assert mask.getpixel((0, 0)) == 0
    assert mask.getpixel((1, 1)) == 255
    assert mask.getpixel((2, 2)) == 255


def test_visible_categories_from_element_masks_uses_only_non_empty_masks(
    tmp_path: Path,
) -> None:
    roof_path = tmp_path / "element_roof.png"
    wall_path = tmp_path / "element_wall.png"
    window_path = tmp_path / "element_window.png"

    roof = Image.new("L", (4, 4), 0)
    roof.putpixel((1, 1), 255)
    roof.save(roof_path)

    Image.new("L", (4, 4), 0).save(wall_path)
    Image.new("L", (4, 4), 128).save(window_path)

    visible = visible_categories_from_element_masks(
        {
            "roof": roof_path,
            "wall": wall_path,
            "window": window_path,
            "door": tmp_path / "missing_door.png",
        }
    )
    assert visible == {"roof", "window"}
