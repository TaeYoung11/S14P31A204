"""img2img — SD img2img module for BATANG 3D viewer captures.

Public API:
    Img2ImgRenderer      — plain img2img, load-once / render-many
                           (.render / .render_with_presets)
    ControlNetRenderer   — ControlNet Canny + img2img, 동일 render() 인터페이스
                           control_image 자동 생성 (extract_canny 내부 호출)
    RenderParams         — dataclass for prompt + hyperparams
                           (controlnet_conditioning_scale 포함)
    RenderResult         — dataclass wrapping output image + metadata
    RenderError          — base rendering exception
    InvalidInputError    — bad input coercion
    PresetNotFoundError  — preset load failure (file / YAML / schema)
    load_preset(name)    — preset YAML → RenderParams
    list_presets()       — list available preset names
"""

from .exceptions import InvalidInputError, PresetNotFoundError, RenderError
from .pipeline import ControlNetRenderer, Img2ImgRenderer, RenderParams, RenderResult
from .presets import list_presets, load_preset

__all__ = [
    "Img2ImgRenderer",
    "ControlNetRenderer",
    "RenderParams",
    "RenderResult",
    "RenderError",
    "InvalidInputError",
    "PresetNotFoundError",
    "load_preset",
    "list_presets",
]
