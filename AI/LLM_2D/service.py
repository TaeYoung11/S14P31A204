import instructor
from openai import AsyncOpenAI
from typing import List, Dict, Optional, Tuple
from models import FloorNLPCommand, NewRoom

_raw_client = AsyncOpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama",
    timeout=30.0,
)
client = instructor.from_openai(_raw_client, mode=instructor.Mode.JSON)

SYSTEM_PROMPT = """
당신은 2D 평면도 수정 전문 어시스턴트입니다.
사용자의 자연어 명령을 분석하여 평면도 수정 명령 JSON으로 변환하세요.

## 지원하는 명령
- add_room: 새 방 추가
- remove_room: 방 삭제
- resize_room: 방 크기 변경
- set_adjacency: 방 인접도 설정
- lock_room: 방 위치 고정
- unlock_room: 방 위치 고정 해제

## 방 형태 (shape)
- rect: 직사각형
- L: ㄱ자
- U: ㄷ자
- O: ㅁ자 (가운데 빈 공간)

## 단위
모든 크기는 미터(m) 단위로 변환하세요.
예: "300cm" → 3.0, "1500mm" → 1.5

## 주의사항
- 방 이름이 불명확하면 needs_clarification=true
- 크기 정보가 없으면 needs_clarification=true
- confidence는 0.0~1.0 (0.7 미만이면 재질문)

## 예제
입력: "안방을 4x5 크기로 추가해줘"
출력: {"action": "add_room", "new_room": {"name": "안방", "type": "bedroom", "shape": "rect", "width": 4.0, "height": 5.0, "floor": 1}, "confidence": 0.95, "needs_clarification": false}

입력: "주방 없애줘"
출력: {"action": "remove_room", "target_room_name": "주방", "confidence": 0.95, "needs_clarification": false}

입력: "거실을 ㄱ자 6x8로 바꿔줘"
출력: {"action": "resize_room", "target_room_name": "거실", "resize_shape": "L", "resize_width": 6.0, "resize_height": 8.0, "confidence": 0.95, "needs_clarification": false}

입력: "방 좀 바꿔줘"
출력: {"action": "add_room", "confidence": 0.3, "needs_clarification": true, "clarification_question": "어떤 방을 어떻게 바꿀까요?"}
"""

# shape → polygon 변환 알고리즘
def shape_to_polygon(
    shape: str,
    width: float,
    height: float
) -> List[Tuple[float, float]]:
    """
    shape 문자열과 크기를 받아서 polygon 좌표로 변환
    width: 전체 가로 (m)
    height: 전체 세로 (m)
    """
    w, h = width, height
    hw, hh = w / 2, h / 2  # 절반 크기

    if shape == "rect":
        return [(0,0), (w,0), (w,h), (0,h)]

    elif shape == "L":  # ㄱ자
        return [
            (0,0), (w,0), (w,hh),
            (hw,hh), (hw,h), (0,h)
        ]

    elif shape == "U":  # ㄷ자
        return [
            (0,0), (w,0), (w,h),
            (hw+hw*0.2, h), (hw+hw*0.2, hh),
            (hw-hw*0.2, hh), (hw-hw*0.2, h),
            (0,h)
        ]

    elif shape == "O":  # ㅁ자
        thickness = min(w, h) * 0.25
        return [
            (0,0), (w,0), (w,h), (0,h),  # 외곽
            # 내부 구멍은 FE에서 처리
        ]

    else:
        # 기본값: 직사각형
        return [(0,0), (w,0), (w,h), (0,h)]


async def parse_command(
    user_text: str,
    conversation_history: Optional[List[Dict]] = None,
) -> FloorNLPCommand:

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if conversation_history:
        messages.extend(conversation_history[-8:])

    messages.append({"role": "user", "content": user_text})

    try:
        command = await client.chat.completions.create(
            model="gemma3:4b",
            response_model=FloorNLPCommand,
            messages=messages,
            temperature=0.1,
            max_tokens=1024,
        )

        # polygon 변환 처리
        if command.action == "add_room" and command.new_room:
            shape = getattr(command.new_room, "shape", "rect")
            width = getattr(command.new_room, "width", None)
            height = getattr(command.new_room, "height", None)

            if width and height:
                command.new_room.polygon = shape_to_polygon(shape, width, height)
            else:
                command.needs_clarification = True
                command.clarification_question = "방의 크기를 알려주세요. 예: 4x5"

        if command.action == "resize_room":
            shape = getattr(command, "resize_shape", "rect")
            width = getattr(command, "resize_width", None)
            height = getattr(command, "resize_height", None)

            if width and height:
                command.resize_polygon = shape_to_polygon(shape, width, height)
            else:
                command.needs_clarification = True
                command.clarification_question = "변경할 크기를 알려주세요. 예: 4x5"

        # confidence 낮으면 재질문
        if command.confidence < 0.7 and not command.needs_clarification:
            command.needs_clarification = True
            if not command.clarification_question:
                command.clarification_question = "명령이 불명확합니다. 더 구체적으로 설명해주세요."

        return command

    except Exception as e:
        return FloorNLPCommand(
            action="add_room",
            confidence=0.0,
            needs_clarification=True,
            clarification_question=f"명령 분석 중 오류가 발생했습니다: {str(e)}"
        )