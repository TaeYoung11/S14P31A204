"""pipeline 공개 API 계약 테스트.

torch/diffusers 지연 임포트 덕에 의존성 미설치에서도 import 가능한지 확인.
실제 SD 로드/렌더는 스프린트 내 로컬 검증 완료 — 여기선 API 계약만 본다.
"""


def test_public_api_imports() -> None:
    """from img2img import ... — 8개 공식 심볼 모두 성공 + __all__ 일치."""
    from img2img import (  # noqa: F401
        Img2ImgRenderer,
        InvalidInputError,
        PresetNotFoundError,
        RenderError,
        RenderParams,
        RenderResult,
        list_presets,
        load_preset,
    )

    import img2img

    expected = {
        "Img2ImgRenderer",
        "RenderParams",
        "RenderResult",
        "RenderError",
        "InvalidInputError",
        "PresetNotFoundError",
        "load_preset",
        "list_presets",
    }
    assert set(img2img.__all__) == expected


def test_renderer_has_render_with_presets_method() -> None:
    """MR2 에서 추가된 render_with_presets 가 클래스에 붙어있는지."""
    from img2img import Img2ImgRenderer

    assert hasattr(Img2ImgRenderer, "render_with_presets")
    assert callable(Img2ImgRenderer.render_with_presets)