"""img2img 예외 계층이 호출자가 다루기 쉬운 형태인지 확인한다.

렌더링 파이프라인에서는 입력 오류, preset 조회 실패, 실제 렌더링 실패가 서로 다른
상황에서 발생할 수 있다. 그래도 상위 호출자는 필요할 때 `RenderError` 하나로 공통
처리할 수 있어야 하므로, 세부 예외가 공통 기반 예외를 제대로 상속하는지 검증한다.
또한 사용자에게 전달할 오류 메시지가 예외 객체를 거치며 손실되지 않는지도 확인한다.
"""

import pytest

from ai_rendering.img2img.exceptions import (
    InvalidInputError,
    PresetNotFoundError,
    RenderError,
)


def test_invalid_input_error_is_render_error() -> None:
    """잘못된 입력 오류는 상위 레이어에서 RenderError로도 잡을 수 있어야 한다."""
    assert issubclass(InvalidInputError, RenderError)
    with pytest.raises(RenderError):
        raise InvalidInputError("bad input")


def test_preset_not_found_is_render_error() -> None:
    """없는 preset을 요청한 경우도 렌더링 계열 오류로 공통 처리할 수 있어야 한다."""
    assert issubclass(PresetNotFoundError, RenderError)
    with pytest.raises(RenderError):
        raise PresetNotFoundError("missing preset")


def test_exception_message_preserved() -> None:
    """예외 메시지는 로깅과 사용자 피드백에 쓰이므로 원문이 보존되어야 한다."""
    with pytest.raises(InvalidInputError, match="hello world"):
        raise InvalidInputError("hello world")
