"""프리셋 로드 및 검증 — YAML → RenderParams 변환.

공개 API:
    list_presets()      — 프리셋 이름 정렬 리스트.
    load_preset(name)   — YAML → RenderParams.

설계 포인트:
    - 모든 로드 실패는 PresetNotFoundError 로 통합.
    - 화이트리스트 기반 필드 검증으로 조용한 실패 차단.
    - 프리셋 디렉토리는 패키지 내부 (img2img/presets/) — editable / 정식
      install 모두 작동.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from .exceptions import PresetNotFoundError
from .pipeline import RenderParams

_PRESET_DIR = Path(__file__).parent / "presets"

_ALLOWED_FIELDS = {
    "prompt",
    "negative_prompt",
    "strength",
    "guidance_scale",
    "num_inference_steps",
}
_REQUIRED_FIELDS = {"prompt"}
_VALID_NAME = re.compile(r"[A-Za-z0-9_-]+")


def list_presets() -> list[str]:
    """사용 가능한 프리셋 이름을 정렬된 리스트로 반환.

    디렉토리 자체가 없어도 예외 없이 빈 리스트 반환 (정상 경로로 처리).
    """
    if not _PRESET_DIR.exists():
        return []
    return sorted(p.stem for p in _PRESET_DIR.glob("*.yaml"))


def load_preset(name: str) -> RenderParams:
    """프리셋 이름 → RenderParams. 모든 실패는 PresetNotFoundError.

    검증 순서:
        1) 이름 유효성 (영문/숫자/'_'/'-' 만, 경로 구분자·상대경로 차단)
        2) 파일 존재
        3) YAML 파싱 성공
        4) 루트가 YAML mapping (dict)
        5) 필수 필드 'prompt' 존재
        6) 모든 키가 화이트리스트 안 (미지원/오타 필드 차단)
    """
    if not _VALID_NAME.fullmatch(name):
        raise PresetNotFoundError(
            f"invalid preset name: '{name}'. "
            "allowed characters: letters, digits, '_', '-'"
        )

    path = _PRESET_DIR / f"{name}.yaml"

    if not path.exists():
        raise PresetNotFoundError(
            f"preset '{name}' not found. available: {list_presets()}"
        )

    try:
        with open(path, encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise PresetNotFoundError(f"preset '{name}' malformed YAML: {e}") from e

    if not isinstance(cfg, dict):
        raise PresetNotFoundError(
            f"preset '{name}' must be a YAML mapping, got {type(cfg).__name__}"
        )

    missing = _REQUIRED_FIELDS - cfg.keys()
    if missing:
        raise PresetNotFoundError(
            f"preset '{name}' missing required field(s): {sorted(missing)}"
        )

    unknown = cfg.keys() - _ALLOWED_FIELDS
    if unknown:
        raise PresetNotFoundError(
            f"preset '{name}' has unknown fields: {sorted(unknown)}. "
            f"allowed: {sorted(_ALLOWED_FIELDS)}"
        )

    return RenderParams(**cfg)