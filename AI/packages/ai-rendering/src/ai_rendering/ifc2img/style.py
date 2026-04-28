"""ifc2img 전용 SD 1.5 + ControlNet-depth 스타일 변환 스택.

depth map (PIL.Image, mode="L") → 스타일 변환 PIL.Image.

설계 원칙:
- img2img 모듈에서 어떤 코드도 import하지 않는다 (병렬 모듈, 폐기 시 영향 차단).
- diffusers/torch 는 __init__ 시점에만 import (모듈 import만으로 GPU 점유 안 함).
- txt2img + ControlNet 사용 — ifc2img에는 init 이미지가 없고 depth가 조건일 뿐.
  StableDiffusionControlNetPipeline (img2img 변형 아님). 따라서 strength 파라미터는 없다.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from PIL import Image

from .exceptions import IFCRenderError
from .views import (
    IFCView,
    build_view_negative_prompt,
    build_view_prompt,
    resolve_view_cn_scale,
)

if TYPE_CHECKING:
    import torch


DEFAULT_MODEL_ID = "runwayml/stable-diffusion-v1-5"
DEFAULT_CONTROLNET_DEPTH_ID = "lllyasviel/sd-controlnet-depth"


@dataclass
class DepthStyleParams:
    """depth → 스타일 변환 하이퍼파라미터.

    img2img의 RenderParams와 비교: strength 제거 (txt2img는 init 이미지 없음).
    """

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
        """결과 이미지 PNG 저장. 부모 디렉토리 자동 생성."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.image.save(path, format="PNG")
        return path


def _depth_to_control(depth: Image.Image) -> Image.Image:
    """depth (mode='L') → 3채널 RGB. ControlNet 입력은 3채널을 기대한다."""
    if depth.mode != "RGB":
        return depth.convert("RGB")
    return depth


class DepthStyleRenderer:
    """SD 1.5 + ControlNet-depth (txt2img). 한 번 로드 후 여러 번 렌더."""

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
        except Exception as e:
            raise IFCRenderError(
                f"ControlNet 로드 실패 ({controlnet_model_id}): {e}"
            ) from e

        try:
            pipe = StableDiffusionControlNetPipeline.from_pretrained(
                model_id,
                controlnet=controlnet,
                torch_dtype=dtype,
                safety_checker=None,
                requires_safety_checker=False,
            )
        except Exception as e:
            raise IFCRenderError(f"SD 모델 로드 실패 ({model_id}): {e}") from e

        try:
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                pipe.scheduler.config,
                use_karras_sigmas=True,
                algorithm_type="dpmsolver++",
            )
        except Exception as e:
            raise IFCRenderError(f"스케줄러 교체 실패: {e}") from e

        try:
            pipe.to(device)
        except Exception as e:
            raise IFCRenderError(f"파이프라인 device 이동 실패 ({device}): {e}") from e

        self.model_id = model_id
        self.controlnet_model_id = controlnet_model_id
        self.device = device
        self.dtype = dtype
        self.pipe = pipe
        self._torch = _torch

        if warmup:
            self._warmup()

    def _warmup(self) -> None:
        """더미 depth로 2-step 추론 → 커널 캐시 예열."""
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
        except Exception as e:
            raise IFCRenderError(f"warmup 실패: {e}") from e

    def render(
        self,
        depth_image: Image.Image,
        params: DepthStyleParams,
        view: IFCView | None = None,
    ) -> DepthStyleResult:
        """depth PIL 1장 + prompt → 스타일 변환 PIL 1장 (1회 추론).

        Args:
            depth_image: mode="L" 또는 "RGB". 내부에서 3채널로 변환됨.
            params: prompt + 하이퍼파라미터
            view: 옵션 B-1 — view 전달 시 VIEW_PROMPT_SUFFIXES로 자동 환경 suffix 합성.
                None이면 params.prompt 그대로 사용 (backward compat).
        """
        depth_size = depth_image.size  # (W, H)
        control = _depth_to_control(depth_image)
        width, height = control.size
        if view is not None:
            prompt = build_view_prompt(params.prompt, view)
            negative_prompt = build_view_negative_prompt(params.negative_prompt, view)
            cn_scale = resolve_view_cn_scale(
                params.controlnet_conditioning_scale, view
            )
        else:
            prompt = params.prompt
            negative_prompt = params.negative_prompt
            cn_scale = params.controlnet_conditioning_scale

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
                controlnet_conditioning_scale=cn_scale,
                width=width,
                height=height,
                generator=generator,
            )
            image = out.images[0]
        except Exception as e:
            raise IFCRenderError(f"스타일 변환 실패: {e}") from e

        return DepthStyleResult(
            image=image,
            params=params,
            depth_size=depth_size,
            output_size=image.size,
        )
