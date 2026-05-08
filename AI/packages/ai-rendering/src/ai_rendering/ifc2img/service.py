"""IFC를 사진 결과물로 변환하는 service 레벨 파이프라인.

CLI 스크립트와 worker 연결부 사이에서 재사용할 수 있는 얇은 진입점이다.
로컬 IFC 파일을 받아 앞이 보이는 대각선 2시점만 depth로 렌더링하고,
preset resolver가 정한 옵션으로 스타일 이미지를 생성한 뒤 고정된 출력 계약을
파일로 남긴다.
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
    "front_diagonal_left": IFCView.FRONT_DIAGONAL_LEFT,
    "front_diagonal_right": IFCView.FRONT_DIAGONAL_RIGHT,
}
PHOTO_INTERNAL_VIEWS = tuple(PUBLIC_TO_INTERNAL_VIEW[view] for view in PUBLIC_PHOTO_VIEWS)


class _IFCRendererProtocol(Protocol):
    def render_views(
        self,
        ifc_path: Path,
        views: list[IFCView] | None = None,
    ) -> dict[IFCView, Image.Image]:
        """IFC 파일에서 요청한 view들의 depth 이미지를 생성한다."""
        ...


class _DepthStyleResultProtocol(Protocol):
    image: Image.Image

    def save(self, path: Path | str) -> Path:
        """생성된 스타일 이미지를 PNG 파일로 저장한다."""
        ...


class _DepthStyleRendererProtocol(Protocol):
    def render(
        self,
        depth_image: Image.Image,
        params: Any,
        view: IFCView | None = None,
        **kwargs: object,
    ) -> _DepthStyleResultProtocol:
        """depth 이미지와 preset 옵션을 사용해 최종 사진 이미지를 생성한다."""
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


def resolve_photo_views() -> tuple[str, ...]:
    """service가 항상 생성하는 front-facing diagonal public view 2개를 반환한다."""
    return PUBLIC_PHOTO_VIEWS


def build_photo_manifest(
    *,
    source_ifc_path: Path,
    preset: str,
    outputs: tuple[Ifc2ImgPhotoOutput, ...],
) -> dict[str, object]:
    """생성된 사진/디버그 depth 목록을 worker가 읽을 manifest 구조로 만든다."""
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
    """manifest 딕셔너리를 UTF-8 JSON 파일로 저장하고 저장 경로를 반환한다."""
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
    """worker 업로드용 zip bundle에 manifest와 최종 사진 파일만 묶는다."""
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
    create_bundle: bool = True,
    ifc_renderer_cls: type[_IFCRendererProtocol] | None = None,
    depth_style_renderer_cls: type[_DepthStyleRendererProtocol] | None = None,
) -> Ifc2ImgPhotoJobResult:
    """IFC 입력 하나를 받아 front-facing diagonal 사진 2장 계약으로 렌더링한다."""
    ifc_path = Path(ifc_path)
    output_dir = Path(output_dir)
    if not ifc_path.exists():
        raise IFCRenderError(f"IFC not found: {ifc_path}")
    if preset not in list_presets():
        raise IFCRenderError(f"unknown preset: {preset}")

    public_views = resolve_photo_views()
    internal_views = list(PHOTO_INTERNAL_VIEWS)
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
