"""ifc2img 전용 SD 1.5 + ControlNet-depth 스타일 변환 스택.

depth map (PIL.Image, mode="L") → 스타일 변환 PIL.Image.

설계 원칙:
- img2img 모듈에서 어떤 코드도 import하지 않는다 (병렬 모듈, 폐기 시 영향 차단).
- diffusers/torch 는 __init__ 시점에만 import (모듈 import만으로 GPU 점유 안 함).
- txt2img + ControlNet 사용 — ifc2img에는 init 이미지가 없고 depth가 조건일 뿐.
  StableDiffusionControlNetPipeline (img2img 변형 아님). 따라서 strength 파라미터는 없다.
"""

from __future__ import annotations

from dataclasses import dataclass, replace as dc_replace
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
from PIL import Image

from .exceptions import IFCRenderError
from .views import IFCView, build_view_prompt

if TYPE_CHECKING:
    import torch


DEFAULT_MODEL_ID = "runwayml/stable-diffusion-v1-5"
DEFAULT_CONTROLNET_DEPTH_ID = "lllyasviel/sd-controlnet-depth"
EYE_GROUND_SEGMENTATION_NEGATIVE = "pool, terrace, deck"
EYE_GROUND_ANCHOR_START_RATIO = 0.58
EYE_GROUND_HORIZON_BAND_RATIO = 0.06
EYE_GROUND_MASK_START_RATIO = 0.52
EYE_GROUND_MASK_EDGE_RISE_RATIO = 0.12


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


def _apply_eye_ground_anchor(control: Image.Image) -> Image.Image:
    """Fill lower empty background with muted ground cues for EYE views."""
    arr = np.asarray(control.convert("RGB"), dtype=np.uint8).copy()
    bg_mask = np.all(arr == 0, axis=2)
    height, _width = arr.shape[:2]
    start_y = int(height * EYE_GROUND_ANCHOR_START_RATIO)
    horizon_band = max(1, int(height * EYE_GROUND_HORIZON_BAND_RATIO))

    horizon_color = np.array([124, 124, 118], dtype=np.float32)
    ground_far = np.array([152, 148, 136], dtype=np.float32)
    ground_near = np.array([176, 168, 146], dtype=np.float32)

    for y in range(start_y, height):
        row_mask = bg_mask[y]
        if not np.any(row_mask):
            continue
        if y < start_y + horizon_band:
            color = horizon_color
        elif height - start_y <= 1:
            color = ground_near
        else:
            t = (y - start_y) / (height - start_y - 1)
            color = ground_far * (1.0 - t) + ground_near * t
        arr[y, row_mask] = color.astype(np.uint8)

    return Image.fromarray(arr, mode="RGB")


def _compute_eye_ground_line(bg_mask: np.ndarray) -> np.ndarray:
    """Estimate a perspective ground start line for EYE views."""
    height, width = bg_mask.shape
    geom_mask = ~bg_mask
    if not np.any(geom_mask):
        base_y = int(height * EYE_GROUND_MASK_START_RATIO)
        return np.full(width, base_y, dtype=np.int32)

    ys, xs = np.nonzero(geom_mask)
    left = int(xs.min())
    right = int(xs.max())
    center = (left + right) / 2.0
    half_span = max(1.0, (right - left) / 2.0)
    fallback_base = int(height * EYE_GROUND_MASK_START_RATIO)
    line = np.full(width, fallback_base, dtype=np.int32)

    bottom_by_x = np.full(width, -1, dtype=np.int32)
    for x in np.unique(xs):
        bottom_by_x[x] = int(ys[xs == x].max())

    support = bottom_by_x >= 0
    if np.any(support):
        support_bottoms = bottom_by_x[support]
        facade_base = int(np.percentile(support_bottoms, 70))
        facade_base = max(facade_base, fallback_base)
    else:
        facade_base = fallback_base

    edge_rise = max(1, int(height * EYE_GROUND_MASK_EDGE_RISE_RATIO))
    edge_y = min(height - 1, facade_base + edge_rise)

    for x in range(width):
        dx = abs(x - center) / half_span
        t = min(1.0, dx)
        curve = t * t
        line[x] = int(facade_base * (1.0 - curve) + edge_y * curve)

    return np.clip(line, 0, height - 1)


