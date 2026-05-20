"""해석된 2D 편집 의도와 IFC 컨텍스트를 미리보기 가능한 명령 배치로 바꾼다."""

from typing import Any, Literal, cast
import math
import re

from ..command import (
    ActionType,
    CommandBatch,
    DoorContext,
    FloorNLPCommand,
    IFCCommand,
    IFCContext,
    OpeningContext,
    SpaceContext,
    WallContext,
    WindowContext,
)
from ..add_room_placement import suggest_add_room_start_mm
from ..toilet_demo import UserIntent as ToiletDemoUserIntent
from ..toilet_demo import build_toilet_insertion_geometry_plan
from ..validators.batch import validate_command_batch
from ..ifc_extractor import resolve_space_type_from_name

_MSG_CREATE_WALL_NO_VALIDATED_CANDIDATE = (
    "? ???? ??? ?? ?? ?? ??? ????. "
    "??? ?? ??? ????? ?? ??? ?? ?? ?? ??? ?? ?????."
)

# ---------------------------------------------------------------------------
# 기본 clarification / 오류 메시지
# ---------------------------------------------------------------------------
_MSG_DEFAULT_CLARIFICATION = "요청을 이해하지 못했습니다. 조금 더 구체적으로 설명해 주세요."
_MSG_ADD_ROOM_MISSING = "추가할 방의 이름이나 크기 정보가 부족합니다."
_MSG_ADD_ROOM_NO_RECTS = "방 크기나 형태 정보가 부족합니다. 예: 침실 4000x5000 추가"
_MSG_RESIZE_MISSING_DIMS = "변경할 방의 크기 정보가 부족합니다. 예: L자 6000x8000"
_MSG_DUPLICATE_REMOVE = "같은 이름의 방이 여러 개 있습니다. 몇 층 방을 삭제할까요?"
_MSG_DUPLICATE_RESIZE = "같은 이름의 방이 여러 개 있습니다. 몇 층 방을 변경할까요?"
_MSG_ADJACENCY_UNSUPPORTED = "인접 관계 변경은 현재 지원하지 않습니다."
_MSG_LOCK_APP_ONLY = "잠금 기능은 현재 애플리케이션 내부에서만 지원합니다."
_MSG_UNSUPPORTED_ACTION = "현재 지원하지 않는 작업입니다."

# 방/층 조회 실패 메시지 템플릿(str.format 사용)
_TMPL_ROOM_NOT_FOUND = "'{name}' 방을 현재 IFC에서 찾을 수 없습니다."
_TMPL_FLOOR_NOT_FOUND = "{floor}층을 현재 IFC에서 찾을 수 없습니다."
_TMPL_LOCKED_DELETE = "'{name}' 방은 잠겨 있어 삭제할 수 없습니다."
_TMPL_LOCKED_RESIZE = "'{name}' 방은 잠겨 있어 크기를 변경할 수 없습니다."
_TMPL_STOREY_NOT_FOUND = "'{name}' 방의 층 정보를 현재 IFC에서 찾을 수 없습니다."
_TMPL_STOREY_MISSING_ERROR = "IFC 상태 오류: '{name}' 방의 storey 정보가 없습니다."
_MSG_CREATE_WALL_DEMO_ONLY = (
    "?? ????? House_KR ??? ?? ??? ?? ???? ????. "
    "??? ?? ??? ????? ?? ??? ?? ?? ?? ??? ?? ?????."
)
_LOCKED_PARTITION_WALL_CANDIDATE = {
    "room_id": "0Lt8gR_E9ESeGH5uY_g9e9",
    "room_name": "거실",
    "floor": 1,
    "start_y_mm": 300.0,
    "end_y_mm": 4010.0,
    "width_mm": 240,
    "height_mm": 2500,
    "template_wall_id": "2XPyKWY018sA1ygZKgQPtU",
    "bottom_host_wall_id": "16DNNqzfP2thtfaOflvsKA",
    "top_host_wall_id": "2XPyKWY018sA1ygZKgQPtU",
    "opening_margin_mm": 300.0,
    "corner_margin_mm": 200.0,
    "endpoint_connections": [
        {
            "mode": "existing_to_new",
            "existing_wall_id": "16DNNqzfP2thtfaOflvsKA",
            "existing_connection_type": "ATEND",
            "new_connection_type": "ATSTART",
        },
        {
            "mode": "new_to_existing",
            "existing_wall_id": "2XPyKWY018sA1ygZKgQPtU",
            "new_connection_type": "ATEND",
            "existing_connection_type": "ATSTART",
        },
    ],
}
_CREATE_DOOR_EDGE_MARGIN_MM = 100.0
_CREATE_DOOR_OVERLAP_MARGIN_MM = 100.0
_MERGE_WINDOWS_TOUCH_TOLERANCE_MM = 350.0
_MSG_DELETE_WALL_VOID_NOT_FOUND = (
    "선택한 door/window/opening 요소를 IFC context에서 찾지 못했습니다."
)
_MSG_DELETE_WALL_VOID_BCR_UNSUPPORTED = (
    "선택한 요소는 현재 데모 범위에서 지원하지 않습니다. "
    "BCR 벽에 호스팅된 opening 계열 삭제는 이번 데모에서 지원하지 않습니다."
)
_MSG_DELETE_WALL_VOID_OPENING_UNVALIDATED = (
    "선택한 opening 요소 직접 삭제는 현재 데모에서 지원하지 않습니다."
)
_MSG_DELETE_WALL_NOT_FOUND = "선택한 벽을 IFC context에서 찾지 못했습니다."
_MSG_DELETE_WALL_UNSUPPORTED = (
    "벽 삭제는 현재 두 개의 공간을 나누는 내부벽에서만 지원됩니다."
)


