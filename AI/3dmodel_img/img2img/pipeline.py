"""Main img2img inference pipeline.

Plan:
    RenderParams (dataclass)
        Caller-facing hyperparameters. Defaults pull from config.py so MR3's
        post-sweep tuning only has to touch one file.
        Fields: prompt, negative_prompt, strength, guidance_scale,
                num_inference_steps, seed.

    RenderResult (dataclass)
        Output wrapper: image (PIL), params, input_size, output_size.
        .save(path) writes PNG, creating parent dirs.

    Img2ImgRenderer
        Load-once / render-many. SD 1.5 + DPM++ 2M Karras, fp16 on CUDA, fp32
        on CPU. Safety checker disabled (architectural renders never trip it,
        and it's a VRAM tax).

        __init__(model_id, device, dtype, warmup)
            - from_pretrained → swap scheduler → .to(device)
            - optional warmup to pre-compile CUDA kernels

        _warmup()
            - 2-step pass on a 64x64 gray dummy image

        render(source, params) -> RenderResult
            - load_image → resize_for_sd → self.pipe(...) → wrap
            - seed → torch.Generator(device=...).manual_seed(seed)
            - any diffusers failure → raise RenderError

MR2 extends with render_with_presets(source, preset_names, **overrides).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PIL import Image

from .config import (
    DEFAULT_GUIDANCE_SCALE,
    DEFAULT_MODEL_ID,
    DEFAULT_NEGATIVE,
    DEFAULT_NUM_INFERENCE_STEPS,
    DEFAULT_STRENGTH,
)
from .preprocess import ImageInput


@dataclass
class RenderParams:
    prompt: str
    negative_prompt: str = DEFAULT_NEGATIVE
    strength: float = DEFAULT_STRENGTH
    guidance_scale: float = DEFAULT_GUIDANCE_SCALE
    num_inference_steps: int = DEFAULT_NUM_INFERENCE_STEPS
    seed: Optional[int] = None


@dataclass
class RenderResult:
    image: Image.Image
    params: RenderParams
    input_size: tuple[int, int]
    output_size: tuple[int, int]

    def save(self, path: Path | str) -> Path:
        """Write image to disk as PNG. Creates parent dirs."""
        raise NotImplementedError("MR1")


class Img2ImgRenderer:
    """One-shot SD img2img wrapper. Load once, render many."""

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        device: Optional[str] = None,
        dtype=None,
        warmup: bool = True,
    ):
        raise NotImplementedError("MR1")

    def _warmup(self) -> None:
        """2-step pass on a 64x64 gray dummy to pre-compile kernels."""
        raise NotImplementedError("MR1")

    def render(self, source: ImageInput, params: RenderParams) -> RenderResult:
        """Run img2img on `source` with `params`. Returns RenderResult."""
        raise NotImplementedError("MR1")
