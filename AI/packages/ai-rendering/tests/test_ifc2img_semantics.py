"""IFC semantic element reader tests."""

from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from ai_rendering.ifc2img.exceptions import IFCRenderError
from ai_rendering.ifc2img.element_masks import (
    IfcElementColorCorrectionCandidate,
    IfcElementColorDelta,
    IfcElementMaskCoverage,
    IfcElementMeanColor,
    IfcGeometryFidelityReport,
    IfcGeometryFidelityThresholds,
    IfcMaskBoundingBox,
    IfcElementMaskRenderResult,
    build_ifc_color_artifact_matrix,
    build_ifc_color_lock_artifact,
    build_ifc_color_composite_from_element_masks,
    compare_ifc_color_family_consistency,
    evaluate_ifc_geometry_fidelity_gate,
    evaluate_ifc_quantitative_color,
    has_critical_coverage_warning,
    measure_element_mask_mean_colors,
    measure_ifc_geometry_fidelity,
    measure_ifc_color_target_deltas,
    render_ifc_element_masks,
    select_ifc_color_correction_candidates,
    summarize_coverage_warnings,
)
from ai_rendering.ifc2img.service import _build_debug_view_payload, _load_debug_geometry
from ai_rendering.ifc2img.semantics import (
    IfcColorCandidate,
    IfcColorSummary,
    IfcFrontDirectionCandidate,
    IfcSemanticBounds,
    IfcSemanticCategoryColorSummary,
    IfcSemanticElement,
    IfcSemanticScreenMaskStats,
    SUPPORTED_SEMANTIC_CATEGORIES,
    append_ifc_color_prompt_suffix,
    append_ifc_shape_lock_negative_prompt,
    build_ifc_semantic_element_color,
    build_front_direction_candidates,
    build_ifc_compact_color_prompt_suffix,
    build_ifc_color_prompt_suffix,
    compact_ifc_color_base_prompt,
    dedupe_ifc_color_prompt_cues,
    diagnose_projection_vertical_inversion,
    extract_ifc_color_summary,
    extract_ifc_semantic_summary,
    ifc_category_color_prompt_cues,
    ifc_color_prompt_cue,
    inject_ifc_color_prompt,
    inject_ifc_shape_lock_prompt,
    is_reliable_main_door_candidate,
    nearest_prompt_color_name,
    remove_ifc_color_conflicting_prompt_terms,
    select_ifc_category_color_candidate,
    select_ifc_color_summary_category_cues,
)
from ai_rendering.ifc2img.views import IFCView
from ai_rendering.ifc2img.presets import load_preset


def test_ifc_color_candidate_serializes_prompt_ready_fields() -> None:
    """IFC color candidates should keep source, names, RGB, and transparency."""
    candidate = IfcColorCandidate(
        source="surface_style",
        style_name="유리",
        material_name="유리",
        rgb=(0.0, 0.501961, 0.752941),
        transparency=0.9,
    )

    assert candidate.to_dict() == {
        "source": "surface_style",
        "styleName": "유리",
        "materialName": "유리",
        "rgb": [0.0, 0.501961, 0.752941],
        "transparency": 0.9,
    }


def test_ifc_color_candidate_normalizes_rgb_channels_to_floats() -> None:
    """RGB channels should stay in normalized 0.0 to 1.0 float space."""
    candidate = IfcColorCandidate(
        source="material",
        rgb=(0, 0.5, 1),
    )

    assert candidate.rgb == (0.0, 0.5, 1.0)
    assert candidate.to_dict()["rgb"] == [0.0, 0.5, 1.0]


def test_ifc_color_candidate_normalizes_transparency_to_float() -> None:
    """Transparency should be preserved with the color candidate."""
    candidate = IfcColorCandidate(
        source="surface_style",
        rgb=(0.0, 0.501961, 0.752941),
        transparency=1,
    )

    assert candidate.transparency == 1.0
    assert candidate.to_dict()["transparency"] == 1.0


def test_ifc_color_candidate_rejects_out_of_range_rgb() -> None:
    """Out-of-range RGB values should fail before reaching prompt/debug output."""
    with pytest.raises(ValueError, match="0.0 to 1.0"):
        IfcColorCandidate(
            source="surface_style",
            rgb=(0.0, 1.2, 0.0),
        )


def test_ifc_color_candidate_rejects_out_of_range_transparency() -> None:
    """Invalid transparency should fail before prompt/debug output."""
    with pytest.raises(ValueError, match="transparency"):
        IfcColorCandidate(
            source="surface_style",
            transparency=-0.1,
        )


def test_select_ifc_semantic_element_color_prefers_direct_surface_style() -> None:
    """Representative colors should prefer direct surface styles over fallbacks."""
    element_color = build_ifc_semantic_element_color(
        entity_id=2334,
        category="ROOF",
        candidates=[
            IfcColorCandidate(
                source="material",
                material_name="기본 지붕",
                rgb=(0.0, 0.498039, 0.0),
            ),
            IfcColorCandidate(
                source="surface_style",
                rgb=(0.909804, 0.501961, 0.545098),
            ),
            IfcColorCandidate(
                source="category_default",
                rgb=(0.5, 0.5, 0.5),
            ),
        ],
    )

    assert element_color.color is not None
    assert element_color.color.source == "surface_style"
    assert element_color.color.rgb == (0.909804, 0.501961, 0.545098)
    assert element_color.to_dict()["category"] == "ROOF"


def test_select_ifc_semantic_element_color_uses_material_fallback() -> None:
    """Material color should be selected when direct/category colors are absent."""
    element_color = build_ifc_semantic_element_color(
        entity_id=132,
        category="WINDOW",
        candidates=[
            IfcColorCandidate(source="fallback"),
            IfcColorCandidate(
                source="material",
                material_name="유리",
                rgb=(0.0, 0.501961, 0.752941),
                transparency=0.9,
            ),
        ],
    )

    assert element_color.color is not None
    assert element_color.color.source == "material"
    assert element_color.color.material_name == "유리"
    assert element_color.color.transparency == 0.9


def test_select_ifc_semantic_element_color_returns_none_without_rgb() -> None:
    """Candidates without RGB are trace records, not representative colors."""
    element_color = build_ifc_semantic_element_color(
        entity_id=None,
        category="WALL",
        candidates=[
            IfcColorCandidate(source="fallback", style_name="missing"),
        ],
    )

    assert element_color.color is None
    assert element_color.to_dict() == {
        "entityId": None,
        "category": "WALL",
        "color": None,
    }


def test_select_ifc_semantic_element_color_returns_none_without_candidates() -> None:
    """Missing color data should be represented explicitly as None."""
    element_color = build_ifc_semantic_element_color(
        entity_id=999,
        category="DOOR",
        candidates=[],
    )

    assert element_color.color is None
    assert element_color.to_dict() == {
        "entityId": 999,
        "category": "DOOR",
        "color": None,
    }


def test_select_ifc_semantic_element_color_records_fallback_source() -> None:
    """Fallback colors should keep their source for debug manifest traceability."""
    element_color = build_ifc_semantic_element_color(
        entity_id=1034,
        category="FLOOR",
        candidates=[
            IfcColorCandidate(
                source="fallback",
                rgb=(0.5, 0.5, 0.5),
            ),
        ],
    )

    assert element_color.color is not None
    assert element_color.color.source == "fallback"
    assert element_color.to_dict()["color"] == {
        "source": "fallback",
        "styleName": None,
        "materialName": None,
        "rgb": [0.5, 0.5, 0.5],
        "transparency": None,
    }


