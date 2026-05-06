"""ifc2img/presets.py 테스트 — 프리셋 등록/로드/오류/독립성.

img2img/presets.py와 별개 모듈. 파일명도 충돌 회피를 위해 test_ifc2img_presets.py.
"""

import pytest

from ai_rendering.ifc2img import (
    DepthStyleParams,
    IFCRenderError,
    list_presets,
    load_preset,
)


def test_list_presets_returns_three() -> None:
    """등록된 프리셋이 정확히 scandinavian/korean_villa/korean_house 3개 + 정렬됨."""
    assert list_presets() == ["korean_house", "korean_villa", "scandinavian"]


def test_load_preset_returns_depth_style_params() -> None:
    """load_preset은 DepthStyleParams 인스턴스 반환, prompt 비어있지 않음."""
    p = load_preset("scandinavian")

    assert isinstance(p, DepthStyleParams)
    assert "scandinavian" in p.prompt.lower()
    assert p.negative_prompt  # 비어있지 않음


def test_load_unknown_preset_raises() -> None:
    """알 수 없는 이름 → IFCRenderError, 메시지에 사용 가능 목록 포함."""
    with pytest.raises(IFCRenderError, match="알 수 없는 프리셋"):
        load_preset("nonexistent_style")


def test_each_preset_has_required_fields() -> None:
    """3개 프리셋 모두 필수 필드(prompt/cn_scale/guidance/steps)가 채워져 있다."""
    for name in list_presets():
        p = load_preset(name)
        assert p.prompt.strip()
        assert p.negative_prompt.strip()
        assert p.guidance_scale > 0
        assert p.num_inference_steps > 0
        assert 0.0 <= p.controlnet_conditioning_scale <= 2.0


def test_load_preset_returns_independent_copy() -> None:
    """같은 이름 두 번 호출 시 별도 인스턴스 — 호출자 수정이 원본에 누출되지 않는다."""
    a = load_preset("scandinavian")
    b = load_preset("scandinavian")

    assert a is not b
    a.guidance_scale = 99.0
    assert b.guidance_scale != 99.0


def test_no_strength_field_on_params() -> None:
    """txt2img 결정 — DepthStyleParams에는 strength 필드가 없다 (img2img와 차별점)."""
    from dataclasses import fields

    field_names = {f.name for f in fields(DepthStyleParams)}
    assert "strength" not in field_names
    assert "controlnet_conditioning_scale" in field_names


# --- time_of_day variant (day/night) ---


def test_load_preset_day_appends_day_suffix() -> None:
    """load_preset(name, "day") prompt 끝에 day suffix가 합성됨."""
    p = load_preset("scandinavian", "day")
    assert "during sunny daytime" in p.prompt
    assert "natural sunlight" in p.prompt


def test_load_preset_night_appends_night_suffix() -> None:
    """load_preset(name, "night") prompt 끝에 night suffix가 합성됨."""
    p = load_preset("korean_villa", "night")
    assert "at night" in p.prompt
    assert "warm interior lights" in p.prompt
    # 동시에 base prompt 단어 보존
    assert "minimal Korean house" in p.prompt


def test_korean_villa_prompt_uses_compact_flat_ground_prior() -> None:
    """korean_villa prompt should avoid lower-floor/retaining-wall priors."""
    p = load_preset("korean_villa")
    prompt = p.prompt.lower()
    negative = p.negative_prompt.lower()

    assert prompt.startswith("raw photo, outdoor daylight")
    assert "white concrete facade" in prompt
    assert "open flat paved ground in front" in prompt
    assert "ground touches facade" in prompt
    assert "subtle brick trim" in prompt
    assert "simple tile roof" in prompt
    assert "small balconies" not in prompt
    assert "street view" not in prompt
    assert "stone wall" in negative
    assert "retaining wall" in negative
    assert "piloti" in negative
    assert "blue wall" in negative
    assert "black facade" in negative
    assert "wood cladding" in negative


