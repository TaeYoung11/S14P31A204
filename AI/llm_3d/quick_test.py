import asyncio
import os
import sys
import json
import logging

# Windows 한글 깨짐 방지
if sys.platform == 'win32':
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    except:
        pass

# AI/llm_3d 폴더 내부에서 파일들을 찾을 수 있도록 경로 설정
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

try:
    from pipeline import LLM3DPipeline
except ImportError:
    from .pipeline import LLM3DPipeline

# ---- 테스트 설정 ----
# 실제 IFC 파일이 있다면 아래 경로를 수정하세요.
IFC_PATH = r"C:\Users\SSAFY\Downloads\batang_sample.ifc"

async def main():
    print("🚀 [AI/llm_3d] Intelligent Pipeline Test Start...", flush=True)
    print("=" * 60, flush=True)
    
    if os.path.exists(IFC_PATH):
        print(f"Using Real IFC: {IFC_PATH}", flush=True)
        pipeline = LLM3DPipeline(ifc_path=IFC_PATH)
    else:
        print(f"File not found. Using Mock mode: {IFC_PATH}", flush=True)
        # Mock 모드일 때는 ifc_model을 None으로 넘겨도 IFCQueryEngine이 경고를 띄웁니다.
        pipeline = LLM3DPipeline(ifc_path=IFC_PATH)

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
        print(f"\n[{i}/{len(test_commands)}] 💬 입력: '{cmd}'", flush=True)
        try:
            preview = await pipeline.execute_preview(cmd)
            status = preview.get("status")

            # ── JSON 출력: LLM이 실제로 생성한 명령 구조 ──
            cmd_json = preview.get("command", {})
            print(f"📋 JSON 출력:", flush=True)
            print(json.dumps(cmd_json, ensure_ascii=False, indent=2), flush=True)

            print(f"▶ 상태: {status}", flush=True)
            print(f"📝 요약: {preview.get('summary')}", flush=True)

            # 재질문이 있으면 표시
            if cmd_json.get("ambiguity_question"):
                print(f"🤖 재질문: {cmd_json['ambiguity_question']}", flush=True)

            # 품질 오류 표시
            if preview.get("quality_errors"):
                print(f"🚨 품질 오류: {preview['quality_errors']}", flush=True)

            # 정상이면 Apply 실행
            if status == "preview_ready":
                res = await pipeline.execute_apply(preview.get("session_id"))
                print(f"✅ 최종 적용: {res.get('summary')}", flush=True)

        except Exception as e:
            print(f"❌ 에러: {e}", flush=True)
        print("-" * 60, flush=True)

if __name__ == "__main__":
    asyncio.run(main())
