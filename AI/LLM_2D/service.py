import json

import instructor
from openai import AsyncOpenAI
from typing import Dict, List, Optional, Tuple

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
치수는 항상 미터(m) 기준 float로 변환한다.
예: "300cm" -> 3.0, "1500mm" -> 1.5

## 해석 규칙
- 대상 방 이름이 불명확하면 needs_clarification=true
- 치수 정보가 부족하면 needs_clarification=true
- confidence는 0.0~1.0 범위로 반환한다.

## 예시
사용자 요청: "침실 4x5 크기로 추가해줘"
출력: {"action": "add_room", "new_room": {"name": "침실", "type": "bedroom", "shape": "rect", "width": 4.0, "height": 5.0, "floor": 1}, "confidence": 0.95, "needs_clarification": false}

사용자 요청: "작은방 삭제해줘"
출력: {"action": "remove_room", "target_room_name": "작은방", "confidence": 0.95, "needs_clarification": false}

사용자 요청: "거실을 L자 6x8로 바꿔줘"
출력: {"action": "resize_room", "target_room_name": "거실", "resize_shape": "L", "resize_width": 6.0, "resize_height": 8.0, "confidence": 0.95, "needs_clarification": false}

사용자 요청: "방 하나 추가해줘"
출력: {"action": "add_room", "confidence": 0.3, "needs_clarification": true, "clarification_question": "어떤 방을 어떤 크기로 추가할까요?"}
"""


def shape_to_polygon(
    shape: str,
    width: float,
    height: float,
) -> List[Tuple[float, float]]:
    """
    shape와 치수를 방 polygon으로 변환한다.
    width: 가로 길이(m)
    height: 세로 길이(m)
    """
    w, h = width, height
    hw, hh = w / 2, h / 2

    if shape == "rect":
        return [(0, 0), (w, 0), (w, h), (0, h)]

    if shape == "L":
        return [
            (0, 0),
            (w, 0),
            (w, hh),
            (hw, hh),
            (hw, h),
            (0, h),
        ]

    if shape == "U":
        return [
            (0, 0),
            (w, 0),
            (w, h),
            (hw + hw * 0.2, h),
            (hw + hw * 0.2, hh),
            (hw - hw * 0.2, hh),
            (hw - hw * 0.2, h),
            (0, h),
        ]

    if shape == "O":
        return [
            (0, 0),
            (w, 0),
            (w, h),
            (0, h),
        ]

    return [(0, 0), (w, 0), (w, h), (0, h)]


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
                command.new_room.polygon = shape_to_polygon(shape, width, height)
            else:
                command.needs_clarification = True
                command.clarification_question = "방 크기를 다시 알려주세요. 예: 4x5"

        if command.action == "resize_room":
            shape = getattr(command, "resize_shape", "rect")
            width = getattr(command, "resize_width", None)
            height = getattr(command, "resize_height", None)

            if width and height:
                command.resize_polygon = shape_to_polygon(shape, width, height)
            else:
                command.needs_clarification = True
                command.clarification_question = "변경할 방 크기를 다시 알려주세요. 예: 4x5"

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
