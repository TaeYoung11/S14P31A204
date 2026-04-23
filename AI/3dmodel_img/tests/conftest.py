"""pytest 공용 픽스처."""

from pathlib import Path

import pytest


@pytest.fixture
def input_dir() -> Path:
    """실측 Three.js 캡처 PNG 6장이 들어있는 img2img/img/ 경로."""
    return Path(__file__).parent.parent / "img2img" / "img"