"""ifc2img의 depth 렌더링, IFC mesh 로딩, view 옵션을 검증한다.

이 파일은 Open3D visualizer와 ifcopenshell 호출을 대부분 mock으로 막아 GPU나 렌더링 창 없이
핵심 로직만 빠르게 확인한다. 실제 IFC4 fixture를 쓰는 테스트는 schema 게이트와 mesh 생성이
통합 경로에서 동작하는지 확인하는 최소 범위로 유지한다.
"""

# ruff: noqa: E501

from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PIL import Image

from ai_rendering.ifc2img import IFCRenderError, IFCRenderer, IFCView
from ai_rendering.ifc2img.geometry import (
    GROUND_EXTENT_FACTOR,
    _add_ground_plane,
    _align_walls_to_axes,
    attach_ground_plane_to_mesh,
    load_mesh,
)
from ai_rendering.ifc2img.views import (
    DEFAULT_RENDER_VIEWS,
    DISPATCH_LARGE_FACTOR,
    DISPATCH_MEDIUM_FACTOR,
    VIEW_CAMERAS,
    VIEW_PROMPT_PREFIXES,
    VIEW_PROMPT_SUFFIXES,
    VIEW_TARGET_RATIOS,
    AutoZoomMode,
    CameraParams,
    build_view_prompt,
    resolve_target_ratio_for_mesh,
)


# --- depth buffer를 PIL control image로 변환하는 순수 함수 테스트 ---


def test_depth_to_image_shape_preserved() -> None:
    """depth 배열의 높이/너비가 PIL 이미지 크기로 올바르게 변환되는지 확인한다.
    
    `_depth_to_image`는 numpy 배열의 shape를 `(height, width)`로 받지만 PIL 이미지는
    `(width, height)` 순서의 size를 쓰므로, 이 변환이 뒤집히지 않아야 한다.
    """
    h, w = 448, 768
    depth = np.full((h, w), 5.0, dtype=np.float32)

    img = IFCRenderer._depth_to_image(depth)

    assert img.mode == "L"
    assert img.size == (w, h)


def test_depth_to_image_background_is_black() -> None:
    """depth 값이 0인 배경 영역은 결과 이미지에서도 검정으로 남아야 한다.
    
    렌더러의 depth buffer에서 0은 geometry가 없는 픽셀을 뜻한다. 이 영역이 중간 밝기로
    섞이면 이후 ControlNet 입력에서 배경을 건물처럼 오해할 수 있으므로 명확히 0으로 둔다.
    """
    depth = np.zeros((10, 10), dtype=np.float32)
    depth[5, 5] = 3.0
    depth[5, 6] = 7.0

    img = IFCRenderer._depth_to_image(depth)
    arr = np.array(img)

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    bg_mask = depth == 0
    assert arr[bg_mask].max() == 0


def test_depth_to_image_closer_is_brighter() -> None:
    """카메라에 가까운 geometry가 더 밝게 정규화되는지 확인한다.
    
    현재 depth control 이미지는 가까운 표면을 밝게, 먼 표면을 어둡게 표현한다. 이 방향이
    뒤집히면 모델이 전후 관계를 반대로 해석할 수 있다.
    """
    depth = np.zeros((4, 4), dtype=np.float32)
    depth[0, 0] = 1.0
    depth[0, 1] = 5.0  # 以묎컙
    depth[0, 2] = 10.0

    img = IFCRenderer._depth_to_image(depth)
    arr = np.array(img)

    assert arr[0, 0] > arr[0, 1] > arr[0, 2]
    assert arr[0, 0] == 255
    assert arr[0, 2] == 0


def test_depth_to_image_uniform_depth() -> None:
    """모든 geometry가 같은 depth일 때도 안정적으로 흰색 geometry를 만든다.
    
    `d_min == d_max`인 경우 정규화 분모가 0이 될 수 있으므로, 단일 깊이 평면은 흰색으로
    처리하고 배경은 검정으로 유지하는 fallback을 검증한다.
    """
    depth = np.zeros((4, 4), dtype=np.float32)
    depth[1:3, 1:3] = 5.0

    img = IFCRenderer._depth_to_image(depth)
    arr = np.array(img)

    geom_mask = depth > 0
    assert (arr[geom_mask] == 255).all()
    assert (arr[~geom_mask] == 0).all()


def test_depth_to_image_all_background_raises() -> None:
    """geometry가 하나도 없는 depth buffer는 렌더 실패로 처리해야 한다.
    
    모든 값이 0이면 IFC가 보이지 않았거나 렌더링 카메라가 잘못 잡힌 상태다. 빈 control image를
    조용히 저장하지 않고 `IFCRenderError`로 알려야 한다.
    """
    depth = np.zeros((10, 10), dtype=np.float32)

    with pytest.raises(IFCRenderError, match="geometry"):
        IFCRenderer._depth_to_image(depth)


# --- IFCRenderer와 Open3D Visualizer 호출을 mock으로 검증하는 테스트 ---


def test_renderer_accepts_view_camera_overrides() -> None:
    """Renderer stores per-view camera overrides without mutating global cameras."""
    camera = CameraParams(front=(0.0, -1.0, 0.0), up=(0.0, 0.0, 1.0), zoom=0.4)
    overrides = {IFCView.FRONT_DIAGONAL_LEFT: camera}

    renderer = IFCRenderer(view_camera_overrides=overrides)
    overrides.clear()

    assert renderer.view_camera_overrides == {IFCView.FRONT_DIAGONAL_LEFT: camera}
    assert VIEW_CAMERAS[IFCView.FRONT_DIAGONAL_LEFT] is not camera


def test_renderer_resolves_view_camera_override() -> None:
    """Camera override should be used for the matching view only."""
    camera = CameraParams(front=(0.0, -1.0, 0.0), up=(0.0, 0.0, 1.0), zoom=0.4)
    renderer = IFCRenderer(
        view_camera_overrides={IFCView.FRONT_DIAGONAL_LEFT: camera}
    )

    assert renderer._resolve_camera(IFCView.FRONT_DIAGONAL_LEFT) is camera
    assert renderer._resolve_camera(IFCView.FRONT_DIAGONAL_RIGHT) == VIEW_CAMERAS[
        IFCView.FRONT_DIAGONAL_RIGHT
    ]


def _make_fake_depth_buffer(value: float = 5.0) -> np.ndarray:
    """Open3D depth capture mock이 반환할 간단한 depth buffer를 만든다."""
    arr = np.zeros((448, 768), dtype=np.float32)
    arr[100:300, 200:500] = value
    return arr


def _make_fake_render_image() -> Image.Image:
    return Image.fromarray(np.full((448, 768), 255, dtype=np.uint8), mode="L")


