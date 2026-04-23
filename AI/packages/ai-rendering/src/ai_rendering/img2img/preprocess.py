"""SD img2img용 이미지 전처리 모듈.

구성:
    ImageInput       — Union[Path, str]. 파일 경로만 허용.
    load_image()     — 파일 경로를 RGB PIL.Image 로 정규화.
                       파일 없음, 디코드 실패, 미지원 타입은 InvalidInputError.
    resize_for_sd()  — max(w, h) == DEFAULT_LONG_SIDE (768) 이 되도록 스케일링,
                       양변 모두 8의 배수로 스냅 (SD UNet 요건). LANCZOS 다운샘플.

pipeline.Img2ImgRenderer.render() 에서 사용. torch 의존 없이 PIL만 사용하므로
CUDA 없는 CI에서도 테스트 가능하도록 유지.
"""

from __future__ import annotations

from pathlib import Path
from typing import Union

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