def test_extract_ifc_color_summary_builds_shinchan_category_candidates(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc should expose color candidates for the main render categories."""
    summary = extract_ifc_color_summary(ifc4_fixture)

    assert summary.source_ifc_path == ifc4_fixture
    for category in ("ROOF", "WALL", "WINDOW", "DOOR"):
        category_summary = summary.categories[category]
        assert category_summary.candidates
        assert category_summary.color is not None
        assert category_summary.color.rgb is not None


def test_extract_ifc_color_summary_finds_shinchan_surface_style_colors(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc should expose at least one surface style color."""
    summary = extract_ifc_color_summary(ifc4_fixture)

    surface_style_count = sum(
        1
        for category_summary in summary.categories.values()
        for candidate in category_summary.candidates
        if candidate.source == "surface_style" and candidate.rgb is not None
    )

    assert surface_style_count > 0


def test_extract_ifc_color_summary_keeps_expected_named_material_fallbacks(
    ifc4_fixture: Path,
) -> None:
    """Material-name fallback should keep named roof, window, and door colors available."""
    summary = extract_ifc_color_summary(ifc4_fixture)

    roof_style_names = {
        candidate.style_name
        for candidate in summary.categories["ROOF"].candidates
    }
    window_style_names = {
        candidate.style_name
        for candidate in summary.categories["WINDOW"].candidates
    }
    door_material_names = {
        candidate.material_name
        for candidate in summary.categories["DOOR"].candidates
    }

    assert "기본 지붕" in roof_style_names
    assert {"유리", "섀시"} <= window_style_names
    assert {"문 - 프레임", "문 - 패널"} <= door_material_names


@pytest.mark.parametrize(
    ("rgb", "expected"),
    [
        ((0.0, 0.498039, 0.0), "green"),
        ((0.501961, 0.501961, 0.501961), "gray"),
        ((0.976471, 0.976471, 0.976471), "white"),
        ((0.0, 0.501961, 0.752941), "blue"),
        ((0.462745, 0.27451, 0.2), "brown"),
        ((0.823529, 0.623529, 0.372549), "tan"),
    ],
)
def test_nearest_prompt_color_name_maps_shinchan_colors(
    rgb: tuple[float, float, float],
    expected: str,
) -> None:
    """shinchan.ifc RGB values should map to stable prompt color names."""
    assert nearest_prompt_color_name(rgb) == expected


def test_ifc_color_prompt_cue_combines_transparent_window_with_glass() -> None:
    """Transparent window colors should keep material meaning for prompts."""
    candidate = IfcColorCandidate(
        source="surface_style",
        style_name="유리",
        material_name="유리",
        rgb=(0.0, 0.501961, 0.752941),
        transparency=0.9,
    )

    assert ifc_color_prompt_cue(candidate) == "blue glass"


def test_ifc_color_prompt_cue_uses_glass_name_even_without_transparency() -> None:
    """Glass material names should become material-aware prompt cues."""
    candidate = IfcColorCandidate(
        source="material",
        material_name="glass",
        rgb=(0.0, 0.501961, 0.752941),
    )

    assert ifc_color_prompt_cue(candidate) == "blue glass"


def test_ifc_color_prompt_cue_keeps_opaque_color_simple() -> None:
    """Opaque non-glass materials should stay as simple color words."""
    candidate = IfcColorCandidate(
        source="surface_style",
        style_name="기본 지붕",
        rgb=(0.0, 0.498039, 0.0),
        transparency=0.0,
    )

    assert ifc_color_prompt_cue(candidate) == "green"


def test_ifc_color_prompt_cue_prefers_rgb_for_color_name_when_style_conflicts() -> None:
    """Style/material names should not override the measured RGB color name."""
    candidate = IfcColorCandidate(
        source="surface_style",
        style_name="blue roof",
        material_name="blue material",
        rgb=(0.0, 0.498039, 0.0),
        transparency=0.0,
    )

    assert ifc_color_prompt_cue(candidate) == "green"


def test_dedupe_ifc_color_prompt_cues_removes_same_cue_and_near_rgb() -> None:
    """Similar colors should not create repeated prompt cues."""
    cues = dedupe_ifc_color_prompt_cues(
        [
            IfcColorCandidate(source="surface_style", rgb=(0.5, 0.5, 0.5)),
            IfcColorCandidate(source="material", rgb=(0.501, 0.501, 0.501)),
            IfcColorCandidate(
                source="surface_style",
                style_name="유리",
                rgb=(0.0, 0.501961, 0.752941),
                transparency=0.9,
            ),
            IfcColorCandidate(
                source="material",
                material_name="유리",
                rgb=(0.0, 0.502, 0.753),
            ),
        ],
    )

    assert cues == ("gray", "blue glass")


def test_dedupe_ifc_color_prompt_cues_keeps_distinct_prompt_colors() -> None:
    """Different IFC colors should remain available for prompt suffixes."""
    cues = dedupe_ifc_color_prompt_cues(
        [
            IfcColorCandidate(source="surface_style", rgb=(0.0, 0.498039, 0.0)),
            IfcColorCandidate(source="surface_style", rgb=(0.823529, 0.623529, 0.372549)),
        ],
    )

    assert cues == ("green", "tan")


def test_ifc_category_color_prompt_cues_match_shinchan_completion_criteria(
    ifc4_fixture: Path,
) -> None:
    """Category prompt cues should preserve the visible shinchan IFC colors."""
    summary = extract_ifc_color_summary(ifc4_fixture)

    roof = ifc_category_color_prompt_cues("ROOF", summary.categories["ROOF"].candidates)
    wall = ifc_category_color_prompt_cues("WALL", summary.categories["WALL"].candidates)
    window = ifc_category_color_prompt_cues(
        "WINDOW",
        summary.categories["WINDOW"].candidates,
    )
    door = ifc_category_color_prompt_cues("DOOR", summary.categories["DOOR"].candidates)

    assert roof[0] == "red"
    assert any(cue in {"gray", "white"} for cue in wall)
    assert window[0] == "blue glass"
    assert any(cue in {"brown wood", "tan wood"} for cue in door)


def test_select_ifc_color_summary_category_cues_uses_shinchan_representatives(
    ifc4_fixture: Path,
) -> None:
    """Color summary should provide one representative prompt cue per category."""
    summary = extract_ifc_color_summary(ifc4_fixture)

    selected = select_ifc_color_summary_category_cues(summary)

    assert selected["ROOF"] == "red"
    assert selected["WALL"] in {"gray", "white"}
    assert selected["WINDOW"] == "blue glass"
    assert selected["DOOR"] in {"brown wood", "tan wood"}


def test_select_ifc_category_color_candidate_uses_shinchan_category_priority(
    ifc4_fixture: Path,
) -> None:
    """Color composite category representatives should match prompt priorities."""
    summary = extract_ifc_color_summary(ifc4_fixture)

    roof = select_ifc_category_color_candidate(
        "ROOF",
        summary.categories["ROOF"].candidates,
    )

    assert roof is not None
    assert roof.rgb is not None
    assert nearest_prompt_color_name(roof.rgb) == "red"


def test_build_ifc_color_prompt_suffix_uses_shinchan_representatives(
    ifc4_fixture: Path,
) -> None:
    """Color summary should produce a compact opt-in prompt suffix."""
    summary = extract_ifc_color_summary(ifc4_fixture)

    suffix = build_ifc_color_prompt_suffix(summary)

    assert suffix.startswith("IFC colors: ")
    assert "red roof" in suffix
    assert "walls" in suffix
    assert "blue glass" in suffix
    assert "wood door" in suffix


def test_build_ifc_compact_color_prompt_suffix_removes_filler_words(
    ifc4_fixture: Path,
) -> None:
    """E-2.5 compact prompt keeps only the category color cues."""
    summary = extract_ifc_color_summary(ifc4_fixture)

    suffix = build_ifc_compact_color_prompt_suffix(summary)

    assert suffix == "IFC colors: red roof, white walls, blue glass, tan wood door."
    assert len(suffix.replace(",", " ").split()) == 11


def test_build_ifc_color_prompt_suffix_returns_empty_without_colors(
    tmp_path: Path,
) -> None:
    """Missing IFC color data should not add any prompt suffix."""
    summary = IfcColorSummary(
        source_ifc_path=tmp_path / "missing-colors.ifc",
        categories={},
        elements=(),
    )

    assert build_ifc_color_prompt_suffix(summary) == ""


def test_build_ifc_color_prompt_suffix_uses_category_color_without_candidates(
    tmp_path: Path,
) -> None:
    """Category representative color should still work without raw candidates."""
    summary = IfcColorSummary(
        source_ifc_path=tmp_path / "category-color-only.ifc",
        categories={
            "ROOF": IfcSemanticCategoryColorSummary(
                category="ROOF",
                color=IfcColorCandidate(source="surface_style", rgb=(0.0, 0.5, 0.0)),
                candidates=(),
            ),
        },
        elements=(),
    )

    assert build_ifc_color_prompt_suffix(summary) == "IFC colors: green roof."


def test_append_ifc_color_prompt_suffix_keeps_day_night_before_colors() -> None:
    """IFC color cues should be appended after the DAY/NIGHT preset suffix."""
    base_prompt = load_preset("korean_house", time_of_day="night").prompt
    color_suffix = (
        "Preserve the IFC colors: green roof, white walls, "
        "blue glass windows, and tan wood doors."
    )

    prompt = append_ifc_color_prompt_suffix(base_prompt, color_suffix)

    assert prompt.endswith(color_suffix)
    assert prompt.index("night exterior") < prompt.index("Preserve the IFC colors")
    assert "warm windows" in prompt
    assert "blue glass windows" in prompt


def test_append_ifc_color_prompt_suffix_keeps_prompt_when_suffix_empty() -> None:
    """Missing color cues should keep the existing DAY/NIGHT prompt unchanged."""
    base_prompt = load_preset("korean_house", time_of_day="day").prompt

    assert append_ifc_color_prompt_suffix(base_prompt, "") == base_prompt


def test_inject_ifc_color_prompt_puts_colors_before_day_night_text() -> None:
    """Production color opt-in should put IFC color cues before long preset prompts."""
    base_prompt = load_preset("korean_house", time_of_day="night").prompt
    color_prompt = (
        "IFC colors: green roof, gray walls, blue glass, tan wood door."
    )

    prompt = inject_ifc_color_prompt(base_prompt, color_prompt)

    assert prompt.startswith(color_prompt)
    assert prompt.index("IFC colors") < prompt.index("night exterior")
    assert "warm windows" in prompt


def test_inject_ifc_color_prompt_records_compact_word_budget() -> None:
    """IFC color injection should add only the compact color phrase budget."""
    base_prompt = load_preset("korean_house", time_of_day="day").prompt
    color_prompt = "IFC colors: green roof, gray walls, blue glass, tan wood door."

    prompt = inject_ifc_color_prompt(base_prompt, color_prompt)
    base_words = base_prompt.replace(",", " ").split()
    color_words = color_prompt.replace(",", " ").split()
    prompt_words = prompt.replace(",", " ").split()

    assert len(color_words) == 11
    assert len(prompt_words) <= len(base_words) + len(color_words)
    assert len(prompt_words) <= 77


def test_inject_ifc_color_prompt_keeps_color_phrase_before_truncation_budget() -> None:
    """A conservative 77-word budget should keep the front-loaded IFC color cue."""
    base_prompt = load_preset("korean_house", time_of_day="night").prompt
    color_prompt = "IFC colors: green roof, gray walls, blue glass, tan wood door."

    prompt = inject_ifc_color_prompt(base_prompt, color_prompt)
    visible_words = prompt.replace(",", " ").split()[:77]
    visible_prompt = " ".join(visible_words)

    assert visible_prompt.startswith("IFC colors:")
    assert "green roof" in visible_prompt
    assert "gray walls" in visible_prompt
    assert "blue glass" in visible_prompt
    assert "tan wood door" in visible_prompt


def test_inject_ifc_color_prompt_keeps_prompt_when_color_prompt_empty() -> None:
    """Missing color cues should keep the production prompt unchanged."""
    base_prompt = load_preset("korean_house", time_of_day="day").prompt

    assert inject_ifc_color_prompt(base_prompt, "") == base_prompt


def test_compact_ifc_color_base_prompt_keeps_time_of_day_cues() -> None:
    """E-2.5 compact color mode should shorten preset text without losing time cues."""
    day_prompt = compact_ifc_color_base_prompt(
        load_preset("korean_house", time_of_day="day").prompt
    )
    night_prompt = compact_ifc_color_base_prompt(
        load_preset("korean_house", time_of_day="night").prompt
    )

    assert "daylight" in day_prompt
    assert "blue sky" in day_prompt
    assert "night exterior" in night_prompt
    assert "warm windows" in night_prompt
    assert "white concrete facade" not in day_prompt
    assert "simple tile roof" not in day_prompt
    assert len(day_prompt.replace(",", " ").split()) < 25
    assert len(night_prompt.replace(",", " ").split()) < 30


def test_inject_ifc_shape_lock_prompt_puts_shape_before_color_and_time() -> None:
    """Shape lock cue should survive before color and DAY/NIGHT prompt text."""
    base_prompt = load_preset("korean_house", time_of_day="night").prompt
    color_prompt = "IFC colors: green roof, gray walls, blue glass, tan wood door."
    color_injected = inject_ifc_color_prompt(base_prompt, color_prompt)

    prompt = inject_ifc_shape_lock_prompt(color_injected)

    assert prompt.startswith("Shape.")
    assert prompt.index("Shape.") < prompt.index("IFC colors")
    assert prompt.index("Shape.") < prompt.index("night exterior")
    assert "warm windows" in prompt


def test_inject_ifc_shape_lock_prompt_keeps_compact_word_budget() -> None:
    """Shape lock cue should stay short enough for prompt-front placement."""
    base_prompt = load_preset("korean_house", time_of_day="day").prompt

    prompt = inject_ifc_shape_lock_prompt(base_prompt)
    shape_words = "Shape.".replace(
        ",",
        " ",
    ).split()

    assert len(shape_words) == 1
    assert prompt.split()[0] == "Shape."
    assert len(prompt.replace(",", " ").split()) <= 77


def test_inject_ifc_shape_lock_prompt_keeps_prompt_when_shape_empty() -> None:
    """Missing shape cue should keep the production prompt unchanged."""
    base_prompt = load_preset("korean_house", time_of_day="day").prompt

    assert inject_ifc_shape_lock_prompt(base_prompt, "") == base_prompt


def test_append_ifc_shape_lock_negative_prompt_adds_compact_structure_cues() -> None:
    """Shape lock negative cue should avoid duplicate long negative prompts."""
    negative = append_ifc_shape_lock_negative_prompt("low quality")

    assert negative == "low quality"
    assert append_ifc_shape_lock_negative_prompt(negative) == negative
    assert append_ifc_shape_lock_negative_prompt(None) == ""


def test_remove_ifc_color_conflicting_prompt_terms_neutralizes_preset_colors() -> None:
    """IFC color opt-in should remove hard preset colors that fight IFC colors."""
    base_prompt = load_preset("korean_house", time_of_day="day").prompt

    prompt = remove_ifc_color_conflicting_prompt_terms(base_prompt)

    assert "white concrete facade" not in prompt
    assert "simple tile roof" not in prompt
    assert "house facade" in prompt
    assert "simple roof" in prompt
    assert "simple Korean house" in prompt
    assert "outdoor daylight" in prompt


def test_remove_ifc_color_conflicting_prompt_terms_uses_ifc_color_cues() -> None:
    """IFC color opt-in should replace hard preset colors with IFC color cues."""
    base_prompt = load_preset("korean_house", time_of_day="day").prompt

    prompt = remove_ifc_color_conflicting_prompt_terms(
        base_prompt,
        {"WALL": "gray", "ROOF": "green"},
    )

    assert "white concrete facade" not in prompt
    assert "simple tile roof" not in prompt
    assert "gray house facade" in prompt
    assert "green roof" in prompt
    assert "simple Korean house" in prompt


def test_remove_ifc_color_conflicting_prompt_terms_keeps_short_material_cues() -> None:
    """Material meaning should remain without fighting IFC color cues."""
    base_prompt = load_preset("korean_house", time_of_day="day").prompt

    prompt = remove_ifc_color_conflicting_prompt_terms(
        base_prompt,
        {"WALL": "gray", "ROOF": "green"},
    )

    assert "concrete" not in prompt
    assert "tile" not in prompt
    assert "facade" in prompt
    assert "roof" in prompt
    assert "subtle brick trim" in prompt


def test_remove_ifc_color_conflicting_prompt_terms_keeps_preset_style_contract() -> None:
    """Color cleanup should not remove the preset's style, ground, or time cues."""
    day_prompt = load_preset("korean_house", time_of_day="day").prompt
    night_prompt = load_preset("korean_house", time_of_day="night").prompt

    day_clean = remove_ifc_color_conflicting_prompt_terms(
        day_prompt,
        {"WALL": "gray", "ROOF": "green"},
    )
    night_clean = remove_ifc_color_conflicting_prompt_terms(
        night_prompt,
        {"WALL": "gray", "ROOF": "green"},
    )

    assert "RAW photo" in day_clean
    assert "simple Korean house" in day_clean
    assert "open flat paved ground in front" in day_clean
    assert "ground touches facade" in day_clean
    assert "no balcony" in day_clean
    assert "no foreground wall" in day_clean
    assert "during sunny daytime" in day_clean
    assert "night exterior" in night_clean
    assert "warm windows" in night_clean
    assert "exterior lights" in night_clean


def test_build_ifc_color_composite_from_element_masks_uses_category_colors(
    tmp_path: Path,
) -> None:
    """IFC color composites should paint category mask pixels with IFC RGB values."""
    floor_mask = Image.new("L", (3, 2), 0)
    roof_mask = Image.new("L", (3, 2), 0)
    floor_mask.putpixel((0, 1), 255)
    roof_mask.putpixel((2, 0), 255)
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": floor_mask,
            "ROOF": roof_mask,
            "WALL": Image.new("L", (3, 2), 0),
            "WINDOW": Image.new("L", (3, 2), 0),
            "DOOR": Image.new("L", (3, 2), 0),
        },
        composite=Image.new("RGB", (3, 2), "black"),
    )
    summary = IfcColorSummary(
        source_ifc_path=tmp_path / "colors.ifc",
        categories={
            "FLOOR": IfcSemanticCategoryColorSummary(
                category="FLOOR",
                color=IfcColorCandidate(source="surface_style", rgb=(0.5, 0.5, 0.5)),
                candidates=(),
            ),
            "ROOF": IfcSemanticCategoryColorSummary(
                category="ROOF",
                color=IfcColorCandidate(source="surface_style", rgb=(0.0, 0.5, 0.0)),
                candidates=(),
            ),
        },
        elements=(),
    )

    composite = build_ifc_color_composite_from_element_masks(element_masks, summary)

    assert composite.getpixel((0, 1)) == (128, 128, 128)
    assert composite.getpixel((2, 0)) == (0, 128, 0)
    assert composite.getpixel((1, 0)) == (0, 0, 0)


