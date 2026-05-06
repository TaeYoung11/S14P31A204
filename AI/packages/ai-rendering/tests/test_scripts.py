"""scripts/* 단위 테스트 — importlib로 동적 로드.

scripts/는 패키지가 아니라 ad-hoc 실행 스크립트이므로 importlib.util로 모듈
spec 만든 후 검증한다. ai-rendering tests에 위치 — 사용자 작업 범위(ifc2img +
scripts/tests) 일관 + `pytest packages/ai-rendering` 회귀에 자연스럽게 잡힘.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts"


def _load_script(name: str) -> ModuleType:
    """scripts/<name>를 module로 동적 로드 — 패키지가 아니라 importlib 필요."""
    path = SCRIPTS_DIR / name
    spec = importlib.util.spec_from_file_location(f"_script_{name.replace('.py', '')}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --- _display_path 외부 경로 fallback ---


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_returns_relative_for_root_internal_path(script_name: str) -> None:
    """ROOT 내부 경로는 짧은 상대경로 반환 — 정상 케이스 가독성 보존."""
    m = _load_script(script_name)

    inside = m.ROOT / "outputs" / "foo.png"
    result = m._display_path(inside)

    # ROOT 내부면 절대 경로보다 짧음 (anchor가 없어짐)
    assert not result.is_absolute()
    assert result == Path("outputs") / "foo.png"


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_returns_absolute_for_root_external_path(script_name: str) -> None:
    """ROOT 바깥 경로는 절대경로 그대로 반환 — ValueError 안 남.

    `out_path.relative_to(ROOT)`이 ROOT 바깥 경로(예: 다른 드라이브)에서 ValueError로
    프로세스가 죽으므로 try/except로 fallback해 절대경로 그대로 출력한다.
    """
    m = _load_script(script_name)

    # 플랫폼 무관 — REPO_ROOT 부모 디렉토리(절대 anchor가 다른 경로) 사용 시 외부 경로.
    # parents[-1] = anchor (예: C:\). REPO_ROOT보다 상위 anchor 인접 경로면 ROOT 바깥.
    outside = m.ROOT.parent.parent / "definitely_outside_repo_root_xyz" / "foo.png"

    result = m._display_path(outside)

    # ROOT 바깥이라 fallback = 절대경로 그대로
    assert result == outside
    assert result.is_absolute()


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_does_not_raise_value_error(script_name: str) -> None:
    """외부 경로에서도 ValueError 발생 안 함 — 회귀 가드."""
    m = _load_script(script_name)
    outside = Path("/some/absolute/external/path/foo.png").resolve()

    # ValueError 발생 없이 정상 호출
    m._display_path(outside)
