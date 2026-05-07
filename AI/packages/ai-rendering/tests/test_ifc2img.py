"""ifc2img 紐⑤뱢 ?뚯뒪????depth 蹂??+ ?뚮뜑 ?몄텧 ?먮쫫 + IFC4 schema 媛??

GPU/?붿뒪?뚮젅??誘명븘?? Visualizer/load_mesh??mock ?쇰줈 寃⑸━.
schema 媛?쒕뒗 ?ㅼ젣 fixtures 濡?寃利?(ifcopenshell 留??ъ슜 ??媛踰쇱?).
"""

# ruff: noqa: E501

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


# --- _depth_to_image ?쒖닔 ?⑥닔 ?⑥쐞 ?뚯뒪??(mock 遺덊븘?? ---


def test_depth_to_image_shape_preserved() -> None:
    """?낅젰 depth array shape 媛 洹몃?濡?PIL.size ??諛섏쁺?섍퀬 mode='L'."""
    h, w = 448, 768
    depth = np.full((h, w), 5.0, dtype=np.float32)

    img = IFCRenderer._depth_to_image(depth)

    assert img.mode == "L"
    assert img.size == (w, h)  # PIL.size ??(width, height)


def test_depth_to_image_background_is_black() -> None:
    """depth==0 ?쎌?(諛곌꼍)? 寃곌낵?먯꽌 0(寃?? ?쇰줈 ?섏????쒕떎."""
    depth = np.zeros((10, 10), dtype=np.float32)
    depth[5, 5] = 3.0  # ?⑥씪 geometry ?쎌?
    depth[5, 6] = 7.0

    img = IFCRenderer._depth_to_image(depth)
    arr = np.array(img)

    # 0 ???낅젰? 諛곌꼍 ??寃곌낵??0
    bg_mask = depth == 0
    assert arr[bg_mask].max() == 0


def test_depth_to_image_closer_is_brighter() -> None:
    """媛源뚯슫(?묒? depth) ?쎌???癒??쎌?蹂대떎 寃곌낵?먯꽌 諛앸떎."""
    depth = np.zeros((4, 4), dtype=np.float32)
    depth[0, 0] = 1.0  # 媛源뚯?
    depth[0, 1] = 5.0  # 以묎컙
    depth[0, 2] = 10.0  # 硫??

    img = IFCRenderer._depth_to_image(depth)
    arr = np.array(img)

    assert arr[0, 0] > arr[0, 1] > arr[0, 2]
    assert arr[0, 0] == 255  # 媛??媛源뚯슫 ?쎌? = 理쒕? 諛앷린
    assert arr[0, 2] == 0  # 媛??癒??쎌? = 理쒖냼 諛앷린


def test_depth_to_image_uniform_depth() -> None:
    """紐⑤뱺 geom ?쎌????숈씪 depth (d_min == d_max) ??255 (諛앹쓬)."""
    depth = np.zeros((4, 4), dtype=np.float32)
    depth[1:3, 1:3] = 5.0  # ?숈씪 嫄곕━??geometry ?곸뿭

    img = IFCRenderer._depth_to_image(depth)
    arr = np.array(img)

    geom_mask = depth > 0
    assert (arr[geom_mask] == 255).all()
    assert (arr[~geom_mask] == 0).all()


def test_depth_to_image_all_background_raises() -> None:
    """?꾨? 0(諛곌꼍)???낅젰? IFCRenderError 濡?紐낆떆 嫄곕?."""
    depth = np.zeros((10, 10), dtype=np.float32)

    with pytest.raises(IFCRenderError, match="geometry"):
        IFCRenderer._depth_to_image(depth)


# --- IFCRenderer Visualizer ?몄텧 ?먮쫫 (mock ?꾩슂) ---


def _make_fake_depth_buffer(value: float = 5.0) -> np.ndarray:
    arr = np.zeros((448, 768), dtype=np.float32)
    arr[100:300, 200:500] = value
    return arr


def test_renderer_calls_depth_buffer() -> None:
    """?뚮뜑?ш? RGB 媛 ?꾨땶 depth float buffer 瑜??몄텧?쒕떎."""
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
    """render_views(3酉? ?몄텧?먮룄 load_mesh ??1踰덈쭔 ??IFC ?뚯떛? 鍮꾩떥??"""
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
    # render_views(views=None) uses the five supported production views.

    assert set(results.keys()) == set(DEFAULT_RENDER_VIEWS)
    assert vis.capture_depth_float_buffer.call_count == len(DEFAULT_RENDER_VIEWS)


