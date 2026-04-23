import re
import uuid
from typing import Optional

from floor_models import AdjacencyEntry, FloorProject, Room, RoomType
from models import FloorNLPCommand


class ApplyCommandError(Exception):
    """apply_command 실행 중 발생하는 오류"""


def _normalize_room_name(name: str) -> str:
    return "".join(name.split())


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
) -> tuple[Optional[Room | list[Room]], Optional[str], Optional[list[Room]]]:
    search_space = project.rooms
    if floor is not None:
        search_space = [r for r in search_space if r.floor == floor]

    candidates = [r for r in search_space if r.name == name]

    if len(candidates) == 0:
        normalized_name = _normalize_room_name(name)
        candidates = [
            r
            for r in search_space
            if name in r.name
            or r.name in name
            or normalized_name in _normalize_room_name(r.name)
            or _normalize_room_name(r.name) in normalized_name
        ]

    if len(candidates) == 0:
        floor_str = f"{floor}층 " if floor is not None else ""
        return None, f"{floor_str}'{name}' 방을 찾을 수 없습니다.", None

    if len(candidates) > 1:
        if apply_to_all:
            return candidates, None, None
        room_info = [f"{r.floor}층 {r.name}" for r in candidates]
        return (
            None,
            f"'{', '.join(room_info)}'가 여러 개 있습니다. "
            f"어느 방을 수정할지 또는 '전체 수정'이라고 말씀해 주세요.",
            candidates,
        )

    return candidates[0], None, None


def apply_command(
    project: FloorProject,
    command: FloorNLPCommand,
) -> tuple[FloorProject, Optional[str], Optional[list[Room]]]:
    """
    FloorNLPCommand를 FloorProject에 적용한다.

    Returns:
        (수정된 project, 메시지 or None, 선택 후보 목록 or None)
    """
    if command.needs_clarification:
        question = command.clarification_question or "더 구체적으로 설명해주세요."
        return project, question, None

    try:
        if command.action == "add_room":
            if not command.new_room:
                raise ApplyCommandError("추가할 방 정보가 없습니다.")
            _validate_polygon(command.new_room.polygon, "방의")

            base_name = command.new_room.name
            existing_numbers = []
            for room in project.rooms:
                if room.floor != command.new_room.floor:
                    continue
                if not room.name.startswith(base_name):
                    continue
                match = re.match(rf"^{re.escape(base_name)}(\d+)$", room.name)
                if match:
                    existing_numbers.append(int(match.group(1)))

            next_number = max(existing_numbers, default=0) + 1
            new_name = f"{base_name}{next_number}"

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

            result, message, candidates = _find_room(
                project,
                command.target_room_name,
                floor=command.target_floor,
                apply_to_all=command.apply_to_all,
            )
            if message:
                return project, message, candidates

            rooms = result if isinstance(result, list) else [result]
            room_ids = {room.id for room in rooms}
            project.rooms = [room for room in project.rooms if room.id not in room_ids]
            project.adjacency = [
                adjacency
                for adjacency in project.adjacency
                if adjacency.from_room_id not in room_ids
                and adjacency.to_room_id not in room_ids
            ]

        elif command.action == "resize_room":
            if not command.target_room_name:
                raise ApplyCommandError("수정할 방 이름이 없습니다.")
            _validate_polygon(command.resize_polygon, "변경할")

            result, message, candidates = _find_room(
                project,
                command.target_room_name,
                floor=command.target_floor,
                apply_to_all=command.apply_to_all,
            )
            if message:
                return project, message, candidates

            rooms = result if isinstance(result, list) else [result]
            for room in rooms:
                room.polygon = command.resize_polygon

        elif command.action == "set_adjacency":
            if not command.target_room_name or not command.adjacency_target:
                raise ApplyCommandError("인접할 방 이름이 없습니다.")

            from_room, message, candidates = _find_room(
                project,
                command.target_room_name,
                floor=command.target_floor,
            )
            if message:
                return project, message, candidates

            to_room, message, candidates = _find_room(
                project,
                command.adjacency_target,
                floor=command.target_floor,
            )
            if message:
                return project, message, candidates

            strength = (
                command.adjacency_strength
                if command.adjacency_strength is not None
                else 1.0
            )

            existing = next(
                (
                    adjacency
                    for adjacency in project.adjacency
                    if (
                        adjacency.from_room_id == from_room.id
                        and adjacency.to_room_id == to_room.id
                    )
                    or (
                        adjacency.from_room_id == to_room.id
                        and adjacency.to_room_id == from_room.id
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

            result, message, candidates = _find_room(
                project,
                command.target_room_name,
                floor=command.target_floor,
                apply_to_all=command.apply_to_all,
            )
            if message:
                return project, message, candidates

            rooms = result if isinstance(result, list) else [result]
            for room in rooms:
                room.locked = True

        elif command.action == "unlock_room":
            if not command.target_room_name:
                raise ApplyCommandError("고정 해제할 방 이름이 없습니다.")

            result, message, candidates = _find_room(
                project,
                command.target_room_name,
                floor=command.target_floor,
                apply_to_all=command.apply_to_all,
            )
            if message:
                return project, message, candidates

            rooms = result if isinstance(result, list) else [result]
            for room in rooms:
                room.locked = False

    except ApplyCommandError as error:
        return project, str(error), None

    return project, None, None
