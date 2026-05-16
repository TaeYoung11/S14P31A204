import asyncio
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from tempfile import gettempdir

import pytest

from ai_planning_3d.engine import LLM3DEngine

logger = logging.getLogger("Planning_Test")

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_LIVE_PLANNING_3D_TEST") != "1",
    reason="set RUN_LIVE_PLANNING_3D_TEST=1 to enable live 3D planning test",
)


def _configure_logger() -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    log_dir = Path(gettempdir()) / "batang_history"
    log_dir.mkdir(parents=True, exist_ok=True)

    log_file = log_dir / f"planning_test_{timestamp}.log"
    json_log_path = log_dir / f"planning_test_{timestamp}.json"

    if not logger.handlers:
        logger.setLevel(logging.INFO)
        formatter = logging.Formatter("[%(asctime)s] %(message)s")

        file_handler = logging.FileHandler(log_file, mode="w", encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)

    return json_log_path


@pytest.mark.asyncio
async def test_planning_only():
    json_log_path = _configure_logger()
    logger.info("[LLM_3D] Planning Engine Test (NL -> JSON Command)")
    logger.info("=" * 70)

    engine = LLM3DEngine()
    test_commands = [
        ("01", "1층 외벽 두께를 50mm만큼 두껍게 해줘"),
        ("02", "옥상 지붕을 15도 올리고 색상을 블루로 해줘"),
        ("03", "안방 화장실 부분의 서쪽 벽면을 500mm 밖으로 빼줘"),
        ("04", "2층 주방의 북쪽 벽을 300mm 안으로 밀어줘"),
        ("05", "거실 기둥 높이를 3.5m로 맞춰줄래?"),
        ("06", "빔 높이를 2100mm로 설정하고 목재로 바꿔줘"),
        ("07", "2층 주방의 동쪽 슬래브를 오른쪽으로 200mm 이동해줘"),
        ("08", "거실 문 크기를 조금 더 넓혀줘"),
        ("09", "외벽 면 색상만 콘크리트로 바꿔줘"),
        ("10", "외벽 높이를 10m 정도 아주 높게 만들어줘"),
        ("11", "주방 벽 높이를 20m로 설정해줘"),
        ("12", "1층 거실 창문 외벽을 제거해줘"),
        ("13", "옥상 지붕을 제거해줘"),
    ]

    results = []
    for num, text in test_commands:
        logger.info("\nInput [%s]: %s", num, text)
        try:
            command = await engine.parse_command(text)
            cmd_dict = command.model_dump()

            logger.info("Parsed Type: %s", command.command_type)
            if command.ambiguity_question:
                logger.info("Ambiguity: %s", command.ambiguity_question)

            print(json.dumps(cmd_dict, ensure_ascii=False, indent=2))

            results.append(
                {
                    "id": num,
                    "input": text,
                    "parsed_command": cmd_dict,
                }
            )
        except Exception as exc:
            logger.error("Error parsing %s: %s", text, exc)

    with open(json_log_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    logger.info("JSON log saved to: %s", json_log_path)


if __name__ == "__main__":
    asyncio.run(test_planning_only())