# --- IFC4 schema 媛??(?뺤긽 寃쎈줈???ㅼ젣 fixture, 遺??寃쎈줈??mock) ---


def test_load_mesh_rejects_non_ifc4() -> None:
    """鍮껱FC4 ?ㅽ궎留???IFCRenderError, 硫붿떆吏???낅젰 ?ㅽ궎留??ы븿.

    IFC 2x3 fixture ?뚯씪? 蹂댁쑀?섏? ?딆쑝誘濡?ifcopenshell.open??mock??
    schema 媛?쒕쭔 寃⑸━ 寃利? 媛???⑥닔 ?먯껜???ㅼ젣 鍮껱FC4 ?낅젰?먮룄 ?묐룞.
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
    """IFC4 ?낅젰 ???뺤긽 吏꾪뻾 (?덉쇅 ?놁쓬, mesh + center 諛섑솚)."""
    mesh, center = load_mesh(ifc4_fixture)

    assert center.shape == (3,)
    assert len(mesh.vertices) > 0
    assert len(mesh.triangles) > 0


# --- 移대찓??zoom 紐⑤뱶 (AutoZoomMode.OFF / ITERATIVE) ---


def test_renderer_default_uses_static_zoom() -> None:
    """湲곕낯 auto_zoom=OFF ??views.py???뺤쟻 zoom(0.5) 洹몃?濡??꾨떖."""
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

    # OFF 紐⑤뱶: 1??set_zoom + 1??capture, VIEW_CAMERAS[FRONT].zoom=0.5
    vis.get_view_control.return_value.set_zoom.assert_called_once_with(0.5)
    assert vis.capture_depth_float_buffer.call_count == 1


def _make_depth_with_fill(fill_ratio: float, h: int = 448, w: int = 768) -> np.ndarray:
    """二쇱뼱吏?fill 鍮꾩쑉??媛뽯뒗 depth 諛곗뿴 ?⑹꽦 (geom>0 ?쎌? 鍮꾩쑉 = fill_ratio)."""
    arr = np.zeros((h, w), dtype=np.float32)
    n_geom = int(h * w * fill_ratio)
    arr.flat[:n_geom] = 5.0
    return arr


def test_iterative_zoom_converges_when_target_reached() -> None:
    """ITERATIVE 紐⑤뱶 ??fill??view-蹂?target tolerance ?덉뿉 ?ㅻ㈃ 利됱떆 醫낅즺.

    IFCView.FRONT??VIEW_TARGET_RATIOS[FRONT]=0.20???곸슜?쒕떎.
    fill=0.20 짹 0.10 = [0.10, 0.30] ????1??capture濡??섎졃.
    """
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])

    target_depth = _make_depth_with_fill(0.20)  # FRONT??view-蹂?target

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

    # 泥?iteration?먯꽌 ?섎졃 ??capture 1??
    assert vis.capture_depth_float_buffer.call_count == 1


def test_iterative_zoom_max_iter_caps() -> None:
    """ITERATIVE ???섎졃 ???대룄 iter_max?먯꽌 諛섎뱶??醫낅즺 (臾댄븳猷⑦봽 諛⑹?)."""
    fake_mesh = MagicMock()
    fake_mesh.vertices = np.array([[0, 0, 0], [10, 10, 5]])
    fake_center = np.array([5.0, 5.0, 2.5])

    # ?섎룄?곸쑝濡?target 諛?fill ???섎졃 ????
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

    # iter_max=3 ??capture ?뺥솗??3??
    assert vis.capture_depth_float_buffer.call_count == 3


def test_iterative_zoom_bool_true_maps_to_iterative() -> None:
    """auto_zoom=True (bool) ??AutoZoomMode.ITERATIVE ?먮룞 留ㅽ븨 (backward compat)."""
    renderer = IFCRenderer(auto_zoom=True)
    assert renderer.auto_zoom == AutoZoomMode.ITERATIVE

    renderer_off = IFCRenderer(auto_zoom=False)
    assert renderer_off.auto_zoom == AutoZoomMode.OFF


# --- 移대뱶 B + 款: PCA 湲곕컲 ?숈쟻 front + ?깃컖 酉?---


def _build_wall_mesh(
    n_walls: int, theta_deg: float = 0.0, seed: int = 42
) -> tuple[np.ndarray, np.ndarray]:
    """n_walls媛?axis-aligned 踰?triangle ?⑹꽦 mesh + theta_deg yaw ?뚯쟾.

    媛?triangle? normal=+x???⑥쐞 quad ?덈컲 (3 vertex)濡?axis-aligned 踰?硫??쒕??덉씠??
    ?꾩튂??臾댁옉??遺꾩궛 ??AABB 遺꾪룷 ?ㅼ뼇. theta_deg!=0?대㈃ mesh ?꾩껜 yaw ?뚯쟾 ?곸슜 ??
    踰?normal mean??洹몃쭔???닿툔??mesh瑜?留뚮벀 (?뚯쟾 蹂댁젙 寃利앹슜).
    """
    rng = np.random.default_rng(seed)
    vertices: list[list[float]] = []
    triangles: list[list[int]] = []
    for _ in range(n_walls):
        offset = rng.uniform(-50, 50, 3)
        # cross((0,1,0), (0,0,1)) = (1, 0, 0) ??normal=+x
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
    """踰?normal 4횞 wrap circular mean ??[-22.5째, 22.5째] signed.

    `_align_walls_to_axes` land 寃利앹슜. ?ы띁 異쒕젰 mesh??wall normal??
    axis-aligned???뺣젹?먮뒗吏 ?뺣웾 痢≪젙.
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
    """10째 CCW 湲곗슱?댁쭊 踰?mesh ???뚯쟾 蹂댁젙 ??wall mean ??0째.

    Phase 1+2 Step 11 ?뚭? 諛⑹뼱 ??IFC 醫뚰몴怨??뚯쟾(haus +3.7째 / SampleHouse +10째)
    ??mesh ?④퀎?먯꽌 踰?normal 湲곗??쇰줈 ?뺥솗??蹂댁젙?섎뒗吏 ?뺣웾 寃利?
    """
    verts, tris = _build_wall_mesh(n_walls=128, theta_deg=10.0)
    pre_mean = _measure_wall_mean_deg(verts, tris)
    assert abs(pre_mean - 10.0) < 0.5  # 10째 ?닿툔???곹깭 ?쒖옉

    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is True
    post_mean = _measure_wall_mean_deg(rotated, tris)
    assert abs(post_mean) < 0.1  # axis-aligned ?뺣젹