def _host_wall_axis_interval(wall: dict[str, Any]) -> tuple[float, float]:
    start = wall["start"]
    end = wall["end"]
    if abs(end[0] - start[0]) >= abs(end[1] - start[1]):
        return (min(start[0], end[0]), max(start[0], end[0]))
    return (min(start[1], end[1]), max(start[1], end[1]))


def _opening_like_intervals(
    *,
    host_wall_id: str,
    ifc_context: IFCContext,
) -> list[tuple[float, float]]:
    intervals: list[tuple[float, float]] = []
    for item in ifc_context["doors"]:
        if item["host_wall_id"] != host_wall_id:
            continue
        position = item["position"]
        width = item["width"]
        if width <= 0.0:
            continue
        intervals.append((position - (width / 2), position + (width / 2)))

    for item in ifc_context["windows"]:
        if item["host_wall_id"] != host_wall_id:
            continue
        position = item["position"]
        width = item["width"]
        if width <= 0.0:
            continue
        intervals.append((position - (width / 2), position + (width / 2)))

    # IFCContext openings currently do not expose axis position/width, so this
    # helper only uses filled openings from doors/windows.
    return intervals


def _subtract_interval(
    allowed: list[tuple[float, float]],
    blocked: tuple[float, float],
) -> list[tuple[float, float]]:
    blocked_start, blocked_end = blocked
    result: list[tuple[float, float]] = []
    for start, end in allowed:
        if blocked_end <= start or blocked_start >= end:
            result.append((start, end))
            continue
        if blocked_start > start:
            result.append((start, blocked_start))
        if blocked_end < end:
            result.append((blocked_end, end))
    return [(start, end) for start, end in result if end - start > 0.0]


def _wall_length_mm(wall: WallContext) -> float:
    start = wall["start"]
    end = wall["end"]
    return math.hypot(end[0] - start[0], end[1] - start[1])


def _point_along_wall(
    wall: WallContext,
    offset_mm: float,
) -> tuple[float, float]:
    start = wall["start"]
    end = wall["end"]
    length = _wall_length_mm(wall)
    if length <= 0.0:
        return start
    ratio = offset_mm / length
    return (
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
    )


def _polygon_bbox(points: list[tuple[float, float]]) -> tuple[float, float, float, float] | None:
    if not points:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return (min(xs), min(ys), max(xs), max(ys))


def _space_bbox(space: SpaceContext) -> tuple[float, float, float, float] | None:
    bbox = _polygon_bbox(space.get("polygon", []))
    if bbox is not None:
        return bbox
    x = space.get("x")
    y = space.get("y")
    width = space.get("width")
    height = space.get("height")
    if x is None or y is None or width is None or height is None:
        return None
    return (x, y, x + width, y + height)


def _interval_overlap(
    first: tuple[float, float],
    second: tuple[float, float],
) -> float:
    return max(0.0, min(first[1], second[1]) - max(first[0], second[0]))


