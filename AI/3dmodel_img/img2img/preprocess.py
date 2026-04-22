"""SD img2img용 이미지 전처리 모듈.

구성:
    ImageInput       — Union[Path, str, PIL.Image, bytes]. 4가지 입력 타입을
                       받아서 백엔드가 파일시스템을 거치지 않아도 되도록 함.
    load_image()     — 어떤 ImageInput이든 RGB PIL.Image로 정규화.
                       파일 없음, 디코드 실패, 미지원 타입은 InvalidInputError.
    resize_for_sd()  — max(w, h) == DEFAULT_LONG_SIDE (768) 이 되도록 스케일링,
                       양변 모두 8의 배수로 스냅 (SD UNet 요건). LANCZOS 다운샘플.

pipeline.Img2ImgRenderer.render() 에서 사용. torch 의존 없이 PIL만 사용하므로
CUDA 없는 CI에서도 테스트 가능하도록 유지.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Union

from PIL import Image, ImageOps, UnidentifiedImageError

from .config import DEFAULT_LONG_SIDE
from .exceptions import InvalidInputError

ImageInput = Union[Path, str, Image.Image, bytes]


def load_image(source: ImageInput) -> Image.Image:
    """`source` 를 RGB PIL.Image 로 변환.

    Path, str, PIL.Image, 또는 PNG/JPEG 원시 bytes 를 허용.
    파일이 없거나, 바이트 디코드 실패, 미지원 타입이면 InvalidInputError 발생.
    """
    if isinstance(source, Image.Image):
        img = source
    elif isinstance(source, bytes):
        try:
            img = Image.open(io.BytesIO(source))
            img.load()
        except (UnidentifiedImageError, OSError) as e:
            raise InvalidInputError(f"cannot decode bytes: {e}") from e
    elif isinstance(source, (str, Path)):
        path = Path(source)
        if not path.exists():
            raise InvalidInputError(f"file not found: {path}")
        try:
            img = Image.open(path)
            img.load()
        except (UnidentifiedImageError, OSError) as e:
            raise InvalidInputError(f"cannot decode file {path}: {e}") from e
    else:
        raise InvalidInputError(
            f"unsupported input type: {type(source).__name__}"
        )

    img = ImageOps.exif_transpose(img)
    return img.convert("RGB")


def resize_for_sd(image: Image.Image, long_side: int = DEFAULT_LONG_SIDE) -> Image.Image:
    """`image` 를 max(w, h) == long_side 로 스케일링, 양변을 8의 배수로 스냅."""
    w, h = image.size
    scale = long_side / max(w, h)
    new_w = max(8, (round(w * scale) // 8) * 8)
    new_h = max(8, (round(h * scale) // 8) * 8)
    if (new_w, new_h) == (w, h):
        return image
    return image.resize((new_w, new_h), Image.LANCZOS)
