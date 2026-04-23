"""img2img 메인 추론 파이프라인.

구성:
    RenderParams (dataclass)
        호출자용 하이퍼파라미터. 기본값은 config.py 에서 가져오므로 MR3의
        튜닝 후에도 한 파일만 고치면 됨.
        필드: prompt, negative_prompt, strength, guidance_scale,
              num_inference_steps, seed.

    RenderResult (dataclass)
        결과 래퍼. image (PIL), params, input_size, output_size 보관.
        .save(path) 는 PNG 저장 + 부모 디렉토리 자동 생성.

    Img2ImgRenderer
        load-once / render-many 패턴. SD 1.5 + DPM++ 2M Karras,
        CUDA면 fp16, CPU면 fp32. safety_checker 비활성 (건축 렌더에서
        트리거될 일 없음 + VRAM 절약).

        __init__(model_id, device, dtype, warmup)
            - from_pretrained → 스케줄러 교체 → .to(device) → 선택적 warmup
        _warmup()
            - 실제 추론 해상도 정사각 더미 2-step 추론으로 커널 캐시 예열
        render(source, params) -> RenderResult
            - load_image → resize_for_sd → self.pipe(...) → RenderResult
            - seed가 있으면 torch.Generator 로 고정, 없으면 None (랜덤)
            - diffusers 쪽 실패는 모두 RenderError 로 래핑

MR2 에서 render_with_presets(source, preset_names, **overrides) 추가.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

from PIL import Image

if TYPE_CHECKING:
    import torch

from .config import (
    DEFAULT_GUIDANCE_SCALE,
    DEFAULT_LONG_SIDE,
    DEFAULT_MODEL_ID,
    DEFAULT_NEGATIVE,
    DEFAULT_NUM_INFERENCE_STEPS,
    DEFAULT_STRENGTH,
)
from .exceptions import RenderError
from .preprocess import ImageInput, load_image, resize_for_sd


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
        """결과 이미지를 PNG 로 저장. 부모 디렉토리 없으면 생성."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.image.save(path, format="PNG")
        return path


class Img2ImgRenderer:
    """SD img2img 래퍼. 한 번 로드 후 여러 번 렌더."""

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        device: Optional[str] = None,
        dtype: Optional[torch.dtype] = None,
        warmup: bool = True,
    ):
        # diffusers / torch 지연 임포트: 모듈 임포트만으로 CUDA 로딩되지 않도록.
        import torch
        from diffusers import (
            DPMSolverMultistepScheduler,
            StableDiffusionImg2ImgPipeline,
        )

        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        if dtype is None:
            # "cuda:0" / torch.device("cuda") 같은 지정도 cuda 로 인식되도록 정규화.
            is_cuda = torch.device(device).type == "cuda"
            dtype = torch.float16 if is_cuda else torch.float32

        try:
            pipe = StableDiffusionImg2ImgPipeline.from_pretrained(  # type: ignore[no-untyped-call]
                model_id,
                torch_dtype=dtype,
                safety_checker=None,
                requires_safety_checker=False,
            )
        except Exception as e:
            raise RenderError(f"failed to load model {model_id}: {e}") from e

        try:
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(  # type: ignore[no-untyped-call]
                pipe.scheduler.config, use_karras_sigmas=True,
            )
        except Exception as e:
            raise RenderError(f"failed to swap scheduler: {e}") from e

        try:
            pipe.to(device)
        except Exception as e:
            raise RenderError(f"failed to move pipe to {device}: {e}") from e

        self.model_id = model_id
        self.device = device
        self.dtype = dtype
        self.pipe = pipe
        self._torch = torch

        if warmup:
            self._warmup()

    def _warmup(self) -> None:
        """실제 추론 해상도(DEFAULT_LONG_SIDE 정사각)로 더미 2-step 추론 → 커널 캐시 예열."""
        dummy = Image.new(
            "RGB",
            (DEFAULT_LONG_SIDE, DEFAULT_LONG_SIDE),
            (128, 128, 128),
        )
        try:
            self.pipe(
                prompt="warmup",
                image=dummy,
                num_inference_steps=2,
                strength=0.5,
                guidance_scale=1.0,
            )
        except Exception as e:
            raise RenderError(f"warmup failed: {e}") from e

    def render(self, source: ImageInput, params: RenderParams) -> RenderResult:
        """`source` 파일 경로 (Path 또는 str) 에서 img2img 1회 추론.

        diffusers 쪽 실패는 RenderError 로 래핑.
        InvalidInputError (파일 문제) 는 load_image 에서 그대로 전파.
        """
        pil = load_image(source)
        input_size = pil.size
        prepared = resize_for_sd(pil)

        try:
            if params.seed is None:
                generator = None
            else:
                generator = self._torch.Generator(device=self.device).manual_seed(
                    params.seed
                )
            out = self.pipe(
                prompt=params.prompt,
                image=prepared,
                negative_prompt=params.negative_prompt,
                strength=params.strength,
                guidance_scale=params.guidance_scale,
                num_inference_steps=params.num_inference_steps,
                generator=generator,
            )
            image = out.images[0]
        except Exception as e:
            raise RenderError(f"render failed: {e}") from e

        return RenderResult(
            image=image,
            params=params,
            input_size=input_size,
            output_size=image.size,
        )

    def render_with_presets(
        self,
        source: ImageInput,
        preset_names: list[str],
        **overrides: Any,
    ) -> dict[str, RenderResult]:
        """각 프리셋마다 render() 독립 호출. dict[preset_name → RenderResult] 반환.

        **overrides 는 모든 프리셋에 공통 적용 (예: seed=42 재현성, strength=0.6 튜닝).
        첫 실패에서 즉시 예외 전파 — 부분 결과 보장 없음.
        """
        from .presets import load_preset  # 순환 임포트 회피용 지연 임포트

        results: dict[str, RenderResult] = {}
        for name in preset_names:
            params = load_preset(name)
            if overrides:
                params = replace(params, **overrides)
            results[name] = self.render(source, params)
        return results
