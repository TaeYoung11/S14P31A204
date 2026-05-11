from typing import Any

from .command import ActionType, CommandBatch, FloorNLPCommand, IFCCommand, IFCContext
from .add_room_placement import suggest_add_room_start_mm
from .toilet_demo import build_toilet_insertion_geometry_plan
from .validator import validate_command_batch

_MSG_CREATE_WALL_NO_VALIDATED_CANDIDATE = (
    "? ??? ??? ???? ?? ???? ?? ???? ???. "
    "?? ????? ?? ??? ???? ??? ???? ????."
)

# ---------------------------------------------------------------------------
# 사용자 안내 메시지 상수
# ---------------------------------------------------------------------------
_MSG_DEFAULT_CLARIFICATION = "더 구체적으로 설명해주세요."
_MSG_ADD_ROOM_MISSING = "추가할 방 정보가 부족합니다."
_MSG_ADD_ROOM_NO_RECTS = "방 형태와 크기 정보가 부족합니다. 예: 직사각형 4000x5000"
_MSG_RESIZE_MISSING_DIMS = "변경할 방 형태와 크기 정보가 부족합니다. 예: L자 6000x8000"
_MSG_DUPLICATE_REMOVE = "같은 이름의 방이 여러 개 있습니다. 몇 층 방을 삭제할까요?"
_MSG_DUPLICATE_RESIZE = "같은 이름의 방이 여러 개 있습니다. 몇 층 방을 변경할까요?"
_MSG_ADJACENCY_UNSUPPORTED = "인접 설정은 현재 지원하지 않습니다."
_MSG_LOCK_APP_ONLY = "잠금 기능은 앱에서 직접 처리됩니다."
_MSG_UNSUPPORTED_ACTION = "지원하지 않는 명령입니다."

# 방 이름/층 번호를 포함하는 템플릿 (str.format 사용)
_TMPL_ROOM_NOT_FOUND = "'{name}' 방을 현재 IFC에서 찾을 수 없습니다."
_TMPL_FLOOR_NOT_FOUND = "{floor}층 정보를 현재 IFC에서 찾을 수 없습니다."
_TMPL_LOCKED_DELETE = "'{name}' 방은 잠겨 있어 삭제할 수 없습니다."
_TMPL_LOCKED_RESIZE = "'{name}' 방은 잠겨 있어 크기를 변경할 수 없습니다."
_TMPL_STOREY_NOT_FOUND = "'{name}' 방의 층 정보를 현재 IFC에서 찾을 수 없습니다."
_TMPL_STOREY_MISSING_ERROR = "IFC 데이터 오류: '{name}' 방의 storey 정보가 누락됨."
_MSG_CREATE_WALL_DEMO_ONLY = "현재 데모에서는 House_KR 거실 가벽 시나리오만 지원합니다."

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


def _host_wall_axis_interval(wall: dict[str, Any]) -> tuple[float, float]:
    start = wall["start"]
    end = wall["end"]
    if abs(float(end[0]) - float(start[0])) >= abs(float(end[1]) - float(start[1])):
        return (min(float(start[0]), float(end[0])), max(float(start[0]), float(end[0])))
    return (min(float(start[1]), float(end[1])), max(float(start[1]), float(end[1])))


def _opening_like_intervals(
    *,
    host_wall_id: str,
    ifc_context: IFCContext,
) -> list[tuple[float, float]]:
    intervals: list[tuple[float, float]] = []
    for collection_name in ("doors", "windows", "openings"):
        for item in ifc_context.get(collection_name, []):
            if item.get("host_wall_id") != host_wall_id:
                continue
            position = float(item.get("position") or 0.0)
            width = float(item.get("width") or 0.0)
            if width <= 0.0:
                continue
            intervals.append((position, position + width))
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

    if command.target_floor != _LOCKED_PARTITION_WALL_CANDIDATE["floor"]:
        return None
    spaces = ifc_context.get("spaces", [])
    room = next(
        (
            space
            for space in spaces
            if space.get("id") == _LOCKED_PARTITION_WALL_CANDIDATE["room_id"]
        ),
        None,
    )
    if room is None:
        return None
    if command.target_room_name != room.get("name"):
        return None
    wall_by_id = {wall["id"]: wall for wall in ifc_context.get("walls", [])}
    bottom_wall = wall_by_id.get(_LOCKED_PARTITION_WALL_CANDIDATE["bottom_host_wall_id"])
    top_wall = wall_by_id.get(_LOCKED_PARTITION_WALL_CANDIDATE["top_host_wall_id"])
    if bottom_wall is None or top_wall is None:
        return None

    room_min_x = min(float(point[0]) for point in room["polygon"])
    room_max_x = max(float(point[0]) for point in room["polygon"])
    bottom_min, bottom_max = _host_wall_axis_interval(bottom_wall)
    top_min, top_max = _host_wall_axis_interval(top_wall)
    allowed = [(
        max(
            room_min_x,
            bottom_min,
            top_min,
            room_min_x + _LOCKED_PARTITION_WALL_CANDIDATE["corner_margin_mm"],
        ),
        min(
            room_max_x,
            bottom_max,
            top_max,
            room_max_x - _LOCKED_PARTITION_WALL_CANDIDATE["corner_margin_mm"],
        ),
    )]
    allowed = [(start, end) for start, end in allowed if end - start > 0.0]
    if not allowed:
        return None

    margin = _LOCKED_PARTITION_WALL_CANDIDATE["opening_margin_mm"]
    for interval in _opening_like_intervals(
        host_wall_id=bottom_wall["id"],
        ifc_context=ifc_context,
    ):
        allowed = _subtract_interval(allowed, (interval[0] - margin, interval[1] + margin))
    for interval in _opening_like_intervals(
        host_wall_id=top_wall["id"],
        ifc_context=ifc_context,
    ):
        allowed = _subtract_interval(allowed, (interval[0] - margin, interval[1] + margin))
    if not allowed:
        return None

    start, end = max(allowed, key=lambda interval: interval[1] - interval[0])
    candidate_x = round((start + end) / 2.0, 3)
    return {
        **_LOCKED_PARTITION_WALL_CANDIDATE,
        "candidate_x_mm": candidate_x,
        "allowed_intervals_mm": allowed,
        "start_mm": {
            "x": candidate_x,
            "y": _LOCKED_PARTITION_WALL_CANDIDATE["start_y_mm"],
            "z": 0.0,
        },
        "end_mm": {
            "x": candidate_x,
            "y": _LOCKED_PARTITION_WALL_CANDIDATE["end_y_mm"],
            "z": 0.0,
        },
    }


