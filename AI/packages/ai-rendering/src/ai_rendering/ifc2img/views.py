"""IFC 렌더 뷰 정의."""

from dataclasses import dataclass
from enum import Enum

import numpy as np


class IFCView(Enum):
    FRONT = "front"
    SIDE = "side"
    TOP = "top"


@dataclass(frozen=True)
class CameraParams:
    """Open3D ViewControl 파라미터.

    front: center → eye 방향 벡터 (정규화 불필요, ViewControl이 처리)
    up:    카메라 상단 방향
    zoom:  ViewControl.set_zoom 정적 fallback 값.
           IFCRenderer(auto_zoom=True) 일 땐 compute_auto_zoom()으로 대체.
    """

    front: tuple[float, float, float]
    up: tuple[float, float, float]
    zoom: float


VIEW_CAMERAS: dict[IFCView, CameraParams] = {
    IFCView.FRONT: CameraParams(front=(-1.0,  0.0,  0.2), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.SIDE:  CameraParams(front=( 0.0, -1.0,  0.2), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.TOP:   CameraParams(front=(-0.6, -0.6,  1.0), up=(0.0, 0.0, 1.0), zoom=0.5),
}


def compute_auto_zoom(
    aabb_min: np.ndarray,
    aabb_max: np.ndarray,
    camera_front: tuple[float, float, float],
    camera_up: tuple[float, float, float],
    target_screen_ratio: float = 0.7,
) -> float:
    """AABB와 카메라 시선을 기반으로 mesh가 화면을 ratio만큼 채우는 zoom 계산.

    원리:
        Open3D ViewControl.set_zoom 은 작을수록 mesh가 더 크게 보이는 inverse 관계.
        AABB의 8개 코너를 카메라 view plane에 투영한 후,
        front에 수직인 두 축(right, up)으로 projected extent를 측정.
        target_screen_ratio = projected_extent / (zoom * reference) 식의 역산.

    실용 단순화:
        Open3D의 zoom은 [0.0, 무한대] 연속값이지만, 실제 의미는 BoundingBox에 대한
        시야 fit factor에 가깝다. 정확한 1:1 대응은 Open3D 내부 구현 의존이라
        *경험적 식*을 쓴다 — diagonal × ratio 비례.

    Returns:
        Open3D ViewControl.set_zoom() 에 전달할 float. target_screen_ratio가 클수록
        mesh가 더 크게 보이도록 zoom은 작아진다 (inverse).
    """
    front = np.asarray(camera_front, dtype=np.float64)
    front = front / np.linalg.norm(front)
    up = np.asarray(camera_up, dtype=np.float64)
    up = up / np.linalg.norm(up)
    right = np.cross(front, up)
    right_norm = np.linalg.norm(right)
    if right_norm < 1e-9:
        # front와 up이 평행 — 다른 직교축 선택
        right = np.cross(front, np.array([1.0, 0.0, 0.0]))
        right_norm = np.linalg.norm(right)
        if right_norm < 1e-9:
            right = np.cross(front, np.array([0.0, 1.0, 0.0]))
            right_norm = np.linalg.norm(right)
    right = right / right_norm
    up_ortho = np.cross(right, front)

    # AABB 8 corners
    corners = np.array(
        [
            [aabb_min[0], aabb_min[1], aabb_min[2]],
            [aabb_min[0], aabb_min[1], aabb_max[2]],
            [aabb_min[0], aabb_max[1], aabb_min[2]],
            [aabb_min[0], aabb_max[1], aabb_max[2]],
            [aabb_max[0], aabb_min[1], aabb_min[2]],
            [aabb_max[0], aabb_min[1], aabb_max[2]],
            [aabb_max[0], aabb_max[1], aabb_min[2]],
            [aabb_max[0], aabb_max[1], aabb_max[2]],
        ]
    )
    center = (aabb_min + aabb_max) / 2.0
    rel = corners - center

    # view plane 상의 projected extent (right/up_ortho 두 축)
    proj_right = rel @ right
    proj_up = rel @ up_ortho
    extent_right = float(proj_right.max() - proj_right.min())
    extent_up = float(proj_up.max() - proj_up.min())
    projected_extent = max(extent_right, extent_up)

    if projected_extent < 1e-9:
        return 0.5  # 퇴화 케이스 — fallback

    # Open3D ViewControl: view_ratio = zoom * max_extent (소스 기반).
    # mesh 화면 점유율 ratio가 되려면: projected_extent / view_ratio = ratio
    # → zoom = projected_extent / (ratio * max_extent)
    max_extent = float(np.max(aabb_max - aabb_min))
    if max_extent < 1e-9:
        return 0.5
    zoom = projected_extent / (target_screen_ratio * max_extent)
    return float(np.clip(zoom, 0.05, 2.0))
