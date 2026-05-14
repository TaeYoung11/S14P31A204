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
    Ifc2ImgStorageAdapter,
    Ifc2ImgWorkerErrorResponse,
    Ifc2ImgWorkerRequest,
    Ifc2ImgWorkerSuccessResponse,
    PhotoViewAlias,
    PUBLIC_PHOTO_VIEWS,
    PUBLIC_TO_INTERNAL_VIEW,
    build_photo_manifest,
    build_photo_output_storage_url,
    create_photo_ifc_renderer,
    create_photo_style_renderer,
    handle_ifc2img_worker_request,
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
    assert [view["view"] for view in debug_manifest["views"]] == list(
        PUBLIC_PHOTO_VIEWS
    )
    first_debug_view = debug_manifest["views"][0]
    assert first_debug_view["actualFillRatio"] == 1.0
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


def test_run_ifc2img_photo_pipeline_logs_depth_and_style_stages(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pipeline logs the expensive depth and style render milestones."""
    import ai_rendering.ifc2img.service as service

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
) -> None:
    """Pipeline should resolve NIGHT to the night preset prompt."""
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
