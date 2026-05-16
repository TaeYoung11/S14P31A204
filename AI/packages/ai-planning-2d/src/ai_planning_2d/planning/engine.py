"""자연어로 들어온 평면 편집 요청을 구조화된 2D 명령으로 해석한다."""

from __future__ import annotations

import json
import os
import re
from typing import Literal

import instructor
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from ..command import FloorNLPCommand, IFCContext, SpaceContext
from ..utils import shape_to_rects

ResizeDirection = Literal["north", "south", "east", "west"]
_FLOOR_NUMBER_PATTERN = re.compile(r"(\d+)\s*층")

# 상대적 크기 표현 → 배율 (우선순위 순서로 정렬)
_RELATIVE_SIZE_PATTERNS: list[tuple[str, float]] = [
    (r"절반", 0.5),
    (r"두\s*배", 2.0),
    (r"많이|훨씬", 1.3),
    (r"조금", 1.1),
    (r"더\s*(넓게|크게|길게|높게)", 1.2),
]

_ROOM_NAME_TYPE_HINTS: list[tuple[str, str, str]] = [
    ("거실", "거실", "living"),
    ("침실", "침실", "bedroom"),
    ("안방", "안방", "bedroom"),
    ("방", "방", "bedroom"),
    ("주방", "주방", "kitchen"),
    ("부엌", "부엌", "kitchen"),
    ("욕실", "욕실", "bathroom"),
    ("화장실", "화장실", "bathroom"),
    ("서재", "서재", "office"),
    ("사무실", "사무실", "office"),
    ("복도", "복도", "corridor"),
]

_REMOVE_ROOM_PATTERNS: tuple[str, ...] = ("없애줘", "삭제해줘", "제거해줘", "지워줘")
_NON_REMOVE_INTENT_KEYWORDS: tuple[str, ...] = (
    "추가",
    "바꿔",
    "변경",
    "늘려",
    "줄여",
    "인접",
    "잠가",
    "잠금",
)

_RESIZE_DIRECTION_HINTS: tuple[tuple[str, ResizeDirection], ...] = (
    ("동쪽", "east"),
    ("오른쪽", "east"),
    ("우측", "east"),
    ("서쪽", "west"),
    ("왼쪽", "west"),
    ("좌측", "west"),
    ("북쪽", "north"),
    ("위쪽", "north"),
    ("상단", "north"),
    ("윗쪽", "north"),
    ("남쪽", "south"),
    ("아래쪽", "south"),
    ("하단", "south"),
    ("밑쪽", "south"),
)


_CREATE_DOOR_KEYWORDS: tuple[str, ...] = ("문", "door")
_CREATE_DOOR_ACTION_HINTS: tuple[str, ...] = ("만들", "추가", "뚫")
_DELETE_VOID_KEYWORDS: tuple[str, ...] = ("삭제", "제거", "없애", "지워")
_CREATE_WALL_KEYWORDS: tuple[str, ...] = ("가벽", "벽", "partition", "wall")
_CREATE_WALL_ACTION_HINTS: tuple[str, ...] = ("세워", "만들", "추가", "설치")


def _maybe_parse_generic_room_change_clarification(user_text: str) -> FloorNLPCommand | None:
    if "방" not in user_text:
        return None
    if not any(keyword in user_text for keyword in ("바꿔", "수정", "변경")):
        return None
    if any(keyword in user_text for keyword in ("문", "창", "wall", "door", "window")):
        return None
    return FloorNLPCommand(
        action="add_room",
        confidence=0.2,
        needs_clarification=True,
        clarification_question="어떤 방을 어떻게 바꿀지 더 구체적으로 말씀해주세요.",
    )


def _infer_resize_direction(user_text: str) -> ResizeDirection | None:
    for keyword, direction in _RESIZE_DIRECTION_HINTS:
        if keyword in user_text:
            return direction
    return None


def _resolve_space_for_user_text(
    user_text: str,
    ifc_context: IFCContext | None,
) -> SpaceContext | None:
    if ifc_context is None:
        return None

    spaces = ifc_context.get("spaces", [])
    exact_matches = [space for space in spaces if space.get("name") and space["name"] in user_text]
    if len(exact_matches) == 1:
        return exact_matches[0]

    inferred_name, _ = _infer_room_name_and_type(user_text)
    if inferred_name is None:
        return None
    return next((space for space in spaces if space.get("name") == inferred_name), None)


def _extract_target_floor(user_text: str) -> int | None:
    match = _FLOOR_NUMBER_PATTERN.search(user_text)
    if match is None:
        return None
    return int(match.group(1))


