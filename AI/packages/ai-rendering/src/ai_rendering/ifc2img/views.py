"""IFC 렌더 뷰 정의."""

from dataclasses import dataclass
from enum import Enum

import numpy as np


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
    # 기본 3뷰 — 정적 vector (모든 시점 공통).
    # FRONT/SIDE는 z=0 으로 완전 수평 (건축 입면도 표준 — 기울어짐 방지).
    # PCA 정렬은 Step 18c(2026-04-29)에 완전 제거 — 카메라는 정적 좌표계만 사용.
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
# 위에서 봄(top/birds_eye)은 footprint 폭이 화면을 잡아 더 잘리므로 작게.
# 등각은 약간 작게. 측면은 표준값.
#
# 다양성 검증 1차(2026-04-29) — haus 외 fixture(Smiley/SampleHouse)에서 잘림 발생 →
# 전 시점 25% 축소: FRONT/SIDE 0.40→0.30, ISO_*/TOP/BIRDS_EYE 0.20→0.15,
# CORNER_LOW 0.15→0.12. 보수적 축소 — haus는 약간 작아질 뿐 잘림 미발생 기대.
# 다양성 검증 2차(2026-04-29) — Smiley/SampleHouse FRONT 여전히 잘림 → FRONT/SIDE
# 추가 축소 0.30→0.25. 다른 시점은 1차에서 적정이라 유지.
# 다양성 검증 3차(2026-04-29) — Smiley FRONT *만* 여전히 잘림(SampleHouse 해소) →
# FRONT/SIDE 0.25→0.20 (ISO와 동일 수준). 전역 단순 축소의 *한계점* — 70m 대형
# fixture 의존성 강함. 이번 시도 후에도 미해결이면 fixture별 dispatch(mesh
# max_extent 기반) 도입 검토.
VIEW_TARGET_RATIOS: dict[IFCView, float] = {
    IFCView.FRONT:      0.20,
    IFCView.SIDE:       0.20,
    IFCView.TOP:        0.15,   # 위에서 봄 → 더 작게 (잘림 방지)
    IFCView.CORNER_LOW: 0.12,   # 가장 잘리던 view → 가장 작게
    IFCView.BIRDS_EYE:  0.15,
    IFCView.EYE_NE:     0.15,   # 수평 등각 (Phase 3)
    IFCView.EYE_NW:     0.15,
    IFCView.EYE_SE:     0.15,
}


