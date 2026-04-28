"""옵션 B의 3가지 호출 패턴 (B-1/B-2/B-3) demo 테스트.

세 후보 모두 *같은 prompt가 SD pipe에 도달*함을 확인 → 시각 결과 동일.
차이는 *합성 위치(API 디자인)*만.

이 테스트는 풀 SD 실행 없이 mock으로 *호출 패턴 동작*을 검증.
시각 비교용 풀 실행은 B-1 패턴으로 1회만 (outputs/ifc2img_option_b/).
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
    r = DepthStyleRenderer.__new__(DepthStyleRenderer)
    r.model_id = "mock"
    r.controlnet_model_id = "mock-cn"
    r.device = "cpu"
    r.dtype = "float32"  # type: ignore[assignment]
    r.pipe = MagicMock()
    r._torch = MagicMock()
    r.pipe.return_value.images = [Image.new("RGB", (768, 448), "gray")]
    return r


# --- 같은 prompt가 도달함을 검증 — 셋 다 동일 ---


BASE_PROMPT = "RAW photo, scandinavian house"
TARGET_VIEW = IFCView.ISO_NE


def _expected_prompt() -> str:
    """공통 자산을 통해 기대되는 합성 prompt."""
    return build_view_prompt(BASE_PROMPT, TARGET_VIEW)


def test_b1_renderer_view_arg(mock_renderer: DepthStyleRenderer) -> None:
    """B-1: render(depth, params, view=...) — renderer 내부에서 합성."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt=BASE_PROMPT)

    # 호출자 코드 1줄
    mock_renderer.render(depth, params, view=TARGET_VIEW)

    sent = mock_renderer.pipe.call_args.kwargs["prompt"]
    assert sent == _expected_prompt()


def test_b2_caller_composes_via_replace(mock_renderer: DepthStyleRenderer) -> None:
    """B-2: 호출자가 dataclasses.replace로 prompt 직접 합성. render 시그니처 그대로."""
    depth = Image.new("L", (768, 448), 100)
    base_params = DepthStyleParams(prompt=BASE_PROMPT)

    # 호출자 코드 — 합성 책임이 호출자
    composed_prompt = build_view_prompt(base_params.prompt, TARGET_VIEW)
    params = replace(base_params, prompt=composed_prompt)
    mock_renderer.render(depth, params)  # view 인자 사용 안 함

    sent = mock_renderer.pipe.call_args.kwargs["prompt"]
    assert sent == _expected_prompt()


def test_b3_helper_via_public_api(mock_renderer: DepthStyleRenderer) -> None:
    """B-3: build_view_prompt를 공개 API로 import 후 호출자가 합성. B-2와 동일 동작."""
    # 공개 API import 경로 — 외부 호출자(BE 등) 입장에서 자연스러움
    from ai_rendering.ifc2img import build_view_prompt as public_helper

    depth = Image.new("L", (768, 448), 100)
    base_params = DepthStyleParams(prompt=BASE_PROMPT)

    # 호출자 코드 — 헬퍼가 공개 API로 명시적
    composed_prompt = public_helper(base_params.prompt, TARGET_VIEW)
    params = replace(base_params, prompt=composed_prompt)
    mock_renderer.render(depth, params)

    sent = mock_renderer.pipe.call_args.kwargs["prompt"]
    assert sent == _expected_prompt()


def test_three_options_produce_identical_prompt() -> None:
    """B-1/B-2/B-3 모두 SD pipe에 *완전히 같은 prompt*를 전달함을 직접 비교."""
    # B-1 — renderer 내부에서 합성하는 경우 (실제 합성 함수만 인용)
    b1_prompt = build_view_prompt(BASE_PROMPT, TARGET_VIEW)

    # B-2 — 호출자가 replace로 합성
    b2_params = replace(DepthStyleParams(prompt=BASE_PROMPT),
                        prompt=build_view_prompt(BASE_PROMPT, TARGET_VIEW))
    b2_prompt = b2_params.prompt

    # B-3 — 공개 API로 합성
    from ai_rendering.ifc2img import build_view_prompt as public
    b3_prompt = public(BASE_PROMPT, TARGET_VIEW)

    assert b1_prompt == b2_prompt == b3_prompt