def _selected_wall_id_from_text(
    user_text: str,
    ifc_context: IFCContext | None,
) -> str | None:
    if ifc_context is None:
        return None
    wall_ids = {
        wall.get("id")
        for wall in ifc_context.get("walls", [])
        if isinstance(wall.get("id"), str)
    }
    for match in re.findall(r"\[([^\]]+)\]", user_text):
        candidate = match.strip()
        if candidate in wall_ids:
            return candidate
    return None


def _extract_recent_user_remove_target(
    conversation_history: list[ChatCompletionMessageParam] | None,
    ifc_context: IFCContext | None,
) -> tuple[str | None, int | None]:
    if not conversation_history:
        return (None, None)

    for entry in reversed(conversation_history):
        if entry.get("role") != "user":
            continue
        content = entry.get("content")
        if not isinstance(content, str):
            continue
        simple_remove = _maybe_parse_simple_remove_command(content) or _maybe_parse_remove_command_v2(
            content
        )
        if simple_remove is not None:
            return simple_remove.target_room_name, simple_remove.target_floor
        resolved_space = _resolve_space_for_user_text(content, ifc_context)
        if resolved_space is not None:
            return resolved_space.get("name"), resolved_space.get("floor")
    return (None, None)


def _conversation_is_remove_clarification(
    conversation_history: list[ChatCompletionMessageParam] | None,
) -> bool:
    if not conversation_history:
        return False

    recent_messages = conversation_history[-4:]
    assistant_mentions_remove = any(
        entry.get("role") == "assistant"
        and isinstance(entry.get("content"), str)
        and (
            ("삭제" in entry["content"] and "층" in entry["content"])
            or "몇 층 방" in entry["content"]
        )
        for entry in recent_messages
    )
    user_mentions_remove = any(
        entry.get("role") == "user"
        and isinstance(entry.get("content"), str)
        and any(keyword in entry["content"] for keyword in ("삭제", "지워", "없애"))
        for entry in recent_messages
    )
    return assistant_mentions_remove and user_mentions_remove


def _recover_followup_remove_command(
    user_text: str,
    ifc_context: IFCContext | None,
    conversation_history: list[ChatCompletionMessageParam] | None,
) -> FloorNLPCommand | None:
    if not _conversation_is_remove_clarification(conversation_history):
        return None

    target_floor = _extract_target_floor(user_text)
    resolved_space = _resolve_space_for_user_text(user_text, ifc_context)
    target_room_name = resolved_space.get("name") if resolved_space is not None else None

    if target_room_name is None:
        inferred_name, _ = _infer_room_name_and_type(user_text)
        target_room_name = inferred_name

    previous_target_name, previous_target_floor = _extract_recent_user_remove_target(
        conversation_history,
        ifc_context,
    )
    target_room_name = target_room_name or previous_target_name
    target_floor = target_floor or previous_target_floor

    if target_room_name is None:
        return None

    return FloorNLPCommand(
        action="remove_room",
        target_room_name=target_room_name,
        target_floor=target_floor,
        confidence=0.96,
        needs_clarification=False,
        clarification_question=None,
    )


def _apply_relative_adjustment(
    command: FloorNLPCommand,
    user_text: str,
    ifc_context: IFCContext | None,
) -> FloorNLPCommand:
    """LLM이 상대적 크기를 적용하지 못한 경우 Python에서 직접 계산한다."""
    if command.action != "resize_room" or command.needs_clarification:
        return command
    if ifc_context is None or command.target_room_name is None:
        return command

    factor = None
    for pattern, f in _RELATIVE_SIZE_PATTERNS:
        if re.search(pattern, user_text):
            factor = f
            break

    if factor is None:
        return command

    spaces = ifc_context.get("spaces", [])
    current = next(
        (s for s in spaces if s.get("name") == command.target_room_name),
        None,
    )
    if current is None:
        return command

    current_w = current.get("width")
    current_h = current.get("height")
    if current_w is None or current_h is None:
        return command

    # LLM이 현재 치수를 그대로 반환했을 때만 보정한다
    if command.resize_width == current_w and command.resize_height == current_h:
        command.resize_width = int(current_w * factor)
        command.resize_height = int(current_h * factor)
        if command.resize_direction in {"east", "west"}:
            command.resize_height = current_h
        elif command.resize_direction in {"north", "south"}:
            command.resize_width = current_w

    return command


def _infer_room_name_and_type(
    user_text: str,
    target_room_name: str | None = None,
    room_type: str | None = None,
) -> tuple[str | None, str | None]:
    if target_room_name:
        for keyword, canonical_name, canonical_type in _ROOM_NAME_TYPE_HINTS:
            if keyword in target_room_name:
                return target_room_name, room_type or canonical_type
        return target_room_name, room_type

    for keyword, canonical_name, canonical_type in _ROOM_NAME_TYPE_HINTS:
        if keyword in user_text:
            return canonical_name, room_type or canonical_type

    return None, room_type