def _apply_eye_ground_segmentation(control: Image.Image) -> Image.Image:
    """Fill a perspective ground mask below the facade with textured ground cues."""
    arr = np.asarray(control.convert("RGB"), dtype=np.uint8).copy()
    bg_mask = np.all(arr == 0, axis=2)
    height, width = bg_mask.shape
    ground_line = _compute_eye_ground_line(bg_mask)

    xs = np.arange(width, dtype=np.float32)[None, :]
    ys = np.arange(height, dtype=np.float32)[:, None]
    line_2d = ground_line[None, :]
    ground_mask = bg_mask & (ys >= line_2d)
    if not np.any(ground_mask):
        return Image.fromarray(arr, mode="RGB")

    depth_ratio = np.clip(
        (ys - line_2d) / np.maximum(1.0, height - 1 - line_2d),
        0.0,
        1.0,
    )
    center_x = (width - 1) / 2.0
    lateral = np.abs(xs - center_x) / max(1.0, center_x)

    far_color = np.array([128, 126, 110], dtype=np.float32)
    near_color = np.array([154, 148, 118], dtype=np.float32)
    tint_color = np.array([118, 126, 104], dtype=np.float32)

    base = far_color[None, None, :] * (1.0 - depth_ratio[:, :, None])
    base += near_color[None, None, :] * depth_ratio[:, :, None]

    grass_mix = np.clip(0.35 - 0.2 * lateral + 0.25 * depth_ratio, 0.0, 0.45)
    base = base * (1.0 - grass_mix[:, :, None]) + tint_color[None, None, :] * (
        grass_mix[:, :, None]
    )

    x_wave = np.sin(xs / 13.0) + np.sin(xs / 29.0)
    y_wave = np.cos(ys / 11.0) + np.sin(ys / 23.0)
    texture = (x_wave + y_wave)[:, :, None] * 6.0
    grain = np.sin((xs * 0.31) + (ys * 0.17))[:, :, None] * 4.0
    textured = np.clip(base + texture + grain, 0.0, 255.0).astype(np.uint8)

    horizon_band = np.abs(ys - line_2d) <= 2.0
    horizon_color = np.array([120, 120, 112], dtype=np.uint8)
    textured[horizon_band] = horizon_color

    arr[ground_mask] = textured[ground_mask]
    return Image.fromarray(arr, mode="RGB")


def _append_negative_terms(base_negative: str, extra_negative: str) -> str:
    """Append short negative terms while preserving empty/base formatting."""
    if not extra_negative:
        return base_negative
    if not base_negative:
        return extra_negative
    return f"{base_negative}, {extra_negative}"


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
        use_eye_ground_anchor: bool = False,
        use_eye_ground_segmentation: bool = False,
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
        is_eye_view = view in {
            IFCView.EYE_NE,
            IFCView.EYE_NW,
            IFCView.EYE_SE,
        }
        if use_eye_ground_segmentation and is_eye_view:
            control = _apply_eye_ground_segmentation(control)
        elif use_eye_ground_anchor and is_eye_view:
            control = _apply_eye_ground_anchor(control)
        width, height = control.size
        if view is not None:
            prompt = build_view_prompt(params.prompt, view)
            # 실제 SD pipe에 전달된 prompt로 갱신된 params — result.params로 반환해
            # 호출자가 *어떤 view suffix가 합성됐는지* 추적 가능 (디버깅/로그/재현성).
            applied_params = dc_replace(params, prompt=prompt)
        else:
            prompt = params.prompt
            # view 미사용 — 합성 없음, identity 보존 (backward compat).
            applied_params = params
        negative_prompt = params.negative_prompt
        if use_eye_ground_segmentation and is_eye_view:
            negative_prompt = _append_negative_terms(
                negative_prompt,
                EYE_GROUND_SEGMENTATION_NEGATIVE,
            )
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
            params=applied_params,
            depth_size=depth_size,
            output_size=image.size,
        )
