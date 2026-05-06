from .command import ActionType, CommandBatch, FloorNLPCommand, IFCCommand, IFCContext
from .add_room_placement import suggest_add_room_start_mm
from .validator import validate_command_batch

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


def to_ifc_commands(
    command: FloorNLPCommand,
    ifc_context: IFCContext | None = None,
) -> CommandBatch:
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

    if command.needs_clarification:
        return CommandBatch(
            commands=[],
            requires_clarification=True,
            clarification_question=command.clarification_question or _MSG_DEFAULT_CLARIFICATION,
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
        if ifc_context is not None and ifc_context.get("boundaries"):
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
