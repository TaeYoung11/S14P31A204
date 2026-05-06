"""ifc2img 모듈 테스트 — depth 변환 + 렌더 호출 흐름 + IFC4 schema 가드.

GPU/디스플레이 미필요. Visualizer/load_mesh는 mock 으로 격리.
schema 가드는 실제 fixtures 로 검증 (ifcopenshell 만 사용 → 가벼움).
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

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
    VIEW_PROMPT_PREFIXES,
    VIEW_PROMPT_SUFFIXES,
    VIEW_TARGET_RATIOS,
    AutoZoomMode,
    build_view_prompt,
    resolve_target_ratio_for_mesh,
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
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
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
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
        ),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        vis.capture_depth_float_buffer.return_value = _make_fake_depth_buffer()

        renderer = IFCRenderer(width=768, height=448)
        results = renderer.render_views(Path("dummy.ifc"))

    assert mock_load.call_count == 1
    # render_views(views=None) → DEFAULT_RENDER_VIEWS
    # (5뷰: front/side/eye_ne/eye_nw/eye_se. TOP/BIRDS_EYE/CORNER_LOW 제외).
    assert set(results.keys()) == set(DEFAULT_RENDER_VIEWS)
    assert vis.capture_depth_float_buffer.call_count == len(DEFAULT_RENDER_VIEWS)


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


# --- 카메라 zoom 모드 (AutoZoomMode.OFF / ITERATIVE) ---


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
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
        ),
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        depth = np.zeros((448, 768), dtype=np.float32)
        depth[100:300, 200:500] = 5.0
        vis.capture_depth_float_buffer.return_value = depth

        renderer = IFCRenderer()  # default auto_zoom=AutoZoomMode.OFF
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    # OFF 모드: 1회 set_zoom + 1회 capture, VIEW_CAMERAS[FRONT].zoom=0.5
    vis.get_view_control.return_value.set_zoom.assert_called_once_with(0.5)
    assert vis.capture_depth_float_buffer.call_count == 1


def _make_depth_with_fill(fill_ratio: float, h: int = 448, w: int = 768) -> np.ndarray:
    """주어진 fill 비율을 갖는 depth 배열 합성 (geom>0 픽셀 비율 = fill_ratio)."""
    arr = np.zeros((h, w), dtype=np.float32)
    n_geom = int(h * w * fill_ratio)
    arr.flat[:n_geom] = 5.0
    return arr


def test_iterative_zoom_converges_when_target_reached() -> None:
    """ITERATIVE 모드 — fill이 view-별 target tolerance 안에 들면 즉시 종료.

    IFCView.FRONT는 VIEW_TARGET_RATIOS[FRONT]=0.20이 적용된다.
    fill=0.20 ± 0.10 = [0.10, 0.30] 안 → 1회 capture로 수렴.
    """
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])

    target_depth = _make_depth_with_fill(0.20)  # FRONT의 view-별 target

    with (
        patch(
            "ai_rendering.ifc2img.renderer.load_mesh",
            return_value=(fake_mesh, fake_center),
        ),
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
        ),
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
        patch(
            "ai_rendering.ifc2img.renderer.attach_ground_plane_to_mesh",
            side_effect=lambda m: m,
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


def _build_wall_mesh(
    n_walls: int, theta_deg: float = 0.0, seed: int = 42
) -> tuple[np.ndarray, np.ndarray]:
    """n_walls개 axis-aligned 벽 triangle 합성 mesh + theta_deg yaw 회전.

    각 triangle은 normal=+x인 단위 quad 절반 (3 vertex)로 axis-aligned 벽 면 시뮬레이션.
    위치는 무작위 분산 → AABB 분포 다양. theta_deg!=0이면 mesh 전체 yaw 회전 적용 →
    벽 normal mean이 그만큼 어긋난 mesh를 만듦 (회전 보정 검증용).
    """
    rng = np.random.default_rng(seed)
    vertices: list[list[float]] = []
    triangles: list[list[int]] = []
    for _ in range(n_walls):
        offset = rng.uniform(-50, 50, 3)
        # cross((0,1,0), (0,0,1)) = (1, 0, 0) → normal=+x
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
    """벽 normal 4× wrap circular mean — [-22.5°, 22.5°] signed.

    `_align_walls_to_axes` land 검증용. 헬퍼 출력 mesh의 wall normal이
    axis-aligned에 정렬됐는지 정량 측정.
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
    """10° CCW 기울어진 벽 mesh — 회전 보정 후 wall mean ≈ 0°.

    Phase 1+2 Step 11 회귀 방어 — IFC 좌표계 회전(haus +3.7° / SampleHouse +10°)
    이 mesh 단계에서 벽 normal 기준으로 정확히 보정되는지 정량 검증.
    """
    verts, tris = _build_wall_mesh(n_walls=128, theta_deg=10.0)
    pre_mean = _measure_wall_mean_deg(verts, tris)
    assert abs(pre_mean - 10.0) < 0.5  # 10° 어긋난 상태 시작

    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is True
    post_mean = _measure_wall_mean_deg(rotated, tris)
    assert abs(post_mean) < 0.1  # axis-aligned 정렬


