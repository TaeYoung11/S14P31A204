"""ifc2img 모듈 테스트 — depth 변환 + 렌더 호출 흐름 + IFC4 schema 가드.

GPU/디스플레이 미필요. Visualizer/load_mesh는 mock 으로 격리.
schema 가드는 실제 fixtures 로 검증 (ifcopenshell 만 사용 → 가벼움).
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from ai_rendering.ifc2img import IFCRenderError, IFCRenderer, IFCView
from ai_rendering.ifc2img.geometry import load_mesh
from ai_rendering.ifc2img.views import (
    AutoZoomMode,
    compute_auto_zoom,
    compute_dynamic_front,
    compute_principal_axes,
)


# --- _depth_to_image 순수 함수 단위 테스트 (mock 불필요) ---


def test_depth_to_image_shape_preserved() -> None:
    """입력 depth array shape 가 그대로 PIL.size 에 반영되고 mode='L'."""
    h, w = 448, 768
    depth = np.full((h, w), 5.0, dtype=np.float32)

    img = IFCRenderer._depth_to_image(depth)

    assert img.mode == "L"
    assert img.size == (w, h)  # PIL.size 는 (width, height)


def test_depth_to_image_background_is_black() -> None:
    """depth==0 픽셀(배경)은 결과에서 0(검정) 으로 나와야 한다."""
    depth = np.zeros((10, 10), dtype=np.float32)
    depth[5, 5] = 3.0  # 단일 geometry 픽셀
    depth[5, 6] = 7.0

    img = IFCRenderer._depth_to_image(depth)
    arr = np.array(img)

    # 0 인 입력은 배경 → 결과도 0
    bg_mask = depth == 0
    assert arr[bg_mask].max() == 0


def test_depth_to_image_closer_is_brighter() -> None:
    """가까운(작은 depth) 픽셀이 먼 픽셀보다 결과에서 밝다."""
    depth = np.zeros((4, 4), dtype=np.float32)
    depth[0, 0] = 1.0  # 가까움
    depth[0, 1] = 5.0  # 중간
    depth[0, 2] = 10.0  # 멀음

    img = IFCRenderer._depth_to_image(depth)
    arr = np.array(img)

    assert arr[0, 0] > arr[0, 1] > arr[0, 2]
    assert arr[0, 0] == 255  # 가장 가까운 픽셀 = 최대 밝기
    assert arr[0, 2] == 0  # 가장 먼 픽셀 = 최소 밝기


def test_depth_to_image_uniform_depth() -> None:
    """모든 geom 픽셀이 동일 depth (d_min == d_max) → 255 (밝음)."""
    depth = np.zeros((4, 4), dtype=np.float32)
    depth[1:3, 1:3] = 5.0  # 동일 거리의 geometry 영역

    img = IFCRenderer._depth_to_image(depth)
    arr = np.array(img)

    geom_mask = depth > 0
    assert (arr[geom_mask] == 255).all()
    assert (arr[~geom_mask] == 0).all()


def test_depth_to_image_all_background_raises() -> None:
    """전부 0(배경)인 입력은 IFCRenderError 로 명시 거부."""
    depth = np.zeros((10, 10), dtype=np.float32)

    with pytest.raises(IFCRenderError, match="geometry"):
        IFCRenderer._depth_to_image(depth)


# --- IFCRenderer Visualizer 호출 흐름 (mock 필요) ---


def _make_fake_depth_buffer(value: float = 5.0) -> np.ndarray:
    arr = np.zeros((448, 768), dtype=np.float32)
    arr[100:300, 200:500] = value
    return arr


def test_renderer_calls_depth_buffer() -> None:
    """렌더러가 RGB 가 아닌 depth float buffer 를 호출한다."""
    fake_mesh = MagicMock()
    fake_center = np.array([0.0, 0.0, 0.0])

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
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


def test_render_views_loads_mesh_once() -> None:
    """render_views(3뷰) 호출에도 load_mesh 는 1번만 — IFC 파싱은 비싸다."""
    fake_mesh = MagicMock()
    fake_center = np.array([0.0, 0.0, 0.0])

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ) as mock_load,
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        vis.capture_depth_float_buffer.return_value = _make_fake_depth_buffer()

        renderer = IFCRenderer(width=768, height=448)
        results = renderer.render_views(Path("dummy.ifc"))

    assert mock_load.call_count == 1
    # render_views(views=None) → 등록된 모든 IFCView. 등각 뷰 추가 후 8개.
    assert set(results.keys()) == set(IFCView)
    assert vis.capture_depth_float_buffer.call_count == len(IFCView)  # 뷰마다 1번씩


# --- IFC4 schema 가드 (정상 경로는 실제 fixture, 부정 경로는 mock) ---


def test_load_mesh_rejects_non_ifc4() -> None:
    """비IFC4 스키마 → IFCRenderError, 메시지에 입력 스키마 포함.

    IFC 2x3 fixture 파일은 보유하지 않으므로 ifcopenshell.open을 mock해
    schema 가드만 격리 검증. 가드 함수 자체는 실제 비IFC4 입력에도 작동.
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
    """IFC4 입력 → 정상 진행 (예외 없음, mesh + center 반환)."""
    mesh, center = load_mesh(ifc4_fixture)

    assert center.shape == (3,)
    assert len(mesh.vertices) > 0
    assert len(mesh.triangles) > 0