def to_ifc_commands(
    command: FloorNLPCommand,
    ifc_context: IFCContext | None = None,
) -> CommandBatch:
    def _find_wall(wall_id: str | None) -> dict[str, Any] | None:
        if not ifc_context or not wall_id:
            return None
        return next(
            (wall for wall in ifc_context.get("walls", []) if wall.get("id") == wall_id),
            None,
        )

    def _find_space_ids(target_name: str | None) -> list[str]:
        if not ifc_context or not target_name:
            return []
        spaces = ifc_context.get("spaces", [])
        matched = [
            space for space in spaces
            if space.get("name") == target_name and space.get("id")
        ]
        # target_floor가 명시된 경우 해당 층만 반환
        if command.target_floor is not None:
            matched = [s for s in matched if s.get("floor") == command.target_floor]
        return [s.get("id") for s in matched]

    def _find_storey_id(floor: int) -> str | None:
        """층 번호로 IfcBuildingStorey GlobalId를 조회한다."""
        if not ifc_context:
            return None
        for storey in ifc_context.get("storeys", []):
            if storey.get("floor") == floor:
                return storey.get("id")
        return None

    def _find_storey_id_for_space(space_id: str) -> str | None:
        """space GlobalId로 해당 공간의 storey GlobalId를 조회한다."""
        if not ifc_context:
            return None
        for space in ifc_context.get("spaces", []):
            if space.get("id") == space_id:
                floor_num = space.get("floor")
                if floor_num is None:
                    return None
                return _find_storey_id(floor_num)
        return None

    def _find_storey_id_for_wall(wall_id: str | None) -> str | None:
        wall = _find_wall(wall_id)
        if wall is None:
            return None
        floor_num = wall.get("floor")
        if floor_num is None:
            return None
        return _find_storey_id(int(floor_num))

    if command.needs_clarification:
        return CommandBatch(
            commands=[],
            requires_clarification=True,
            clarification_question=command.clarification_question or _MSG_DEFAULT_CLARIFICATION,
        )

    if command.action == "create_door":
        wall = _find_wall(command.target_wall_id)
        if wall is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="선택한 벽을 IFC context에서 찾지 못했습니다.",
            )
        storey_id = _find_storey_id_for_wall(command.target_wall_id)
        if storey_id is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=_TMPL_STOREY_NOT_FOUND.format(name=command.target_wall_id),
            )
        start = wall["start"]
        end = wall["end"]
        mid_x = (float(start[0]) + float(end[0])) / 2.0
        mid_y = (float(start[1]) + float(end[1])) / 2.0
        width_mm = int(command.element_width_mm or 900)
        height_mm = int(command.element_height_mm or 2100)
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
                            "location": [mid_x, mid_y, 0.0],
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
                            "location": [float(start_mm[0]), float(start_mm[1]), 0.0],
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
                clarification_question="IFC context 없이 화장실 추가 계획을 만들 수 없습니다.",
            )

        floor = command.target_floor or 1
        plan = build_toilet_insertion_geometry_plan(
            ifc_context,
            floor=floor,
            anchor_room_name=command.target_room_name,
            user_intent=command.user_intent or "shared_toilet_any_strategy",
        )
        if plan is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=(
                    "욕실 옆에 화장실을 만들 수 있는 인접 공간을 찾지 못했습니다."
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
                # 단일 대상에서 storey 누락은 사용자가 해결할 수 없는 IFC 데이터
                # 무결성 문제다. FastAPI 레이어에서 500으로 처리되도록 의도적으로 예외를 던진다.
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
                # 단일 대상에서 storey 누락은 사용자가 해결할 수 없는 IFC 데이터
                # 무결성 문제다. FastAPI 레이어에서 500으로 처리되도록 의도적으로 예외를 던진다.
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