def _recover_command_from_exception(
    error: Exception,
    user_text: str,
    ifc_context: IFCContext | None,
) -> FloorNLPCommand | None:
    matches = re.findall(r"content='(\{.*?\})'", str(error), flags=re.DOTALL)
    if not matches:
        return None

    raw_json = matches[-1].replace("\\'", "'")
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError:
        return None

    if payload.get("action") == "add_room":
        new_room = payload.get("new_room")
        if isinstance(new_room, dict):
            name, room_type = _infer_room_name_and_type(
                user_text,
                target_room_name=payload.get("target_room_name"),
                room_type=new_room.get("type"),
            )
            if name and not new_room.get("name"):
                new_room["name"] = name
            if room_type and not new_room.get("type"):
                new_room["type"] = room_type
            payload["new_room"] = new_room

    try:
        command = FloorNLPCommand.model_validate(payload)
    except Exception:
        return None

    if command.action == "add_room" and command.new_room:
        command.new_room.rects = shape_to_rects(
            command.new_room.shape, command.new_room.width, command.new_room.height
        )

    if command.action == "resize_room":
        command = _apply_relative_adjustment(command, user_text, ifc_context)
        if command.resize_direction is None:
            command.resize_direction = _infer_resize_direction(user_text)
        if command.resize_width is not None and command.resize_height is not None:
            command.resize_rects = shape_to_rects(
                command.resize_shape, command.resize_width, command.resize_height
            )

    return command


def _recover_simple_remove_command(
    command: FloorNLPCommand,
    user_text: str,
) -> FloorNLPCommand:
    if not any(pattern in user_text for pattern in _REMOVE_ROOM_PATTERNS):
        return command
    if any(keyword in user_text for keyword in _NON_REMOVE_INTENT_KEYWORDS):
        return command
    if command.action == "remove_room" and command.target_room_name:
        return command

    target_name = None
    for pattern in _REMOVE_ROOM_PATTERNS:
        if pattern not in user_text:
            continue
        prefix = user_text.split(pattern, maxsplit=1)[0].strip()
        target_name = prefix.removesuffix("을").removesuffix("를").strip()
        break
    if not target_name:
        return command

    return FloorNLPCommand(
        action="remove_room",
        target_room_name=target_name,
        confidence=max(command.confidence, 0.8),
        needs_clarification=False,
        clarification_question=None,
    )


def _maybe_parse_simple_remove_command(user_text: str) -> FloorNLPCommand | None:
    if not any(pattern in user_text for pattern in _REMOVE_ROOM_PATTERNS):
        return None
    if any(keyword in user_text for keyword in _NON_REMOVE_INTENT_KEYWORDS):
        return None

    target_name = None
    for pattern in _REMOVE_ROOM_PATTERNS:
        if pattern not in user_text:
            continue
        prefix = user_text.split(pattern, maxsplit=1)[0].strip()
        target_name = prefix.removesuffix("을").removesuffix("를").strip()
        break
    if not target_name:
        return None

    return FloorNLPCommand(
        action="remove_room",
        target_room_name=target_name,
        confidence=0.9,
        needs_clarification=False,
        clarification_question=None,
    )


def _maybe_parse_explicit_merge_remove_command(
    user_text: str,
    ifc_context: IFCContext | None,
) -> FloorNLPCommand | None:
    match = re.search(
        r"(?P<target>.+?)(?:을|를)\s*(?P<merge>.+?)(?:와|과|랑|이랑)\s*(?:합쳐줘|통합해줘)",
        user_text,
    )
    if match is None:
        return None

    target_phrase = match.group("target").strip()
    merge_phrase = match.group("merge").strip()
    if not target_phrase or not merge_phrase:
        return None

    target_space = _resolve_space_for_user_text(target_phrase, ifc_context)
    merge_space = _resolve_space_for_user_text(merge_phrase, ifc_context)
    target_name = target_space["name"] if target_space is not None else target_phrase
    merge_name = merge_space["name"] if merge_space is not None else merge_phrase

    return FloorNLPCommand(
        action="remove_room",
        target_room_name=target_name,
        target_floor=target_space.get("floor") if target_space is not None else None,
        adjacency_target=merge_name,
        confidence=0.92,
        needs_clarification=False,
        clarification_question=None,
    )