def test_build_ifc_color_composite_uses_debug_fallback_for_missing_colors(
    tmp_path: Path,
) -> None:
    """Missing IFC colors should fall back to existing element debug colors."""
    wall_mask = Image.new("L", (2, 1), 0)
    wall_mask.putpixel((1, 0), 255)
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (2, 1), 0),
            "ROOF": Image.new("L", (2, 1), 0),
            "WALL": wall_mask,
            "WINDOW": Image.new("L", (2, 1), 0),
            "DOOR": Image.new("L", (2, 1), 0),
        },
        composite=Image.new("RGB", (2, 1), "black"),
    )
    summary = IfcColorSummary(
        source_ifc_path=tmp_path / "missing-wall-color.ifc",
        categories={},
        elements=(),
    )

    composite = build_ifc_color_composite_from_element_masks(element_masks, summary)

    assert composite.getpixel((1, 0)) == (160, 160, 160)


def test_build_ifc_color_composite_can_use_neutral_fallback(
    tmp_path: Path,
) -> None:
    """Neutral fallback is available when debug category colors are too symbolic."""
    door_mask = Image.new("L", (2, 1), 0)
    door_mask.putpixel((0, 0), 255)
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (2, 1), 0),
            "ROOF": Image.new("L", (2, 1), 0),
            "WALL": Image.new("L", (2, 1), 0),
            "WINDOW": Image.new("L", (2, 1), 0),
            "DOOR": door_mask,
        },
        composite=Image.new("RGB", (2, 1), "black"),
    )
    summary = IfcColorSummary(
        source_ifc_path=tmp_path / "missing-door-color.ifc",
        categories={},
        elements=(),
    )

    composite = build_ifc_color_composite_from_element_masks(
        element_masks,
        summary,
        missing_color_fallback="neutral",
    )

    assert composite.getpixel((0, 0)) == (128, 128, 128)


