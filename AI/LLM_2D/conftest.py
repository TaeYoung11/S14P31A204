"""
conftest.py — LLM_2D 테스트용 pytest 설정.
sys.path에 LLM_2D 디렉터리를 추가해 로컬 모듈을 임포트할 수 있게 한다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