def _maybe_parse_simple_resize_command(
    user_text: str,
    ifc_context: IFCContext | None,
) -> FloorNLPCommand | None:
    if not any(keyword in user_text for keyword in ("넓혀", "확장", "키워", "커지")):
        return None
    if any(pattern in user_text for pattern in _REMOVE_ROOM_PATTERNS):
        return None

    target_space = _resolve_space_for_user_text(user_text, ifc_context)
    if target_space is None:
        return None

    width = target_space.get("width")
    height = target_space.get("height")
    direction = _infer_resize_direction(user_text)
    if width is None or height is None:
        return FloorNLPCommand(
            action="resize_room",
            target_room_name=target_space["name"],
            target_floor=target_space.get("floor"),
            resize_direction=direction,
            confidence=0.6,
            needs_clarification=True,
            clarification_question="현재 치수를 알 수 없어 구체적인 크기를 알려주세요.",
        )

    command = FloorNLPCommand(
        action="resize_room",
        target_room_name=target_space["name"],
        target_floor=target_space.get("floor"),
        resize_width=width,
        resize_height=height,
        resize_direction=direction,
        confidence=0.85,
        needs_clarification=False,
        clarification_question=None,
    )
    if direction in {"east", "west"}:
        command.resize_width = width + 1000
        command.resize_height = height
    elif direction in {"north", "south"}:
        command.resize_width = width
        command.resize_height = height + 1000
    else:
        command = _apply_relative_adjustment(command, user_text, ifc_context)
    if command.resize_width is not None and command.resize_height is not None:
        command.resize_rects = shape_to_rects(
            command.resize_shape,
            command.resize_width,
            command.resize_height,
        )
    return command


def _maybe_parse_remove_command_v2(user_text: str) -> FloorNLPCommand | None:
    remove_keywords = ("삭제", "제거", "없애", "지워")
    if not any(keyword in user_text for keyword in remove_keywords):
        return None

    prefix = None
    for keyword in remove_keywords:
        if keyword not in user_text:
            continue
        prefix = user_text.split(keyword, maxsplit=1)[0].strip()
        break
    if not prefix:
        return None

    target_name = prefix
    for suffix in ("하고", "와", "과", "을", "를", "은", "는", "이", "가"):
        if target_name.endswith(suffix):
            target_name = target_name[: -len(suffix)].strip()
            break
    if not target_name:
        return None

    return FloorNLPCommand(
        action="remove_room",
        target_room_name=target_name,
        confidence=0.9,
        needs_clarification=False,
        clarification_question=None,
    )


def _maybe_parse_insert_toilet_command(user_text: str) -> FloorNLPCommand | None:
    lowered = user_text.casefold()
    if not any(keyword in lowered for keyword in ("화장실", "wc", "toilet")):
        return None
    if "옆" not in user_text and "near" not in lowered and "adjacent" not in lowered:
        return None

    return FloorNLPCommand(
        action="insert_toilet",
        target_room_name="욕실",
        target_floor=1 if "1층" in user_text else 1,
        confidence=0.95,
        needs_clarification=False,
        clarification_question=None,
    )

def _maybe_parse_insert_toilet_command_v2(user_text: str) -> FloorNLPCommand | None:
    lowered = user_text.casefold()
    if not any(keyword in lowered for keyword in ("화장실", "wc", "toilet")):
        return None

    is_public_request = any(
        keyword in user_text or keyword in lowered
        for keyword in ("공용", "public", "shared")
    )
    is_near_request = "옆" in user_text or "near" in lowered or "adjacent" in lowered
    if not is_public_request and not is_near_request:
        return None

    return FloorNLPCommand(
        action="insert_toilet",
        target_room_name="욕실" if is_near_request else None,
        target_floor=1 if "1층" in user_text else 1,
        confidence=0.95,
        needs_clarification=False,
        clarification_question=None,
    )


def _maybe_parse_simple_create_door_command(
    user_text: str,
    ifc_context: IFCContext | None,
) -> FloorNLPCommand | None:
    lowered = user_text.casefold()
    if not any(keyword in user_text or keyword in lowered for keyword in _CREATE_DOOR_KEYWORDS):
        return None
    if not any(keyword in user_text for keyword in _CREATE_DOOR_ACTION_HINTS):
        return None
    if ifc_context is None:
        return None

    mentioned_space = next(
        (
            space
            for space in ifc_context.get("spaces", [])
            if space.get("name") and space["name"] in user_text
        ),
        None,
    )
    if mentioned_space is None:
        return FloorNLPCommand(
            action="create_door",
            confidence=0.3,
            needs_clarification=True,
            clarification_question="어느 방의 벽에 문을 만들까요? 방 이름을 알려주세요.",
        )

    candidate_walls = [
        wall
        for wall in ifc_context.get("walls", [])
        if mentioned_space.get("id") and mentioned_space["id"] in wall.get("space_ids", [])
    ]
    if not candidate_walls:
        return FloorNLPCommand(
            action="create_door",
            confidence=0.3,
            needs_clarification=True,
            clarification_question=f"'{mentioned_space['name']}' 방의 벽 정보를 찾을 수 없습니다.",
        )

    interior_walls = [wall for wall in candidate_walls if wall.get("kind") == "INTERIOR"]
    wall = interior_walls[0] if interior_walls else candidate_walls[0]
    return FloorNLPCommand(
        action="create_door",
        target_wall_id=wall["id"],
        target_floor=wall.get("floor"),
        element_width_mm=900,
        element_height_mm=2100,
        confidence=0.88,
        needs_clarification=False,
        clarification_question=None,
    )