def test_measure_element_mask_mean_colors_reads_final_photo_regions() -> None:
    """Color-lock measurement should average final photo pixels by category mask."""
    final_photo = Image.new("RGB", (3, 2), "black")
    final_photo.putpixel((0, 0), (0, 128, 0))
    final_photo.putpixel((1, 0), (0, 255, 0))
    final_photo.putpixel((2, 0), (128, 128, 128))
    final_photo.putpixel((0, 1), (255, 255, 255))
    final_photo.putpixel((1, 1), (0, 0, 255))
    final_photo.putpixel((2, 1), (128, 64, 0))

    roof_mask = Image.new("L", (3, 2), 0)
    wall_mask = Image.new("L", (3, 2), 0)
    window_mask = Image.new("L", (3, 2), 0)
    door_mask = Image.new("L", (3, 2), 0)
    roof_mask.putpixel((0, 0), 255)
    roof_mask.putpixel((1, 0), 255)
    wall_mask.putpixel((2, 0), 255)
    wall_mask.putpixel((0, 1), 255)
    window_mask.putpixel((1, 1), 255)
    door_mask.putpixel((2, 1), 255)
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (3, 2), 0),
            "ROOF": roof_mask,
            "WALL": wall_mask,
            "WINDOW": window_mask,
            "DOOR": door_mask,
        },
        composite=Image.new("RGB", (3, 2), "black"),
    )

    measurements = measure_element_mask_mean_colors(final_photo, element_masks)

    assert measurements["ROOF"].pixel_count == 2
    assert measurements["ROOF"].mean_rgb == pytest.approx(
        (0.0, 191.5 / 255.0, 0.0)
    )
    assert measurements["WALL"].pixel_count == 2
    assert measurements["WALL"].mean_rgb == pytest.approx(
        (191.5 / 255.0, 191.5 / 255.0, 191.5 / 255.0)
    )
    assert measurements["WINDOW"].pixel_count == 1
    assert measurements["WINDOW"].mean_rgb == pytest.approx((0.0, 0.0, 1.0))
    assert measurements["DOOR"].pixel_count == 1
    assert measurements["DOOR"].mean_rgb == pytest.approx(
        (128 / 255.0, 64 / 255.0, 0.0)
    )


def test_measure_element_mask_mean_colors_handles_empty_category() -> None:
    """Empty roof/wall/window/door masks should produce no mean color."""
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (2, 2), 0),
            "ROOF": Image.new("L", (2, 2), 0),
            "WALL": Image.new("L", (2, 2), 0),
            "WINDOW": Image.new("L", (2, 2), 0),
            "DOOR": Image.new("L", (2, 2), 0),
        },
        composite=Image.new("RGB", (2, 2), "black"),
    )

    measurements = measure_element_mask_mean_colors(
        Image.new("RGB", (2, 2), "white"),
        element_masks,
    )

    assert measurements["ROOF"].pixel_count == 0
    assert measurements["ROOF"].mean_rgb is None


def test_measure_element_mask_mean_colors_rejects_size_mismatch() -> None:
    """Mask/photo size mismatch would make color-lock measurement unreliable."""
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (1, 1), 0),
            "ROOF": Image.new("L", (1, 1), 255),
            "WALL": Image.new("L", (1, 1), 0),
            "WINDOW": Image.new("L", (1, 1), 0),
            "DOOR": Image.new("L", (1, 1), 0),
        },
        composite=Image.new("RGB", (1, 1), "black"),
    )

    with pytest.raises(IFCRenderError, match="element mask size does not match"):
        measure_element_mask_mean_colors(
            Image.new("RGB", (2, 2), "white"),
            element_masks,
        )


def test_measure_ifc_geometry_fidelity_compares_mask_and_photo_layout() -> None:
    """Geometry metric should compare IFC mask layout with final-photo foreground."""
    final_photo = Image.new("RGB", (5, 5), "white")
    for y in range(1, 4):
        for x in range(1, 4):
            final_photo.putpixel((x, y), (0, 0, 0))
    final_photo.putpixel((2, 2), (64, 64, 64))

    roof_mask = Image.new("L", (5, 5), 0)
    wall_mask = Image.new("L", (5, 5), 0)
    window_mask = Image.new("L", (5, 5), 0)
    door_mask = Image.new("L", (5, 5), 0)
    for x in range(1, 4):
        roof_mask.putpixel((x, 1), 255)
        wall_mask.putpixel((x, 2), 255)
    window_mask.putpixel((2, 2), 255)
    door_mask.putpixel((2, 3), 255)
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (5, 5), 0),
            "ROOF": roof_mask,
            "WALL": wall_mask,
            "WINDOW": window_mask,
            "DOOR": door_mask,
        },
        composite=Image.new("RGB", (5, 5), "black"),
    )

    report = measure_ifc_geometry_fidelity(final_photo, element_masks)

    assert report.image_size == (5, 5)
    assert report.building_pixel_count == 7
    assert report.building_pixel_coverage == pytest.approx(7 / 25)
    assert report.building_bbox == IfcMaskBoundingBox(
        left=1,
        top=1,
        right=3,
        bottom=3,
    )
    assert report.estimated_photo_foreground_pixel_count == 9
    assert report.estimated_photo_foreground_fill_ratio == pytest.approx(9 / 25)
    assert report.building_bbox_overlap == pytest.approx(1.0)
    assert report.silhouette_iou == pytest.approx(7 / 9)
    assert report.edge_alignment_score > 0.0
    assert report.categories["ROOF"].bbox == IfcMaskBoundingBox(1, 1, 3, 1)
    assert report.categories["ROOF"].foreground_overlap_ratio == pytest.approx(1.0)
    assert report.categories["WINDOW"].pixel_count == 1
    assert report.to_dict()["categories"]["DOOR"]["pixelCount"] == 1


def test_measure_ifc_geometry_fidelity_handles_empty_masks() -> None:
    """Missing category masks should stay serializable with zero metrics."""
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (2, 2), 0),
            "ROOF": Image.new("L", (2, 2), 0),
            "WALL": Image.new("L", (2, 2), 0),
            "WINDOW": Image.new("L", (2, 2), 0),
            "DOOR": Image.new("L", (2, 2), 0),
        },
        composite=Image.new("RGB", (2, 2), "black"),
    )

    report = measure_ifc_geometry_fidelity(
        Image.new("RGB", (2, 2), "white"),
        element_masks,
    )

    assert report.building_bbox is None
    assert report.building_bbox_overlap is None
    assert report.silhouette_iou == 0.0
    assert report.categories["ROOF"].bbox is None
    assert report.categories["ROOF"].foreground_overlap_ratio == 0.0


def test_measure_ifc_geometry_fidelity_rejects_size_mismatch() -> None:
    """Mask/photo size mismatch would make geometry metric unreliable."""
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (1, 1), 0),
            "ROOF": Image.new("L", (1, 1), 255),
            "WALL": Image.new("L", (1, 1), 0),
            "WINDOW": Image.new("L", (1, 1), 0),
            "DOOR": Image.new("L", (1, 1), 0),
        },
        composite=Image.new("RGB", (1, 1), "black"),
    )

    with pytest.raises(IFCRenderError, match="element mask size does not match"):
        measure_ifc_geometry_fidelity(
            Image.new("RGB", (2, 2), "white"),
            element_masks,
        )


def _build_fidelity_report(
    *,
    sky_edge_density: float,
    silhouette_iou: float = 0.0,
    edge_alignment_score: float = 0.0,
    building_bbox_overlap: float | None = 0.0,
) -> IfcGeometryFidelityReport:
    return IfcGeometryFidelityReport(
        image_size=(4, 4),
        building_pixel_count=4,
        building_pixel_coverage=0.25,
        building_bbox=IfcMaskBoundingBox(0, 0, 1, 1),
        estimated_photo_foreground_pixel_count=4,
        estimated_photo_foreground_fill_ratio=0.25,
        estimated_photo_foreground_bbox=IfcMaskBoundingBox(0, 0, 1, 1),
        building_bbox_overlap=building_bbox_overlap,
        silhouette_iou=silhouette_iou,
        edge_alignment_score=edge_alignment_score,
        sky_edge_density=sky_edge_density,
        categories={},
    )


def test_evaluate_ifc_geometry_fidelity_gate_accepts_clean_sky() -> None:
    """Soft-lock gate accepts when the sky band has almost no Canny edges."""
    report = _build_fidelity_report(sky_edge_density=0.01)

    decision = evaluate_ifc_geometry_fidelity_gate(report)

    assert decision.accepted is True
    assert decision.fail_reasons == ()
    payload = decision.to_dict()
    assert payload["accepted"] is True
    assert payload["failReasons"] == []
    assert payload["thresholds"]["skyEdgeDensityMax"] > 0.0


def test_evaluate_ifc_geometry_fidelity_gate_rejects_cluttered_sky() -> None:
    """High edge density above the building bbox indicates drift in the sky band."""
    report = _build_fidelity_report(sky_edge_density=0.20)

    decision = evaluate_ifc_geometry_fidelity_gate(report)

    assert decision.accepted is False
    assert decision.fail_reasons == ("sky_edge_density_above_threshold",)


def test_evaluate_ifc_geometry_fidelity_gate_honors_custom_threshold() -> None:
    """Caller-supplied thresholds override the default."""
    report = _build_fidelity_report(sky_edge_density=0.04)

    strict = evaluate_ifc_geometry_fidelity_gate(
        report,
        thresholds=IfcGeometryFidelityThresholds(sky_edge_density_max=0.01),
    )

    assert strict.accepted is False
    assert "sky_edge_density_above_threshold" in strict.fail_reasons


def test_evaluate_ifc_geometry_fidelity_gate_preserves_measurement_metrics() -> None:
    """Silhouette / edge / bbox stay on the decision payload as measurements only."""
    report = _build_fidelity_report(
        sky_edge_density=0.01,
        silhouette_iou=0.12,
        edge_alignment_score=0.0,
        building_bbox_overlap=0.07,
    )

    decision = evaluate_ifc_geometry_fidelity_gate(report)

    assert decision.accepted is True
    assert decision.silhouette_iou == 0.12
    assert decision.edge_alignment_score == 0.0
    assert decision.building_bbox_overlap == 0.07


