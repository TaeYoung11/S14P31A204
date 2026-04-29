"""
프롬프트 엣지 케이스 수동 테스트
실행: uv run python LLM_2D/test_pipeline.py
"""
import asyncio
from ai_planning_2d import FloorPlanEngine

engine = FloorPlanEngine()

CASES = [
    # (설명, 자연어 입력)
    ("치수 없이 방 추가",          "2층에 방 하나 더 추가해줘"),
    ("타입 없이 방 추가",          "침실 4000x5000 추가해줘"),
    ("평 단위 치수",               "거실을 10평으로 바꿔줘"),
    ("상대적 크기",                "침실을 조금 더 넓게 해줘"),
    ("복합 명령",                  "거실 없애고 대신 서재 추가해줘"),
    ("다중 대상",                  "화장실이랑 침실 둘 다 없애줘"),
    ("층 명시 추가",               "2층에 침실 3000x4000 추가해줘"),
    ("L자 크기 불명확",            "거실을 L자로 바꿔줘"),
]

async def main():
    for desc, text in CASES:
        result = await engine.parse_command(text)
        print(f"\n[{desc}]")
        print(f"  입력: {text}")
        print(f"  action: {result.action}")
        print(f"  confidence: {result.confidence}")
        print(f"  needs_clarification: {result.needs_clarification}")
        if result.needs_clarification:
            print(f"  question: {result.clarification_question}")
        if result.new_room:
            print(f"  new_room: {result.new_room.model_dump(exclude_none=True)}")
        if result.resize_width:
            print(f"  resize: {result.resize_shape} {result.resize_width}x{result.resize_height}")
        if result.target_room_name:
            print(f"  target: {result.target_room_name}")

asyncio.run(main())
