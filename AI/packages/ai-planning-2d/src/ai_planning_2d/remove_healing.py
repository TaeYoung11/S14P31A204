from __future__ import annotations

import math
from typing import Literal, TypedDict

from .command import IFCContext, SpaceContext

_TOLERANCE_MM = 1.0
_TOUCH_TOLERANCE_MM = 5.0


class RemoveMergePlan(TypedDict):
    target_space_id: str
    merge_target_space_id: str
    direction: Literal["west", "east", "south", "north"]
    anchor_translate_mm: dict[str, float]
    dimensions_mm: dict[str, int]
    rects: list[dict[str, int]]


def build_remove_merge_plan(
    *,
    ifc_context: IFCContext | None,
    target_space_id: str,
    merge_target_space_id: str | None,
) -> RemoveMergePlan | None:
    if ifc_context is None or merge_target_space_id is None:
        return None
    target = _find_space(ifc_context, target_space_id)
    merge_target = _find_space(ifc_context, merge_target_space_id)
    if target is None or merge_target is None:
        return None
    if not _is_axis_aligned_rectangle(target["polygon"]):
        return None
    if not _is_axis_aligned_rectangle(merge_target["polygon"]):
        return None

    t_min_x, t_min_y, t_max_x, t_max_y = _bbox(target["polygon"])
    m_min_x, m_min_y, m_max_x, m_max_y = _bbox(merge_target["polygon"])

    if _same_interval(t_min_y, t_max_y, m_min_y, m_max_y):
        min_x = min(t_min_x, m_min_x)
        max_x = max(t_max_x, m_max_x)
        if _touches(t_min_x, t_max_x, m_min_x, m_max_x):
            if math.isclose(m_min_x, min_x, abs_tol=_TOLERANCE_MM):
                direction: Literal["east", "west"] = "east"
                shift_x = 0.0
            else:
                direction = "west"
                shift_x = min_x - m_min_x
            return {
                "target_space_id": target_space_id,
                "merge_target_space_id": merge_target_space_id,
                "direction": direction,
                "anchor_translate_mm": {"x": shift_x, "y": 0.0, "z": 0.0},
                "dimensions_mm": {
                    "width": int(round(max_x - min_x)),
                    "height": int(round(t_max_y - t_min_y)),
                },
                "rects": [
                    {
                        "x": 0,
                        "y": 0,
                        "width": int(round(max_x - min_x)),
                        "height": int(round(t_max_y - t_min_y)),
                    }
                ],
            }

    if _same_interval(t_min_x, t_max_x, m_min_x, m_max_x):
        min_y = min(t_min_y, m_min_y)
        max_y = max(t_max_y, m_max_y)
        if _touches(t_min_y, t_max_y, m_min_y, m_max_y):
            if math.isclose(m_min_y, min_y, abs_tol=_TOLERANCE_MM):
                direction2: Literal["north", "south"] = "north"
                shift_y = 0.0
            else:
                direction2 = "south"
                shift_y = min_y - m_min_y
            return {
                "target_space_id": target_space_id,
                "merge_target_space_id": merge_target_space_id,
                "direction": direction2,
                "anchor_translate_mm": {"x": 0.0, "y": shift_y, "z": 0.0},
                "dimensions_mm": {
                    "width": int(round(t_max_x - t_min_x)),
                    "height": int(round(max_y - min_y)),
                },
                "rects": [
                    {
                        "x": 0,
                        "y": 0,
                        "width": int(round(t_max_x - t_min_x)),
                        "height": int(round(max_y - min_y)),
                    }
                ],
            }

    return None


def _find_space(ifc_context: IFCContext, space_id: str) -> SpaceContext | None:
    return next((space for space in ifc_context.get("spaces", []) if space["id"] == space_id), None)


def _bbox(polygon: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def _same_interval(
    min_a: float,
    max_a: float,
    min_b: float,
    max_b: float,
) -> bool:
    return math.isclose(min_a, min_b, abs_tol=_TOLERANCE_MM) and math.isclose(
        max_a, max_b, abs_tol=_TOLERANCE_MM
    )


def _touches(min_a: float, max_a: float, min_b: float, max_b: float) -> bool:
    return math.isclose(max_a, min_b, abs_tol=_TOUCH_TOLERANCE_MM) or math.isclose(
        max_b, min_a, abs_tol=_TOUCH_TOLERANCE_MM
    )


def _is_axis_aligned_rectangle(polygon: list[tuple[float, float]]) -> bool:
    unique_x = {round(point[0], 3) for point in polygon}
    unique_y = {round(point[1], 3) for point in polygon}
    return len(unique_x) == 2 and len(unique_y) == 2
