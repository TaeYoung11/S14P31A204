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

_NEGATIVE_BASE = (
    "(worst quality, low quality:1.4), (deformed, distorted:1.3), "
    "(cgi, 3d, render, blender:1.4), cartoon, anime, illustration, "
    "text, watermark, signature, "
    "interior, indoor, furniture, "
    "basement, underground, "
    "lower level, walkout basement, additional floor below, sunken story"
)


_PRESETS: dict[str, DepthStyleParams] = {
    "scandinavian": DepthStyleParams(
        prompt=(
            "RAW photo, scandinavian modern house exterior at ground level, "
            "white rendered facade, large panoramic windows, flat roof, "
            "clean minimal architecture, 8k uhd, DSLR, sharp focus, "
            "architectural photography, bright natural daylight, nordic design, "
            "ground floor visible, building stands on flat ground, "
            "no floor below ground, single ground floor only"
        ),
        negative_prompt=(
            f"{_NEGATIVE_BASE}, dark moody, industrial concrete"
        ),
        guidance_scale=7.0,
        num_inference_steps=25,
        controlnet_conditioning_scale=1.15,
        seed=7,
    ),
    "industrial": DepthStyleParams(
        prompt=(
            "RAW photo, industrial modern building exterior, "
            "exposed raw concrete walls, steel beams, large glass facade, "
            "urban architecture, 8k uhd, DSLR, sharp focus, "
            "architectural photography, overcast urban daylight, contemporary industrial design"
        ),
        negative_prompt=(
            f"{_NEGATIVE_BASE}, wood siding, cottage, rustic, traditional"
        ),
        guidance_scale=7.0,
        num_inference_steps=25,
        controlnet_conditioning_scale=1.15,
        seed=7,
    ),
    "japanese": DepthStyleParams(
        prompt=(
            "RAW photo, japanese modern house exterior, "
            "dark charcoal wood cladding, low sloped tiled roof, "
            "sliding wooden shoji screens, wabi-sabi minimalism, "
            "8k uhd, DSLR, sharp focus, "
            "architectural photography, soft diffused daylight, zen design"
        ),
        negative_prompt=(
            f"{_NEGATIVE_BASE}, western facade, brick wall, exposed concrete, steel beam"
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


def load_preset(name: str) -> DepthStyleParams:
    """프리셋 이름 → DepthStyleParams 사본.

    매번 새 인스턴스를 반환해 호출자가 수정해도 원본 안전.
    """
    if name not in _PRESETS:
        raise IFCRenderError(
            f"알 수 없는 프리셋: '{name}'. 사용 가능: {list_presets()}"
        )
    return dc_replace(_PRESETS[name])
