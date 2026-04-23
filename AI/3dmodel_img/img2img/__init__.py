"""img2img — SD img2img module for BATANG 3D viewer captures.

Public API (MR1):
    Img2ImgRenderer    — main class, one-call inference
    RenderParams       — dataclass for prompt + hyperparams
    RenderResult       — dataclass wrapping output image + metadata
    RenderError        — base rendering exception
    InvalidInputError  — bad input coercion

MR2 adds: render_with_presets(), PresetNotFoundError.
MR3 adds: tuned defaults in config.py + README.
"""

from .exceptions import InvalidInputError, RenderError
from .pipeline import Img2ImgRenderer, RenderParams, RenderResult

__all__ = [
    "Img2ImgRenderer",
    "RenderParams",
    "RenderResult",
    "RenderError",
    "InvalidInputError",
]