def test_align_walls_idempotent_on_already_aligned_mesh() -> None:
    """?대? axis-aligned 踰?mesh ???뚯쟾 ?곸슜?섏뼱??wall mean 0째 ?좎?."""
    verts, tris = _build_wall_mesh(n_walls=128, theta_deg=0.0)
    pre_mean = _measure_wall_mean_deg(verts, tris)
    assert abs(pre_mean) < 0.1  # ?쒖옉 ?뺣젹

    rotated, _ = _align_walls_to_axes(verts, tris)
    post_mean = _measure_wall_mean_deg(rotated, tris)

    # axis-aligned 蹂댁〈 ???뚯쟾 ?곸슜 ?щ? 臾닿??섍쾶 mean ??0
    assert abs(post_mean) < 0.1


def test_align_walls_skips_when_too_few_walls() -> None:
    """踰?硫?< WALL_NORMAL_MIN_COUNT(4) ??臾댄쉶??(?곗씠??遺議?.

    吏곸궗媛곹삎 ?⑥닚 諛뺤뒪 mesh??4硫?蹂댁쑀 ??4 誘몃쭔? 鍮꾩젙??mesh.
    遺꾪룷 ?좊ː?꾨뒗 蹂꾨룄(`WALL_NORMAL_MIN_MAGNITUDE`)媛 媛??
    """
    verts, tris = _build_wall_mesh(n_walls=3, theta_deg=10.0)
    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is False
    np.testing.assert_array_equal(rotated, verts)


def test_align_walls_skips_for_vertex_shortage() -> None:
    """vertex ??< 3 ??臾댄쉶??(face ?뺤쓽 遺덇?)."""
    verts = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]])
    tris = np.empty((0, 3), dtype=np.int64)
    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is False
    np.testing.assert_array_equal(rotated, verts)


def test_align_walls_skips_for_empty_triangles() -> None:
    """triangle 0媛???臾댄쉶??(face normal ?곗텧 遺덇?)."""
    verts = np.random.default_rng(42).uniform(-10, 10, (50, 3))
    tris = np.empty((0, 3), dtype=np.int64)
    rotated, did_rotate = _align_walls_to_axes(verts, tris)

    assert did_rotate is False
    np.testing.assert_array_equal(rotated, verts)


