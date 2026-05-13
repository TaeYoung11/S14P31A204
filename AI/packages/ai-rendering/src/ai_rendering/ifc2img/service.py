"""IFC를 사진 결과물로 변환하는 service 레벨 파이프라인.

CLI 스크립트와 worker 연결부 사이에서 재사용할 수 있는 얇은 진입점이다.
로컬 IFC 파일을 받아 앞이 보이는 대각선 2시점만 depth로 렌더링하고,
preset resolver가 정한 옵션으로 스타일 이미지를 생성한 뒤 고정된 출력 계약을
파일로 남긴다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, NotRequired, Protocol, TypedDict

from PIL import Image

from ai_common.logging import get_logger

from .exceptions import IFCRenderError
from .presets import list_presets, load_preset
from .style import DEFAULT_CONTROLNET_SEG_ID, resolve_preset_view_render_options
from .views import AutoZoomMode, IFCView

PHOTO_MANIFEST_SCHEMA_VERSION = "ifc2img.photo.v1"
IFC2IMG_WORKER_COMMAND_TYPE = "SD_RENDER_GENERATE"
IFC2IMG_WORKER_RENDER_MODE = "ifc2img"
PHOTO_MANIFEST_CONTENT_TYPE = "application/json; charset=utf-8"
PHOTO_PNG_CONTENT_TYPE = "image/png"
DEFAULT_PHOTO_PRESET = "korean_house"
_logger = get_logger(__name__)


@dataclass(frozen=True)
class PhotoDepthRenderDefaults:
    """사진 파이프라인 depth renderer에서 같이 움직이는 기본값 묶음."""

    width: int = 768
    height: int = 448
    auto_zoom: bool = True
    front_diagonal_target_ratio: float = 0.25
    front_diagonal_ground_extent_factor: float = 1.05
    iter_tolerance: float = 0.05


PHOTO_DEPTH_RENDER_DEFAULTS = PhotoDepthRenderDefaults()
DEFAULT_PHOTO_WIDTH = PHOTO_DEPTH_RENDER_DEFAULTS.width
DEFAULT_PHOTO_HEIGHT = PHOTO_DEPTH_RENDER_DEFAULTS.height
DEFAULT_PHOTO_AUTO_ZOOM = PHOTO_DEPTH_RENDER_DEFAULTS.auto_zoom
DEFAULT_PHOTO_FRONT_DIAGONAL_TARGET_RATIO = (
    PHOTO_DEPTH_RENDER_DEFAULTS.front_diagonal_target_ratio
)
DEFAULT_PHOTO_FRONT_DIAGONAL_GROUND_EXTENT_FACTOR = (
    PHOTO_DEPTH_RENDER_DEFAULTS.front_diagonal_ground_extent_factor
)
DEFAULT_PHOTO_ITER_TOLERANCE = PHOTO_DEPTH_RENDER_DEFAULTS.iter_tolerance
PhotoViewAlias = Literal["front_diagonal_left", "front_diagonal_right"]
Ifc2ImgWorkerStatus = Literal["SUCCESS", "ERROR"]
Ifc2ImgWorkerCommandType = Literal["SD_RENDER_GENERATE"]
Ifc2ImgWorkerRenderMode = Literal["ifc2img"]
Ifc2ImgWorkerTimeOfDay = Literal["DAY", "NIGHT"]
Ifc2ImgPresetTimeOfDay = Literal["day", "night"]
DEFAULT_IFC2IMG_WORKER_TIME_OF_DAY: Ifc2ImgWorkerTimeOfDay = "DAY"
PUBLIC_PHOTO_VIEWS: tuple[PhotoViewAlias, ...] = (
    "front_diagonal_left",
    "front_diagonal_right",
)
PUBLIC_TO_INTERNAL_VIEW: dict[PhotoViewAlias, IFCView] = {
    "front_diagonal_left": IFCView.FRONT_DIAGONAL_LEFT,
    "front_diagonal_right": IFCView.FRONT_DIAGONAL_RIGHT,
}
PHOTO_VIEW_TO_EXPECTED_OUTPUT_FIELD: dict[PhotoViewAlias, str] = {
    "front_diagonal_left": "renderPhotoFrontDiagonalLeftStorageUrl",
    "front_diagonal_right": "renderPhotoFrontDiagonalRightStorageUrl",
}
PHOTO_INTERNAL_VIEWS = tuple(PUBLIC_TO_INTERNAL_VIEW[view] for view in PUBLIC_PHOTO_VIEWS)


def normalize_ifc2img_time_of_day(
    value: object | None,
) -> Ifc2ImgPresetTimeOfDay:
    """Normalize worker timeOfDay values to preset time_of_day values."""
    if value is None or value == "":
        value = DEFAULT_IFC2IMG_WORKER_TIME_OF_DAY
    if value == "DAY":
        return "day"
    if value == "NIGHT":
        return "night"
    raise IFCRenderError(
        "unsupported timeOfDay: "
        f"{value!r}. Expected one of: DAY, NIGHT"
    )


class Ifc2ImgWorkerInput(TypedDict):
    """Worker가 내려받을 원본 IFC 위치를 담는 입력 계약."""

    sourceIfcStorageUrl: str


class Ifc2ImgWorkerExpectedOutput(TypedDict):
    """Worker가 결과 파일을 올려야 하는 storage prefix 계약."""

    renderImageStorageUrl: NotRequired[str]
    renderManifestStorageUrl: NotRequired[str]
    renderPhotoFrontDiagonalLeftStorageUrl: NotRequired[str]
    renderPhotoFrontDiagonalRightStorageUrl: NotRequired[str]


class Ifc2ImgWorkerPayload(TypedDict):
    """ifc2img 실행에 필요한 렌더 모드와 preset 선택 값."""

    renderMode: Ifc2ImgWorkerRenderMode
    preset: str
    timeOfDay: NotRequired[Ifc2ImgWorkerTimeOfDay]


class Ifc2ImgWorkerRequest(TypedDict):
    """Worker queue/message에서 받는 ifc2img 요청 JSON 계약."""

    commandType: Ifc2ImgWorkerCommandType
    input: Ifc2ImgWorkerInput
    expectedOutput: Ifc2ImgWorkerExpectedOutput
    payload: Ifc2ImgWorkerPayload


class Ifc2ImgWorkerPhotoOutput(TypedDict):
    """Worker 응답에서 photo 1장의 업로드 결과를 표현하는 계약."""

    view: PhotoViewAlias
    storageUrl: str
    width: int
    height: int


class Ifc2ImgWorkerSuccessResponse(TypedDict):
    """ifc2img worker 성공 응답 JSON 계약."""

    status: Literal["SUCCESS"]
    renderMode: Ifc2ImgWorkerRenderMode
    preset: str
    manifestStorageUrl: str
    photos: list[Ifc2ImgWorkerPhotoOutput]


class Ifc2ImgWorkerErrorResponse(TypedDict):
    """ifc2img worker 실패 응답 JSON 계약."""

    status: Literal["ERROR"]
    renderMode: Ifc2ImgWorkerRenderMode
    errorCode: str
    message: str


class Ifc2ImgStorageAdapter(Protocol):
    def download_ifc(self, source_storage_url: str, destination_path: Path) -> Path:
        """원본 IFC storage URL을 로컬 파일로 내려받는다."""
        ...

    def upload_file(
        self,
        local_path: Path,
        target_storage_url: str,
        *,
        content_type: str,
    ) -> str:
        """로컬 결과 파일을 지정된 storage URL로 업로드하고 최종 URL을 돌려준다."""
        ...


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
class Ifc2ImgPhotoViewResult:
    """view 1개에 대해 생성된 photo/depth 파일과 이미지 크기를 담는다."""

    view: PhotoViewAlias
    internal_view: IFCView
    photo_path: Path
    depth_path: Path
    width: int
    height: int


Ifc2ImgPhotoOutput = Ifc2ImgPhotoViewResult


@dataclass(frozen=True)
class Ifc2ImgPhotoManifest:
    """worker가 읽을 photo manifest JSON의 내부 타입 계약을 담는다."""

    source_ifc_path: Path
    preset: str
    outputs: tuple[Ifc2ImgPhotoViewResult, ...]
    schema_version: str = PHOTO_MANIFEST_SCHEMA_VERSION
    render_mode: str = "ifc2img"

    def to_dict(self) -> dict[str, object]:
        """manifest dataclass를 기존 JSON 출력 구조로 변환한다."""
        return {
            "schemaVersion": self.schema_version,
            "renderMode": self.render_mode,
            "sourceIfcPath": str(self.source_ifc_path),
            "preset": self.preset,
            "views": [
                {
                    "view": output.view,
                    "internalView": output.internal_view.value,
                    "photoFile": output.photo_path.name,
                    "depthFile": output.depth_path.name,
                    "width": output.width,
                    "height": output.height,
                }
                for output in self.outputs
            ],
        }


@dataclass(frozen=True)
class Ifc2ImgPhotoJobResult:
    preset: str
    output_dir: Path
    outputs: tuple[Ifc2ImgPhotoViewResult, ...]
    manifest_path: Path


def resolve_photo_views() -> tuple[PhotoViewAlias, ...]:
    """service가 항상 생성하는 front-facing diagonal public view 2개를 반환한다."""
    return PUBLIC_PHOTO_VIEWS


def build_front_diagonal_target_overrides(
    target_ratio: float | None,
) -> dict[IFCView, float]:
    """front diagonal 2시점에만 적용할 auto-zoom target ratio override를 만든다."""
    if target_ratio is None:
        return {}
    if not 0.0 < target_ratio < 1.0:
        raise ValueError("front diagonal target ratio must be between 0 and 1.")
    return {
        IFCView.FRONT_DIAGONAL_RIGHT: target_ratio,
        IFCView.FRONT_DIAGONAL_LEFT: target_ratio,
    }


def build_front_diagonal_ground_extent_overrides(
    ground_extent_factor: float | None,
) -> dict[IFCView, float]:
    """front diagonal 2시점에만 적용할 ground plane extent override를 만든다."""
    if ground_extent_factor is None:
        return {}
    if ground_extent_factor <= 0.0:
        raise ValueError("front diagonal ground extent factor must be greater than 0.")
    return {
        IFCView.FRONT_DIAGONAL_RIGHT: ground_extent_factor,
        IFCView.FRONT_DIAGONAL_LEFT: ground_extent_factor,
    }


def resolve_render_plan(
    views: list[IFCView],
    presets: list[str],
) -> list[tuple[IFCView, str]]:
    """view와 preset 목록을 실제 render 순서로 펼친다."""
    return [(view, preset_name) for view in views for preset_name in presets]


def render_plan_requires_semantic_controlnet(
    plan: list[tuple[IFCView, str]],
) -> bool:
    """render plan 중 semantic ControlNet이 필요한 조합이 있는지 판단한다."""
    return any(
        resolve_preset_view_render_options(
            preset_name,
            view,
        ).requires_semantic_controlnet
        for view, preset_name in plan
    )


def render_view_requires_semantic_controlnet(preset_name: str, view: IFCView) -> bool:
    """단일 preset/view 조합에 semantic ControlNet이 필요한지 판단한다."""
    return resolve_preset_view_render_options(
        preset_name,
        view,
    ).requires_semantic_controlnet


def render_option_label(preset_name: str, view: IFCView) -> str:
    """preset/view resolver 결과를 로그와 디버깅에 쓰기 쉬운 짧은 문자열로 만든다."""
    options = resolve_preset_view_render_options(preset_name, view)
    enabled = [
        name
        for name, value in options.as_render_kwargs().items()
        if isinstance(value, bool) and value
    ]
    if not enabled:
        return "depth-only"
    enabled.append(f"ground={options.front_side_ground_class}")
    enabled.append(f"semantic_scale={options.front_side_semantic_control_scale}")
    return ", ".join(enabled)


def build_photo_manifest(
    *,
    source_ifc_path: Path,
    preset: str,
    outputs: tuple[Ifc2ImgPhotoViewResult, ...],
) -> dict[str, object]:
    """worker manifest 타입을 기존 JSON dict 구조로 변환한다."""
    return Ifc2ImgPhotoManifest(
        source_ifc_path=source_ifc_path,
        preset=preset,
        outputs=outputs,
    ).to_dict()


def build_photo_output_storage_url(output_prefix: str, filename: str) -> str:
    """worker output prefix와 파일명을 결합해 개별 결과 storage URL을 만든다."""
    if not output_prefix:
        raise ValueError("output storage prefix must not be empty.")
    if not filename or "/" in filename or "\\" in filename:
        raise ValueError("output filename must be a plain file name.")
    return f"{output_prefix.rstrip('/')}/{filename}"


def _storage_url_parent_prefix(storage_url: str) -> str:
    if "/" not in storage_url.rstrip("/"):
        raise ValueError("storage URL must include an object file name.")
    return storage_url.rstrip("/").rsplit("/", 1)[0]


def resolve_ifc2img_manifest_target_url(
    expected_output: Ifc2ImgWorkerExpectedOutput,
    manifest_filename: str,
) -> str:
    manifest_url = expected_output.get("renderManifestStorageUrl")
    if manifest_url:
        return manifest_url

    output_prefix = expected_output.get("renderImageStorageUrl")
    if output_prefix:
        return build_photo_output_storage_url(output_prefix, manifest_filename)

    raise IFCRenderError(
        "command.expectedOutput.renderManifestStorageUrl is required for ifc2img worker command"
    )


def resolve_ifc2img_photo_target_url(
    expected_output: Ifc2ImgWorkerExpectedOutput,
    output: Ifc2ImgPhotoViewResult,
) -> str:
    field_name = PHOTO_VIEW_TO_EXPECTED_OUTPUT_FIELD[output.view]
    photo_url = expected_output.get(field_name)
    if photo_url:
        return photo_url

    manifest_url = expected_output.get("renderManifestStorageUrl")
    if manifest_url:
        return build_photo_output_storage_url(
            _storage_url_parent_prefix(manifest_url),
            output.photo_path.name,
        )

    output_prefix = expected_output.get("renderImageStorageUrl")
    if output_prefix:
        return build_photo_output_storage_url(output_prefix, output.photo_path.name)

    raise IFCRenderError(
        f"command.expectedOutput.{field_name} is required for ifc2img worker command"
    )


def write_photo_manifest(
    path: Path,
    manifest: dict[str, object],
) -> Path:
    """manifest 딕셔너리를 UTF-8 JSON 파일로 저장하고 저장 경로를 반환한다."""
    # Partial manifest가 노출되지 않도록 같은 폴더의 임시 파일을 먼저 완성한다.
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.tmp")
    try:
        temp_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temp_path.replace(path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    return path


def write_photo_manifest_file(
    path: Path,
    manifest: Ifc2ImgPhotoManifest,
) -> Path:
    """typed manifest를 UTF-8 JSON 파일로 저장한다."""
    return write_photo_manifest(path, manifest.to_dict())


def create_photo_ifc_renderer(
    renderer_cls: type[_IFCRendererProtocol] | None = None,
    *,
    auto_zoom: bool = PHOTO_DEPTH_RENDER_DEFAULTS.auto_zoom,
    front_diagonal_target_ratio: float
    | None = PHOTO_DEPTH_RENDER_DEFAULTS.front_diagonal_target_ratio,
    front_diagonal_ground_extent_factor: float
    | None = PHOTO_DEPTH_RENDER_DEFAULTS.front_diagonal_ground_extent_factor,
    iter_tolerance: float = PHOTO_DEPTH_RENDER_DEFAULTS.iter_tolerance,
    width: int = PHOTO_DEPTH_RENDER_DEFAULTS.width,
    height: int = PHOTO_DEPTH_RENDER_DEFAULTS.height,
) -> _IFCRendererProtocol:
    """기본 실행에서는 실제 IFCRenderer를 lazy import해 생성한다."""
    if renderer_cls is None:
        from .renderer import IFCRenderer

        renderer_cls = IFCRenderer
    return renderer_cls(
        width=width,
        height=height,
        auto_zoom=AutoZoomMode.ITERATIVE if auto_zoom else AutoZoomMode.OFF,
        iter_tolerance=iter_tolerance,
        view_target_overrides=build_front_diagonal_target_overrides(
            front_diagonal_target_ratio if auto_zoom else None
        ),
        view_ground_extent_overrides=build_front_diagonal_ground_extent_overrides(
            front_diagonal_ground_extent_factor
        ),
    )


def create_photo_style_renderer(
    *,
    requires_semantic: bool,
    renderer_cls: type[_DepthStyleRendererProtocol] | None = None,
) -> _DepthStyleRendererProtocol:
    """기본 실행에서는 실제 DepthStyleRenderer를 lazy import해 생성한다."""
    if renderer_cls is None:
        from .style import DepthStyleRenderer

        renderer_cls = DepthStyleRenderer

    kwargs: dict[str, object] = {}
    if requires_semantic:
        kwargs["semantic_controlnet_model_id"] = DEFAULT_CONTROLNET_SEG_ID
    return renderer_cls(**kwargs)


def render_photo_depths(
    renderer: _IFCRendererProtocol,
    ifc_path: Path,
    views: list[IFCView],
) -> dict[IFCView, Image.Image]:
    """IFC renderer 호출을 작은 mock 가능 함수로 분리한다."""
    return renderer.render_views(ifc_path, views=views)


def render_photo_view(
    renderer: _DepthStyleRendererProtocol,
    depth_image: Image.Image,
    params: Any,
    *,
    preset: str,
    view: IFCView,
) -> _DepthStyleResultProtocol:
    """style renderer 호출과 preset/view option 적용을 한 곳에 모은다."""
    options = resolve_preset_view_render_options(preset, view)
    return renderer.render(
        depth_image,
        params,
        view=view,
        **options.as_render_kwargs(),
    )


def run_ifc2img_photo_pipeline(
    ifc_path: Path | str,
    output_dir: Path | str,
    *,
    preset: str = DEFAULT_PHOTO_PRESET,
    time_of_day: object | None = DEFAULT_IFC2IMG_WORKER_TIME_OF_DAY,
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
    preset_time_of_day = normalize_ifc2img_time_of_day(time_of_day)

    public_views = resolve_photo_views()
    internal_views = list(PHOTO_INTERNAL_VIEWS)
    output_dir.mkdir(parents=True, exist_ok=True)

    requires_semantic = any(
        resolve_preset_view_render_options(preset, view).requires_semantic_controlnet
        for view in internal_views
    )
    renderer = create_photo_ifc_renderer(ifc_renderer_cls)
    style_renderer = create_photo_style_renderer(
        requires_semantic=requires_semantic,
        renderer_cls=depth_style_renderer_cls,
    )

    _logger.info(
        "ifc2img_depth_render_started",
        ifcPath=str(ifc_path),
        outputDir=str(output_dir),
        preset=preset,
        views=[view.value for view in internal_views],
        requiresSemanticControlnet=requires_semantic,
    )
    depth_images = render_photo_depths(renderer, ifc_path, internal_views)
    _logger.info(
        "ifc2img_depth_render_completed",
        ifcPath=str(ifc_path),
        viewCount=len(depth_images),
        views=[view.value for view in depth_images],
    )
    params = load_preset(preset, preset_time_of_day)
    outputs: list[Ifc2ImgPhotoViewResult] = []
    for public_view, internal_view in zip(public_views, internal_views, strict=True):
        depth = depth_images[internal_view]
        depth_path = output_dir / f"depth_{public_view}.png"
        depth.save(depth_path, format="PNG")
        depth_width, depth_height = depth.size
        _logger.info(
            "ifc2img_depth_saved",
            view=public_view,
            internalView=internal_view.value,
            depthPath=str(depth_path),
            width=depth_width,
            height=depth_height,
        )

        _logger.info(
            "ifc2img_style_render_started",
            view=public_view,
            internalView=internal_view.value,
            preset=preset,
            renderOptions=render_option_label(preset, internal_view),
        )
        result = render_photo_view(
            style_renderer,
            depth,
            params,
            preset=preset,
            view=internal_view,
        )
        photo_path = output_dir / f"photo_{public_view}.png"
        result.save(photo_path)
        width, height = result.image.size
        _logger.info(
            "ifc2img_style_render_completed",
            view=public_view,
            internalView=internal_view.value,
            photoPath=str(photo_path),
            width=width,
            height=height,
        )
        outputs.append(
            Ifc2ImgPhotoViewResult(
                view=public_view,
                internal_view=internal_view,
                photo_path=photo_path,
                depth_path=depth_path,
                width=width,
                height=height,
            )
        )

    output_tuple = tuple(outputs)
    manifest_path = output_dir / "manifest.json"
    _logger.info(
        "ifc2img_manifest_write_started",
        manifestPath=str(manifest_path),
        photoCount=len(output_tuple),
    )
    manifest_path = write_photo_manifest_file(
        manifest_path,
        Ifc2ImgPhotoManifest(
            source_ifc_path=ifc_path,
            preset=preset,
            outputs=output_tuple,
        ),
    )
    _logger.info(
        "ifc2img_manifest_write_completed",
        manifestPath=str(manifest_path),
        photoCount=len(output_tuple),
    )
    return Ifc2ImgPhotoJobResult(
        preset=preset,
        output_dir=output_dir,
        outputs=output_tuple,
        manifest_path=manifest_path,
    )


def validate_ifc2img_worker_request(request: Ifc2ImgWorkerRequest) -> None:
    """storage나 render 실행 전에 worker 요청의 기본 routing 값을 검증한다."""
    if request["commandType"] != IFC2IMG_WORKER_COMMAND_TYPE:
        raise IFCRenderError(f"unsupported commandType: {request['commandType']}")
    if request["payload"]["renderMode"] != IFC2IMG_WORKER_RENDER_MODE:
        raise IFCRenderError(f"unsupported renderMode: {request['payload']['renderMode']}")


def handle_ifc2img_worker_request(
    request: Ifc2ImgWorkerRequest,
    storage: Ifc2ImgStorageAdapter,
    work_dir: Path | str,
    *,
    pipeline: Any = run_ifc2img_photo_pipeline,
) -> Ifc2ImgWorkerSuccessResponse:
    """Worker 요청 1건을 로컬 파이프라인 실행과 storage 업로드까지 연결한다."""
    validate_ifc2img_worker_request(request)

    work_dir = Path(work_dir)
    input_dir = work_dir / "input"
    output_dir = work_dir / "output"
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    source_storage_url = request["input"]["sourceIfcStorageUrl"]
    expected_output = request["expectedOutput"]
    manifest_target_url = resolve_ifc2img_manifest_target_url(
        expected_output,
        "manifest.v1.json",
    )
    preset = request["payload"]["preset"]
    time_of_day = request["payload"].get("timeOfDay")
    _logger.info(
        "ifc2img_worker_request_started",
        renderMode=request["payload"]["renderMode"],
        preset=preset,
        sourceIfcStorageUrl=source_storage_url,
        manifestTargetStorageUrl=manifest_target_url,
        workDir=str(work_dir),
    )
    _logger.info(
        "ifc2img_download_started",
        sourceIfcStorageUrl=source_storage_url,
        destinationPath=str(input_dir / "source.ifc"),
    )
    source_ifc_path = storage.download_ifc(
        source_storage_url,
        input_dir / "source.ifc",
    )
    _logger.info(
        "ifc2img_download_completed",
        sourceIfcStorageUrl=source_storage_url,
        localPath=str(source_ifc_path),
    )
    _logger.info(
        "ifc2img_pipeline_started",
        ifcPath=str(source_ifc_path),
        outputDir=str(output_dir),
        preset=preset,
    )
    result = pipeline(
        source_ifc_path,
        output_dir,
        preset=preset,
        time_of_day=time_of_day,
    )
    _logger.info(
        "ifc2img_pipeline_completed",
        manifestPath=str(result.manifest_path),
        photoCount=len(result.outputs),
    )

    _logger.info(
        "ifc2img_upload_started",
        artifact="manifest",
        localPath=str(result.manifest_path),
        targetStorageUrl=manifest_target_url,
        contentType=PHOTO_MANIFEST_CONTENT_TYPE,
    )
    manifest_url = storage.upload_file(
        result.manifest_path,
        manifest_target_url,
        content_type=PHOTO_MANIFEST_CONTENT_TYPE,
    )
    _logger.info(
        "ifc2img_upload_completed",
        artifact="manifest",
        localPath=str(result.manifest_path),
        storageUrl=manifest_url,
    )
    photos: list[Ifc2ImgWorkerPhotoOutput] = []
    for output in result.outputs:
        photo_target_url = resolve_ifc2img_photo_target_url(expected_output, output)
        _logger.info(
            "ifc2img_upload_started",
            artifact="photo",
            view=output.view,
            localPath=str(output.photo_path),
            targetStorageUrl=photo_target_url,
            contentType=PHOTO_PNG_CONTENT_TYPE,
            width=output.width,
            height=output.height,
        )
        photo_url = storage.upload_file(
            output.photo_path,
            photo_target_url,
            content_type=PHOTO_PNG_CONTENT_TYPE,
        )
        _logger.info(
            "ifc2img_upload_completed",
            artifact="photo",
            view=output.view,
            localPath=str(output.photo_path),
            storageUrl=photo_url,
            width=output.width,
            height=output.height,
        )
        photos.append(
            {
                "view": output.view,
                "storageUrl": photo_url,
                "width": output.width,
                "height": output.height,
            }
        )

    _logger.info(
        "ifc2img_worker_request_completed",
        renderMode=IFC2IMG_WORKER_RENDER_MODE,
        preset=result.preset,
        manifestStorageUrl=manifest_url,
        photoCount=len(photos),
    )
    return {
        "status": "SUCCESS",
        "renderMode": IFC2IMG_WORKER_RENDER_MODE,
        "preset": result.preset,
        "manifestStorageUrl": manifest_url,
        "photos": photos,
    }