def test_align_walls_idempotent_on_already_aligned_mesh() -> None:
    """이미 axis-aligned 벽 mesh — 회전 적용되어도 wall mean 0° 유지."""
    verts, tris = _build_wall_mesh(n_walls=128, theta_deg=0.0)
    pre_mean = _measure_wall_mean_deg(verts, tris)
    assert abs(pre_mean) < 0.1  # 시작 정렬

    rotated, _ = _align_walls_to_axes(verts, tris)
    post_mean = _measure_wall_mean_deg(rotated, tris)

    # axis-aligned 보존 — 회전 적용 여부 무관하게 mean ≈ 0
    assert abs(post_mean) < 0.1


def test_align_walls_skips_when_too_few_walls() -> None:
    """벽 면 < WALL_NORMAL_MIN_COUNT(4) → 무회전 (데이터 부족).

    직사각형 단순 박스 mesh도 4면 보유 — 4 미만은 비정상 mesh.
    분포 신뢰도는 별도(`WALL_NORMAL_MIN_MAGNITUDE`)가 가드.
    """
    verts, tris = _build_wall_mesh(n_walls=3, theta_deg=10.0)
    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is False
    np.testing.assert_array_equal(rotated, verts)


def test_align_walls_skips_for_vertex_shortage() -> None:
    """vertex 수 < 3 → 무회전 (face 정의 불가)."""
    verts = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]])
    tris = np.empty((0, 3), dtype=np.int64)
    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is False
    np.testing.assert_array_equal(rotated, verts)


def test_align_walls_skips_for_empty_triangles() -> None:
    """triangle 0개 → 무회전 (face normal 산출 불가)."""
    verts = np.random.default_rng(42).uniform(-10, 10, (50, 3))
    tris = np.empty((0, 3), dtype=np.int64)
    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is False
    np.testing.assert_array_equal(rotated, verts)


