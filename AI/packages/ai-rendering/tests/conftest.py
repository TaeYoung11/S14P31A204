"""pytest 공용 픽스처."""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from PIL import Image


@pytest.fixture
def input_dir() -> Path:
    """실측 Three.js 캡처 PNG 6장이 들어있는 tests/fixtures/input/ 경로."""
    return Path(__file__).parent / "fixtures" / "input"


@pytest.fixture
def mock_renderer():  # type: ignore[no-untyped-def]
    """Img2ImgRenderer — 실제 SD 로드 없이 로직만 테스트용.

    __new__ 로 __init__ 우회 → torch/diffusers 로드 회피.
    pipe(...) 호출은 MagicMock 이 .images[0] 에 더미 PIL 이미지 반환하게 세팅.
    """
    from ai_rendering.img2img.pipeline import Img2ImgRenderer

    r = Img2ImgRenderer.__new__(Img2ImgRenderer)
    r.model_id = "mock"
    r.device = "cpu"
    r.dtype = "float32"  # type: ignore[assignment]
    r.pipe = MagicMock()
    r._torch = MagicMock()
    r.pipe.return_value.images = [Image.new("RGB", (768, 448), "gray")]
    return r


@pytest.fixture
def mock_controlnet_renderer():  # type: ignore[no-untyped-def]
    """ControlNetRenderer — 실제 SD/ControlNet 로드 없이 로직만 테스트용.

    __new__ 로 __init__ 우회 → torch/diffusers 로드 회피.
    pipe(...) 호출은 MagicMock 이 .images[0] 에 더미 PIL 이미지 반환하게 세팅.
    """
    from ai_rendering.img2img.pipeline import ControlNetRenderer

    r = ControlNetRenderer.__new__(ControlNetRenderer)
    r.model_id = "mock"
    r.controlnet_model_id = "mock-cn"
    r.device = "cpu"
    r.dtype = "float32"  # type: ignore[assignment]
    r.pipe = MagicMock()
    r._torch = MagicMock()
    r.pipe.return_value.images = [Image.new("RGB", (768, 448), "gray")]
    return r