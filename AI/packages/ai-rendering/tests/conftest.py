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
def ifc4_fixture() -> Path:
    """IFC4 스키마 정상 경로 fixture — load_mesh가 통과시켜야 한다."""
    return Path(__file__).parent / "fixtures" / "ifc" / "AC-20-Smiley-West-10-Bldg.ifc"


@pytest.fixture
def ifc4_sample_house_fixture() -> Path:
    """추가 IFC4 fixture (Ifc4_SampleHouse). 다양한 IFC4 샘플 회귀 검증용."""
    return Path(__file__).parent / "fixtures" / "ifc" / "Ifc4_SampleHouse.ifc"


@pytest.fixture
def ifc2x3_fixture() -> Path:
    """IFC 2x3 스키마 부정 경로 fixture — load_mesh가 IFCRenderError로 거부해야 한다."""
    return Path(__file__).parent / "fixtures" / "ifc" / "RE16_E3D_Building_2x3_Testversion.ifc"


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