from __future__ import annotations

import json
from typing import Optional

import instructor
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from .command import FloorNLPCommand, IFCContext
from .utils import shape_to_rects

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


class FloorPlanEngine:
    """자연어 2D 평면도 수정 명령을 FloorNLPCommand로 파싱하는 엔진."""

    DEFAULT_MODEL = "gemma3:4b"
    DEFAULT_BASE_URL = "http://localhost:11434/v1"

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
    ) -> None:
        self.model = model
        self._client = instructor.from_openai(
            AsyncOpenAI(base_url=base_url, api_key="ollama", timeout=timeout),
            mode=instructor.Mode.JSON,
        )

    async def parse_command(
        self,
        user_text: str,
        ifc_context: Optional[IFCContext] = None,
        conversation_history: Optional[list[ChatCompletionMessageParam]] = None,
    ) -> FloorNLPCommand:
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
                if command.resize_width is not None and command.resize_height is not None:
                    command.resize_rects = shape_to_rects(
                        command.resize_shape, command.resize_width, command.resize_height
                    )
                else:
                    command.needs_clarification = True
                    command.clarification_question = "변경할 방 크기를 다시 알려주세요. 예: 4000x5000"

            if command.confidence < 0.7 and not command.needs_clarification:
                command.needs_clarification = True
                if not command.clarification_question:
                    command.clarification_question = (
                        "요청을 정확히 해석하지 못했습니다. 조금 더 구체적으로 설명해 주세요."
                    )

            return command

        except Exception as e:
            return FloorNLPCommand(
                action="add_room",
                confidence=0.0,
                needs_clarification=True,
                clarification_question=f"명령 해석 중 오류가 발생했습니다: {e}",
            )
