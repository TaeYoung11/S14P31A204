"""ifc2img service pipeline tests.

These tests keep the future worker-facing contract separate from the heavy
Open3D and diffusion runtime.  Fake renderers verify that the service chooses
only the two public front-diagonal views, writes stable output names, and
passes preset-specific render options into the style stage.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, get_args

import pytest
from PIL import Image

from ai_rendering.ifc2img.exceptions import IFCRenderError
from ai_rendering.ifc2img.service import (
    DEFAULT_PHOTO_FRONT_DIAGONAL_GROUND_EXTENT_FACTOR,
    DEFAULT_PHOTO_FRONT_DIAGONAL_TARGET_RATIO,
    DEFAULT_PHOTO_HEIGHT,
    DEFAULT_PHOTO_ITER_TOLERANCE,
    DEFAULT_PHOTO_WIDTH,
    PHOTO_MANIFEST_SCHEMA_VERSION,
    PHOTO_INTERNAL_VIEWS,
    Ifc2ImgPhotoManifest,
    Ifc2ImgPhotoViewResult,
    PhotoViewAlias,
    PUBLIC_PHOTO_VIEWS,
    PUBLIC_TO_INTERNAL_VIEW,
    build_photo_manifest,
    create_photo_ifc_renderer,
    create_photo_style_renderer,
    render_photo_depths,
    render_photo_view,
    run_ifc2img_photo_pipeline,
    write_photo_manifest_file,
)
from ai_rendering.ifc2img.views import IFCView


class FakeIFCRenderer:
    instances: list[FakeIFCRenderer] = []

    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs
        self.render_views_calls: list[tuple[Path, list[IFCView] | None]] = []
        self.instances.append(self)

    def render_views(
        self,
        ifc_path: Path,
        views: list[IFCView] | None = None,
    ) -> dict[IFCView, Image.Image]:
        self.render_views_calls.append((ifc_path, views))
        assert views is not None
        return {
            view: Image.new("L", (8, 4), 64 + index)
            for index, view in enumerate(views)
        }


class FakeStyleResult:
    def __init__(self, image: Image.Image) -> None:
        self.image = image

    def save(self, path: Path | str) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.image.save(path, format="PNG")
        return path


class FakeDepthStyleRenderer:
    instances: list[FakeDepthStyleRenderer] = []

    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs
        self.render_calls: list[dict[str, Any]] = []
        self.instances.append(self)

    def render(
        self,
        depth_image: Image.Image,
        params: object,
        view: IFCView | None = None,
        **kwargs: object,
    ) -> FakeStyleResult:
        self.render_calls.append(
            {
                "depth_size": depth_image.size,
                "params": params,
                "view": view,
                "kwargs": kwargs,
            }
        )
        return FakeStyleResult(Image.new("RGB", depth_image.size, "white"))


@pytest.fixture(autouse=True)
def reset_fake_renderers() -> None:
    FakeIFCRenderer.instances.clear()
    FakeDepthStyleRenderer.instances.clear()


def test_service_public_views_are_front_diagonal_only() -> None:
    """Service 계약은 front diagonal 2장만 외부 사진 view로 노출한다."""
    assert get_args(PhotoViewAlias) == ("front_diagonal_left", "front_diagonal_right")
    assert PUBLIC_PHOTO_VIEWS == ("front_diagonal_left", "front_diagonal_right")
    assert PUBLIC_TO_INTERNAL_VIEW["front_diagonal_left"] is IFCView.FRONT_DIAGONAL_LEFT
    assert PUBLIC_TO_INTERNAL_VIEW["front_diagonal_right"] is IFCView.FRONT_DIAGONAL_RIGHT
    assert PHOTO_INTERNAL_VIEWS == (IFCView.FRONT_DIAGONAL_LEFT, IFCView.FRONT_DIAGONAL_RIGHT)
    assert {view.value for view in IFCView} == {
        "front",
        "side",
        "front_diagonal_left",
        "front_diagonal_right",
    }


def test_run_ifc2img_photo_pipeline_writes_contract_outputs(tmp_path: Path) -> None:
    """A local IFC input produces two photos, debug depths, and manifest."""
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    output_dir = tmp_path / "out"

    result = run_ifc2img_photo_pipeline(
        ifc_path,
        output_dir,
        preset="korean_house",
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    assert [output.view for output in result.outputs] == list(PUBLIC_PHOTO_VIEWS)
    assert all(isinstance(output, Ifc2ImgPhotoViewResult) for output in result.outputs)
    assert (output_dir / "photo_front_diagonal_left.png").exists()
    assert (output_dir / "photo_front_diagonal_right.png").exists()
    assert (output_dir / "depth_front_diagonal_left.png").exists()
    assert (output_dir / "depth_front_diagonal_right.png").exists()
    assert result.manifest_path == output_dir / "manifest.json"
    assert not hasattr(result, "bundle_path")
    assert not (output_dir / "ifc2img_result.zip").exists()

    manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    assert manifest["schemaVersion"] == PHOTO_MANIFEST_SCHEMA_VERSION
    assert manifest["renderMode"] == "ifc2img"
    assert manifest["preset"] == "korean_house"
    assert [view["view"] for view in manifest["views"]] == list(PUBLIC_PHOTO_VIEWS)
    assert [view["photoFile"] for view in manifest["views"]] == [
        "photo_front_diagonal_left.png",
        "photo_front_diagonal_right.png",
    ]
    assert [view["internalView"] for view in manifest["views"]] == [
        IFCView.FRONT_DIAGONAL_LEFT.value,
        IFCView.FRONT_DIAGONAL_RIGHT.value,
    ]


def test_photo_manifest_type_matches_json_contract(tmp_path: Path) -> None:
    """Manifest dataclass와 build helper가 같은 JSON 계약을 만든다."""
    output = Ifc2ImgPhotoViewResult(
        view="front_diagonal_left",
        internal_view=IFCView.FRONT_DIAGONAL_LEFT,
        photo_path=tmp_path / "photo_front_diagonal_left.png",
        depth_path=tmp_path / "depth_front_diagonal_left.png",
        width=8,
        height=4,
    )

    typed_manifest = Ifc2ImgPhotoManifest(
        source_ifc_path=tmp_path / "input.ifc",
        preset="korean_house",
        outputs=(output,),
    )
    helper_manifest = build_photo_manifest(
        source_ifc_path=tmp_path / "input.ifc",
        preset="korean_house",
        outputs=(output,),
    )

    assert typed_manifest.to_dict() == helper_manifest
    assert helper_manifest["schemaVersion"] == PHOTO_MANIFEST_SCHEMA_VERSION
    assert helper_manifest["renderMode"] == "ifc2img"
    assert helper_manifest["views"] == [
        {
            "view": "front_diagonal_left",
            "internalView": "front_diagonal_left",
            "photoFile": "photo_front_diagonal_left.png",
            "depthFile": "depth_front_diagonal_left.png",
            "width": 8,
            "height": 4,
        }
    ]


def test_write_photo_manifest_file_writes_typed_manifest(tmp_path: Path) -> None:
    """Typed manifest writer가 기존 JSON 저장 형식을 유지하는지 확인한다."""
    output = Ifc2ImgPhotoViewResult(
        view="front_diagonal_right",
        internal_view=IFCView.FRONT_DIAGONAL_RIGHT,
        photo_path=tmp_path / "photo_front_diagonal_right.png",
        depth_path=tmp_path / "depth_front_diagonal_right.png",
        width=16,
        height=9,
    )
    manifest = Ifc2ImgPhotoManifest(
        source_ifc_path=tmp_path / "input.ifc",
        preset="scandinavian",
        outputs=(output,),
    )

    manifest_path = write_photo_manifest_file(tmp_path / "nested" / "manifest.json", manifest)
    saved = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert saved == manifest.to_dict()
    assert saved["views"][0]["view"] == "front_diagonal_right"


def test_run_ifc2img_photo_pipeline_rejects_missing_ifc_before_renderers(
    tmp_path: Path,
) -> None:
    """Missing IFC input fails before any renderer is constructed."""
    with pytest.raises(IFCRenderError, match="IFC not found"):
        run_ifc2img_photo_pipeline(
            tmp_path / "missing.ifc",
            tmp_path / "out",
            preset="korean_house",
            ifc_renderer_cls=FakeIFCRenderer,
            depth_style_renderer_cls=FakeDepthStyleRenderer,
        )

    assert FakeIFCRenderer.instances == []
    assert FakeDepthStyleRenderer.instances == []


def test_create_photo_ifc_renderer_uses_injected_renderer_class() -> None:
    """실제 renderer factory 경계가 테스트용 클래스로 대체 가능한지 확인한다."""
    renderer = create_photo_ifc_renderer(FakeIFCRenderer)

    assert isinstance(renderer, FakeIFCRenderer)
    assert FakeIFCRenderer.instances == [renderer]
    assert renderer.kwargs["width"] == DEFAULT_PHOTO_WIDTH
    assert renderer.kwargs["height"] == DEFAULT_PHOTO_HEIGHT
    assert renderer.kwargs["iter_tolerance"] == DEFAULT_PHOTO_ITER_TOLERANCE
    assert renderer.kwargs["view_target_overrides"] == {
        IFCView.FRONT_DIAGONAL_RIGHT: DEFAULT_PHOTO_FRONT_DIAGONAL_TARGET_RATIO,
        IFCView.FRONT_DIAGONAL_LEFT: DEFAULT_PHOTO_FRONT_DIAGONAL_TARGET_RATIO,
    }
    assert renderer.kwargs["view_ground_extent_overrides"] == {
        IFCView.FRONT_DIAGONAL_RIGHT: DEFAULT_PHOTO_FRONT_DIAGONAL_GROUND_EXTENT_FACTOR,
        IFCView.FRONT_DIAGONAL_LEFT: DEFAULT_PHOTO_FRONT_DIAGONAL_GROUND_EXTENT_FACTOR,
    }


def test_create_photo_style_renderer_passes_semantic_model_when_required() -> None:
    """Style renderer factory가 semantic 필요 여부에 따라 생성 옵션을 넘긴다."""
    renderer = create_photo_style_renderer(
        requires_semantic=True,
        renderer_cls=FakeDepthStyleRenderer,
    )

    assert isinstance(renderer, FakeDepthStyleRenderer)
    assert "semantic_controlnet_model_id" in renderer.kwargs


def test_create_photo_style_renderer_omits_semantic_model_when_not_required() -> None:
    """Semantic control이 필요 없으면 style renderer를 가볍게 생성한다."""
    renderer = create_photo_style_renderer(
        requires_semantic=False,
        renderer_cls=FakeDepthStyleRenderer,
    )

    assert isinstance(renderer, FakeDepthStyleRenderer)
    assert "semantic_controlnet_model_id" not in renderer.kwargs


def test_render_photo_depths_calls_ifc_renderer_with_requested_views(tmp_path: Path) -> None:
    """Depth renderer 호출 경계를 작게 검증한다."""
    renderer = FakeIFCRenderer()
    views = [IFCView.FRONT_DIAGONAL_LEFT, IFCView.FRONT_DIAGONAL_RIGHT]

    depth_images = render_photo_depths(renderer, tmp_path / "input.ifc", views)

    assert renderer.render_views_calls == [(tmp_path / "input.ifc", views)]
    assert list(depth_images) == views


def test_render_photo_view_applies_preset_view_options() -> None:
    """Style renderer 호출 경계가 preset/view resolver 옵션을 전달하는지 확인한다."""
    renderer = FakeDepthStyleRenderer()
    depth = Image.new("L", (8, 4), 64)
    params = object()

    result = render_photo_view(
        renderer,
        depth,
        params,
        preset="korean_house",
        view=IFCView.FRONT_DIAGONAL_LEFT,
    )

    assert isinstance(result, FakeStyleResult)
    assert len(renderer.render_calls) == 1
    call = renderer.render_calls[0]
    assert call["params"] is params
    assert call["view"] is IFCView.FRONT_DIAGONAL_LEFT
    assert call["kwargs"]["use_front_diagonal_ground_semantic_control"] is True
    assert call["kwargs"]["use_front_diagonal_ground_plane_aware_semantic_control"] is True
    assert call["kwargs"]["use_front_diagonal_ground_plane_control_attenuation"] is True


def test_run_ifc2img_photo_pipeline_applies_front_diagonal_semantic_options(
    tmp_path: Path,
) -> None:
    """Korean house FRONT_DIAGONAL views require semantic ControlNet and resolver options."""
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    renderer = FakeIFCRenderer.instances[0]
    assert renderer.render_views_calls[0][1] == [
        IFCView.FRONT_DIAGONAL_LEFT,
        IFCView.FRONT_DIAGONAL_RIGHT,
    ]

    style_renderer = FakeDepthStyleRenderer.instances[0]
    assert "semantic_controlnet_model_id" in style_renderer.kwargs
    assert [call["view"] for call in style_renderer.render_calls] == [
        IFCView.FRONT_DIAGONAL_LEFT,
        IFCView.FRONT_DIAGONAL_RIGHT,
    ]
    for call in style_renderer.render_calls:
        options = call["kwargs"]
        assert options["use_front_diagonal_ground_semantic_control"] is True
        assert options["use_front_diagonal_ground_plane_aware_semantic_control"] is True
        assert options["use_front_diagonal_ground_plane_control_attenuation"] is True


def test_run_ifc2img_photo_pipeline_rejects_unknown_preset(tmp_path: Path) -> None:
    """Unknown preset names fail before any renderer is constructed."""
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    with pytest.raises(IFCRenderError, match="unknown preset"):
        run_ifc2img_photo_pipeline(
            ifc_path,
            tmp_path / "out",
            preset="missing",
            ifc_renderer_cls=FakeIFCRenderer,
            depth_style_renderer_cls=FakeDepthStyleRenderer,
        )

    assert FakeIFCRenderer.instances == []
    assert FakeDepthStyleRenderer.instances == []
