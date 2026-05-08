from __future__ import annotations

from shapely.geometry import box
from shapely.ops import unary_union

from ..schemas.command import ActionType, CommandBatch

MIN_DIM_MM = 500
MAX_DIM_MM = 30_000


def _validate_dimensions(width: int, height: int) -> str | None:
    if width < MIN_DIM_MM or height < MIN_DIM_MM:
        return (
            f"치수가 너무 작습니다 ({width}x{height}mm). "
            f"최소 {MIN_DIM_MM}mm 이상이어야 합니다."
        )
    if width > MAX_DIM_MM or height > MAX_DIM_MM:
        return (
            f"치수가 너무 큽니다 ({width}x{height}mm). "
            f"최대 {MAX_DIM_MM}mm 이하여야 합니다."
        )
    return None


def _validate_rects(
    rects: list[dict], shape: str, width: int | None, height: int | None
) -> str | None:
    polygons = []
    for rect in rects:
        if rect.get("x", 0) < 0 or rect.get("y", 0) < 0:
            return f"{shape} 형태에 음수 좌표가 있습니다: {rect}"
        if rect.get("width", 0) <= 0 or rect.get("height", 0) <= 0:
            return f"{shape} 형태에 크기가 0 이하인 rect가 있습니다: {rect}"
        polygons.append(
            box(rect["x"], rect["y"], rect["x"] + rect["width"], rect["y"] + rect["height"])
        )

    union = unary_union(polygons)
    if not union.is_valid:
        return f"{shape} 형태의 rect 조합이 유효하지 않습니다."
    if union.geom_type == "MultiPolygon":
        return f"{shape} 형태의 rect들이 서로 연결되지 않았습니다."

    for index, polygon in enumerate(polygons):
        for other_index in range(index + 1, len(polygons)):
            if polygon.intersection(polygons[other_index]).area > 0:
                return f"{shape} 형태의 rect들이 서로 겹칩니다."

    if width is not None and height is not None:
        min_x, min_y, max_x, max_y = union.bounds
        if min_x < 0 or min_y < 0 or max_x > width or max_y > height:
            return f"{shape} 형태의 rect가 선언된 치수({width}x{height}mm)를 벗어납니다."

    return None


def validate_command_batch(batch: CommandBatch) -> CommandBatch:
    if batch.requires_clarification:
        return batch

    for command in batch.commands:
        if command.action not in (ActionType.CREATE_SPACE, ActionType.UPDATE_SPACE):
            continue

        geometry = command.params.get("geometry", {})
        dimensions = geometry.get("dimensions", {})
        width = dimensions.get("width")
        height = dimensions.get("height")
        properties = command.params.get("properties", {})
        rects = properties.get("rects")
        shape = properties.get("shape", "rect")

        if width is not None and height is not None:
            error = _validate_dimensions(width, height)
            if error:
                return CommandBatch(
                    commands=[],
                    requires_clarification=True,
                    clarification_question=error,
                )

        if rects is not None:
            if len(rects) == 0:
                return CommandBatch(
                    commands=[],
                    requires_clarification=True,
                    clarification_question="방 형태 정보(rects)가 비어 있습니다.",
                )
            error = _validate_rects(rects, shape, width, height)
            if error:
                return CommandBatch(
                    commands=[],
                    requires_clarification=True,
                    clarification_question=error,
                )

    return batch


__all__ = ["validate_command_batch"]
