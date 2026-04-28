"""IFC 렌더 뷰 정의."""

from dataclasses import dataclass
from enum import Enum

import numpy as np


class IFCView(Enum):
    FRONT = "front"
    SIDE = "side"
    TOP = "top"
    ISO_NE = "iso_ne"            # 북동 위쪽 등각
    ISO_NW = "iso_nw"            # 북서 위쪽 등각
    ISO_SE = "iso_se"            # 남동 위쪽 등각
    CORNER_LOW = "corner_low"    # 낮은 시점 코너 (사람 시야 가까움)
    BIRDS_EYE = "birds_eye"      # 조감도 (top과 다른 약간 기울인 위)


class AutoZoomMode(Enum):
    """카메라 zoom 자동 조정 모드.

    OFF        — views.py의 정적 zoom 사용 (기본). 안전 baseline.
    ANALYTIC   — v1: AABB 기반 분석 수식 (현재 시점에 실험적, 회귀 발생).
                 보존만 — 향후 수식 보정 시 활용. default 비추천.
    ITERATIVE  — v2: render → fill% 측정 → zoom 조정 반복.
                 분석 수식 실패 학습 후 채택한 측정 기반 접근.
    """

    OFF = "off"
    ANALYTIC = "analytic"
    ITERATIVE = "iterative"


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
    # 기본 3뷰 — PCA fallback 시 사용되는 정적 vector.
    # FRONT/SIDE는 z=0 으로 완전 수평 (건축 입면도 표준 — 기울어짐 방지).
    IFCView.FRONT: CameraParams(front=(-1.0,  0.0,  0.0), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.SIDE:  CameraParams(front=( 0.0, -1.0,  0.0), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.TOP:   CameraParams(front=(-0.6, -0.6,  1.0), up=(0.0, 0.0, 1.0), zoom=0.5),
    # 등각 5뷰 (PCA 정렬과 결합 시 *건물 주축 기준* 모서리 시점).
    IFCView.ISO_NE:     CameraParams(front=(-0.7, -0.7,  0.5), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.ISO_NW:     CameraParams(front=(-0.7,  0.7,  0.5), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.ISO_SE:     CameraParams(front=( 0.7, -0.7,  0.5), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.CORNER_LOW: CameraParams(front=(-0.7, -0.7,  0.15), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.BIRDS_EYE:  CameraParams(front=(-0.4, -0.4,  1.5), up=(0.0, 0.0, 1.0), zoom=0.5),
}


# PCA 정렬 활성 시 각 view의 front 벡터를 (long_coef, mid_coef, z_coef)로 표현.
# 즉 front = long_coef × long_axis + mid_coef × mid_axis + z_coef × (0,0,1).
# - FRONT: 건물 정면 (mid_axis 따라 봄)
# - SIDE:  long_axis 따라 봄
# - 등각:  두 축 결합 + 위에서 약간
VIEW_PCA_COEFFICIENTS: dict[IFCView, tuple[float, float, float]] = {
    # FRONT/SIDE는 z=0 (완전 수평, 건축 입면도 — 기울어짐 방지).
    IFCView.FRONT:      ( 0.0, -1.0,  0.0),
    IFCView.SIDE:       (-1.0,  0.0,  0.0),
    IFCView.TOP:        (-0.6, -0.6,  1.0),
    IFCView.ISO_NE:     (-0.7, -0.7,  0.5),
    IFCView.ISO_NW:     (-0.7,  0.7,  0.5),
    IFCView.ISO_SE:     ( 0.7, -0.7,  0.5),
    IFCView.CORNER_LOW: (-0.7, -0.7,  0.15),
    IFCView.BIRDS_EYE:  (-0.4, -0.4,  1.5),
}


# eigenvalue 격차 임계값 — 두 주축의 분산비가 이 값보다 작으면 PCA fallback.
PCA_EIGENVALUE_RATIO_MIN = 1.2


# View 별 target_screen_ratio override — 시점에 따라 잘림 위험이 다름.
# 위에서 봄(top/birds_eye)은 footprint 폭이 화면을 잡아 더 잘리므로 작게.
# 등각은 약간 작게. 측면은 표준값.
VIEW_TARGET_RATIOS: dict[IFCView, float] = {
    IFCView.FRONT:      0.40,
    IFCView.SIDE:       0.40,
    IFCView.TOP:        0.20,   # 위에서 봄 → 더 작게 (잘림 방지)
    IFCView.ISO_NE:     0.20,   # 등각 — top과 동일 수준
    IFCView.ISO_NW:     0.20,
    IFCView.ISO_SE:     0.20,
    IFCView.CORNER_LOW: 0.15,   # 가장 잘리던 view → 가장 작게
    IFCView.BIRDS_EYE:  0.20,
}


# render_views(views=None) 기본값 — 환각 발생 시점들 의도적 제외.
#
# 제외 사유 (사용자 시각 검수 기반, 2026-04-28):
# - TOP: 지붕만 보여주는 도면 시점. facade prompt와 불일치 → 환각 빌딩
# - BIRDS_EYE: 거의 위에서 봄(z=1.5) → TOP과 동일 메커니즘으로 환각
# - CORNER_LOW: target_ratio=0.15로 가장 낮음 + z=0.15 어색한 시점 →
#               화면 87%가 background로 prompt 환각 우세
#
# ISO_*는 facade 일부 보여 집 자체는 잘 그려짐. 주변 배경 어색함은 *옵션 B*
# (per-view prompt suffix)에서 환경 묘사 보강으로 처리 예정.
#
# 모든 시점의 enum/VIEW_CAMERAS/VIEW_PCA_COEFFICIENTS/VIEW_TARGET_RATIOS는 *유지* —
# 호출자가 명시 전달 시 여전히 사용 가능 (디버그/실험용).
DEFAULT_RENDER_VIEWS: list[IFCView] = [
    IFCView.FRONT,
    IFCView.SIDE,
    IFCView.ISO_NE,
    IFCView.ISO_NW,
    IFCView.ISO_SE,
]


def compute_principal_axes(
    vertices: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, bool]:
    """xy 평면에서 PCA로 mesh의 주축(long/mid)을 검출. z축은 (0,0,1) 고정.

    Args:
        vertices: shape (N, 3) ndarray.

    Returns:
        (long_axis_xy, mid_axis_xy, valid):
            long_axis_xy, mid_axis_xy — shape (3,) 단위벡터, z 성분 0.
            valid — eigenvalue 격차가 충분(PCA_EIGENVALUE_RATIO_MIN 초과)이면 True.
                False면 정적 fallback 권장.
    """
    if len(vertices) < 3:
        # 데이터 부족 — fallback
        return (
            np.array([1.0, 0.0, 0.0]),
            np.array([0.0, 1.0, 0.0]),
            False,
        )
    xy = vertices[:, :2]
    centered = xy - xy.mean(axis=0)
    cov = np.cov(centered.T)  # shape (2, 2)
    eigvals, eigvecs = np.linalg.eigh(cov)
    # eigh는 eigenvalue 오름차순 → 큰 쪽이 long
    if eigvals[0] < 1e-12:
        valid = False
    else:
        valid = bool((eigvals[1] / eigvals[0]) >= PCA_EIGENVALUE_RATIO_MIN)
    long_xy = eigvecs[:, 1]
    mid_xy = eigvecs[:, 0]
    long_axis = np.array([float(long_xy[0]), float(long_xy[1]), 0.0])
    mid_axis = np.array([float(mid_xy[0]), float(mid_xy[1]), 0.0])
    return long_axis, mid_axis, valid


def compute_dynamic_front(
    view: IFCView,
    long_axis: np.ndarray,
    mid_axis: np.ndarray,
) -> tuple[float, float, float]:
    """PCA 주축에 정렬된 view 별 front 벡터 산출 (호출자가 valid=True 보장)."""
    coefs = VIEW_PCA_COEFFICIENTS[view]
    front = (
        coefs[0] * long_axis
        + coefs[1] * mid_axis
        + coefs[2] * np.array([0.0, 0.0, 1.0])
    )
    return float(front[0]), float(front[1]), float(front[2])


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
