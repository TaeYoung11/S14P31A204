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
    assert set(results.keys()) == {IFCView.FRONT, IFCView.SIDE, IFCView.TOP}
    assert vis.capture_depth_float_buffer.call_count == 3  # 뷰마다 1번씩


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
