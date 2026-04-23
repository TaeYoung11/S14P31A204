"""exceptions 모듈 테스트 — 계층 구조 + 메시지 전달.

계층이 깨지면 `except RenderError` 로 전부 받는 코드가 망가짐 → 회귀 방어.
torch/GPU 미필요.
"""

import pytest

from ai_rendering.img2img.exceptions import (
    InvalidInputError,
    PresetNotFoundError,
    RenderError,
)


def test_invalid_input_error_is_render_error() -> None:
    """InvalidInputError 는 RenderError 의 하위 — 부모로 catch 가능."""
    assert issubclass(InvalidInputError, RenderError)
    with pytest.raises(RenderError):
        raise InvalidInputError("bad input")


def test_preset_not_found_is_render_error() -> None:
    """PresetNotFoundError 도 RenderError 의 하위."""
    assert issubclass(PresetNotFoundError, RenderError)
    with pytest.raises(RenderError):
        raise PresetNotFoundError("missing preset")


def test_exception_message_preserved() -> None:
    """raise X('msg') 가 str(e) 로 정확히 전달되어야."""
    with pytest.raises(InvalidInputError, match="hello world"):
        raise InvalidInputError("hello world")