# --- 카메라 zoom 동적 조정 (카드 A) ---


def test_compute_auto_zoom_smaller_mesh_returns_zoom() -> None:
    """compute_auto_zoom은 mesh AABB와 카메라 시선으로 유효한 zoom 값을 반환."""
    aabb_min = np.array([0.0, 0.0, 0.0])
    aabb_max = np.array([10.0, 10.0, 5.0])
    z = compute_auto_zoom(
        aabb_min, aabb_max,
        camera_front=(-1.0, 0.0, 0.2),
        camera_up=(0.0, 0.0, 1.0),
        target_screen_ratio=0.7,
    )
    assert 0.05 <= z <= 2.0  # clip 범위 안


def test_compute_auto_zoom_target_ratio_inverse() -> None:
    """target_screen_ratio가 클수록 zoom 값은 작아진다 (inverse 관계 — Open3D 의미)."""
    aabb_min = np.array([0.0, 0.0, 0.0])
    aabb_max = np.array([10.0, 10.0, 5.0])
    z_small = compute_auto_zoom(aabb_min, aabb_max, (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), target_screen_ratio=0.3)
    z_large = compute_auto_zoom(aabb_min, aabb_max, (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), target_screen_ratio=0.9)
    assert z_small > z_large  # ratio 높음 = mesh 크게 = zoom 작음


def test_renderer_analytic_mode_uses_compute_auto_zoom() -> None:
    """AutoZoomMode.ANALYTIC 시 compute_auto_zoom 함수 호출 + 1회 capture (v1)."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
        patch("ai_rendering.ifc2img.renderer.compute_auto_zoom", return_value=0.42) as mock_compute,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        depth = np.zeros((448, 768), dtype=np.float32)
        depth[100:300, 200:500] = 5.0
        vis.capture_depth_float_buffer.return_value = depth

        renderer = IFCRenderer(auto_zoom=AutoZoomMode.ANALYTIC)
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    mock_compute.assert_called_once()
    # ANALYTIC 모드는 반복 안 함 — set_zoom/capture 1회씩
    assert vis.capture_depth_float_buffer.call_count == 1


def test_renderer_default_uses_static_zoom() -> None:
    """기본 auto_zoom=OFF — views.py의 정적 zoom(0.5) 그대로 전달."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
        patch("ai_rendering.ifc2img.renderer.compute_auto_zoom") as mock_compute,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        depth = np.zeros((448, 768), dtype=np.float32)
        depth[100:300, 200:500] = 5.0
        vis.capture_depth_float_buffer.return_value = depth

        renderer = IFCRenderer()  # default auto_zoom=AutoZoomMode.OFF
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    mock_compute.assert_not_called()
    # OFF 모드: 1회 set_zoom + 1회 capture
    vis.get_view_control.return_value.set_zoom.assert_called_once_with(0.5)
    assert vis.capture_depth_float_buffer.call_count == 1


def _make_depth_with_fill(fill_ratio: float, h: int = 448, w: int = 768) -> np.ndarray:
    """주어진 fill 비율을 갖는 depth 배열 합성 (geom>0 픽셀 비율 = fill_ratio)."""
    arr = np.zeros((h, w), dtype=np.float32)
    n_geom = int(h * w * fill_ratio)
    arr.flat[:n_geom] = 5.0
    return arr


