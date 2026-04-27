"""IFC → grayscale depth map (PIL Image, mode="L") 렌더러."""

from pathlib import Path

import numpy as np
import open3d as o3d  # type: ignore[import-untyped]
from PIL import Image

from .exceptions import IFCRenderError
from .geometry import load_mesh
from .views import VIEW_CAMERAS, CameraParams, IFCView, compute_auto_zoom


class IFCRenderer:
    """IFC 파일을 지정된 뷰로 렌더해 depth map PIL Image(mode="L")를 반환한다.

    Open3D Visualizer(visible=False) + capture_depth_float_buffer 방식.
    Windows에서 OffscreenRenderer가 EGL을 요구해 동작하지 않으므로
    native Win32 OpenGL context를 쓰는 이 방식을 사용한다.

    출력 규약: 배경=0(검정), 가까운 면=255(밝음), 먼 면=0 근처. ControlNet-depth 입력 호환.

    auto_zoom=False (기본): views.py의 정적 zoom 값 사용. 안전한 baseline.
    auto_zoom=True (실험적): mesh AABB extent 기반 zoom 자동 계산.
        ⚠️ 현재 수식은 Open3D의 auto-fit + zoom 결합 동작과 정확히 일치하지 않아
        *모든 케이스에서 mesh를 더 작게* 만드는 회귀 발생. 향후 보정 후 default 전환 예정.
        실험·튜닝 용도로만 사용.
    """

    def __init__(
        self,
        width: int = 768,
        height: int = 448,
        auto_zoom: bool = False,
        target_screen_ratio: float = 0.7,
    ) -> None:
        self.width = width
        self.height = height
        self.auto_zoom = auto_zoom
        self.target_screen_ratio = target_screen_ratio

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

    def _resolve_zoom(
        self,
        mesh: o3d.geometry.TriangleMesh,
        camera: CameraParams,
    ) -> float:
        if not self.auto_zoom:
            return camera.zoom
        verts = np.asarray(mesh.vertices)
        if len(verts) == 0:
            return camera.zoom
        return compute_auto_zoom(
            aabb_min=verts.min(axis=0),
            aabb_max=verts.max(axis=0),
            camera_front=camera.front,
            camera_up=camera.up,
            target_screen_ratio=self.target_screen_ratio,
        )

    def _render_mesh(
        self,
        mesh: o3d.geometry.TriangleMesh,
        center: np.ndarray,
        camera: CameraParams,
    ) -> Image.Image:
        zoom = self._resolve_zoom(mesh, camera)

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
            vc.set_zoom(zoom)

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
