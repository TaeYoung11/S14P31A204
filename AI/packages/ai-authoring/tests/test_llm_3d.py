"""
LLM_3D 통합 테스트  (Phase 2 반영)
=====================================
샘플 IFC: batang_sample.ifc  (~/Downloads 에 위치해야 함)
출력 IFC: batang_sample_modified.ifc

테스트 구조 (batang_sample.ifc):
  1F: Living Room (거실) 4면 벽 + 바닥 슬래브
  2F: Bathroom(화장실) 4면 벽, Bedroom(안방) 4면 벽 + 바닥 슬래브
  RF: Roof 1개

사전 조건:
  - Ollama 실행 중 + qwen2.5:7b 모델 로드 상태여야 합니다.
    $ ollama serve
    $ ollama pull qwen2.5:7b
"""
import asyncio
import os
import sys
import json
import logging
from datetime import datetime

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)

# Windows 한글 깨짐 방지
if sys.platform == "win32":
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    except Exception:
        pass

# 모듈 경로 설정 (tests/ → ai-authoring/ → src/)
current_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.join(os.path.dirname(current_dir), "src")
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

from ai_authoring.llm_3d import LLM3DPipeline

# ── 경로 설정 ────────────────────────────────────────────────────────────────
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
IFC_PATH    = os.path.join(os.path.expanduser("~"), "Downloads", "batang_sample.ifc")
OUTPUT_PATH = os.path.join(os.path.expanduser("~"), "Downloads", f"batang_sample_modified_{TIMESTAMP}.ifc")