def test_iterative_zoom_converges_when_target_reached() -> None:
    """ITERATIVE 모드 — fill이 target tolerance 안에 들면 즉시 종료."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])

    # 첫 capture부터 target 0.55 ± 0.10 = [0.45, 0.65] 안 (fill=0.55)
    target_depth = _make_depth_with_fill(0.55)

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        vis.capture_depth_float_buffer.return_value = target_depth

        renderer = IFCRenderer(
            auto_zoom=AutoZoomMode.ITERATIVE,
            target_screen_ratio=0.55,
            iter_tolerance=0.10,
            iter_max=4,
        )
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    # 첫 iteration에서 수렴 → capture 1회
    assert vis.capture_depth_float_buffer.call_count == 1


def test_iterative_zoom_max_iter_caps() -> None:
    """ITERATIVE — 수렴 안 해도 iter_max에서 반드시 종료 (무한루프 방지)."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])

    # 의도적으로 target 밖 fill — 수렴 안 함
    far_from_target = _make_depth_with_fill(0.05)

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
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

    # iter_max=3 ⇒ capture 정확히 3회
    assert vis.capture_depth_float_buffer.call_count == 3


def test_iterative_zoom_bool_true_maps_to_iterative() -> None:
    """auto_zoom=True (bool) → AutoZoomMode.ITERATIVE 자동 매핑 (backward compat)."""
    renderer = IFCRenderer(auto_zoom=True)
    assert renderer.auto_zoom == AutoZoomMode.ITERATIVE

    renderer_off = IFCRenderer(auto_zoom=False)
    assert renderer_off.auto_zoom == AutoZoomMode.OFF


# --- 카드 B + γ: PCA 기반 동적 front + 등각 뷰 ---


def test_pca_returns_orthogonal_axes_for_long_mesh() -> None:
    """길쭉한 mesh의 PCA — long ⊥ mid, 단위벡터, valid=True."""
    # x축으로 길쭉, y축으로 짧음
    rng = np.random.default_rng(42)
    n = 500
    pts_x = rng.uniform(-50, 50, n)
    pts_y = rng.uniform(-5, 5, n)
    pts_z = rng.uniform(0, 10, n)
    vertices = np.stack([pts_x, pts_y, pts_z], axis=1)

    long_axis, mid_axis, valid = compute_principal_axes(vertices)

    assert valid is True
    # long_axis는 x 방향에 가까워야 함
    assert abs(long_axis[0]) > 0.9
    assert abs(long_axis[1]) < 0.3
    # 직교 검증
    assert abs(np.dot(long_axis, mid_axis)) < 1e-6
    # 단위벡터
    assert abs(np.linalg.norm(long_axis) - 1.0) < 1e-6
    assert abs(np.linalg.norm(mid_axis) - 1.0) < 1e-6
    # z 성분은 0 (xy 평면 PCA)
    assert long_axis[2] == 0.0
    assert mid_axis[2] == 0.0


def test_pca_fallback_when_eigenvalues_close() -> None:
    """정사각 평면 mesh — eigenvalue 격차 작음 → valid=False → fallback 권장."""
    rng = np.random.default_rng(42)
    n = 500
    pts = rng.uniform(-10, 10, (n, 2))
    pts_z = rng.uniform(0, 10, n)
    vertices = np.stack([pts[:, 0], pts[:, 1], pts_z], axis=1)

    _, _, valid = compute_principal_axes(vertices)
    assert valid is False


def test_compute_dynamic_front_iso_ne_combines_axes() -> None:
    """ISO_NE는 PCA 좌표계에서 두 축 결합 + z."""
    long_axis = np.array([1.0, 0.0, 0.0])
    mid_axis = np.array([0.0, 1.0, 0.0])

    front = compute_dynamic_front(IFCView.ISO_NE, long_axis, mid_axis)

    # ISO_NE 계수 = (-0.7, -0.7, 0.5)
    assert abs(front[0] - (-0.7)) < 1e-6  # long 성분
    assert abs(front[1] - (-0.7)) < 1e-6  # mid 성분
    assert abs(front[2] - 0.5) < 1e-6     # z 성분


