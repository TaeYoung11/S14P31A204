"""?듭뀡 B??3媛吏 ?몄텧 ?⑦꽩 (B-1/B-2/B-3) demo ?뚯뒪??

???꾨낫 紐⑤몢 *媛숈? prompt媛 SD pipe???꾨떖*?⑥쓣 ?뺤씤 ???쒓컖 寃곌낵 ?숈씪.
李⑥씠??*?⑹꽦 ?꾩튂(API ?붿옄??*留?

???뚯뒪?몃뒗 ? SD ?ㅽ뻾 ?놁씠 mock?쇰줈 *?몄텧 ?⑦꽩 ?숈옉*??寃利?
?쒓컖 鍮꾧탳??? ?ㅽ뻾? B-1 ?⑦꽩?쇰줈 1?뚮쭔 (outputs/ifc2img_option_b/).
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


# --- 媛숈? prompt媛 ?꾨떖?⑥쓣 寃利????????숈씪 ---


BASE_PROMPT = "RAW photo, scandinavian house"
# TOP? 紐낆떆 ?몄텧???쒖젏?대씪 suffix媛 鍮꾩뼱?덉? ?딆븘 ?⑹꽦 ?먮쫫 寃利앹뿉 ?곹빀.
TARGET_VIEW = IFCView.EYE_NE


def _expected_prompt() -> str:
    """怨듯넻 ?먯궛???듯빐 湲곕??섎뒗 ?⑹꽦 prompt."""
    return build_view_prompt(BASE_PROMPT, TARGET_VIEW)


def test_b1_renderer_view_arg(mock_renderer: DepthStyleRenderer) -> None:
    """B-1: render(depth, params, view=...) ??renderer ?대??먯꽌 ?⑹꽦."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt=BASE_PROMPT)

    # ?몄텧??肄붾뱶 1以?
    mock_renderer.render(depth, params, view=TARGET_VIEW)

    sent = mock_renderer.pipe.call_args.kwargs["prompt"]
    assert sent == _expected_prompt()


def test_b2_caller_composes_via_replace(mock_renderer: DepthStyleRenderer) -> None:
    """B-2: ?몄텧?먭? dataclasses.replace濡?prompt 吏곸젒 ?⑹꽦. render ?쒓렇?덉쿂 洹몃?濡?"""
    depth = Image.new("L", (768, 448), 100)
    base_params = DepthStyleParams(prompt=BASE_PROMPT)

    # ?몄텧??肄붾뱶 ???⑹꽦 梨낆엫???몄텧??
    composed_prompt = build_view_prompt(base_params.prompt, TARGET_VIEW)
    params = replace(base_params, prompt=composed_prompt)
    mock_renderer.render(depth, params)  # view ?몄옄 ?ъ슜 ????

    sent = mock_renderer.pipe.call_args.kwargs["prompt"]
    assert sent == _expected_prompt()


def test_b3_helper_via_public_api(mock_renderer: DepthStyleRenderer) -> None:
    """B-3: build_view_prompt瑜?怨듦컻 API濡?import ???몄텧?먭? ?⑹꽦. B-2? ?숈씪 ?숈옉."""
    # 怨듦컻 API import 寃쎈줈 ???몃? ?몄텧??BE ?? ?낆옣?먯꽌 ?먯뿰?ㅻ윭?
    from ai_rendering.ifc2img import build_view_prompt as public_helper

    depth = Image.new("L", (768, 448), 100)
    base_params = DepthStyleParams(prompt=BASE_PROMPT)

    # ?몄텧??肄붾뱶 ???ы띁媛 怨듦컻 API濡?紐낆떆??
    composed_prompt = public_helper(base_params.prompt, TARGET_VIEW)
    params = replace(base_params, prompt=composed_prompt)
    mock_renderer.render(depth, params)

    sent = mock_renderer.pipe.call_args.kwargs["prompt"]
    assert sent == _expected_prompt()


def test_three_options_produce_identical_prompt() -> None:
    """B-1/B-2/B-3 紐⑤몢 SD pipe??*?꾩쟾??媛숈? prompt*瑜??꾨떖?⑥쓣 吏곸젒 鍮꾧탳."""
    # B-1 ??renderer ?대??먯꽌 ?⑹꽦?섎뒗 寃쎌슦 (?ㅼ젣 ?⑹꽦 ?⑥닔留??몄슜)
    b1_prompt = build_view_prompt(BASE_PROMPT, TARGET_VIEW)

    # B-2 ???몄텧?먭? replace濡??⑹꽦
    b2_params = replace(DepthStyleParams(prompt=BASE_PROMPT),
                        prompt=build_view_prompt(BASE_PROMPT, TARGET_VIEW))
    b2_prompt = b2_params.prompt

    # B-3 ??怨듦컻 API濡??⑹꽦
    from ai_rendering.ifc2img import build_view_prompt as public
    b3_prompt = public(BASE_PROMPT, TARGET_VIEW)

    assert b1_prompt == b2_prompt == b3_prompt

