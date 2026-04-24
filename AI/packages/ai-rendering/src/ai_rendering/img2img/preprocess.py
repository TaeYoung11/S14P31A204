"""SD img2img용 이미지 전처리 모듈.

구성:
    ImageInput       — Union[Path, str]. 파일 경로만 허용.
    load_image()     — 파일 경로를 RGB PIL.Image 로 정규화.
                       파일 없음, 디코드 실패, 미지원 타입은 InvalidInputError.
    resize_for_sd()  — max(w, h) == DEFAULT_LONG_SIDE (768) 이 되도록 스케일링,
                       양변 모두 8의 배수로 스냅 (SD UNet 요건). LANCZOS 다운샘플.
    extract_canny()  — PIL RGB 이미지를 Canny 엣지맵(RGB)으로 변환.
                       ControlNet Canny의 control_image 입력용.
                       opencv-python 필요 (torch 불필요).

pipeline.Img2ImgRenderer.render() 에서 사용. torch 의존 없이 PIL만 사용하므로
CUDA 없는 CI에서도 테스트 가능하도록 유지.
"""

from __future__ import annotations

from pathlib import Path
from typing import Union

import numpy as np
from PIL import Image, UnidentifiedImageError

from .config import DEFAULT_LONG_SIDE
from .exceptions import InvalidInputError

ImageInput = Union[Path, str]


def load_image(source: ImageInput) -> Image.Image:
    """`source` 파일 경로를 RGB PIL.Image 로 변환.

    Path 또는 str 만 허용. 파일이 없거나 디코드 실패 시 InvalidInputError.
    """
    if not isinstance(source, (str, Path)):
        raise InvalidInputError(
            f"unsupported input type: {type(source).__name__}"
        )
    path = Path(source)
    if not path.exists():
        raise InvalidInputError(f"file not found: {path}")
    try:
        img = Image.open(path)
        img.load()
    except (UnidentifiedImageError, OSError) as e:
        raise InvalidInputError(f"cannot decode file {path}: {e}") from e
    return img.convert("RGB")


def resize_for_sd(image: Image.Image, long_side: int = DEFAULT_LONG_SIDE) -> Image.Image:
    """`image` 를 max(w, h) == long_side 로 스케일링, 양변을 8의 배수로 스냅."""
    w, h = image.size
    scale = long_side / max(w, h)
    new_w = max(8, (round(w * scale) // 8) * 8)
    new_h = max(8, (round(h * scale) // 8) * 8)
    if (new_w, new_h) == (w, h):
        return image
    return image.resize((new_w, new_h), Image.Resampling.LANCZOS)


def extract_canny(
    image: Image.Image,
    low_threshold: int = 100,
    high_threshold: int = 200,
) -> Image.Image:
    """PIL RGB 이미지 → Canny 엣지맵 RGB PIL.Image.

    ControlNet Canny의 control_image 입력 형식(RGB, 흰 엣지/검정 배경)으로 반환.
    `image` 는 resize_for_sd() 적용 후 SD 입력과 동일 해상도여야 함.
    """
    import cv2  # type: ignore[import-untyped]

    gray = np.array(image.convert("L"))
    edges = cv2.Canny(gray, low_threshold, high_threshold)
    edges_rgb = np.stack([edges, edges, edges], axis=-1)
    return Image.fromarray(edges_rgb)
