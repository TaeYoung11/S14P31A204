"""make_grid 모듈 — _group_by_preset_fixture / _render_grid 단위 테스트.

torch/GPU 미필요. PIL 이미지만 사용.
"""

from pathlib import Path

import pytest
from PIL import Image

from ai_evals.runners.make_grid import _group_by_preset_fixture, _render_grid


# ========== 헬퍼 ==========


def _entry(
    preset: str = "scandinavian",
    fixture_idx: int = 0,
    seed: int = 42,
    strength: float = 0.67,
    guidance: float = 7.0,
    cn_scale: float = 0.8,
    status: str = "ok",
    filename: str | None = None,
    fixture: str = "dummy.jpg",
) -> dict:
    if filename is None:
        s = int(round(strength * 100))
        g = int(round(guidance * 10))
        cn = int(round(cn_scale * 10))
        filename = f"{preset}_s{s:03d}_g{g:03d}_cn{cn:02d}_step25_seed{seed:05d}_f{fixture_idx}.png"
    return {
        "preset": preset,
        "fixture_idx": fixture_idx,
        "fixture": fixture,
        "filename": filename,
        "params": {
            "strength": strength,
            "guidance_scale": guidance,
            "num_inference_steps": 25,
            "seed": seed,
            "controlnet_conditioning_scale": cn_scale,
            "prompt": "test",
            "negative_prompt": "",
        },
        "status": status,
        "error": None,
        "duration_sec": 1.0,
    }


# ========== _group_by_preset_fixture ==========


def test_group_same_preset_fixture_cn_scale_go_together() -> None:
    """같은 (preset, fixture_idx, seed, cn_scale) → 하나의 그룹."""
    entries = [
        _entry(strength=0.65, guidance=7.0),
        _entry(strength=0.70, guidance=7.0),
        _entry(strength=0.65, guidance=9.0),
    ]
    groups = _group_by_preset_fixture(entries)
    assert len(groups) == 1
    key = list(groups.keys())[0]
    assert len(groups[key]) == 3


def test_group_different_cn_scales_make_separate_groups() -> None:
    """cn_scale 이 다르면 별도 그룹 — ControlNet sweep 핵심 검증."""
    entries = [
        _entry(cn_scale=0.3),
        _entry(cn_scale=0.6),
        _entry(cn_scale=0.9),
    ]
    groups = _group_by_preset_fixture(entries)
    assert len(groups) == 3
    cn_scale_keys = {k[3] for k in groups}
    assert cn_scale_keys == {0.3, 0.6, 0.9}


def test_group_different_fixtures_make_separate_groups() -> None:
    entries = [_entry(fixture_idx=0), _entry(fixture_idx=1), _entry(fixture_idx=2)]
    groups = _group_by_preset_fixture(entries)
    assert len(groups) == 3


def test_group_different_presets_make_separate_groups() -> None:
    entries = [_entry(preset="scandinavian"), _entry(preset="industrial")]
    groups = _group_by_preset_fixture(entries)
    assert len(groups) == 2


def test_group_missing_cn_scale_defaults_to_0_8() -> None:
    """plain img2img 엔트리는 cn_scale 키가 없을 수 있음 → 0.8 기본값으로 그룹핑."""
    entry = _entry()
    del entry["params"]["controlnet_conditioning_scale"]
    groups = _group_by_preset_fixture([entry])
    key = list(groups.keys())[0]
    assert key[3] == pytest.approx(0.8)


def test_group_key_structure() -> None:
    """그룹 키 = (preset: str, fixture_idx: int, seed: int, cn_scale: float)."""
    entries = [_entry(preset="scandinavian", fixture_idx=1, seed=99, cn_scale=0.3)]
    groups = _group_by_preset_fixture(entries)
    key = list(groups.keys())[0]
    assert key == ("scandinavian", 1, 99, pytest.approx(0.3))


# ========== _render_grid ==========


def _write_dummy_png(path: Path, color: str = "blue") -> None:
    Image.new("RGB", (64, 48), color).save(path, format="PNG")


def test_render_grid_creates_image(tmp_path: Path) -> None:
    """정상 entry 2개(다른 strength) → PIL Image 반환, 크기 > 0."""
    results_dir = tmp_path / "results"
    results_dir.mkdir()

    e1 = _entry(strength=0.65, guidance=7.0)
    e2 = _entry(strength=0.70, guidance=7.0)
    _write_dummy_png(results_dir / e1["filename"])
    _write_dummy_png(results_dir / e2["filename"])

    grid = _render_grid([e1, e2], results_dir)
    assert isinstance(grid, Image.Image)
    assert grid.size[0] > 0 and grid.size[1] > 0


def test_render_grid_shape_rows_cols(tmp_path: Path) -> None:
    """2 strengths × 2 guidances → 2행 2열 격자 (높이·너비 > 단일 셀)."""
    results_dir = tmp_path / "results"
    results_dir.mkdir()

    entries = []
    for s in [0.65, 0.70]:
        for g in [7.0, 9.0]:
            e = _entry(strength=s, guidance=g)
            _write_dummy_png(results_dir / e["filename"])
            entries.append(e)

    grid = _render_grid(entries, results_dir)
    # 셀 크기 64x48, 패딩 4 → 예상 캔버스: (2*64 + 3*4) × (2*48 + 3*4)
    assert grid.size[0] == 2 * 64 + 3 * 4
    assert grid.size[1] == 2 * 48 + 3 * 4


def test_render_grid_failed_entry_produces_placeholder(tmp_path: Path) -> None:
    """status='failed' 엔트리 → 회색 placeholder 로 채워짐 (이미지 없어도 오류 없음)."""
    results_dir = tmp_path / "results"
    results_dir.mkdir()

    ok_entry = _entry(strength=0.65, guidance=7.0)
    fail_entry = _entry(strength=0.70, guidance=7.0, status="failed")
    _write_dummy_png(results_dir / ok_entry["filename"])
    # fail_entry 파일은 저장 안 함

    grid = _render_grid([ok_entry, fail_entry], results_dir)
    assert isinstance(grid, Image.Image)


def test_render_grid_missing_file_produces_placeholder(tmp_path: Path) -> None:
    """status='ok' 이지만 파일이 없어도 placeholder 로 대체, 예외 없음."""
    results_dir = tmp_path / "results"
    results_dir.mkdir()

    present = _entry(strength=0.65, guidance=7.0)
    missing = _entry(strength=0.70, guidance=7.0)
    _write_dummy_png(results_dir / present["filename"])
    # missing 파일은 저장 안 함

    grid = _render_grid([present, missing], results_dir)
    assert isinstance(grid, Image.Image)
