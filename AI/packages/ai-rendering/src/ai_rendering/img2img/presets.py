"""프리셋 로드 및 검증 — YAML → RenderParams 변환.

공개 API:
    list_presets()      — 프리셋 이름 정렬 리스트.
    load_preset(name)   — YAML → RenderParams.

설계 포인트:
    - 프롬프트 자산(prompt/negative_prompt): AI_PROMPTS_DIR 환경변수 경로
      (기본값: presets.py 기준으로 AI 루트의 prompts/tasks/rendering/img2img/v1/presets/)
    - 렌더링 파라미터(strength 등): 패키지 내부 img2img/presets/
    - 두 소스를 머지해 RenderParams 반환.
    - 모든 로드 실패는 PresetNotFoundError 로 통합.
    - 화이트리스트 기반 필드 검증으로 조용한 실패 차단.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import yaml  # type: ignore[import-untyped]

from .exceptions import PresetNotFoundError
from .pipeline import RenderParams

_PRESET_DIR = Path(__file__).parent / "presets"

_AI_ROOT = Path(__file__).parents[5]
_PROMPTS_DIR = Path(
    os.getenv("AI_PROMPTS_DIR", str(_AI_ROOT / "prompts"))
) / "tasks/rendering/img2img/v1/presets"

_PROMPT_FIELDS = {"prompt", "negative_prompt"}
_REQUIRED_PROMPT_FIELDS = {"prompt"}
_PARAMS_FIELDS = {"strength", "guidance_scale", "num_inference_steps"}

_VALID_NAME = re.compile(r"[A-Za-z0-9_-]+")


def list_presets() -> list[str]:
    """사용 가능한 프리셋 이름을 정렬된 리스트로 반환.

    디렉토리 자체가 없어도 예외 없이 빈 리스트 반환 (정상 경로로 처리).
    """
    if not _PRESET_DIR.exists():
        return []
    return sorted(p.stem for p in _PRESET_DIR.glob("*.yaml"))


def _load_yaml_mapping(path: Path, name: str) -> dict:  # type: ignore[type-arg]
    """YAML 파일을 읽어 dict 반환. 실패 시 PresetNotFoundError."""
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
    return cfg


def load_preset(name: str) -> RenderParams:
    """프리셋 이름 → RenderParams. 모든 실패는 PresetNotFoundError.

    검증 순서:
        1) 이름 유효성 (영문/숫자/'_'/'-' 만, 경로 구분자·상대경로 차단)
        2) 프롬프트 YAML 존재 및 파싱 (_PROMPTS_DIR)
        3) 필수 필드 'prompt' 존재, 모든 키가 prompt 화이트리스트 안
        4) 파라미터 YAML 존재 및 파싱 (_PRESET_DIR)
        5) 모든 키가 params 화이트리스트 안
        6) 두 소스 머지 → RenderParams
    """
    if not _VALID_NAME.fullmatch(name):
        raise PresetNotFoundError(
            f"invalid preset name: '{name}'. "
            "allowed characters: letters, digits, '_', '-'"
        )

    prompt_cfg = _load_yaml_mapping(_PROMPTS_DIR / f"{name}.yaml", name)
    missing = _REQUIRED_PROMPT_FIELDS - prompt_cfg.keys()
    if missing:
        raise PresetNotFoundError(
            f"preset '{name}' missing required field(s): {sorted(missing)}"
        )
    unknown_prompt = prompt_cfg.keys() - _PROMPT_FIELDS
    if unknown_prompt:
        raise PresetNotFoundError(
            f"preset '{name}' has unknown fields: {sorted(unknown_prompt)}. "
            f"allowed: {sorted(_PROMPT_FIELDS)}"
        )

    params_cfg = _load_yaml_mapping(_PRESET_DIR / f"{name}.yaml", name)
    unknown_params = params_cfg.keys() - _PARAMS_FIELDS
    if unknown_params:
        raise PresetNotFoundError(
            f"preset '{name}' has unknown fields: {sorted(unknown_params)}. "
            f"allowed: {sorted(_PARAMS_FIELDS)}"
        )

    return RenderParams(**{**prompt_cfg, **params_cfg})
