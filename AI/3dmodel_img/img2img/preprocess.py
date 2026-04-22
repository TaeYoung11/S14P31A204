"""Image preprocessing for SD img2img.

Plan:
    ImageInput       — Union[Path, str, PIL.Image, bytes]. 4 accepted input types
                       so the backend can hand us whatever it has without us
                       forcing a filesystem roundtrip.
    load_image()     — normalize any ImageInput to an RGB PIL.Image.
                       Raises InvalidInputError on missing file, undecodable
                       bytes, or an unsupported type.
    resize_for_sd()  — scale so max(w, h) == DEFAULT_LONG_SIDE (768) with both
                       dims % 8 == 0 (SD UNet requirement). LANCZOS downsample.

Consumed by pipeline.Img2ImgRenderer.render(). Kept dependency-light (PIL only,
no torch) so tests can exercise it on CI without CUDA.
"""

from __future__ import annotations

from pathlib import Path
from typing import Union

from PIL import Image

from .config import DEFAULT_LONG_SIDE

ImageInput = Union[Path, str, Image.Image, bytes]


def load_image(source: ImageInput) -> Image.Image:
    """Coerce `source` to an RGB PIL.Image.

    Accepts Path, str, PIL.Image, or raw PNG/JPEG bytes.
    Raises InvalidInputError on missing file, undecodable bytes, or bad type.
    """
    raise NotImplementedError("MR1: fill in after skeleton review")


def resize_for_sd(image: Image.Image, long_side: int = DEFAULT_LONG_SIDE) -> Image.Image:
    """Scale `image` so max(w, h) == long_side with both dims a multiple of 8."""
    raise NotImplementedError("MR1: fill in after skeleton review")