def test_add_ground_plane_appends_4_vertices_and_2_triangles() -> None:
    """ground plane 異붽? ??4 vertex(quad corners) + 2 triangle ?꾩쟻."""
    verts = np.array(
        [[0.0, 0.0, 0.0], [10.0, 5.0, 0.0], [5.0, 0.0, 3.0]], dtype=np.float64
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, new_tris = _add_ground_plane(verts, tris)

    assert len(new_verts) == len(verts) + 4
    assert len(new_tris) == len(tris) + 2


def test_add_ground_plane_z_at_aabb_min() -> None:
    """ground plane z = ?낅젰 mesh AABB.z_min ??諛붾떏???뺣젹."""
    verts = np.array(
        [[0.0, 0.0, 1.5], [10.0, 5.0, 1.5], [5.0, 0.0, 4.5]], dtype=np.float64
    )
    tris = np.array([[0, 1, 2]], dtype=np.int64)

    new_verts, _ = _add_ground_plane(verts, tris)
    ground_verts = new_verts[len(verts):]

    assert np.allclose(ground_verts[:, 2], 1.5), "ground z should match AABB.z_min"


def test_add_ground_plane_normal_points_up() -> None:
    """ground plane ??triangle 紐⑤몢 normal +z (?꾩そ) ??wall_mask????嫄몃┝.

    `_align_walls_to_axes`??`|n_z| < 0.1` ?꾪꽣????嫄몃젮???뚯쟾 蹂댁젙???곹뼢 ?놁쓬.
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
    """ground plane xy 踰붿쐞 = mesh AABB xy extent 횞 GROUND_EXTENT_FACTOR.

    factor 蹂寃????? 2.0??.2 ?듭뀡 EE) ?먮룞 諛섏쁺 ??hard-coded ?섏튂 ?뚭? 諛⑹뼱.
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

    # ?낅젰 AABB xy extent: 10, 6 ??ground = factor 횞 ?낅젰
    assert abs(g_x_extent - 10.0 * GROUND_EXTENT_FACTOR) < 1e-9
    assert abs(g_y_extent - 6.0 * GROUND_EXTENT_FACTOR) < 1e-9


