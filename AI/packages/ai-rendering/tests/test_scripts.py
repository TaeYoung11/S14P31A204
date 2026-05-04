"""Importlib-based tests for ad-hoc scripts under scripts/."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts"


def _load_script(name: str) -> ModuleType:
    """Load scripts/<name> as a module without executing it as __main__."""
    path = SCRIPTS_DIR / name
    spec = importlib.util.spec_from_file_location(f"_script_{name.replace('.py', '')}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_returns_relative_for_root_internal_path(script_name: str) -> None:
    """ROOT-internal paths should be shown as repo-relative paths."""
    m = _load_script(script_name)

    inside = m.ROOT / "outputs" / "foo.png"
    result = m._display_path(inside)

    assert not result.is_absolute()
    assert result == Path("outputs") / "foo.png"


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_returns_absolute_for_root_external_path(script_name: str) -> None:
    """ROOT-external paths should fall back to absolute paths."""
    m = _load_script(script_name)

    outside = m.ROOT.parent.parent / "definitely_outside_repo_root_xyz" / "foo.png"
    result = m._display_path(outside)

    assert result == outside
    assert result.is_absolute()


@pytest.mark.parametrize(
    "script_name",
    ["run_diversity_inference.py", "run_diversity_check.py"],
)
def test_display_path_does_not_raise_value_error(script_name: str) -> None:
    """display_path helpers should swallow relative_to failures."""
    m = _load_script(script_name)
    outside = Path("/some/absolute/external/path/foo.png").resolve()

    m._display_path(outside)


def test_front_side_semantic_mask_script_defaults_to_preview_dirs() -> None:
    """The preview mask script should stay scoped to front/side preview assets."""
    m = _load_script("generate_front_side_semantic_masks.py")

    assert m.DEFAULT_INPUT_DIR == m.ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
    assert m.DEFAULT_OUTPUT_DIR == m.ROOT / "outputs" / "ifc2img_front_side_mask_trial1" / "AC20-FZK-Haus"
    assert m.DEPTH_NAMES == ("depth_front.png", "depth_side.png")


def test_front_side_semantic_mask_display_path_returns_relative() -> None:
    """The preview mask script should print repo-relative paths when possible."""
    m = _load_script("generate_front_side_semantic_masks.py")

    inside = m.ROOT / "outputs" / "semantic_mask_front.png"
    result = m._display_path(inside)

    assert not result.is_absolute()
    assert result == Path("outputs") / "semantic_mask_front.png"