def test_iso_views_all_in_enum() -> None:
    """등각 뷰 5개가 IFCView enum에 모두 등록됨."""
    assert IFCView.ISO_NE in IFCView
    assert IFCView.ISO_NW in IFCView
    assert IFCView.ISO_SE in IFCView
    assert IFCView.CORNER_LOW in IFCView
    assert IFCView.BIRDS_EYE in IFCView
    assert len(list(IFCView)) == 8  # FRONT/SIDE/TOP + 5등각


def test_renderer_pca_align_off_uses_static_front() -> None:
    """pca_align=False 시 동적 front 계산 안 함, VIEW_CAMERAS 정적값 그대로."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5], [20, 0, 5]])
    fake_center = np.array([10.0, 5.0, 2.5])

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
        patch(
            "ai_rendering.ifc2img.renderer.compute_principal_axes"
        ) as mock_pca,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        depth = np.zeros((448, 768), dtype=np.float32)
        depth[100:300, 200:500] = 5.0
        vis.capture_depth_float_buffer.return_value = depth

        renderer = IFCRenderer(pca_align=False)
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    mock_pca.assert_not_called()
    # set_front은 IFCView.FRONT의 정적 vector (-1.0, 0.0, 0.2)로 호출
    set_front_calls = vis.get_view_control.return_value.set_front.call_args_list
    assert len(set_front_calls) == 1
    assert set_front_calls[0].args[0] == [-1.0, 0.0, 0.2]


@pytest.mark.parametrize("schema_name", ["IFC4", "IFC4X1", "IFC4X2", "IFC4X3"])
def test_load_mesh_accepts_ifc4_variants(schema_name: str) -> None:
    """IFC4 계열(IFC4X1/IFC4X3 등) 모두 schema 가드 통과 — prefix='IFC4'."""
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
        # 예외 없이 통과해야 한다.
        mesh, _ = load_mesh(Path("dummy.ifc"))
        assert len(mesh.vertices) == 3


# --- 건물 구성요소 화이트리스트 (mock 기반) ---


def _make_mock_entity(type_name: str) -> MagicMock:
    """is_a(t)가 type_name과 매치 시 True 반환하는 fake IFC entity."""
    e = MagicMock()
    e.is_a.side_effect = lambda t: t == type_name
    return e


def _make_mock_shape(entity_id: int, verts: tuple, faces: tuple = (0, 1, 2)) -> MagicMock:  # type: ignore[type-arg]
    s = MagicMock()
    s.id = entity_id
    s.geometry.verts = verts
    s.geometry.faces = faces
    return s


def _patch_iterator_with_shapes(shapes: list[MagicMock]):  # type: ignore[no-untyped-def]
    """주어진 shape 시퀀스를 yield하는 가짜 ifcopenshell iterator를 만든다."""
    fake_iter = MagicMock()
    fake_iter.initialize.return_value = True
    # get()은 매 호출마다 다음 shape, next()는 마지막을 제외하고 True
    fake_iter.get.side_effect = shapes
    fake_iter.next.side_effect = [True] * (len(shapes) - 1) + [False]
    return fake_iter


def test_default_includes_only_building_elements() -> None:
    """기본 호출(`load_mesh(path)`)은 IfcBuildingElement만 포함, IfcSite는 제외."""
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

    # IfcSite(±1000)가 포함됐다면 center가 멀리 떨어짐. wall만 포함이면 ~ (0.33, 0.33, 0).
    assert abs(center[0]) < 5
    assert abs(center[1]) < 5


def test_extra_types_extends_inclusion() -> None:
    """extra_types에 IfcFurnishingElement 전달 시 가구도 포함된다."""
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

    # 두 entity 모두 포함되면 vertex 6개. wall만 포함이면 3개.
    assert len(mesh.vertices) == 6


def test_included_base_ifcproduct_includes_everything() -> None:
    """included_base='IfcProduct'는 escape hatch — IfcSite도 포함된다 (전체 씬 모드)."""
    fake_model = MagicMock()
    fake_model.schema = "IFC4"

    # IfcSite는 IfcProduct 서브타입. is_a("IfcProduct") → True.
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

    assert len(mesh.vertices) == 3  # site가 포함됨


def test_no_building_element_raises() -> None:
    """IfcBuildingElement가 0개인 IFC → IFCRenderError, 메시지에 included_base 포함."""
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
