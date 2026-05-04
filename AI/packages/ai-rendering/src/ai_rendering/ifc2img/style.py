"""Depth-to-style rendering with SD 1.5 + ControlNet-depth."""

from __future__ import annotations

from dataclasses import dataclass, replace as dc_replace
from pathlib import Path
from typing import TYPE_CHECKING

from PIL import Image

from .exceptions import IFCRenderError
from .views import IFCView, build_view_prompt

if TYPE_CHECKING:
    import torch


DEFAULT_MODEL_ID = "runwayml/stable-diffusion-v1-5"
DEFAULT_CONTROLNET_DEPTH_ID = "lllyasviel/sd-controlnet-depth"
FRONT_SIDE_NEGATIVE_TERMS = (
    "stone wall, retaining wall, raised foundation, pedestal, plinth, "
    "basement windows, stairs below facade, extra lower floor"
)


@dataclass
class DepthStyleParams:
    prompt: str
    negative_prompt: str = ""
    guidance_scale: float = 7.0
    num_inference_steps: int = 25
    controlnet_conditioning_scale: float = 0.7
    seed: int | None = None


@dataclass
class DepthStyleResult:
    image: Image.Image
    params: DepthStyleParams
    depth_size: tuple[int, int]
    output_size: tuple[int, int]

    def save(self, path: Path | str) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.image.save(path, format="PNG")
        return path


def _depth_to_control(depth: Image.Image) -> Image.Image:
    if depth.mode != "RGB":
        return depth.convert("RGB")
    return depth


def _append_negative_terms(base_negative: str, extra_negative: str) -> str:
    if not extra_negative:
        return base_negative
    if not base_negative:
        return extra_negative
    return f"{base_negative}, {extra_negative}"


class DepthStyleRenderer:
    """SD 1.5 + ControlNet-depth txt2img renderer."""

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        controlnet_model_id: str = DEFAULT_CONTROLNET_DEPTH_ID,
        device: str | None = None,
        dtype: torch.dtype | None = None,
        warmup: bool = True,
    ) -> None:
        import torch as _torch
        from diffusers import (
            ControlNetModel,
            DPMSolverMultistepScheduler,
            StableDiffusionControlNetPipeline,
        )

        if device is None:
            device = "cuda" if _torch.cuda.is_available() else "cpu"
        if dtype is None:
            is_cuda = _torch.device(device).type == "cuda"
            dtype = _torch.float16 if is_cuda else _torch.float32

        try:
            controlnet = ControlNetModel.from_pretrained(
                controlnet_model_id,
                torch_dtype=dtype,
            )
        except Exception as exc:
            raise IFCRenderError(
                f"ControlNet load failed ({controlnet_model_id}): {exc}"
            ) from exc

        try:
            pipe = StableDiffusionControlNetPipeline.from_pretrained(
                model_id,
                controlnet=controlnet,
                torch_dtype=dtype,
                safety_checker=None,
                requires_safety_checker=False,
            )
        except Exception as exc:
            raise IFCRenderError(f"SD model load failed ({model_id}): {exc}") from exc

        try:
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                pipe.scheduler.config,
                use_karras_sigmas=True,
                algorithm_type="dpmsolver++",
            )
        except Exception as exc:
            raise IFCRenderError(f"Scheduler setup failed: {exc}") from exc

        try:
            pipe.to(device)
        except Exception as exc:
            raise IFCRenderError(f"Device move failed ({device}): {exc}") from exc

        self.model_id = model_id
        self.controlnet_model_id = controlnet_model_id
        self.device = device
        self.dtype = dtype
        self.pipe = pipe
        self._torch = _torch

        if warmup:
            self._warmup()

    def _warmup(self) -> None:
        dummy = Image.new("RGB", (768, 448), (128, 128, 128))
        try:
            self.pipe(
                prompt="warmup",
                image=dummy,
                num_inference_steps=2,
                guidance_scale=1.0,
                controlnet_conditioning_scale=0.5,
                width=768,
                height=448,
            )
        except Exception as exc:
            raise IFCRenderError(f"Warmup failed: {exc}") from exc

    def render(
        self,
        depth_image: Image.Image,
        params: DepthStyleParams,
        view: IFCView | None = None,
    ) -> DepthStyleResult:
        depth_size = depth_image.size
        control = _depth_to_control(depth_image)
        width, height = control.size

        if view is not None:
            prompt = build_view_prompt(params.prompt, view)
            applied_params = dc_replace(params, prompt=prompt)
        else:
            prompt = params.prompt
            applied_params = params
        negative_prompt = params.negative_prompt
        if view in {IFCView.FRONT, IFCView.SIDE}:
            negative_prompt = _append_negative_terms(
                negative_prompt,
                FRONT_SIDE_NEGATIVE_TERMS,
            )

        try:
            if params.seed is None:
                generator = None
            else:
                generator = self._torch.Generator(device=self.device).manual_seed(
                    params.seed
                )
            out = self.pipe(
                prompt=prompt,
                image=control,
                negative_prompt=negative_prompt,
                guidance_scale=params.guidance_scale,
                num_inference_steps=params.num_inference_steps,
                controlnet_conditioning_scale=params.controlnet_conditioning_scale,
                width=width,
                height=height,
                generator=generator,
            )
            image = out.images[0]
        except Exception as exc:
            raise IFCRenderError(f"Render failed: {exc}") from exc

        return DepthStyleResult(
            image=image,
            params=applied_params,
            depth_size=depth_size,
            output_size=image.size,
        )
