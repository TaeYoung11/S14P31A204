import instructor
from openai import AsyncOpenAI
from app.models.bim_command import BIMCommand
from app.core.config import settings
from typing import List, Dict

# Ollama를 OpenAI 호환 모드로 연결 (instructor 사용)
_raw_client = AsyncOpenAI(
    base_url=f"{settings.OLLAMA_BASE_URL}/v1",
    api_key="ollama"  # Ollama는 API 키가 필요 없지만 클라이언트가 요구함
)
client = instructor.from_openai(_raw_client, mode=instructor.Mode.JSON)

SYSTEM_PROMPT = """
당신은 BIM(Building Information Modeling) 전문 어시스턴트입니다.
사용자의 자연어 명령을 분석하여 BIM 수정 명령 JSON으로 변환하세요.

## 지원하는 BIM 요소 타입
- wall (벽)
- slab (슬래브/바닥/천장)
- column (기둥)
- beam (보)
- window (창문)
- door (문)
- stair (계단)
- roof (지붕)
- ramp (경사로)

## 지원하는 재질/표면색
재질:
concrete(콘크리트), glass(유리), wood(목재), brick(벽돌),
marble(대리석), tile(타일), steel(강철), gypsum(석고보드),
aluminum(알루미늄), insulation(단열재)

색상:
orange(주황/오렌지), red(빨강), yellow(노랑), green(초록),
blue(파랑), white(흰색), black(검정), gray(회색),
brown(갈색), beige(베이지)

## 치수 단위
모든 치수는 mm 단위로 변환하세요.
예: "30cm" -> 300, "1.5m" -> 1500

## 명령 분류
1. modify: 기존 요소 속성 변경 (재질, 표면색, 치수 등)
2. add: 새 요소 추가
3. delete: 요소 삭제
4. query: 정보 조회 (면적, 개수 등)

## 주의사항
- 층 번호가 불명확하면 needs_clarification=true
- 방 이름이 모호하면 needs_clarification=true
- 사용자가 색상을 직접 말하면 changes.material에 해당 색상 토큰을 넣으세요.
- 지원하지 않는 작업이면 action="unsupported"
- confidence는 0.0~1.0 사이 (0.7 미만이면 재질문 권장)
"""

CONVERSATION_LIMIT = 8

async def parse_command(
    user_text: str,
    conversation_history: List[Dict] = None,
    project_context: Dict = None
) -> BIMCommand:
    """자연어 BIM 명령을 구조화된 BIMCommand 객체로 변환"""
    
    context_str = ""
    if project_context:
        context_str = f"\n\n현재 프로젝트 정보:\n{project_context}"
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT + context_str}
    ]
    
    if conversation_history:
        messages.extend(conversation_history[-CONVERSATION_LIMIT:])
        
    messages.append({"role": "user", "content": user_text})
    
    try:
        command = await client.chat.completions.create(
            model=settings.LLM_MODEL,
            response_model=BIMCommand,
            messages=messages,
            temperature=0.1,
            max_tokens=1000
        )
        
        # 원본 텍스트 저장
        command.original_text = user_text
        
        # 확신도가 낮으면 재질문 유도
        if command.confidence < 0.7 and not command.needs_clarification:
            command.needs_clarification = True
            if not command.clarification_question:
                command.clarification_question = "명령이 불분명합니다. 더 구체적으로 설명해 주시겠어요?"
                
        return command
        
    except Exception as e:
        # 파싱 실패 시 기본 응답 생성
        return BIMCommand(
            action="unsupported",
            target={"element_type": "wall"},  # 더미
            confidence=0.0,
            needs_clarification=True,
            clarification_question=f"명령 분석 중 오류가 발생했습니다: {str(e)}",
            original_text=user_text
        )
