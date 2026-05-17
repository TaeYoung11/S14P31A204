"""SDXL soft-lock img2img renderer for Phase H-2.

Same soft-lock principle as the SD 1.5 path in soft_lock.py:
- init image = F-2 IFC-locked baseline (IFC color blocks)
- depth ControlNet (SDXL) for silhouette / mass
- low img2img strength so init colors persist
- prompt = region-aware naming visible IFC categories

SDXL is much larger than SD 1.5, so the renderer enables VAE slicing and
attention slicing by default, and can fall back to sequential CPU offload
when VRAM is tight.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from .exceptions import IFCRenderError

DEFAULT_SDXL_BASE_ID = "stabilityai/stable-diffusion-xl-base-1.0"
DEFAULT_SDXL_PHOTOREAL_ID = "RunDiffusion/Juggernaut-XL-v9"
DEFAULT_SDXL_VAE_FP16_FIX_ID = "madebyollin/sdxl-vae-fp16-fix"
DEFAULT_SDXL_DEPTH_CONTROLNET_ID = "diffusers/controlnet-depth-sdxl-1.0"


@dataclass
class SdxlSoftLockRenderParams:
    prompt: str
    negative_prompt: str = ""
    strength: float = 0.55
    guidance_scale: float = 6.0
    num_inference_steps: int = 30
    depth_conditioning_scale: float = 0.6
    seed: int | None = 42


@dataclass
class SdxlSoftLockRenderResult:
    image: Image.Image
    params: SdxlSoftLockRenderParams
    output_size: tuple[int, int]

    def save(self, path: Path | str) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.image.save(path, format="PNG")
        return path


class SdxlSoftLockDiffusionRenderer:
    """SDXL img2img + ControlNet-depth renderer for soft-lock IFC fidelity."""

    def __init__(
        self,
        model_id: str = DEFAULT_SDXL_PHOTOREAL_ID,
        depth_controlnet_id: str = DEFAULT_SDXL_DEPTH_CONTROLNET_ID,
        vae_id: str | None = DEFAULT_SDXL_VAE_FP16_FIX_ID,
        device: str | None = None,
        dtype: object = None,
        cpu_offload: bool = False,
    ) -> None:
        import torch as _torch
        from diffusers import (
            AutoencoderKL,
            ControlNetModel,
            DPMSolverMultistepScheduler,
            StableDiffusionXLControlNetImg2ImgPipeline,
        )

        if device is None:
            device = "cuda" if _torch.cuda.is_available() else "cpu"
        if dtype is None:
            is_cuda = _torch.device(device).type == "cuda"
            dtype = _torch.float16 if is_cuda else _torch.float32

        try:
            depth_cn = ControlNetModel.from_pretrained(
                depth_controlnet_id, torch_dtype=dtype
            )
        except Exception as exc:
            raise IFCRenderError(
                f"SDXL depth ControlNet load failed ({depth_controlnet_id}): {exc}"
            ) from exc

        vae = None
        if vae_id is not None:
            try:
                vae = AutoencoderKL.from_pretrained(vae_id, torch_dtype=dtype)
            except Exception as exc:
                raise IFCRenderError(
                    f"SDXL VAE load failed ({vae_id}): {exc}"
                ) from exc

        pipeline_kwargs: dict[str, object] = {
            "controlnet": depth_cn,
            "torch_dtype": dtype,
        }
        if vae is not None:
            pipeline_kwargs["vae"] = vae

        try:
            pipe = StableDiffusionXLControlNetImg2ImgPipeline.from_pretrained(
                model_id, **pipeline_kwargs
            )
        except Exception as exc:
            raise IFCRenderError(
                f"SDXL pipeline load failed ({model_id}): {exc}"
            ) from exc

        try:
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                pipe.scheduler.config,
                use_karras_sigmas=True,
                algorithm_type="dpmsolver++",
            )
        except Exception as exc:
            raise IFCRenderError(f"Scheduler setup failed: {exc}") from exc

        if device.startswith("cuda"):
            try:
                pipe.vae.enable_slicing()
                pipe.enable_attention_slicing()
            except Exception:
                pass

        if cpu_offload and device.startswith("cuda"):
            try:
                pipe.enable_model_cpu_offload()
            except Exception:
                pipe.to(device)
        else:
            try:
                pipe.to(device)
            except Exception as exc:
                raise IFCRenderError(
                    f"Device move failed ({device}): {exc}"
                ) from exc

        self.model_id = model_id
        self.depth_controlnet_id = depth_controlnet_id
        self.vae_id = vae_id
        self.device = device
        self.dtype = dtype
        self.cpu_offload = cpu_offload
        self.pipe = pipe
        self._torch = _torch

    def render(
        self,
        *,
        init_image: Image.Image,
        depth_image: Image.Image,
        params: SdxlSoftLockRenderParams,
        width: int = 1024,
        height: int = 640,
    ) -> SdxlSoftLockRenderResult:
        width = max(int(width) - int(width) % 8, 64)
        height = max(int(height) - int(height) % 8, 64)
        target_size = (width, height)
        init_rgb = init_image.convert("RGB").resize(target_size, Image.Resampling.LANCZOS)
        depth_rgb = depth_image.convert("RGB").resize(target_size, Image.Resampling.NEAREST)
        if params.seed is None:
            generator = None
        else:
            generator = self._torch.Generator(device=self.device).manual_seed(params.seed)
        try:
            out = self.pipe(
                prompt=params.prompt,
                negative_prompt=params.negative_prompt,
                image=init_rgb,
                control_image=depth_rgb,
                strength=float(params.strength),
                guidance_scale=float(params.guidance_scale),
                num_inference_steps=int(params.num_inference_steps),
                controlnet_conditioning_scale=float(params.depth_conditioning_scale),
                generator=generator,
            )
            image = out.images[0]
        except Exception as exc:
            raise IFCRenderError(f"SDXL img2img render failed: {exc}") from exc
        return SdxlSoftLockRenderResult(
            image=image, params=params, output_size=image.size
        )
