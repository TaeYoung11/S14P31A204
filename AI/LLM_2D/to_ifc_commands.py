from typing import Dict, Optional

from models import FloorNLPCommand, ActionType, IFCCommand, CommandBatch


def to_ifc_commands(
    command: FloorNLPCommand,
    ifc_context: Optional[Dict] = None,
) -> CommandBatch:
    def _find_space_ids(target_name: Optional[str]) -> list[str]:
        if not ifc_context or not target_name:
            return []
        spaces = ifc_context.get("spaces", [])
        return [
            space.get("id")
            for space in spaces
            if space.get("name") == target_name and space.get("id")
        ]

    def _find_storey_id(floor: int) -> Optional[str]:
        """층 번호로 IfcBuildingStorey GlobalId를 조회한다."""
        if not ifc_context:
            return None
        for storey in ifc_context.get("storeys", []):
            if storey.get("floor") == floor:
                return storey.get("id")
        return None

    def _find_storey_id_for_space(space_id: str) -> Optional[str]:
        """space GlobalId로 해당 공간의 storey GlobalId를 조회한다."""
        if not ifc_context:
            return None
        for space in ifc_context.get("spaces", []):
            if space.get("id") == space_id:
                return _find_storey_id(space.get("floor", 1))
        return None

    if command.needs_clarification:
        return CommandBatch(
            commands=[],
            requires_clarification=True,
            clarification_question=command.clarification_question or "더 구체적으로 설명해주세요.",
        )

    if command.action == "add_room":
        if command.new_room is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="추가할 방 정보가 부족합니다.",
            )

        if command.new_room.rects is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="방 형태와 크기 정보가 부족합니다. 예: 직사각형 4000x5000",
            )

        return CommandBatch(
            commands=[
                IFCCommand(
                    action=ActionType.CREATE_SPACE,
                    target_id=None,
                    params={
                        "entity_type": "Space",
                        "metadata": {
                            "storey_id": _find_storey_id(command.new_room.floor),
                        },
                        "geometry": {
                            "location": [0.0, 0.0, 0.0],
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
        )

    if command.action == "remove_room":
        target_ids = _find_space_ids(command.target_room_name)
        if not target_ids:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question=f"'{command.target_room_name}' 방을 현재 IFC에서 찾을 수 없습니다.",
            )

        if len(target_ids) > 1 and not command.apply_to_all:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="같은 이름의 방이 여러 개 있습니다. 몇 층 방을 삭제할까요?",
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
                clarification_question=f"'{command.target_room_name}' 방을 현재 IFC에서 찾을 수 없습니다.",
            )

        if len(target_ids) > 1 and not command.apply_to_all:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="같은 이름의 방이 여러 개 있습니다. 몇 층 방을 변경할까요?",
            )

        if command.resize_rects is None or command.resize_width is None or command.resize_height is None:
            return CommandBatch(
                commands=[],
                requires_clarification=True,
                clarification_question="변경할 방 형태와 크기 정보가 부족합니다. 예: L자 6000x8000",
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
        return CommandBatch(
            commands=commands,
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