def test_renderer_backend_raycast_env_forces_offscreen(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """IFC2IMG_RENDER_BACKEND=raycast uses the offscreen path."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])
    expected = _make_fake_render_image()

    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "raycast")

    with (
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch.object(IFCRenderer, "_is_container_like_runtime", return_value=False),
        patch.object(IFCRenderer, "_render_mesh_offscreen", return_value=expected) as offscreen,
        patch.object(IFCRenderer, "_render_mesh_windowed") as windowed,
    ):
        renderer = IFCRenderer()
        result = renderer._render_mesh(
            fake_mesh,
            fake_mesh,
            fake_center,
            VIEW_CAMERAS[IFCView.FRONT],
            IFCView.FRONT,
        )

    assert result is expected
    offscreen.assert_called_once()
    windowed.assert_not_called()


def test_renderer_backend_raycast_receives_resolved_camera(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Raycast path should receive the same camera resolved for the view."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])
    expected = _make_fake_render_image()
    camera = CameraParams(front=(0.0, -1.0, 0.0), up=(0.0, 0.0, 1.0), zoom=0.4)

    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "raycast")

    with patch.object(
        IFCRenderer, "_render_mesh_offscreen", return_value=expected
    ) as offscreen:
        renderer = IFCRenderer()
        result = renderer._render_mesh(
            fake_mesh,
            fake_mesh,
            fake_center,
            camera,
            IFCView.FRONT_DIAGONAL_LEFT,
        )

    assert result is expected
    assert offscreen.call_args.args[2] is camera


def test_renderer_backend_visualizer_env_forces_windowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """IFC2IMG_RENDER_BACKEND=visualizer keeps the legacy Visualizer path."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])
    expected = _make_fake_render_image()

    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")

    with (
        patch.object(IFCRenderer, "_is_headless", return_value=True),
        patch.object(IFCRenderer, "_is_container_like_runtime", return_value=True),
        patch.object(IFCRenderer, "_render_mesh_offscreen") as offscreen,
        patch.object(IFCRenderer, "_render_mesh_windowed", return_value=expected) as windowed,
    ):
        renderer = IFCRenderer()
        result = renderer._render_mesh(
            fake_mesh,
            fake_mesh,
            fake_center,
            VIEW_CAMERAS[IFCView.FRONT],
            IFCView.FRONT,
        )

    assert result is expected
    windowed.assert_called_once()
    offscreen.assert_not_called()


def test_renderer_backend_visualizer_receives_resolved_camera(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Visualizer path should receive the same camera resolved for the view."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])
    expected = _make_fake_render_image()
    camera = CameraParams(front=(0.0, -1.0, 0.0), up=(0.0, 0.0, 1.0), zoom=0.4)

    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")

    with (
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch.object(IFCRenderer, "_is_container_like_runtime", return_value=False),
        patch.object(IFCRenderer, "_render_mesh_windowed", return_value=expected) as windowed,
    ):
        renderer = IFCRenderer()
        result = renderer._render_mesh(
            fake_mesh,
            fake_mesh,
            fake_center,
            camera,
            IFCView.FRONT_DIAGONAL_LEFT,
        )

    assert result is expected
    assert windowed.call_args.args[2] is camera


def test_renderer_backend_auto_uses_raycast_in_container_like_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """auto prefers raycast in Docker/CI-like runtimes even when DISPLAY exists."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])
    expected = _make_fake_render_image()

    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "auto")

    with (
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch.object(IFCRenderer, "_is_container_like_runtime", return_value=True),
        patch.object(IFCRenderer, "_render_mesh_offscreen", return_value=expected) as offscreen,
        patch.object(IFCRenderer, "_render_mesh_windowed") as windowed,
    ):
        renderer = IFCRenderer()
        result = renderer._render_mesh(
            fake_mesh,
            fake_mesh,
            fake_center,
            VIEW_CAMERAS[IFCView.FRONT],
            IFCView.FRONT,
        )

    assert result is expected
    offscreen.assert_called_once()
    windowed.assert_not_called()


def test_renderer_backend_auto_falls_back_to_raycast_when_visualizer_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """auto retries raycast when Visualizer initialization fails."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])
    expected = _make_fake_render_image()

    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "auto")

    with (
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch.object(IFCRenderer, "_is_container_like_runtime", return_value=False),
        patch.object(
            IFCRenderer,
            "_render_mesh_windowed",
            side_effect=IFCRenderError("Visualizer render option is None."),
        ) as windowed,
        patch.object(IFCRenderer, "_render_mesh_offscreen", return_value=expected) as offscreen,
    ):
        renderer = IFCRenderer()
        result = renderer._render_mesh(
            fake_mesh,
            fake_mesh,
            fake_center,
            VIEW_CAMERAS[IFCView.FRONT],
            IFCView.FRONT,
        )

    assert result is expected
    windowed.assert_called_once()
    offscreen.assert_called_once()


def test_renderer_backend_invalid_env_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "bogus")

    with pytest.raises(IFCRenderError, match="IFC2IMG_RENDER_BACKEND"):
        IFCRenderer._resolve_render_backend()