def test_add_ground_plane_accepts_extent_factor_override() -> None:
    """ground plane extent can be tuned for opt-in EYE geometry experiments."""
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
    """`attach_ground_plane_to_mesh` ??Open3D mesh wrapper, vertex 4 + triangle 2 異붽?.

    `_add_ground_plane`(numpy ?④퀎) ?몄텧 ????TriangleMesh 援ъ꽦. ?낅젰 mesh??蹂寃??놁쓬.
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
    # ?낅젰 mesh 蹂댁〈
    assert len(base.vertices) == 3


def test_renderer_passes_eye_ground_extent_override_only_for_eye() -> None:
    """EYE geometry override should not change the default front/side ground path."""
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
        patch("ai_rendering.ifc2img.renderer.o3d") as mock_o3d,
    ):
        vis = MagicMock()
        mock_o3d.visualization.Visualizer.return_value = vis
        vis.capture_depth_float_buffer.return_value = _make_fake_depth_buffer()

        renderer = IFCRenderer(
            view_ground_extent_overrides={IFCView.EYE_NE: 0.9}
        )
        renderer.render_views(
            Path("dummy.ifc"),
            views=[IFCView.FRONT, IFCView.EYE_NE],
        )

    assert calls == [
        {"mesh": base_mesh},
        {"mesh": base_mesh, "extent_factor": 0.9},
    ]


def test_iso_views_removed_from_enum() -> None:
    """ISO_NE/ISO_NW/ISO_SE??enum?먯꽌 ?꾩쟾 ?쒓굅??"""
    enum_names = {v.name for v in IFCView}
    assert "ISO_NE" not in enum_names
    assert "ISO_NW" not in enum_names
    assert "ISO_SE" not in enum_names

    assert len(list(IFCView)) == 5


def test_eye_views_all_in_enum() -> None:
    """EYE_NE/NW/SE 3媛쒓? IFCView enum???깅줉 + ?쒖꽦 dict 紐⑤몢 留ㅽ븨 蹂댁쑀.

    Phase 3 ?뚭? 諛⑹뼱 ???좉퇋 view 異붽? ??dict 留ㅽ븨 ?꾨씫?섎㈃ KeyError.
    """
    from ai_rendering.ifc2img.views import VIEW_CAMERAS

    eye_views = (IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE)
    for v in eye_views:
        assert v in IFCView
        assert v in VIEW_CAMERAS
        assert v in VIEW_TARGET_RATIOS
        assert v in VIEW_PROMPT_SUFFIXES


def test_eye_views_have_zero_z_for_horizontal() -> None:
    """EYE_*??移대찓??front 踰≫꽣 z ?깅텇??0.0 ???щ엺 ?쒖꽑 *?꾩쟾 ?섑룊*.

    ISO_*? z=0.5(?꾩뿉???깃컖)?대씪 *?議?. EYE??z=0 蹂댁옣???듭떖 ?뺤껜??
    """
    from ai_rendering.ifc2img.views import VIEW_CAMERAS

    for v in (IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE):
        cam = VIEW_CAMERAS[v]
        assert cam.front[2] == 0.0, f"{v} front.z must be 0 for horizontal eye view"


def test_default_render_views_includes_eye() -> None:
    """湲곕낯 render_views()??EYE_* 3媛?紐⑤몢 ?ы븿 ??DEFAULT 5酉?"""
    for v in (IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE):
        assert v in DEFAULT_RENDER_VIEWS
    assert len(DEFAULT_RENDER_VIEWS) == 5


def test_removed_views_are_not_public_enum_members() -> None:
    """Unused top/corner_low/birds_eye views should not be callable anymore."""
    removed = {"top", "corner_low", "birds_eye"}

    assert removed.isdisjoint({view.value for view in IFCView})
    assert set(DEFAULT_RENDER_VIEWS) == set(IFCView)
    assert len(DEFAULT_RENDER_VIEWS) == 5


# --- ?듭뀡 B 怨듯넻 ?먯궛 ??VIEW_PROMPT_SUFFIXES + build_view_prompt ---



def test_view_prompt_suffixes_front_side_eye_empty() -> None:
    """default(FRONT/SIDE/EYE_*) ?쒖젏? 鍮?suffix ???쒓컙? suffix??preset ?④퀎 梨낆엫."""
    for v in (IFCView.FRONT, IFCView.SIDE, IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE):
        assert VIEW_PROMPT_SUFFIXES[v] == ""


def test_view_prompt_prefixes_eye_describe_ground_and_sky_position() -> None:
    """EYE_* view prefix adds short front-loaded ground and sky placement cues."""
    for v in (IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE):
        prefix = VIEW_PROMPT_PREFIXES[v]
        assert "eye-level diagonal view" in prefix
        assert "dry ground around house" in prefix
        assert "building on flat ground" in prefix
        assert "no pool" in prefix
        assert "not aerial" in prefix



def test_build_view_prompt_prepends_prefix_for_front_side() -> None:
    """FRONT/SIDE should prepend ground-line constraints before the base prompt."""
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


def test_build_view_prompt_prepends_prefix_for_eye() -> None:
    """EYE_* prompt front-loads diagonal ground and sky placement cues."""
    base = "RAW photo, scandinavian house"
    result = build_view_prompt(base, IFCView.EYE_NE)

    assert result.startswith("eye-level diagonal view")
    assert len(result) > len(base)
    assert result.endswith(base)
    assert "dry ground around house" in result
    assert "building on flat ground" in result
    assert "no pool" in result
    assert "not aerial" in result


# --- B-3 ??build_view_prompt 怨듦컻 API export ---


def test_build_view_prompt_removes_blue_sky_for_eye() -> None:
    """EYE_* prompt removes the generic day blue-sky prior from the composed prompt."""
    base = "RAW photo, scandinavian house, during sunny daytime, natural sunlight, blue sky"

    result = build_view_prompt(base, IFCView.EYE_NE)

    assert "blue sky" not in result
    assert "during sunny daytime" in result
    assert "natural sunlight" in result
    assert "building on flat ground" in result


def test_build_view_prompt_keeps_blue_sky_for_front() -> None:
    """FRONT keeps the day blue-sky text while adding ground-line constraints."""
    base = "RAW photo, scandinavian house, during sunny daytime, natural sunlight, blue sky"

    result = build_view_prompt(base, IFCView.FRONT)

    assert result.startswith("open flat ground in front")
    assert result.endswith(base)
    assert "blue sky" in result
    assert "no retaining wall" in result


def test_build_view_prompt_in_public_api() -> None:
    """B-3 ??build_view_prompt媛 ifc2img.__all__???깅줉?섏뼱 ?몃??먯꽌 吏곸젒 import 媛??"""
    from ai_rendering import ifc2img
    from ai_rendering.ifc2img import build_view_prompt as exported

    assert "build_view_prompt" in ifc2img.__all__
    # ?숈씪 ?⑥닔 ?덊띁?곗뒪 (?ъ젙??X)
    from ai_rendering.ifc2img.views import build_view_prompt as internal
    assert exported is internal



def test_view_target_ratios_cropping_resistant() -> None:
    """?섎┝ ?꾪뿕 ???쒖젏?ㅼ씠 痢〓㈃(FRONT/SIDE)蹂대떎 ?묒? target ratio 媛?몄빞 ??cropping 諛⑹뼱."""
    front_ratio = VIEW_TARGET_RATIOS[IFCView.FRONT]
    # ???깃컖 ?쒖젏? 紐⑤몢 痢〓㈃蹂대떎 ?묒븘??
    for v in (IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE):
        assert VIEW_TARGET_RATIOS[v] < front_ratio


def test_renderer_resolves_view_specific_target() -> None:
    """_resolve_target_ratio媛 view-蹂?留ㅽ븨媛믪쓣 諛섑솚 + small mesh?먯꽌 base 洹몃?濡?

    small mesh(extent <20m, dispatch ?꾧퀎媛?誘몃쭔)?먯꽌??dispatch 諛곗쑉 ?곸슜 ??????
    `VIEW_TARGET_RATIOS[view]` 洹몃?濡?諛섑솚. ??mesh??dispatch ?숈옉? 蹂꾨룄 ?뚯뒪??
    (`test_resolve_target_ratio_for_*_mesh`)?먯꽌 寃利?
    """
    renderer = IFCRenderer(target_screen_ratio=0.99)  # fallback
    # extent ~10m mesh ??dispatch ?꾧퀎媛?20m) 誘몃쭔 ??base 洹몃?濡?
    small_mesh = MagicMock()
    small_mesh.vertices = np.array([[0.0, 0.0, 0.0], [10.0, 5.0, 3.0]])
    # 紐⑤뱺 ?깅줉 view??留ㅽ븨媛믪씠 fallback怨??ㅻ쫫??媛??(?꾩옱 留ㅽ븨 媛?0.12~0.20, fallback 0.99)
    for v in IFCView:
        assert renderer._resolve_target_ratio(v, small_mesh) == VIEW_TARGET_RATIOS[v]


# --- ?듭뀡 B ??fixture蹂?dispatch (resolve_target_ratio_for_mesh) ---


def test_resolve_target_ratio_for_small_mesh_returns_base() -> None:
    """small mesh(extent ??20m, haus/SampleHouse ?쒕굹由ъ삤) ??base 洹몃?濡?

    ?꾧퀎媛?誘몃쭔?대씪 dispatch 諛곗쑉 ?곸슜 ???? base_ratio 紐낆떆???묐룞 寃利?
    """
    # 紐낆떆??base_ratio
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 13.0, base_ratio=0.20) == 0.20
    assert resolve_target_ratio_for_mesh(IFCView.SIDE, 17.0, base_ratio=0.20) == 0.20
    # base_ratio 誘몄?????VIEW_TARGET_RATIOS ?ъ슜
    assert (
        resolve_target_ratio_for_mesh(IFCView.FRONT, 10.0)
        == VIEW_TARGET_RATIOS[IFCView.FRONT]
    )
    # 寃쎄퀎媛????뺥솗??20.0? medium 遺꾧린 誘몄쟻??(`>` ?ъ슜) ??base 洹몃?濡?
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 20.0, base_ratio=0.20) == 0.20


def test_resolve_target_ratio_for_medium_mesh_scales_down() -> None:
    """medium mesh(20 < extent ??50m) ??base 횞 DISPATCH_MEDIUM_FACTOR (=0.8)."""
    base = 0.20
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 30.0, base_ratio=base) == (
        base * DISPATCH_MEDIUM_FACTOR
    )
    # 寃쎄퀎媛???50.0 ?뺥솗??medium 遺꾧린 (`> 50` ?ъ슜) ???ъ쟾??medium
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 50.0, base_ratio=base) == (
        base * DISPATCH_MEDIUM_FACTOR
    )
    # ISO 湲곕낯媛믪뿉?쒕룄 ?묐룞
    iso_base = VIEW_TARGET_RATIOS[IFCView.EYE_NE]
    assert resolve_target_ratio_for_mesh(IFCView.EYE_NE, 35.0) == (
        iso_base * DISPATCH_MEDIUM_FACTOR
    )


def test_resolve_target_ratio_for_large_mesh_scales_more() -> None:
    """large mesh(extent > 50m, Smiley 75m ?쒕굹由ъ삤) ??base 횞 DISPATCH_LARGE_FACTOR (=0.6)."""
    base = 0.20
    assert resolve_target_ratio_for_mesh(IFCView.FRONT, 75.0, base_ratio=base) == (
        base * DISPATCH_LARGE_FACTOR
    )
    assert resolve_target_ratio_for_mesh(IFCView.SIDE, 100.0, base_ratio=base) == (
        base * DISPATCH_LARGE_FACTOR
    )
    # ISO 湲곕낯媛믪뿉?쒕룄 ?묐룞
    iso_base = VIEW_TARGET_RATIOS[IFCView.EYE_NE]
    assert resolve_target_ratio_for_mesh(IFCView.EYE_NE, 75.0) == (
        iso_base * DISPATCH_LARGE_FACTOR
    )


# --- dispatch base_mesh 遺꾨━ (ground ?ы븿 mesh ?꾨땶 嫄대Ъ 蹂몄껜濡??꾧퀎媛??먮떒) ---


def test_render_mesh_dispatch_uses_base_mesh_not_ground_extended() -> None:
    """`_render_mesh`??dispatch ?꾧퀎媛??먮떒??*base_mesh*(嫄대Ъ 蹂몄껜)濡??쒕떎.

    *?뚮뜑??view_mesh*(ground ?ы븿)濡?`_resolve_target_ratio`瑜??몄텧?섎㈃ ground 횞
    factor媛 max_extent???ы븿??dispatch ?꾧퀎媛?20m/50m)??*嫄대Ъ 蹂몄껜*媛 ?꾨땶
    ground ?ы븿 寃곌낵 湲곗??쇰줈 ?섎せ ?몃━嫄곕맂???? 17m ??ground ?ы븿 ~20m ??MEDIUM
    ?섎せ 遺꾨쪟). ???뚯뒪?? base_mesh(13m) + view_mesh(25m ?명뵆?덉씠???쒕?) 遺꾨━
    ?꾨떖 ??dispatch??base 湲곗??대씪 base * 1.0 諛섑솚. view_mesh 湲곗??대㈃ MEDIUM(횞
    0.8) ?곸슜?먯쓣 寃?
    """
    renderer = IFCRenderer()
    base_mesh = MagicMock()
    base_mesh.vertices = np.array([[0.0, 0.0, 0.0], [13.0, 13.0, 5.0]])  # 13m
    view_mesh = MagicMock()
    view_mesh.vertices = np.array([[0.0, 0.0, 0.0], [25.0, 25.0, 5.0]])  # 25m

    base_ratio = renderer._resolve_target_ratio(IFCView.FRONT, base_mesh)
    view_ratio = renderer._resolve_target_ratio(IFCView.FRONT, view_mesh)

    assert base_ratio == VIEW_TARGET_RATIOS[IFCView.FRONT]  # 13m ??factor 1.0
    assert view_ratio == VIEW_TARGET_RATIOS[IFCView.FRONT] * DISPATCH_MEDIUM_FACTOR
    # ??寃곌낵媛 *諛섎뱶???ㅻ쫫* ????李⑥씠媛 base_mesh瑜??곗? ?딆쓣 ??諛쒖깮???뚭?
    assert base_ratio != view_ratio


def test_render_passes_base_mesh_to_resolve_target_ratio() -> None:
    """`render()` ?듯빀 ??_resolve_target_ratio媛 *base_mesh*(load_mesh 寃곌낵)濡??몄텧??

    attach_ground_plane_to_mesh媛 *?ㅻⅨ mesh* 諛섑솚?섎룄濡?mock?섍퀬,
    `IFCRenderer._resolve_target_ratio`瑜?spy??base_mesh媛 ?꾨떖?섎뒗吏 ?뺤씤.
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

    # _resolve_target_ratio??base_mesh濡??몄텧?섏뼱???쒕떎 (inflated_mesh ?꾨떂)
    assert len(captured) == 1
    assert captured[0] is base_mesh


