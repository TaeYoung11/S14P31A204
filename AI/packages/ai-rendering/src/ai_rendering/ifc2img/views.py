"""IFC 렌더 뷰 정의."""

from dataclasses import dataclass
from enum import Enum


class IFCView(Enum):
    FRONT = "front"
    SIDE = "side"
    TOP = "top"


@dataclass(frozen=True)
class CameraParams:
    """Open3D ViewControl 파라미터.

    front: center → eye 방향 벡터 (정규화 불필요, ViewControl이 처리)
    up:    카메라 상단 방향
    zoom:  ViewControl.set_zoom 값
    """

    front: tuple[float, float, float]
    up: tuple[float, float, float]
    zoom: float


VIEW_CAMERAS: dict[IFCView, CameraParams] = {
    IFCView.FRONT: CameraParams(front=(-1.0,  0.0,  0.2), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.SIDE:  CameraParams(front=( 0.0, -1.0,  0.2), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.TOP:   CameraParams(front=(-0.6, -0.6,  1.0), up=(0.0, 0.0, 1.0), zoom=0.5),
}
