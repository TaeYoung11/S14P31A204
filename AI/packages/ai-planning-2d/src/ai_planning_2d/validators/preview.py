from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from shapely.geometry import Polygon

from ..schemas.command import FloorNLPCommand
from ..schemas.ifc_context import IFCContext


@dataclass
class PreviewValidationResult:
    ok: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def validate_preview_plan(
    *,
    command: FloorNLPCommand,
    policy_plan: dict[str, Any] | None,
    ifc_context: IFCContext | None,
) -> PreviewValidationResult:
    result = PreviewValidationResult()
    if ifc_context is None or policy_plan is None:
        return result

    if policy_plan.get("status") != "planned":
        return result

    if command.action == "remove_room":
        _validate_remove_room_preview(result, policy_plan)
    elif command.action == "resize_room":
        _validate_resize_room_preview(result, command, policy_plan, ifc_context)

    return result


def _validate_remove_room_preview(
    result: PreviewValidationResult,
    policy_plan: dict[str, Any],
) -> None:
    opening_ids = policy_plan.get("remove_opening_ids", [])
    if opening_ids:
        result.warnings.append(
            "삭제 대상 벽에 연결된 문/창이 있어 executor에서 opening 정리가 필요합니다."
        )


def _validate_resize_room_preview(
    result: PreviewValidationResult,
    command: FloorNLPCommand,
    policy_plan: dict[str, Any],
    ifc_context: IFCContext,
) -> None:
    target_space_id = policy_plan.get("target_space_id")
    target_space = _find_space(ifc_context, target_space_id)
    if target_space is None:
        result.ok = False
        result.errors.append("크기 변경 대상 방을 preview validator가 찾지 못했습니다.")
        return

    boundary = _find_boundary(ifc_context, target_space["floor"])
    if boundary is not None:
        resized_polygon = _resized_polygon(
            polygon=target_space["polygon"],
            direction=policy_plan.get("direction"),
            new_width=command.resize_width,
            new_height=command.resize_height,
        )
        if resized_polygon is not None:
            boundary_polygon = Polygon(boundary["outer_polygon"])
            if not boundary_polygon.covers(Polygon(resized_polygon)):
                result.ok = False
                result.errors.append("크기 변경 결과가 해당 층의 boundary 밖으로 벗어납니다.")

    opening_ids = policy_plan.get("affected_opening_ids", [])
    if opening_ids:
        result.warnings.append(
            "이 크기 변경은 기존 문/창 위치 보정이 필요하므로 "
            "executor 연결 전까지는 미리보기만 안전합니다."
        )


def _find_space(ifc_context: IFCContext, space_id: str | None) -> dict[str, Any] | None:
    for space in ifc_context.get("spaces", []):
        if space["id"] == space_id:
            return space
    return None


def _find_boundary(ifc_context: IFCContext, floor: int) -> dict[str, Any] | None:
    for boundary in ifc_context.get("boundaries", []):
        if boundary["floor"] == floor:
            return boundary
    return None


def _resized_polygon(
    *,
    polygon: list[tuple[float, float]],
    direction: str | None,
    new_width: int | None,
    new_height: int | None,
) -> list[tuple[float, float]] | None:
    if direction is None or new_width is None or new_height is None:
        return None

    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    if direction == "west":
        min_x = max_x - new_width
    elif direction == "east":
        max_x = min_x + new_width
    elif direction == "south":
        min_y = max_y - new_height
    elif direction == "north":
        max_y = min_y + new_height

    return [
        (min_x, min_y),
        (max_x, min_y),
        (max_x, max_y),
        (min_x, max_y),
    ]


__all__ = ["PreviewValidationResult", "validate_preview_plan"]
