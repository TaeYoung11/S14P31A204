"""ifc2img/style.py 테스트 — DepthStyleRenderer 호출 흐름 + 결과 래퍼.

torch/diffusers 지연 임포트 덕에 의존성 미설치에서도 import 가능.
실제 SD 로드는 3-Step 6 (E2E) 에서 검증 — 여기선 API/로직만 본다.
"""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from PIL import Image

from ai_rendering.ifc2img import (
    DepthStyleParams,
    DepthStyleRenderer,
    DepthStyleResult,
    IFCRenderError,
)


@pytest.fixture
def mock_depth_renderer() -> DepthStyleRenderer:
    """DepthStyleRenderer — 실제 SD/ControlNet 로드 없이 로직만 테스트용.

    __new__로 __init__ 우회 → torch/diffusers 로드 회피.
    pipe(...) 호출은 MagicMock이 .images[0]에 더미 PIL 이미지 반환하게 세팅.
    """
    r = DepthStyleRenderer.__new__(DepthStyleRenderer)
    r.model_id = "mock"
    r.controlnet_model_id = "mock-cn"
    r.device = "cpu"
    r.dtype = "float32"  # type: ignore[assignment]
    r.pipe = MagicMock()
    r._torch = MagicMock()
    r.pipe.return_value.images = [Image.new("RGB", (768, 448), "gray")]
    return r


def test_render_returns_result(mock_depth_renderer: DepthStyleRenderer) -> None:
    """render() → DepthStyleResult, image/params/depth_size/output_size 모두 채워짐."""
    depth = Image.new("L", (768, 448), 128)
    params = DepthStyleParams(prompt="a scandinavian living room")

    result = mock_depth_renderer.render(depth, params)

    assert isinstance(result, DepthStyleResult)
    assert result.image.size == (768, 448)
    assert result.params is params
    assert result.depth_size == (768, 448)
    assert result.output_size == (768, 448)


def test_render_passes_depth_as_control(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """pipe 호출 시 image= 인자에 control(depth) 이미지가 전달된다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="industrial loft")

    mock_depth_renderer.render(depth, params)

    call_kwargs = mock_depth_renderer.pipe.call_args.kwargs
    assert "image" in call_kwargs
    assert call_kwargs["image"].size == (768, 448)
    assert call_kwargs["prompt"] == "industrial loft"
    assert call_kwargs["width"] == 768
    assert call_kwargs["height"] == 448


def test_seeded_render_uses_generator(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """seed가 지정되면 torch.Generator.manual_seed가 호출된다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x", seed=42)

    mock_depth_renderer.render(depth, params)

    mock_depth_renderer._torch.Generator.assert_called_once_with(device="cpu")
    mock_depth_renderer._torch.Generator.return_value.manual_seed.assert_called_once_with(42)


def test_seedless_render_no_generator(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """seed=None이면 generator=None이 pipe에 전달된다."""
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x", seed=None)

    mock_depth_renderer.render(depth, params)

    assert mock_depth_renderer.pipe.call_args.kwargs["generator"] is None
    mock_depth_renderer._torch.Generator.assert_not_called()


def test_pipe_failure_wrapped_in_ifcrendererror(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """pipe(...)가 예외를 던지면 IFCRenderError로 래핑되어야 한다."""
    mock_depth_renderer.pipe.side_effect = RuntimeError("CUDA OOM")
    depth = Image.new("L", (768, 448), 100)
    params = DepthStyleParams(prompt="x")

    with pytest.raises(IFCRenderError, match="스타일 변환 실패"):
        mock_depth_renderer.render(depth, params)


def test_l_mode_depth_converted_to_rgb(
    mock_depth_renderer: DepthStyleRenderer,
) -> None:
    """입력 depth가 mode='L'이어도 ControlNet에는 3채널(RGB)로 전달된다."""
    depth_l = Image.new("L", (768, 448), 100)
    assert depth_l.mode == "L"

    mock_depth_renderer.render(depth_l, DepthStyleParams(prompt="x"))

    control = mock_depth_renderer.pipe.call_args.kwargs["image"]
    assert control.mode == "RGB"


def test_result_save_creates_parent_dir(tmp_path: Path) -> None:
    """DepthStyleResult.save()는 부모 디렉토리를 자동 생성한다."""
    img = Image.new("RGB", (10, 10), "white")
    result = DepthStyleResult(
        image=img,
        params=DepthStyleParams(prompt="x"),
        depth_size=(10, 10),
        output_size=(10, 10),
    )
    target = tmp_path / "sub" / "deeper" / "out.png"

    saved = result.save(target)

    assert saved == target
    assert target.exists()


def test_public_api_exports() -> None:
    """ifc2img 공개 심볼: 기존 3개 + style 3개 = 6개."""
    from ai_rendering import ifc2img

    expected = {
        "IFCRenderer",
        "IFCView",
        "IFCRenderError",
        "DepthStyleParams",
        "DepthStyleResult",
        "DepthStyleRenderer",
    }
    assert set(ifc2img.__all__) == expected
