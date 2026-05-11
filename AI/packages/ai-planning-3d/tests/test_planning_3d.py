import asyncio
import json
import logging
import os
from datetime import datetime
from pathlib import Path

import pytest

from ai_planning_3d.engine import LLM3DEngine

TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M")
LOG_DIR = Path.home() / "Downloads" / "batang_history"
LOG_DIR.mkdir(parents=True, exist_ok=True)

log_file = LOG_DIR / f"명령_해석테스트_{TIMESTAMP}.log"
json_log_path = LOG_DIR / f"명령_해석테스트_{TIMESTAMP}.json"

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(message)s",
    handlers=[
        logging.FileHandler(log_file, mode="w", encoding="utf-8"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("Planning_Test")

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_LIVE_PLANNING_3D_TEST") != "1",
    reason="set RUN_LIVE_PLANNING_3D_TEST=1 to enable live 3D planning test",
)

@pytest.mark.asyncio
async def test_planning_only():
    logger.info("🚀 [LLM_3D] Planning Engine Test (NL -> JSON Command)")
    logger.info("=" * 70)
    
    engine = LLM3DEngine()
    test_commands = [
        # ── 정상 수정 (MODIFY) ─────────────────────────────────────────────
        ("01", "1층 외벽 두께 50mm만 더 두껍게 해줘"),
        ("02", "옥상 지붕을 15도 돌리고 재질은 알루미늄으로 해줘"),

        # ── 다각형/방향 조작 (Face Offset) ───────────────────────────────
        ("03", "안방 ㄴ자 꺾인 부분의 서쪽 벽면을 500mm 밖으로 밀어줘"),
        ("04", "2층 화장실 북쪽 벽을 300mm 안으로 당겨줘"),

        # ── ReadOnly 부재 — 치수 변경은 차단, 이동은 허용 ────────────────
        ("05", "거실 기둥 높이를 3.5m로 맞춰줄래?"),
        ("06", "빔 높이를 2100mm로 설정하고 목재로 바꿔줘"),
        ("07", "2층 화장실 동쪽 슬래브를 오른쪽으로 200mm 이동해줘"),

        # ── 모호성 → 재질문 ───────────────────────────────────────────────
        ("08", "거실 방 크기를 좀 더 키워줘"),
        ("09", "이쪽 면 재질만 콘크리트로 바꿔줘"),

        # ── 품질 위반 ────────────────────────────────────────────────────
        ("10", "외벽 높이를 10m 넘게 아주 높게 만들어줘"),
        ("11", "담장 벽 높이를 20m로 설정해줘"),

        # ── DELETE 파이프라인 ──────────────────────────────────────────────
        ("12", "1층 거실 남쪽 외벽을 삭제해줘"),
        ("13", "옥상 지붕 삭제해줘"),
    ]

    results = []
    for num, text in test_commands:
        logger.info(f"\n💬 Input [{num}]: '{text}'")
        try:
            command = await engine.parse_command(text)
            cmd_dict = command.model_dump()
            
            logger.info(f"✅ Parsed Type: {command.command_type}")
            if command.ambiguity_question:
                logger.info(f"🤔 Ambiguity: {command.ambiguity_question}")
            
            print(json.dumps(cmd_dict, ensure_ascii=False, indent=2))
            
            results.append({
                "id": num,
                "input": text,
                "parsed_command": cmd_dict
            })
        except Exception as e:
            logger.error(f"❌ Error parsing '{text}': {e}")

    # JSON 결과 저장
    try:
        with open(json_log_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        logger.info(f"📄 JSON Log saved to: {json_log_path}")
    except Exception as e:
        logger.error(f"❌ JSON 로그 저장 실패: {e}")

if __name__ == "__main__":
    asyncio.run(test_planning_only())
