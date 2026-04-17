# NLP / LLM 설계

## 모델 스펙 (RTX 4050 Laptop 기준)

| 항목 | 값 |
|------|-----|
| 모델 | Qwen2.5-7B-Instruct |
| 양자화 | Q4_K_M |
| VRAM 사용 | ~4.5GB (6GB 중) |
| 추론 속도 | 30~40 token/s |
| 서빙 | Ollama (http://localhost:11434) |
| 구조화 출력 | `instructor` + Pydantic |
| 컨텍스트 제한 | 4096 토큰 (KV 캐시 고려) |

---

## 시스템 프롬프트

```
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

## 지원하는 재질
concrete(콘크리트), glass(유리), wood(목재), brick(벽돌),
marble(대리석), tile(타일), steel(강철), gypsum(석고보드),
aluminum(알루미늄), insulation(단열재)

## 치수 단위
모든 치수는 mm 단위로 변환하세요.
예: "30cm" → 300, "1.5m" → 1500

## 명령 분류
1. modify: 기존 요소 속성 변경 (재질, 치수 등)
2. add: 새 요소 추가
3. delete: 요소 삭제
4. query: 정보 조회 (면적, 개수 등)

## 주의사항
- 층 번호가 불명확하면 needs_clarification=true
- 방 이름이 모호하면 needs_clarification=true
- 지원하지 않는 작업이면 action="unsupported"
- confidence는 0.0~1.0 사이 (0.7 미만이면 재질문 권장)
```

---

## Pydantic 모델 정의

```python
# backend/app/models/bim_command.py

from pydantic import BaseModel, Field
from typing import Literal, Optional
from enum import Enum


class ElementType(str, Enum):
    WALL = "wall"
    SLAB = "slab"
    COLUMN = "column"
    BEAM = "beam"
    WINDOW = "window"
    DOOR = "door"
    STAIR = "stair"
    ROOF = "roof"
    RAMP = "ramp"


class Material(str, Enum):
    CONCRETE = "concrete"
    GLASS = "glass"
    WOOD = "wood"
    BRICK = "brick"
    MARBLE = "marble"
    TILE = "tile"
    STEEL = "steel"
    GYPSUM = "gypsum"
    ALUMINUM = "aluminum"
    INSULATION = "insulation"


class Opening(BaseModel):
    type: Literal["window", "door"]
    count: int = 1
    width: Optional[float] = None   # mm
    height: Optional[float] = None  # mm
    position: Optional[str] = None  # "center", "left", "right"


class BIMChanges(BaseModel):
    material: Optional[Material] = None
    thickness: Optional[float] = None   # mm
    height: Optional[float] = None      # mm
    width: Optional[float] = None       # mm
    length: Optional[float] = None      # mm
    openings: Optional[list[Opening]] = None


class BIMTarget(BaseModel):
    floor: Optional[int] = Field(None, description="층 번호. 불명확하면 None")
    room: Optional[str] = Field(None, description="방 이름 (예: 회의실, 로비)")
    element_type: ElementType
    direction: Optional[str] = Field(
        None, description="방향 (north/south/east/west 또는 외벽/내벽)"
    )


class QueryType(str, Enum):
    AREA_SUMMARY = "area_summary"
    ELEMENT_COUNT = "element_count"
    MATERIAL_LIST = "material_list"


class BIMCommand(BaseModel):
    action: Literal["modify", "add", "delete", "query", "unsupported"]
    target: BIMTarget
    changes: Optional[BIMChanges] = None
    query_type: Optional[QueryType] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    needs_clarification: bool = False
    clarification_question: Optional[str] = None
    original_text: str
```

---

## NLP 서비스 구현

```python
# backend/app/services/nlp_service.py

import instructor
from openai import AsyncOpenAI
from app.models.bim_command import BIMCommand
from app.core.config import settings

# Ollama를 OpenAI 호환 모드로 연결
_raw_client = AsyncOpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama"  # 더미값 (Ollama는 API 키 불필요)
)
client = instructor.from_openai(_raw_client, mode=instructor.Mode.JSON)

SYSTEM_PROMPT = """..."""  # 위의 시스템 프롬프트

CONVERSATION_LIMIT = 8  # 최근 8턴만 유지 (KV 캐시 제한)


async def parse_command(
    user_text: str,
    conversation_history: list[dict],
    project_context: dict
) -> BIMCommand:
    """자연어 BIM 명령을 구조체로 변환"""

    # 컨텍스트 프롬프트 (프로젝트 정보 주입)
    context_prompt = f"""
현재 프로젝트 정보:
- 총 층수: {project_context['floors']}층
- 각 층의 방 목록: {project_context['rooms_by_floor']}
"""

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT + context_prompt},
        # 최근 N턴 히스토리
        *conversation_history[-CONVERSATION_LIMIT:],
        {"role": "user", "content": user_text}
    ]

    command = await client.chat.completions.create(
        model="qwen2.5:7b",
        response_model=BIMCommand,
        messages=messages,
        temperature=0.1,  # 낮은 온도 = 일관된 JSON 출력
        max_tokens=512,
    )

    # 확신도 낮으면 재질문 강제
    if command.confidence < 0.7 and not command.needs_clarification:
        command.needs_clarification = True
        command.clarification_question = _generate_clarification(command)

    return command


def _generate_clarification(command: BIMCommand) -> str:
    """재질문 생성"""
    if command.target.floor is None:
        return "몇 층을 말씀하시는 건가요?"
    if command.target.room is None:
        return f"{command.target.floor}층의 어떤 공간을 수정할까요?"
    return "더 구체적으로 설명해 주시겠어요?"
```

---

## Few-Shot 예제 (프롬프트 보강)

```
# 예제 1: 재질 변경
입력: "3층 회의실 벽을 유리로 바꿔줘"
출력:
{
  "action": "modify",
  "target": { "floor": 3, "room": "회의실", "element_type": "wall" },
  "changes": { "material": "glass" },
  "confidence": 0.95,
  "needs_clarification": false
}

# 예제 2: 개구부 추가
입력: "로비 남쪽 벽에 창문 3개 달아줘 (120×150cm)"
출력:
{
  "action": "modify",
  "target": { "floor": 1, "room": "로비", "element_type": "wall", "direction": "south" },
  "changes": {
    "openings": [{ "type": "window", "count": 3, "width": 1200, "height": 1500 }]
  },
  "confidence": 0.90,
  "needs_clarification": false
}

# 예제 3: 모호한 명령
입력: "회의실 없애줘"
출력:
{
  "action": "delete",
  "target": { "floor": null, "room": "회의실", "element_type": "wall" },
  "confidence": 0.4,
  "needs_clarification": true,
  "clarification_question": "몇 층 회의실을 삭제할까요?"
}

# 예제 4: 조회
입력: "각 층별 면적 알려줘"
출력:
{
  "action": "query",
  "target": { "element_type": "slab" },
  "query_type": "area_summary",
  "confidence": 0.98,
  "needs_clarification": false
}
```

---

## 성능 최적화 (6GB VRAM)

### 컨텍스트 관리
```python
# 대화 히스토리 토큰 예산
MAX_HISTORY_TURNS = 8
MAX_CONTEXT_TOKENS = 3000  # 4096 중 512는 응답용, 나머지는 시스템+컨텍스트

def trim_history(history: list[dict]) -> list[dict]:
    """토큰 예산 초과 시 오래된 대화 제거"""
    return history[-MAX_HISTORY_TURNS:]
```

### VRAM 모니터링
```python
import subprocess

def get_vram_usage() -> dict:
    result = subprocess.run(
        ["nvidia-smi", "--query-gpu=memory.used,memory.free",
         "--format=csv,noheader,nounits"],
        capture_output=True, text=True
    )
    used, free = map(int, result.stdout.strip().split(", "))
    return {"used_mb": used, "free_mb": free, "total_mb": used + free}
```

### Ollama 헬스체크
```python
import httpx

async def check_ollama_ready() -> bool:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("http://localhost:11434/api/tags", timeout=3)
            models = resp.json().get("models", [])
            return any("qwen2.5" in m["name"] for m in models)
    except Exception:
        return False
```
