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
    """등록된 프리셋이 정확히 scandinavian/industrial/japanese 3개 + 정렬됨."""
    assert list_presets() == ["industrial", "japanese", "scandinavian"]


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
