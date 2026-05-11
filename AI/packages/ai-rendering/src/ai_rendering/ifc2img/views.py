"""IFC render view definitions and view-aware prompt helpers."""

from dataclasses import dataclass
from enum import Enum


class IFCView(Enum):
    FRONT = "front"
    SIDE = "side"
    FRONT_DIAGONAL_RIGHT = "front_diagonal_right"
    FRONT_DIAGONAL_LEFT = "front_diagonal_left"


class AutoZoomMode(Enum):
    """Renderer zoom strategy."""

    OFF = "off"
    ITERATIVE = "iterative"


@dataclass(frozen=True)
class CameraParams:
    """Open3D view-control camera parameters."""

    front: tuple[float, float, float]
    up: tuple[float, float, float]
    zoom: float


VIEW_CAMERAS: dict[IFCView, CameraParams] = {
    IFCView.FRONT: CameraParams(
        front=(-1.0, 0.0, 0.0),
        up=(0.0, 0.0, 1.0),
        zoom=0.5,
    ),
    IFCView.SIDE: CameraParams(
        front=(0.0, -1.0, 0.0),
        up=(0.0, 0.0, 1.0),
        zoom=0.5,
    ),
    IFCView.FRONT_DIAGONAL_RIGHT: CameraParams(
        front=(-0.7, -0.7, 0.0),
        up=(0.0, 0.0, 1.0),
        zoom=0.5,
    ),
    IFCView.FRONT_DIAGONAL_LEFT: CameraParams(
        front=(-0.7, 0.7, 0.0),
        up=(0.0, 0.0, 1.0),
        zoom=0.5,
    ),
}


VIEW_TARGET_RATIOS: dict[IFCView, float] = {
    IFCView.FRONT: 0.20,
    IFCView.SIDE: 0.20,
    IFCView.FRONT_DIAGONAL_RIGHT: 0.15,
    IFCView.FRONT_DIAGONAL_LEFT: 0.15,
}


DISPATCH_LARGE_THRESHOLD_M: float = 50.0
DISPATCH_MEDIUM_THRESHOLD_M: float = 20.0
DISPATCH_LARGE_FACTOR: float = 0.6
DISPATCH_MEDIUM_FACTOR: float = 0.8


def resolve_target_ratio_for_mesh(
    view: IFCView,
    max_extent: float,
    base_ratio: float | None = None,
) -> float:
    """Resolve target screen ratio for a view and mesh extent."""
    base = base_ratio if base_ratio is not None else VIEW_TARGET_RATIOS[view]
    if max_extent > DISPATCH_LARGE_THRESHOLD_M:
        return base * DISPATCH_LARGE_FACTOR
    if max_extent > DISPATCH_MEDIUM_THRESHOLD_M:
        return base * DISPATCH_MEDIUM_FACTOR
    return base


DEFAULT_RENDER_VIEWS: list[IFCView] = [
    IFCView.FRONT,
    IFCView.SIDE,
    IFCView.FRONT_DIAGONAL_RIGHT,
    IFCView.FRONT_DIAGONAL_LEFT,
]


VIEW_PROMPT_SUFFIXES: dict[IFCView, str] = {
    IFCView.FRONT: "",
    IFCView.SIDE: "",
    IFCView.FRONT_DIAGONAL_RIGHT: "",
    IFCView.FRONT_DIAGONAL_LEFT: "",
}


VIEW_PROMPT_PREFIXES: dict[IFCView, str] = {
    IFCView.FRONT: (
        "open flat ground in front, facade touches ground, "
        "no foreground wall, no foundation wall, no retaining wall"
    ),
    IFCView.SIDE: "side facade at ground line, no foundation wall",
    IFCView.FRONT_DIAGONAL_RIGHT: (
        "front diagonal view, dry ground around house, "
        "building on flat ground, no pool, not aerial"
    ),
    IFCView.FRONT_DIAGONAL_LEFT: (
        "front diagonal view, dry ground around house, "
        "building on flat ground, no pool, not aerial"
    ),
}


SCANDINAVIAN_FRONT_PROMPT_PREFIX = (
    "open paved ground, house on ground, no front wall"
)
SCANDINAVIAN_SIDE_PROMPT_PREFIX = (
    "open ground beside house, house on ground, no side wall"
)


def _remove_front_diagonal_sky_prior(prompt: str) -> str:
    return prompt.replace(", blue sky", "").replace("blue sky, ", "")


def _soften_scandinavian_front_wall_prior(prompt: str) -> str:
    if "minimal Scandinavian house" not in prompt:
        return prompt
    return prompt.replace("white concrete facade", "light painted house facade")


def build_view_prompt(base_prompt: str, view: IFCView) -> str:
    """Compose a view-aware prompt."""
    prefix = VIEW_PROMPT_PREFIXES.get(view, "")
    if prefix:
        if view in {IFCView.FRONT_DIAGONAL_RIGHT, IFCView.FRONT_DIAGONAL_LEFT}:
            base_prompt = _remove_front_diagonal_sky_prior(base_prompt)
        if view in {IFCView.FRONT, IFCView.SIDE}:
            softened_prompt = _soften_scandinavian_front_wall_prior(base_prompt)
            if softened_prompt != base_prompt:
                prefix = (
                    SCANDINAVIAN_FRONT_PROMPT_PREFIX
                    if view is IFCView.FRONT
                    else SCANDINAVIAN_SIDE_PROMPT_PREFIX
                )
                base_prompt = softened_prompt
        base_prompt = f"{prefix}, {base_prompt}"
    suffix = VIEW_PROMPT_SUFFIXES.get(view, "")
    if not suffix:
        return base_prompt
    return f"{base_prompt}{suffix}"
