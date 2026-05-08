"""ifc2img 스타일 프리셋 (scandinavian / korean_villa / korean_house).

img2img 프리셋과 *값을 복제* — 코드 import는 하지 않는다.
복제 정책:
  - prompt / negative_prompt: 동일 (스타일 정의는 conditioning 무관)
  - guidance_scale=7, num_inference_steps=25: 동일
  - controlnet_conditioning_scale=1.15: depth는 Canny(0.3)보다 강한 구속이 필요해
    수직 매스/추가 층 환각 차단을 위해 단계적으로 인상한 확정값.
  - strength: 제외 — txt2img + ControlNet에는 init 이미지가 없으므로 적용 불가

신규 변형(예: scandinavian_warm)을 추가하려면 이 모듈에 직접 항목을 더한다.
prompts 다양화가 잦아질 때만 YAML 분리를 검토.
"""

from __future__ import annotations

from dataclasses import replace as dc_replace

from .exceptions import IFCRenderError
from .style import DepthStyleParams

_TIME_SUFFIXES: dict[str, str] = {
    "day": "during sunny daytime, natural sunlight, blue sky",
    "night": "at night, evening scene, warm interior lights, dramatic night lighting",
}
"""시간대(낮/밤) prompt suffix.

`load_preset(name, time_of_day)`이 base prompt 끝에 합성. preset 자체는 *소재 +
스타일*만 책임 — 시간대는 호출 시점 결정. day/night 외 값은 IFCRenderError.
"""


_NEGATIVE_BASE = (
    "(worst quality, low quality:1.4), (deformed, distorted:1.3), "
    "(cgi, 3d, render, blender:1.4), cartoon, anime, illustration, "
    "text, watermark, signature, "
    "interior, indoor, furniture, "
    "basement, underground, "
    "lower level, walkout basement, additional floor below, sunken story, "
    "water, lake, pond, swimming pool, river, "
    "plaster, stucco, vinyl siding, cladding panels, render coating"
)


_PRESETS: dict[str, DepthStyleParams] = {
    "scandinavian": DepthStyleParams(
        prompt=(
            "RAW photo, outdoor daylight, white concrete facade, "
            "large windows, flat roof, minimal Scandinavian house, "
            "flat ground touches facade, no lower floor, no foreground wall"
        ),
        negative_prompt=(
            "low quality, cgi, render, cartoon, text, watermark, interior, "
            "basement, extra floor, stone wall, retaining wall, foreground wall, "
            "raised platform, podium, balcony, dark moody"
        ),
        guidance_scale=7.0,
        num_inference_steps=25,
        controlnet_conditioning_scale=1.15,
        seed=7,
    ),
    "korean_villa": DepthStyleParams(
        prompt=(
            "RAW photo, outdoor daylight, white concrete facade, "
            "open flat paved ground in front, minimal Korean house, "
            "subtle brick trim, simple tile roof, ground touches facade, "
            "no balcony, no foreground wall"
        ),
        negative_prompt=(
            "low quality, cgi, render, interior, basement, extra floor, "
            "stone wall, retaining wall, fence, raised platform, podium, "
            "piloti, balcony, shopfront, blue wall, black facade, wood cladding"
        ),
        guidance_scale=7.0,
        num_inference_steps=25,
        controlnet_conditioning_scale=1.15,
        seed=7,
    ),
    "korean_house": DepthStyleParams(
        prompt=(
            "RAW photo, outdoor daylight, white concrete facade, "
            "open flat paved ground in front, simple Korean house, "
            "simple tile roof, subtle brick trim, ground touches facade, "
            "no balcony, no foreground wall"
        ),
        negative_prompt=(
            "low quality, cgi, render, interior, basement, extra floor, "
            "stone wall, brick wall, concrete wall, retaining wall, "
            "foreground wall, fence, raised platform, podium, piloti, "
            "balcony, shopfront, blue wall, black facade, wood cladding"
        ),
        guidance_scale=7.0,
        num_inference_steps=25,
        controlnet_conditioning_scale=1.15,
        seed=7,
    ),
}


def list_presets() -> list[str]:
    """등록된 프리셋 이름 정렬 리스트."""
    return sorted(_PRESETS.keys())


def load_preset(name: str, time_of_day: str = "day") -> DepthStyleParams:
    """프리셋 이름 + 시간대 → DepthStyleParams 사본.

    Args:
        name: 등록된 preset 이름 (`list_presets()` 참조).
        time_of_day: "day" 또는 "night". preset prompt 끝에 시간대 suffix 합성.
            default "day" — backward compat (기존 호출자 동작 보존).

    Raises:
        IFCRenderError: 알 수 없는 preset 이름 또는 day/night 외 time_of_day.

    Returns:
        새 DepthStyleParams 인스턴스 — 호출자가 수정해도 원본 안전.
    """
    if name not in _PRESETS:
        raise IFCRenderError(
            f"알 수 없는 프리셋: '{name}'. 사용 가능: {list_presets()}"
        )
    if time_of_day not in _TIME_SUFFIXES:
        raise IFCRenderError(
            f"알 수 없는 time_of_day: '{time_of_day}'. "
            f"사용 가능: {sorted(_TIME_SUFFIXES.keys())}"
        )
    base = _PRESETS[name]
    suffix = _TIME_SUFFIXES[time_of_day]
    return dc_replace(base, prompt=f"{base.prompt}, {suffix}")
