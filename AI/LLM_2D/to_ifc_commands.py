from typing import Dict, Optional

from models import FloorNLPCommand, ActionType, IFCCommand, CommandBatch


def to_ifc_commands(
    command: FloorNLPCommand,
    ifc_context: Optional[Dict] = None,
) -> CommandBatch:
    def _find_space_id(target_name: Optional[str]) -> Optional[str]:
        if not ifc_context or not target_name:
            return None

        spaces = ifc_context.get("spaces", [])
        for space in spaces:
            if space.get("name") == target_name:
                return space.get("id")
        return None

    if command.needs_clarification:
        return CommandBatch(
            commands=[],
            requires_clarification=True,
            clarification_question=command.clarification_question,
        )

    if command.action == "add_room":
        if command.new_room is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="추가할 방 정보가 부족합니다.",
            )

        return CommandBatch(
            commands=[
                IFCCommand(
                    action=ActionType.CREATE_SPACE,
                    target_id=None,
                    params={
                        "name": command.new_room.name,
                        "type": command.new_room.type,
                        "floor": command.new_room.floor,
                        "rects": command.new_room.rects,
                    },
                    confidence=command.confidence,
                )
            ],
            requires_clarification=False,
        )

    if command.action == "remove_room":
        target_id = _find_space_id(command.target_room_name)
        if target_id is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=f"'{command.target_room_name}' 방을 현재 IFC에서 찾을 수 없습니다.",
            )

        return CommandBatch(
            commands=[
                IFCCommand(
                    action=ActionType.DELETE_SPACE,
                    target_id=target_id,
                    params={"name": command.target_room_name},
                    confidence=command.confidence,
                )
            ],
            requires_clarification=False,
        )

    if command.action == "resize_room":
        target_id = _find_space_id(command.target_room_name)
        if target_id is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=f"'{command.target_room_name}' 방을 현재 IFC에서 찾을 수 없습니다.",
            )

        return CommandBatch(
            commands=[
                IFCCommand(
                    action=ActionType.UPDATE_SPACE,
                    target_id=target_id,
                    params={
                        "rects": command.resize_rects,
                        "shape": command.resize_shape,
                        "width": command.resize_width,
                        "height": command.resize_height,
                    },
                    confidence=command.confidence,
                )
            ],
            requires_clarification=False,
        )

    if command.action == "set_adjacency":
        return CommandBatch(
            commands=[],
            requires_clarification=True,
            clarification_question="인접 설정은 현재 지원하지 않습니다.",
        )

    if command.action in ("lock_room", "unlock_room"):
        return CommandBatch(
            commands=[],
            requires_clarification=True,
            clarification_question="잠금 기능은 앱에서 직접 처리됩니다.",
        )

    return CommandBatch(
        commands=[],
        requires_clarification=True,
        clarification_question="지원하지 않는 명령입니다.",
    )