def _maybe_parse_simple_delete_wall_void_command(
    user_text: str,
    ifc_context: IFCContext | None,
) -> FloorNLPCommand | None:
    if not any(keyword in user_text for keyword in _DELETE_VOID_KEYWORDS):
        return None

    lowered = user_text.casefold()
    is_window = any(
        keyword in user_text or keyword in lowered
        for keyword in ("창문", "창", "window")
    )
    is_door = not is_window and any(
        keyword in user_text or keyword in lowered for keyword in ("문", "도어", "door")
    )
    if not is_door and not is_window:
        return None
    if ifc_context is None:
        return None

    mentioned_space = next(
        (
            space
            for space in ifc_context.get("spaces", [])
            if space.get("name") and space["name"] in user_text
        ),
        None,
    )

    candidate_wall_ids: set[str] | None = None
    if mentioned_space is not None:
        candidate_wall_ids = {
            wall["id"]
            for wall in ifc_context.get("walls", [])
            if mentioned_space.get("id") and mentioned_space["id"] in wall.get("space_ids", [])
        }

    pool = ifc_context.get("doors", []) if is_door else ifc_context.get("windows", [])
    candidates = [
        element
        for element in pool
        if candidate_wall_ids is None or element.get("host_wall_id") in candidate_wall_ids
    ]

    if len(candidates) == 1:
        candidate = candidates[0]
        return FloorNLPCommand(
            action="delete_wall_void",
            target_element_id=candidate["id"],
            target_floor=candidate.get("floor"),
            confidence=0.9,
            needs_clarification=False,
            clarification_question=None,
        )
    if len(candidates) == 0:
        what = "문" if is_door else "창문"
        return FloorNLPCommand(
            action="delete_wall_void",
            confidence=0.3,
            needs_clarification=True,
            clarification_question=f"삭제할 {what}을 찾지 못했습니다.",
        )

    what = "문" if is_door else "창문"
    return FloorNLPCommand(
        action="delete_wall_void",
        confidence=0.4,
        needs_clarification=True,
        clarification_question=f"{what}이 여러 개 있습니다. 어느 방의 {what}을 삭제할까요?",
    )


def _maybe_parse_simple_create_wall_command(
    user_text: str,
    ifc_context: IFCContext | None,
) -> FloorNLPCommand | None:
    lowered = user_text.casefold()
    if not any(keyword in user_text or keyword in lowered for keyword in _CREATE_WALL_KEYWORDS):
        return None
    if not any(keyword in user_text for keyword in _CREATE_WALL_ACTION_HINTS):
        return None
    space = _resolve_space_for_user_text(user_text, ifc_context)
    if space is None:
        return None
    return FloorNLPCommand(
        action="create_wall",
        target_room_name=space.get("name"),
        target_floor=space.get("floor"),
        confidence=0.9,
        needs_clarification=False,
        clarification_question=None,
    )