def test_measure_ifc_color_target_deltas_compares_mean_to_target(
    tmp_path: Path,
) -> None:
    """Color-lock delta should compare measured final colors with IFC targets."""
    measurements = {
        "ROOF": IfcElementMeanColor(
            category="ROOF",
            pixel_count=4,
            mean_rgb=(0.0, 0.25, 0.0),
        ),
        "WALL": IfcElementMeanColor(
            category="WALL",
            pixel_count=2,
            mean_rgb=(0.5, 0.5, 0.5),
        ),
    }
    summary = IfcColorSummary(
        source_ifc_path=tmp_path / "target-colors.ifc",
        categories={
            "ROOF": IfcSemanticCategoryColorSummary(
                category="ROOF",
                color=IfcColorCandidate(source="surface_style", rgb=(0.0, 0.5, 0.0)),
                candidates=(),
            ),
            "WALL": IfcSemanticCategoryColorSummary(
                category="WALL",
                color=IfcColorCandidate(source="surface_style", rgb=(0.5, 0.5, 0.5)),
                candidates=(),
            ),
        },
        elements=(),
    )

    deltas = measure_ifc_color_target_deltas(measurements, summary)

    assert deltas["ROOF"].pixel_count == 4
    assert deltas["ROOF"].mean_rgb == (0.0, 0.25, 0.0)
    assert deltas["ROOF"].target_rgb == (0.0, 0.5, 0.0)
    assert deltas["ROOF"].delta == pytest.approx(0.25)
    assert deltas["WALL"].delta == pytest.approx(0.0)


def test_measure_ifc_color_target_deltas_handles_missing_data(
    tmp_path: Path,
) -> None:
    """Missing target color or empty measured region should keep delta unset."""
    measurements = {
        "ROOF": IfcElementMeanColor(
            category="ROOF",
            pixel_count=0,
            mean_rgb=None,
        ),
        "WALL": IfcElementMeanColor(
            category="WALL",
            pixel_count=3,
            mean_rgb=(0.5, 0.5, 0.5),
        ),
    }
    summary = IfcColorSummary(
        source_ifc_path=tmp_path / "missing-target.ifc",
        categories={
            "ROOF": IfcSemanticCategoryColorSummary(
                category="ROOF",
                color=IfcColorCandidate(source="surface_style", rgb=(0.0, 0.5, 0.0)),
                candidates=(),
            ),
        },
        elements=(),
    )

    deltas = measure_ifc_color_target_deltas(measurements, summary)

    assert deltas["ROOF"].pixel_count == 0
    assert deltas["ROOF"].target_rgb == (0.0, 0.5, 0.0)
    assert deltas["ROOF"].delta is None
    assert deltas["WALL"].pixel_count == 3
    assert deltas["WALL"].target_rgb is None
    assert deltas["WALL"].delta is None


def test_select_ifc_color_correction_candidates_marks_large_deltas() -> None:
    """Only categories with large color deltas should become correction candidates."""
    candidates = select_ifc_color_correction_candidates(
        {
            "ROOF": IfcElementColorDelta(
                category="ROOF",
                pixel_count=12,
                mean_rgb=(0.2, 0.2, 0.2),
                target_rgb=(0.0, 0.6, 0.0),
                delta=0.45,
            ),
            "WALL": IfcElementColorDelta(
                category="WALL",
                pixel_count=20,
                mean_rgb=(0.5, 0.5, 0.5),
                target_rgb=(0.55, 0.55, 0.55),
                delta=0.08,
            ),
            "WINDOW": IfcElementColorDelta(
                category="WINDOW",
                pixel_count=4,
                mean_rgb=(0.1, 0.1, 0.1),
                target_rgb=(0.2, 0.6, 1.0),
                delta=0.62,
            ),
            "DOOR": IfcElementColorDelta(
                category="DOOR",
                pixel_count=0,
                mean_rgb=None,
                target_rgb=(0.6, 0.3, 0.1),
                delta=None,
            ),
        },
        delta_threshold=0.18,
    )

    assert [candidate.category for candidate in candidates] == ["WINDOW", "ROOF"]
    assert candidates[0].delta == pytest.approx(0.62)
    assert candidates[1].pixel_count == 12


def test_select_ifc_color_correction_candidates_respects_threshold() -> None:
    """A stricter threshold should keep borderline deltas out of correction."""
    candidates = select_ifc_color_correction_candidates(
        {
            "ROOF": IfcElementColorDelta(
                category="ROOF",
                pixel_count=12,
                mean_rgb=(0.2, 0.2, 0.2),
                target_rgb=(0.0, 0.6, 0.0),
                delta=0.45,
            ),
        },
        delta_threshold=0.5,
    )

    assert candidates == ()


def test_build_ifc_color_lock_artifact_blends_candidate_regions() -> None:
    """Color-lock preview should blend only selected mask regions toward targets."""
    image = Image.new("RGB", (3, 1), (100, 100, 100))
    roof_mask = Image.new("L", (3, 1), 0)
    wall_mask = Image.new("L", (3, 1), 0)
    roof_mask.putpixel((0, 0), 255)
    wall_mask.putpixel((1, 0), 255)
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (3, 1), 0),
            "ROOF": roof_mask,
            "WALL": wall_mask,
            "WINDOW": Image.new("L", (3, 1), 0),
            "DOOR": Image.new("L", (3, 1), 0),
        },
        composite=Image.new("RGB", (3, 1), "black"),
    )
    candidates = (
        IfcElementColorCorrectionCandidate(
            category="ROOF",
            pixel_count=1,
            mean_rgb=(100 / 255.0, 100 / 255.0, 100 / 255.0),
            target_rgb=(0.0, 1.0, 0.0),
            delta=0.8,
        ),
    )

    artifact = build_ifc_color_lock_artifact(
        image,
        element_masks,
        candidates,
        strength=0.5,
    )

    assert artifact.getpixel((0, 0)) == (50, 178, 50)
    assert artifact.getpixel((1, 0)) == (100, 100, 100)
    assert artifact.getpixel((2, 0)) == (100, 100, 100)


def test_build_ifc_color_lock_artifact_strength_zero_keeps_original() -> None:
    """Strength 0.0 should create a comparison artifact identical to input."""
    image = Image.new("RGB", (1, 1), (100, 100, 100))
    element_masks = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (1, 1), 0),
            "ROOF": Image.new("L", (1, 1), 255),
            "WALL": Image.new("L", (1, 1), 0),
            "WINDOW": Image.new("L", (1, 1), 0),
            "DOOR": Image.new("L", (1, 1), 0),
        },
        composite=Image.new("RGB", (1, 1), "black"),
    )

    artifact = build_ifc_color_lock_artifact(
        image,
        element_masks,
        (
            IfcElementColorCorrectionCandidate(
                category="ROOF",
                pixel_count=1,
                mean_rgb=(100 / 255.0, 100 / 255.0, 100 / 255.0),
                target_rgb=(0.0, 1.0, 0.0),
                delta=0.8,
            ),
        ),
        strength=0.0,
    )

    assert artifact.getpixel((0, 0)) == (100, 100, 100)


def test_build_ifc_color_lock_artifact_rejects_invalid_strength() -> None:
    """Color-lock strength is an artifact comparison knob in the 0.0-1.0 range."""
    with pytest.raises(ValueError, match="strength must be between"):
        build_ifc_color_lock_artifact(
            Image.new("RGB", (1, 1), "white"),
            IfcElementMaskRenderResult(
                masks={
                    "FLOOR": Image.new("L", (1, 1), 0),
                    "ROOF": Image.new("L", (1, 1), 0),
                    "WALL": Image.new("L", (1, 1), 0),
                    "WINDOW": Image.new("L", (1, 1), 0),
                    "DOOR": Image.new("L", (1, 1), 0),
                },
                composite=Image.new("RGB", (1, 1), "black"),
            ),
            (),
            strength=1.5,
        )


def test_evaluate_ifc_quantitative_color_reports_metrics() -> None:
    """Quantitative evaluation should expose deltas, coverage, family, and notes."""
    report = evaluate_ifc_quantitative_color(
        {
            "ROOF": IfcElementColorDelta(
                category="ROOF",
                pixel_count=10,
                mean_rgb=(0.0, 0.5, 0.0),
                target_rgb=(0.0, 0.5, 0.0),
                delta=0.0,
            ),
            "WALL": IfcElementColorDelta(
                category="WALL",
                pixel_count=20,
                mean_rgb=(0.5, 0.5, 0.5),
                target_rgb=(0.5, 0.5, 0.5),
                delta=0.0,
            ),
            "WINDOW": IfcElementColorDelta(
                category="WINDOW",
                pixel_count=5,
                mean_rgb=(0.0, 0.5, 0.75),
                target_rgb=(0.0, 0.5, 0.75),
                delta=0.0,
            ),
            "DOOR": IfcElementColorDelta(
                category="DOOR",
                pixel_count=4,
                mean_rgb=(0.82, 0.62, 0.37),
                target_rgb=(0.82, 0.62, 0.37),
                delta=0.0,
            ),
        },
        total_pixel_count=100,
    )

    assert report.categories["ROOF"].delta_to_target == pytest.approx(0.0)
    assert report.categories["ROOF"].pixel_coverage == pytest.approx(0.1)
    assert report.categories["ROOF"].measured_color_family == "green"
    assert report.categories["WALL"].expected_color_families == ("gray", "white")
    assert report.categories["WINDOW"].family_pass is True
    assert report.categories["DOOR"].family_pass is True
    assert report.color_family_pass is True
    assert report.delta_pass is True
    assert report.success is True


