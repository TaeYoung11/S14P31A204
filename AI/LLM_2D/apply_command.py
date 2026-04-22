import uuid
from typing import Optional
from models import FloorNLPCommand
from floor_models import FloorProject, Room, AdjacencyEntry, RoomType


class ApplyCommandError(Exception):
    """apply_command 실행 중 발생하는 오류"""
    pass


def _find_room(
    project: FloorProject,
    name: str,
    floor: Optional[int] = None
) -> Room:
    """
    방 이름으로 찾기.
    floor 지정 시 해당 층만 검색.
    없거나 여러 개면 ApplyCommandError 발생.
    """
    candidates = [r for r in project.rooms if r.name == name]

    if floor is not None:
        candidates = [r for r in candidates if r.floor == floor]

    if len(candidates) == 0:
        floor_str = f"{floor}층 " if floor is not None else ""
        raise ApplyCommandError(f"{floor_str}'{name}' 방을 찾을 수 없어요.")

    if len(candidates) > 1:
        floors = [str(r.floor) for r in candidates]
        raise ApplyCommandError(
            f"'{name}' 방이 {', '.join(floors)}층에 여러 개 있어요. "
            f"몇 층 {name}을 수정할까요?"
        )

    return candidates[0]


def apply_command(
    project: FloorProject,
    command: FloorNLPCommand
) -> tuple[FloorProject, Optional[str]]:
    """
    FloorNLPCommand를 FloorProject에 적용.

    Returns:
        (수정된 project, 오류 메시지 or None)
    """
    if command.needs_clarification:
        return project, command.clarification_question

    try:
        if command.action == "add_room":
            if not command.new_room:
                raise ApplyCommandError("추가할 방 정보가 없어요.")
            if not command.new_room.polygon:
                raise ApplyCommandError("방의 polygon 정보가 없어요.")

            new_room = Room(
                id=str(uuid.uuid4()),
                name=command.new_room.name,
                type=RoomType(command.new_room.type),
                floor=command.new_room.floor,
                polygon=command.new_room.polygon,
                locked=False,
            )
            project.rooms.append(new_room)

        elif command.action == "remove_room":
            if not command.target_room_name:
                raise ApplyCommandError("삭제할 방 이름이 없어요.")

            room = _find_room(project, command.target_room_name, floor=command.target_floor)
            project.rooms = [r for r in project.rooms if r.id != room.id]
            # 관련 인접도도 제거
            project.adjacency = [
                a for a in project.adjacency
                if a.from_room_id != room.id and a.to_room_id != room.id
            ]

        elif command.action == "resize_room":
            if not command.target_room_name:
                raise ApplyCommandError("수정할 방 이름이 없어요.")
            if not command.resize_polygon:
                raise ApplyCommandError("변경할 polygon 정보가 없어요.")

            room = _find_room(project, command.target_room_name, floor=command.target_floor)
            room.polygon = command.resize_polygon

        elif command.action == "set_adjacency":
            if not command.target_room_name or not command.adjacency_target:
                raise ApplyCommandError("인접할 방 이름이 없어요.")

            from_room = _find_room(project, command.target_room_name, floor=command.target_floor)
            to_room = _find_room(project, command.adjacency_target, floor=command.target_floor)
            strength = command.adjacency_strength or 1.0

            existing = next(
                (a for a in project.adjacency
                 if a.from_room_id == from_room.id and a.to_room_id == to_room.id),
                None
            )
            if existing:
                existing.strength = strength
            else:
                project.adjacency.append(AdjacencyEntry(
                    from_room_id=from_room.id,
                    to_room_id=to_room.id,
                    strength=strength,
                ))

        elif command.action == "lock_room":
            if not command.target_room_name:
                raise ApplyCommandError("고정할 방 이름이 없어요.")
            room = _find_room(project, command.target_room_name, floor=command.target_floor)
            room.locked = True

        elif command.action == "unlock_room":
            if not command.target_room_name:
                raise ApplyCommandError("고정 해제할 방 이름이 없어요.")
            room = _find_room(project, command.target_room_name, floor=command.target_floor)
            room.locked = False

    except ApplyCommandError as e:
        return project, str(e)

    return project, None