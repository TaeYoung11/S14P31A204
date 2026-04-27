"""IFC → grayscale depth map (PIL Image, mode="L") 렌더러."""

import math
from pathlib import Path

import numpy as np
import open3d as o3d  # type: ignore[import-untyped]
from PIL import Image

from .exceptions import IFCRenderError
from .geometry import load_mesh
from .views import (
    VIEW_CAMERAS,
    AutoZoomMode,
    CameraParams,
    IFCView,
    compute_auto_zoom,
)


class IFCRenderer:
    """IFC 파일을 지정된 뷰로 렌더해 depth map PIL Image(mode="L")를 반환한다.

    Open3D Visualizer(visible=False) + capture_depth_float_buffer 방식.
    Windows에서 OffscreenRenderer가 EGL을 요구해 동작하지 않으므로
    native Win32 OpenGL context를 쓰는 이 방식을 사용한다.

    출력 규약: 배경=0(검정), 가까운 면=255(밝음), 먼 면=0 근처. ControlNet-depth 입력 호환.

    auto_zoom 모드 (AutoZoomMode 또는 bool):
      OFF/False (기본) — views.py의 정적 zoom 사용. 안전 baseline.
      ITERATIVE/True   — render → fill% 측정 → zoom 조정 반복으로 target_screen_ratio 수렴.
      ANALYTIC         — v1 분석 수식 (실험적, 회귀 있음). 비추천.

    iter 파라미터:
      target_screen_ratio (default 0.55) — geom 픽셀이 차지하는 화면 비율 목표
      iter_tolerance       (default 0.10) — fill - target 절대값이 이 이하면 종료
      iter_max             (default 4)    — 최대 iteration 횟수
    """

    def __init__(
        self,
        width: int = 768,
        height: int = 448,
        auto_zoom: AutoZoomMode | bool = AutoZoomMode.OFF,
        target_screen_ratio: float = 0.55,
        iter_tolerance: float = 0.10,
        iter_max: int = 4,
    ) -> None:
        self.width = width
        self.height = height
        # bool ↔ enum 양방향 호환 (기존 외부 코드 호환).
        if isinstance(auto_zoom, bool):
            self.auto_zoom = AutoZoomMode.ITERATIVE if auto_zoom else AutoZoomMode.OFF
        else:
            self.auto_zoom = auto_zoom
        self.target_screen_ratio = target_screen_ratio
        self.iter_tolerance = iter_tolerance
        self.iter_max = iter_max

    def render(self, ifc_path: Path, view: IFCView = IFCView.FRONT) -> Image.Image:
        mesh, center = load_mesh(ifc_path)
        return self._render_mesh(mesh, center, VIEW_CAMERAS[view])

    def render_views(
        self,
        ifc_path: Path,
        views: list[IFCView] | None = None,
    ) -> dict[IFCView, Image.Image]:
        """여러 뷰를 한 번의 파싱으로 렌더한다."""
        if views is None:
            views = list(IFCView)
        mesh, center = load_mesh(ifc_path)
        return {
            view: self._render_mesh(mesh, center, VIEW_CAMERAS[view])
            for view in views
        }

    def _initial_zoom(
        self,
        mesh: o3d.geometry.TriangleMesh,
        camera: CameraParams,
    ) -> float:
        """초기 zoom 결정 — ANALYTIC 모드이면 분석 수식, 그 외는 정적 값."""
        if self.auto_zoom == AutoZoomMode.ANALYTIC:
            verts = np.asarray(mesh.vertices)
            if len(verts) > 0:
                return compute_auto_zoom(
                    aabb_min=verts.min(axis=0),
                    aabb_max=verts.max(axis=0),
                    camera_front=camera.front,
                    camera_up=camera.up,
                    target_screen_ratio=self.target_screen_ratio,
                )
        return camera.zoom

    @staticmethod
    def _capture_depth(
        vis: o3d.visualization.Visualizer,
        zoom: float,
        camera: CameraParams,
        center: np.ndarray,
    ) -> np.ndarray:
        """zoom 변경 후 depth buffer 1회 캡처. viz는 호출자가 관리."""
        vc = vis.get_view_control()
        vc.set_front(list(camera.front))
        vc.set_up(list(camera.up))
        vc.set_lookat(center.tolist())
        vc.set_zoom(zoom)
        vis.poll_events()
        vis.update_renderer()
        return np.asarray(
            vis.capture_depth_float_buffer(do_render=True),
            dtype=np.float32,
        )

    def _iterative_zoom_loop(
        self,
        vis: o3d.visualization.Visualizer,
        camera: CameraParams,
        center: np.ndarray,
        initial_zoom: float,
    ) -> np.ndarray:
        """zoom 반복 조정 — fill% 가 target_screen_ratio ± tolerance 안에 들 때까지."""
        zoom = initial_zoom
        depth = self._capture_depth(vis, zoom, camera, center)
        for _ in range(self.iter_max - 1):
            fill = float((depth > 0).mean())
            if abs(fill - self.target_screen_ratio) <= self.iter_tolerance:
                return depth
            if fill < 1e-6:
                # 화면에 mesh가 거의 없음 — zoom 큰 폭 감소.
                zoom = max(zoom * 0.3, 0.05)
            else:
                zoom = float(
                    np.clip(
                        zoom * math.sqrt(fill / self.target_screen_ratio),
                        0.05,
                        2.0,
                    )
                )
            depth = self._capture_depth(vis, zoom, camera, center)
        return depth

    def _render_mesh(
        self,
        mesh: o3d.geometry.TriangleMesh,
        center: np.ndarray,
        camera: CameraParams,
    ) -> Image.Image:
        initial_zoom = self._initial_zoom(mesh, camera)

        vis = o3d.visualization.Visualizer()
        vis.create_window(visible=False, width=self.width, height=self.height)
        try:
            vis.add_geometry(mesh)
            opt = vis.get_render_option()
            opt.background_color = np.array([1.0, 1.0, 1.0])
            opt.light_on = True

            if self.auto_zoom == AutoZoomMode.ITERATIVE:
                depth = self._iterative_zoom_loop(vis, camera, center, initial_zoom)
            else:
                depth = self._capture_depth(vis, initial_zoom, camera, center)
        finally:
            vis.destroy_window()

        return self._depth_to_image(depth)

    @staticmethod
    def _depth_to_image(depth: np.ndarray) -> Image.Image:
        """Open3D depth buffer를 grayscale PIL Image로 변환.

        Open3D 규약: background = 0, geometry = 양수 거리.
        ControlNet-depth 규약에 맞춰 가까운 면을 밝게(255), 먼 면·배경을 어둡게(0).
        """
        geometry_mask = depth > 0
        if not geometry_mask.any():
            raise IFCRenderError("depth buffer에 geometry가 없습니다.")

        depth_vals = depth[geometry_mask]
        d_min = float(depth_vals.min())
        d_max = float(depth_vals.max())

        norm = np.zeros_like(depth, dtype=np.float32)
        if d_max > d_min:
            norm[geometry_mask] = 1.0 - (depth[geometry_mask] - d_min) / (d_max - d_min)
        else:
            norm[geometry_mask] = 1.0

        gray = (norm * 255.0).astype(np.uint8)
        return Image.fromarray(gray, mode="L")
