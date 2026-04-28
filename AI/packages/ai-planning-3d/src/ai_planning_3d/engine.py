from __future__ import annotations

import logging

import instructor
from instructor.core.exceptions import InstructorRetryException
from openai import AsyncOpenAI

from .command import LLM3DCommand, LLM3DCommandType, LLM3DElementType, LLM3DTarget

logger = logging.getLogger(__name__)

# 100자 제한을 지키기 위해 SYSTEM_PROMPT를 문자열 연결로 구성한다.
SYSTEM_PROMPT = (
    "당신은 BIM(Building Information Modeling) 전문 AI입니다.\n"
    "사용자의 자연어 명령을 분석하여 LLM3DCommand 스키마로 변환합니다.\n"
    "\n"
    "[경고: 절대 규칙]\n"
    "1. 정보가 조금이라도 부족하면 즉시 `ambiguity_question` 필드를 채우십시오.\n"
    "   단, '모든', '전체', '건물 전체'처럼 대상을 전체로 지정하면\n"
    "   위치 정보 없이도 select_all=true로 파싱하십시오.\n"
    "2. 절대 층(storey)이나 공간(space_name)을 마음대로 지어내지 마십시오.\n"
    "3. 타겟 불명 시 command_type=MODIFY, confidence=0.1로 고정하고 질문만 던지십시오.\n"
    "4. [CREATE 규칙]\n"
    "   - storey와 direction(North/South/East/West)이 반드시 필요합니다.\n"
    "   - 방향이 없으면 물어보십시오.\n"
    "   - 색상(color)은 CSS 이름(White, Red) 또는 HEX(#RRGGBB)로 추출하십시오.\n"
    "   - 지붕 생성 시 형상(shape_preset: FLAT/GABLED)을 판단하십시오.\n"
    "5. [수정 제한]\n"
    "   - IfcDoor, IfcWindow의 치수 변경 요청은 정책상 금지됩니다.\n"
    "   - 이 경우 ambiguity_question으로 거절 사유를 밝히십시오.\n"
    "\n"
    "[Few-shot Examples]\n"
    "- 입력: '거실 북쪽에 흰색 실크 벽지 벽 하나 만들어줘'\n"
    "  출력: {command_type:CREATE, create_info:{element_type:IfcWall,\n"
    "         direction:North, space_name:Living Room,\n"
    "         color:White, material:{name:Silk Wallpaper}}}\n"
    "- 입력: '2층 안방 동쪽에 붉은 박공지붕 올려줘'\n"
    "  출력: {command_type:CREATE, create_info:{element_type:IfcRoof,\n"
    "         storey:2F, space_name:Bedroom, direction:East,\n"
    "         color:Red, shape_preset:GABLED}}\n"
    "- 입력: '침실 벽 두께를 300으로 키워줘'\n"
    "  출력: {command_type:MODIFY,\n"
    "         target:{element_type:IfcWall, space_name:Bedroom},\n"
    "         changes:{width_mm:{mode:ABSOLUTE, value:300}}}\n"
    "- 입력: '벽 두껍게 해줘'\n"
    "  출력: {command_type:MODIFY, target:{element_type:IfcWall},\n"
    "         confidence:0.2,\n"
    "         ambiguity_question:'어느 위치(층, 공간)의 벽을 두껍게 할까요?'}\n"
)


class LLM3DEngine:
    def __init__(
        self,
        model: str = "qwen2.5:7b",
        base_url: str | None = None,
        api_key: str | None = None,
    ):
        self._raw_client = AsyncOpenAI(
            base_url=base_url or "http://localhost:11434/v1",
            api_key=api_key or "ollama",
        )
        self.client = instructor.from_openai(self._raw_client, mode=instructor.Mode.JSON)
        self.model = model

    async def parse_command(self, user_text: str) -> LLM3DCommand:
        try:
            command: LLM3DCommand = await self.client.chat.completions.create(
                model=self.model,
                response_model=LLM3DCommand,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_text},
                ],
                temperature=0.05,
                max_retries=1,
            )
            return command
        except InstructorRetryException:
            logger.warning(f"[LLM3DEngine] 파싱 실패 → 재질문 응답으로 대체: {user_text!r}")
            return LLM3DCommand(
                command_type=LLM3DCommandType.MODIFY,
                target=LLM3DTarget(element_type=LLM3DElementType.WALL),
                confidence=0.1,
                raw_instruction=user_text,
                ambiguity_question=(
                    "명령을 정확히 이해하지 못했습니다. 더 구체적으로 말씀해 주세요."
                ),
            )
        except Exception as exc:
            logger.error(f"[LLM3DEngine] 파싱 실패: {exc}", exc_info=True)
            raise