SYSTEM_PROMPT = """
당신은 2D 평면 수정 요청을 구조화된 명령으로 변환하는 파서다.
사용자 요청을 읽고 FloorNLPCommand JSON 하나만 정확하게 반환한다.

## IFC 컨텍스트 활용
- [현재 IFC 상태]가 주어지면 spaces 목록을 우선 참고한다.
- 기존 요소를 수정하거나 삭제하는 요청은 IFC 컨텍스트 안의 현재 상태를 기준으로 해석한다.
- IFC 전체를 추측하지 말고, 주어진 IFC 컨텍스트 안에서만 target을 식별한다.
- spaces[].locked가 true인 방은 수정(resize_room)과 삭제(remove_room) 명령을 생성하지 않는다.
  해당 요청이 들어오면 needs_clarification=true로 반환한다.
- 방 추가(add_room) 시 boundaries[].outer_polygon 내부에 배치해야 한다.
  컨텍스트에 boundaries가 있으면 이를 참고해 경계를 벗어나는 배치를 시도하지 않는다.
- 상대적 크기 계산 시 spaces[].width/height 외에 spaces[].polygon으로도 치수를 파악할 수 있다.

## 지원 액션
- add_room: 방 추가
- create_door: 지정 방 또는 벽에 문(IfcDoor) 생성. 방 이름 또는 target_wall_id 필수
- delete_wall_void: 기존 문/창문 삭제. target_element_id 필수
- remove_room: 방 삭제
- resize_room: 방 크기 변경
- set_adjacency: 방 인접 관계 설정
- lock_room: 방 잠금
- unlock_room: 방 잠금 해제

## 방 형태(shape)
- rect: 직사각형
- L: L자
- U: U자

## 단위 규칙
치수는 항상 밀리미터(mm) 기준 정수로 변환한다.
예: "3m" → 3000, "300cm" → 3000, "1500mm" → 1500
평수 단위: 1평 = 약 3300x3300mm.
단 "10평 방 넓이와 높이를 각각 추정" 불가 시 needs_clarification=true

## 명확한 치수가 없으면 반드시 되묻는다
다음 경우에는 반드시 needs_clarification=true로 반환한다.
- add_room: 방 이름, 치수(width/height) 중 하나라도 없는 경우
- resize_room: 구체적인 치수(숫자) 없이, IFC 컨텍스트에도 현재 치수가 없는 경우
- 평수 단위처럼 width/height로 분리 불가능한 단위를 사용한 경우

## 상대적 크기 처리
"더 넓게", "조금 넓게", "절반으로" 같은 상대적 표현이 있을 때
- [현재 IFC 상태]에서 해당 방의 width/height를 확인한다.
- 치수가 있으면 "더 넓게/크게"는 각 치수의 +20%, "조금"은 +10%,
  "많이/훨씬"은 +30%, "절반"은 50%, "두 배"는 200% 적용 후 정수 반환.
- 치수가 없으면 needs_clarification=true, "현재 치수를 알 수 없어 구체적인 크기를 알려주세요"

## 복합/다중 명령 규칙
한 번에 여러 방을 조작하거나 여러 액션을 요청하면 needs_clarification=true로 반환한다.
예: "거실 없애고 서재 추가해줘", "화장실이랑 침실 둘 다 없애줘"
clarification_question은 "한 번에 하나의 명령만 처리할 수 있습니다.
어떤 것을 먼저 할까요?"라고 안내한다.

## 해석 규칙
- 방 이름에서 타입을 유추한다. 예: "침실" → bedroom, "주방" → kitchen, "화장실" → bathroom
- 층이 명시되지 않으면 floor=1로 기본 설정한다.
- confidence는 0.0~1.0 범위로 반환한다.

## 예시
사용자 요청: "침실 4x5 크기로 추가해줘"
출력: {"action": "add_room", "new_room": {"name": "침실", "type": "bedroom",
  "shape": "rect", "width": 4000, "height": 5000, "floor": 1},
  "confidence": 0.95, "needs_clarification": false}

사용자 요청: "2층에 침실 3x4로 추가해줘"
출력: {"action": "add_room", "new_room": {"name": "침실", "type": "bedroom",
  "shape": "rect", "width": 3000, "height": 4000, "floor": 2},
  "confidence": 0.95, "needs_clarification": false}

사용자 요청: "작은방 삭제해줘"
출력: {"action": "remove_room", "target_room_name": "작은방",
  "confidence": 0.95, "needs_clarification": false}

사용자 요청: "거실을 L자 6x8로 바꿔줘"
출력: {"action": "resize_room", "target_room_name": "거실",
  "resize_shape": "L", "resize_width": 6000, "resize_height": 8000,
  "confidence": 0.95, "needs_clarification": false}

사용자 요청: "방 하나 추가해줘"
출력: {"action": "add_room", "confidence": 0.3, "needs_clarification": true,
  "clarification_question": "어떤 방을 어떤 크기로 추가할까요? 예: 침실 4000x5000"}

사용자 요청: "2층에 방 하나 더 추가해줘"
출력: {"action": "add_room", "confidence": 0.3, "needs_clarification": true,
  "clarification_question": "어떤 종류의 방을 어떤 크기로 추가할까요? 예: 침실 4000x5000"}

IFC 상태:
{
  "spaces": [
    {"id": "sp-001", "name": "침실", "floor": 1, "width": 4000, "height": 5000, "locked": false}
  ]
}
사용자 요청: "침실을 조금 더 넓게 해줘"
출력: {"action": "resize_room", "target_room_name": "침실",
  "resize_shape": "rect", "resize_width": 4400, "resize_height": 5500,
  "confidence": 0.9, "needs_clarification": false}

IFC 상태 없음
사용자 요청: "침실을 조금 더 넓게 해줘"
출력: {"action": "resize_room", "target_room_name": "침실",
  "confidence": 0.4, "needs_clarification": true,
  "clarification_question": "현재 치수를 알 수 없어 구체적인 크기를 알려주세요. 예: 5000x6000"}

사용자 요청: "거실을 10평으로 바꿔줘"
출력: {"action": "resize_room", "target_room_name": "거실",
  "confidence": 0.5, "needs_clarification": true,
  "clarification_question": "평수 단위는 지원하지 않습니다. mm 단위로 알려주세요. 예: 6000x8000"}

사용자 요청: "거실 없애고 서재 추가해줘"
출력: {"action": "remove_room", "confidence": 0.5, "needs_clarification": true,
  "clarification_question": "한 번에 하나의 명령만 처리할 수 있습니다. 어떤 것을 먼저 할까요?"}

IFC 상태:
{
  "spaces": [
    {"id": "sp-001", "name": "거실", "floor": 1, "width": 6000, "height": 5000, "locked": true}
  ]
}
사용자 요청: "거실 삭제해줘"
출력: {"action": "remove_room", "target_room_name": "거실",
  "confidence": 0.95, "needs_clarification": true,
  "clarification_question": "거실은 잠겨 있어 삭제할 수 없습니다."}

사용자 요청: "화장실이랑 침실 둘 다 없애줘"
출력: {"action": "remove_room", "confidence": 0.5, "needs_clarification": true,
  "clarification_question": "한 번에 하나의 명령만 처리할 수 있습니다. 어떤 것을 먼저 할까요?"}
"""