def test_render_uses_static_view_camera() -> None:
    """render() ??VIEW_CAMERAS???뺤쟻 vector媛 洹몃?濡?移대찓??front濡??ъ슜??"""
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

    # set_front? IFCView.FRONT???뺤쟻 vector (-1.0, 0.0, 0.0)濡??몄텧 ??z=0 ?꾩쟾 ?섑룊
    set_front_calls = vis.get_view_control.return_value.set_front.call_args_list
    assert len(set_front_calls) == 1
    assert set_front_calls[0].args[0] == [-1.0, 0.0, 0.0]


@pytest.mark.parametrize("schema_name", ["IFC4", "IFC4X1", "IFC4X2", "IFC4X3"])
def test_load_mesh_accepts_ifc4_variants(schema_name: str) -> None:
    """IFC4 怨꾩뿴(IFC4X1/IFC4X3 ?? 紐⑤몢 schema 媛???듦낵 ??prefix='IFC4'."""
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
        # ?덉쇅 ?놁씠 ?듦낵?댁빞 ?쒕떎. load_mesh??building geometry留?諛섑솚
        # (ground plane? view-aware濡?IFCRenderer?먯꽌 異붽?, ?듭뀡 OO).
        mesh, _ = load_mesh(Path("dummy.ifc"))
        assert len(mesh.vertices) == 3