def test_renderer_offscreen_uses_tensor_pinhole_rays() -> None:
    """RaycastingScene.create_rays_pinhole receives fov, tensors, and dimensions."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]], dtype=np.float32)
    fake_center = np.array([0.0, 0.0, 0.0])

    class FakeHit:
        def numpy(self) -> np.ndarray:
            return np.array([[np.inf, 2.0], [3.0, np.inf]], dtype=np.float32)

    with patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d:
        scene = MagicMock()
        mock_o3d.t.geometry.RaycastingScene.return_value = scene
        mock_o3d.t.geometry.TriangleMesh.from_legacy.return_value = MagicMock()
        mock_o3d.core.Tensor.side_effect = lambda data, **_: np.asarray(data)
        mock_o3d.t.geometry.RaycastingScene.create_rays_pinhole.return_value = "rays"
        scene.cast_rays.return_value = {"t_hit": FakeHit()}

        renderer = IFCRenderer(width=2, height=2)
        image = renderer._render_mesh_offscreen(
            fake_mesh,
            fake_center,
            VIEW_CAMERAS[IFCView.FRONT],
            initial_zoom=0.5,
            target_ratio=0.2,
        )

    mock_o3d.t.geometry.RaycastingScene.create_rays_pinhole.assert_called_once()
    args = mock_o3d.t.geometry.RaycastingScene.create_rays_pinhole.call_args.args
    assert args[0] == 60.0
    assert args[1].shape == (3,)
    assert args[2].shape == (3,)
    assert args[3].shape == (3,)
    assert args[4:] == (2, 2)
    assert image.mode == "L"
    assert image.size == (2, 2)


def test_renderer_calls_depth_buffer(monkeypatch: pytest.MonkeyPatch) -> None:
    """IFCRenderer가 화면 RGB가 아니라 depth float buffer를 캡처하는지 확인한다.
    
    ifc2img의 1차 산출물은 스타일 이미지가 아니라 ControlNet용 depth image다. 따라서
    Open3D visualizer에서 `capture_depth_float_buffer`를 호출하고 RGB 캡처는 쓰지 않아야 한다.
    """
    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")
    fake_mesh = MagicMock()
    fake_center = np.array([0.0, 0.0, 0.0])

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
        ),
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        vis.capture_depth_float_buffer.return_value = _make_fake_depth_buffer()

        renderer = IFCRenderer(width=768, height=448)
        result = renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    vis.capture_depth_float_buffer.assert_called_once_with(do_render=True)
    vis.capture_screen_float_buffer.assert_not_called()
    assert result.mode == "L"
    assert result.size == (768, 448)


def test_render_views_loads_mesh_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """여러 view를 렌더링해도 IFC mesh는 한 번만 로드되어야 한다.

    같은 IFC에서 front, side, front diagonal 계열을 연속 생성할 때
    view마다 mesh를 다시 로드하면 시간이 커진다. `render_views`는
    한 번 로드한 mesh를 재사용해 각 view의 depth를 만든다는 점을 검증한다.
    """
    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")
    fake_mesh = MagicMock()
    fake_center = np.array([0.0, 0.0, 0.0])

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ) as mock_load,
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
        ),
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        vis.capture_depth_float_buffer.return_value = _make_fake_depth_buffer()

        renderer = IFCRenderer(width=768, height=448)
        results = renderer.render_views(Path("dummy.ifc"))

    assert mock_load.call_count == 1
    # render_views(views=None) uses the five supported production views.

    assert set(results.keys()) == set(DEFAULT_RENDER_VIEWS)
    assert vis.capture_depth_float_buffer.call_count == len(DEFAULT_RENDER_VIEWS)


# --- IFC4 schema gate와 실제 IFC4 fixture 기반 mesh 로딩 테스트 ---


def test_load_mesh_rejects_non_ifc4() -> None:
    """IFC4가 아닌 schema는 명확한 렌더 오류로 거절한다.
    
    현재 파이프라인은 IFC4 형식을 기준으로 테스트되고 있으므로, IFC2X3 같은 입력이 들어오면
    나중 단계에서 애매하게 실패하기보다 schema 확인 단계에서 바로 중단해야 한다.
    """
    fake_model = MagicMock()
    fake_model.schema = "IFC2X3"

    with patch(
        "ai_rendering.ifc2img.geometry.ifcopenshell.open",
        return_value=fake_model,
    ):
        with pytest.raises(IFCRenderError, match="IFC2X3"):
            load_mesh(Path("dummy.ifc"))


def test_load_mesh_accepts_ifc4(ifc4_fixture: Path) -> None:
    """실제 IFC4 fixture에서 mesh와 중심점이 만들어지는지 확인한다.
    
    mock이 아닌 fixture를 최소 하나 통과시켜 schema 확인, geometry iterator, vertex/triangle
    조립 경로가 함께 동작하는지 검증한다.
    """
    mesh, center = load_mesh(ifc4_fixture)

    assert center.shape == (3,)
    assert len(mesh.vertices) > 0
    assert len(mesh.triangles) > 0


# --- 자동 zoom 옵션 테스트: 기본 OFF와 ITERATIVE 수렴 동작 ---


def test_renderer_default_uses_static_zoom(monkeypatch: pytest.MonkeyPatch) -> None:
    """기본 auto zoom OFF에서는 view 설정의 고정 zoom을 그대로 사용해야 한다.
    
    자동 줌은 opt-in 실험 옵션이므로 기본 경로에서는 기존 `VIEW_CAMERAS` zoom 값과 캡처 횟수가
    변하지 않아야 한다.
    """
    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
        ),
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        depth = np.zeros((448, 768), dtype=np.float32)
        depth[100:300, 200:500] = 5.0
        vis.capture_depth_float_buffer.return_value = depth

        renderer = IFCRenderer()  # default auto_zoom=AutoZoomMode.OFF
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    vis.get_view_control.return_value.set_zoom.assert_called_once_with(0.5)
    assert vis.capture_depth_float_buffer.call_count == 1


def _make_depth_with_fill(fill_ratio: float, h: int = 448, w: int = 768) -> np.ndarray:
    """지정한 화면 점유율만큼 geometry 픽셀을 채운 테스트용 depth buffer를 만든다."""
    arr = np.zeros((h, w), dtype=np.float32)
    n_geom = int(h * w * fill_ratio)
    arr.flat[:n_geom] = 5.0
    return arr


def test_iterative_zoom_converges_when_target_reached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ITERATIVE zoom이 목표 화면 점유율 범위에 들어오면 즉시 멈추는지 확인한다.
    
    FRONT view의 target ratio와 tolerance 안에 이미 들어온 depth buffer를 주고, 불필요한
    추가 캡처 없이 1회 캡처로 종료되는지 검증한다.
    """
    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])

    target_depth = _make_depth_with_fill(0.20)

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
        ),
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        vis.capture_depth_float_buffer.return_value = target_depth

        renderer = IFCRenderer(
            auto_zoom=AutoZoomMode.ITERATIVE,
            iter_tolerance=0.10,
            iter_max=4,
        )
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert vis.capture_depth_float_buffer.call_count == 1


def test_iterative_zoom_max_iter_caps(monkeypatch: pytest.MonkeyPatch) -> None:
    """ITERATIVE zoom이 목표에 도달하지 못해도 iter_max에서 멈추는지 확인한다.
    
    자동 조정이 수렴하지 않는 depth가 들어올 수 있으므로, 무한 반복 대신 설정한 최대 반복
    횟수까지만 캡처해야 한다.
    """
    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    far_from_target = _make_depth_with_fill(0.05)

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
        ),
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        vis.capture_depth_float_buffer.return_value = far_from_target

        renderer = IFCRenderer(
            auto_zoom=AutoZoomMode.ITERATIVE,
            target_screen_ratio=0.55,
            iter_tolerance=0.10,
            iter_max=3,
        )
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert vis.capture_depth_float_buffer.call_count == 3


def test_iterative_zoom_bool_true_maps_to_iterative() -> None:
    """기존 bool auto_zoom 옵션이 새 enum 옵션과 호환되는지 확인한다."""
    renderer = IFCRenderer(auto_zoom=True)
    assert renderer.auto_zoom == AutoZoomMode.ITERATIVE

    renderer_off = IFCRenderer(auto_zoom=False)
    assert renderer_off.auto_zoom == AutoZoomMode.OFF


# --- wall PCA 정렬과 ground plane geometry helper 테스트 ---


