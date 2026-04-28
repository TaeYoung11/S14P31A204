import asyncio
import os
import json
import logging
from datetime import datetime
from ai_planning_3d.pipeline import LLM3DPipeline

# 로그 설정
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
LOG_DIR = os.path.join(os.path.expanduser("~"), "Downloads")
log_file = os.path.join(LOG_DIR, f"test_3d_engine_{TIMESTAMP}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.FileHandler(log_file, mode="w", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("LLM_3D_Test")
test_file_logger = logging.getLogger("LLM_3D_Test.detail")
test_file_logger.propagate = False
test_file_handler = logging.FileHandler(log_file, mode="a", encoding="utf-8")
test_file_handler.setFormatter(
    logging.Formatter("%(asctime)s [%(levelname)s] %(name)s — %(message)s")
)
test_file_logger.addHandler(test_file_handler)
test_file_logger.setLevel(logging.INFO)


def emit(message: str = "") -> None:
    try:
        print(message, flush=True)
    except UnicodeEncodeError:
        # 이모지 등 cp949에서 출력 불가능한 문자가 있을 경우 안전하게 무시하고 출력
        print(message.encode("ascii", "ignore").decode("ascii"), flush=True)
    try:
        test_file_logger.info(message)
    except Exception:
        pass


# 새 패키지 구조에서 임포트 (상단 이동 완료)

# ── 경로 설정 ────────────────────────────────────────────────────────────────
IFC_PATH = os.path.join(os.path.expanduser("~"), "Downloads", "batang_sample.ifc")
OUTPUT_PATH = os.path.join(LOG_DIR, f"batang_sample_modified_{TIMESTAMP}.ifc")
JSON_LOG_PATH = os.path.join(LOG_DIR, f"test_3d_logs_{TIMESTAMP}.json")


async def main():
    emit("\n🚀 [LLM_3D] Intelligent Pipeline Test")
    emit("=" * 70)

    if not os.path.exists(IFC_PATH):
        emit(f"❌ IFC 파일 없음: {IFC_PATH}")
        return

    emit(f"📂 IFC 파일: {IFC_PATH}")
    pipeline = LLM3DPipeline(ifc_path=IFC_PATH)

    json_logs = []
    test_commands = [
        # ── 정상 수정 ─────────────────────────────────────────────
        ("01", "1층 외벽 두께 50mm만 더 두껍게 해줘", "preview_ready", "width RELATIVE +50"),
        (
            "02",
            "옥상 지붕을 15도 돌리고 재질은 유리로 바꿔줘",
            "preview_ready",
            "rotation + Glass material",
        ),
        # ── 다각형/방향 조작 ───────────────────────────────
        (
            "03",
            "안방 ㄴ자 꺾인 부분의 서쪽 벽면을 500mm 밖으로 밀어줘",
            "preview_ready",
            "Bedroom West face_offset +500",
        ),
        (
            "04",
            "2층 화장실 북쪽 벽을 300mm 안으로 당겨줘",
            "preview_ready",
            "Bathroom North face_offset -300",
        ),
        # ── ReadOnly 부재 — 치수 변경은 차단, 이동은 허용 ────────────────
        (
            "05",
            "거실 기둥 높이를 3.5m로 맞춰줄래?",
            "not_found",
            "IfcColumn → IFC에 없어 not_found",
        ),
        (
            "06",
            "빔 높이를 2100mm로 설정하고 목재로 바꿔줘",
            "not_found",
            "IfcBeam → IFC에 없어 not_found",
        ),
        (
            "07",
            "2층 화장실 동쪽 슬래브를 오른쪽으로 200mm 이동해줘",
            "not_found",
            "IfcSlab 이동 (파싱은 정상)",
        ),
        # ── 모호성 → 재질문 ───────────────────────────────────────────────
        ("08", "거실 방 크기를 좀 더 키워줘", "needs_clarification", "방향 누락"),
        ("09", "이쪽 면 재질만 콘크리트로 바꿔줘", "needs_clarification", "대상 불명"),
        # ── 품질 위반 ────────────────────────────────────────────────────
        (
            "10",
            "외벽 높이를 10m 넘게 아주 높게 만들어줘",
            "needs_clarification",
            "수치 모호/품질 차단",
        ),
        (
            "11",
            "담장 벽 높이를 20m로 설정해줘",
            "failed_quality_check",
            "20000mm → 범위 초과",
        ),
        # ── DELETE 파이프라인 ──────────────────────────────────────────────
        (
            "12",
            "1층 거실 남쪽 외벽을 삭제해줘",
            "preview_ready",
            "DELETE — 1F LivingRoom South",
        ),
        ("13", "옥상 지붕 삭제해줘", "preview_ready", "DELETE — RF Roof"),
        # ── CREATE 파이프라인 ───────────────────────────────────
        (
            "14",
            "1층 거실 북쪽에 검정색 벽 하나 세워줘",
            "preview_ready",
            "CREATE — 1F LivingRoom North + Black",
        ),
        (
            "15",
            "옥상에 빨간색 박공지붕 만들어줘",
            "preview_ready",
            "CREATE — RF Roof + Red + GABLED",
        ),
        (
            "16",
            "지붕 재질을 알루미늄으로 해줘",
            "needs_clarification",
            "Aluminum unsupported",
        ),
    ]

    for num, cmd, expected_status, note in test_commands:
        emit(f"\n[{num}/{len(test_commands):02d}] 💬 '{cmd}'")
        emit(f"       📌 기대: {expected_status} ({note})")
        try:
            preview = await pipeline.execute_preview(cmd)
            status = preview.get("status")
            cmd_json = preview.get("command", {})

            # LLM JSON 출력
            emit("📋 LLM JSON:")
            emit(json.dumps(cmd_json, ensure_ascii=False, indent=2))

            json_logs.append(
                {
                    "test_case": num,
                    "instruction": cmd,
                    "expected": expected_status,
                    "status": status,
                    "pass": status == expected_status,
                    "llm_response": cmd_json,
                    "summary": preview.get("summary"),
                }
            )

            status_icon = "✅" if status == expected_status else "⚠️ "
            emit(f"{status_icon} 상태: {status} (기대: {expected_status})")

            if cmd_json.get("ambiguity_question"):
                emit(f"🤔 재질문: {cmd_json['ambiguity_question']}")

            # 정상이면 Apply 실행
            if status == "preview_ready":
                res = await pipeline.execute_apply(preview["session_id"], output_path=OUTPUT_PATH)
                apply_icon = "✅" if res.get("status") == "applied" else "❌"
                emit(f"{apply_icon} 적용 결과: {res.get('summary')}")

        except Exception as e:
            emit(f"❌ 에러: {e}")

        emit("-" * 70)

    # ── 최종 결과 요약 ────────────────────────────────────────────────────────
    total = len(json_logs)
    passed = sum(1 for r in json_logs if r["pass"])
    emit(f"\n🏁 테스트 완료: {passed}/{total} PASS")
    emit(f"📂 출력 파일: {OUTPUT_PATH}")

    try:
        with open(JSON_LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(json_logs, f, ensure_ascii=False, indent=2)
        emit(f"📄 JSON 로그: {JSON_LOG_PATH}")
    except Exception as e:
        emit(f"❌ JSON 로그 저장 실패: {e}")


if __name__ == "__main__":
    asyncio.run(main())