# --- 嫄대Ъ 援ъ꽦?붿냼 ?붿씠?몃━?ㅽ듃 (mock 湲곕컲) ---


def _make_mock_entity(type_name: str) -> MagicMock:
    """is_a(t)媛 type_name怨?留ㅼ튂 ??True 諛섑솚?섎뒗 fake IFC entity."""
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
    """二쇱뼱吏?shape ?쒗?ㅻ? yield?섎뒗 媛吏?ifcopenshell iterator瑜?留뚮뱺??"""
    fake_iter = MagicMock()
    fake_iter.initialize.return_value = True
    # get()? 留??몄텧留덈떎 ?ㅼ쓬 shape, next()??留덉?留됱쓣 ?쒖쇅?섍퀬 True
    fake_iter.get.side_effect = shapes
    fake_iter.next.side_effect = [True] * (len(shapes) - 1) + [False]
    return fake_iter


def test_default_includes_only_building_elements() -> None:
    """湲곕낯 ?몄텧(`load_mesh(path)`)? IfcBuildingElement留??ы븿, IfcSite???쒖쇅."""
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

    # IfcSite(짹1000)媛 ?ы븿?먮떎硫?center媛 硫由??⑥뼱吏? wall留??ы븿?대㈃ ~ (0.33, 0.33, 0).
    assert abs(center[0]) < 5
    assert abs(center[1]) < 5


