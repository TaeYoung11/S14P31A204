"""ifc2img style preset의 등록, 로딩, prompt 정책을 검증한다.

이 테스트 파일은 depth-to-style 단계에서 사용하는 `ifc2img.presets` 전용 테스트다.
단순히 preset 이름이 로드되는지만 보는 것이 아니라, Realistic Vision 기반 실험 중 정한
compact prompt, flat ground prior, negative prompt 예산, 소재 whitelist가 유지되는지도 함께
확인한다. prompt 문구는 이미지 품질에 직접 영향을 주므로 작은 변경도 회귀로 이어질 수 있다.
"""

import pytest

from ai_rendering.ifc2img import (
    DepthStyleParams,
    IFCRenderError,
    list_presets,
    load_preset,
)


def test_list_presets_returns_three() -> None:
    """production에서 쓰는 세 preset만 안정적인 정렬 순서로 노출되는지 확인한다."""
    assert list_presets() == ["korean_house", "korean_villa", "scandinavian"]


def test_load_preset_returns_depth_style_params() -> None:
    """preset 로딩 결과가 depth style renderer에 바로 넘길 수 있는 params인지 확인한다."""
    p = load_preset("scandinavian")

    assert isinstance(p, DepthStyleParams)
    assert "scandinavian" in p.prompt.lower()
    assert p.negative_prompt


def test_load_unknown_preset_raises() -> None:
    """등록되지 않은 preset 이름은 조용한 fallback 없이 명확한 렌더 오류로 알려야 한다."""
    with pytest.raises(IFCRenderError, match="알 수 없는 프리셋"):
        load_preset("nonexistent_style")


def test_each_preset_has_required_fields() -> None:
    """모든 preset이 렌더링에 필요한 prompt와 sampling/control 값을 갖는지 확인한다."""
    for name in list_presets():
        p = load_preset(name)
        assert p.prompt.strip()
        assert p.negative_prompt.strip()
        assert p.guidance_scale > 0
        assert p.num_inference_steps > 0
        assert 0.0 <= p.controlnet_conditioning_scale <= 2.0


def test_load_preset_returns_independent_copy() -> None:
    """로드된 preset params를 수정해도 원본 registry나 다음 호출 결과가 오염되지 않아야 한다."""
    a = load_preset("scandinavian")
    b = load_preset("scandinavian")

    assert a is not b
    a.guidance_scale = 99.0
    assert b.guidance_scale != 99.0


def test_no_strength_field_on_params() -> None:
    """depth 기반 txt2img 경로에서는 img2img 전용 strength 필드가 없어야 한다."""
    from dataclasses import fields

    field_names = {f.name for f in fields(DepthStyleParams)}
    assert "strength" not in field_names
    assert "controlnet_conditioning_scale" in field_names


# --- time_of_day variant: day/night suffix 정책 ---


def test_load_preset_day_appends_day_suffix() -> None:
    """day variant가 실외 주간 cue를 prompt 뒤에 추가하는지 확인한다."""
    p = load_preset("scandinavian", "day")
    assert "during sunny daytime" in p.prompt
    assert "natural sunlight" in p.prompt
    assert "blue sky" in p.prompt
    assert "realistic soft shadows" in p.prompt


def test_load_preset_night_appends_night_suffix() -> None:
    """night variant가 기본 preset 정체성은 유지하면서 야간 cue만 추가하는지 확인한다."""
    p = load_preset("korean_villa", "night")
    assert "night exterior" in p.prompt
    assert "dark sky" in p.prompt
    assert "warm window lights" in p.prompt
    assert "soft exterior lights" in p.prompt
    assert "no overexposure" in p.prompt
    assert "outdoor daylight" not in p.prompt
    assert "daytime" in p.negative_prompt
    assert "blue sky" in p.negative_prompt
    assert "overexposed lights" in p.negative_prompt
    assert "minimal Korean house" in p.prompt


def test_load_preset_night_prompt_stays_compact_for_clip() -> None:
    """Night prompt should leave room for view prefixes before CLIP truncation."""
    p = load_preset("korean_house", "night")
    prompt_words = len(p.prompt.replace(",", " ").split())

    assert prompt_words <= 45


def test_korean_villa_prompt_uses_compact_flat_ground_prior() -> None:
    """korean_villa prompt가 하단 층/옹벽 환각을 줄이는 compact prior를 유지하는지 확인한다."""
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
    """scandinavian prompt가 CLIP 예산 안에서 핵심 facade와 ground prior를 유지하는지 확인한다."""
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
    """korean_house prompt가 주택 prior는 살리되 하단 벽 환각은 억제하는지 확인한다."""
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
    """time_of_day을 생략하면 기존 호출 호환성을 위해 day variant와 같은 prompt를 반환해야 한다."""
    p_default = load_preset("scandinavian")
    p_day = load_preset("scandinavian", "day")

    assert p_default.prompt == p_day.prompt


def test_load_preset_invalid_time_raises() -> None:
    """day/night 외 time_of_day 값은 잘못된 preset 옵션으로 보고 렌더 오류를 발생시킨다."""
    with pytest.raises(IFCRenderError, match="알 수 없는 time_of_day"):
        load_preset("scandinavian", "noon")
    with pytest.raises(IFCRenderError, match="알 수 없는 time_of_day"):
        load_preset("korean_house", "")


# --- 7 소재 whitelist와 forbidden material cue 검증 ---


def test_preset_prompts_use_only_whitelisted_materials() -> None:
    """preset prompt가 허용 소재 범위를 벗어나는 facade cue를 다시 끌어오지 않는지 확인한다.

    현재 허용 소재는 concrete, brick, steel, wood, glass, stone, tile 중심이다.
    `rendered`, `plaster`, `stucco` 같은 단어는 모델이 벽면을 두꺼운 하부 구조나
    다른 마감재로 해석하게 만들 수 있어 prompt에 다시 들어오지 않도록 막는다.
    """
    forbidden = (
        "rendered",
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


# sky/floating 관련 negative phrase는 현재 0에 가깝게 유지한다.
# text-side에서 강하게 억제하면 모델 prior가 과하게 눌릴 수 있어 필요한 경우에만 추가한다.
