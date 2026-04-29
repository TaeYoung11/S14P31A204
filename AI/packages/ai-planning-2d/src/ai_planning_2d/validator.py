from __future__ import annotations

from shapely.geometry import box
from shapely.ops import unary_union

from .command import ActionType, CommandBatch

MIN_DIM_MM = 500     # 0.5m — 현실적인 방 최소 치수
MAX_DIM_MM = 30_000  # 30m — 단독주택 기준 최대 치수


def _validate_dimensions(width: int, height: int) -> str | None:
    """치수 범위 검증. 문제 있으면 오류 메시지 반환, 없으면 None."""
    if width < MIN_DIM_MM or height < MIN_DIM_MM:
        return (
            f"치수가 너무 작습니다 ({width}x{height}mm). "
            f"최소 {MIN_DIM_MM}mm 이상이어야 합니다."
        )
    if width > MAX_DIM_MM or height > MAX_DIM_MM:
        return (
            f"치수가 너무 큽니다 ({width}x{height}mm). "
            f"최대 {MAX_DIM_MM}mm 이하이어야 합니다."
        )
    return None


def _validate_rects(
    rects: list[dict], shape: str, width: int | None, height: int | None
) -> str | None:
    """rect 조합 물리 유효성 검증. 문제 있으면 오류 메시지 반환, 없으면 None.

    검증 항목:
    - 개별 rect: width/height > 0, x/y >= 0
    - 연결성: unary_union 결과가 단일 Polygon
    - rect 간 겹침 없음: pairwise intersection area == 0
    - 전체 bounds가 declared width/height 안에 있음
    """
    polygons = []
    for r in rects:
        if r.get("x", 0) < 0 or r.get("y", 0) < 0:
            return f"{shape} 형태에 음수 좌표가 있습니다: {r}"
        if r.get("width", 0) <= 0 or r.get("height", 0) <= 0:
            return f"{shape} 형태에 크기가 0 이하인 rect가 있습니다: {r}"
        polygons.append(
            box(r["x"], r["y"], r["x"] + r["width"], r["y"] + r["height"])
        )

    union = unary_union(polygons)

    if not union.is_valid:
        return f"{shape} 형태의 rect 조합이 유효하지 않습니다."

    if union.geom_type == "MultiPolygon":
        return f"{shape} 형태의 rect들이 서로 연결되지 않습니다."

    # rect 간 겹침 검사
    for i in range(len(polygons)):
        for j in range(i + 1, len(polygons)):
            if polygons[i].intersection(polygons[j]).area > 0:
                return f"{shape} 형태의 rect들이 서로 겹칩니다."

    # declared dimensions 내 bounds 검사
    if width is not None and height is not None:
        minx, miny, maxx, maxy = union.bounds
        if minx < 0 or miny < 0 or maxx > width or maxy > height:
            return (
                f"{shape} 형태의 rect가 선언된 치수({width}x{height}mm)를 벗어납니다."
            )

    return None


def validate_command_batch(batch: CommandBatch) -> CommandBatch:
    """CommandBatch의 물리적 유효성을 검증한다. pipeline.py 내부 전용.

    검증 항목 (CREATE_SPACE / UPDATE_SPACE):
    - 치수 범위: MIN_DIM_MM ~ MAX_DIM_MM
    - rects가 None이 아닌 경우: 빈 리스트 거부, 좌표 >= 0, width/height > 0,
      단일 연결 폴리곤, 겹침 없음, bounds가 declared dimensions 안에 있음

    문제 발견 시 requires_clarification=True인 CommandBatch로 변환해 반환한다.
    삭제(DELETE) 명령은 geometry가 없으므로 검증 대상에서 제외한다.
    """
    if batch.requires_clarification:
        return batch

    for cmd in batch.commands:
        if cmd.action not in (ActionType.CREATE_SPACE, ActionType.UPDATE_SPACE):
            continue

        geometry = cmd.params.get("geometry", {})
        dimensions = geometry.get("dimensions", {})
        width = dimensions.get("width")
        height = dimensions.get("height")
        properties = cmd.params.get("properties", {})
        rects = properties.get("rects")
        shape = properties.get("shape", "rect")

        if width is not None and height is not None:
            err = _validate_dimensions(width, height)
            if err:
                return CommandBatch(
                    commands=[],
                    requires_clarification=True,
                    clarification_question=err,
                )

        if rects is not None:
            if len(rects) == 0:
                return CommandBatch(
                    commands=[],
                    requires_clarification=True,
                    clarification_question="방 형태 정보(rects)가 비어 있습니다.",
                )
            err = _validate_rects(rects, shape, width, height)
            if err:
                return CommandBatch(
                    commands=[],
                    requires_clarification=True,
                    clarification_question=err,
                )

    return batch