def _build_wall_mesh(
    n_walls: int, theta_deg: float = 0.0, seed: int = 42
) -> tuple[np.ndarray, np.ndarray]:
    """벽 normal 정렬 테스트에 사용할 단순 wall mesh를 만든다.
    
    각 wall은 +X normal을 갖는 삼각형으로 만들고, 필요하면 전체 mesh에 yaw 회전을 적용한다.
    실제 IFC 대신 작고 예측 가능한 geometry로 PCA 기반 축 정렬 동작을 검증하기 위한 helper다.
    """
    rng = np.random.default_rng(seed)
    vertices: list[list[float]] = []
    triangles: list[list[int]] = []
    for _ in range(n_walls):
        offset = rng.uniform(-50, 50, 3)
        # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
        v0 = offset + np.array([0.0, 0.0, 0.0])
        v1 = offset + np.array([0.0, 1.0, 0.0])
        v2 = offset + np.array([0.0, 0.0, 1.0])
        idx = len(vertices)
        vertices.extend([v0.tolist(), v1.tolist(), v2.tolist()])
        triangles.append([idx, idx + 1, idx + 2])
    verts_arr = np.array(vertices, dtype=np.float64)
    tris_arr = np.array(triangles, dtype=np.int64)

    if abs(theta_deg) > 1e-9:
        theta_rad = np.radians(theta_deg)
        cos_t, sin_t = np.cos(theta_rad), np.sin(theta_rad)
        rot = np.array(
            [
                [cos_t, -sin_t, 0.0],
                [sin_t, cos_t, 0.0],
                [0.0, 0.0, 1.0],
            ]
        )
        verts_arr = verts_arr @ rot.T
    return verts_arr, tris_arr


def _measure_wall_mean_deg(vertices: np.ndarray, triangles: np.ndarray) -> float:
    """wall normal의 평균 yaw를 4방향 대칭 기준으로 측정한다.
    
    `_align_walls_to_axes`가 mesh를 축에 맞게 되돌렸는지 확인하기 위해, 벽면 normal만 골라
    면적 가중 circular mean을 계산한다.
    """
    v0 = vertices[triangles[:, 0]]
    v1 = vertices[triangles[:, 1]]
    v2 = vertices[triangles[:, 2]]
    raw_n = np.cross(v1 - v0, v2 - v0)
    nz = np.linalg.norm(raw_n, axis=1)
    valid = nz > 1e-12
    raw_n = raw_n[valid]
    nz = nz[valid]
    area = 0.5 * nz
    normal = raw_n / nz[:, None]
    wall_mask = np.abs(normal[:, 2]) < 0.1
    wall_normal = normal[wall_mask]
    wall_area = area[wall_mask]
    if len(wall_normal) == 0:
        return float("nan")
    angles = np.arctan2(wall_normal[:, 1], wall_normal[:, 0])
    quad = angles * 4.0
    weights = wall_area / wall_area.sum()
    mx = float(np.sum(np.cos(quad) * weights))
    my = float(np.sum(np.sin(quad) * weights))
    return float(np.degrees(np.arctan2(my, mx) / 4.0))


def test_align_walls_rotates_tilted_mesh_to_axis_aligned() -> None:
    """기울어진 wall mesh를 축 정렬 상태로 회전시키는지 확인한다.
    
    실제 Haus/SampleHouse IFC에서 약간 비틀린 건물 축을 보정했던 케이스를 단순 mesh로 재현한다.
    회전 전 평균 yaw가 약 10도이고, 보정 후 0도 근처로 돌아와야 한다.
    """
    verts, tris = _build_wall_mesh(n_walls=128, theta_deg=10.0)
    pre_mean = _measure_wall_mean_deg(verts, tris)
    assert abs(pre_mean - 10.0) < 0.5

    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is True
    post_mean = _measure_wall_mean_deg(rotated, tris)
    assert abs(post_mean) < 0.1


def test_align_walls_idempotent_on_already_aligned_mesh() -> None:
    """이미 축에 맞는 wall mesh에는 불필요한 회전이 누적되지 않아야 한다."""
    verts, tris = _build_wall_mesh(n_walls=128, theta_deg=0.0)
    pre_mean = _measure_wall_mean_deg(verts, tris)
    assert abs(pre_mean) < 0.1

    rotated, _ = _align_walls_to_axes(verts, tris)
    post_mean = _measure_wall_mean_deg(rotated, tris)

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert abs(post_mean) < 0.1


def test_align_walls_skips_when_too_few_walls() -> None:
    """벽 normal 표본이 너무 적으면 축 정렬을 건너뛰는지 확인한다.
    
    표본이 부족한 상태에서 회전각을 추정하면 작은 mesh나 잡음에 과하게 반응할 수 있으므로,
    최소 wall 개수 조건을 만족하지 못하면 원본 vertex를 그대로 돌려준다.
    """
    verts, tris = _build_wall_mesh(n_walls=3, theta_deg=10.0)
    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is False
    np.testing.assert_array_equal(rotated, verts)


def test_align_walls_skips_for_vertex_shortage() -> None:
    """face를 만들 수 없을 만큼 vertex가 적으면 wall 정렬을 건너뛰어야 한다."""
    verts = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]])
    tris = np.empty((0, 3), dtype=np.int64)
    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is False
    np.testing.assert_array_equal(rotated, verts)


def test_align_walls_skips_for_empty_triangles() -> None:
    """triangle이 없는 mesh는 face normal을 계산할 수 없으므로 wall 정렬을 건너뛰어야 한다."""
    verts = np.random.default_rng(42).uniform(-10, 10, (50, 3))
    tris = np.empty((0, 3), dtype=np.int64)
    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is False
    np.testing.assert_array_equal(rotated, verts)