def test_evaluate_ifc_quantitative_color_flags_failures_and_notes() -> None:
    """Failed color family, high delta, and manual notes should fail the report."""
    report = evaluate_ifc_quantitative_color(
        {
            "ROOF": IfcElementColorDelta(
                category="ROOF",
                pixel_count=10,
                mean_rgb=(0.5, 0.5, 0.5),
                target_rgb=(0.0, 0.5, 0.0),
                delta=0.5,
            ),
        },
        total_pixel_count=100,
        shape_collapse_notes="roof shape changed",
        background_regression_notes="ground got noisy",
    )

    assert report.categories["ROOF"].measured_color_family == "gray"
    assert report.categories["ROOF"].family_pass is False
    assert report.categories["ROOF"].delta_pass is False
    assert report.shape_pass is False
    assert report.background_pass is False
    assert report.success is False


def test_compare_ifc_color_family_consistency_checks_day_night() -> None:
    """DAY/NIGHT artifacts should keep the same measured category color family."""
    day = evaluate_ifc_quantitative_color(
        {
            "ROOF": IfcElementColorDelta(
                category="ROOF",
                pixel_count=10,
                mean_rgb=(0.0, 0.5, 0.0),
                target_rgb=(0.0, 0.5, 0.0),
                delta=0.0,
            ),
            "DOOR": IfcElementColorDelta(
                category="DOOR",
                pixel_count=4,
                mean_rgb=(0.82, 0.62, 0.37),
                target_rgb=(0.82, 0.62, 0.37),
                delta=0.0,
            ),
        },
        total_pixel_count=100,
        categories=("ROOF", "DOOR"),
    )
    night = evaluate_ifc_quantitative_color(
        {
            "ROOF": IfcElementColorDelta(
                category="ROOF",
                pixel_count=10,
                mean_rgb=(0.0, 0.5, 0.0),
                target_rgb=(0.0, 0.5, 0.0),
                delta=0.0,
            ),
            "DOOR": IfcElementColorDelta(
                category="DOOR",
                pixel_count=4,
                mean_rgb=(0.46, 0.27, 0.2),
                target_rgb=(0.82, 0.62, 0.37),
                delta=0.52,
            ),
        },
        total_pixel_count=100,
        categories=("ROOF", "DOOR"),
    )

    consistency = compare_ifc_color_family_consistency(
        day,
        night,
        categories=("ROOF", "DOOR"),
    )

    assert consistency == {"ROOF": True, "DOOR": False}


def test_build_ifc_color_artifact_matrix_fixes_case_order() -> None:
    """Final artifact matrix should cover every variant for DAY and NIGHT."""
    matrix = build_ifc_color_artifact_matrix(post_color_lock_strength=0.75)

    assert [case.case_name for case in matrix] == [
        "default_day",
        "prompt_injection_day",
        "hybrid_color_day",
        "post_color_lock_day",
        "default_night",
        "prompt_injection_night",
        "hybrid_color_night",
        "post_color_lock_night",
    ]
    assert [case.ifc_color_mode for case in matrix] == [
        "none",
        "prompt",
        "hybrid",
        "none",
        "none",
        "prompt",
        "hybrid",
        "none",
    ]
    assert [case.use_prompt_color_injection for case in matrix] == [
        False,
        True,
        True,
        False,
        False,
        True,
        True,
        False,
    ]
    assert [case.use_ifc_color_composite for case in matrix] == [
        False,
        False,
        True,
        False,
        False,
        False,
        True,
        False,
    ]
    assert [case.use_post_color_lock for case in matrix] == [
        False,
        False,
        False,
        True,
        False,
        False,
        False,
        True,
    ]
    assert matrix[3].post_color_lock_strength == pytest.approx(0.75)
    assert matrix[7].post_color_lock_strength == pytest.approx(0.75)


def test_build_ifc_color_artifact_matrix_rejects_invalid_strength() -> None:
    """Artifact matrix should keep post-color-lock strength in comparison range."""
    with pytest.raises(ValueError, match="post_color_lock_strength"):
        build_ifc_color_artifact_matrix(post_color_lock_strength=-0.1)


def _mask_y_center(mask: object) -> float:
    arr = np.asarray(mask, dtype=np.uint8)
    ys, _xs = np.nonzero(arr > 0)
    assert len(ys) > 0
    return float(ys.mean())


def _first_mask_pixel_color(mask: object, image: Image.Image) -> tuple[int, int, int]:
    arr = np.asarray(mask, dtype=np.uint8)
    ys, xs = np.nonzero(arr > 0)
    assert len(ys) > 0
    return image.getpixel((int(xs[0]), int(ys[0])))