def _wall_bbox(wall: WallContext) -> tuple[float, float, float, float]:
    start = wall["start"]
    end = wall["end"]
    return (
        min(start[0], end[0]),
        min(start[1], end[1]),
        max(start[0], end[0]),
        max(start[1], end[1]),
    )


def _wall_touches_space(wall: WallContext, space: SpaceContext) -> bool:
    space_box = _space_bbox(space)
    if space_box is None:
        return False
    sx1, sy1, sx2, sy2 = space_box
    wx1, wy1, wx2, wy2 = _wall_bbox(wall)
    tolerance = _MERGE_WINDOWS_TOUCH_TOLERANCE_MM
    return (
        wx2 >= sx1 - tolerance
        and wx1 <= sx2 + tolerance
        and wy2 >= sy1 - tolerance
        and wy1 <= sy2 + tolerance
    )


def _space_axis_interval_for_wall(
    wall: WallContext,
    space: SpaceContext,
) -> tuple[float, float] | None:
    space_box = _space_bbox(space)
    if space_box is None:
        return None
    sx1, sy1, sx2, sy2 = space_box
    start = wall["start"]
    end = wall["end"]
    length = _wall_length_mm(wall)
    if length <= 0.0:
        return None
    unit_x = (end[0] - start[0]) / length
    unit_y = (end[1] - start[1]) / length
    offsets = [
        (corner_x - start[0]) * unit_x + (corner_y - start[1]) * unit_y
        for corner_x, corner_y in (
            (sx1, sy1),
            (sx1, sy2),
            (sx2, sy1),
            (sx2, sy2),
        )
    ]
    return (max(0.0, min(offsets)), min(length, max(offsets)))


def _select_two_windows(
    windows: list[WindowContext],
) -> list[WindowContext]:
    ordered = sorted(windows, key=lambda item: float(item["position"]))
    if len(ordered) <= 2:
        return ordered
    pairs = []
    for index in range(len(ordered) - 1):
        first = ordered[index]
        second = ordered[index + 1]
        first_end = float(first["position"]) + (float(first["width"]) / 2.0)
        second_start = float(second["position"]) - (float(second["width"]) / 2.0)
        gap = abs(second_start - first_end)
        pairs.append((gap, index, [first, second]))
    return min(pairs, key=lambda item: (item[0], item[1]))[2]


def _find_merge_windows_plan(
    *,
    space: SpaceContext,
    ifc_context: IFCContext,
) -> dict[str, Any] | None:
    walls_by_id = {wall["id"]: wall for wall in ifc_context["walls"]}
    grouped: dict[str, list[tuple[WindowContext, float]]] = {}

    for window in ifc_context["windows"]:
        if window.get("floor") != space.get("floor"):
            continue
        adjacent_space_id = window.get("adjacent_space_id")
        if adjacent_space_id is not None and adjacent_space_id != space["id"]:
            continue
        wall = walls_by_id.get(window["host_wall_id"])
        if wall is None or not _wall_touches_space(wall, space):
            continue
        space_interval = _space_axis_interval_for_wall(wall, space)
        if space_interval is None:
            continue
        window_interval = (
            float(window["position"]) - (float(window["width"]) / 2.0),
            float(window["position"]) + (float(window["width"]) / 2.0),
        )
        overlap = _interval_overlap(window_interval, space_interval)
        if overlap <= 0.0 and adjacent_space_id != space["id"]:
            continue
        grouped.setdefault(wall["id"], []).append((window, overlap))

    candidates = [
        (wall_id, windows)
        for wall_id, windows in grouped.items()
        if len(windows) >= 2
    ]
    if not candidates:
        return None

    wall_id, window_scores = max(
        candidates,
        key=lambda item: (len(item[1]), sum(score for _, score in item[1])),
    )
    wall = walls_by_id[wall_id]
    selected_windows = _select_two_windows([window for window, _ in window_scores])
    if len(selected_windows) < 2:
        return None

    merge_start = min(
        float(window["position"]) - (float(window["width"]) / 2.0)
        for window in selected_windows
    )
    merge_end = max(
        float(window["position"]) + (float(window["width"]) / 2.0)
        for window in selected_windows
    )
    merge_length = merge_end - merge_start
    if merge_length <= 0.0:
        return None

    # 새 통창은 삭제되는 두 창이 차지하던 구간의 중심에 배치한다.
    # 방 bbox 중심으로 잡으면 창이 벽 한쪽에 몰려 있을 때 통창이 엉뚱한 위치에
    # 생기거나, 선택하지 않은 다른 창과 겹칠 수 있다.
    center_offset = (merge_start + merge_end) / 2.0
    wall_length = _wall_length_mm(wall)
    if wall_length > 0.0:
        half_length = merge_length / 2.0
        center_offset = max(half_length, min(wall_length - half_length, center_offset))
    location = _point_along_wall(wall, center_offset)
    return {
        "space": space,
        "wall": wall,
        "windows": selected_windows,
        "location": location,
        "length": round(merge_length),
        "height": max(round(float(window["height"])) for window in selected_windows),
        "sill_height": min(round(float(window["sill_height"])) for window in selected_windows),
    }