def test_add_ground_plane_appends_4_vertices_and_2_triangles() -> None:
    """ground plane 추가가 quad 꼭짓점 4개와 triangle 2개를 덧붙이는지 확인한다."""
    verts = np.array(
        [[0.0, 0.0, 0.0], [10.0, 5.0, 0.0], [5.0, 0.0, 3.0]], dtype=np.float64
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, new_tris = _add_ground_plane(verts, tris)

    assert len(new_verts) == len(verts) + 4
    assert len(new_tris) == len(tris) + 2


def test_add_ground_plane_z_at_aabb_min() -> None:
    """ground plane의 z 위치가 원본 mesh의 AABB 최소 z와 일치하는지 확인한다."""
    verts = np.array(
        [[0.0, 0.0, 1.5], [10.0, 5.0, 1.5], [5.0, 0.0, 4.5]], dtype=np.float64
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, _ = _add_ground_plane(verts, tris)
    ground_verts = new_verts[len(verts):]

    assert np.allclose(ground_verts[:, 2], 1.5), "ground z should match AABB.z_min"


def test_add_ground_plane_accepts_ground_z_override() -> None:
    """Explicit ground_z fixes the generated ground plane z coordinate."""
    verts = np.array(
        [[0.0, 0.0, -3.0], [10.0, 5.0, 1.5], [5.0, 0.0, 4.5]],
        dtype=np.float64,
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, _ = _add_ground_plane(verts, tris, ground_z=0.25)
    ground_verts = new_verts[len(verts):]

    assert np.allclose(ground_verts[:, 2], 0.25)


def test_add_ground_plane_normal_points_up() -> None:
    """추가된 ground plane triangle normal이 위쪽을 향하는지 확인한다.
    
    wall 축 정렬 로직은 수평 바닥면을 wall 후보에서 제외해야 한다. ground normal이 +Z 방향이면
    `abs(n_z)` 조건으로 벽면과 구분할 수 있다.
    """
    verts = np.array(
        [[0.0, 0.0, 0.0], [10.0, 5.0, 0.0], [5.0, 0.0, 3.0]], dtype=np.float64
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, new_tris = _add_ground_plane(verts, tris)
    ground_tris = new_tris[len(tris):]

    for t in ground_tris:
        v0, v1, v2 = new_verts[t[0]], new_verts[t[1]], new_verts[t[2]]
        normal = np.cross(v1 - v0, v2 - v0)
        normal /= np.linalg.norm(normal)
        # normal[2] should be ~+1 (pointing straight up)
        assert normal[2] > 0.999, f"ground normal[2] should be +1, got {normal[2]}"


def test_add_ground_plane_extent_matches_aabb_factor() -> None:
    """기본 ground plane 크기가 mesh AABB extent와 factor를 기준으로 계산되는지 확인한다."""
    verts = np.array(
        [[0.0, 0.0, 0.0], [10.0, 0.0, 0.0], [10.0, 6.0, 0.0], [0.0, 6.0, 3.0]],
        dtype=np.float64,
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, _ = _add_ground_plane(verts, tris)
    ground_verts = new_verts[len(verts):]
    g_x_extent = ground_verts[:, 0].max() - ground_verts[:, 0].min()
    g_y_extent = ground_verts[:, 1].max() - ground_verts[:, 1].min()

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert abs(g_x_extent - 10.0 * GROUND_EXTENT_FACTOR) < 1e-9
    assert abs(g_y_extent - 6.0 * GROUND_EXTENT_FACTOR) < 1e-9


def test_add_ground_plane_accepts_extent_factor_override() -> None:
    """ground extent factor override가 plane 크기를 조정하는지 확인한다.
    
    front diagonal view 실험에서는 기본 바닥 크기가 너무 크거나 작을 수 있으므로, view별로 factor를
    조정할 수 있어야 한다.
    """
    verts = np.array(
        [[0.0, 0.0, 0.0], [10.0, 0.0, 0.0], [10.0, 6.0, 0.0], [0.0, 6.0, 3.0]],
        dtype=np.float64,
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, _ = _add_ground_plane(verts, tris, extent_factor=0.9)
    ground_verts = new_verts[len(verts):]
    g_x_extent = ground_verts[:, 0].max() - ground_verts[:, 0].min()
    g_y_extent = ground_verts[:, 1].max() - ground_verts[:, 1].min()

    assert abs(g_x_extent - 10.0 * 0.9) < 1e-9
    assert abs(g_y_extent - 6.0 * 0.9) < 1e-9


def test_attach_ground_plane_to_mesh_appends_4_vertices() -> None:
    """Open3D TriangleMesh wrapper에서도 ground plane vertex와 triangle이 추가되는지 확인한다."""
    import open3d as o3d
    base = o3d.geometry.TriangleMesh()
    base.vertices = o3d.utility.Vector3dVector(
        np.array([[0.0, 0.0, 0.0], [10.0, 0.0, 0.0], [10.0, 6.0, 3.0]])
    )
    base.triangles = o3d.utility.Vector3iVector(np.array([[0, 1, 2]]))
    base.compute_vertex_normals()

    new_mesh = attach_ground_plane_to_mesh(base)

    assert len(new_mesh.vertices) == len(base.vertices) + 4
    assert len(new_mesh.triangles) == len(base.triangles) + 2
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert len(base.vertices) == 3


def test_attach_ground_plane_to_mesh_accepts_ground_z_override() -> None:
    """The public mesh helper forwards explicit ground_z to the generated plane."""
    import open3d as o3d

    base = o3d.geometry.TriangleMesh()
    base.vertices = o3d.utility.Vector3dVector(
        np.array([[0.0, 0.0, -2.0], [10.0, 0.0, 0.0], [10.0, 6.0, 3.0]])
    )
    base.triangles = o3d.utility.Vector3iVector(np.array([[0, 1, 2]]))
    base.compute_vertex_normals()

    new_mesh = attach_ground_plane_to_mesh(base, ground_z=1.25)
    new_verts = np.asarray(new_mesh.vertices)
    ground_verts = new_verts[len(base.vertices):]

    assert np.allclose(ground_verts[:, 2], 1.25)


def test_renderer_passes_front_diagonal_ground_extent_override_only_for_diagonal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """front diagonal ground extent override는 대각선 view에만 적용되어야 한다.

    front/side는 기본 ground plane을 유지하고, front diagonal view만
    ground extent 실험값을 받을 수 있는지 검증한다.
    """
    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")
    base_mesh = MagicMock(name="base_mesh")
    base_mesh.vertices = np.array([[0.0, 0.0, 0.0], [10.0, 10.0, 5.0]])
    fake_center = np.array([5.0, 5.0, 2.5])

    calls: list[dict[str, object]] = []

    def fake_attach(mesh, **kwargs):
        calls.append({"mesh": mesh, **kwargs})
        return mesh

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(base_mesh, fake_center),
        ),
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=fake_attach,
        ),
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        vis.capture_depth_float_buffer.return_value = _make_fake_depth_buffer()

        renderer = IFCRenderer(
            view_ground_extent_overrides={IFCView.FRONT_DIAGONAL_RIGHT: 0.9}
        )
        renderer.render_views(
            Path("dummy.ifc"),
            views=[IFCView.FRONT, IFCView.FRONT_DIAGONAL_RIGHT],
        )

    assert calls == [
        {"mesh": base_mesh},
        {"mesh": base_mesh, "extent_factor": 0.9},
    ]


def test_renderer_passes_ground_z_override_to_ground_plane(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Renderer forwards semantic ground_z override only when configured."""
    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")
    base_mesh = MagicMock(name="base_mesh")
    base_mesh.vertices = np.array([[0.0, 0.0, 0.0], [10.0, 10.0, 5.0]])
    fake_center = np.array([5.0, 5.0, 2.5])
    calls: list[dict[str, object]] = []

    def fake_attach(mesh, **kwargs):
        calls.append({"mesh": mesh, **kwargs})
        return mesh

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(base_mesh, fake_center),
        ),
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=fake_attach,
        ),
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        vis.capture_depth_float_buffer.return_value = _make_fake_depth_buffer()

        renderer = IFCRenderer(ground_z_override=0.25)
        renderer.render_views(Path("dummy.ifc"), views=[IFCView.FRONT])

    assert calls == [{"mesh": base_mesh, "ground_z": 0.25}]


def test_iso_views_removed_from_enum() -> None:
    """사용하지 않기로 한 ISO 계열 view가 public enum에 남아 있지 않은지 확인한다."""
    enum_names = {v.name for v in IFCView}
    assert "ISO_NE" not in enum_names
    assert "ISO_NW" not in enum_names
    assert "ISO_SE" not in enum_names

    assert len(list(IFCView)) == 4


def test_front_diagonal_views_all_in_enum() -> None:
    """FRONT_DIAGONAL_RIGHT, FRONT_DIAGONAL_LEFT view가 enum과 view 설정 dict에 모두 등록되어 있는지 확인한다."""
    from ai_rendering.ifc2img.views import VIEW_CAMERAS

    front_diagonal_views = (IFCView.FRONT_DIAGONAL_RIGHT, IFCView.FRONT_DIAGONAL_LEFT)
    for v in front_diagonal_views:
        assert v in IFCView
        assert v in VIEW_CAMERAS
        assert v in VIEW_TARGET_RATIOS
        assert v in VIEW_PROMPT_SUFFIXES


def test_front_diagonal_views_have_zero_z_for_horizontal() -> None:
    """front diagonal view가 top-down이 아니라 수평 대각선 시점으로 설정되어 있는지 확인한다."""
    from ai_rendering.ifc2img.views import VIEW_CAMERAS

    for v in (IFCView.FRONT_DIAGONAL_RIGHT, IFCView.FRONT_DIAGONAL_LEFT):
        cam = VIEW_CAMERAS[v]
        assert cam.front[2] == 0.0, f"{v} front.z must be 0 for horizontal front diagonal view"


def test_default_render_views_includes_front_diagonal() -> None:
    """기본 렌더 view 세트가 production에서 쓰는 front, side, front diagonal 2종으로 구성되는지 확인한다."""
    for v in (IFCView.FRONT_DIAGONAL_RIGHT, IFCView.FRONT_DIAGONAL_LEFT):
        assert v in DEFAULT_RENDER_VIEWS
    assert len(DEFAULT_RENDER_VIEWS) == 4


def test_removed_views_are_not_public_enum_members() -> None:
    """birds_eye, corner_low, top처럼 제거한 view 이름이 public enum에 노출되지 않는지 확인한다."""
    removed = {"top", "corner_low", "birds_eye"}

    assert removed.isdisjoint({view.value for view in IFCView})
    assert set(DEFAULT_RENDER_VIEWS) == set(IFCView)
    assert len(DEFAULT_RENDER_VIEWS) == 4


# --- view별 prompt prefix/suffix와 build_view_prompt 정책 테스트 ---



def test_view_prompt_suffixes_front_side_front_diagonal_empty() -> None:
    """view별 suffix는 비워두고 prefix 중심으로 prompt를 조립하는 정책을 확인한다."""
    for v in (IFCView.FRONT, IFCView.SIDE, IFCView.FRONT_DIAGONAL_RIGHT, IFCView.FRONT_DIAGONAL_LEFT):
        assert VIEW_PROMPT_SUFFIXES[v] == ""


def test_view_prompt_prefixes_front_diagonal_describe_ground_and_sky_position() -> None:
    """front diagonal prefix adds diagonal view and ground/sky constraints."""
    for v in (IFCView.FRONT_DIAGONAL_RIGHT, IFCView.FRONT_DIAGONAL_LEFT):
        prefix = VIEW_PROMPT_PREFIXES[v]
        assert "front diagonal view" in prefix
        assert "dry ground around house" in prefix
        assert "building on flat ground" in prefix
        assert "no pool" in prefix
        assert "not aerial" in prefix



def test_build_view_prompt_prepends_prefix_for_front_side() -> None:
    """front/side prompt 앞쪽에 view 전용 prefix가 붙는지 확인한다."""
    base = "RAW photo, scandinavian house"
    front = build_view_prompt(base, IFCView.FRONT)
    side = build_view_prompt(base, IFCView.SIDE)

    assert front.startswith("open flat ground in front")
    assert front.endswith(base)
    assert "facade touches ground" in front
    assert "no foreground wall" in front
    assert "no foundation wall" in front
    assert "no retaining wall" in front
    assert side.startswith("side facade at ground line")
    assert side.endswith(base)
    assert "no foundation wall" in side


def test_build_view_prompt_prepends_prefix_for_front_diagonal() -> None:
    """front diagonal prompt gets a ground anchoring prefix."""
    base = "RAW photo, scandinavian house"
    result = build_view_prompt(base, IFCView.FRONT_DIAGONAL_RIGHT)

    assert result.startswith("front diagonal view")
    assert len(result) > len(base)
    assert result.endswith(base)
    assert "dry ground around house" in result
    assert "building on flat ground" in result
    assert "no pool" in result
    assert "not aerial" in result


# --- build_view_prompt public API와 view별 prompt 후처리 테스트 ---


def test_build_view_prompt_removes_blue_sky_for_front_diagonal() -> None:
    """front diagonal view에서는 day suffix의 blue sky 표현이 과하게 앞서지 않도록 제거되는지 확인한다."""
    base = "RAW photo, scandinavian house, during sunny daytime, natural sunlight, blue sky"

    result = build_view_prompt(base, IFCView.FRONT_DIAGONAL_RIGHT)

    assert "blue sky" not in result
    assert "during sunny daytime" in result
    assert "natural sunlight" in result
    assert "building on flat ground" in result


def test_build_view_prompt_keeps_blue_sky_for_front() -> None:
    """front view에서는 outdoor daylight cue로 쓰는 blue sky 표현을 유지하는지 확인한다."""
    base = "RAW photo, scandinavian house, during sunny daytime, natural sunlight, blue sky"

    result = build_view_prompt(base, IFCView.FRONT)

    assert result.startswith("open flat ground in front")
    assert result.endswith(base)
    assert "blue sky" in result
    assert "no retaining wall" in result


def test_build_view_prompt_in_public_api() -> None:
    """build_view_prompt가 ifc2img public API로 export되는지 확인한다."""
    from ai_rendering import ifc2img
    from ai_rendering.ifc2img import build_view_prompt as exported

    assert "build_view_prompt" in ifc2img.__all__
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    from ai_rendering.ifc2img.views import build_view_prompt as internal
    assert exported is internal



def test_view_target_ratios_cropping_resistant() -> None:
    """front diagonal view target ratio가 front/side보다 작아 cropping에 덜 취약한지 확인한다."""
    front_ratio = VIEW_TARGET_RATIOS[IFCView.FRONT]
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    for v in (IFCView.FRONT_DIAGONAL_RIGHT, IFCView.FRONT_DIAGONAL_LEFT):
        assert VIEW_TARGET_RATIOS[v] < front_ratio


def test_renderer_resolves_view_specific_target() -> None:
    """renderer가 view별 target ratio resolver를 통해 화면 점유율 목표를 가져오는지 확인한다."""
    renderer = IFCRenderer(target_screen_ratio=0.99)  # fallback
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    small_mesh = MagicMock()
    small_mesh.vertices = np.array([[0.0, 0.0, 0.0], [10.0, 5.0, 3.0]])
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    for v in IFCView:
        assert renderer._resolve_target_ratio(v, small_mesh) == VIEW_TARGET_RATIOS[v]


# --- mesh 규모별 target ratio dispatch 테스트 ---


def test_resolve_target_ratio_for_small_mesh_returns_base() -> None:
    """작은 주택 규모 mesh는 view별 기본 target ratio를 그대로 사용하는지 확인한다."""
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 13.0, base_ratio=0.20) == 0.20
    assert resolve_target_ratio_for_mesh(IFCView.SIDE, 17.0, base_ratio=0.20) == 0.20
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert (
        resolve_target_ratio_for_mesh(IFCView.FRONT, 10.0)
        == VIEW_TARGET_RATIOS[IFCView.FRONT]
    )
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 20.0, base_ratio=0.20) == 0.20


def test_resolve_target_ratio_for_medium_mesh_scales_down() -> None:
    """중간 규모 mesh는 dispatch factor로 target ratio를 낮추는지 확인한다."""
    base = 0.20
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 30.0, base_ratio=base) == (
        base * DISPATCH_MEDIUM_FACTOR
    )
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 50.0, base_ratio=base) == (
        base * DISPATCH_MEDIUM_FACTOR
    )
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    iso_base = VIEW_TARGET_RATIOS[IFCView.FRONT_DIAGONAL_RIGHT]
    assert resolve_target_ratio_for_mesh(IFCView.FRONT_DIAGONAL_RIGHT, 35.0) == (
        iso_base * DISPATCH_MEDIUM_FACTOR
    )


def test_resolve_target_ratio_for_large_mesh_scales_more() -> None:
    """큰 규모 mesh는 더 강한 dispatch factor로 target ratio를 낮추는지 확인한다."""
    base = 0.20
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 75.0, base_ratio=base) == (
        base * DISPATCH_LARGE_FACTOR
    )
    assert resolve_target_ratio_for_mesh(IFCView.SIDE, 100.0, base_ratio=base) == (
        base * DISPATCH_LARGE_FACTOR
    )
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    iso_base = VIEW_TARGET_RATIOS[IFCView.FRONT_DIAGONAL_RIGHT]
    assert resolve_target_ratio_for_mesh(IFCView.FRONT_DIAGONAL_RIGHT, 75.0) == (
        iso_base * DISPATCH_LARGE_FACTOR
    )


# --- dispatch 기준 mesh가 ground 확장 전 base mesh인지 검증하는 테스트 ---


def test_render_mesh_dispatch_uses_base_mesh_not_ground_extended() -> None:
    """target ratio dispatch가 ground plane으로 확장된 mesh가 아니라 원본 building mesh 기준인지 확인한다.
    
    ground plane을 붙인 view mesh로 규모를 판단하면 작은 주택도 medium/large로 오판할 수 있다.
    따라서 dispatch는 load_mesh 결과인 base_mesh의 extent만 사용해야 한다.
    """
    renderer = IFCRenderer()
    base_mesh = MagicMock()
    base_mesh.vertices = np.array([[0.0, 0.0, 0.0], [13.0, 13.0, 5.0]])  # 13m
    view_mesh = MagicMock()
    view_mesh.vertices = np.array([[0.0, 0.0, 0.0], [25.0, 25.0, 5.0]])  # 25m

    base_ratio = renderer._resolve_target_ratio(IFCView.FRONT, base_mesh)
    view_ratio = renderer._resolve_target_ratio(IFCView.FRONT, view_mesh)

    assert base_ratio == VIEW_TARGET_RATIOS[IFCView.FRONT]
    assert view_ratio == VIEW_TARGET_RATIOS[IFCView.FRONT] * DISPATCH_MEDIUM_FACTOR
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert base_ratio != view_ratio


def test_render_passes_base_mesh_to_resolve_target_ratio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """render 경로에서 `_resolve_target_ratio`에 ground 확장 전 base mesh가 전달되는지 확인한다."""
    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")
    base_mesh = MagicMock(name="base_mesh")
    base_mesh.vertices = np.array([[0.0, 0.0, 0.0], [10.0, 10.0, 5.0]])
    inflated_mesh = MagicMock(name="inflated_mesh")
    inflated_mesh.vertices = np.array([[0.0, 0.0, 0.0], [30.0, 30.0, 5.0]])
    fake_center = np.array([5.0, 5.0, 2.5])

    captured: list[object] = []
    original = IFCRenderer._resolve_target_ratio

    def spy(self, view, mesh):
        captured.append(mesh)
        return original(self, view, mesh)

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(base_mesh, fake_center),
        ),
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            return_value=inflated_mesh,
        ),
        patch.object(IFCRenderer, "_resolve_target_ratio", spy),
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        depth = np.zeros((448, 768), dtype=np.float32)
        depth[100:300, 200:500] = 5.0
        vis.capture_depth_float_buffer.return_value = depth

        renderer = IFCRenderer()
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert len(captured) == 1
    assert captured[0] is base_mesh


def test_render_uses_static_view_camera(monkeypatch: pytest.MonkeyPatch) -> None:
    """기본 render가 views.py의 static camera vector를 그대로 적용하는지 확인한다."""
    monkeypatch.setenv("IFC2IMG_RENDER_BACKEND", "visualizer")
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5], [20, 0, 5]])
    fake_center = np.array([10.0, 5.0, 2.5])

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
        ),
        patch.object(IFCRenderer, "_is_headless", return_value=False),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        depth = np.zeros((448, 768), dtype=np.float32)
        depth[100:300, 200:500] = 5.0
        vis.capture_depth_float_buffer.return_value = depth

        renderer = IFCRenderer()
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    set_front_calls = vis.get_view_control.return_value.set_front.call_args_list
    assert len(set_front_calls) == 1
    assert set_front_calls[0].args[0] == [-1.0, 0.0, 0.0]


@pytest.mark.parametrize("schema_name", ["IFC4", "IFC4X1", "IFC4X2", "IFC4X3"])
def test_load_mesh_accepts_ifc4_variants(schema_name: str) -> None:
    """IFC4X1, IFC4X3처럼 IFC4 prefix를 가진 schema variant를 허용하는지 확인한다."""
    fake_model = MagicMock()
    fake_model.schema = schema_name

    wall = MagicMock()
    wall.is_a.side_effect = lambda t: t == "IfcBuildingElement"
    fake_model.by_id.return_value = wall

    wall_shape = MagicMock()
    wall_shape.id = 1
    wall_shape.geometry.verts = (0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0)
    wall_shape.geometry.faces = (0, 1, 2)

    fake_iter = MagicMock()
    fake_iter.initialize.return_value = True
    fake_iter.get.return_value = wall_shape
    fake_iter.next.return_value = False

    with (
        patch("ai_rendering.ifc2img.geometry.ifcopenshell.open", return_value=fake_model),
        patch(
            "ai_rendering.ifc2img.geometry.ifcopenshell.geom.iterator",
            return_value=fake_iter,
        ),
        patch("ai_rendering.ifc2img.geometry.ifcopenshell.geom.settings"),
    ):
        # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
        # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
        mesh, _ = load_mesh(Path("dummy.ifc"))
        assert len(mesh.vertices) == 3


# --- ifcopenshell geometry iterator를 mock으로 구성한 포함 타입 테스트 ---


def _make_mock_entity(type_name: str) -> MagicMock:
    """`is_a(type_name)`를 흉내 내는 fake IFC entity를 만든다."""
    e = MagicMock()
    e.is_a.side_effect = lambda t: t == type_name
    return e


def _make_mock_shape(entity_id: int, verts: tuple, faces: tuple = (0, 1, 2)) -> MagicMock:  # type: ignore[type-arg]
    """ifcopenshell geometry iterator가 반환하는 shape 객체를 흉내 낸다."""
    s = MagicMock()
    s.id = entity_id
    s.geometry.verts = verts
    s.geometry.faces = faces
    return s


def _patch_iterator_with_shapes(shapes: list[MagicMock]):  # type: ignore[no-untyped-def]
    """지정한 shape 목록을 순서대로 내보내는 ifcopenshell iterator mock을 구성한다."""
    fake_iter = MagicMock()
    fake_iter.initialize.return_value = True
    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    fake_iter.get.side_effect = shapes
    fake_iter.next.side_effect = [True] * (len(shapes) - 1) + [False]
    return fake_iter


def test_default_includes_only_building_elements() -> None:
    """기본 load_mesh가 IfcBuildingElement만 포함하고 IfcSite는 제외하는지 확인한다."""
    fake_model = MagicMock()
    fake_model.schema = "IFC4"

    wall = _make_mock_entity("IfcBuildingElement")
    site = _make_mock_entity("IfcSite")
    fake_model.by_id.side_effect = lambda eid: {1: wall, 2: site}[eid]

    wall_shape = _make_mock_shape(1, verts=(0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0))
    site_shape = _make_mock_shape(
        2, verts=(-1000.0, -1000.0, 0.0, 1000.0, -1000.0, 0.0, 0.0, 1000.0, 0.0)
    )

    with (
        patch("ai_rendering.ifc2img.geometry.ifcopenshell.open", return_value=fake_model),
        patch(
            "ai_rendering.ifc2img.geometry.ifcopenshell.geom.iterator",
            return_value=_patch_iterator_with_shapes([wall_shape, site_shape]),
        ),
        patch("ai_rendering.ifc2img.geometry.ifcopenshell.geom.settings"),
    ):
        _, center = load_mesh(Path("dummy.ifc"))

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert abs(center[0]) < 5
    assert abs(center[1]) < 5


def test_extra_types_extends_inclusion() -> None:
    """extra_types 옵션으로 IfcFurnishingElement 같은 추가 타입을 포함할 수 있는지 확인한다."""
    fake_model = MagicMock()
    fake_model.schema = "IFC4"

    wall = _make_mock_entity("IfcBuildingElement")
    chair = _make_mock_entity("IfcFurnishingElement")
    fake_model.by_id.side_effect = lambda eid: {1: wall, 2: chair}[eid]

    wall_shape = _make_mock_shape(1, verts=(0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0))
    chair_shape = _make_mock_shape(
        2, verts=(10.0, 10.0, 0.0, 11.0, 10.0, 0.0, 10.0, 11.0, 0.0)
    )

    with (
        patch("ai_rendering.ifc2img.geometry.ifcopenshell.open", return_value=fake_model),
        patch(
            "ai_rendering.ifc2img.geometry.ifcopenshell.geom.iterator",
            return_value=_patch_iterator_with_shapes([wall_shape, chair_shape]),
        ),
        patch("ai_rendering.ifc2img.geometry.ifcopenshell.geom.settings"),
    ):
        mesh, _ = load_mesh(
            Path("dummy.ifc"),
            extra_types=frozenset({"IfcFurnishingElement"}),
        )

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    assert len(mesh.vertices) == 6


def test_included_base_ifcproduct_includes_everything() -> None:
    """included_base escape hatch가 IfcProduct 하위 요소 전체를 포함할 수 있는지 확인한다."""
    fake_model = MagicMock()
    fake_model.schema = "IFC4"

    # 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
    site = MagicMock()
    site.is_a.side_effect = lambda t: t in {"IfcSite", "IfcProduct"}
    fake_model.by_id.return_value = site

    site_shape = _make_mock_shape(1, verts=(0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0))

    with (
        patch("ai_rendering.ifc2img.geometry.ifcopenshell.open", return_value=fake_model),
        patch(
            "ai_rendering.ifc2img.geometry.ifcopenshell.geom.iterator",
            return_value=_patch_iterator_with_shapes([site_shape]),
        ),
        patch("ai_rendering.ifc2img.geometry.ifcopenshell.geom.settings"),
    ):
        mesh, _ = load_mesh(Path("dummy.ifc"), included_base="IfcProduct")

    assert len(mesh.vertices) == 3


def test_no_building_element_raises() -> None:
    """기본 포함 기준에서 building element가 하나도 없으면 명확한 오류를 내는지 확인한다."""
    fake_model = MagicMock()
    fake_model.schema = "IFC4"

    site = _make_mock_entity("IfcSite")
    annotation = _make_mock_entity("IfcAnnotation")
    fake_model.by_id.side_effect = lambda eid: {1: site, 2: annotation}[eid]

    s1 = _make_mock_shape(1, verts=(0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0))
    s2 = _make_mock_shape(2, verts=(0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0))

    with (
        patch("ai_rendering.ifc2img.geometry.ifcopenshell.open", return_value=fake_model),
        patch(
            "ai_rendering.ifc2img.geometry.ifcopenshell.geom.iterator",
            return_value=_patch_iterator_with_shapes([s1, s2]),
        ),
        patch("ai_rendering.ifc2img.geometry.ifcopenshell.geom.settings"),
    ):
        with pytest.raises(IFCRenderError, match="IfcBuildingElement"):
            load_mesh(Path("dummy.ifc"))


# 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
# 상세한 검증 의도는 해당 테스트 docstring에 기록한다.
# 상세한 검증 의도는 해당 테스트 docstring에 기록한다.



def test_renderer_uses_view_target_override_for_front_diagonal_only() -> None:
    """view target ratio override가 front diagonal view에만 적용되고 front/side에는 영향을 주지 않는지 확인한다."""
    renderer = IFCRenderer(
        target_screen_ratio=0.99,
        view_target_overrides={IFCView.FRONT_DIAGONAL_RIGHT: 0.25},
    )
    small_mesh = MagicMock()
    small_mesh.vertices = np.array([[0.0, 0.0, 0.0], [10.0, 5.0, 3.0]])

    assert renderer._resolve_target_ratio(IFCView.FRONT_DIAGONAL_RIGHT, small_mesh) == 0.25
    assert renderer._resolve_target_ratio(IFCView.FRONT_DIAGONAL_LEFT, small_mesh) == (
        VIEW_TARGET_RATIOS[IFCView.FRONT_DIAGONAL_LEFT]
    )
    assert renderer._resolve_target_ratio(IFCView.FRONT, small_mesh) == (
        VIEW_TARGET_RATIOS[IFCView.FRONT]
    )