def test_extract_ifc_semantic_summary_collects_key_elements(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc should expose floor, roof, wall, window, and door semantics."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    assert set(summary.categories) == set(SUPPORTED_SEMANTIC_CATEGORIES)
    assert summary.categories["FLOOR"].count == 1
    assert summary.categories["ROOF"].count >= 1
    assert summary.categories["WALL"].count >= 1
    assert summary.categories["WINDOW"].count >= 1
    assert summary.categories["DOOR"].count >= 1
    assert len(summary.elements) == sum(
        category.count for category in summary.categories.values()
    )


def test_extract_ifc_semantic_summary_keeps_floor_below_roof(
    ifc4_fixture: Path,
) -> None:
    """IFC semantic z ranges should show that the fixture itself is not upside-down."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)
    floor = summary.categories["FLOOR"]
    roof = summary.categories["ROOF"]

    assert floor.z_min == pytest.approx(-0.362)
    assert floor.z_max == pytest.approx(0.0)
    assert roof.z_min is not None
    assert roof.z_max is not None
    assert floor.z_max < roof.z_min
    assert roof.z_max == pytest.approx(6.5)


def test_shinchan_semantic_summary_fixture_smoke_has_required_categories_and_z_order(
    ifc4_fixture: Path,
) -> None:
    """Fixture smoke: shinchan.ifc should include core categories and z order."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    assert set(summary.categories) == {"FLOOR", "ROOF", "WALL", "WINDOW", "DOOR"}
    assert all(summary.categories[category].count > 0 for category in summary.categories)
    assert summary.categories["FLOOR"].z_max is not None
    assert summary.categories["ROOF"].z_min is not None
    assert summary.categories["FLOOR"].z_max < summary.categories["ROOF"].z_min


def test_shinchan_semantic_baseline_counts_and_z_ranges(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc semantic baseline count/z values are fixed for regression."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    assert summary.categories["FLOOR"].count == 1
    assert summary.categories["ROOF"].count == 13
    assert summary.categories["WALL"].count == 38
    assert summary.categories["WINDOW"].count == 15
    assert summary.categories["DOOR"].count == 5
    assert summary.categories["FLOOR"].z_min == pytest.approx(-0.362)
    assert summary.categories["FLOOR"].z_max == pytest.approx(0.0)
    assert summary.categories["ROOF"].z_min == pytest.approx(2.5)
    assert summary.categories["ROOF"].z_max == pytest.approx(6.5)
    assert summary.categories["FLOOR"].z_max < summary.categories["ROOF"].z_min


def test_shinchan_semantic_baseline_lowest_floor_and_highest_roof(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc establishes floor below roof as a semantic baseline fact."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    assert summary.lowest_floor is not None
    assert summary.highest_roof is not None
    assert summary.lowest_floor.category == "FLOOR"
    assert summary.highest_roof.category == "ROOF"
    assert summary.lowest_floor.bounds.z_min == pytest.approx(-0.362)
    assert summary.lowest_floor.bounds.z_max == pytest.approx(0.0)
    assert summary.highest_roof.bounds.z_min == pytest.approx(5.0)
    assert summary.highest_roof.bounds.z_max == pytest.approx(6.5)
    assert summary.lowest_floor.bounds.z_max < summary.highest_roof.bounds.z_min


def test_shinchan_element_masks_keep_roof_above_floor(
    ifc4_fixture: Path,
) -> None:
    """Element mask projection should preserve semantic roof/floor screen order."""
    geometry = _load_debug_geometry(ifc4_fixture)

    for view in (IFCView.FRONT_DIAGONAL_LEFT, IFCView.FRONT_DIAGONAL_RIGHT):
        payload = _build_debug_view_payload(
            geometry=geometry,
            internal_view=view,
        )
        camera = payload["camera"]
        assert isinstance(camera, dict)

        result = render_ifc_element_masks(
            ifc4_fixture,
            eye=camera["eye"],
            look_at=camera["lookAt"],
            up=camera["up"],
            width=768,
            height=448,
        )

        roof_y_center = _mask_y_center(result.masks["ROOF"])
        floor_y_center = _mask_y_center(result.masks["FLOOR"])

        assert roof_y_center < floor_y_center


def test_shinchan_ifc_color_composite_matches_completion_criteria(
    ifc4_fixture: Path,
) -> None:
    """shinchan color composite should paint each category with expected IFC colors."""
    geometry = _load_debug_geometry(ifc4_fixture)
    payload = _build_debug_view_payload(
        geometry=geometry,
        internal_view=IFCView.FRONT_DIAGONAL_LEFT,
    )
    camera = payload["camera"]
    assert isinstance(camera, dict)
    element_masks = render_ifc_element_masks(
        ifc4_fixture,
        eye=camera["eye"],
        look_at=camera["lookAt"],
        up=camera["up"],
        width=768,
        height=448,
    )
    color_summary = extract_ifc_color_summary(ifc4_fixture)

    composite = build_ifc_color_composite_from_element_masks(
        element_masks,
        color_summary,
    )

    category_colors = {
        category: _first_mask_pixel_color(mask, composite)
        for category, mask in element_masks.masks.items()
    }
    category_cues = {
        category: nearest_prompt_color_name(
            tuple(channel / 255.0 for channel in rgb)
        )
        for category, rgb in category_colors.items()
    }

    assert category_cues["ROOF"] == "red"
    assert category_cues["WALL"] in {"gray", "white"}
    assert category_cues["WINDOW"] == "blue"
    assert category_cues["DOOR"] in {"brown", "tan"}
    assert category_colors["FLOOR"] != (0, 0, 0)


def test_shinchan_semantic_baseline_main_door_front_vector(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc front candidate baseline is stable enough for camera work."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)
    candidates = summary.front_direction_candidates
    main = summary.main_door_candidate

    assert len(summary.door_candidates) == summary.categories["DOOR"].count
    assert len(candidates) == summary.categories["DOOR"].count
    assert main is not None
    assert candidates[0] == main
    assert main.door_entity_id == 703
    assert main.nearest_footprint_side == "min_y"
    assert main.exterior_wall_near is True
    assert main.nearest_wall_entity_id == 691
    assert main.nearest_wall_distance == pytest.approx(0.0)
    np.testing.assert_allclose(main.front_vector, (0.0, -1.0, 0.0))
    assert np.linalg.norm(np.asarray(main.front_vector)) == pytest.approx(1.0)
    assert main.score > 0.0


def test_front_direction_candidates_are_sorted_by_score(
    ifc4_fixture: Path,
) -> None:
    """Front candidates should remain score-descending with main door first."""
    candidates = extract_ifc_semantic_summary(ifc4_fixture).front_direction_candidates
    scores = [candidate.score for candidate in candidates]

    assert candidates
    assert scores == sorted(scores, reverse=True)


def test_ifc_semantic_summary_to_dict_is_manifest_ready(
    ifc4_fixture: Path,
) -> None:
    """The summary dict should be stable enough to embed in debug manifests."""
    payload = extract_ifc_semantic_summary(ifc4_fixture).to_dict()

    assert payload["sourceIfcPath"] == str(ifc4_fixture)
    assert payload["categories"]["FLOOR"]["count"] == 1
    assert payload["categories"]["ROOF"]["count"] >= 1
    assert payload["lowestFloor"]["category"] == "FLOOR"
    assert payload["highestRoof"]["category"] == "ROOF"
    assert payload["lowestFloor"]["bounds"]["zMax"] < payload["highestRoof"]["bounds"]["zMin"]
    assert len(payload["doorCandidates"]) >= 1
    assert all(door["category"] == "DOOR" for door in payload["doorCandidates"])
    assert len(payload["frontDirectionCandidates"]) >= 1
    assert payload["mainDoorCandidate"]["doorEntityId"] in {
        candidate["doorEntityId"]
        for candidate in payload["frontDirectionCandidates"]
    }
    assert payload["mainDoorCandidate"]["nearestFootprintSide"] in {
        "min_x",
        "max_x",
        "min_y",
        "max_y",
    }
    assert len(payload["mainDoorCandidate"]["frontVector"]) == 3
    assert payload["mainDoorCandidate"]["frontVector"][2] == 0.0
    assert payload["elements"][0]["bounds"]["zMin"] is not None


def test_build_front_direction_candidates_prefers_exterior_door() -> None:
    """Door near footprint edge and exterior wall should become front candidate."""
    floor = _semantic_element(
        "FLOOR",
        1,
        "IfcSlab",
        "FLOOR",
        (0.0, 0.0, 0.0),
        (10.0, 10.0, 0.2),
    )
    front_wall = _semantic_element(
        "WALL",
        2,
        "IfcWall",
        None,
        (0.0, -0.1, 0.0),
        (10.0, 0.2, 3.0),
    )
    back_wall = _semantic_element(
        "WALL",
        3,
        "IfcWall",
        None,
        (0.0, 9.8, 0.0),
        (10.0, 10.1, 3.0),
    )
    exterior_door = _semantic_element(
        "DOOR",
        4,
        "IfcDoor",
        None,
        (4.5, 0.0, 0.0),
        (5.5, 0.25, 2.2),
        name="main door",
    )
    interior_door = _semantic_element(
        "DOOR",
        5,
        "IfcDoor",
        None,
        (1.0, 5.0, 0.0),
        (2.0, 5.2, 2.0),
        name="interior door",
    )

    candidates = build_front_direction_candidates(
        [floor, front_wall, back_wall, exterior_door, interior_door]
    )

    assert candidates[0].door_entity_id == 4
    assert candidates[0].nearest_footprint_side == "min_y"
    assert candidates[0].front_vector == (0.0, -1.0, 0.0)
    assert candidates[0].exterior_wall_near is True
    assert candidates[0].nearest_wall_entity_id == 2


def test_is_reliable_main_door_candidate_accepts_shinchan_main_door(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc main door should be reliable enough for semantic camera work."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    assert is_reliable_main_door_candidate(summary.main_door_candidate) is True


def test_is_reliable_main_door_candidate_rejects_none() -> None:
    """Missing main door should keep static camera fallback enabled."""
    assert is_reliable_main_door_candidate(None) is False


@pytest.mark.parametrize(
    "overrides",
    [
        {"exterior_wall_near": False},
        {"nearest_footprint_side": "unknown"},
        {"score": 0.0},
        {"front_vector": (0.0, -0.5, 0.0)},
        {"front_vector": (0.0, -1.0, 0.1)},
        {"front_vector": (0.0, float("nan"), 0.0)},
    ],
)
def test_is_reliable_main_door_candidate_rejects_unreliable_candidates(
    overrides: dict[str, object],
) -> None:
    """Unclear door candidates should fall back to static view cameras."""
    candidate = replace(_front_candidate(), **overrides)

    assert is_reliable_main_door_candidate(candidate) is False


def test_diagnose_projection_vertical_inversion_flags_floor_above_roof(
    ifc4_fixture: Path,
) -> None:
    """Floor below roof in IFC but above roof on screen is suspicious."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    diagnostics = diagnose_projection_vertical_inversion(
        summary,
        {
            "FLOOR": IfcSemanticScreenMaskStats(
                category="FLOOR",
                pixel_count=100,
                y_min=30,
                y_max=100,
                image_height=448,
            ),
            "ROOF": IfcSemanticScreenMaskStats(
                category="ROOF",
                pixel_count=100,
                y_min=260,
                y_max=340,
                image_height=448,
            ),
        },
    )

    assert diagnostics.vertical_inversion_suspected is True
    assert diagnostics.floor_below_roof_in_world is True
    assert diagnostics.floor_above_roof_on_screen is True
    assert diagnostics.floor_screen_region == "top"
    assert diagnostics.roof_screen_region == "bottom"
    assert diagnostics.projection_vertical_inversion_suspected is True
    assert diagnostics.to_dict()["projectionVerticalInversionSuspected"] is True
    assert diagnostics.to_dict()["verticalInversionSuspected"] is True


def test_diagnose_projection_vertical_inversion_accepts_floor_below_roof_on_screen(
    ifc4_fixture: Path,
) -> None:
    """Floor below roof in both IFC and screen space should not be suspicious."""
    summary = extract_ifc_semantic_summary(ifc4_fixture)

    diagnostics = diagnose_projection_vertical_inversion(
        summary,
        {
            "FLOOR": IfcSemanticScreenMaskStats(
                category="FLOOR",
                pixel_count=100,
                y_min=300,
                y_max=360,
                image_height=448,
            ),
            "ROOF": IfcSemanticScreenMaskStats(
                category="ROOF",
                pixel_count=100,
                y_min=30,
                y_max=100,
                image_height=448,
            ),
        },
    )

    assert diagnostics.vertical_inversion_suspected is False
    assert diagnostics.floor_below_roof_in_world is True
    assert diagnostics.floor_above_roof_on_screen is False
    assert diagnostics.projection_vertical_inversion_suspected is False
    assert diagnostics.to_dict()["projectionVerticalInversionSuspected"] is False
    assert diagnostics.floor_screen_region == "bottom"
    assert diagnostics.roof_screen_region == "top"


def _semantic_element(
    category: str,
    entity_id: int,
    ifc_type: str,
    predefined_type: str | None,
    min_xyz: tuple[float, float, float],
    max_xyz: tuple[float, float, float],
    *,
    name: str | None = None,
) -> IfcSemanticElement:
    center_xyz = tuple(
        (min_value + max_value) / 2
        for min_value, max_value in zip(min_xyz, max_xyz, strict=True)
    )
    return IfcSemanticElement(
        category=category,
        entity_id=entity_id,
        ifc_type=ifc_type,
        predefined_type=predefined_type,
        name=name,
        vertex_count=8,
        face_count=12,
        bounds=IfcSemanticBounds(
            min_xyz=min_xyz,
            max_xyz=max_xyz,
            center_xyz=center_xyz,
        ),
    )


def _build_coverage_result(
    *,
    window_visible: int,
    window_hit: int,
    door_visible: int = 200,
    door_hit: int = 200,
    floor_visible: int = 0,
    floor_hit: int = 0,
    floor_warning: str | None = None,
) -> IfcElementMaskRenderResult:
    coverage: dict[str, IfcElementMaskCoverage] = {
        "FLOOR": IfcElementMaskCoverage(
            category="FLOOR",
            visible_pixel_count=floor_visible,
            category_hit_count=floor_hit,
            visible_to_hit_ratio=1.0 if floor_hit == 0 else floor_visible / floor_hit,
            warning=floor_warning,
        ),
        "ROOF": IfcElementMaskCoverage(
            category="ROOF",
            visible_pixel_count=1000,
            category_hit_count=1000,
            visible_to_hit_ratio=1.0,
            warning=None,
        ),
        "WALL": IfcElementMaskCoverage(
            category="WALL",
            visible_pixel_count=2000,
            category_hit_count=2000,
            visible_to_hit_ratio=1.0,
            warning=None,
        ),
        "WINDOW": IfcElementMaskCoverage(
            category="WINDOW",
            visible_pixel_count=window_visible,
            category_hit_count=window_hit,
            visible_to_hit_ratio=(
                1.0 if window_hit == 0 else window_visible / window_hit
            ),
            warning=(
                "coverage_below_threshold"
                if window_hit > 0
                and (
                    window_visible / window_hit < 0.5
                    or window_visible < 50
                )
                else None
            ),
        ),
        "DOOR": IfcElementMaskCoverage(
            category="DOOR",
            visible_pixel_count=door_visible,
            category_hit_count=door_hit,
            visible_to_hit_ratio=(
                1.0 if door_hit == 0 else door_visible / door_hit
            ),
            warning=(
                "coverage_below_threshold"
                if door_hit > 0
                and (door_visible / door_hit < 0.5 or door_visible < 50)
                else None
            ),
        ),
    }
    return IfcElementMaskRenderResult(
        masks={
            category: Image.new("L", (1, 1), 0)
            for category in coverage
        },
        composite=Image.new("RGB", (1, 1), "black"),
        coverage=coverage,
    )


def test_summarize_coverage_warnings_returns_only_categories_with_warning() -> None:
    """warning이 None인 카테고리는 요약 결과에서 빠져야 한다."""
    result = _build_coverage_result(
        window_visible=10, window_hit=1000,  # ratio 0.01 -> warning
        door_visible=200, door_hit=200,       # OK
        floor_warning="missing_mesh",
    )

    warnings = summarize_coverage_warnings(result)

    assert warnings == {
        "FLOOR": "missing_mesh",
        "WINDOW": "coverage_below_threshold",
    }


def test_has_critical_coverage_warning_true_when_window_dropouts() -> None:
    """WINDOW가 epsilon dropout으로 거의 사라지면 critical signal이 떠야 한다."""
    result = _build_coverage_result(
        window_visible=5, window_hit=900,  # ratio 0.005
        door_visible=200, door_hit=200,
    )

    assert has_critical_coverage_warning(result) is True


def test_has_critical_coverage_warning_false_when_key_categories_pass() -> None:
    """WINDOW/DOOR coverage가 충분하면 missing_mesh가 다른 카테고리에 있어도 critical 아님."""
    result = _build_coverage_result(
        window_visible=300, window_hit=300,
        door_visible=200, door_hit=200,
        floor_warning="missing_mesh",  # not in key categories
    )

    assert has_critical_coverage_warning(result) is False


def test_has_critical_coverage_warning_respects_custom_categories() -> None:
    """caller가 지정한 카테고리에서만 critical 여부를 판단해야 한다."""
    result = _build_coverage_result(
        window_visible=5, window_hit=900,  # WINDOW warning
        door_visible=200, door_hit=200,
        floor_warning=None,
    )

    assert has_critical_coverage_warning(result, categories=("DOOR",)) is False
    assert has_critical_coverage_warning(result, categories=("WINDOW",)) is True


def test_render_ifc_element_masks_populates_coverage_for_shinchan(
    ifc4_fixture: Path,
) -> None:
    """shinchan fixture render는 모든 카테고리의 coverage info를 채워야 한다."""
    geometry = _load_debug_geometry(ifc4_fixture)
    payload = _build_debug_view_payload(
        geometry=geometry,
        internal_view=IFCView.FRONT_DIAGONAL_LEFT,
    )
    camera = payload["camera"]
    assert isinstance(camera, dict)

    result = render_ifc_element_masks(
        ifc4_fixture,
        eye=camera["eye"],
        look_at=camera["lookAt"],
        up=camera["up"],
        width=768,
        height=448,
    )

    assert set(result.coverage.keys()) == set(SUPPORTED_SEMANTIC_CATEGORIES)
    for category, cov in result.coverage.items():
        assert cov.category == category
        assert cov.visible_pixel_count >= 0
        assert cov.category_hit_count >= 0
        assert 0.0 <= cov.visible_to_hit_ratio <= 1.0


def _front_candidate() -> IfcFrontDirectionCandidate:
    return IfcFrontDirectionCandidate(
        door_entity_id=4,
        door_name="main door",
        door_center=(5.0, 0.0, 1.0),
        nearest_footprint_side="min_y",
        distance_to_footprint_edge=0.0,
        exterior_wall_near=True,
        nearest_wall_entity_id=2,
        nearest_wall_distance=0.0,
        front_vector=(0.0, -1.0, 0.0),
        score=10.0,
    )


def _build_coverage_result(
    *,
    window_visible: int,
    window_hit: int,
    door_visible: int = 200,
    door_hit: int = 200,
    floor_warning: str | None = None,
) -> IfcElementMaskRenderResult:
    coverage: dict[str, IfcElementMaskCoverage] = {
        "FLOOR": IfcElementMaskCoverage(
            category="FLOOR",
            visible_pixel_count=0,
            category_hit_count=0,
            visible_to_hit_ratio=1.0,
            warning=floor_warning,
        ),
        "ROOF": IfcElementMaskCoverage(
            category="ROOF",
            visible_pixel_count=1000,
            category_hit_count=1000,
            visible_to_hit_ratio=1.0,
            warning=None,
        ),
        "WALL": IfcElementMaskCoverage(
            category="WALL",
            visible_pixel_count=2000,
            category_hit_count=2000,
            visible_to_hit_ratio=1.0,
            warning=None,
        ),
        "WINDOW": IfcElementMaskCoverage(
            category="WINDOW",
            visible_pixel_count=window_visible,
            category_hit_count=window_hit,
            visible_to_hit_ratio=(
                1.0 if window_hit == 0 else window_visible / window_hit
            ),
            warning=(
                "coverage_below_threshold"
                if window_hit > 0
                and (window_visible / window_hit < 0.5 or window_visible < 50)
                else None
            ),
        ),
        "DOOR": IfcElementMaskCoverage(
            category="DOOR",
            visible_pixel_count=door_visible,
            category_hit_count=door_hit,
            visible_to_hit_ratio=(
                1.0 if door_hit == 0 else door_visible / door_hit
            ),
            warning=(
                "coverage_below_threshold"
                if door_hit > 0
                and (door_visible / door_hit < 0.5 or door_visible < 50)
                else None
            ),
        ),
    }
    return IfcElementMaskRenderResult(
        masks={
            category: Image.new("L", (1, 1), 0)
            for category in coverage
        },
        composite=Image.new("RGB", (1, 1), "black"),
        coverage=coverage,
    )


def test_summarize_coverage_warnings_returns_only_categories_with_warning() -> None:
    """warning이 None인 카테고리는 요약 결과에서 빠져야 한다."""
    result = _build_coverage_result(
        window_visible=10, window_hit=1000,
        door_visible=200, door_hit=200,
        floor_warning="missing_mesh",
    )

    warnings = summarize_coverage_warnings(result)

    assert warnings == {
        "FLOOR": "missing_mesh",
        "WINDOW": "coverage_below_threshold",
    }


def test_has_critical_coverage_warning_true_when_window_dropouts() -> None:
    """WINDOW가 epsilon dropout으로 거의 사라지면 critical signal이 떠야 한다."""
    result = _build_coverage_result(
        window_visible=5, window_hit=900,
        door_visible=200, door_hit=200,
    )

    assert has_critical_coverage_warning(result) is True


def test_has_critical_coverage_warning_false_when_key_categories_pass() -> None:
    """WINDOW/DOOR coverage가 충분하면 missing_mesh가 다른 카테고리에 있어도 critical 아님."""
    result = _build_coverage_result(
        window_visible=300, window_hit=300,
        door_visible=200, door_hit=200,
        floor_warning="missing_mesh",
    )

    assert has_critical_coverage_warning(result) is False


def test_has_critical_coverage_warning_respects_custom_categories() -> None:
    """caller가 지정한 카테고리에서만 critical 여부를 판단해야 한다."""
    result = _build_coverage_result(
        window_visible=5, window_hit=900,
        door_visible=200, door_hit=200,
        floor_warning=None,
    )

    assert has_critical_coverage_warning(result, categories=("DOOR",)) is False
    assert has_critical_coverage_warning(result, categories=("WINDOW",)) is True


def test_render_ifc_element_masks_populates_coverage_for_shinchan(
    ifc4_fixture: Path,
) -> None:
    """shinchan fixture render는 모든 카테고리의 coverage info를 채워야 한다."""
    geometry = _load_debug_geometry(ifc4_fixture)
    payload = _build_debug_view_payload(
        geometry=geometry,
        internal_view=IFCView.FRONT_DIAGONAL_LEFT,
    )
    camera = payload["camera"]
    assert isinstance(camera, dict)

    result = render_ifc_element_masks(
        ifc4_fixture,
        eye=camera["eye"],
        look_at=camera["lookAt"],
        up=camera["up"],
        width=768,
        height=448,
    )

    assert set(result.coverage.keys()) == set(SUPPORTED_SEMANTIC_CATEGORIES)
    for category, cov in result.coverage.items():
        assert cov.category == category
        assert cov.visible_pixel_count >= 0
        assert cov.category_hit_count >= 0
        assert 0.0 <= cov.visible_to_hit_ratio <= 1.0
