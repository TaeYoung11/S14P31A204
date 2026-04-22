"""img2img — SD img2img module for BATANG 3D viewer captures.

Public API:
    Img2ImgRenderer      — main class, load-once / render-many
                           (.render / .render_with_presets)
    RenderParams         — dataclass for prompt + hyperparams
    RenderResult         — dataclass wrapping output image + metadata
    RenderError          — base rendering exception
    InvalidInputError    — bad input coercion
    PresetNotFoundError  — preset load failure (file / YAML / schema)
    load_preset(name)    — preset YAML → RenderParams
    list_presets()       — list available preset names

MR3 adds: tuned defaults in config.py + README.
"""

from .exceptions import InvalidInputError, PresetNotFoundError, RenderError
from .pipeline import Img2ImgRenderer, RenderParams, RenderResult
from .presets import list_presets, load_preset

__all__ = [
    "Img2ImgRenderer",
    "RenderParams",
    "RenderResult",
    "RenderError",
    "InvalidInputError",
    "PresetNotFoundError",
    "load_preset",
    "list_presets",
]