def _find_create_door_location(
    *,
    wall: WallContext,
    width_mm: int,
    ifc_context: IFCContext,
) -> tuple[float, float] | None:
    wall_length = _wall_length_mm(wall)
    usable_start = _CREATE_DOOR_EDGE_MARGIN_MM
    usable_end = wall_length - _CREATE_DOOR_EDGE_MARGIN_MM
    if usable_end - usable_start < width_mm:
        return None

    allowed = [(usable_start, usable_end)]
    for opening_start, opening_end in _opening_like_intervals(
        host_wall_id=wall["id"],
        ifc_context=ifc_context,
    ):
        blocked = (
            opening_start - _CREATE_DOOR_OVERLAP_MARGIN_MM,
            opening_end + _CREATE_DOOR_OVERLAP_MARGIN_MM,
        )
        allowed = _subtract_interval(allowed, blocked)

    fitting_segments = [
        segment for segment in allowed if (segment[1] - segment[0]) >= width_mm
    ]
    if not fitting_segments:
        return None

    best_start, best_end = max(fitting_segments, key=lambda segment: segment[1] - segment[0])
    center = (best_start + best_end) / 2.0
    return _point_along_wall(wall, center)


def _choose_locked_partition_candidate(
    *,
    command: FloorNLPCommand,
    ifc_context: IFCContext,
) -> dict[str, Any] | None:
    # Viewer inspection and direct IFC opening measurements showed that the
    # previously locked House_KR candidate still lands inside a window-bearing
    # host-wall segment. Until a new candidate is validated from real opening
    # extents, create_wall must not auto-apply on this branch.
    return None


def _find_delete_wall_void_target(
    target_element_id: str,
    ifc_context: IFCContext | None,
) -> (
    tuple[Literal["door"], DoorContext]
    | tuple[Literal["window"], WindowContext]
    | tuple[Literal["opening"], OpeningContext]
    | None
):
    if ifc_context is None:
        return None
    for item in ifc_context["doors"]:
        if item["id"] == target_element_id:
            return ("door", item)
    for item in ifc_context["windows"]:
        if item["id"] == target_element_id:
            return ("window", item)
    for item in ifc_context["openings"]:
        if item["id"] == target_element_id:
            return ("opening", item)
    return None


_MSG_DELETE_WALL_VOID_FILLED_OPENING_UNSUPPORTED = (
    "?ì¢ê¹®??openingì— door/window fillerê°€ ì—°ê²°ëœ ê²½ìš°ì—ëŠ” "
    "?ê·¸ filler ìš”ì†Œë¥¼ ì§€ì •í•´ ì‚­ì œí•´ì•¼ í•©ë‹ˆë‹¤. "
    "?ì´ ë™ìž‘ì€ í˜„ìž¬ ë°ëª¨ì—ì„œ opening ì§ì ‘ ì‚­ì œë¡œëŠ” ì§€ì›í•˜ì§€ ì•ŠìŠµë‹ˆë‹¤."
)


