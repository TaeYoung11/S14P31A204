"""ifc2img service pipeline tests.

These tests keep the future worker-facing contract separate from the heavy
Open3D and diffusion runtime.  Fake renderers verify that the service chooses
only the two public front-diagonal views, writes stable output names, and
passes preset-specific render options into the style stage.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, get_args, get_type_hints

import pytest
from PIL import Image

from ai_rendering.ifc2img.exceptions import IFCRenderError
from ai_rendering.ifc2img.service import (
    IFC2IMG_WORKER_COMMAND_TYPE,
    IFC2IMG_WORKER_RENDER_MODE,
    PHOTO_MANIFEST_CONTENT_TYPE,
    PHOTO_PNG_CONTENT_TYPE,
    PHOTO_DEPTH_RENDER_DEFAULTS,
    PHOTO_MANIFEST_SCHEMA_VERSION,
    PHOTO_INTERNAL_VIEWS,
    Ifc2ImgPhotoManifest,
    Ifc2ImgPhotoJobResult,
    Ifc2ImgPhotoViewResult,
    Ifc2ImgDebugGeometry,
    Ifc2ImgStorageAdapter,
    Ifc2ImgWorkerErrorResponse,
    Ifc2ImgWorkerRequest,
    Ifc2ImgWorkerSuccessResponse,
    GeometryControlInputMode,
    PhotoViewAlias,
    PUBLIC_PHOTO_VIEWS,
    PUBLIC_TO_INTERNAL_VIEW,
    build_element_composite_control_image,
    build_photo_manifest,
    build_photo_output_storage_url,
    create_photo_ifc_renderer,
    create_photo_style_renderer,
    handle_ifc2img_worker_request,
    load_runtime_semantic_context,
    render_photo_depths,
    render_photo_view,
    resolve_ifc_color_control_input_plan,
    resolve_ifc_color_mode_input_plan,
    resolve_geometry_control_input_mode,
    resolve_semantic_front_camera_overrides,
    resolve_semantic_ground_z,
    run_ifc2img_photo_pipeline,
    select_semantic_ground,
    write_photo_manifest_file,
    _save_debug_element_masks,
)
from ai_rendering.ifc2img.element_masks import IfcElementMaskRenderResult
from ai_rendering.ifc2img.semantics import (
    IfcColorCandidate,
    IfcColorSummary,
    IfcFrontDirectionCandidate,
    IfcSemanticCategoryColorSummary,
)
from ai_rendering.ifc2img.storage import Ifc2ImgStorageError
from ai_rendering.ifc2img.views import CameraParams, IFCView


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


class FakeStorageAdapter:
    def __init__(self) -> None:
        self.downloads: list[tuple[str, Path]] = []
        self.uploads: list[tuple[Path, str, str]] = []

    def download_ifc(self, source_storage_url: str, destination_path: Path) -> Path:
        self.downloads.append((source_storage_url, destination_path))
        destination_path.write_text("ISO-10303-21;", encoding="utf-8")
        return destination_path

    def upload_file(
        self,
        local_path: Path,
        target_storage_url: str,
        *,
        content_type: str,
    ) -> str:
        self.uploads.append((local_path, target_storage_url, content_type))
        return target_storage_url


class FakeLogger:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, object]]] = []

    def info(self, event: str, **kwargs: object) -> None:
        self.calls.append((event, kwargs))

    def warning(self, event: str, **kwargs: object) -> None:
        self.calls.append((event, kwargs))


class FakeSemanticSummary:
    def __init__(self, source_ifc_path: Path) -> None:
        self.source_ifc_path = source_ifc_path

    @property
    def lowest_floor(self) -> None:
        return None

    @property
    def main_door_candidate(self) -> None:
        return None

    def to_dict(self) -> dict[str, object]:
        return {
            "sourceIfcPath": str(self.source_ifc_path),
            "categories": {},
            "lowestFloor": None,
            "highestRoof": None,
            "doorCandidates": [],
            "frontDirectionCandidates": [],
            "mainDoorCandidate": None,
            "elements": [],
        }


class FakeSemanticSummaryWithoutFloor(FakeSemanticSummary):
    @property
    def lowest_floor(self) -> None:
        return None


class FakeSemanticBounds:
    def __init__(self, z_max: float) -> None:
        self.z_max = z_max


class FakeSemanticFloor:
    def __init__(self, z_max: float) -> None:
        self.bounds = FakeSemanticBounds(z_max)


class FakeSemanticSummaryWithFloor(FakeSemanticSummary):
    def __init__(self, source_ifc_path: Path, ground_z: float) -> None:
        super().__init__(source_ifc_path)
        self._lowest_floor = FakeSemanticFloor(ground_z)

    @property
    def lowest_floor(self) -> FakeSemanticFloor:
        return self._lowest_floor


class FakeSemanticSummaryWithMainDoor(FakeSemanticSummary):
    @property
    def main_door_candidate(self) -> IfcFrontDirectionCandidate:
        return IfcFrontDirectionCandidate(
            door_entity_id=703,
            door_name="main door",
            door_center=(0.0, 0.0, 1.0),
            nearest_footprint_side="min_y",
            distance_to_footprint_edge=0.0,
            exterior_wall_near=True,
            nearest_wall_entity_id=691,
            nearest_wall_distance=0.0,
            front_vector=(0.0, -1.0, 0.0),
            score=10.0,
        )


class FakeSemanticSummaryWithFloorAndMainDoor(FakeSemanticSummaryWithMainDoor):
    def __init__(self, source_ifc_path: Path, ground_z: float) -> None:
        super().__init__(source_ifc_path)
        self._lowest_floor = FakeSemanticFloor(ground_z)

    @property
    def lowest_floor(self) -> FakeSemanticFloor:
        return self._lowest_floor


@pytest.fixture(autouse=True)
def reset_fake_renderers() -> None:
    FakeIFCRenderer.instances.clear()
    FakeDepthStyleRenderer.instances.clear()


def patch_runtime_semantic_context(monkeypatch: pytest.MonkeyPatch) -> None:
    import ai_rendering.ifc2img.service as service

    def fake_load_runtime_semantic_context(
        ifc_path: Path,
        *,
        max_attempts: int = 3,
    ) -> object:
        return service.SemanticRenderContext(
            summary=FakeSemanticSummary(Path(ifc_path))
        )

    monkeypatch.setattr(
        service,
        "load_runtime_semantic_context",
        fake_load_runtime_semantic_context,
    )


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


def test_run_ifc2img_photo_pipeline_writes_contract_outputs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A local IFC input produces two photos, debug depths, and manifest."""
    patch_runtime_semantic_context(monkeypatch)
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    output_dir = tmp_path / "out"

    result = run_ifc2img_photo_pipeline(
        ifc_path,
        output_dir,
        preset="korean_house",
        debug_artifacts=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    assert [output.view for output in result.outputs] == list(PUBLIC_PHOTO_VIEWS)
    assert all(isinstance(output, Ifc2ImgPhotoViewResult) for output in result.outputs)
    assert (output_dir / "photo_front_diagonal_left.png").exists()
    assert (output_dir / "photo_front_diagonal_right.png").exists()
    assert (output_dir / "depth_front_diagonal_left.png").exists()
    assert (output_dir / "depth_front_diagonal_right.png").exists()
    debug_dir = output_dir / "debug"
    debug_manifest_path = debug_dir / "debug_manifest.json"
    assert debug_manifest_path.exists()
    assert (debug_dir / "depth_front_diagonal_left.png").exists()
    assert (debug_dir / "control_depth_front_diagonal_left.png").exists()
    assert (debug_dir / "semantic_control_front_diagonal_left.png").exists()
    assert (debug_dir / "final_photo_front_diagonal_left.png").exists()
    assert result.manifest_path == output_dir / "manifest.json"
    assert not hasattr(result, "bundle_path")
    assert not (output_dir / "ifc2img_result.zip").exists()

    manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    assert manifest["schemaVersion"] == PHOTO_MANIFEST_SCHEMA_VERSION
    assert manifest["renderMode"] == "ifc2img"
    assert manifest["preset"] == "korean_house"
    assert manifest["timeOfDay"] == "DAY"
    assert result.time_of_day == "DAY"
    assert [view["view"] for view in manifest["views"]] == list(PUBLIC_PHOTO_VIEWS)
    assert [view["photoFile"] for view in manifest["views"]] == [
        "photo_front_diagonal_left.png",
        "photo_front_diagonal_right.png",
    ]
    assert [view["internalView"] for view in manifest["views"]] == [
        IFCView.FRONT_DIAGONAL_LEFT.value,
        IFCView.FRONT_DIAGONAL_RIGHT.value,
    ]
    debug_manifest = json.loads(debug_manifest_path.read_text(encoding="utf-8"))
    assert debug_manifest["schemaVersion"] == "ifc2img.debug.v1"
    assert debug_manifest["preset"] == "korean_house"
    assert debug_manifest["timeOfDay"] == "DAY"
    assert debug_manifest["geometryControlInputMode"] == "default"
    assert debug_manifest["useIfcShapeLockPrompt"] is False
    assert debug_manifest["ifcSemanticSummary"]["sourceIfcPath"] == str(ifc_path)
    assert "ifcColorSummary" not in debug_manifest
    assert "ifcColorSummaryError" in debug_manifest
    assert debug_manifest["semanticGroundSelection"] == {
        "groundSource": "geometry_percentile_fallback",
        "groundZ": None,
        "semanticGroundCandidate": None,
    }
    assert "ifcSemanticSummaryError" not in debug_manifest
    assert [view["view"] for view in debug_manifest["views"]] == list(
        PUBLIC_PHOTO_VIEWS
    )
    first_debug_view = debug_manifest["views"][0]
    assert first_debug_view["actualFillRatio"] == 1.0
    assert first_debug_view["geometryControlInputMode"] == "default"
    assert first_debug_view["usesGeometryControlImage"] is False
    assert first_debug_view["files"]["depthImage"] == (
        "debug/depth_front_diagonal_left.png"
    )
    assert first_debug_view["files"]["semanticControlImage"] == (
        "debug/semantic_control_front_diagonal_left.png"
    )


def test_run_ifc2img_photo_pipeline_skips_debug_geometry_by_default(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """기본 production 경로는 debug geometry를 위해 IFC를 한 번 더 파싱하지 않는다."""
    import ai_rendering.ifc2img.service as service

    patch_runtime_semantic_context(monkeypatch)

    def fail_debug_geometry(_ifc_path: Path) -> None:
        raise AssertionError("debug geometry should be opt-in")

    monkeypatch.setattr(service, "_load_debug_geometry", fail_debug_geometry)
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    output_dir = tmp_path / "out"

    run_ifc2img_photo_pipeline(
        ifc_path,
        output_dir,
        preset="korean_house",
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    assert not (output_dir / "debug" / "debug_manifest.json").exists()


def test_run_ifc2img_photo_pipeline_continues_when_debug_artifacts_fail(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """debug artifact 생성 실패는 렌더 job 전체를 실패시키지 않는다."""
    import ai_rendering.ifc2img.service as service

    logger = FakeLogger()
    monkeypatch.setattr(service, "_logger", logger)
    patch_runtime_semantic_context(monkeypatch)

    def fail_debug_artifacts(**_kwargs: object) -> dict[str, object]:
        raise RuntimeError("debug png failed")

    monkeypatch.setattr(service, "_save_debug_artifacts", fail_debug_artifacts)
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    output_dir = tmp_path / "out"

    result = run_ifc2img_photo_pipeline(
        ifc_path,
        output_dir,
        preset="korean_house",
        debug_artifacts=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    assert result.manifest_path.exists()
    assert (output_dir / "photo_front_diagonal_left.png").exists()
    assert (output_dir / "photo_front_diagonal_right.png").exists()
    events = [event for event, _ in logger.calls]
    assert events.count("ifc2img_debug_artifacts_failed") == 2
    assert "ifc2img_manifest_write_completed" in events


def test_run_ifc2img_photo_pipeline_writes_ifc_semantic_summary(
    ifc4_fixture: Path,
    tmp_path: Path,
) -> None:
    """A real IFC debug manifest embeds the semantic reader summary."""
    output_dir = tmp_path / "out"

    run_ifc2img_photo_pipeline(
        ifc4_fixture,
        output_dir,
        preset="korean_house",
        debug_artifacts=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    debug_manifest = json.loads(
        (output_dir / "debug" / "debug_manifest.json").read_text(encoding="utf-8")
    )
    semantic = debug_manifest["ifcSemanticSummary"]
    color_summary = debug_manifest["ifcColorSummary"]
    assert set(semantic["categories"]) == {"FLOOR", "ROOF", "WALL", "WINDOW", "DOOR"}
    assert set(color_summary["categories"]) == {
        "FLOOR",
        "ROOF",
        "WALL",
        "WINDOW",
        "DOOR",
    }
    assert "ifcColorSummaryError" not in debug_manifest
    for category in ("ROOF", "WALL", "WINDOW", "DOOR"):
        assert color_summary["categories"][category]["color"]["rgb"] is not None
    assert all(
        semantic["categories"][category]["count"] > 0
        for category in ("FLOOR", "ROOF", "WALL", "WINDOW", "DOOR")
    )
    assert semantic["categories"]["FLOOR"]["zMin"] == pytest.approx(-0.362)
    assert semantic["categories"]["FLOOR"]["zMax"] == pytest.approx(0.0)
    assert semantic["categories"]["ROOF"]["zMin"] is not None
    assert semantic["categories"]["ROOF"]["zMax"] == pytest.approx(6.5)
    assert (
        semantic["categories"]["FLOOR"]["zMax"]
        < semantic["categories"]["ROOF"]["zMin"]
    )
    assert semantic["lowestFloor"]["category"] == "FLOOR"
    assert semantic["highestRoof"]["category"] == "ROOF"
    assert len(semantic["doorCandidates"]) >= 1
    assert debug_manifest["semanticGroundSelection"] == {
        "groundSource": "semantic_floor",
        "groundZ": pytest.approx(0.0),
        "semanticGroundCandidate": pytest.approx(0.0),
    }
    first_view = debug_manifest["views"][0]
    files = first_view["files"]
    assert files["ifcColorCompositeImage"] == (
        "debug/ifc_color_composite_front_diagonal_left.png"
    )
    assert (output_dir / files["ifcColorCompositeImage"]).exists()
    assert files["ifcColorCompositeImage"].startswith("debug/ifc_color_composite_")
    assert files["ifcColorCompositeImage"].endswith(".png")
    element_masks = first_view["files"]["elementMasks"]
    assert element_masks == {
        "floor": "debug/element_floor_front_diagonal_left.png",
        "roof": "debug/element_roof_front_diagonal_left.png",
        "wall": "debug/element_wall_front_diagonal_left.png",
        "window": "debug/element_window_front_diagonal_left.png",
        "door": "debug/element_door_front_diagonal_left.png",
        "composite": "debug/element_composite_front_diagonal_left.png",
    }
    for relative_path in element_masks.values():
        assert (output_dir / relative_path).exists()
    for view_payload in debug_manifest["views"]:
        geometry_fidelity = view_payload["geometryFidelity"]
        assert geometry_fidelity["imageSize"] == [8, 4]
        assert geometry_fidelity["buildingPixelCount"] > 0
        assert "buildingBboxOverlap" in geometry_fidelity
        assert "silhouetteIou" in geometry_fidelity
        assert "edgeAlignmentScore" in geometry_fidelity
        assert set(geometry_fidelity["categories"]) == {
            "ROOF",
            "WALL",
            "WINDOW",
            "DOOR",
        }
        view_files = view_payload["files"]
        final_photo_path = output_dir / view_files["finalPhoto"]
        color_composite_path = output_dir / view_files["ifcColorCompositeImage"]
        element_composite_path = output_dir / view_files["elementMasks"]["composite"]
        with (
            Image.open(final_photo_path) as final_photo,
            Image.open(color_composite_path) as color_composite,
            Image.open(element_composite_path) as element_composite,
        ):
            assert color_composite.size == final_photo.size
            assert color_composite.size == element_composite.size
            assert color_composite.getbbox() == element_composite.getbbox()


def test_save_debug_element_masks_keeps_render_result_for_reuse(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Element mask debug saving should keep the rendered masks for color artifacts."""
    import ai_rendering.ifc2img.service as service

    result = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (4, 4), 255),
            "ROOF": Image.new("L", (4, 4), 0),
            "WALL": Image.new("L", (4, 4), 0),
            "WINDOW": Image.new("L", (4, 4), 0),
            "DOOR": Image.new("L", (4, 4), 0),
        },
        composite=Image.new("RGB", (4, 4), "black"),
    )
    calls: list[dict[str, object]] = []

    def fake_render_ifc_element_masks(
        ifc_path: Path,
        **kwargs: object,
    ) -> IfcElementMaskRenderResult:
        calls.append({"ifc_path": ifc_path, **kwargs})
        return result

    monkeypatch.setattr(
        service,
        "render_ifc_element_masks",
        fake_render_ifc_element_masks,
    )

    output_dir = tmp_path / "out"
    debug_dir = output_dir / "debug"
    debug_dir.mkdir(parents=True)
    artifacts = _save_debug_element_masks(
        ifc_path=tmp_path / "input.ifc",
        output_dir=output_dir,
        debug_dir=debug_dir,
        public_view="front_diagonal_left",
        camera={
            "eye": [0.0, 0.0, 1.0],
            "lookAt": [0.0, 0.0, 0.0],
            "up": [0.0, 0.0, 1.0],
        },
        width=4,
        height=4,
    )

    assert artifacts is not None
    assert artifacts.result is result
    assert artifacts.files["floor"] == "debug/element_floor_front_diagonal_left.png"
    assert artifacts.files["composite"] == (
        "debug/element_composite_front_diagonal_left.png"
    )
    assert len(calls) == 1


def test_build_element_composite_control_image_returns_rgb_candidate() -> None:
    """Element composite should be reusable as an RGB style control candidate."""
    result = IfcElementMaskRenderResult(
        masks={
            "FLOOR": Image.new("L", (4, 4), 255),
            "ROOF": Image.new("L", (4, 4), 0),
            "WALL": Image.new("L", (4, 4), 0),
            "WINDOW": Image.new("L", (4, 4), 0),
            "DOOR": Image.new("L", (4, 4), 0),
        },
        composite=Image.new("P", (4, 4)),
    )

    control = build_element_composite_control_image(result)

    assert control.mode == "RGB"
    assert control.size == (4, 4)
    assert control is not result.composite


def test_run_ifc2img_photo_pipeline_reuses_runtime_semantic_context(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Debug manifest records the runtime semantic context instead of reparsing."""
    import ai_rendering.ifc2img.service as service

    calls: list[Path] = []
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    output_dir = tmp_path / "out"

    def fake_load_runtime_semantic_context(
        path: Path,
        *,
        max_attempts: int = 3,
    ) -> object:
        calls.append(Path(path))
        return service.SemanticRenderContext(summary=FakeSemanticSummary(Path(path)))

    monkeypatch.setattr(
        service,
        "load_runtime_semantic_context",
        fake_load_runtime_semantic_context,
    )

    run_ifc2img_photo_pipeline(
        ifc_path,
        output_dir,
        preset="korean_house",
        debug_artifacts=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    debug_manifest = json.loads(
        (output_dir / "debug" / "debug_manifest.json").read_text(encoding="utf-8")
    )
    assert calls == [ifc_path]
    assert debug_manifest["ifcSemanticSummary"]["sourceIfcPath"] == str(ifc_path)
    assert "ifcSemanticSummaryError" not in debug_manifest


def test_run_ifc2img_photo_pipeline_passes_semantic_ground_to_renderer(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pipeline forwards the runtime semantic ground candidate to IFCRenderer."""
    import ai_rendering.ifc2img.service as service

    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    def fake_load_runtime_semantic_context(
        path: Path,
        *,
        max_attempts: int = 3,
    ) -> object:
        return service.SemanticRenderContext(
            summary=FakeSemanticSummaryWithFloor(Path(path), ground_z=0.75)
        )

    monkeypatch.setattr(
        service,
        "load_runtime_semantic_context",
        fake_load_runtime_semantic_context,
    )

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        debug_artifacts=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    renderer = FakeIFCRenderer.instances[0]
    assert renderer.kwargs["ground_z_override"] == 0.75
    assert renderer.kwargs["view_camera_overrides"] == {}
    debug_manifest = json.loads(
        (tmp_path / "out" / "debug" / "debug_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert debug_manifest["semanticGroundSelection"] == {
        "groundSource": "semantic_floor",
        "groundZ": 0.75,
        "semanticGroundCandidate": 0.75,
    }


def test_run_ifc2img_photo_pipeline_uses_ground_z_none_without_semantic_floor(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing semantic floor keeps renderer ground_z fallback enabled."""
    import ai_rendering.ifc2img.service as service

    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    def fake_load_runtime_semantic_context(
        path: Path,
        *,
        max_attempts: int = 3,
    ) -> object:
        return service.SemanticRenderContext(
            summary=FakeSemanticSummaryWithoutFloor(Path(path))
        )

    monkeypatch.setattr(
        service,
        "load_runtime_semantic_context",
        fake_load_runtime_semantic_context,
    )

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        debug_artifacts=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    renderer = FakeIFCRenderer.instances[0]
    assert renderer.kwargs["ground_z_override"] is None
    assert renderer.kwargs["view_camera_overrides"] == {}
    debug_manifest = json.loads(
        (tmp_path / "out" / "debug" / "debug_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert debug_manifest["semanticGroundSelection"] == {
        "groundSource": "geometry_percentile_fallback",
        "groundZ": None,
        "semanticGroundCandidate": None,
    }
    assert debug_manifest["semanticFrontCameraSelection"] == {
        "source": "static_view_cameras_fallback",
        "mainDoorEntityId": None,
        "frontVector": None,
        "overriddenViews": [],
    }


def test_run_ifc2img_photo_pipeline_defers_semantic_front_camera_override(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pipeline records semantic front candidates without overriding cameras."""
    import ai_rendering.ifc2img.service as service

    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    calls: list[Path] = []

    def fake_load_runtime_semantic_context(
        path: Path,
        *,
        max_attempts: int = 3,
    ) -> object:
        calls.append(Path(path))
        return service.SemanticRenderContext(
            summary=FakeSemanticSummaryWithMainDoor(Path(path))
        )

    monkeypatch.setattr(
        service,
        "load_runtime_semantic_context",
        fake_load_runtime_semantic_context,
    )

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        debug_artifacts=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    renderer = FakeIFCRenderer.instances[0]
    overrides = renderer.kwargs["view_camera_overrides"]
    assert calls == [ifc_path]
    assert overrides == {}
    debug_manifest = json.loads(
        (tmp_path / "out" / "debug" / "debug_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert debug_manifest["semanticFrontCameraSelection"] == {
        "source": "semantic_main_door_deferred_mesh_alignment",
        "mainDoorEntityId": 703,
        "frontVector": [0.0, -1.0, 0.0],
        "overriddenViews": [],
    }


def test_run_ifc2img_photo_pipeline_passes_ground_and_defers_camera_to_renderer(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pipeline forwards semantic ground while deferring front camera overrides."""
    import ai_rendering.ifc2img.service as service

    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    def fake_load_runtime_semantic_context(
        path: Path,
        *,
        max_attempts: int = 3,
    ) -> object:
        return service.SemanticRenderContext(
            summary=FakeSemanticSummaryWithFloorAndMainDoor(Path(path), ground_z=0.75)
        )

    monkeypatch.setattr(
        service,
        "load_runtime_semantic_context",
        fake_load_runtime_semantic_context,
    )

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        debug_artifacts=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    renderer = FakeIFCRenderer.instances[0]
    assert renderer.kwargs["ground_z_override"] == 0.75
    assert renderer.kwargs["view_camera_overrides"] == {}
    debug_manifest = json.loads(
        (tmp_path / "out" / "debug" / "debug_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert debug_manifest["semanticFrontCameraSelection"] == {
        "source": "semantic_main_door_deferred_mesh_alignment",
        "mainDoorEntityId": 703,
        "frontVector": [0.0, -1.0, 0.0],
        "overriddenViews": [],
    }


def test_run_ifc2img_photo_pipeline_does_not_apply_front_camera_resolver(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pipeline avoids production semantic front overrides until coordinates align."""
    import ai_rendering.ifc2img.service as service

    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    semantic_context = service.SemanticRenderContext(
        summary=FakeSemanticSummaryWithMainDoor(ifc_path)
    )
    calls: list[object] = []

    def fake_load_runtime_semantic_context(
        path: Path,
        *,
        max_attempts: int = 3,
    ) -> object:
        return semantic_context

    def fake_resolve_semantic_front_camera_overrides(context: object) -> dict[object, object]:
        calls.append(context)
        return {}

    monkeypatch.setattr(
        service,
        "load_runtime_semantic_context",
        fake_load_runtime_semantic_context,
    )
    monkeypatch.setattr(
        service,
        "resolve_semantic_front_camera_overrides",
        fake_resolve_semantic_front_camera_overrides,
    )

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    assert calls == []
    renderer = FakeIFCRenderer.instances[0]
    assert renderer.kwargs["view_camera_overrides"] == {}


def test_load_runtime_semantic_context_returns_summary(ifc4_fixture: Path) -> None:
    """Runtime semantic context wraps a successful semantic summary."""
    context = load_runtime_semantic_context(ifc4_fixture)

    assert context.summary.source_ifc_path == ifc4_fixture
    assert context.summary.lowest_floor is not None
    assert context.summary.highest_roof is not None


def test_load_runtime_semantic_context_retries_until_success(
    ifc4_fixture: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Transient semantic extraction failures recover within max_attempts."""
    import ai_rendering.ifc2img.service as service

    real_extract = service.extract_ifc_semantic_summary
    attempts: list[int] = []

    def flaky_extract(path: Path) -> object:
        attempts.append(len(attempts) + 1)
        if len(attempts) < 3:
            raise IFCRenderError("temporary semantic failure")
        return real_extract(path)

    monkeypatch.setattr(service, "extract_ifc_semantic_summary", flaky_extract)

    context = load_runtime_semantic_context(ifc4_fixture, max_attempts=3)

    assert context.summary.lowest_floor is not None
    assert attempts == [1, 2, 3]


def test_load_runtime_semantic_context_fails_after_max_attempts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Semantic extraction failure is fatal after the retry budget is exhausted."""
    import ai_rendering.ifc2img.service as service

    attempts: list[int] = []
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    def always_fail(path: Path) -> object:
        attempts.append(len(attempts) + 1)
        raise IFCRenderError(f"semantic failure for {path.name}")

    monkeypatch.setattr(service, "extract_ifc_semantic_summary", always_fail)

    with pytest.raises(IFCRenderError) as exc_info:
        load_runtime_semantic_context(ifc_path, max_attempts=3)

    message = str(exc_info.value)
    assert attempts == [1, 2, 3]
    assert "after attempt 3/3" in message
    assert str(ifc_path) in message


def test_resolve_semantic_ground_z_returns_none_without_floor(tmp_path: Path) -> None:
    """Missing semantic floor keeps the ground z fallback path available."""
    import ai_rendering.ifc2img.service as service

    context = service.SemanticRenderContext(
        summary=FakeSemanticSummaryWithoutFloor(tmp_path / "input.ifc")
    )

    assert resolve_semantic_ground_z(context) is None


def test_resolve_semantic_ground_z_uses_shinchan_lowest_floor(
    ifc4_fixture: Path,
) -> None:
    """The shinchan fixture semantic floor resolves to the expected ground z."""
    context = load_runtime_semantic_context(ifc4_fixture)

    assert resolve_semantic_ground_z(context) == pytest.approx(0.0)


def test_select_semantic_ground_uses_semantic_floor(tmp_path: Path) -> None:
    """Ground selection records semantic floor as the source when available."""
    import ai_rendering.ifc2img.service as service

    context = service.SemanticRenderContext(
        summary=FakeSemanticSummaryWithFloor(tmp_path / "input.ifc", ground_z=0.5)
    )

    selection = select_semantic_ground(context)

    assert selection.to_dict() == {
        "groundSource": "semantic_floor",
        "groundZ": 0.5,
        "semanticGroundCandidate": 0.5,
    }


def test_select_semantic_ground_uses_fallback_without_floor(tmp_path: Path) -> None:
    """Ground selection records geometry fallback when no semantic floor exists."""
    import ai_rendering.ifc2img.service as service

    context = service.SemanticRenderContext(
        summary=FakeSemanticSummaryWithoutFloor(tmp_path / "input.ifc")
    )

    selection = select_semantic_ground(context)

    assert selection.to_dict() == {
        "groundSource": "geometry_percentile_fallback",
        "groundZ": None,
        "semanticGroundCandidate": None,
    }


def test_resolve_semantic_front_camera_overrides_uses_reliable_main_door(
    tmp_path: Path,
) -> None:
    """Reliable main door creates front diagonal camera override candidates."""
    import ai_rendering.ifc2img.service as service

    context = service.SemanticRenderContext(
        summary=FakeSemanticSummaryWithMainDoor(tmp_path / "input.ifc")
    )

    overrides = resolve_semantic_front_camera_overrides(context)

    assert set(overrides) == {
        IFCView.FRONT_DIAGONAL_LEFT,
        IFCView.FRONT_DIAGONAL_RIGHT,
    }
    left = overrides[IFCView.FRONT_DIAGONAL_LEFT]
    right = overrides[IFCView.FRONT_DIAGONAL_RIGHT]
    assert left.up == (0.0, 0.0, 1.0)
    assert right.up == (0.0, 0.0, 1.0)
    assert left.zoom == pytest.approx(0.5)
    assert right.zoom == pytest.approx(0.5)
    assert left.front == pytest.approx((2**-0.5, -(2**-0.5), 0.0))
    assert right.front == pytest.approx((-(2**-0.5), -(2**-0.5), 0.0))
    assert sum(value * value for value in left.front) ** 0.5 == pytest.approx(1.0)
    assert sum(value * value for value in right.front) ** 0.5 == pytest.approx(1.0)
    assert left.front != right.front


def test_resolve_semantic_front_camera_overrides_falls_back_without_main_door(
    tmp_path: Path,
) -> None:
    """Missing main door returns no camera overrides."""
    import ai_rendering.ifc2img.service as service

    context = service.SemanticRenderContext(
        summary=FakeSemanticSummary(tmp_path / "input.ifc")
    )

    assert resolve_semantic_front_camera_overrides(context) == {}


def test_resolve_semantic_front_camera_overrides_uses_shinchan_front_vector(
    ifc4_fixture: Path,
) -> None:
    """shinchan.ifc front vector fixes the expected semantic diagonal cameras."""
    context = load_runtime_semantic_context(ifc4_fixture)

    overrides = resolve_semantic_front_camera_overrides(context)

    assert set(overrides) == {
        IFCView.FRONT_DIAGONAL_LEFT,
        IFCView.FRONT_DIAGONAL_RIGHT,
    }
    assert overrides[IFCView.FRONT_DIAGONAL_LEFT].front == pytest.approx(
        (2**-0.5, -(2**-0.5), 0.0)
    )
    assert overrides[IFCView.FRONT_DIAGONAL_RIGHT].front == pytest.approx(
        (-(2**-0.5), -(2**-0.5), 0.0)
    )


def test_run_ifc2img_photo_pipeline_logs_depth_and_style_stages(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pipeline logs the expensive depth and style render milestones."""
    import ai_rendering.ifc2img.service as service

    patch_runtime_semantic_context(monkeypatch)
    logger = FakeLogger()
    monkeypatch.setattr(service, "_logger", logger)
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    events = [event for event, _ in logger.calls]
    assert "ifc2img_depth_render_started" in events
    assert "ifc2img_depth_render_completed" in events
    assert events.count("ifc2img_depth_saved") == 2
    assert events.count("ifc2img_style_render_started") == 2
    assert events.count("ifc2img_style_render_completed") == 2
    assert "ifc2img_manifest_write_completed" in events
    depth_start = dict(logger.calls)["ifc2img_depth_render_started"]
    assert depth_start["timeOfDay"] == "DAY"


def test_run_ifc2img_photo_pipeline_passes_time_of_day_to_preset(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pipeline should resolve NIGHT to the night preset prompt."""
    patch_runtime_semantic_context(monkeypatch)
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        time_of_day="NIGHT",
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    params = FakeDepthStyleRenderer.instances[0].render_calls[0]["params"]
    assert "night exterior" in params.prompt
    assert "dark sky" in params.prompt
    assert "warm windows" in params.prompt
    assert "exterior lights" in params.prompt
    assert "low glare" in params.prompt
    assert "outdoor daylight" not in params.prompt


def test_resolve_ifc_color_control_input_plan_separates_candidates() -> None:
    """IFC color modes should map to explicit depth/prompt/composite inputs."""
    expected = {
        "default": (True, False, False),
        "color_prompt": (True, True, False),
        "color_composite_probe": (True, False, True),
        "hybrid_color": (True, True, True),
    }

    for mode, flags in expected.items():
        plan = resolve_ifc_color_control_input_plan(mode)

        assert plan.mode == mode
        assert (
            plan.use_depth_control,
            plan.use_prompt_color_injection,
            plan.use_ifc_color_composite,
        ) == flags


def test_resolve_ifc_color_control_input_plan_rejects_unknown_mode() -> None:
    """Unknown IFC color modes should fail before changing production inputs."""
    with pytest.raises(
        IFCRenderError,
        match="unsupported IFC color control input mode",
    ):
        resolve_ifc_color_control_input_plan("color_everything")


def test_resolve_ifc_color_mode_input_plan_maps_public_opt_in_options() -> None:
    """Public ifc_color_mode values should map to the internal input plan."""
    expected = {
        "none": "default",
        "prompt": "color_prompt",
        "composite": "color_composite_probe",
        "hybrid": "hybrid_color",
    }

    for ifc_color_mode, input_mode in expected.items():
        assert resolve_ifc_color_mode_input_plan(ifc_color_mode).mode == input_mode


def test_resolve_ifc_color_mode_input_plan_defaults_to_none() -> None:
    """The public IFC color option should default to production depth-only."""
    plan = resolve_ifc_color_mode_input_plan()

    assert plan.mode == "default"
    assert plan.use_depth_control is True
    assert plan.use_prompt_color_injection is False
    assert plan.use_ifc_color_composite is False


def test_resolve_ifc_color_mode_input_plan_rejects_unknown_mode() -> None:
    """Unknown public IFC color modes should fail before changing inputs."""
    with pytest.raises(IFCRenderError, match="unsupported ifc_color_mode"):
        resolve_ifc_color_mode_input_plan("all")


def test_geometry_control_input_mode_candidates_are_fixed() -> None:
    """Geometry control hook modes should stay opt-in and explicit."""
    assert get_args(GeometryControlInputMode) == (
        "default",
        "depth_edge",
        "element_composite",
    )


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        (None, "default"),
        ("", "default"),
        ("default", "default"),
        ("depth_edge", "depth_edge"),
        ("element_composite", "element_composite"),
    ],
)
def test_resolve_geometry_control_input_mode(mode: str | None, expected: str) -> None:
    """Geometry control experiments should resolve to explicit opt-in modes."""
    assert resolve_geometry_control_input_mode(mode) == expected


def test_resolve_geometry_control_input_mode_rejects_unknown_mode() -> None:
    """Unknown geometry control modes should fail before changing inputs."""
    with pytest.raises(
        IFCRenderError,
        match="unsupported geometry_control_input_mode",
    ):
        resolve_geometry_control_input_mode("hybrid_everything")


@pytest.mark.parametrize(
    ("time_of_day", "expected_time_cue"),
    [
        ("DAY", "during sunny daytime"),
        ("NIGHT", "night exterior"),
    ],
)
def test_run_ifc2img_photo_pipeline_can_opt_in_to_ifc_color_prompt_suffix(
    time_of_day: str,
    expected_time_cue: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """IFC color prompt opt-in should inject colors before DAY/NIGHT text."""
    import ai_rendering.ifc2img.service as service

    patch_runtime_semantic_context(monkeypatch)
    FakeDepthStyleRenderer.instances.clear()
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    color_summary = IfcColorSummary(
        source_ifc_path=ifc_path,
        categories={
            "ROOF": IfcSemanticCategoryColorSummary(
                category="ROOF",
                color=IfcColorCandidate(source="surface_style", rgb=(0.0, 0.5, 0.0)),
                candidates=(),
            ),
            "WALL": IfcSemanticCategoryColorSummary(
                category="WALL",
                color=IfcColorCandidate(source="surface_style", rgb=(0.5, 0.5, 0.5)),
                candidates=(),
            ),
        },
        elements=(),
    )
    monkeypatch.setattr(
        service,
        "extract_ifc_color_summary",
        lambda _path: color_summary,
    )

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        time_of_day=time_of_day,
        use_ifc_color_prompt_suffix=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    params = FakeDepthStyleRenderer.instances[-1].render_calls[0]["params"]
    assert expected_time_cue in params.prompt
    assert params.prompt.index("IFC colors") < params.prompt.index(
        expected_time_cue
    )
    assert params.prompt.startswith("IFC colors")
    assert "IFC colors: green roof and gray walls." in params.prompt
    assert "white concrete facade" not in params.prompt
    assert "simple tile roof" not in params.prompt
    assert "concrete" not in params.prompt
    assert "tile" not in params.prompt
    assert "gray house facade" in params.prompt
    assert "green roof" in params.prompt
    assert "subtle brick trim" in params.prompt
    assert "simple Korean house" in params.prompt
    assert "open flat paved ground in front" in params.prompt
    assert "ground touches facade" in params.prompt
    assert "no foreground wall" in params.prompt


@pytest.mark.parametrize(
    ("time_of_day", "expected_time_cue"),
    [
        ("DAY", "during sunny daytime"),
        ("NIGHT", "night exterior"),
    ],
)
def test_run_ifc2img_photo_pipeline_can_opt_in_to_shape_lock_prompt(
    time_of_day: str,
    expected_time_cue: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """IFC shape lock prompt should be compact and opt-in only."""
    patch_runtime_semantic_context(monkeypatch)
    FakeDepthStyleRenderer.instances.clear()
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / f"out-{time_of_day.lower()}",
        preset="korean_house",
        time_of_day=time_of_day,
        use_ifc_shape_lock_prompt=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    params = FakeDepthStyleRenderer.instances[-1].render_calls[0]["params"]
    assert params.prompt.startswith("Shape.")
    assert params.prompt.index("Shape.") < params.prompt.index(expected_time_cue)
    assert "low quality" in params.negative_prompt
    assert "wrong roof" not in params.negative_prompt
    assert "misplaced windows" not in params.negative_prompt
    assert "changed silhouette" not in params.negative_prompt


def test_run_ifc2img_photo_pipeline_places_shape_lock_before_color_prompt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Shape lock should outrank color cue when both experimental knobs are enabled."""
    import ai_rendering.ifc2img.service as service

    patch_runtime_semantic_context(monkeypatch)
    FakeDepthStyleRenderer.instances.clear()
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    color_summary = IfcColorSummary(
        source_ifc_path=ifc_path,
        categories={
            "ROOF": IfcSemanticCategoryColorSummary(
                category="ROOF",
                color=IfcColorCandidate(source="surface_style", rgb=(0.0, 0.5, 0.0)),
                candidates=(),
            ),
        },
        elements=(),
    )
    monkeypatch.setattr(
        service,
        "extract_ifc_color_summary",
        lambda _path: color_summary,
    )

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        time_of_day="DAY",
        use_ifc_color_prompt_suffix=True,
        use_ifc_shape_lock_prompt=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    params = FakeDepthStyleRenderer.instances[-1].render_calls[0]["params"]
    assert params.prompt.startswith("Shape.")
    assert params.prompt.index("Shape.") < params.prompt.index("IFC colors")
    assert params.prompt.index("IFC colors") < params.prompt.index(
        "during sunny daytime"
    )


def test_run_ifc2img_photo_pipeline_opt_in_success_marks_color_preservation_applied(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """opt-in + color summary 추출 성공 시 manifest/result에 applied=True가 노출돼야 한다."""
    import ai_rendering.ifc2img.service as service
    import json

    patch_runtime_semantic_context(monkeypatch)
    FakeDepthStyleRenderer.instances.clear()
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    color_summary = IfcColorSummary(
        source_ifc_path=ifc_path,
        categories={
            "ROOF": IfcSemanticCategoryColorSummary(
                category="ROOF",
                color=IfcColorCandidate(source="surface_style", rgb=(0.0, 0.5, 0.0)),
                candidates=(),
            ),
        },
        elements=(),
    )
    monkeypatch.setattr(
        service,
        "extract_ifc_color_summary",
        lambda _path: color_summary,
    )

    result = run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        time_of_day="DAY",
        use_ifc_color_prompt_suffix=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    assert result.ifc_color_preservation_opted_in is True
    assert result.ifc_color_preservation_applied is True
    assert result.ifc_color_preservation_error is None

    manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    assert manifest["ifcColorPreservationOptedIn"] is True
    assert manifest["ifcColorPreservationApplied"] is True
    assert manifest["ifcColorPreservationError"] is None


def test_run_ifc2img_photo_pipeline_opt_in_failure_marks_color_preservation_not_applied(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """opt-in 상태에서 extract 실패 시 caller가 응답에서 fidelity 실패를 알 수 있어야 한다."""
    import ai_rendering.ifc2img.service as service
    import json

    patch_runtime_semantic_context(monkeypatch)
    FakeDepthStyleRenderer.instances.clear()
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    def _raise(_path: Path) -> IfcColorSummary:
        raise RuntimeError("parser failed: malformed IFC color block")

    monkeypatch.setattr(service, "extract_ifc_color_summary", _raise)

    result = run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        time_of_day="DAY",
        use_ifc_color_prompt_suffix=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    assert result.ifc_color_preservation_opted_in is True
    assert result.ifc_color_preservation_applied is False
    assert result.ifc_color_preservation_error is not None
    assert "parser failed" in result.ifc_color_preservation_error

    manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    assert manifest["ifcColorPreservationOptedIn"] is True
    assert manifest["ifcColorPreservationApplied"] is False
    assert "parser failed" in manifest["ifcColorPreservationError"]

    # Caller가 opt-in을 안 한 경우는 영향 없어야 한다.
    params = FakeDepthStyleRenderer.instances[-1].render_calls[0]["params"]
    assert "IFC colors" not in params.prompt


def test_run_ifc2img_photo_pipeline_no_opt_in_leaves_color_preservation_neutral(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """opt-in을 안 한 default 경로에서는 manifest의 색 보존 상태가 모두 false/none이다."""
    import json

    patch_runtime_semantic_context(monkeypatch)
    FakeDepthStyleRenderer.instances.clear()
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    result = run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        time_of_day="DAY",
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    assert result.ifc_color_preservation_opted_in is False
    assert result.ifc_color_preservation_applied is False
    assert result.ifc_color_preservation_error is None

    manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    assert manifest["ifcColorPreservationOptedIn"] is False
    assert manifest["ifcColorPreservationApplied"] is False
    assert manifest["ifcColorPreservationError"] is None


def test_run_ifc2img_photo_pipeline_keeps_default_prompt_without_color_opt_in(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Default production path should not add IFC color prompt text."""
    patch_runtime_semantic_context(monkeypatch)
    FakeDepthStyleRenderer.instances.clear()
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="korean_house",
        time_of_day="DAY",
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    params = FakeDepthStyleRenderer.instances[-1].render_calls[0]["params"]
    assert "IFC colors" not in params.prompt
    assert "Preserve exact IFC silhouette" not in params.prompt
    assert "wrong roof" not in params.negative_prompt
    assert "white concrete facade" in params.prompt
    assert "simple tile roof" in params.prompt


@pytest.mark.parametrize(
    ("time_of_day", "expected_preset_time_of_day"),
    [
        ("DAY", "day"),
        ("NIGHT", "night"),
    ],
)
def test_run_ifc2img_photo_pipeline_calls_load_preset_with_normalized_time(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    time_of_day: str,
    expected_preset_time_of_day: str,
) -> None:
    """Pipeline passes normalized day/night values to load_preset."""
    import ai_rendering.ifc2img.service as service

    calls: list[tuple[str, str]] = []
    original_load_preset = service.load_preset

    patch_runtime_semantic_context(monkeypatch)

    def spy_load_preset(name: str, preset_time_of_day: str = "day") -> object:
        calls.append((name, preset_time_of_day))
        return original_load_preset(name, preset_time_of_day)

    monkeypatch.setattr(service, "load_preset", spy_load_preset)
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / f"out-{time_of_day.lower()}",
        preset="korean_house",
        time_of_day=time_of_day,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    assert calls == [("korean_house", expected_preset_time_of_day)]


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
    assert helper_manifest["timeOfDay"] == "DAY"
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


def test_worker_schema_types_match_expected_ifc2img_contract() -> None:
    """Worker 연결 전 요청/응답 JSON에서 고정해야 할 필드를 타입으로 확인한다."""
    request_hints = get_type_hints(Ifc2ImgWorkerRequest)
    success_hints = get_type_hints(Ifc2ImgWorkerSuccessResponse)
    error_hints = get_type_hints(Ifc2ImgWorkerErrorResponse)

    assert IFC2IMG_WORKER_COMMAND_TYPE == "SD_RENDER_GENERATE"
    assert IFC2IMG_WORKER_RENDER_MODE == "ifc2img"
    assert set(request_hints) == {
        "commandType",
        "input",
        "expectedOutput",
        "payload",
    }
    assert set(success_hints) == {
        "status",
        "renderMode",
        "preset",
        "timeOfDay",
        "manifestStorageUrl",
        "photos",
    }
    assert set(error_hints) == {
        "status",
        "renderMode",
        "errorCode",
        "message",
    }


def test_storage_adapter_protocol_and_output_url_helper(tmp_path: Path) -> None:
    """Storage adapter는 worker가 IFC 다운로드와 결과 업로드를 mock 가능하게 만드는 경계다."""
    adapter: Ifc2ImgStorageAdapter = FakeStorageAdapter()
    ifc_path = adapter.download_ifc(
        "s3://bucket/input/model.ifc",
        tmp_path / "source.ifc",
    )
    photo_url = build_photo_output_storage_url(
        "s3://bucket/output/job-1/",
        "photo_front_diagonal_left.png",
    )
    manifest_url = build_photo_output_storage_url(
        "s3://bucket/output/job-1",
        "manifest.json",
    )

    assert ifc_path.read_text(encoding="utf-8") == "ISO-10303-21;"
    assert photo_url == "s3://bucket/output/job-1/photo_front_diagonal_left.png"
    assert manifest_url == "s3://bucket/output/job-1/manifest.json"
    assert adapter.upload_file(
        tmp_path / "photo_front_diagonal_left.png",
        photo_url,
        content_type=PHOTO_PNG_CONTENT_TYPE,
    ) == photo_url
    assert adapter.upload_file(
        tmp_path / "manifest.json",
        manifest_url,
        content_type=PHOTO_MANIFEST_CONTENT_TYPE,
    ) == manifest_url


@pytest.mark.parametrize("filename", ["nested/photo.png", r"nested\photo.png", ""])
def test_photo_output_storage_url_rejects_non_plain_filenames(filename: str) -> None:
    """Storage prefix helper는 worker가 예상 밖의 하위 경로를 섞지 않게 막는다."""
    with pytest.raises(ValueError):
        build_photo_output_storage_url("s3://bucket/output", filename)


def test_worker_handler_downloads_runs_pipeline_and_uploads_outputs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Worker handler는 storage 입출력과 로컬 photo pipeline을 한 번에 연결한다."""
    import ai_rendering.ifc2img.service as service

    logger = FakeLogger()
    monkeypatch.setattr(service, "_logger", logger)
    storage = FakeStorageAdapter()
    request: Ifc2ImgWorkerRequest = {
        "commandType": "SD_RENDER_GENERATE",
        "input": {"sourceIfcStorageUrl": "s3://bucket/input/model.ifc"},
        "expectedOutput": {
            "renderManifestStorageUrl": "s3://bucket/output/job-1/manifest.v1.json",
            "renderPhotoFrontDiagonalLeftStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_left.png"
            ),
            "renderPhotoFrontDiagonalRightStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_right.png"
            ),
        },
        "payload": {
            "renderMode": "ifc2img",
            "preset": "korean_house",
            "timeOfDay": "NIGHT",
        },
    }
    pipeline_calls: list[tuple[Path, Path, str, object | None]] = []

    def fake_pipeline(
        ifc_path: Path,
        output_dir: Path,
        *,
        preset: str,
        time_of_day: object | None = None,
    ) -> Ifc2ImgPhotoJobResult:
        pipeline_calls.append((ifc_path, output_dir, preset, time_of_day))
        output_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = output_dir / "manifest.json"
        photo_left = output_dir / "photo_front_diagonal_left.png"
        photo_right = output_dir / "photo_front_diagonal_right.png"
        depth_left = output_dir / "depth_front_diagonal_left.png"
        depth_right = output_dir / "depth_front_diagonal_right.png"
        manifest_path.write_text("{}", encoding="utf-8")
        for path in (photo_left, photo_right, depth_left, depth_right):
            path.write_bytes(b"png")
        outputs = (
            Ifc2ImgPhotoViewResult(
                view="front_diagonal_left",
                internal_view=IFCView.FRONT_DIAGONAL_LEFT,
                photo_path=photo_left,
                depth_path=depth_left,
                width=8,
                height=4,
            ),
            Ifc2ImgPhotoViewResult(
                view="front_diagonal_right",
                internal_view=IFCView.FRONT_DIAGONAL_RIGHT,
                photo_path=photo_right,
                depth_path=depth_right,
                width=8,
                height=4,
            ),
        )
        return Ifc2ImgPhotoJobResult(
            preset=preset,
            output_dir=output_dir,
            outputs=outputs,
            manifest_path=manifest_path,
            time_of_day="NIGHT" if time_of_day == "NIGHT" else "DAY",
        )

    response = handle_ifc2img_worker_request(
        request,
        storage,
        tmp_path / "work",
        pipeline=fake_pipeline,
    )

    assert storage.downloads == [
        ("s3://bucket/input/model.ifc", tmp_path / "work" / "input" / "source.ifc")
    ]
    assert pipeline_calls == [
        (
            tmp_path / "work" / "input" / "source.ifc",
            tmp_path / "work" / "output",
            "korean_house",
            "NIGHT",
        )
    ]
    assert response == {
        "status": "SUCCESS",
        "renderMode": "ifc2img",
        "preset": "korean_house",
        "timeOfDay": "NIGHT",
        "manifestStorageUrl": "s3://bucket/output/job-1/manifest.v1.json",
        "photos": [
            {
                "view": "front_diagonal_left",
                "storageUrl": "s3://bucket/output/job-1/photo_front_diagonal_left.png",
                "width": 8,
                "height": 4,
            },
            {
                "view": "front_diagonal_right",
                "storageUrl": "s3://bucket/output/job-1/photo_front_diagonal_right.png",
                "width": 8,
                "height": 4,
            },
        ],
    }
    assert storage.uploads == [
        (
            tmp_path / "work" / "output" / "manifest.json",
            "s3://bucket/output/job-1/manifest.v1.json",
            PHOTO_MANIFEST_CONTENT_TYPE,
        ),
        (
            tmp_path / "work" / "output" / "photo_front_diagonal_left.png",
            "s3://bucket/output/job-1/photo_front_diagonal_left.png",
            PHOTO_PNG_CONTENT_TYPE,
        ),
        (
            tmp_path / "work" / "output" / "photo_front_diagonal_right.png",
            "s3://bucket/output/job-1/photo_front_diagonal_right.png",
            PHOTO_PNG_CONTENT_TYPE,
        ),
    ]
    events = [event for event, _ in logger.calls]
    assert "ifc2img_download_started" in events
    assert "ifc2img_pipeline_completed" in events
    assert events.count("ifc2img_upload_started") == 3
    assert events.count("ifc2img_upload_completed") == 3
    assert "ifc2img_worker_request_completed" in events


def test_worker_handler_runs_semantic_pipeline_with_downloaded_fixture(
    ifc4_fixture: Path,
    tmp_path: Path,
) -> None:
    """Worker E2E: downloaded IFC fixture should drive runtime semantics."""

    class FixtureStorageAdapter(FakeStorageAdapter):
        def download_ifc(self, source_storage_url: str, destination_path: Path) -> Path:
            self.downloads.append((source_storage_url, destination_path))
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            destination_path.write_bytes(ifc4_fixture.read_bytes())
            return destination_path

    storage = FixtureStorageAdapter()
    request: Ifc2ImgWorkerRequest = {
        "commandType": "SD_RENDER_GENERATE",
        "input": {"sourceIfcStorageUrl": "s3://bucket/input/shinchan.ifc"},
        "expectedOutput": {
            "renderManifestStorageUrl": "s3://bucket/output/job-1/manifest.v1.json",
            "renderPhotoFrontDiagonalLeftStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_left.png"
            ),
            "renderPhotoFrontDiagonalRightStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_right.png"
            ),
        },
        "payload": {
            "renderMode": "ifc2img",
            "preset": "korean_house",
            "timeOfDay": "DAY",
        },
    }

    def semantic_pipeline(
        ifc_path: Path,
        output_dir: Path,
        *,
        preset: str,
        time_of_day: object | None = None,
    ) -> Ifc2ImgPhotoJobResult:
        return run_ifc2img_photo_pipeline(
            ifc_path,
            output_dir,
            preset=preset,
            time_of_day=time_of_day,
            debug_artifacts=True,
            depth_style_renderer_cls=FakeDepthStyleRenderer,
        )

    response = handle_ifc2img_worker_request(
        request,
        storage,
        tmp_path / "work",
        pipeline=semantic_pipeline,
    )

    assert storage.downloads == [
        (
            "s3://bucket/input/shinchan.ifc",
            tmp_path / "work" / "input" / "source.ifc",
        )
    ]
    assert response["status"] == "SUCCESS"
    assert response["timeOfDay"] == "DAY"
    assert [photo["view"] for photo in response["photos"]] == list(PUBLIC_PHOTO_VIEWS)
    assert storage.uploads == [
        (
            tmp_path / "work" / "output" / "manifest.json",
            "s3://bucket/output/job-1/manifest.v1.json",
            PHOTO_MANIFEST_CONTENT_TYPE,
        ),
        (
            tmp_path / "work" / "output" / "photo_front_diagonal_left.png",
            "s3://bucket/output/job-1/photo_front_diagonal_left.png",
            PHOTO_PNG_CONTENT_TYPE,
        ),
        (
            tmp_path / "work" / "output" / "photo_front_diagonal_right.png",
            "s3://bucket/output/job-1/photo_front_diagonal_right.png",
            PHOTO_PNG_CONTENT_TYPE,
        ),
    ]
    uploaded_paths = [local_path for local_path, _, _ in storage.uploads]
    assert tmp_path / "work" / "output" / "depth_front_diagonal_left.png" not in uploaded_paths
    assert tmp_path / "work" / "output" / "depth_front_diagonal_right.png" not in uploaded_paths
    assert not any("debug" in local_path.parts for local_path in uploaded_paths)

    debug_manifest_path = tmp_path / "work" / "output" / "debug" / "debug_manifest.json"
    debug_manifest = json.loads(debug_manifest_path.read_text(encoding="utf-8"))
    semantic_summary = debug_manifest["ifcSemanticSummary"]
    assert semantic_summary["sourceIfcPath"] == str(
        tmp_path / "work" / "input" / "source.ifc"
    )
    assert semantic_summary["categories"]["FLOOR"]["count"] >= 1
    assert semantic_summary["categories"]["ROOF"]["count"] >= 1
    assert semantic_summary["categories"]["WALL"]["count"] >= 1
    assert semantic_summary["categories"]["WINDOW"]["count"] >= 1
    assert semantic_summary["categories"]["DOOR"]["count"] >= 1
    assert debug_manifest["semanticGroundSelection"] == {
        "groundSource": "semantic_floor",
        "groundZ": pytest.approx(0.0),
        "semanticGroundCandidate": pytest.approx(0.0),
    }
    assert debug_manifest["semanticFrontCameraSelection"] == {
        "source": "semantic_main_door_deferred_mesh_alignment",
        "mainDoorEntityId": 703,
        "frontVector": [0.0, -1.0, 0.0],
        "overriddenViews": [],
    }
    assert "ifcSemanticSummaryError" not in debug_manifest


def test_worker_handler_stops_without_uploads_when_semantic_pipeline_fails(
    tmp_path: Path,
) -> None:
    """Semantic extraction failure is raised before any worker output upload."""
    storage = FakeStorageAdapter()
    request: Ifc2ImgWorkerRequest = {
        "commandType": "SD_RENDER_GENERATE",
        "input": {"sourceIfcStorageUrl": "s3://bucket/input/model.ifc"},
        "expectedOutput": {
            "renderManifestStorageUrl": "s3://bucket/output/job-1/manifest.v1.json",
            "renderPhotoFrontDiagonalLeftStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_left.png"
            ),
            "renderPhotoFrontDiagonalRightStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_right.png"
            ),
        },
        "payload": {"renderMode": "ifc2img", "preset": "korean_house"},
    }

    def semantic_failure_pipeline(*args: object, **kwargs: object) -> None:
        raise IFCRenderError(
            "IFC semantic context load failed after 3 attempts for source.ifc"
        )

    with pytest.raises(IFCRenderError, match="3 attempts"):
        handle_ifc2img_worker_request(
            request,
            storage,
            tmp_path / "work",
            pipeline=semantic_failure_pipeline,
        )

    assert storage.downloads == [
        (
            "s3://bucket/input/model.ifc",
            tmp_path / "work" / "input" / "source.ifc",
        )
    ]
    assert storage.uploads == []


def test_worker_handler_stops_before_pipeline_when_ifc_download_fails(
    tmp_path: Path,
) -> None:
    """IFC download failure is raised before semantic/render pipeline starts."""

    class FailingDownloadStorage(FakeStorageAdapter):
        def download_ifc(
            self,
            source_storage_url: str,
            destination_path: Path,
        ) -> Path:
            self.downloads.append((source_storage_url, destination_path))
            raise Ifc2ImgStorageError(
                code="IFC_SOURCE_DOWNLOAD_FAILED",
                message="failed to download source IFC",
            )

    storage = FailingDownloadStorage()
    request: Ifc2ImgWorkerRequest = {
        "commandType": "SD_RENDER_GENERATE",
        "input": {"sourceIfcStorageUrl": "s3://bucket/input/missing.ifc"},
        "expectedOutput": {
            "renderManifestStorageUrl": "s3://bucket/output/job-1/manifest.v1.json",
            "renderPhotoFrontDiagonalLeftStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_left.png"
            ),
            "renderPhotoFrontDiagonalRightStorageUrl": (
                "s3://bucket/output/job-1/photo_front_diagonal_right.png"
            ),
        },
        "payload": {"renderMode": "ifc2img", "preset": "korean_house"},
    }
    pipeline_calls: list[object] = []

    def fake_pipeline(*args: object, **kwargs: object) -> None:
        pipeline_calls.append((args, kwargs))

    with pytest.raises(Ifc2ImgStorageError, match="failed to download"):
        handle_ifc2img_worker_request(
            request,
            storage,
            tmp_path / "work",
            pipeline=fake_pipeline,
        )

    assert storage.downloads == [
        (
            "s3://bucket/input/missing.ifc",
            tmp_path / "work" / "input" / "source.ifc",
        )
    ]
    assert pipeline_calls == []
    assert storage.uploads == []


@pytest.mark.parametrize(
    ("worker_request", "message"),
    [
        (
            {
                "commandType": "OTHER_COMMAND",
                "input": {"sourceIfcStorageUrl": "s3://bucket/input/model.ifc"},
                "expectedOutput": {"renderImageStorageUrl": "s3://bucket/output/job-1/"},
                "payload": {"renderMode": "ifc2img", "preset": "korean_house"},
            },
            "unsupported commandType",
        ),
        (
            {
                "commandType": "SD_RENDER_GENERATE",
                "input": {"sourceIfcStorageUrl": "s3://bucket/input/model.ifc"},
                "expectedOutput": {"renderImageStorageUrl": "s3://bucket/output/job-1/"},
                "payload": {"renderMode": "img2img", "preset": "korean_house"},
            },
            "unsupported renderMode",
        ),
    ],
)
def test_worker_handler_rejects_unsupported_request_before_side_effects(
    worker_request: dict[str, object],
    message: str,
    tmp_path: Path,
) -> None:
    """지원하지 않는 worker 요청은 storage/pipeline 실행 전에 실패해야 한다."""
    storage = FakeStorageAdapter()
    pipeline_calls: list[object] = []

    def fake_pipeline(*args: object, **kwargs: object) -> None:
        pipeline_calls.append((args, kwargs))

    with pytest.raises(IFCRenderError, match=message):
        handle_ifc2img_worker_request(
            worker_request,  # type: ignore[arg-type]
            storage,
            tmp_path / "work",
            pipeline=fake_pipeline,
        )

    assert storage.downloads == []
    assert storage.uploads == []
    assert pipeline_calls == []


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
    assert not (manifest_path.parent / ".manifest.json.tmp").exists()


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


def test_run_ifc2img_photo_pipeline_rejects_semantic_failure_before_renderers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Runtime semantic failure stops the job before depth/style renderers run."""
    import ai_rendering.ifc2img.service as service

    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    def fail_semantic_context(ifc_path: Path, *, max_attempts: int = 3) -> object:
        raise IFCRenderError(f"semantic failed for {ifc_path.name}")

    monkeypatch.setattr(
        service,
        "load_runtime_semantic_context",
        fail_semantic_context,
    )

    with pytest.raises(IFCRenderError, match="semantic failed"):
        run_ifc2img_photo_pipeline(
            ifc_path,
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
    defaults = PHOTO_DEPTH_RENDER_DEFAULTS
    assert renderer.kwargs["width"] == defaults.width
    assert renderer.kwargs["height"] == defaults.height
    assert renderer.kwargs["iter_tolerance"] == defaults.iter_tolerance
    assert renderer.kwargs["view_target_overrides"] == {
        IFCView.FRONT_DIAGONAL_RIGHT: defaults.front_diagonal_target_ratio,
        IFCView.FRONT_DIAGONAL_LEFT: defaults.front_diagonal_target_ratio,
    }
    assert renderer.kwargs["view_ground_extent_overrides"] == {
        IFCView.FRONT_DIAGONAL_RIGHT: defaults.front_diagonal_ground_extent_factor,
        IFCView.FRONT_DIAGONAL_LEFT: defaults.front_diagonal_ground_extent_factor,
    }
    assert renderer.kwargs["view_camera_overrides"] is None
    assert renderer.kwargs["ground_z_override"] is None


def test_create_photo_ifc_renderer_passes_view_camera_overrides() -> None:
    """Renderer factory forwards semantic camera overrides to IFCRenderer."""
    camera = CameraParams(front=(0.0, -1.0, 0.0), up=(0.0, 0.0, 1.0), zoom=0.4)
    overrides = {IFCView.FRONT_DIAGONAL_LEFT: camera}

    renderer = create_photo_ifc_renderer(
        FakeIFCRenderer,
        view_camera_overrides=overrides,
    )

    assert renderer.kwargs["view_camera_overrides"] == overrides


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


def test_render_photo_view_geometry_control_overrides_semantic_options() -> None:
    """Geometry control should use the second control slot instead of semantic control."""
    renderer = FakeDepthStyleRenderer()
    depth = Image.new("L", (8, 4), 64)
    geometry_control = Image.new("RGB", (8, 4), "white")

    render_photo_view(
        renderer,
        depth,
        object(),
        preset="korean_house",
        view=IFCView.FRONT_DIAGONAL_LEFT,
        geometry_control_image=geometry_control,
    )

    kwargs = renderer.render_calls[0]["kwargs"]
    assert kwargs["geometry_control_image"] is geometry_control
    assert kwargs["use_front_diagonal_ground_semantic_control"] is False
    assert kwargs["use_front_diagonal_ground_plane_aware_semantic_control"] is False
    assert kwargs["use_front_diagonal_ground_plane_control_attenuation"] is True


def test_run_ifc2img_photo_pipeline_applies_front_diagonal_semantic_options(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Korean house FRONT_DIAGONAL views require semantic ControlNet and resolver options."""
    patch_runtime_semantic_context(monkeypatch)
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


def test_run_ifc2img_photo_pipeline_can_pass_depth_edge_geometry_control(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Depth-edge geometry mode should stay opt-in and pass geometry control images."""
    patch_runtime_semantic_context(monkeypatch)
    FakeDepthStyleRenderer.instances.clear()
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="scandinavian",
        geometry_control_input_mode="depth_edge",
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    style_renderer = FakeDepthStyleRenderer.instances[-1]
    assert "semantic_controlnet_model_id" in style_renderer.kwargs
    for call in style_renderer.render_calls:
        geometry_control = call["kwargs"]["geometry_control_image"]
        assert isinstance(geometry_control, Image.Image)
        assert geometry_control.mode == "RGB"
        assert geometry_control.size == call["depth_size"]


def test_run_ifc2img_photo_pipeline_records_geometry_control_mode_in_debug_manifest(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Debug manifest should record selected geometry control mode for artifacts."""
    patch_runtime_semantic_context(monkeypatch)
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    output_dir = tmp_path / "out"

    run_ifc2img_photo_pipeline(
        ifc_path,
        output_dir,
        preset="scandinavian",
        geometry_control_input_mode="depth_edge",
        debug_artifacts=True,
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    debug_manifest = json.loads(
        (output_dir / "debug" / "debug_manifest.json").read_text(encoding="utf-8")
    )
    assert debug_manifest["geometryControlInputMode"] == "depth_edge"
    for view_payload in debug_manifest["views"]:
        assert view_payload["geometryControlInputMode"] == "depth_edge"
        assert view_payload["usesGeometryControlImage"] is True
        assert view_payload["geometryControlImageSize"] == [8, 4]


def test_run_ifc2img_photo_pipeline_can_pass_element_composite_geometry_control(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Element-composite mode should reuse rendered element masks as style input."""
    import ai_rendering.ifc2img.service as service

    patch_runtime_semantic_context(monkeypatch)
    FakeDepthStyleRenderer.instances.clear()
    ifc_path = tmp_path / "input.ifc"
    ifc_path.write_text("ISO-10303-21;", encoding="utf-8")
    geometry = Ifc2ImgDebugGeometry(
        mesh=None,
        center=None,
        base_bounds=None,
        orientation=None,
        ground_z=None,
    )

    monkeypatch.setattr(service, "_load_debug_geometry", lambda _ifc_path: geometry)
    monkeypatch.setattr(
        service,
        "_build_debug_view_payload",
        lambda **_kwargs: {
            "camera": {
                "eye": [0.0, 0.0, 1.0],
                "lookAt": [0.0, 0.0, 0.0],
                "up": [0.0, 0.0, 1.0],
            }
        },
    )
    monkeypatch.setattr(
        service,
        "_render_element_composite_control_image",
        lambda **kwargs: Image.new("RGB", (kwargs["width"], kwargs["height"]), "red"),
    )

    run_ifc2img_photo_pipeline(
        ifc_path,
        tmp_path / "out",
        preset="scandinavian",
        geometry_control_input_mode="element_composite",
        ifc_renderer_cls=FakeIFCRenderer,
        depth_style_renderer_cls=FakeDepthStyleRenderer,
    )

    style_renderer = FakeDepthStyleRenderer.instances[-1]
    assert "semantic_controlnet_model_id" in style_renderer.kwargs
    for call in style_renderer.render_calls:
        geometry_control = call["kwargs"]["geometry_control_image"]
        assert isinstance(geometry_control, Image.Image)
        assert geometry_control.getpixel((0, 0)) == (255, 0, 0)


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