def test_scandinavian_prompt_uses_compact_flat_ground_prior() -> None:
    """scandinavian should stay under budget while keeping Nordic facade cues."""
    p = load_preset("scandinavian")
    prompt = p.prompt.lower()
    negative = p.negative_prompt.lower()
    prompt_words = len(prompt.replace(",", " ").split())
    negative_words = len(negative.replace(",", " ").split())

    assert prompt.startswith("raw photo, outdoor daylight")
    assert prompt_words <= 35
    assert negative_words <= 30
    assert "white concrete facade" in prompt
    assert "large windows" in prompt
    assert "flat roof" in prompt
    assert "minimal scandinavian house" in prompt
    assert "flat ground touches facade" in prompt
    assert "no lower floor" in prompt
    assert "no foreground wall" in prompt
    assert "8k uhd" not in prompt
    assert "dslr" not in prompt
    assert "architectural photography" not in prompt
    assert "stone wall" in negative
    assert "retaining wall" in negative
    assert "foreground wall" in negative
    assert "raised platform" in negative
    assert "dark moody" in negative


def test_korean_house_prompt_uses_compact_flat_ground_prior() -> None:
    """korean_house should avoid neighborhood/brick-wall retaining priors."""
    p = load_preset("korean_house")
    prompt = p.prompt.lower()
    negative = p.negative_prompt.lower()
    prompt_words = len(prompt.replace(",", " ").split())
    negative_words = len(negative.replace(",", " ").split())

    assert prompt.startswith("raw photo, outdoor daylight")
    assert prompt_words <= 40
    assert negative_words <= 35
    assert "white concrete facade" in prompt
    assert "open flat paved ground in front" in prompt
    assert "simple korean house" in prompt
    assert "simple tile roof" in prompt
    assert "subtle brick trim" in prompt
    assert "ground touches facade" in prompt
    assert "suburban korean neighborhood" not in prompt
    assert "8k uhd" not in prompt
    assert "dslr" not in prompt
    assert "architectural photography" not in prompt
    assert "stone wall" in negative
    assert "brick wall" in negative
    assert "concrete wall" in negative
    assert "retaining wall" in negative
    assert "foreground wall" in negative
    assert "piloti" in negative
    assert "blue wall" in negative
    assert "black facade" in negative
    assert "wood cladding" in negative


def test_load_preset_default_time_is_day() -> None:
    """load_preset(name) — time_of_day default "day" → day suffix 합성 (backward compat)."""
    p_default = load_preset("scandinavian")
    p_day = load_preset("scandinavian", "day")

    assert p_default.prompt == p_day.prompt


def test_load_preset_invalid_time_raises() -> None:
    """day/night 외 time_of_day → IFCRenderError, 메시지에 사용 가능 목록 포함."""
    with pytest.raises(IFCRenderError, match="알 수 없는 time_of_day"):
        load_preset("scandinavian", "noon")
    with pytest.raises(IFCRenderError, match="알 수 없는 time_of_day"):
        load_preset("korean_house", "")


# --- 7 소재 화이트리스트 검증 ---


def test_preset_prompts_use_only_whitelisted_materials() -> None:
    """preset prompt에 비허용 소재 단어가 부재.

    7 소재 화이트리스트: concrete / brick / steel / wood / glass / stone / tile.
    비허용 대표 단어가 prompt에 들어가면 회귀 — 화이트리스트 외 소재 합성 위험.
    """
    forbidden = (
        "rendered",       # 일반 facade 단어 — concrete/brick 등 화이트리스트로 대체
        "plaster",
        "stucco",
        "vinyl siding",
        "render coating",
    )
    for name in list_presets():
        prompt = load_preset(name).prompt.lower()
        for word in forbidden:
            assert word.lower() not in prompt, (
                f"preset {name!r} prompt should not contain {word!r}: {prompt!r}"
            )


# sky/floating negative phrase 시도 폐기 — 효과 0, text-side 처방은 SD prior를
# 못 이긴다는 학습.
