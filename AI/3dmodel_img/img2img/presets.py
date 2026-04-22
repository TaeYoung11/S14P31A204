"""프리셋 로드 및 검증 — YAML → RenderParams 변환.

공개 API:
    list_presets()      — 프리셋 이름 정렬 리스트.
    load_preset(name)   — YAML → RenderParams (Step 3-2 에서 추가).

설계 포인트:
    - 모든 로드 실패는 PresetNotFoundError 로 통합.
    - 화이트리스트 기반 필드 검증으로 조용한 실패 차단.
    - 프리셋 디렉토리는 패키지 내부 (img2img/presets/) — editable / 정식
      install 모두 작동.
"""

from __future__ import annotations

from pathlib import Path

_PRESET_DIR = Path(__file__).parent / "presets"


def list_presets() -> list[str]:
    """사용 가능한 프리셋 이름을 정렬된 리스트로 반환.

    디렉토리 자체가 없어도 예외 없이 빈 리스트 반환 (정상 경로로 처리).
    """
    if not _PRESET_DIR.exists():
        return []
    return sorted(p.stem for p in _PRESET_DIR.glob("*.yaml"))