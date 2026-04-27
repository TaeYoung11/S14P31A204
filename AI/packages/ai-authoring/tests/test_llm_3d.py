"""
LLM_3D 통합 테스트
===================
샘플 IFC: batang_sample.ifc (동일 폴더 내)
출력 IFC: batang_sample_modified.ifc

테스트 구조:
  1F: Living Room (거실) 4면 벽
  2F: Bathroom(화장실) 4면 벽, Bedroom(안방) 4면 벽
  RF: Roof
"""
import asyncio
import os
import sys
import json
import logging

# 로깅 설정 (DEBUG 수준은 파일로, INFO+ 는 콘솔)
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

# 모듈 경로 설정 (src 디렉터리를 path에 추가하여 패키지 인식 보장)
current_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.join(os.path.dirname(current_dir), "src")
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

from ai_authoring.llm_3d import LLM3DPipeline

# ── 경로 설정 ────────────────────────────────────────────────────────────────
IFC_PATH    = os.path.join(os.path.expanduser("~"), "Downloads", "batang_sample.ifc")
OUTPUT_PATH = os.path.join(os.path.expanduser("~"), "Downloads", "batang_sample_modified.ifc")


async def main():
    print("🚀 [LLM_3D] Intelligent Pipeline Test", flush=True)
    print("=" * 65, flush=True)

    if not os.path.exists(IFC_PATH):
        print(f"❌ IFC 파일 없음: {IFC_PATH}", flush=True)
        print("   → scratch_3d_sample.py 를 먼저 실행하세요.", flush=True)
        return

    print(f"📂 IFC 파일: {IFC_PATH}", flush=True)
    pipeline = LLM3DPipeline(ifc_path=IFC_PATH)
    
    json_logs = []

    test_commands = [
        # ── 정상 수정 (MODIFY) ─────────────────────────────────────────────
        "1층 외벽 두께 50mm만 더 두껍게 해줘",                         # 1. width RELATIVE
        "옥상 지붕을 15도 돌리고 재질은 알루미늄으로 해줘",              # 2. rotation + material
        # ── 다각형/방향 조작 (Face Offset) ───────────────────────────────
        "안방 ㄴ자 꺾인 부분의 서쪽 벽면을 500mm 밖으로 밀어줘",        # 3. Bedroom West face_offset +500
        "2층 화장실 북쪽 벽을 300mm 안으로 당겨줘",                     # 4. Bathroom North face_offset -300
        # ── 정책 거절 (ReadOnly) ──────────────────────────────────────────
        "거실 기둥 높이를 3.5m로 맞춰줄래?",                           # 5. IfcColumn → ReadOnly
        "빔 높이를 2100mm로 설정하고 목재로 바꿔줘",                    # 6. IfcBeam → ReadOnly
        # ── 모호성 → 재질문 ───────────────────────────────────────────────
        "거실 방 크기를 좀 더 키워줘",                                  # 7. 방향 누락 → 재질문
        "이쪽 면 재질만 콘크리트로 바꿔줘",                             # 8. 대상 불명 → 재질문
        # ── 품질 위반 ────────────────────────────────────────────────────
        "외벽 높이를 10m 넘게 아주 높게 만들어줘",                      # 9. 모호 수치 → 재질문 또는 품질차단
        "담장 벽 높이를 20m로 설정해줘",                               # 10. 20000mm → 품질 차단
    ]

    for i, cmd in enumerate(test_commands, 1):
        print(f"\n[{i:02d}/{len(test_commands)}] 💬 '{cmd}'", flush=True)
        try:
            preview = await pipeline.execute_preview(cmd)
            status  = preview.get("status")
            cmd_json = preview.get("command", {})

            # JSON 구조 출력
            print("📋 LLM JSON:", flush=True)
            print(json.dumps(cmd_json, ensure_ascii=False, indent=2), flush=True)

            json_logs.append({
                "test_case": f"{i:02d}",
                "instruction": cmd,
                "status": status,
                "llm_response": cmd_json,
                "summary": preview.get("summary"),
                "quality_errors": preview.get("quality_errors", [])
            })

            print(f"▶  상태: {status}", flush=True)
            print(f"📝 요약: {preview.get('summary')}", flush=True)

            if cmd_json.get("ambiguity_question"):
                print(f"🤔 재질문: {cmd_json['ambiguity_question']}", flush=True)

            if preview.get("quality_errors"):
                print(f"🚨 품질 오류: {preview['quality_errors']}", flush=True)

            # 정상이면 Apply 실행
            if status == "preview_ready":
                res = await pipeline.execute_apply(
                    preview["session_id"],
                    output_path=OUTPUT_PATH,
                )
                print(f"✅ 적용 결과: {res.get('summary')}", flush=True)

        except Exception as e:
            print(f"❌ 에러: {e}", flush=True)
            import traceback
            traceback.print_exc()

        print("-" * 65, flush=True)

    print(f"\n🏁 테스트 완료. 출력 파일: {OUTPUT_PATH}", flush=True)
    
    log_path = os.path.join(os.path.expanduser("~"), "Downloads", "test_3d_logs.json")
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(json_logs, f, ensure_ascii=False, indent=2)
    print(f"📄 JSON 로그 저장 완료: {log_path}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())