# fixture별 dispatch — mesh 크기에 따라 VIEW_TARGET_RATIOS를 자동 축소.
#
# 배경 (2026-04-29 다양성 검증 Step 2): fixture 크기 5~6배 차이(haus 13m /
# SampleHouse 17m / Smiley 75m)에서 단일 ratio가 모두 만족 못 함. Smiley
# side fill 0.991 outlier — `_iterative_zoom_loop` 수렴 실패. 임계값/배율은
# Step 2 측정값에서 직접 도출 — `<20m` 모두 ✓ 수렴, `>50m` outlier.
#
# 적용 규칙 — `resolve_target_ratio_for_mesh(view, max_extent, base)`:
#   max_extent > 50m  → base × 0.6  (대형, Smiley 같은 사무실 빌딩)
#   max_extent > 20m  → base × 0.8  (중대형)
#   그 외             → base 그대로 (보통, haus·SampleHouse 같은 단독 주택)
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
        extent ≥ DISPATCH_LARGE_THRESHOLD_M → base × DISPATCH_LARGE_FACTOR.
        DISPATCH_MEDIUM_THRESHOLD_M ≤ extent < LARGE → base × MEDIUM_FACTOR.
    """
    base = base_ratio if base_ratio is not None else VIEW_TARGET_RATIOS[view]
    if max_extent > DISPATCH_LARGE_THRESHOLD_M:
        return base * DISPATCH_LARGE_FACTOR
    if max_extent > DISPATCH_MEDIUM_THRESHOLD_M:
        return base * DISPATCH_MEDIUM_FACTOR
    return base


# render_views(views=None) 기본값 — 환각 발생 시점들 의도적 제외.
#
# 제외 사유 (사용자 시각 검수 기반, 2026-04-28):
# - TOP: 지붕만 보여주는 도면 시점. facade prompt와 불일치 → 환각 빌딩
# - BIRDS_EYE: 거의 위에서 봄(z=1.5) → TOP과 동일 메커니즘으로 환각
# - CORNER_LOW: target_ratio=0.15로 가장 낮음 + z=0.15 어색한 시점 →
#               화면 87%가 background로 prompt 환각 우세
#
# Phase 4 Step 4.5 (2026-05-03) — ISO_NE/ISO_NW/ISO_SE 완전 제거. EYE_*만으로
# 사람 시선 + 대각선 코너 시점 충분 커버라 사용자가 ISO 폐기 결정.
DEFAULT_RENDER_VIEWS: list[IFCView] = [
    IFCView.FRONT,
    IFCView.SIDE,
    IFCView.EYE_NE,
    IFCView.EYE_NW,
    IFCView.EYE_SE,
]


# View-aware ground plane 정책 — 옵션 OO (2026-04-29).
#
# `load_mesh`는 building geometry만 반환. `IFCRenderer`가 view별로 ground plane을
# 추가/제외해 시점에 맞는 시각 단서 전달.
#
# Phase 4 Step 4.5 (2026-05-03) — ISO 제거 후 모든 view에 ground 추가 (FRONT/SIDE/
# EYE_*/TOP/BIRDS_EYE/CORNER_LOW). frozenset은 빈 상태로 유지 — 향후 view별 ground
# 제외 정책이 다시 필요할 때 진입점 보존.
VIEWS_WITHOUT_GROUND: frozenset[IFCView] = frozenset()


# View-aware top background fill 정책 — Phase 5 옵션 GGG (2026-05-04).
#
# 검수 보고: eye 5뷰 배경이 *전체가 하늘/구름* — depth background(=0)를 SD가
# *제약 없는 영역*으로 해석 → sky 환각. 처방: 화면 *상단* 일부 background를
# 중간 회색(0.5 정규화)으로 채워 SD에 *수평선 방향 구조물* 단서 전달.
#
# 적용 view: 사람 시선/입면도 시점만 (위에서 본 시점은 화면 상단이 *지붕/평면*
# 이라 회색 채우면 부자연).
VIEWS_WITH_TOP_BG_FILL: frozenset[IFCView] = frozenset(
    {
        IFCView.FRONT,
        IFCView.SIDE,
        IFCView.EYE_NE,
        IFCView.EYE_NW,
        IFCView.EYE_SE,
    }
)


# View 별 prompt suffix — 옵션 B (per-view prompt suffix)의 공통 자산.
#
# 등각·기타 시점은 화면에 *건물 주변 환경*(잔디·길)도 들어옴. facade-위주 prompt
# (scandinavian/korean_villa/korean_house)에는 환경 단서가 없어 SD가 임의 환경을
# 그려 *옆 건물 환각·어색한 정원* 등 발생.
# → view-별 환경 묘사 단어를 prompt 끝에 덧붙여 SD에 시점 맥락 전달.
#
# 빈 문자열 = suffix 없음 (FRONT/SIDE는 facade만 보여 환경 단서 불필요).
VIEW_PROMPT_SUFFIXES: dict[IFCView, str] = {
    IFCView.FRONT: "",
    IFCView.SIDE: "",
    # default 제외된 시점 — 명시 호출 시 환경 더 강조
    IFCView.TOP: ", aerial top-down view, building roof from above, "
                 "surrounded by grass lawn",
    IFCView.BIRDS_EYE: ", aerial bird's-eye view from above, single "
                        "residential building, surrounded by grass lawn",
    IFCView.CORNER_LOW: ", low angle view, single residential building, "
                        "surrounded by grass lawn",
    # Phase 3 — 수평 등각 (사용자 요구: 빈 값으로 시작, 향후 고도화)
    IFCView.EYE_NE: "",
    IFCView.EYE_NW: "",
    IFCView.EYE_SE: "",
}


def build_view_prompt(base_prompt: str, view: IFCView) -> str:
    """기존 prompt 끝에 view-별 환경 suffix를 덧붙인다.

    Args:
        base_prompt: 프리셋의 원본 prompt (예: scandinavian facade 묘사)
        view: 합성할 시점

    Returns:
        suffix가 빈 문자열이면 base_prompt 그대로, 아니면 "base + suffix" 합성.
    """
    suffix = VIEW_PROMPT_SUFFIXES.get(view, "")
    if not suffix:
        return base_prompt
    return f"{base_prompt}{suffix}"


# View 별 negative prompt suffix — 옵션 C-1 (per-view negative).
#
# 폐기됨 (2026-04-28). 모든 시점 빈 문자열 — *기능 비활성*.
# 헬퍼·공개 API·통합 코드는 보존 (`build_view_negative_prompt`, `render(view=)`) —
# 향후 다른 시점/실험에서 재사용 가능. 본 dict만 비활성으로 두면 동작 = 기존 negative.
#
# 폐기 사유 (2회 시도 모두 *집 형상 더 일그러짐*):
# - v1 (8 토큰: additional building behind / second house / basement / underground
#   level / extra floor / lower level / duplicate building / attached annex)
#   → CLIP 77 토큰 한계 초과(`85 > 77` 경고), `building`/`floor`/`level` 일반
#   명사가 *집 자체*도 약화. iso_nw/iso_se 모두 baseline보다 일그러짐.
# - v2 (2 토큰: additional building / basement) → 토큰 한계는 해결되었으나
#   여전히 iso_nw/iso_se 일그러짐. 'building' 일반 명사 노출 자체가 문제로 추정.
#
# 결론: per-view negative는 SD 1.5 + ControlNet-depth 조합에서 hallucinate 억제
# 메커니즘으로 *역효과*. 다른 접근(C-2 per-view cn_scale, C-3 positive 단언)으로 전환.
VIEW_NEGATIVE_SUFFIXES: dict[IFCView, str] = {
    IFCView.FRONT: "",
    IFCView.SIDE: "",
    IFCView.TOP: "",
    IFCView.BIRDS_EYE: "",
    IFCView.CORNER_LOW: "",
    IFCView.EYE_NE: "",
    IFCView.EYE_NW: "",
    IFCView.EYE_SE: "",
}


# View 별 controlnet_conditioning_scale override — 옵션 C-2 (per-view depth 구속).
#
# 2026-04-28 옵션 C-2: iso_nw/iso_se 1.0 override (다른 view는 base 0.7) — 추가 매스
# 환각 해소.
# 2026-04-29 옵션 E (E-clean): preset base를 0.7 → 1.0으로 인상해 *모든 view에서*
# 수직 매스 환각(빌딩 아래로 추가 층) 차단. base 1.0과 동일한 iso_nw/se override는
# redundant라 제거 — 모든 view가 None(base 그대로 사용).
# 2026-04-29 옵션 N: preset base 1.0 → 1.15 추가 인상 (front/side 잔존 환각 처방).
# override는 None 유지 — 모든 view가 base 1.15 그대로 사용. presets.py와 동기화 상태.
#
# 호출자가 view별 추가 cn_scale 보정이 필요하면 override를 설정 가능 (메커니즘 보존).
VIEW_CN_SCALE_OVERRIDES: dict[IFCView, float | None] = {
    IFCView.FRONT: None,
    IFCView.SIDE: None,
    IFCView.TOP: None,
    IFCView.BIRDS_EYE: None,
    IFCView.CORNER_LOW: None,
    IFCView.EYE_NE: None,
    IFCView.EYE_NW: None,
    IFCView.EYE_SE: None,
}


def resolve_view_cn_scale(base_cn_scale: float, view: IFCView) -> float:
    """view-별 override가 있으면 그 값을, 없으면 base 그대로 반환.

    Args:
        base_cn_scale: 호출자가 전달한 cn_scale (보통 preset 값)
        view: 합성할 시점

    Returns:
        VIEW_CN_SCALE_OVERRIDES[view]가 None이면 base_cn_scale, 아니면 override 값.
    """
    override = VIEW_CN_SCALE_OVERRIDES.get(view)
    return override if override is not None else base_cn_scale


def build_view_negative_prompt(base_negative: str, view: IFCView) -> str:
    """기존 negative_prompt 끝에 view-별 차단 토큰 suffix를 덧붙인다.

    Args:
        base_negative: 프리셋의 원본 negative_prompt
        view: 합성할 시점

    Returns:
        suffix가 빈 문자열이면 base_negative 그대로, 아니면 "base + suffix" 합성.
        base_negative가 빈 문자열이고 suffix가 비어있지 않으면 suffix의 ", " 접두사 제거.
    """
    suffix = VIEW_NEGATIVE_SUFFIXES.get(view, "")
    if not suffix:
        return base_negative
    if not base_negative:
        # ", "만 정확히 제거 — lstrip(", ")은 콤마/공백을 *반복* 제거해 의도치 않은 문자
        # 손실 가능 (예: ",basement" → "basement"). removeprefix는 prefix 정확 제거만.
        return suffix.removeprefix(", ")
    return f"{base_negative}{suffix}"


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
