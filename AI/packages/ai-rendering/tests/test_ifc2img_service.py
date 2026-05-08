"""ifc2img service pipeline tests.

These tests keep the future worker-facing contract separate from the heavy
Open3D and diffusion runtime.  Fake renderers verify that the service chooses
only the two public front-diagonal views, writes stable output names, and
passes preset-specific render options into the style stage.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from ai_rendering.ifc2img.exceptions import IFCRenderError
from ai_rendering.ifc2img.service import (
    PHOTO_MANIFEST_SCHEMA_VERSION,
    PHOTO_INTERNAL_VIEWS,
    PUBLIC_PHOTO_VIEWS,
    PUBLIC_TO_INTERNAL_VIEW,
    run_ifc2img_photo_pipeline,
)
from ai_rendering.ifc2img.views import IFCView


class FakeIFCRenderer:
    instances: list[FakeIFCRenderer] = []

    def __init__(self) -> None:
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
    """A local IFC input produces two photos, debug depths, manifest, and zip."""
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
    assert (output_dir / "photo_front_diagonal_left.png").exists()
    assert (output_dir / "photo_front_diagonal_right.png").exists()
    assert (output_dir / "depth_front_diagonal_left.png").exists()
    assert (output_dir / "depth_front_diagonal_right.png").exists()
    assert result.bundle_path == output_dir / "ifc2img_result.zip"
    assert result.bundle_path.exists()

    manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    assert manifest["schemaVersion"] == PHOTO_MANIFEST_SCHEMA_VERSION
    assert manifest["renderMode"] == "ifc2img"
    assert manifest["preset"] == "korean_house"
    assert [view["photoFile"] for view in manifest["views"]] == [
        "photo_front_diagonal_left.png",
        "photo_front_diagonal_right.png",
    ]
    assert [view["internalView"] for view in manifest["views"]] == [
        IFCView.FRONT_DIAGONAL_LEFT.value,
        IFCView.FRONT_DIAGONAL_RIGHT.value,
    ]

    with zipfile.ZipFile(result.bundle_path) as zf:
        assert sorted(zf.namelist()) == [
            "manifest.json",
            "photo_front_diagonal_left.png",
            "photo_front_diagonal_right.png",
        ]


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
        create_bundle=False,
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
