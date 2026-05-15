"""IFC를 사진 결과물로 변환하는 service 레벨 파이프라인.

CLI 스크립트와 worker 연결부 사이에서 재사용할 수 있는 얇은 진입점이다.
로컬 IFC 파일을 받아 앞이 보이는 대각선 2시점만 depth로 렌더링하고,
preset resolver가 정한 옵션으로 스타일 이미지를 생성한 뒤 고정된 출력 계약을
파일로 남긴다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, replace as dataclass_replace
from pathlib import Path
from typing import Any, Literal, NotRequired, Protocol, TypedDict, cast

import numpy as np
from PIL import Image

from ai_common.logging import get_logger

from .element_masks import (
    IfcElementMaskRenderResult,
    build_ifc_color_composite_from_element_masks,
    measure_ifc_geometry_fidelity,
    render_ifc_element_masks,
)
from .exceptions import IFCRenderError
from .geometry import (
    _estimate_ground_z,
    attach_ground_plane_to_mesh,
    diagnose_mesh_orientation,
    load_mesh,
)
from .presets import list_presets, load_preset
from .semantics import (
    IfcColorSummary,
    IfcSemanticSummary,
    append_ifc_shape_lock_negative_prompt,
    build_ifc_color_prompt_suffix,
    extract_ifc_color_summary,
    extract_ifc_semantic_summary,
    inject_ifc_color_prompt,
    inject_ifc_shape_lock_prompt,
    is_reliable_main_door_candidate,
    remove_ifc_color_conflicting_prompt_terms,
    select_ifc_color_summary_category_cues,
)
from .style import (
    DEFAULT_CONTROLNET_SEG_ID,
    build_depth_edge_control_image,
    build_debug_control_images,
    resolve_preset_view_render_options,
)
from .views import VIEW_CAMERAS, AutoZoomMode, CameraParams, IFCView

PHOTO_MANIFEST_SCHEMA_VERSION = "ifc2img.photo.v1"
IFC2IMG_WORKER_COMMAND_TYPE = "SD_RENDER_GENERATE"
IFC2IMG_WORKER_RENDER_MODE = "ifc2img"
PHOTO_MANIFEST_CONTENT_TYPE = "application/json; charset=utf-8"
PHOTO_PNG_CONTENT_TYPE = "image/png"
DEFAULT_PHOTO_PRESET = "korean_house"
DEBUG_DIR_NAME = "debug"
DEBUG_MANIFEST_FILE = "debug_manifest.json"
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
    look_at_height_ratio: float = 0.35


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
DEFAULT_PHOTO_LOOK_AT_HEIGHT_RATIO = PHOTO_DEPTH_RENDER_DEFAULTS.look_at_height_ratio
PhotoViewAlias = Literal["front_diagonal_left", "front_diagonal_right"]
IfcColorControlInputMode = Literal[
    "default",
    "color_prompt",
    "color_composite_probe",
    "hybrid_color",
]
IfcColorMode = Literal["none", "prompt", "composite", "hybrid"]
GeometryControlInputMode = Literal[
    "default",
    "depth_edge",
    "element_composite",
]
Ifc2ImgWorkerStatus = Literal["SUCCESS", "ERROR"]
Ifc2ImgWorkerCommandType = Literal["SD_RENDER_GENERATE"]
Ifc2ImgWorkerRenderMode = Literal["ifc2img"]
Ifc2ImgWorkerTimeOfDay = Literal["DAY", "NIGHT"]
Ifc2ImgPresetTimeOfDay = Literal["day", "night"]
DEFAULT_IFC2IMG_WORKER_TIME_OF_DAY: Ifc2ImgWorkerTimeOfDay = "DAY"
GEOMETRY_CONTROL_INPUT_MODES: tuple[GeometryControlInputMode, ...] = (
    "default",
    "depth_edge",
    "element_composite",
)


@dataclass(frozen=True)
class IfcColorControlInputPlan:
    """Candidate input switches for IFC color preservation experiments."""

    mode: IfcColorControlInputMode
    use_depth_control: bool
    use_prompt_color_injection: bool
    use_ifc_color_composite: bool


IFC_COLOR_CONTROL_INPUT_PLANS: dict[
    IfcColorControlInputMode,
    IfcColorControlInputPlan,
] = {
    "default": IfcColorControlInputPlan(
        mode="default",
        use_depth_control=True,
        use_prompt_color_injection=False,
        use_ifc_color_composite=False,
    ),
    "color_prompt": IfcColorControlInputPlan(
        mode="color_prompt",
        use_depth_control=True,
        use_prompt_color_injection=True,
        use_ifc_color_composite=False,
    ),
    "color_composite_probe": IfcColorControlInputPlan(
        mode="color_composite_probe",
        use_depth_control=True,
        use_prompt_color_injection=False,
        use_ifc_color_composite=True,
    ),
    "hybrid_color": IfcColorControlInputPlan(
        mode="hybrid_color",
        use_depth_control=True,
        use_prompt_color_injection=True,
        use_ifc_color_composite=True,
    ),
}
IFC_COLOR_MODE_TO_CONTROL_INPUT_MODE: dict[IfcColorMode, IfcColorControlInputMode] = {
    "none": "default",
    "prompt": "color_prompt",
    "composite": "color_composite_probe",
    "hybrid": "hybrid_color",
}
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


def resolve_ifc_color_control_input_plan(
    mode: str = "default",
) -> IfcColorControlInputPlan:
    """Resolve an IFC color experiment mode to explicit input switches."""
    plan = IFC_COLOR_CONTROL_INPUT_PLANS.get(cast(IfcColorControlInputMode, mode))
    if plan is None:
        expected = ", ".join(IFC_COLOR_CONTROL_INPUT_PLANS)
        raise IFCRenderError(
            f"unsupported IFC color control input mode: {mode!r}. "
            f"Expected one of: {expected}"
        )
    return plan


def resolve_ifc_color_mode_input_plan(
    ifc_color_mode: str = "none",
) -> IfcColorControlInputPlan:
    """Resolve public IFC color opt-in mode to candidate input switches."""
    input_mode = IFC_COLOR_MODE_TO_CONTROL_INPUT_MODE.get(
        cast(IfcColorMode, ifc_color_mode)
    )
    if input_mode is None:
        expected = ", ".join(IFC_COLOR_MODE_TO_CONTROL_INPUT_MODE)
        raise IFCRenderError(
            f"unsupported ifc_color_mode: {ifc_color_mode!r}. "
            f"Expected one of: {expected}"
        )
    return resolve_ifc_color_control_input_plan(input_mode)


def resolve_geometry_control_input_mode(
    mode: str | None = None,
) -> GeometryControlInputMode:
    """Resolve internal IFC geometry control input experiment mode."""
    if mode is None or mode == "":
        return "default"
    if mode in GEOMETRY_CONTROL_INPUT_MODES:
        return cast(GeometryControlInputMode, mode)
    expected = ", ".join(GEOMETRY_CONTROL_INPUT_MODES)
    raise IFCRenderError(
        f"unsupported geometry_control_input_mode: {mode!r}. "
        f"Expected one of: {expected}"
    )


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
    timeOfDay: Ifc2ImgWorkerTimeOfDay
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
    time_of_day: Ifc2ImgWorkerTimeOfDay = DEFAULT_IFC2IMG_WORKER_TIME_OF_DAY
    schema_version: str = PHOTO_MANIFEST_SCHEMA_VERSION
    render_mode: str = "ifc2img"

    def to_dict(self) -> dict[str, object]:
        """manifest dataclass를 기존 JSON 출력 구조로 변환한다."""
        return {
            "schemaVersion": self.schema_version,
            "renderMode": self.render_mode,
            "sourceIfcPath": str(self.source_ifc_path),
            "preset": self.preset,
            "timeOfDay": self.time_of_day,
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
    time_of_day: Ifc2ImgWorkerTimeOfDay = DEFAULT_IFC2IMG_WORKER_TIME_OF_DAY


@dataclass(frozen=True)
class SemanticRenderContext:
    """Production render context for IFC semantic information."""

    summary: IfcSemanticSummary


@dataclass(frozen=True)
class SemanticGroundSelection:
    ground_source: str
    ground_z: float | None
    semantic_ground_candidate: float | None

    def to_dict(self) -> dict[str, object]:
        return {
            "groundSource": self.ground_source,
            "groundZ": self.ground_z,
            "semanticGroundCandidate": self.semantic_ground_candidate,
        }


@dataclass(frozen=True)
class SemanticFrontCameraSelection:
    source: str
    main_door_entity_id: int | None
    front_vector: tuple[float, float, float] | None
    overridden_views: tuple[IFCView, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "source": self.source,
            "mainDoorEntityId": self.main_door_entity_id,
            "frontVector": (
                list(self.front_vector) if self.front_vector is not None else None
            ),
            "overriddenViews": [view.value for view in self.overridden_views],
        }


def load_runtime_semantic_context(
    ifc_path: Path,
    *,
    max_attempts: int = 3,
) -> SemanticRenderContext:
    """Load production IFC semantic context with bounded retry."""
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1.")

    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            summary = extract_ifc_semantic_summary(ifc_path)
        except Exception as exc:
            last_error = exc
            _logger.warning(
                "ifc2img_runtime_semantic_context_load_failed",
                ifcPath=str(ifc_path),
                attempt=attempt,
                maxAttempts=max_attempts,
                error=str(exc),
            )
            continue

        if attempt > 1:
            _logger.info(
                "ifc2img_runtime_semantic_context_load_recovered",
                ifcPath=str(ifc_path),
                attempt=attempt,
                maxAttempts=max_attempts,
            )
        return SemanticRenderContext(summary=summary)

    raise IFCRenderError(
        "IFC runtime semantic context load failed "
        f"after attempt {max_attempts}/{max_attempts}: {ifc_path}: {last_error}"
    )


def resolve_semantic_ground_z(context: SemanticRenderContext) -> float | None:
    """Return the semantic ground z candidate from the lowest IFC floor."""
    floor = context.summary.lowest_floor
    if floor is None:
        return None
    return floor.bounds.z_max


def select_semantic_ground(context: SemanticRenderContext) -> SemanticGroundSelection:
    """Describe the ground z source selected from semantic context."""
    semantic_ground_z = resolve_semantic_ground_z(context)
    if semantic_ground_z is None:
        return SemanticGroundSelection(
            ground_source="geometry_percentile_fallback",
            ground_z=None,
            semantic_ground_candidate=None,
        )
    return SemanticGroundSelection(
        ground_source="semantic_floor",
        ground_z=semantic_ground_z,
        semantic_ground_candidate=semantic_ground_z,
    )


def resolve_semantic_front_camera_overrides(
    context: SemanticRenderContext,
) -> dict[IFCView, CameraParams]:
    """Return front diagonal camera overrides from a reliable main door."""
    candidate = context.summary.main_door_candidate
    if not is_reliable_main_door_candidate(candidate):
        return {}
    assert candidate is not None
    front = np.asarray(candidate.front_vector, dtype=np.float64)
    front_xy = front[:2] / np.linalg.norm(front[:2])
    left_xy = np.asarray([-front_xy[1], front_xy[0]], dtype=np.float64)
    right_xy = np.asarray([front_xy[1], -front_xy[0]], dtype=np.float64)
    return {
        IFCView.FRONT_DIAGONAL_LEFT: _camera_from_xy_direction(
            front_xy + left_xy,
            VIEW_CAMERAS[IFCView.FRONT_DIAGONAL_LEFT],
        ),
        IFCView.FRONT_DIAGONAL_RIGHT: _camera_from_xy_direction(
            front_xy + right_xy,
            VIEW_CAMERAS[IFCView.FRONT_DIAGONAL_RIGHT],
        ),
    }


def select_semantic_front_camera(
    context: SemanticRenderContext,
    view_camera_overrides: dict[IFCView, CameraParams],
) -> SemanticFrontCameraSelection:
    """Describe semantic front camera source for debug manifests."""
    candidate = context.summary.main_door_candidate
    if not is_reliable_main_door_candidate(candidate):
        return SemanticFrontCameraSelection(
            source="static_view_cameras_fallback",
            main_door_entity_id=None,
            front_vector=None,
            overridden_views=(),
        )
    assert candidate is not None
    if not view_camera_overrides:
        return SemanticFrontCameraSelection(
            source="semantic_main_door_deferred_mesh_alignment",
            main_door_entity_id=candidate.door_entity_id,
            front_vector=candidate.front_vector,
            overridden_views=(),
        )
    return SemanticFrontCameraSelection(
        source="semantic_main_door",
        main_door_entity_id=candidate.door_entity_id,
        front_vector=candidate.front_vector,
        overridden_views=tuple(view_camera_overrides),
    )


def _camera_from_xy_direction(
    xy_direction: np.ndarray,
    base_camera: CameraParams,
) -> CameraParams:
    direction = np.asarray([xy_direction[0], xy_direction[1], 0.0], dtype=np.float64)
    direction /= np.linalg.norm(direction[:2])
    return CameraParams(
        front=tuple(float(value) for value in direction),
        up=base_camera.up,
        zoom=base_camera.zoom,
    )


@dataclass(frozen=True)
class Ifc2ImgDebugGeometry:
    mesh: Any | None
    center: np.ndarray | None
    base_bounds: dict[str, object] | None
    orientation: dict[str, object] | None
    ground_z: float | None
    error: str | None = None


@dataclass(frozen=True)
class Ifc2ImgDebugElementMaskArtifacts:
    """Saved element mask paths plus the rendered masks for downstream debug reuse."""

    files: dict[str, str]
    result: IfcElementMaskRenderResult


def build_element_composite_control_image(
    element_masks: IfcElementMaskRenderResult,
) -> Image.Image:
    """Return the rendered IFC element composite as an RGB control candidate."""
    return element_masks.composite.convert("RGB")


def _render_element_composite_control_image(
    *,
    ifc_path: Path,
    camera: dict[str, object],
    width: int,
    height: int,
) -> Image.Image:
    result = render_ifc_element_masks(
        ifc_path,
        eye=cast(list[float], camera["eye"]),
        look_at=cast(list[float], camera["lookAt"]),
        up=cast(list[float], camera["up"]),
        width=width,
        height=height,
    )
    return build_element_composite_control_image(result)


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
    time_of_day: Ifc2ImgWorkerTimeOfDay = DEFAULT_IFC2IMG_WORKER_TIME_OF_DAY,
) -> dict[str, object]:
    """worker manifest 타입을 기존 JSON dict 구조로 변환한다."""
    return Ifc2ImgPhotoManifest(
        source_ifc_path=source_ifc_path,
        preset=preset,
        outputs=outputs,
        time_of_day=time_of_day,
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


def _path_for_manifest(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def _mesh_bounds(mesh: Any) -> dict[str, object]:
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    if vertices.size == 0:
        raise IFCRenderError("debug mesh has no vertices")
    min_xyz = vertices.min(axis=0)
    max_xyz = vertices.max(axis=0)
    extent = max_xyz - min_xyz
    center = (min_xyz + max_xyz) / 2
    return {
        "min": [float(value) for value in min_xyz],
        "max": [float(value) for value in max_xyz],
        "extent": [float(value) for value in extent],
        "center": [float(value) for value in center],
        "vertexCount": int(vertices.shape[0]),
    }


def _load_debug_geometry(ifc_path: Path) -> Ifc2ImgDebugGeometry:
    try:
        mesh, center = load_mesh(ifc_path)
        bounds = _mesh_bounds(mesh)
        return Ifc2ImgDebugGeometry(
            mesh=mesh,
            center=center,
            base_bounds=bounds,
            orientation=diagnose_mesh_orientation(
                np.asarray(mesh.vertices, dtype=np.float64),
                np.asarray(mesh.triangles, dtype=np.int64),
            ).to_dict(),
            ground_z=_estimate_ground_z(np.asarray(mesh.vertices, dtype=np.float64)),
        )
    except Exception as exc:
        _logger.info(
            "ifc2img_debug_geometry_failed",
            ifcPath=str(ifc_path),
            error=str(exc),
        )
        return Ifc2ImgDebugGeometry(
            mesh=None,
            center=None,
            base_bounds=None,
            orientation=None,
            ground_z=None,
            error=str(exc),
        )

def _debug_grounded_mesh(base_mesh: Any, view: IFCView) -> Any:
    ground_extent = build_front_diagonal_ground_extent_overrides(
        PHOTO_DEPTH_RENDER_DEFAULTS.front_diagonal_ground_extent_factor,
    ).get(view)
    if ground_extent is None:
        return attach_ground_plane_to_mesh(base_mesh)
    return attach_ground_plane_to_mesh(base_mesh, extent_factor=ground_extent)


def _resolve_debug_lookat(
    base_mesh: Any,
    center: np.ndarray,
    look_at_height_ratio: float,
) -> np.ndarray:
    vertices = np.asarray(base_mesh.vertices, dtype=np.float64)
    if vertices.size == 0:
        return center.astype(np.float64, copy=True)
    min_z = float(vertices[:, 2].min())
    max_z = float(vertices[:, 2].max())
    lookat = center.astype(np.float64, copy=True)
    lookat[2] = min_z + (max_z - min_z) * look_at_height_ratio
    return lookat


def _camera_debug_payload(
    mesh: Any,
    base_mesh: Any,
    center: np.ndarray,
    view: IFCView,
) -> dict[str, object]:
    camera = VIEW_CAMERAS[view]
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    max_extent = float(np.max(vertices.max(axis=0) - vertices.min(axis=0)))
    front = np.asarray(camera.front, dtype=np.float64)
    front_norm = float(np.linalg.norm(front))
    if front_norm == 0.0:
        raise IFCRenderError("debug camera front vector is zero")
    front = front / front_norm
    zoom = float(np.clip(camera.zoom, 0.05, 2.0))
    eye_distance = max(max_extent * 1.25 / zoom, 1.0)
    lookat = _resolve_debug_lookat(
        base_mesh,
        center,
        PHOTO_DEPTH_RENDER_DEFAULTS.look_at_height_ratio,
    )
    eye = lookat - front * eye_distance
    return {
        "eye": [float(value) for value in eye],
        "lookAt": [float(value) for value in lookat],
        "rawCenter": [float(value) for value in center],
        "up": [float(value) for value in camera.up],
        "front": [float(value) for value in front],
        "zoom": zoom,
        "eyeDistance": float(eye_distance),
        "lookAtHeightRatio": PHOTO_DEPTH_RENDER_DEFAULTS.look_at_height_ratio,
    }


def _depth_fill_ratio(depth: Image.Image) -> float:
    arr = np.asarray(depth.convert("L"), dtype=np.uint8)
    if arr.size == 0:
        return 0.0
    return float(np.count_nonzero(arr) / arr.size)


def _build_debug_view_payload(
    *,
    geometry: Ifc2ImgDebugGeometry,
    internal_view: IFCView,
) -> dict[str, object]:
    if geometry.mesh is None or geometry.center is None:
        return {"meshError": geometry.error}
    grounded = _debug_grounded_mesh(geometry.mesh, internal_view)
    return {
        "meshBounds": {
            "base": geometry.base_bounds,
            "withGround": _mesh_bounds(grounded),
        },
        "orientation": geometry.orientation,
        "groundZ": geometry.ground_z,
        "camera": _camera_debug_payload(
            grounded,
            geometry.mesh,
            geometry.center,
            internal_view,
        ),
    }


def _save_debug_element_masks(
    *,
    ifc_path: Path,
    output_dir: Path,
    debug_dir: Path,
    public_view: PhotoViewAlias,
    camera: dict[str, object],
    width: int,
    height: int,
) -> Ifc2ImgDebugElementMaskArtifacts | None:
    try:
        result = render_ifc_element_masks(
            ifc_path,
            eye=cast(list[float], camera["eye"]),
            look_at=cast(list[float], camera["lookAt"]),
            up=cast(list[float], camera["up"]),
            width=width,
            height=height,
        )
    except Exception as exc:
        _logger.info(
            "ifc2img_debug_element_masks_failed",
            ifcPath=str(ifc_path),
            view=public_view,
            error=str(exc),
        )
        return None

    paths: dict[str, str] = {}
    for category, image in result.masks.items():
        category_name = category.lower()
        path = debug_dir / f"element_{category_name}_{public_view}.png"
        image.save(path, format="PNG")
        paths[category_name] = _path_for_manifest(path, output_dir)

    composite_path = debug_dir / f"element_composite_{public_view}.png"
    build_element_composite_control_image(result).save(composite_path, format="PNG")
    paths["composite"] = _path_for_manifest(composite_path, output_dir)
    return Ifc2ImgDebugElementMaskArtifacts(files=paths, result=result)


def _save_debug_artifacts(
    *,
    ifc_path: Path,
    output_dir: Path,
    debug_dir: Path,
    preset: str,
    public_view: PhotoViewAlias,
    internal_view: IFCView,
    depth: Image.Image,
    photo: Image.Image,
    geometry: Ifc2ImgDebugGeometry,
    color_summary: IfcColorSummary | None = None,
) -> dict[str, object]:
    debug_depth_path = debug_dir / f"depth_{public_view}.png"
    debug_control_path = debug_dir / f"control_depth_{public_view}.png"
    debug_photo_path = debug_dir / f"final_photo_{public_view}.png"

    depth.save(debug_depth_path, format="PNG")
    options = resolve_preset_view_render_options(preset, internal_view)
    controls = build_debug_control_images(
        depth,
        view=internal_view,
        **options.as_render_kwargs(),
    )
    controls["depthControl"].save(debug_control_path, format="PNG")
    photo.save(debug_photo_path, format="PNG")

    files: dict[str, str | None] = {
        "depthImage": _path_for_manifest(debug_depth_path, output_dir),
        "depthControlImage": _path_for_manifest(debug_control_path, output_dir),
        "semanticControlImage": None,
        "finalPhoto": _path_for_manifest(debug_photo_path, output_dir),
    }
    semantic = controls.get("semanticControl")
    if semantic is not None:
        semantic_path = debug_dir / f"semantic_control_{public_view}.png"
        semantic.save(semantic_path, format="PNG")
        files["semanticControlImage"] = _path_for_manifest(semantic_path, output_dir)

    payload = _build_debug_view_payload(
        geometry=geometry,
        internal_view=internal_view,
    )
    camera = payload.get("camera")
    if isinstance(camera, dict):
        element_mask_artifacts = _save_debug_element_masks(
            ifc_path=ifc_path,
            output_dir=output_dir,
            debug_dir=debug_dir,
            public_view=public_view,
            camera=camera,
            width=depth.width,
            height=depth.height,
        )
        if element_mask_artifacts is not None:
            files["elementMasks"] = element_mask_artifacts.files
            payload["geometryFidelity"] = measure_ifc_geometry_fidelity(
                photo,
                element_mask_artifacts.result,
            ).to_dict()
            if color_summary is not None:
                try:
                    color_composite = build_ifc_color_composite_from_element_masks(
                        element_mask_artifacts.result,
                        color_summary,
                    )
                    color_composite_path = (
                        debug_dir / f"ifc_color_composite_{public_view}.png"
                    )
                    color_composite.save(color_composite_path, format="PNG")
                    files["ifcColorCompositeImage"] = _path_for_manifest(
                        color_composite_path,
                        output_dir,
                    )
                except Exception as exc:
                    _logger.info(
                        "ifc2img_debug_color_composite_failed",
                        ifcPath=str(ifc_path),
                        view=public_view,
                        error=str(exc),
                    )
    payload.update(
        {
            "view": public_view,
            "internalView": internal_view.value,
            "actualFillRatio": _depth_fill_ratio(depth),
            "files": files,
        }
    )
    return payload


def create_photo_ifc_renderer(
    renderer_cls: type[_IFCRendererProtocol] | None = None,
    *,
    auto_zoom: bool = PHOTO_DEPTH_RENDER_DEFAULTS.auto_zoom,
    front_diagonal_target_ratio: float
    | None = PHOTO_DEPTH_RENDER_DEFAULTS.front_diagonal_target_ratio,
    front_diagonal_ground_extent_factor: float
    | None = PHOTO_DEPTH_RENDER_DEFAULTS.front_diagonal_ground_extent_factor,
    view_camera_overrides: dict[IFCView, CameraParams] | None = None,
    ground_z_override: float | None = None,
    iter_tolerance: float = PHOTO_DEPTH_RENDER_DEFAULTS.iter_tolerance,
    width: int = PHOTO_DEPTH_RENDER_DEFAULTS.width,
    height: int = PHOTO_DEPTH_RENDER_DEFAULTS.height,
    look_at_height_ratio: float = PHOTO_DEPTH_RENDER_DEFAULTS.look_at_height_ratio,
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
        view_camera_overrides=view_camera_overrides,
        ground_z_override=ground_z_override,
        look_at_height_ratio=look_at_height_ratio,
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
    geometry_control_image: Image.Image | None = None,
) -> _DepthStyleResultProtocol:
    """style renderer 호출과 preset/view option 적용을 한 곳에 모은다."""
    options = resolve_preset_view_render_options(preset, view)
    render_kwargs = options.as_render_kwargs()
    if geometry_control_image is not None:
        render_kwargs.update(
            {
                "use_front_side_semantic_control": False,
                "use_front_full_width_semantic_control": False,
                "use_front_diagonal_ground_semantic_control": False,
                "use_front_diagonal_ground_plane_aware_semantic_control": False,
                "geometry_control_image": geometry_control_image,
            }
        )
    return renderer.render(
        depth_image,
        params,
        view=view,
        **render_kwargs,
    )


def run_ifc2img_photo_pipeline(
    ifc_path: Path | str,
    output_dir: Path | str,
    *,
    preset: str = DEFAULT_PHOTO_PRESET,
    time_of_day: object | None = DEFAULT_IFC2IMG_WORKER_TIME_OF_DAY,
    use_ifc_color_prompt_suffix: bool = False,
    use_ifc_shape_lock_prompt: bool = False,
    geometry_control_input_mode: str | None = None,
    debug_artifacts: bool = False,
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
    worker_time_of_day: Ifc2ImgWorkerTimeOfDay = (
        "DAY" if preset_time_of_day == "day" else "NIGHT"
    )
    geometry_control_mode = resolve_geometry_control_input_mode(
        geometry_control_input_mode
    )
    semantic_context = load_runtime_semantic_context(ifc_path)
    ground_selection = select_semantic_ground(semantic_context)
    # Semantic front vectors are in the original IFC world coordinate system.
    # Production meshes may be yaw-aligned during load_mesh(), so defer camera
    # overrides until that alignment transform is applied to semantic vectors too.
    view_camera_overrides: dict[IFCView, CameraParams] = {}
    front_camera_selection = select_semantic_front_camera(
        semantic_context,
        view_camera_overrides,
    )

    public_views = resolve_photo_views()
    internal_views = list(PHOTO_INTERNAL_VIEWS)
    output_dir.mkdir(parents=True, exist_ok=True)
    debug_dir = output_dir / DEBUG_DIR_NAME
    debug_geometry: Ifc2ImgDebugGeometry | None = None
    debug_manifest: dict[str, object] | None = None
    debug_color_summary: IfcColorSummary | None = None
    if debug_artifacts or use_ifc_color_prompt_suffix:
        try:
            debug_color_summary = extract_ifc_color_summary(ifc_path)
        except Exception as exc:  # pragma: no cover - error type varies by parser.
            if use_ifc_color_prompt_suffix:
                _logger.warning(
                    "ifc2img_color_prompt_summary_failed",
                    ifcPath=str(ifc_path),
                    error=str(exc),
                )
            color_summary_error = str(exc)
        else:
            color_summary_error = None
    else:
        color_summary_error = None

    if debug_artifacts or geometry_control_mode == "element_composite":
        debug_dir.mkdir(parents=True, exist_ok=True)
        debug_geometry = _load_debug_geometry(ifc_path)
    if debug_artifacts:
        debug_manifest = {
            "schemaVersion": "ifc2img.debug.v1",
            "sourceIfcPath": str(ifc_path),
            "preset": preset,
            "timeOfDay": worker_time_of_day,
            "geometryControlInputMode": geometry_control_mode,
            "useIfcShapeLockPrompt": use_ifc_shape_lock_prompt,
            "views": [],
        }
        # The production semantic context is the source of truth; the debug manifest
        # only records a serializable snapshot for inspection.
        debug_manifest["ifcSemanticSummary"] = semantic_context.summary.to_dict()
        if debug_color_summary is not None:
            debug_manifest["ifcColorSummary"] = debug_color_summary.to_dict()
        elif color_summary_error is not None:
            debug_manifest["ifcColorSummaryError"] = color_summary_error
        debug_manifest["semanticGroundSelection"] = ground_selection.to_dict()
        debug_manifest["semanticFrontCameraSelection"] = front_camera_selection.to_dict()

    requires_semantic = any(
        resolve_preset_view_render_options(preset, view).requires_semantic_controlnet
        for view in internal_views
    ) or geometry_control_mode != "default"
    renderer = create_photo_ifc_renderer(
        ifc_renderer_cls,
        view_camera_overrides=view_camera_overrides,
        ground_z_override=ground_selection.ground_z,
    )
    style_renderer = create_photo_style_renderer(
        requires_semantic=requires_semantic,
        renderer_cls=depth_style_renderer_cls,
    )

    _logger.info(
        "ifc2img_depth_render_started",
        ifcPath=str(ifc_path),
        outputDir=str(output_dir),
        preset=preset,
        timeOfDay=worker_time_of_day,
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
    if use_ifc_color_prompt_suffix and debug_color_summary is not None:
        color_suffix = build_ifc_color_prompt_suffix(debug_color_summary)
        color_cues = select_ifc_color_summary_category_cues(debug_color_summary)
        color_safe_prompt = remove_ifc_color_conflicting_prompt_terms(
            params.prompt,
            color_cues,
        )
        params = dataclass_replace(
            params,
            prompt=inject_ifc_color_prompt(color_safe_prompt, color_suffix),
        )
    if use_ifc_shape_lock_prompt:
        params = dataclass_replace(
            params,
            prompt=inject_ifc_shape_lock_prompt(params.prompt),
            negative_prompt=append_ifc_shape_lock_negative_prompt(
                params.negative_prompt
            ),
        )
    outputs: list[Ifc2ImgPhotoViewResult] = []
    for public_view, internal_view in zip(public_views, internal_views, strict=True):
        depth = depth_images[internal_view]
        geometry_control_image: Image.Image | None = None
        if geometry_control_mode == "depth_edge":
            geometry_control_image = build_depth_edge_control_image(depth)
        elif geometry_control_mode == "element_composite":
            if debug_geometry is None:
                raise IFCRenderError(
                    "element_composite geometry control requires debug geometry"
                )
            debug_payload = _build_debug_view_payload(
                geometry=debug_geometry,
                internal_view=internal_view,
            )
            camera = debug_payload.get("camera")
            if not isinstance(camera, dict):
                raise IFCRenderError(
                    "element_composite geometry control requires debug camera"
                )
            geometry_control_image = _render_element_composite_control_image(
                ifc_path=ifc_path,
                camera=camera,
                width=depth.width,
                height=depth.height,
            )
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
            timeOfDay=worker_time_of_day,
            renderOptions=render_option_label(preset, internal_view),
        )
        result = render_photo_view(
            style_renderer,
            depth,
            params,
            preset=preset,
            view=internal_view,
            geometry_control_image=geometry_control_image,
        )
        photo_path = output_dir / f"photo_{public_view}.png"
        result.save(photo_path)
        width, height = result.image.size
        actual_fill_ratio = _depth_fill_ratio(depth)
        if (
            debug_artifacts
            and debug_geometry is not None
            and debug_manifest is not None
        ):
            try:
                debug_view = _save_debug_artifacts(
                    ifc_path=ifc_path,
                    output_dir=output_dir,
                    debug_dir=debug_dir,
                    preset=preset,
                    public_view=public_view,
                    internal_view=internal_view,
                    depth=depth,
                    photo=result.image,
                    geometry=debug_geometry,
                    color_summary=debug_color_summary,
                )
                actual_fill_ratio = float(debug_view["actualFillRatio"])
                debug_view["geometryControlInputMode"] = geometry_control_mode
                debug_view["usesGeometryControlImage"] = (
                    geometry_control_image is not None
                )
                if geometry_control_image is not None:
                    debug_view["geometryControlImageSize"] = [
                        geometry_control_image.width,
                        geometry_control_image.height,
                    ]
                debug_manifest_views = debug_manifest["views"]
                if isinstance(debug_manifest_views, list):
                    debug_manifest_views.append(debug_view)
            except Exception as exc:
                _logger.warning(
                    "ifc2img_debug_artifacts_failed",
                    view=public_view,
                    internalView=internal_view.value,
                    error=str(exc),
                )
        _logger.info(
            "ifc2img_style_render_completed",
            view=public_view,
            internalView=internal_view.value,
            photoPath=str(photo_path),
            width=width,
            height=height,
            actualFillRatio=actual_fill_ratio,
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
    if debug_artifacts and debug_manifest is not None:
        try:
            debug_manifest_path = debug_dir / DEBUG_MANIFEST_FILE
            write_photo_manifest(debug_manifest_path, debug_manifest)
            _logger.info(
                "ifc2img_debug_manifest_write_completed",
                debugManifestPath=str(debug_manifest_path),
                viewCount=len(output_tuple),
            )
        except Exception as exc:
            _logger.warning(
                "ifc2img_debug_manifest_write_failed",
                debugManifestPath=str(debug_dir / DEBUG_MANIFEST_FILE),
                error=str(exc),
            )
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
            time_of_day=worker_time_of_day,
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
        time_of_day=worker_time_of_day,
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
    worker_time_of_day: Ifc2ImgWorkerTimeOfDay = (
        "DAY" if normalize_ifc2img_time_of_day(time_of_day) == "day" else "NIGHT"
    )
    _logger.info(
        "ifc2img_worker_request_started",
        renderMode=request["payload"]["renderMode"],
        preset=preset,
        timeOfDay=worker_time_of_day,
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
        timeOfDay=worker_time_of_day,
    )
    result = pipeline(
        source_ifc_path,
        output_dir,
        preset=preset,
        time_of_day=worker_time_of_day,
    )
    _logger.info(
        "ifc2img_pipeline_completed",
        manifestPath=str(result.manifest_path),
        photoCount=len(result.outputs),
        timeOfDay=result.time_of_day,
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
        timeOfDay=result.time_of_day,
        manifestStorageUrl=manifest_url,
        photoCount=len(photos),
    )
    return {
        "status": "SUCCESS",
        "renderMode": IFC2IMG_WORKER_RENDER_MODE,
        "preset": result.preset,
        "timeOfDay": result.time_of_day,
        "manifestStorageUrl": manifest_url,
        "photos": photos,
    }