def to_ifc_commands(
    command: FloorNLPCommand,
    ifc_context: IFCContext | None = None,
) -> CommandBatch:
    def _find_wall(wall_id: str | None) -> WallContext | None:
        if not ifc_context or not wall_id:
            return None
        for wall in ifc_context["walls"]:
            if wall["id"] == wall_id:
                return wall
        return None

    def _find_space_ids(target_name: str | None) -> list[str]:
        if not ifc_context or not target_name:
            return []
        # "1층 거실" 같이 층 접두어가 붙은 경우 분리한다.
        floor_from_name: int | None = None
        name = target_name
        m = re.match(r"^(\d+)층\s+(.+)$", target_name.strip())
        if m:
            floor_from_name = int(m.group(1))
            name = m.group(2).strip()
        spaces = ifc_context["spaces"]
        target_type = resolve_space_type_from_name(name)
        exact_matches = [
            space for space in spaces
            if space["name"] == name and space["id"]
        ]
        matched = exact_matches
        if not matched and target_type:
            matched = [
                space for space in spaces
                if space.get("type") == target_type and space["id"]
            ]
        effective_floor = floor_from_name if floor_from_name is not None else command.target_floor
        if effective_floor is not None:
            matched = [s for s in matched if s["floor"] == effective_floor]
        return [s["id"] for s in matched]

    def _find_storey_id(floor: int) -> str | None:
        """층 번호로 IfcBuildingStorey GlobalId를 찾는다."""
        if not ifc_context:
            return None
        for storey in ifc_context["storeys"]:
            if storey["floor"] == floor:
                return storey["id"]
        return None

    def _find_storey_id_for_space(space_id: str) -> str | None:
        """space GlobalId로 대응되는 storey GlobalId를 찾는다."""
        if not ifc_context:
            return None
        for space in ifc_context["spaces"]:
            if space["id"] == space_id:
                return _find_storey_id(space["floor"])
        return None

    def _find_storey_id_for_wall(wall_id: str | None) -> str | None:
        wall = _find_wall(wall_id)
        if wall is None:
            return None
        return _find_storey_id(wall["floor"])

    if command.needs_clarification:
        return CommandBatch(
            commands=[],
            requires_clarification=True,
            clarification_question=command.clarification_question or _MSG_DEFAULT_CLARIFICATION,
        )

    if command.action == "merge_windows":
        if ifc_context is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="IFC context is required to merge windows.",
            )
        target_space_ids = _find_space_ids(command.target_room_name)
        if len(target_space_ids) != 1:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=(
                    "Select one room for picture-window conversion. "
                    "Example: 1번방 창문 2개를 통창으로 바꿔줘"
                ),
            )
        target_space = next(
            (space for space in ifc_context["spaces"] if space["id"] == target_space_ids[0]),
            None,
        )
        if target_space is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="The selected room was not found in the IFC context.",
            )
        storey_id = _find_storey_id(target_space["floor"])
        if storey_id is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_TMPL_STOREY_NOT_FOUND.format(name=target_space["name"]),
            )
        plan = _find_merge_windows_plan(space=target_space, ifc_context=ifc_context)
        if plan is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=(
                    f"Could not find two windows adjacent to '{target_space['name']}'."
                ),
            )
        wall = plan["wall"]
        location = plan["location"]
        commands = [
            IFCCommand(
                action=ActionType.DELETE_WINDOW,
                target_id=window["id"],
                params={
                    "metadata": {
                        "target_kind": "window",
                        "host_wall_id": window["host_wall_id"],
                    }
                },
                confidence=command.confidence,
                reason="delete existing window before picture-window merge",
            )
            for window in plan["windows"]
        ]
        commands.append(
            IFCCommand(
                action=ActionType.CREATE_WINDOW,
                target_id=None,
                params={
                    "entity_type": "Window",
                    "metadata": {
                        "storey_id": storey_id,
                        "host_wall_id": wall["id"],
                        "merged_window_ids": [window["id"] for window in plan["windows"]],
                    },
                    "geometry": {
                        "location": [location[0], location[1], 0.0],
                        "dimensions": {
                            "length": plan["length"],
                            "width": wall.get("thickness") or 200,
                            "height": plan["height"],
                        },
                    },
                    "properties": {
                        "sill_height": plan["sill_height"],
                        "window_style": "picture",
                    },
                },
                confidence=command.confidence,
                reason="create merged picture window",
            )
        )
        return CommandBatch(commands=commands, requires_clarification=False)

    if command.action == "create_door":
        wall = _find_wall(command.target_wall_id)
        if wall is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="선택한 벽을 IFC context에서 찾지 못했습니다.",
            )
        if ifc_context is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="IFC context가 없어 문 생성 위치를 계산할 수 없습니다.",
            )
        storey_id = _find_storey_id_for_wall(command.target_wall_id)
        if storey_id is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_TMPL_STOREY_NOT_FOUND.format(name=command.target_wall_id),
            )
        width_mm = command.element_width_mm or 900
        height_mm = command.element_height_mm or 2100
        location = _find_create_door_location(
            wall=wall,
            width_mm=width_mm,
            ifc_context=ifc_context,
        )
        if location is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=(
                    "선택한 벽에는 문을 안전하게 추가할 수 있는 검증된 구간이 없습니다."
                ),
            )
        return CommandBatch(
            commands=[
                IFCCommand(
                    action=ActionType.CREATE_DOOR,
                    target_id=None,
                    params={
                        "entity_type": "Door",
                        "metadata": {
                            "storey_id": storey_id,
                            "host_wall_id": command.target_wall_id,
                        },
                        "geometry": {
                            "location": [location[0], location[1], 0.0],
                            "direction": [1.0, 0.0, 0.0],
                            "dimensions": {
                                "width": width_mm,
                                "height": height_mm,
                            },
                        },
                    },
                    confidence=command.confidence,
                    reason="create door on selected wall",
                )
            ],
            requires_clarification=False,
        )

    if command.action == "delete_wall_void":
        target_element_id = command.target_element_id
        assert target_element_id is not None
        match = _find_delete_wall_void_target(target_element_id, ifc_context)
        if match is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_DELETE_WALL_VOID_NOT_FOUND,
            )
        target_kind, target = match
        if target_kind == "opening" and target.get("filled_by_kind") is not None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_DELETE_WALL_VOID_FILLED_OPENING_UNSUPPORTED,
            )
        # Preview source-of-truth: ifc_context.host_wall_body_class is populated
        # by ifc_extractor._classify_wall_body and mirrored by the handler.
        if target.get("host_wall_body_class") != "parametric":
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_DELETE_WALL_VOID_BCR_UNSUPPORTED,
            )
        return CommandBatch(
            commands=[
                IFCCommand(
                    action=ActionType.DELETE_WALL_VOID,
                    target_id=target_element_id,
                    params={
                        "metadata": {
                            "target_kind": target_kind,
                            "host_wall_id": target["host_wall_id"],
                            "host_wall_body_class": target["host_wall_body_class"],
                        }
                    },
                    confidence=command.confidence,
                    reason="delete selected wall opening family element",
                )
            ],
            requires_clarification=False,
            clarification_question=None,
        )

    if command.action == "delete_wall":
        wall = _find_wall(command.target_wall_id)
        if wall is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_DELETE_WALL_NOT_FOUND,
            )
        if wall.get("kind") != "INTERIOR" or len(wall.get("space_ids", [])) != 2:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_DELETE_WALL_UNSUPPORTED,
            )
        return CommandBatch(
            commands=[
                IFCCommand(
                    action=ActionType.DELETE_WALL,
                    target_id=wall["id"],
                    params={
                        "metadata": {
                            "host_wall_id": wall["id"],
                            "space_ids": wall.get("space_ids", []),
                            "wall_kind": wall.get("kind"),
                        }
                    },
                    confidence=command.confidence,
                    reason="delete selected wall and heal adjacent spaces",
                )
            ],
            requires_clarification=False,
            clarification_question=None,
        )

    if command.action == "create_wall":
        target_ids = _find_space_ids(command.target_room_name)
        if not target_ids:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_TMPL_ROOM_NOT_FOUND.format(name=command.target_room_name),
            )
        locked_candidate = _choose_locked_partition_candidate(
            command=command,
            ifc_context=ifc_context or {},
        ) if ifc_context is not None else None
        if (
            len(target_ids) != 1
            or target_ids[0] != _LOCKED_PARTITION_WALL_CANDIDATE["room_id"]
            or locked_candidate is None
        ):
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_CREATE_WALL_NO_VALIDATED_CANDIDATE,
            )
        storey_id = _find_storey_id(_LOCKED_PARTITION_WALL_CANDIDATE["floor"])
        if storey_id is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_TMPL_STOREY_NOT_FOUND.format(name=command.target_room_name),
            )
        return CommandBatch(
            commands=[
                IFCCommand(
                    action=ActionType.CREATE_WALL,
                    target_id=None,
                    params={
                        "entity_type": "Wall",
                        "metadata": {
                            "storey_id": storey_id,
                            "template_wall_id": locked_candidate["template_wall_id"],
                            "candidate_room_id": locked_candidate["room_id"],
                            "endpoint_connections": locked_candidate["endpoint_connections"],
                            "allowed_intervals_mm": locked_candidate["allowed_intervals_mm"],
                        },
                        "start_mm": dict(locked_candidate["start_mm"]),
                        "end_mm": dict(locked_candidate["end_mm"]),
                        "dimensions_mm": {
                            "width": locked_candidate["width_mm"],
                            "height": locked_candidate["height_mm"],
                        },
                        "properties": {
                            "name": "거실 가벽",
                        },
                    },
                    confidence=command.confidence,
                    reason="create locked House_KR partition wall candidate",
                )
            ],
            requires_clarification=False,
        )

    if command.action == "add_room":
        if command.new_room is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_ADD_ROOM_MISSING,
            )

        if command.new_room.rects is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_ADD_ROOM_NO_RECTS,
            )

        storey_id = _find_storey_id(command.new_room.floor)
        if ifc_context and storey_id is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_TMPL_FLOOR_NOT_FOUND.format(floor=command.new_room.floor),
            )
        start_mm = (0.0, 0.0)
        if ifc_context is not None:
            suggested_start = suggest_add_room_start_mm(
                ifc_context,
                floor=command.new_room.floor,
                width=command.new_room.width,
                height=command.new_room.height,
            )
            if suggested_start is not None:
                start_mm = suggested_start

        return validate_command_batch(CommandBatch(
            commands=[
                IFCCommand(
                    action=ActionType.CREATE_SPACE,
                    target_id=None,
                    params={
                        "entity_type": "Space",
                        "metadata": {
                            "storey_id": storey_id,
                        },
                        "geometry": {
                            "location": [start_mm[0], start_mm[1], 0.0],
                            "direction": [1.0, 0.0, 0.0],
                            "dimensions": {
                                "width": command.new_room.width,
                                "height": command.new_room.height,
                            },
                        },
                        "properties": {
                            "name": command.new_room.name,
                            "type": command.new_room.type,
                            "shape": command.new_room.shape,
                            "rects": command.new_room.rects,
                        },
                    },
                    confidence=command.confidence,
                )
            ],
            requires_clarification=False,
        ))

    if command.action == "insert_toilet":
        if ifc_context is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="IFC context가 없어 화장실 추가 계획을 만들 수 없습니다.",
            )

        floor = command.target_floor or 1
        plan = build_toilet_insertion_geometry_plan(
            ifc_context,
            floor=floor,
            anchor_room_name=command.target_room_name,
            user_intent=cast(
                ToiletDemoUserIntent,
                command.user_intent.value
                if command.user_intent is not None
                else "shared_toilet_any_strategy",
            ),
        )
        if plan is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=(
                    "현재 조건에서는 화장실을 만들 수 있는 인접 공간을 찾지 못했습니다."
                ),
            )
        if plan.get("status") == "needs_clarification":
            questions = plan.get("clarification_questions") or [
                "공용 화장실 배치를 위해 추가 확인이 필요합니다."
            ]
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=questions[0],
            )
        if plan.get("status") == "rejected":
            reason = (plan.get("validation_errors") or ["화장실 배치가 불가능합니다."])[0]
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=reason,
            )

        storey_id = _find_storey_id(floor)
        return CommandBatch(
            commands=[
                IFCCommand(
                    action=ActionType.UPDATE_SPACE,
                    target_id=plan["donor_room_id"],
                    params={
                        "entity_type": "Space",
                        "metadata": {"storey_id": storey_id, "scenario": "insert_toilet"},
                        "properties": {"polygon_mm": plan["donor_polygon_after_world_mm"]},
                    },
                    confidence=command.confidence,
                ),
                IFCCommand(
                    action=ActionType.CREATE_SPACE,
                    target_id=None,
                    params={
                        "entity_type": "Space",
                        "metadata": {"storey_id": storey_id, "scenario": "insert_toilet"},
                        "geometry": {
                            "location": [0.0, 0.0, 0.0],
                            "direction": [1.0, 0.0, 0.0],
                            "dimensions": {
                                "width": plan["preferred_width_mm"],
                                "height": plan["preferred_height_mm"],
                            },
                        },
                        "properties": {
                            "name": plan["toilet_name"],
                            "type": "bathroom",
                            "shape": "rect",
                            "polygon_mm": plan["toilet_local_polygon_mm"],
                        },
                    },
                    confidence=command.confidence,
                ),
            ],
            requires_clarification=False,
        )

    if command.action == "remove_room":
        target_ids = _find_space_ids(command.target_room_name)
        if not target_ids:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_TMPL_ROOM_NOT_FOUND.format(name=command.target_room_name),
            )

        if ifc_context:
            spaces = ifc_context.get("spaces", [])
            target_spaces = [space for space in spaces if space.get("id") in target_ids]
            if any(space.get("locked") or False for space in target_spaces):
                return CommandBatch(
                    commands=[],
                    requires_clarification=True,
                    clarification_question=_TMPL_LOCKED_DELETE.format(name=command.target_room_name),
                )

        if len(target_ids) > 1 and not command.apply_to_all:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_DUPLICATE_REMOVE,
            )

        if ifc_context and any(_find_storey_id_for_space(tid) is None for tid in target_ids):
            if len(target_ids) == 1:
                # 단일 대상인데 storey 정보를 찾지 못하면 불완전한 IFC 데이터다.
                # 이 경우 FastAPI 레이어에서 500으로 처리되도록 의도적으로 예외를 올린다.
                raise RuntimeError(
                    _TMPL_STOREY_MISSING_ERROR.format(name=command.target_room_name)
                )
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_TMPL_STOREY_NOT_FOUND.format(name=command.target_room_name),
            )

        commands = [
            IFCCommand(
                action=ActionType.DELETE_SPACE,
                target_id=tid,
                params={
                    "entity_type": "Space",
                    "metadata": {
                        "storey_id": _find_storey_id_for_space(tid),
                    },
                    "properties": {
                        "name": command.target_room_name,
                    },
                },
                confidence=command.confidence,
            )
            for tid in target_ids
        ]
        return CommandBatch(
            commands=commands,
            requires_clarification=False,
        )

    if command.action == "resize_room":
        target_ids = _find_space_ids(command.target_room_name)
        if not target_ids:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_TMPL_ROOM_NOT_FOUND.format(name=command.target_room_name),
            )

        if ifc_context:
            spaces = ifc_context.get("spaces", [])
            target_spaces = [space for space in spaces if space.get("id") in target_ids]
            if any(space.get("locked") or False for space in target_spaces):
                return CommandBatch(
                    commands=[],
                    requires_clarification=True,
                    clarification_question=_TMPL_LOCKED_RESIZE.format(name=command.target_room_name),
                )

        if len(target_ids) > 1 and not command.apply_to_all:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_DUPLICATE_RESIZE,
            )

        if (
            command.resize_rects is None
            or command.resize_width is None
            or command.resize_height is None
        ):
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_MSG_RESIZE_MISSING_DIMS,
            )

        if ifc_context and any(_find_storey_id_for_space(tid) is None for tid in target_ids):
            if len(target_ids) == 1:
                # 단일 대상인데 storey 정보를 찾지 못하면 불완전한 IFC 데이터다.
                # 이 경우 FastAPI 레이어에서 500으로 처리되도록 의도적으로 예외를 올린다.
                raise RuntimeError(
                    _TMPL_STOREY_MISSING_ERROR.format(name=command.target_room_name)
                )
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_TMPL_STOREY_NOT_FOUND.format(name=command.target_room_name),
            )

        commands = [
            IFCCommand(
                action=ActionType.UPDATE_SPACE,
                target_id=tid,
                params={
                    "entity_type": "Space",
                    "metadata": {
                        "storey_id": _find_storey_id_for_space(tid),
                    },
                    "geometry": {
                        "location": [0.0, 0.0, 0.0],
                        "direction": [1.0, 0.0, 0.0],
                        "dimensions": {
                            "width": command.resize_width,
                            "height": command.resize_height,
                        },
                    },
                    "properties": {
                        "shape": command.resize_shape,
                        "rects": command.resize_rects,
                    },
                },
                confidence=command.confidence,
            )
            for tid in target_ids
        ]
        return validate_command_batch(CommandBatch(
            commands=commands,
            requires_clarification=False,
        ))

    if command.action == "set_adjacency":
        return CommandBatch(
            commands=[],
            requires_clarification=True,
            clarification_question=_MSG_ADJACENCY_UNSUPPORTED,
        )

    if command.action in ("lock_room", "unlock_room"):
        return CommandBatch(
            commands=[],
            requires_clarification=True,
            clarification_question=_MSG_LOCK_APP_ONLY,
        )

    return CommandBatch(
        commands=[],
        requires_clarification=True,
        clarification_question=_MSG_UNSUPPORTED_ACTION,
    )
