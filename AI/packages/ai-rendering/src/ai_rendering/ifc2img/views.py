"""IFC 렌더 뷰 정의."""

from dataclasses import dataclass
from enum import Enum


class IFCView(Enum):
    FRONT = "front"
    SIDE = "side"
    TOP = "top"
    CORNER_LOW = "corner_low"    # 낮은 시점 코너 (사람 시야 가까움)
    BIRDS_EYE = "birds_eye"      # 조감도 (top과 다른 약간 기울인 위)
    EYE_NE = "eye_ne"            # 북동 사람 시선 (z=0 완전 수평)
    EYE_NW = "eye_nw"            # 북서 사람 시선 (z=0 완전 수평)
    EYE_SE = "eye_se"            # 남동 사람 시선 (z=0 완전 수평)


class AutoZoomMode(Enum):
    """카메라 zoom 자동 조정 모드.

    OFF        — views.py의 정적 zoom 사용 (안전 baseline).
    ITERATIVE  — render → fill% 측정 → zoom 조정 반복으로 target_screen_ratio 수렴.

    bool 호환: True → ITERATIVE, False → OFF (외부 호출자 보존).
    """

    OFF = "off"
    ITERATIVE = "iterative"


@dataclass(frozen=True)
class CameraParams:
    """Open3D ViewControl 파라미터.

    front: center → eye 방향 벡터 (정규화 불필요, ViewControl이 처리)
    up:    카메라 상단 방향
    zoom:  ViewControl.set_zoom 정적 fallback 값.
           AutoZoomMode.ITERATIVE 일 땐 _iterative_zoom_loop 으로 대체.
    """

    front: tuple[float, float, float]
    up: tuple[float, float, float]
    zoom: float


