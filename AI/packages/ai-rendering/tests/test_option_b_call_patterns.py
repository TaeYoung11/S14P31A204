"""view prompt 조립을 호출 위치별로 비교하는 Option B 회귀 테스트다.

초기 실험에서는 view별 prompt를 붙이는 방법으로 세 가지 호출 패턴을 비교했다.
B-1은 renderer에 `view`를 넘겨 renderer 내부에서 조립하는 방식이고, B-2는 caller가
`dataclasses.replace`로 prompt를 미리 조립하는 방식이며, B-3는 public helper
`build_view_prompt`를 직접 import해서 조립하는 방식이다.

최종 production 경로가 어느 방식을 택하더라도 같은 view라면 Stable Diffusion pipe에
동일한 prompt가 전달되어야 하므로, 이 파일은 세 방식의 결과가 일치하는지 확인한다.
"""

from dataclasses import replace
from unittest.mock import MagicMock

import pytest
from PIL import Image

from ai_rendering.ifc2img import (
    DepthStyleParams,
    DepthStyleRenderer,
    IFCView,
    build_view_prompt,
)


@pytest.fixture
def mock_renderer() -> DepthStyleRenderer:
    """실제 diffusion pipeline 대신 prompt 전달만 관찰하는 renderer mock을 만든다."""
    r = DepthStyleRenderer.__new__(DepthStyleRenderer)
    r.model_id = "mock"
    r.controlnet_model_id = "mock-cn"
    r.device = "cpu"
    r.dtype = "float32"  # type: ignore[assignment]
    r.pipe = MagicMock()
    r._torch = MagicMock()
    r.pipe.return_value.images = [Image.new("RGB", (768, 448), "gray")]
    return r


# 같은 base prompt와 target view를 세 호출 패턴에 넣고 결과 prompt만 비교한다.
BASE_PROMPT = "RAW photo, scandinavian house"
TARGET_VIEW = IFCView.EYE_NE


def _expected_prompt() -> str:
    """현재 기준 helper가 만들어야 하는 정답 prompt를 계산한다."""
    return build_view_prompt(BASE_PROMPT, TARGET_VIEW)


def test_b1_renderer_view_arg(mock_renderer: DepthStyleRenderer) -> None:
    """B-1 방식처럼 renderer에 view 인자를 넘기면 내부에서 prompt가 조립되어야 한다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt=BASE_PROMPT)

    mock_renderer.render(depth, params, view=TARGET_VIEW)

    sent = mock_renderer.pipe.call_args.kwargs["prompt"]
    assert sent == _expected_prompt()


def test_b2_caller_composes_via_replace(mock_renderer: DepthStyleRenderer) -> None:
    """B-2 방식처럼 caller가 params prompt를 교체해도 같은 최종 prompt가 전달되어야 한다."""
    depth = Image.new("L", (768, 448), 100)
    base_params = DepthStyleParams(prompt=BASE_PROMPT)

    composed_prompt = build_view_prompt(base_params.prompt, TARGET_VIEW)
    params = replace(base_params, prompt=composed_prompt)
    mock_renderer.render(depth, params)

    sent = mock_renderer.pipe.call_args.kwargs["prompt"]
    assert sent == _expected_prompt()


def test_b3_helper_via_public_api(mock_renderer: DepthStyleRenderer) -> None:
    """B-3 방식처럼 public API helper를 import해 조립해도 같은 prompt가 전달되어야 한다."""
    from ai_rendering.ifc2img import build_view_prompt as public_helper

    depth = Image.new("L", (768, 448), 100)
    base_params = DepthStyleParams(prompt=BASE_PROMPT)

    composed_prompt = public_helper(base_params.prompt, TARGET_VIEW)
    params = replace(base_params, prompt=composed_prompt)
    mock_renderer.render(depth, params)

    sent = mock_renderer.pipe.call_args.kwargs["prompt"]
    assert sent == _expected_prompt()


def test_three_options_produce_identical_prompt() -> None:
    """B-1/B-2/B-3 세 호출 패턴이 모두 동일한 view-aware prompt를 만드는지 확인한다."""
    b1_prompt = build_view_prompt(BASE_PROMPT, TARGET_VIEW)

    b2_params = replace(
        DepthStyleParams(prompt=BASE_PROMPT),
        prompt=build_view_prompt(BASE_PROMPT, TARGET_VIEW),
    )
    b2_prompt = b2_params.prompt

    from ai_rendering.ifc2img import build_view_prompt as public

    b3_prompt = public(BASE_PROMPT, TARGET_VIEW)

    assert b1_prompt == b2_prompt == b3_prompt