def test_add_ground_plane_appends_4_vertices_and_2_triangles() -> None:
    """ground plane 추가 — 4 vertex(quad corners) + 2 triangle 누적."""
    verts = np.array(
        [[0.0, 0.0, 0.0], [10.0, 5.0, 0.0], [5.0, 0.0, 3.0]], dtype=np.float64
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, new_tris = _add_ground_plane(verts, tris)

    assert len(new_verts) == len(verts) + 4
    assert len(new_tris) == len(tris) + 2


def test_add_ground_plane_z_at_aabb_min() -> None:
    """ground plane z = 입력 mesh AABB.z_min — 바닥에 정렬."""
    verts = np.array(
        [[0.0, 0.0, 1.5], [10.0, 5.0, 1.5], [5.0, 0.0, 4.5]], dtype=np.float64
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, _ = _add_ground_plane(verts, tris)
    ground_verts = new_verts[len(verts):]

    assert np.allclose(ground_verts[:, 2], 1.5), "ground z should match AABB.z_min"


def test_add_ground_plane_normal_points_up() -> None:
    """ground plane 두 triangle 모두 normal +z (위쪽) — wall_mask에 안 걸림.

    `_align_walls_to_axes`의 `|n_z| < 0.1` 필터에 안 걸려야 회전 보정에 영향 없음.
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
    """ground plane xy 범위 = mesh AABB xy extent × GROUND_EXTENT_FACTOR.

    factor 변경 시(예: 2.0→1.2 옵션 EE) 자동 반영 — hard-coded 수치 회귀 방어.
    """
    verts = np.array(
        [[0.0, 0.0, 0.0], [10.0, 0.0, 0.0], [10.0, 6.0, 0.0], [0.0, 6.0, 3.0]],
        dtype=np.float64,
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, _ = _add_ground_plane(verts, tris)
    ground_verts = new_verts[len(verts):]
    g_x_extent = ground_verts[:, 0].max() - ground_verts[:, 0].min()
    g_y_extent = ground_verts[:, 1].max() - ground_verts[:, 1].min()

    # 입력 AABB xy extent: 10, 6 → ground = factor × 입력
    assert abs(g_x_extent - 10.0 * GROUND_EXTENT_FACTOR) < 1e-9
    assert abs(g_y_extent - 6.0 * GROUND_EXTENT_FACTOR) < 1e-9


def test_attach_ground_plane_to_mesh_appends_4_vertices() -> None:
    """`attach_ground_plane_to_mesh` — Open3D mesh wrapper, vertex 4 + triangle 2 추가.

    `_add_ground_plane`(numpy 단계) 호출 후 새 TriangleMesh 구성. 입력 mesh는 변경 없음.
    """
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
    # 입력 mesh 보존
    assert len(base.vertices) == 3


def test_iso_views_removed_from_enum() -> None:
    """ISO_NE/ISO_NW/ISO_SE는 enum에서 완전 제거됨."""
    enum_names = {v.name for v in IFCView}
    assert "ISO_NE" not in enum_names
    assert "ISO_NW" not in enum_names
    assert "ISO_SE" not in enum_names
    # FRONT/SIDE/TOP/CORNER_LOW/BIRDS_EYE + EYE_*×3 = 8
    assert len(list(IFCView)) == 8


def test_eye_views_all_in_enum() -> None:
    """EYE_NE/NW/SE 3개가 IFCView enum에 등록 + 활성 dict 모두 매핑 보유.

    Phase 3 회귀 방어 — 신규 view 추가 시 dict 매핑 누락하면 KeyError.
    """
    from ai_rendering.ifc2img.views import VIEW_CAMERAS

    eye_views = (IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE)
    for v in eye_views:
        assert v in IFCView
        assert v in VIEW_CAMERAS
        assert v in VIEW_TARGET_RATIOS
        assert v in VIEW_PROMPT_SUFFIXES


def test_eye_views_have_zero_z_for_horizontal() -> None:
    """EYE_*의 카메라 front 벡터 z 성분이 0.0 — 사람 시선 *완전 수평*.

    ISO_*은 z=0.5(위에서 등각)이라 *대조*. EYE는 z=0 보장이 핵심 정체성.
    """
    from ai_rendering.ifc2img.views import VIEW_CAMERAS

    for v in (IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE):
        cam = VIEW_CAMERAS[v]
        assert cam.front[2] == 0.0, f"{v} front.z must be 0 for horizontal eye view"


def test_default_render_views_includes_eye() -> None:
    """기본 render_views()에 EYE_* 3개 모두 포함 — DEFAULT 5뷰."""
    for v in (IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE):
        assert v in DEFAULT_RENDER_VIEWS
    assert len(DEFAULT_RENDER_VIEWS) == 5


def test_default_render_views_excludes_hallucination_prone() -> None:
    """기본 render_views()는 환각 발생 시점(TOP/BIRDS_EYE/CORNER_LOW) 제외.

    제외 사유:
    - TOP: 지붕만 → facade prompt 불일치
    - BIRDS_EYE: 거의 위에서 봄 → TOP과 동일 환각
    - CORNER_LOW: 낮은 fill(0.15)로 prompt 환각 우세

    enum/매핑은 보존 — 호출자가 명시 전달 시 여전히 사용 가능.
    """
    excluded = {IFCView.TOP, IFCView.BIRDS_EYE, IFCView.CORNER_LOW}
    for v in excluded:
        assert v not in DEFAULT_RENDER_VIEWS
    # DEFAULT = FRONT/SIDE + EYE_*×3 = 5뷰
    assert len(DEFAULT_RENDER_VIEWS) == 5
    expected = set(IFCView) - excluded
    assert set(DEFAULT_RENDER_VIEWS) == expected


# --- 옵션 B 공통 자산 — VIEW_PROMPT_SUFFIXES + build_view_prompt ---


def test_view_prompt_suffixes_top_birds_eye_have_environment_words() -> None:
    """default 제외된 시점(TOP/BIRDS_EYE/CORNER_LOW)은 명시 호출 시 환경 단서 포함.

    환경 단서가 있는 시점은 *명시 호출* 시점만 — EYE_*는 빈 suffix(향후 고도화).
    """
    for v in (IFCView.TOP, IFCView.BIRDS_EYE, IFCView.CORNER_LOW):
        suffix = VIEW_PROMPT_SUFFIXES[v]
        assert suffix, f"{v} suffix should not be empty"
        assert "grass" in suffix or "lawn" in suffix or "view" in suffix


def test_view_prompt_suffixes_front_side_eye_empty() -> None:
    """default(FRONT/SIDE/EYE_*) 시점은 빈 suffix — 시간대 suffix는 preset 단계 책임."""
    for v in (IFCView.FRONT, IFCView.SIDE, IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE):
        assert VIEW_PROMPT_SUFFIXES[v] == ""


def test_view_prompt_prefixes_eye_describe_ground_and_sky_position() -> None:
    """EYE_* view prefix adds short front-loaded ground and sky placement cues."""
    for v in (IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE):
        prefix = VIEW_PROMPT_PREFIXES[v]
        assert "eye-level diagonal view" in prefix
        assert "building on flat ground" in prefix
        assert "foreground ground fills frame" in prefix
        assert "horizon behind house" in prefix
        assert "not aerial" in prefix


def test_build_view_prompt_appends_suffix_for_top() -> None:
    """TOP에 base prompt 합성 시 suffix 덧붙음 (명시 호출용 시점)."""
    base = "RAW photo, scandinavian house"
    result = build_view_prompt(base, IFCView.TOP)
    assert result.startswith(base)
    assert len(result) > len(base)
    assert "aerial" in result or "roof" in result


def test_build_view_prompt_returns_base_for_front_side_empty_suffix() -> None:
    """FRONT/SIDE/EYE_*처럼 suffix가 빈 문자열이면 base 그대로 반환."""
    base = "RAW photo, scandinavian house"
    assert build_view_prompt(base, IFCView.FRONT) == base
    assert build_view_prompt(base, IFCView.SIDE) == base


def test_build_view_prompt_prepends_prefix_for_eye() -> None:
    """EYE_* prompt front-loads diagonal ground and sky placement cues."""
    base = "RAW photo, scandinavian house"
    result = build_view_prompt(base, IFCView.EYE_NE)

    assert result.startswith("eye-level diagonal view")
    assert len(result) > len(base)
    assert result.endswith(base)
    assert "building on flat ground" in result
    assert "foreground ground fills frame" in result
    assert "horizon behind house" in result
    assert "not aerial" in result


# --- B-3 — build_view_prompt 공개 API export ---


def test_build_view_prompt_removes_blue_sky_for_eye() -> None:
    """EYE_* prompt removes the generic day blue-sky prior from the composed prompt."""
    base = "RAW photo, scandinavian house, during sunny daytime, natural sunlight, blue sky"

    result = build_view_prompt(base, IFCView.EYE_NE)

    assert "blue sky" not in result
    assert "during sunny daytime" in result
    assert "natural sunlight" in result
    assert "building on flat ground" in result


def test_build_view_prompt_keeps_blue_sky_for_front() -> None:
    """FRONT keeps the preset day suffix unchanged."""
    base = "RAW photo, scandinavian house, during sunny daytime, natural sunlight, blue sky"

    result = build_view_prompt(base, IFCView.FRONT)

    assert result == base
    assert "blue sky" in result


def test_build_view_prompt_in_public_api() -> None:
    """B-3 — build_view_prompt가 ifc2img.__all__에 등록되어 외부에서 직접 import 가능."""
    from ai_rendering import ifc2img
    from ai_rendering.ifc2img import build_view_prompt as exported

    assert "build_view_prompt" in ifc2img.__all__
    # 동일 함수 레퍼런스 (재정의 X)
    from ai_rendering.ifc2img.views import build_view_prompt as internal
    assert exported is internal


def test_excluded_views_still_callable_explicitly() -> None:
    """제외된 시점 모두 명시 전달 시 사용 가능 — enum/카메라/매핑 보존."""
    from ai_rendering.ifc2img.views import VIEW_CAMERAS, VIEW_TARGET_RATIOS

    # 제외된 3개 view 모두 매핑에 등록돼있어야 한다 (default 제외 ≠ enum 제거)
    for v in (IFCView.TOP, IFCView.BIRDS_EYE, IFCView.CORNER_LOW):
        assert v in VIEW_CAMERAS
        assert v in VIEW_TARGET_RATIOS


def test_view_target_ratios_cropping_resistant() -> None:
    """잘림 위험 큰 시점들이 측면(FRONT/SIDE)보다 작은 target ratio 가져야 — cropping 방어."""
    front_ratio = VIEW_TARGET_RATIOS[IFCView.FRONT]
    # 위/등각 시점은 모두 측면보다 작아야
    for v in (IFCView.TOP, IFCView.BIRDS_EYE, IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE):
        assert VIEW_TARGET_RATIOS[v] < front_ratio
    # CORNER_LOW는 가장 잘리던 시점 → 등각보다도 작거나 같아야
    assert VIEW_TARGET_RATIOS[IFCView.CORNER_LOW] <= VIEW_TARGET_RATIOS[IFCView.EYE_NE]


def test_renderer_resolves_view_specific_target() -> None:
    """_resolve_target_ratio가 view-별 매핑값을 반환 + small mesh에서 base 그대로.

    small mesh(extent <20m, dispatch 임계값 미만)에서는 dispatch 배율 적용 안 됨 →
    `VIEW_TARGET_RATIOS[view]` 그대로 반환. 큰 mesh의 dispatch 동작은 별도 테스트
    (`test_resolve_target_ratio_for_*_mesh`)에서 검증.
    """
    renderer = IFCRenderer(target_screen_ratio=0.99)  # fallback
    # extent ~10m mesh — dispatch 임계값(20m) 미만 → base 그대로
    small_mesh = MagicMock()
    small_mesh.vertices = np.array([[0.0, 0.0, 0.0], [10.0, 5.0, 3.0]])

    # TOP은 매핑 등록됨 → 매핑값 우선
    top_resolved = renderer._resolve_target_ratio(IFCView.TOP, small_mesh)
    assert top_resolved == VIEW_TARGET_RATIOS[IFCView.TOP]
    # 모든 등록 view의 매핑값이 fallback과 다름을 가정 (현재 매핑 값 0.12~0.20, fallback 0.99)
    for v in IFCView:
        assert renderer._resolve_target_ratio(v, small_mesh) == VIEW_TARGET_RATIOS[v]


# --- 옵션 B — fixture별 dispatch (resolve_target_ratio_for_mesh) ---


def test_resolve_target_ratio_for_small_mesh_returns_base() -> None:
    """small mesh(extent ≤ 20m, haus/SampleHouse 시나리오) → base 그대로.

    임계값 미만이라 dispatch 배율 적용 안 됨. base_ratio 명시도 작동 검증.
    """
    # 명시적 base_ratio
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 13.0, base_ratio=0.20) == 0.20
    assert resolve_target_ratio_for_mesh(IFCView.SIDE, 17.0, base_ratio=0.20) == 0.20
    # base_ratio 미지정 → VIEW_TARGET_RATIOS 사용
    assert (
        resolve_target_ratio_for_mesh(IFCView.FRONT, 10.0)
        == VIEW_TARGET_RATIOS[IFCView.FRONT]
    )
    # 경계값 — 정확히 20.0은 medium 분기 미적용 (`>` 사용) → base 그대로
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 20.0, base_ratio=0.20) == 0.20


def test_resolve_target_ratio_for_medium_mesh_scales_down() -> None:
    """medium mesh(20 < extent ≤ 50m) → base × DISPATCH_MEDIUM_FACTOR (=0.8)."""
    base = 0.20
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 30.0, base_ratio=base) == (
        base * DISPATCH_MEDIUM_FACTOR
    )
    # 경계값 — 50.0 정확히 medium 분기 (`> 50` 사용) → 여전히 medium
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 50.0, base_ratio=base) == (
        base * DISPATCH_MEDIUM_FACTOR
    )
    # ISO 기본값에서도 작동
    iso_base = VIEW_TARGET_RATIOS[IFCView.EYE_NE]
    assert resolve_target_ratio_for_mesh(IFCView.EYE_NE, 35.0) == (
        iso_base * DISPATCH_MEDIUM_FACTOR
    )


def test_resolve_target_ratio_for_large_mesh_scales_more() -> None:
    """large mesh(extent > 50m, Smiley 75m 시나리오) → base × DISPATCH_LARGE_FACTOR (=0.6)."""
    base = 0.20
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 75.0, base_ratio=base) == (
        base * DISPATCH_LARGE_FACTOR
    )
    assert resolve_target_ratio_for_mesh(IFCView.SIDE, 100.0, base_ratio=base) == (
        base * DISPATCH_LARGE_FACTOR
    )
    # ISO 기본값에서도 작동
    iso_base = VIEW_TARGET_RATIOS[IFCView.EYE_NE]
    assert resolve_target_ratio_for_mesh(IFCView.EYE_NE, 75.0) == (
        iso_base * DISPATCH_LARGE_FACTOR
    )


# --- dispatch base_mesh 분리 (ground 포함 mesh 아닌 건물 본체로 임계값 판단) ---


def test_render_mesh_dispatch_uses_base_mesh_not_ground_extended() -> None:
    """`_render_mesh`는 dispatch 임계값 판단을 *base_mesh*(건물 본체)로 한다.

    *렌더용 view_mesh*(ground 포함)로 `_resolve_target_ratio`를 호출하면 ground ×
    factor가 max_extent에 포함돼 dispatch 임계값(20m/50m)이 *건물 본체*가 아닌
    ground 포함 결과 기준으로 잘못 트리거된다(예: 17m → ground 포함 ~20m → MEDIUM
    잘못 분류). 이 테스트: base_mesh(13m) + view_mesh(25m 인플레이션 시뮬) 분리
    전달 → dispatch는 base 기준이라 base * 1.0 반환. view_mesh 기준이면 MEDIUM(×
    0.8) 적용됐을 것.
    """
    renderer = IFCRenderer()
    base_mesh = MagicMock()
    base_mesh.vertices = np.array([[0.0, 0.0, 0.0], [13.0, 13.0, 5.0]])  # 13m
    view_mesh = MagicMock()
    view_mesh.vertices = np.array([[0.0, 0.0, 0.0], [25.0, 25.0, 5.0]])  # 25m

    base_ratio = renderer._resolve_target_ratio(IFCView.FRONT, base_mesh)
    view_ratio = renderer._resolve_target_ratio(IFCView.FRONT, view_mesh)

    assert base_ratio == VIEW_TARGET_RATIOS[IFCView.FRONT]  # 13m → factor 1.0
    assert view_ratio == VIEW_TARGET_RATIOS[IFCView.FRONT] * DISPATCH_MEDIUM_FACTOR
    # 두 결과가 *반드시 다름* — 이 차이가 base_mesh를 쓰지 않을 때 발생한 회귀
    assert base_ratio != view_ratio


def test_render_passes_base_mesh_to_resolve_target_ratio() -> None:
    """`render()` 통합 — _resolve_target_ratio가 *base_mesh*(load_mesh 결과)로 호출됨.

    attach_ground_plane_to_mesh가 *다른 mesh* 반환하도록 mock하고,
    `IFCRenderer._resolve_target_ratio`를 spy해 base_mesh가 전달되는지 확인.
    """
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
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        depth = np.zeros((448, 768), dtype=np.float32)
        depth[100:300, 200:500] = 5.0
        vis.capture_depth_float_buffer.return_value = depth

        renderer = IFCRenderer()
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    # _resolve_target_ratio는 base_mesh로 호출되어야 한다 (inflated_mesh 아님)
    assert len(captured) == 1
    assert captured[0] is base_mesh


def test_render_uses_static_view_camera() -> None:
    """render() 시 VIEW_CAMERAS의 정적 vector가 그대로 카메라 front로 사용됨."""
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
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        depth = np.zeros((448, 768), dtype=np.float32)
        depth[100:300, 200:500] = 5.0
        vis.capture_depth_float_buffer.return_value = depth

        renderer = IFCRenderer()
        renderer.render(Path("dummy.ifc"), IFCView.FRONT)

    # set_front은 IFCView.FRONT의 정적 vector (-1.0, 0.0, 0.0)로 호출 — z=0 완전 수평
    set_front_calls = vis.get_view_control.return_value.set_front.call_args_list
    assert len(set_front_calls) == 1
    assert set_front_calls[0].args[0] == [-1.0, 0.0, 0.0]


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
        # 예외 없이 통과해야 한다. load_mesh는 building geometry만 반환
        # (ground plane은 view-aware로 IFCRenderer에서 추가, 옵션 OO).
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

    # 두 entity 모두 포함되면 mesh vertex 6개. wall만 포함이면 3개.
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


# depth 후처리 상단 background fill 시도 폐기 — SD가 mid-raw 회색 띠를 *수평선
# 구조물*이 아니라 *건물 자체의 지붕*으로 해석해 사진 위 1/3이 지붕처럼 나옴.
# depth 후처리 단서가 SD prior에 흡수되어 의도와 다른 결과.
