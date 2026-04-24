import json

import instructor
from openai import AsyncOpenAI
from typing import Dict, List, Optional

from models import FloorNLPCommand

_raw_client = AsyncOpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama",
    timeout=30.0,
)
client = instructor.from_openai(_raw_client, mode=instructor.Mode.JSON)

SYSTEM_PROMPT = """
당신은 2D 평면도 편집 요청을 구조화된 명령으로 변환하는 파서다.
사용자 요청을 읽고 FloorNLPCommand JSON 하나만 정확하게 반환한다.

## IFC 컨텍스트 활용
- [현재 IFC 상태]가 주어지면 spaces, walls, doors, windows, stairs 목록을 우선 참고한다.
- 기존 요소를 수정하거나 삭제하는 요청은 IFC 컨텍스트 안의 현재 상태를 기준으로 해석한다.
- IFC 전체를 추측하지 말고, 주어진 IFC 컨텍스트 안에서만 target을 식별한다.

## 지원 액션
- add_room: 방 추가
- remove_room: 방 삭제
- resize_room: 방 크기 변경
- set_adjacency: 방 인접 관계 설정
- lock_room: 방 잠금
- unlock_room: 방 잠금 해제

## 방 형태(shape)
- rect: 직사각형
- L: L자
- U: U자
- O: 중정형

## 단위 규칙
치수는 항상 밀리미터(mm) 기준 정수로 변환한다.
예: "3m" -> 3000, "300cm" -> 3000, "1500mm" -> 1500

## 해석 규칙
- 대상 방 이름이 불명확하면 needs_clarification=true
- 치수 정보가 부족하면 needs_clarification=true
- confidence는 0.0~1.0 범위로 반환한다.

## 예시
사용자 요청: "침실 4x5 크기로 추가해줘"
출력: {"action": "add_room", "new_room": {"name": "침실", "type": "bedroom", "shape": "rect", "width": 4000, "height": 5000, "floor": 1}, "confidence": 0.95, "needs_clarification": false}

사용자 요청: "작은방 삭제해줘"
출력: {"action": "remove_room", "target_room_name": "작은방", "confidence": 0.95, "needs_clarification": false}

사용자 요청: "거실을 L자 6x8로 바꿔줘"
출력: {"action": "resize_room", "target_room_name": "거실", "resize_shape": "L", "resize_width": 6000, "resize_height": 8000, "confidence": 0.95, "needs_clarification": false}

사용자 요청: "방 하나 추가해줘"
출력: {"action": "add_room", "confidence": 0.3, "needs_clarification": true, "clarification_question": "어떤 방을 어떤 크기로 추가할까요?"}
"""


def shape_to_rects(
    shape: str,
    width: int,
    height: int,
) -> list[dict]:
    """
    shape와 치수(mm)를 rect 조합 리스트로 변환한다.
    반환값: [{"x": int, "y": int, "width": int, "height": int}, ...]
    """
    w, h = width, height

    if shape == "rect":
        return [{"x": 0, "y": 0, "width": w, "height": h}]

    if shape == "L":
        return [
            {"x": 0, "y": 0, "width": w, "height": h // 2},
            {"x": 0, "y": h // 2, "width": w // 2, "height": h // 2},
        ]

    if shape == "U":
        return [
            {"x": 0, "y": 0, "width": w // 4, "height": h},
            {"x": 3 * w // 4, "y": 0, "width": w // 4, "height": h},
            {"x": w // 4, "y": 0, "width": w // 2, "height": h // 3},
        ]

    if shape == "O":
        return [
            {"x": 0, "y": 0, "width": w, "height": h // 4},
            {"x": 0, "y": 3 * h // 4, "width": w, "height": h // 4},
            {"x": 0, "y": h // 4, "width": w // 4, "height": h // 2},
            {"x": 3 * w // 4, "y": h // 4, "width": w // 4, "height": h // 2},
        ]

    return [{"x": 0, "y": 0, "width": w, "height": h}]


async def parse_command(
    user_text: str,
    ifc_context: Optional[Dict] = None,
    conversation_history: Optional[List[Dict]] = None,
) -> FloorNLPCommand:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

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
        command = await client.chat.completions.create(
            model="gemma3:4b",
            response_model=FloorNLPCommand,
            messages=messages,
            temperature=0.1,
            max_tokens=1024,
        )

        if command.action == "add_room" and command.new_room:
            shape = getattr(command.new_room, "shape", "rect")
            width = getattr(command.new_room, "width", None)
            height = getattr(command.new_room, "height", None)

            if width and height:
                command.new_room.rects = shape_to_rects(shape, width, height)
            else:
                command.needs_clarification = True
                command.clarification_question = "방 크기를 다시 알려주세요. 예: 4000x5000"

        if command.action == "resize_room":
            shape = getattr(command, "resize_shape", "rect")
            width = getattr(command, "resize_width", None)
            height = getattr(command, "resize_height", None)

            if width and height:
                command.resize_rects = shape_to_rects(shape, width, height)
            else:
                command.needs_clarification = True
                command.clarification_question = "변경할 방 크기를 다시 알려주세요. 예: 4000x5000"

        if command.confidence < 0.7 and not command.needs_clarification:
            command.needs_clarification = True
            if not command.clarification_question:
                command.clarification_question = "요청을 정확히 해석하지 못했습니다. 조금 더 구체적으로 설명해 주세요."

        return command

    except Exception as e:
        return FloorNLPCommand(
            action="add_room",
            confidence=0.0,
            needs_clarification=True,
            clarification_question=f"명령 해석 중 오류가 발생했습니다: {str(e)}",
        )
