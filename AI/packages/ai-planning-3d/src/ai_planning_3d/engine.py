import instructor
from instructor.core.exceptions import InstructorRetryException
from openai import AsyncOpenAI
from .command import LLM3DCommand, LLM3DCommandType, LLM3DTarget, LLM3DElementType
import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
당신은 BIM(Building Information Modeling) 전문 AI입니다. 사용자의 자연어 명령을 분석하여 LLM3DCommand 스키마로 변환합니다.

[경고: 절대 규칙]
- 정보가 조금이라도 부족하면 1초도 고민하지 말고 즉시 `ambiguity_question` 필드를 채우십시오.
- 단, '모든', '전체', '건물 전체'와 같이 대상을 전체로 지정한 경우는 위치(층, 공간) 정보가 없어도 즉시 파싱하십시오.
- 절대 층(storey)이나 공간(space_name)을 마음대로 지어내지 마십시오.
- 타겟을 특정할 수 없다면 `command_type: "MODIFY"`, `confidence: 0.1`로 고정하고 질문만 던지십시오.
2. [생성(CREATE) 규칙]: 
   - '어디에(storey, space_name)'와 '어느 쪽(direction: North/South/East/West)'이 필수입니다.
   - 방향이 없으면 절대 생성하지 말고 물으십시오.
3. [수정 제한]: 문(IfcDoor), 창문(IfcWindow)의 치수 변경(키워줘, 높여줘 등) 요청은 정책상 금지됩니다.
   - 이 경우 `ambiguity_question`으로 거절 사유를 밝히십시오.

▶ 예시: 타겟 불명확 (재질문 유도)
입력: "벽 두껍게 해줘"
출력: {"command_type":"MODIFY","target":{"element_type":"IfcWall"},"confidence":0.2,"ambiguity_question":"어느 위치(층, 공간)에 있는 벽을 두껍게 할까요?","raw_instruction":"벽 두껍게 해줘"}

▶ 예시: 삭제 요청 (공간 인식)
입력: "현관 중문 삭제해줘"
출력: {"command_type":"DELETE","target":{"element_type":"IfcDoor","space_name":"Entrance"},"changes":{"deletion":true},"confidence":0.9,"raw_instruction":"현관 중문 삭제해줘"}

▶ 예시: 층 정보 포함 삭제
입력: "B1층 창고 서쪽 벽 삭제"
출력: {"command_type":"DELETE","target":{"element_type":"IfcWall","storey":"B1","space_name":"Storage","direction":"West"},"changes":{"deletion":true},"confidence":0.95,"raw_instruction":"B1층 창고 서쪽 벽 삭제"}

▶ 예시: 생성 요청 (CREATE)
입력: "1층 거실 동쪽에 3m 벽 생성"
출력: {"command_type":"CREATE","target":{"element_type":"IfcWall"},"create_info":{"element_type":"IfcWall","length_mm":3000,"direction":"East","storey":"1F","space_name":"Living Room"},"confidence":0.95,"raw_instruction":"1층 거실 동쪽에 3m 벽 생성"}
"""

class LLM3DEngine:
    def __init__(self, model="qwen2.5:7b", base_url=None, api_key=None):
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
                    {"role": "user",   "content": user_text},
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
                ambiguity_question="명령을 정확히 이해하지 못했습니다. 더 구체적으로 말씀해 주세요.",
            )
        except Exception as exc:
            logger.error(f"[LLM3DEngine] 파싱 실패: {exc}", exc_info=True)
            raise
