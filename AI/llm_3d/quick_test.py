import asyncio
import os
import sys

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
    pipeline = LLM3DPipeline(ifc_path="sample.ifc")
    
    test_commands = [
        "1층 외벽 두께 50mm만 더 두껍게 해줘",
        "거실 모든 기둥 높이를 3.5m로 맞춰줘",
        "2층 창문 프레임을 알루미늄으로 바꿔줘",
        "지하 1층 바닥 두께 100mm 줄이고 색상은 진회색으로 해줘",
        "옥상에 있는 불필요한 보 다 지워줘",
        "내벽 좀 얇게 만들어줄래?",
        "1층 모든 문 높이를 2100mm로 설정하고 재질은 목재로 해",
        "기둥 높이를 4.2m로 높이고 빨간색으로 칠해줘",
        "담장 벽 높이를 15m로 올려줘",
        "재질만 콘크리트로 바꿔줘"
    ]
    
    for i, cmd in enumerate(test_commands, 1):
        print(f"\n[{i}/{len(test_commands)}] 입력: '{cmd}'")
        try:
            preview = await pipeline.execute_preview(cmd)
            print(f"상태: {preview.get('status')}")
            print(f"요약: {preview.get('summary')}")
            
            if preview.get('status') == 'preview_ready':
                res = await pipeline.execute_apply(preview.get('session_id'))
                print(f"최종: {res.get('status')} - {res.get('summary')}")
            elif preview.get('status') == 'failed_quality_check':
                print(f"🚨 오류: {preview.get('quality_errors')}")
        except Exception as e:
            print(f"❌ 에러: {e}")
        print("-" * 50)

if __name__ == "__main__":
    asyncio.run(main())