async def main():
    print("🚀 [LLM_3D] Intelligent Pipeline Test  (Phase 2)", flush=True)
    print("=" * 65, flush=True)

    if not os.path.exists(IFC_PATH):
        print(f"❌ IFC 파일 없음: {IFC_PATH}", flush=True)
        print("   → scratch_3d_sample.py 를 먼저 실행하세요.", flush=True)
        return

    print(f"📂 IFC 파일: {IFC_PATH}", flush=True)
    pipeline = LLM3DPipeline(ifc_path=IFC_PATH)

    json_logs = []

    # ──────────────────────────────────────────────────────────────────────────
    # 기대 status 표:
    #   preview_ready         → 품질 검증 통과, apply 가능
    #   failed_quality_check  → 품질 검증 실패
    #   needs_clarification   → LLM 재질문
    #   not_found             → IFC에서 대상 요소 못 찾음
    # ──────────────────────────────────────────────────────────────────────────
    test_commands = [
        # ── 정상 수정 (MODIFY) ─────────────────────────────────────────────
        ("01", "1층 외벽 두께 50mm만 더 두껍게 해줘",
               "preview_ready",    "width RELATIVE +50"),

        ("02", "옥상 지붕을 15도 돌리고 재질은 알루미늄으로 해줘",
               "preview_ready",    "rotation + material"),

        # ── 다각형/방향 조작 (Face Offset) ───────────────────────────────
        ("03", "안방 ㄴ자 꺾인 부분의 서쪽 벽면을 500mm 밖으로 밀어줘",
               "preview_ready",    "Bedroom West face_offset +500"),

        ("04", "2층 화장실 북쪽 벽을 300mm 안으로 당겨줘",
               "preview_ready",    "Bathroom North face_offset -300"),

        # ── Phase 2: ReadOnly 부재 — 치수 변경은 차단, 이동은 허용 ──────
        # (※ batang_sample.ifc에는 IfcColumn/IfcBeam 없음 → not_found 예상)
        ("05", "거실 기둥 높이를 3.5m로 맞춰줄래?",
               "not_found",        "IfcColumn 치수변경 → IFC에 기둥 없어 not_found"),

        ("06", "빔 높이를 2100mm로 설정하고 목재로 바꿔줘",
               "not_found",        "IfcBeam → IFC에 보 없어 not_found"),

        # (※ 마찬가지로 기둥/문/창이 없으므로 not_found가 되지만, 파싱 자체는
        #    정상 MODIFY + position_mm로 나와야 함 → command JSON 확인용)
        ("07", "2층 화장실 동쪽 슬래브를 오른쪽으로 200mm 이동해줘",
               "not_found",        "IfcSlab 이동 → 위치 변경은 허용(파싱 정상), 단 not_found"),

        # ── 모호성 → 재질문 ───────────────────────────────────────────────
        ("08", "거실 방 크기를 좀 더 키워줘",
               "needs_clarification", "방향 누락"),

        ("09", "이쪽 면 재질만 콘크리트로 바꿔줘",
               "needs_clarification", "대상 불명"),

        # ── 품질 위반 ────────────────────────────────────────────────────
        ("10", "외벽 높이를 10m 넘게 아주 높게 만들어줘",
               "needs_clarification", "수치 모호 → 재질문 또는 품질차단"),

        ("11", "담장 벽 높이를 20m로 설정해줘",
               "failed_quality_check", "20000mm → height 범위 초과"),

        # ── Phase 2 핵심: DELETE 파이프라인 ──────────────────────────────
        # 실제 삭제는 apply까지 돌려서 관계 엔티티가 깔끔히 지워지는지 확인
        ("12", "1층 거실 남쪽 외벽을 삭제해줘",
               "preview_ready",    "DELETE — 1F LivingRoom South Wall"),

        ("13", "옥상 지붕 삭제해줘",
               "preview_ready",    "DELETE — RF Roof"),
    ]

    for num, cmd, expected_status, note in test_commands:
        print(f"\n[{num}/{len(test_commands):02d}] 💬 '{cmd}'", flush=True)
        print(f"       📌 기대: {expected_status}  ({note})", flush=True)
        try:
            preview = await pipeline.execute_preview(cmd)
            status  = preview.get("status")
            cmd_json = preview.get("command", {})

            # LLM JSON 출력
            print("📋 LLM JSON:", flush=True)
            print(json.dumps(cmd_json, ensure_ascii=False, indent=2), flush=True)

            json_logs.append({
                "test_case":     num,
                "instruction":   cmd,
                "expected":      expected_status,
                "status":        status,
                "pass":          status == expected_status,
                "llm_response":  cmd_json,
                "summary":       preview.get("summary"),
                "quality_errors": preview.get("quality_errors", []),
            })

            status_icon = "✅" if status == expected_status else "⚠️ "
            print(f"{status_icon} 상태: {status}  (기대: {expected_status})", flush=True)
            print(f"📝 요약: {preview.get('summary')}", flush=True)

            if cmd_json.get("ambiguity_question"):
                print(f"🤔 재질문: {cmd_json['ambiguity_question']}", flush=True)

            if preview.get("quality_errors"):
                print(f"🚨 품질 오류: {preview['quality_errors']}", flush=True)

            # 정상이면 Apply 실행 (MODIFY / DELETE 모두)
            if status == "preview_ready":
                res = await pipeline.execute_apply(
                    preview["session_id"],
                    output_path=OUTPUT_PATH,
                )
                apply_icon = "✅" if res.get("status") == "applied" else "❌"
                print(f"{apply_icon} 적용 결과: {res.get('summary')}", flush=True)

        except Exception as e:
            print(f"❌ 에러: {e}", flush=True)
            import traceback
            traceback.print_exc()

        print("-" * 65, flush=True)

    # ── 최종 결과 요약 ────────────────────────────────────────────────────────
    total  = len(json_logs)
    passed = sum(1 for r in json_logs if r["pass"])
    print(f"\n🏁 테스트 완료: {passed}/{total} PASS", flush=True)
    print(f"📂 출력 파일: {OUTPUT_PATH}", flush=True)

    log_path = os.path.join(os.path.expanduser("~"), "Downloads", f"test_3d_logs_{TIMESTAMP}.json")
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(json_logs, f, ensure_ascii=False, indent=2)
    print(f"📄 JSON 로그: {log_path}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())