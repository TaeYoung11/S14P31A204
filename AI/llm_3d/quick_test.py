import asyncio
import os
import sys
import json

# AI/llm_3d 폴더 내부에서 파일들을 찾을 수 있도록 경로 설정
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

try:
    from pipeline import LLM3DPipeline
except ImportError:
    from .pipeline import LLM3DPipeline

async def main():
    print("🚀 AI/llm_3d 지능형 파이프라인 테스트를 시작합니다...")
    print("=" * 60)
    pipeline = LLM3DPipeline(ifc_path="sample.ifc")

    test_commands = [
        # ──── 정상 수정 (MODIFY) ────
        "1층 외벽 두께 50mm만 더 두껍게 해줘",                        # 1. 치수 변경
        "옥상 지붕을 15도 돌리고 재질은 알루미늄으로 해줘",             # 2. 회전 + 재질
        # ──── 다각형/방향 조작 (Face Offset) ────
        "안방 ㄴ자 꺾인 부분의 서쪽 벽면을 500mm 밖으로 밀어줘",       # 3. 폴리곤 — 특정 면 오프셋
        "2층 화장실 북쪽 벽을 300mm 안으로 당겨줘",                    # 4. 컴포넌트 — 방향성 오프셋
        # ──── 정책 거절 (ReadOnly) ────
        "거실 기둥 높이를 3.5m로 맞춰줄래?",                          # 5. 기둥 (ReadOnly)
        "빔 높이를 2100mm로 설정하고 목재로 바꿔줘",                   # 6. 빔 (ReadOnly)
        # ──── 모호성 → 재질문 ────
        "거실 방 크기를 좀 더 키워줘",                                 # 7. 방향 누락 → 재질문
        "이쪽 면 재질만 콘크리트로 바꿔줘",                            # 8. 대상 불명 → 재질문
        # ──── 품질 위반 ────
        "외벽 높이를 10m 넘게 아주 높게 만들어줘",                     # 9. 모호 수치 → 재질문
        "담장 벽 높이를 20m로 설정해줘"                               # 10. 20m → 품질 차단
    ]

    for i, cmd in enumerate(test_commands, 1):
        print(f"\n[{i}/{len(test_commands)}] 입력: '{cmd}'")
        try:
            preview = await pipeline.execute_preview(cmd)
            status = preview.get("status")

            # ── JSON 출력: LLM이 실제로 생성한 명령 구조 ──
            cmd_json = preview.get("command", {})
            print(f"📋 JSON 출력:")
            print(json.dumps(cmd_json, ensure_ascii=False, indent=2))

            print(f"▶ 상태: {status}")
            print(f"▶ 요약: {preview.get('summary')}")

            # 재질문이 있으면 표시
            if cmd_json.get("ambiguity_question"):
                print(f"🤖 재질문: {cmd_json['ambiguity_question']}")

            # 품질 오류 표시
            if preview.get("quality_errors"):
                print(f"🚨 품질오류: {preview['quality_errors']}")

            # 정상이면 Apply 실행
            if status == "preview_ready":
                res = await pipeline.execute_apply(preview.get("session_id"))
                print(f"✅ 최종적용: {res.get('summary')}")

        except Exception as e:
            print(f"❌ 에러: {e}")
        print("-" * 60)

if __name__ == "__main__":
    asyncio.run(main())
