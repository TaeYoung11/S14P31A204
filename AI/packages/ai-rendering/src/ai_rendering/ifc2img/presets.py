"""ifc2img 스타일 프리셋 (scandinavian / industrial / japanese).

img2img 프리셋과 *값을 복제* — 코드 import는 하지 않는다.
복제 정책:
  - prompt / negative_prompt: 동일 (스타일 정의는 conditioning 무관)
  - guidance_scale=7, num_inference_steps=25: 동일
  - controlnet_conditioning_scale=0.7: depth-적절 시작값 (Canny=0.3과 다름)
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
"""시간대(낮/밤) prompt suffix — Phase 4 (2026-04-29).

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
    "sky background, only sky, floating in air, suspended in air, "
    "plaster, stucco, vinyl siding, cladding panels, render coating"
)
"""Phase 5 옵션 CCC (2026-05-03) — sky/floating 차단 phrase 4개 추가.

검수 보고: eye 배경 전체가 하늘/구름, front/side 집이 허공에 떠 있음.
phrase 위치: water 차단 다음 + 소재 차단 앞 — negative 토큰 한계로 truncate 시
sky/floating은 보존, 소재는 끝쪽이라 truncate 시 positive `concrete/brick`이 대체.
`hovering building` 같은 일반 명사 단독 phrase는 C-1 폐기 학습으로 *집 자체* 약화
위험 → 수식어 동반 phrase만 채택.
"""


_PRESETS: dict[str, DepthStyleParams] = {
    "scandinavian": DepthStyleParams(
        prompt=(
            "RAW photo, scandinavian modern house exterior at ground level, "
            "white concrete facade, large panoramic windows, flat roof, "
            "clean minimal architecture, nordic design, "
            "8k uhd, DSLR, sharp focus, architectural photography, "
            "no floor below ground"
        ),
        negative_prompt=(
            f"{_NEGATIVE_BASE}, dark moody"
        ),
        guidance_scale=7.0,
        num_inference_steps=25,
        controlnet_conditioning_scale=1.15,
        seed=7,
    ),
    "korean_villa": DepthStyleParams(
        prompt=(
            "RAW photo, korean residential villa exterior at ground level, "
            "brick facade with concrete trim, ceramic tile roof, "
            "small balconies, modern korean street view, "
            "8k uhd, DSLR, sharp focus, architectural photography, "
            "no floor below ground"
        ),
        negative_prompt=(
            f"{_NEGATIVE_BASE}, rural, cottage, log cabin"
        ),
        guidance_scale=7.0,
        num_inference_steps=25,
        controlnet_conditioning_scale=1.15,
        seed=7,
    ),
    "korean_house": DepthStyleParams(
        prompt=(
            "RAW photo, korean modern detached house exterior at ground level, "
            "concrete walls with brick accent, tiled roof, "
            "suburban korean neighborhood, "
            "8k uhd, DSLR, sharp focus, architectural photography, "
            "no floor below ground"
        ),
        negative_prompt=(
            f"{_NEGATIVE_BASE}, rural, log cabin, japanese style"
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
