"""preprocess 모듈 테스트 — load_image, resize_for_sd, extract_canny.

torch/GPU 미필요. PIL + opencv 만 사용하므로 CI에서 그대로 돌아감.
"""

from pathlib import Path

import pytest
from PIL import Image

from ai_rendering.img2img.exceptions import InvalidInputError
from ai_rendering.img2img.preprocess import extract_canny, load_image, resize_for_sd


def test_load_image_accepts_path(input_dir: Path) -> None:
    path = input_dir / "input (1).jpg"
    img = load_image(path)
    assert isinstance(img, Image.Image)
    assert img.mode == "RGB"


def test_load_image_accepts_str(input_dir: Path) -> None:
    img = load_image(str(input_dir / "input (1).jpg"))
    assert isinstance(img, Image.Image)
    assert img.mode == "RGB"


def test_load_image_rejects_missing_file() -> None:
    with pytest.raises(InvalidInputError, match="file not found"):
        load_image("does_not_exist_zzz.png")


def test_load_image_rejects_unsupported_type() -> None:
    with pytest.raises(InvalidInputError, match="unsupported input type"):
        load_image(12345)  # type: ignore[arg-type]


def test_resize_for_sd_long_side_and_multiple_of_8() -> None:
    # 실측 캡처의 한 사이즈로 검증: 1329x779 → long_side=768, 양변 %8==0
    src = Image.new("RGB", (1329, 779))
    out = resize_for_sd(src)

    assert max(out.size) == 768
    assert out.size[0] % 8 == 0
    assert out.size[1] % 8 == 0
    # 종횡비 거의 유지 (%8 스냅 오차 범위 내)
    in_ratio = 1329 / 779
    out_ratio = out.size[0] / out.size[1]
    assert abs(in_ratio - out_ratio) < 0.05


def test_extract_canny_returns_rgb_same_size() -> None:
    src = Image.new("RGB", (256, 128), (180, 180, 180))
    out = extract_canny(src)
    assert isinstance(out, Image.Image)
    assert out.mode == "RGB"
    assert out.size == src.size


def test_extract_canny_output_is_binary() -> None:
    """Canny 출력은 0 또는 255 픽셀만 포함해야 함."""
    import numpy as np

    src = Image.new("RGB", (128, 128), (100, 100, 100))
    out = extract_canny(src)
    arr = np.array(out)
    unique = set(arr.flatten().tolist())
    assert unique <= {0, 255}