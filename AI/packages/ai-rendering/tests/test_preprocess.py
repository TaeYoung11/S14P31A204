"""img2img 전처리 함수의 입력 처리, SD 해상도 보정, Canny 출력을 검증한다.

전처리 단계는 무거운 torch/GPU 의존성 없이 PIL과 OpenCV만으로 실행된다. 이 테스트는
이미지 로딩 오류를 명확히 보고하는지, Stable Diffusion이 받기 좋은 8의 배수 해상도로
resize되는지, ControlNet용 Canny 이미지가 기대한 형식으로 만들어지는지 확인한다.
"""

from pathlib import Path

import pytest
from PIL import Image

from ai_rendering.img2img.exceptions import InvalidInputError
from ai_rendering.img2img.preprocess import extract_canny, load_image, resize_for_sd


def test_load_image_accepts_path(input_dir: Path) -> None:
    """Path 입력을 받아 RGB PIL 이미지로 로드하는지 확인한다."""
    path = input_dir / "input (1).jpg"
    img = load_image(path)
    assert isinstance(img, Image.Image)
    assert img.mode == "RGB"


def test_load_image_accepts_str(input_dir: Path) -> None:
    """문자열 경로 입력도 Path 입력과 같은 방식으로 처리되어야 한다."""
    img = load_image(str(input_dir / "input (1).jpg"))
    assert isinstance(img, Image.Image)
    assert img.mode == "RGB"


def test_load_image_rejects_missing_file() -> None:
    """존재하지 않는 파일은 PIL 오류 대신 도메인 예외로 감싸서 보고해야 한다."""
    with pytest.raises(InvalidInputError, match="file not found"):
        load_image("does_not_exist_zzz.png")


def test_load_image_rejects_unsupported_type() -> None:
    """Path나 문자열이 아닌 입력 타입은 지원하지 않는 입력으로 거절해야 한다."""
    with pytest.raises(InvalidInputError, match="unsupported input type"):
        load_image(12345)  # type: ignore[arg-type]


def test_resize_for_sd_long_side_and_multiple_of_8() -> None:
    """긴 변은 기본 768에 맞추고 양쪽 변은 SD/UNet 제약에 맞게 8의 배수가 되어야 한다."""
    src = Image.new("RGB", (1329, 779))
    out = resize_for_sd(src)

    assert max(out.size) == 768
    assert out.size[0] % 8 == 0
    assert out.size[1] % 8 == 0

    in_ratio = 1329 / 779
    out_ratio = out.size[0] / out.size[1]
    assert abs(in_ratio - out_ratio) < 0.05


def test_extract_canny_returns_rgb_same_size() -> None:
    """Canny 전처리 결과는 ControlNet에 넘기기 좋은 RGB 이미지이며 원본 크기를 유지해야 한다."""
    src = Image.new("RGB", (256, 128), (180, 180, 180))
    out = extract_canny(src)
    assert isinstance(out, Image.Image)
    assert out.mode == "RGB"
    assert out.size == src.size


def test_extract_canny_output_is_binary() -> None:
    """Canny edge map은 edge 유무만 담도록 0 또는 255 값만 가져야 한다."""
    import numpy as np

    src = Image.new("RGB", (128, 128), (100, 100, 100))
    out = extract_canny(src)
    arr = np.array(out)
    unique = set(arr.flatten().tolist())
    assert unique <= {0, 255}