VIEW_CAMERAS: dict[IFCView, CameraParams] = {
    # 기본 3뷰 — 정적 vector (모든 시점 공통).
    # FRONT/SIDE는 z=0 으로 완전 수평 (건축 입면도 표준 — 기울어짐 방지).
    IFCView.FRONT: CameraParams(front=(-1.0,  0.0,  0.0), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.SIDE:  CameraParams(front=( 0.0, -1.0,  0.0), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.TOP:   CameraParams(front=(-0.6, -0.6,  1.0), up=(0.0, 0.0, 1.0), zoom=0.5),
    # 명시 호출용 — default 제외 (환각 발생 시점).
    IFCView.CORNER_LOW: CameraParams(front=(-0.7, -0.7,  0.15), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.BIRDS_EYE:  CameraParams(front=(-0.4, -0.4,  1.5), up=(0.0, 0.0, 1.0), zoom=0.5),
    # 수평 등각 3뷰 — 사람 시선(z=0), 대각선 코너 + facade 4면 커버.
    IFCView.EYE_NE:     CameraParams(front=(-0.7, -0.7,  0.0), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.EYE_NW:     CameraParams(front=(-0.7,  0.7,  0.0), up=(0.0, 0.0, 1.0), zoom=0.5),
    IFCView.EYE_SE:     CameraParams(front=( 0.7, -0.7,  0.0), up=(0.0, 0.0, 1.0), zoom=0.5),
}


# View 별 target_screen_ratio override — 시점에 따라 잘림 위험이 다름.
# 대형 fixture(70m+)에서 잘림 발생해 보수적으로 축소된 값.
# fixture별 추가 dispatch는 `resolve_target_ratio_for_mesh` 참조.
VIEW_TARGET_RATIOS: dict[IFCView, float] = {
    IFCView.FRONT:      0.20,
    IFCView.SIDE:       0.20,
    IFCView.TOP:        0.15,   # 위에서 봄 → 더 작게 (잘림 방지)
    IFCView.CORNER_LOW: 0.12,   # 가장 잘리던 view → 가장 작게
    IFCView.BIRDS_EYE:  0.15,
    IFCView.EYE_NE:     0.15,
    IFCView.EYE_NW:     0.15,
    IFCView.EYE_SE:     0.15,
}


# fixture별 dispatch — mesh 크기에 따라 VIEW_TARGET_RATIOS를 자동 축소.
#
# fixture 크기 5~6배 차이(소형 ~13m / 중대형 ~17m / 대형 ~75m)에서 단일 ratio가
# 모두 만족 못 한다. 대형은 `_iterative_zoom_loop` 수렴 실패(fill 0.99+ outlier)가
# 발견돼 임계값/배율을 측정값에서 직접 도출 — `<20m` 모두 ✓ 수렴, `>50m` outlier.
DISPATCH_LARGE_THRESHOLD_M: float = 50.0
DISPATCH_MEDIUM_THRESHOLD_M: float = 20.0
DISPATCH_LARGE_FACTOR: float = 0.6
DISPATCH_MEDIUM_FACTOR: float = 0.8


def resolve_target_ratio_for_mesh(
    view: IFCView,
    max_extent: float,
    base_ratio: float | None = None,
) -> float:
    """mesh max_extent에 따라 view의 target_screen_ratio를 자동 축소.

    Args:
        view: 적용 시점.
        max_extent: mesh AABB 최장변 길이 (m).
        base_ratio: 기본값. None이면 VIEW_TARGET_RATIOS[view] 사용.

    Returns:
        dispatch 적용 후 ratio. extent가 임계값 미만이면 base 그대로.
    """
    base = base_ratio if base_ratio is not None else VIEW_TARGET_RATIOS[view]
    if max_extent > DISPATCH_LARGE_THRESHOLD_M:
        return base * DISPATCH_LARGE_FACTOR
    if max_extent > DISPATCH_MEDIUM_THRESHOLD_M:
        return base * DISPATCH_MEDIUM_FACTOR
    return base


# render_views(views=None) 기본값 — 환각 발생 시점들 의도적 제외.
#
# 제외 사유:
# - TOP: 지붕만 보여주는 도면 시점. facade prompt와 불일치 → 환각 빌딩
# - BIRDS_EYE: 거의 위에서 봄(z=1.5) → TOP과 동일 메커니즘으로 환각
# - CORNER_LOW: target_ratio=0.15로 가장 낮음 + z=0.15 어색한 시점 →
#               화면 87%가 background로 prompt 환각 우세
DEFAULT_RENDER_VIEWS: list[IFCView] = [
    IFCView.FRONT,
    IFCView.SIDE,
    IFCView.EYE_NE,
    IFCView.EYE_NW,
    IFCView.EYE_SE,
]


# View 별 prompt suffix — 옵션 B (per-view prompt suffix).
#
# default 시점(FRONT/SIDE/EYE_*)은 빈 suffix. 명시 호출 시점(TOP/BIRDS_EYE/
# CORNER_LOW)은 환경 단서 합성 — facade-위주 preset prompt에 부족한 *건물 주변
# 환경*(잔디·길) 단서 보강.
VIEW_PROMPT_SUFFIXES: dict[IFCView, str] = {
    IFCView.FRONT: "",
    IFCView.SIDE: "",
    IFCView.TOP: ", aerial top-down view, building roof from above, "
                 "surrounded by grass lawn",
    IFCView.BIRDS_EYE: ", aerial bird's-eye view from above, single "
                        "residential building, surrounded by grass lawn",
    IFCView.CORNER_LOW: ", low angle view, single residential building, "
                        "surrounded by grass lawn",
    IFCView.EYE_NE: "",
    IFCView.EYE_NW: "",
    IFCView.EYE_SE: "",
}


VIEW_PROMPT_PREFIXES: dict[IFCView, str] = {
    IFCView.FRONT: "open flat ground in front, facade touches ground, "
                   "no foreground wall, no foundation wall, no retaining wall",
    IFCView.SIDE: "side facade at ground line, no foundation wall",
    IFCView.EYE_NE: "eye-level diagonal view, building on flat ground, "
                    "foreground ground fills frame, horizon behind house, not aerial",
    IFCView.EYE_NW: "eye-level diagonal view, building on flat ground, "
                    "foreground ground fills frame, horizon behind house, not aerial",
    IFCView.EYE_SE: "eye-level diagonal view, building on flat ground, "
                    "foreground ground fills frame, horizon behind house, not aerial",
}


SCANDINAVIAN_FRONT_PROMPT_PREFIX = (
    "open paved foreground, house sits on ground, no wall below house, "
    "no concrete barrier"
)


def _remove_eye_sky_prior(prompt: str) -> str:
    return prompt.replace(", blue sky", "").replace("blue sky, ", "")


def _soften_scandinavian_front_wall_prior(prompt: str) -> str:
    if "minimal Scandinavian house" not in prompt:
        return prompt
    return prompt.replace("white concrete facade", "light painted house facade")


def build_view_prompt(base_prompt: str, view: IFCView) -> str:
    """기존 prompt 끝에 view-별 환경 suffix를 덧붙인다.

    Args:
        base_prompt: 프리셋의 원본 prompt (예: scandinavian facade 묘사)
        view: 합성할 시점

    Returns:
        suffix가 빈 문자열이면 base_prompt 그대로, 아니면 "base + suffix" 합성.
    """
    prefix = VIEW_PROMPT_PREFIXES.get(view, "")
    if prefix:
        if view in {IFCView.EYE_NE, IFCView.EYE_NW, IFCView.EYE_SE}:
            base_prompt = _remove_eye_sky_prior(base_prompt)
        if view is IFCView.FRONT:
            softened_prompt = _soften_scandinavian_front_wall_prior(base_prompt)
            if softened_prompt != base_prompt:
                prefix = f"{SCANDINAVIAN_FRONT_PROMPT_PREFIX}, {prefix}"
                base_prompt = softened_prompt
        base_prompt = f"{prefix}, {base_prompt}"
    suffix = VIEW_PROMPT_SUFFIXES.get(view, "")
    if not suffix:
        return base_prompt
    return f"{base_prompt}{suffix}"