def test_extra_types_extends_inclusion() -> None:
    """extra_types??IfcFurnishingElement ?꾨떖 ??媛援щ룄 ?ы븿?쒕떎."""
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

    # ??entity 紐⑤몢 ?ы븿?섎㈃ mesh vertex 6媛? wall留??ы븿?대㈃ 3媛?
    assert len(mesh.vertices) == 6


def test_included_base_ifcproduct_includes_everything() -> None:
    """included_base='IfcProduct'??escape hatch ??IfcSite???ы븿?쒕떎 (?꾩껜 ??紐⑤뱶)."""
    fake_model = MagicMock()
    fake_model.schema = "IFC4"

    # IfcSite??IfcProduct ?쒕툕??? is_a("IfcProduct") ??True.
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

    assert len(mesh.vertices) == 3  # site媛 ?ы븿??


def test_no_building_element_raises() -> None:
    """IfcBuildingElement媛 0媛쒖씤 IFC ??IFCRenderError, 硫붿떆吏??included_base ?ы븿."""
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


# depth ?꾩쿂由??곷떒 background fill ?쒕룄 ?먭린 ??SD媛 mid-raw ?뚯깋 ?좊? *?섑룊??
# 援ъ“臾????꾨땲??*嫄대Ъ ?먯껜??吏遺??쇰줈 ?댁꽍???ъ쭊 ??1/3??吏遺뺤쿂???섏샂.
# depth ?꾩쿂由??⑥꽌媛 SD prior???≪닔?섏뼱 ?섎룄? ?ㅻⅨ 寃곌낵.



def test_renderer_uses_view_target_override_for_eye_only() -> None:
    """Opt-in target overrides should affect only the requested views."""
    renderer = IFCRenderer(
        target_screen_ratio=0.99,
        view_target_overrides={IFCView.EYE_NE: 0.25},
    )
    small_mesh = MagicMock()
    small_mesh.vertices = np.array([[0.0, 0.0, 0.0], [10.0, 5.0, 3.0]])

    assert renderer._resolve_target_ratio(IFCView.EYE_NE, small_mesh) == 0.25
    assert renderer._resolve_target_ratio(IFCView.EYE_NW, small_mesh) == (
        VIEW_TARGET_RATIOS[IFCView.EYE_NW]
    )
    assert renderer._resolve_target_ratio(IFCView.FRONT, small_mesh) == (
        VIEW_TARGET_RATIOS[IFCView.FRONT]
    )
