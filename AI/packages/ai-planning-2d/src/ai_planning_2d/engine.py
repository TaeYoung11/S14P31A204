from __future__ import annotations

import json

import instructor
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from .command import FloorNLPCommand, IFCContext
from .utils import shape_to_rects

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
평수 단위: 1평 = 약 3300x3300mm. 단 "10평 방 넓이와 높이를 각각 추정" 불가 시 needs_clarification=true

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

IFC 상태: {"spaces": [{"id": "sp-001", "name": "침실", "floor": 1, "width": 4000, "height": 5000, "locked": false}]}
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

IFC 상태: {"spaces": [{"id": "sp-001", "name": "거실", "floor": 1, "width": 6000, "height": 5000, "locked": true}]}
사용자 요청: "거실 삭제해줘"
출력: {"action": "remove_room", "target_room_name": "거실",
  "confidence": 0.95, "needs_clarification": true,
  "clarification_question": "거실은 잠겨 있어 삭제할 수 없습니다."}

사용자 요청: "화장실이랑 침실 둘 다 없애줘"
출력: {"action": "remove_room", "confidence": 0.5, "needs_clarification": true,
  "clarification_question": "한 번에 하나의 명령만 처리할 수 있습니다. 어떤 것을 먼저 할까요?"}
"""


class FloorPlanEngine:
    """?먯뿰??2D ?됰㈃???섏젙 紐낅졊??FloorNLPCommand濡??뚯떛?섎뒗 ?붿쭊."""

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
        ifc_context: IFCContext | None = None,
        conversation_history: list[ChatCompletionMessageParam] | None = None,
    ) -> FloorNLPCommand:
        messages: list[ChatCompletionMessageParam] = [{"role": "system", "content": SYSTEM_PROMPT}]

        if conversation_history:
            messages.extend(conversation_history[-8:])

        if ifc_context is not None:
            user_content = (
                f"[?꾩옱 IFC ?곹깭]\n"
                f"{json.dumps(ifc_context, ensure_ascii=False)}\n\n"
                f"[?ъ슜???붿껌]\n"
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
                    command.clarification_question = (
                        "蹂寃쏀븷 諛??ш린瑜??ㅼ떆 ?뚮젮二쇱꽭?? ?? 4000x5000"
                    )

            if command.confidence < 0.7 and not command.needs_clarification:
                command.needs_clarification = True
                if not command.clarification_question:
                    command.clarification_question = (
                        "?붿껌???뺥솗???댁꽍?섏? 紐삵뻽?듬땲?? 議곌툑 ??援ъ껜?곸쑝濡??ㅻ챸??二쇱꽭??"
                    )

            return command

        except Exception as e:
            return FloorNLPCommand(
                action="add_room",
                confidence=0.0,
                needs_clarification=True,
                clarification_question=f"紐낅졊 ?댁꽍 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: {e}",
            )
