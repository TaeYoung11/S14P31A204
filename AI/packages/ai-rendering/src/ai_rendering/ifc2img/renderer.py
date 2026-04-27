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

            img_o3d = vis.capture_screen_float_buffer(do_render=True)
            arr = (np.asarray(img_o3d) * 255).astype(np.uint8)
            return Image.fromarray(arr).convert("RGB")
        finally:
            vis.destroy_window()
