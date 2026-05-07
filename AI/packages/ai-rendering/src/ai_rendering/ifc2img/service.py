"""Service-level IFC-to-photo pipeline helpers.

This module keeps the worker-facing pipeline separate from CLI scripts.  It
accepts a local IFC file, renders the two selected front-facing diagonal views,
styles them with the preset resolver, and writes a compact output contract.
"""

from __future__ import annotations

import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from PIL import Image

from .exceptions import IFCRenderError
from .presets import list_presets, load_preset
from .style import DEFAULT_CONTROLNET_SEG_ID, resolve_preset_view_render_options
from .views import IFCView

PHOTO_MANIFEST_SCHEMA_VERSION = "ifc2img.photo.v1"
DEFAULT_PHOTO_PRESET = "korean_house"
DEFAULT_PHOTO_BUNDLE_NAME = "ifc2img_result.zip"
PUBLIC_PHOTO_VIEWS = ("front_diagonal_left", "front_diagonal_right")
PUBLIC_TO_INTERNAL_VIEW: dict[str, IFCView] = {
    "front_diagonal_left": IFCView.EYE_NW,
    "front_diagonal_right": IFCView.EYE_NE,
}


class _IFCRendererProtocol(Protocol):
    def render_views(
        self,
        ifc_path: Path,
        views: list[IFCView] | None = None,
    ) -> dict[IFCView, Image.Image]:
        ...


class _DepthStyleResultProtocol(Protocol):
    image: Image.Image

    def save(self, path: Path | str) -> Path:
        ...


class _DepthStyleRendererProtocol(Protocol):
    def render(
        self,
        depth_image: Image.Image,
        params: Any,
        view: IFCView | None = None,
        **kwargs: object,
    ) -> _DepthStyleResultProtocol:
        ...


@dataclass(frozen=True)
class Ifc2ImgPhotoOutput:
    view: str
    internal_view: IFCView
    photo_path: Path
    depth_path: Path
    width: int
    height: int


@dataclass(frozen=True)
class Ifc2ImgPhotoJobResult:
    preset: str
    output_dir: Path
    outputs: tuple[Ifc2ImgPhotoOutput, ...]
    manifest_path: Path
    bundle_path: Path | None = None


def resolve_photo_views(views: tuple[str, ...] | None = None) -> tuple[str, ...]:
    """Return validated public photo view names in render order."""
    resolved = PUBLIC_PHOTO_VIEWS if views is None else views
    unknown = [view for view in resolved if view not in PUBLIC_TO_INTERNAL_VIEW]
    if unknown:
        raise IFCRenderError(f"unknown photo view(s): {unknown}")
    return tuple(resolved)


def build_photo_manifest(
    *,
    source_ifc_path: Path,
    preset: str,
    outputs: tuple[Ifc2ImgPhotoOutput, ...],
) -> dict[str, object]:
    """Build the stable manifest written beside photo outputs."""
    return {
        "schemaVersion": PHOTO_MANIFEST_SCHEMA_VERSION,
        "renderMode": "ifc2img",
        "sourceIfcPath": str(source_ifc_path),
        "preset": preset,
        "views": [
            {
                "view": output.view,
                "internalView": output.internal_view.value,
                "photoFile": output.photo_path.name,
                "depthFile": output.depth_path.name,
                "width": output.width,
                "height": output.height,
            }
            for output in outputs
        ],
    }


def write_photo_manifest(
    path: Path,
    manifest: dict[str, object],
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def create_photo_bundle(
    bundle_path: Path,
    *,
    manifest_path: Path,
    outputs: tuple[Ifc2ImgPhotoOutput, ...],
) -> Path:
    bundle_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(manifest_path, arcname=manifest_path.name)
        for output in outputs:
            zf.write(output.photo_path, arcname=output.photo_path.name)
    return bundle_path


def run_ifc2img_photo_pipeline(
    ifc_path: Path | str,
    output_dir: Path | str,
    *,
    preset: str = DEFAULT_PHOTO_PRESET,
    views: tuple[str, ...] | None = None,
    create_bundle: bool = True,
    ifc_renderer_cls: type[_IFCRendererProtocol] | None = None,
    depth_style_renderer_cls: type[_DepthStyleRendererProtocol] | None = None,
) -> Ifc2ImgPhotoJobResult:
    """Render the fixed two-photo ifc2img pipeline for a local IFC file."""
    ifc_path = Path(ifc_path)
    output_dir = Path(output_dir)
    if not ifc_path.exists():
        raise IFCRenderError(f"IFC not found: {ifc_path}")
    if preset not in list_presets():
        raise IFCRenderError(f"unknown preset: {preset}")

    public_views = resolve_photo_views(views)
    internal_views = [PUBLIC_TO_INTERNAL_VIEW[view] for view in public_views]
    output_dir.mkdir(parents=True, exist_ok=True)

    if ifc_renderer_cls is None:
        from .renderer import IFCRenderer

        ifc_renderer_cls = IFCRenderer
    if depth_style_renderer_cls is None:
        from .style import DepthStyleRenderer

        depth_style_renderer_cls = DepthStyleRenderer

    requires_semantic = any(
        resolve_preset_view_render_options(preset, view).requires_semantic_controlnet
        for view in internal_views
    )
    renderer = ifc_renderer_cls()
    style_renderer_kwargs: dict[str, object] = {}
    if requires_semantic:
        style_renderer_kwargs["semantic_controlnet_model_id"] = DEFAULT_CONTROLNET_SEG_ID
    style_renderer = depth_style_renderer_cls(**style_renderer_kwargs)

    depth_images = renderer.render_views(ifc_path, views=internal_views)
    params = load_preset(preset)
    outputs: list[Ifc2ImgPhotoOutput] = []
    for public_view, internal_view in zip(public_views, internal_views, strict=True):
        depth = depth_images[internal_view]
        depth_path = output_dir / f"depth_{public_view}.png"
        depth.save(depth_path, format="PNG")

        options = resolve_preset_view_render_options(preset, internal_view)
        result = style_renderer.render(
            depth,
            params,
            view=internal_view,
            **options.as_render_kwargs(),
        )
        photo_path = output_dir / f"photo_{public_view}.png"
        result.save(photo_path)
        width, height = result.image.size
        outputs.append(
            Ifc2ImgPhotoOutput(
                view=public_view,
                internal_view=internal_view,
                photo_path=photo_path,
                depth_path=depth_path,
                width=width,
                height=height,
            )
        )

    output_tuple = tuple(outputs)
    manifest_path = write_photo_manifest(
        output_dir / "manifest.json",
        build_photo_manifest(
            source_ifc_path=ifc_path,
            preset=preset,
            outputs=output_tuple,
        ),
    )
    bundle_path = None
    if create_bundle:
        bundle_path = create_photo_bundle(
            output_dir / DEFAULT_PHOTO_BUNDLE_NAME,
            manifest_path=manifest_path,
            outputs=output_tuple,
        )

    return Ifc2ImgPhotoJobResult(
        preset=preset,
        output_dir=output_dir,
        outputs=output_tuple,
        manifest_path=manifest_path,
        bundle_path=bundle_path,
    )