def _maybe_parse_insert_toilet_command_v3(user_text: str) -> FloorNLPCommand | None:
    lowered = user_text.casefold()
    if not any(keyword in lowered for keyword in ("화장실", "wc", "toilet")):
        return None

    is_public_request = any(
        keyword in user_text or keyword in lowered
        for keyword in ("공용", "public", "shared")
    )
    is_near_request = "옆" in user_text or "near" in lowered or "adjacent" in lowered
    if not is_public_request and not is_near_request:
        return None

    user_intent = None
    if is_public_request and not is_near_request:
        user_intent = "shared_toilet_any_strategy"
        if any(keyword in user_text for keyword in ("Big Room", "큰 방", "반으로", "나눠")):
            user_intent = "shared_toilet_split_big_room"
        elif any(keyword in user_text for keyword in ("복도 끝", "복도에서", "corridor")):
            user_intent = "shared_toilet_corridor_carve"

    return FloorNLPCommand(
        action="insert_toilet",
        target_room_name="욕실" if is_near_request else None,
        target_floor=1 if "1층" in user_text else 1,
        user_intent=user_intent,
        confidence=0.95,
        needs_clarification=False,
        clarification_question=None,
    )


class FloorPlanEngine:
    """자연어 2D 평면도 수정 명령을 FloorNLPCommand로 파싱하는 엔진."""

    DEFAULT_MODEL = "gemma3:4b"
    DEFAULT_BASE_URL = "http://localhost:11434/v1"
    DEFAULT_API_KEY = "ollama"
    ENV_MODEL_KEYS: tuple[str, ...] = ("2D_LLM_MODEL_NAME", "MODEL_NAME")
    ENV_BASE_URL_KEYS: tuple[str, ...] = ("MODEL_ENDPOINT",)
    ENV_API_KEY_KEYS: tuple[str, ...] = ("2D_LLM_API_KEY", "MODEL_API_KEY", "OPENAI_API_KEY")

    def __init__(
        self,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.model = model or self._resolve_env_value(self.ENV_MODEL_KEYS, self.DEFAULT_MODEL)
        self.base_url = base_url or self._resolve_env_value(
            self.ENV_BASE_URL_KEYS,
            self.DEFAULT_BASE_URL,
        )
        self.api_key = api_key or self._resolve_env_value(
            self.ENV_API_KEY_KEYS,
            self.DEFAULT_API_KEY,
        )
        self.timeout = timeout
        self._client = instructor.from_openai(
            AsyncOpenAI(base_url=self.base_url, api_key=self.api_key, timeout=timeout),
            mode=instructor.Mode.JSON,
        )

    @staticmethod
    def _resolve_env_value(keys: tuple[str, ...], default: str) -> str:
        for key in keys:
            value = os.getenv(key)
            if value:
                return value
        return default

    async def parse_command(
        self,
        user_text: str,
        ifc_context: IFCContext | None = None,
        conversation_history: list[ChatCompletionMessageParam] | None = None,
        selected_wall_id: str | None = None,
    ) -> FloorNLPCommand:
        if selected_wall_id is None:
            selected_wall_id = _selected_wall_id_from_text(user_text, ifc_context)
        if selected_wall_id is not None:
            target_floor: int | None = None
            if ifc_context is not None:
                for wall in ifc_context.get("walls", []):
                    if wall.get("id") == selected_wall_id:
                        floor = wall.get("floor")
                        target_floor = floor if isinstance(floor, int) else None
                        break
            return FloorNLPCommand(
                action="create_door",
                target_wall_id=selected_wall_id,
                target_floor=target_floor,
                element_width_mm=900,
                element_height_mm=2100,
                confidence=0.99,
                needs_clarification=False,
                clarification_question=None,
            )

        clarification_followup_remove = _recover_followup_remove_command(
            user_text,
            ifc_context,
            conversation_history,
        )
        if clarification_followup_remove is not None:
            return clarification_followup_remove

        generic_room_change = _maybe_parse_generic_room_change_clarification(user_text)
        if generic_room_change is not None:
            return generic_room_change

        create_wall = _maybe_parse_simple_create_wall_command(user_text, ifc_context)
        if create_wall is not None:
            return create_wall

        create_door = _maybe_parse_simple_create_door_command(user_text, ifc_context)
        if create_door is not None:
            return create_door

        delete_void = _maybe_parse_simple_delete_wall_void_command(user_text, ifc_context)
        if delete_void is not None:
            return delete_void

        insert_toilet = _maybe_parse_insert_toilet_command_v3(user_text)
        if insert_toilet is not None:
            return insert_toilet

        explicit_merge_remove = _maybe_parse_explicit_merge_remove_command(user_text, ifc_context)
        if explicit_merge_remove is not None:
            return explicit_merge_remove

        remove_v2 = _maybe_parse_remove_command_v2(user_text)
        if remove_v2 is not None:
            return remove_v2

        simple_remove = _maybe_parse_simple_remove_command(user_text)
        if simple_remove is not None:
            return simple_remove

        simple_resize = _maybe_parse_simple_resize_command(user_text, ifc_context)
        if simple_resize is not None:
            return simple_resize

        messages: list[ChatCompletionMessageParam] = [{"role": "system", "content": SYSTEM_PROMPT}]

        if conversation_history:
            messages.extend(conversation_history[-8:])

        if ifc_context is not None:
            user_content = (
                f"[현재 IFC 상태]\n"
                f"{json.dumps(ifc_context, ensure_ascii=False)}\n\n"
                f"[사용자 요청]\n"
                f"{user_text}"
            )
        else:
            user_content = user_text

        messages.append({"role": "user", "content": user_content})

        try:
            command = await self._client.chat.completions.create(
                model=self.model,
                response_model=FloorNLPCommand,
                messages=messages,
                temperature=0.1,
                max_tokens=1024,
            )

            if command.action == "add_room" and command.new_room:
                command.new_room.rects = shape_to_rects(
                    command.new_room.shape, command.new_room.width, command.new_room.height
                )

            if command.action == "resize_room":
                command = _apply_relative_adjustment(command, user_text, ifc_context)
                if command.resize_direction is None:
                    command.resize_direction = _infer_resize_direction(user_text)
                if command.resize_width is not None and command.resize_height is not None:
                    command.resize_rects = shape_to_rects(
                        command.resize_shape, command.resize_width, command.resize_height
                    )
                else:
                    command.needs_clarification = True
                    command.clarification_question = (
                        "변경할 방 크기를 다시 알려주세요. 예: 4000x5000"
                    )

            command = _recover_simple_remove_command(command, user_text)

            if command.confidence < 0.7 and not command.needs_clarification:
                command.needs_clarification = True
                if not command.clarification_question:
                    command.clarification_question = (
                        "요청을 정확히 해석하지 못했습니다. 조금 더 구체적으로 설명해 주세요."
                    )

            return command

        except Exception as e:
            recovered_followup = _recover_followup_remove_command(
                user_text,
                ifc_context,
                conversation_history,
            )
            if recovered_followup is not None:
                return recovered_followup
            recovered = _recover_command_from_exception(e, user_text, ifc_context)
            if recovered is not None:
                return recovered
            return FloorNLPCommand(
                action="add_room",
                confidence=0.0,
                needs_clarification=True,
                clarification_question=(
                    "명령을 구조화해서 해석하지 못했습니다. "
                    "삭제 또는 변경할 방 이름과 층을 짧게 다시 알려주세요."
                ),
            )
            return FloorNLPCommand(
                action="add_room",
                confidence=0.0,
                needs_clarification=True,
                clarification_question=f"명령 해석 중 오류가 발생했습니다: {e}",
            )
