"""IFC → grayscale depth map (PIL Image, mode="L") 렌더러."""

import math
import os
from pathlib import Path
from typing import Literal

import numpy as np
import open3d as o3d  # type: ignore[import-untyped]
from PIL import Image

from .exceptions import IFCRenderError
from .geometry import GROUND_EXTENT_FACTOR, attach_ground_plane_to_mesh, load_mesh
from .views import (
    DEFAULT_RENDER_VIEWS,
    VIEW_CAMERAS,
    VIEW_TARGET_RATIOS,
    AutoZoomMode,
    CameraParams,
    IFCView,
    resolve_target_ratio_for_mesh,
)

RenderBackend = Literal["auto", "visualizer", "raycast"]
RENDER_BACKEND_ENV = "IFC2IMG_RENDER_BACKEND"
DEFAULT_RENDER_BACKEND: RenderBackend = "auto"


class IFCRenderer:
    """IFC 파일을 지정된 뷰로 렌더해 depth map PIL Image(mode="L")를 반환한다.

    Open3D Visualizer(visible=False) + capture_depth_float_buffer 방식.
    Windows에서 OffscreenRenderer가 EGL을 요구해 동작하지 않으므로
    native Win32 OpenGL context를 쓰는 이 방식을 사용한다.

    출력 규약: 배경=0(검정), 가까운 면=255(밝음), 먼 면=0 근처. ControlNet-depth 입력 호환.

    auto_zoom 모드 (AutoZoomMode 또는 bool):
      OFF/False (기본) — views.py의 정적 zoom 사용. 안전 baseline.
      ITERATIVE/True   — render → fill% 측정 → zoom 조정 반복으로 target_screen_ratio 수렴.

    iter 파라미터:
      target_screen_ratio (default 0.55) — geom 픽셀이 차지하는 화면 비율 목표
      iter_tolerance       (default 0.10) — fill - target 절대값이 이 이하면 종료
      iter_max             (default 4)    — 최대 iteration 횟수
    """

    @staticmethod
    def _is_headless() -> bool:
        """headless 환경인지 감지."""
        return os.environ.get("DISPLAY") is None

    @staticmethod
    def _is_container_like_runtime() -> bool:
        """Docker/CI runtime where DISPLAY does not guarantee Visualizer support."""
        if os.environ.get("CI"):
            return True
        if os.environ.get("KUBERNETES_SERVICE_HOST"):
            return True
        if Path("/.dockerenv").exists():
            return True
        return False

    @staticmethod
    def _resolve_render_backend() -> RenderBackend:
        raw_backend = os.environ.get(RENDER_BACKEND_ENV, DEFAULT_RENDER_BACKEND)
        backend = raw_backend.strip().lower()
        if backend in ("auto", "visualizer", "raycast"):
            return backend  # type: ignore[return-value]
        raise IFCRenderError(
            f"{RENDER_BACKEND_ENV} must be one of auto, visualizer, raycast: {raw_backend!r}"
        )

    def __init__(
        self,
        width: int = 768,
        height: int = 448,
        auto_zoom: AutoZoomMode | bool = AutoZoomMode.OFF,
        target_screen_ratio: float = 0.55,
        iter_tolerance: float = 0.10,
        iter_max: int = 4,
        view_target_overrides: dict[IFCView, float] | None = None,
        view_ground_extent_overrides: dict[IFCView, float] | None = None,
        look_at_height_ratio: float = 0.5,
    ) -> None:
        self.width = width
        self.height = height
        if isinstance(auto_zoom, bool):
            self.auto_zoom = AutoZoomMode.ITERATIVE if auto_zoom else AutoZoomMode.OFF
        else:
            self.auto_zoom = auto_zoom
        self.target_screen_ratio = target_screen_ratio
        self.iter_tolerance = iter_tolerance
        self.iter_max = iter_max
        self.view_target_overrides = dict(view_target_overrides or {})
        self.view_ground_extent_overrides = dict(view_ground_extent_overrides or {})
        if not 0.0 <= look_at_height_ratio <= 1.0:
            raise ValueError("look_at_height_ratio must be between 0 and 1.")
        self.look_at_height_ratio = look_at_height_ratio

    def render(self, ifc_path: Path, view: IFCView = IFCView.FRONT) -> Image.Image:
        base_mesh, center = load_mesh(ifc_path)
        view_mesh = self._build_grounded_mesh(base_mesh, view)
        return self._render_mesh(view_mesh, base_mesh, center, VIEW_CAMERAS[view], view)

    def render_views(
        self,
        ifc_path: Path,
        views: list[IFCView] | None = None,
    ) -> dict[IFCView, Image.Image]:
        """여러 뷰를 한 번의 파싱으로 렌더한다.

        views=None 시 DEFAULT_RENDER_VIEWS 사용. 모든 view에 ground plane 추가
        (옵션 P 처방 — 정면 입면도 빈 배경 환각 차단).
        """
        if views is None:
            views = list(DEFAULT_RENDER_VIEWS)
        base_mesh, center = load_mesh(ifc_path)
        mesh_cache: dict[float, o3d.geometry.TriangleMesh] = {}
        results: dict[IFCView, Image.Image] = {}
        for view in views:
            extent_factor = self._resolve_ground_extent_factor(view)
            view_mesh = mesh_cache.get(extent_factor)
            if view_mesh is None:
                view_mesh = self._build_grounded_mesh(base_mesh, view)
                mesh_cache[extent_factor] = view_mesh
            results[view] = self._render_mesh(
                view_mesh,
                base_mesh,
                center,
                VIEW_CAMERAS[view],
                view,
            )
        return results

    def _resolve_ground_extent_factor(self, view: IFCView) -> float:
        return self.view_ground_extent_overrides.get(view, GROUND_EXTENT_FACTOR)

    def _build_grounded_mesh(
        self,
        base_mesh: o3d.geometry.TriangleMesh,
        view: IFCView,
    ) -> o3d.geometry.TriangleMesh:
        extent_factor = self._resolve_ground_extent_factor(view)
        if extent_factor == GROUND_EXTENT_FACTOR:
            return attach_ground_plane_to_mesh(base_mesh)
        return attach_ground_plane_to_mesh(
            base_mesh,
            extent_factor=extent_factor,
        )

    def _resolve_target_ratio(
        self,
        view: IFCView,
        mesh: o3d.geometry.TriangleMesh,
    ) -> float:
        """view + mesh 크기에 따라 target_screen_ratio 결정.

        1) base = VIEW_TARGET_RATIOS[view] (없으면 self.target_screen_ratio).
        2) mesh AABB max_extent에 따라 dispatch — `resolve_target_ratio_for_mesh`:
           - extent > 50m → base × 0.6 (대형 fixture)
           - extent > 20m → base × 0.8 (중대형)
           - 그 외        → base 그대로 (보통)

        빈 mesh면 base 그대로 (방어적 fallback — 정상 조건 아님).
        """
        base = self.view_target_overrides.get(
            view,
            VIEW_TARGET_RATIOS.get(view, self.target_screen_ratio),
        )
        verts = np.asarray(mesh.vertices)
        if len(verts) == 0:
            return base
        max_extent = float(np.max(verts.max(axis=0) - verts.min(axis=0)))
        return resolve_target_ratio_for_mesh(view, max_extent, base_ratio=base)

    def _resolve_lookat(
        self,
        base_mesh: o3d.geometry.TriangleMesh,
        center: np.ndarray,
    ) -> np.ndarray:
        """Resolve camera lookAt from base building bounds, excluding added ground."""
        vertices = np.asarray(base_mesh.vertices, dtype=np.float64)
        if vertices.size == 0:
            return center.astype(np.float64, copy=True)
        min_z = float(vertices[:, 2].min())
        max_z = float(vertices[:, 2].max())
        lookat = center.astype(np.float64, copy=True)
        lookat[2] = min_z + (max_z - min_z) * self.look_at_height_ratio
        return lookat

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
        target_ratio: float,
    ) -> np.ndarray:
        """zoom 반복 조정 — fill% 가 target_ratio ± tolerance 안에 들 때까지.

        target_ratio는 view-별로 다를 수 있어 호출자가 명시 전달한다.
        """
        zoom = initial_zoom
        depth = self._capture_depth(vis, zoom, camera, center)
        for _ in range(self.iter_max - 1):
            fill = float((depth > 0).mean())
            if abs(fill - target_ratio) <= self.iter_tolerance:
                return depth
            if fill < 1e-6:
                # 화면에 mesh가 거의 없음 — zoom 큰 폭 감소.
                zoom = max(zoom * 0.3, 0.05)
            else:
                zoom = float(
                    np.clip(
                        zoom * math.sqrt(fill / target_ratio),
                        0.05,
                        2.0,
                    )
                )
            depth = self._capture_depth(vis, zoom, camera, center)
        return depth

    def _render_mesh(
        self,
        mesh: o3d.geometry.TriangleMesh,
        base_mesh: o3d.geometry.TriangleMesh,
        center: np.ndarray,
        camera: CameraParams,
        view: IFCView,
    ) -> Image.Image:
        # dispatch 임계값(20m/50m)은 *건물 본체* 크기 기준이라
        # ground 포함 view_mesh가 아니라 base_mesh로 판단해야 한다.
        # ex: SampleHouse 17m → ground 포함 ~20m → MEDIUM 잘못 트리거 위험.
        initial_zoom = camera.zoom
        target_ratio = self._resolve_target_ratio(view, base_mesh)
        lookat = self._resolve_lookat(base_mesh, center)
        backend = self._resolve_render_backend()

        if backend == "raycast":
            return self._render_mesh_offscreen(
                mesh, lookat, camera, initial_zoom, target_ratio
            )
        if backend == "auto" and (
            self._is_headless() or self._is_container_like_runtime()
        ):
            return self._render_mesh_offscreen(
                mesh, lookat, camera, initial_zoom, target_ratio
            )

        try:
            return self._render_mesh_windowed(
                mesh, lookat, camera, initial_zoom, target_ratio
            )
        except IFCRenderError:
            if backend == "visualizer":
                raise
            return self._render_mesh_offscreen(
                mesh, lookat, camera, initial_zoom, target_ratio
            )

    def _render_mesh_windowed(
        self,
        mesh: o3d.geometry.TriangleMesh,
        center: np.ndarray,
        camera: CameraParams,
        initial_zoom: float,
        target_ratio: float,
    ) -> Image.Image:
        vis = o3d.visualization.Visualizer()
        created = vis.create_window(visible=False, width=self.width, height=self.height)
        if created is False:
            raise IFCRenderError("Open3D Visualizer window creation failed.")
        try:
            vis.add_geometry(mesh)
            opt = vis.get_render_option()
            if opt is None:
                raise IFCRenderError(
                    "Visualizer render option is None. Headless 환경에서 실행 중인가?"
                )
            opt.background_color = np.array([1.0, 1.0, 1.0])
            opt.light_on = True

            if self.auto_zoom == AutoZoomMode.ITERATIVE:
                depth = self._iterative_zoom_loop(
                    vis, camera, center, initial_zoom, target_ratio
                )
            else:
                depth = self._capture_depth(vis, initial_zoom, camera, center)
        finally:
            vis.destroy_window()

        return self._depth_to_image(depth)

    def _render_mesh_offscreen(
        self,
        mesh: o3d.geometry.TriangleMesh,
        center: np.ndarray,
        camera: CameraParams,
        initial_zoom: float,
        target_ratio: float,
    ) -> Image.Image:
        # OffscreenRenderer 사용 — headless 환경용
        # Raycasting으로 depth 계산
        scene = o3d.t.geometry.RaycastingScene()
        mesh_t = o3d.t.geometry.TriangleMesh.from_legacy(mesh)
        scene.add_triangles(mesh_t)

        front = np.asarray(camera.front, dtype=np.float32)
        up = np.asarray(camera.up, dtype=np.float32)
        verts = np.asarray(mesh.vertices)
        max_extent = float(np.max(verts.max(axis=0) - verts.min(axis=0)))
        front /= np.linalg.norm(front)
        eye = center - front * max(max_extent * 1.25, 1.0)
        rays = o3d.t.geometry.RaycastingScene.create_rays_pinhole(
            60.0,
            o3d.core.Tensor(center.astype(np.float32), dtype=o3d.core.Dtype.Float32),
            o3d.core.Tensor(eye.astype(np.float32), dtype=o3d.core.Dtype.Float32),
            o3d.core.Tensor(up, dtype=o3d.core.Dtype.Float32),
            self.width,
            self.height,
        )
        ans = scene.cast_rays(rays)

        depth = ans['t_hit'].numpy().reshape((self.height, self.width))
        depth = depth.astype(np.float32, copy=False)
        depth[~np.isfinite(depth)] = 0.0
        return self._depth_to_image(depth)

    @staticmethod
    def _compute_extrinsic(eye: np.ndarray, lookat: np.ndarray, up: np.ndarray) -> np.ndarray:
        """Compute camera extrinsic matrix from eye, lookat, up."""
        z_axis = (eye - lookat) / np.linalg.norm(eye - lookat)  # forward
        x_axis = np.cross(up, z_axis)
        x_axis /= np.linalg.norm(x_axis)
        y_axis = np.cross(z_axis, x_axis)
        rotation = np.array([x_axis, y_axis, z_axis]).T
        translation = -rotation @ eye
        extrinsic = np.eye(4)
        extrinsic[:3, :3] = rotation
        extrinsic[:3, 3] = translation
        return extrinsic

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
