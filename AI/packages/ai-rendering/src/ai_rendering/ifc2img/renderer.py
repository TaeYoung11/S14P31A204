"""IFC → PIL Image 렌더러."""

from pathlib import Path

import numpy as np
import open3d as o3d
from PIL import Image

from .exceptions import IFCRenderError
from .geometry import load_mesh
from .views import VIEW_CAMERAS, CameraParams, IFCView


class IFCRenderer:
    """IFC 파일을 지정된 뷰로 렌더해 PIL Image를 반환한다.

    Open3D Visualizer(visible=False) + capture_screen_float_buffer 방식.
    Windows에서 OffscreenRenderer가 EGL을 요구해 동작하지 않으므로
    native Win32 OpenGL context를 쓰는 이 방식을 사용한다.
    """

    def __init__(self, width: int = 768, height: int = 448) -> None:
        self.width = width
        self.height = height

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

    def _render_mesh(
        self,
        mesh: o3d.geometry.TriangleMesh,
        center: np.ndarray,
        camera: CameraParams,
    ) -> Image.Image:
        vis = o3d.visualization.Visualizer()
        vis.create_window(visible=False, width=self.width, height=self.height)
        try:
            vis.add_geometry(mesh)

            opt = vis.get_render_option()
            opt.background_color = np.array([1.0, 1.0, 1.0])
            opt.light_on = True

            vc = vis.get_view_control()
            vc.set_front(list(camera.front))
            vc.set_up(list(camera.up))
            vc.set_lookat(center.tolist())
            vc.set_zoom(camera.zoom)

            vis.poll_events()
            vis.update_renderer()

            depth = np.asarray(
                vis.capture_depth_float_buffer(do_render=True),
                dtype=np.float32,
            )
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
