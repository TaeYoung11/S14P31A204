import uuid
from typing import Optional
from floor_models import AdjacencyEntry, FloorProject, Room, RoomType
from models import FloorNLPCommand


class ApplyCommandError(Exception):
    """apply_command 실행 중 발생하는 오류"""


def _validate_polygon(polygon, field_name: str) -> None:
    if not polygon:
        raise ApplyCommandError(f"{field_name} polygon 정보가 없습니다.")
    if len(polygon) < 3:
        raise ApplyCommandError(f"{field_name} polygon은 점이 3개 이상이어야 합니다.")


def _find_room(
    project: FloorProject,
    name: str,
    floor: Optional[int] = None,
    apply_to_all: bool = False,
) -> Room | list[Room]:
    candidates = [r for r in project.rooms if r.name == name]

    if floor is not None:
        candidates = [r for r in candidates if r.floor == floor]

    if len(candidates) == 0:
        floor_str = f"{floor}층 " if floor is not None else ""
        raise ApplyCommandError(f"{floor_str}'{name}' 방을 찾을 수 없습니다.")

    if len(candidates) > 1:
        if apply_to_all:
            return candidates
        room_info = [f"{r.floor}층 {r.name}" for r in candidates]
        raise ApplyCommandError(
            f"'{', '.join(room_info)}'가 여러 개 있습니다. "
            f"어느 방을 수정할지 또는 '전체 수정'이라고 말씀해 주세요."
        )

    return candidates[0]


def apply_command(
    project: FloorProject,
    command: FloorNLPCommand,
) -> tuple[FloorProject, Optional[str]]:
    """
    FloorNLPCommand를 FloorProject에 적용한다.

    Returns:
        (수정된 project, 오류 메시지 or None)
    """
    if command.needs_clarification:
        return project, command.clarification_question

    try:
        if command.action == "add_room":
            if not command.new_room:
                raise ApplyCommandError("추가할 방 정보가 없습니다.")
            _validate_polygon(command.new_room.polygon, "방의")

            base_name = command.new_room.name
            same_name_same_floor = [
                r
                for r in project.rooms
                if r.name.startswith(base_name) and r.floor == command.new_room.floor
            ]
            count = len(same_name_same_floor) + 1
            new_name = f"{base_name}{count}"

            new_room = Room(
                id=str(uuid.uuid4()),
                name=new_name,
                type=RoomType(command.new_room.type),
                floor=command.new_room.floor,
                polygon=command.new_room.polygon,
                locked=False,
            )
            project.rooms.append(new_room)

        elif command.action == "remove_room":
            if not command.target_room_name:
                raise ApplyCommandError("삭제할 방 이름이 없습니다.")

            result = _find_room(
                project,
                command.target_room_name,
                floor=command.target_floor,
                apply_to_all=command.apply_to_all,
            )
            rooms = result if isinstance(result, list) else [result]
            room_ids = {r.id for r in rooms}
            project.rooms = [r for r in project.rooms if r.id not in room_ids]
            project.adjacency = [
                a
                for a in project.adjacency
                if a.from_room_id not in room_ids and a.to_room_id not in room_ids
            ]

        elif command.action == "resize_room":
            if not command.target_room_name:
                raise ApplyCommandError("수정할 방 이름이 없습니다.")
            _validate_polygon(command.resize_polygon, "변경할")

            result = _find_room(
                project,
                command.target_room_name,
                floor=command.target_floor,
                apply_to_all=command.apply_to_all,
            )
            rooms = result if isinstance(result, list) else [result]
            for room in rooms:
                room.polygon = command.resize_polygon

        elif command.action == "set_adjacency":
            if not command.target_room_name or not command.adjacency_target:
                raise ApplyCommandError("인접할 방 이름이 없습니다.")

            from_room = _find_room(
                project,
                command.target_room_name,
                floor=command.target_floor,
            )
            to_room = _find_room(
                project,
                command.adjacency_target,
                floor=command.target_floor,
            )
            strength = (
                command.adjacency_strength
                if command.adjacency_strength is not None
                else 1.0
            )

            existing = next(
                (
                    a
                    for a in project.adjacency
                    if (
                        a.from_room_id == from_room.id
                        and a.to_room_id == to_room.id
                    )
                    or (
                        a.from_room_id == to_room.id
                        and a.to_room_id == from_room.id
                    )
                ),
                None,
            )
            if existing:
                existing.strength = strength
            else:
                project.adjacency.append(
                    AdjacencyEntry(
                        from_room_id=from_room.id,
                        to_room_id=to_room.id,
                        strength=strength,
                    )
                )

        elif command.action == "lock_room":
            if not command.target_room_name:
                raise ApplyCommandError("고정할 방 이름이 없습니다.")
            result = _find_room(
                project,
                command.target_room_name,
                floor=command.target_floor,
                apply_to_all=command.apply_to_all,
            )
            rooms = result if isinstance(result, list) else [result]
            for room in rooms:
                room.locked = True

        elif command.action == "unlock_room":
            if not command.target_room_name:
                raise ApplyCommandError("고정 해제할 방 이름이 없습니다.")
            result = _find_room(
                project,
                command.target_room_name,
                floor=command.target_floor,
                apply_to_all=command.apply_to_all,
            )
            rooms = result if isinstance(result, list) else [result]
            for room in rooms:
                room.locked = False

    except ApplyCommandError as e:
        return project, str(e)

    return project, None