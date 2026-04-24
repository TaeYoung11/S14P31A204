"""Contact sheet 합성기 — sweep 결과 PNG 들을 파라미터 격자로 묶어 한 장 이미지로.

사용:
    uv run python -m ai_evals.runners.make_grid --run <run_dir>

동작:
    1. <run_dir>/manifest.json 읽기
    2. (preset, fixture_idx) 별로 entries 그룹핑
    3. 각 그룹에 대해 strength(행) × guidance(열) 격자 이미지 생성
    4. <run_dir>/grids/grid_{preset}_f{idx}.png 저장

한계:
    - num_inference_steps 가 여러 값이면 현재 미지원 (동일 (s, g) 중첩 시 첫 entry 사용)
    - seed 도 단일 값 가정
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

_CELL_PADDING = 4


def _load_manifest(run_dir: Path) -> list[dict[str, Any]]:
    manifest_path = run_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest not found: {manifest_path}")
    with open(manifest_path, encoding="utf-8") as f:
        data: list[dict[str, Any]] = json.load(f)
    return data


def _group_by_preset_fixture(
    entries: list[dict[str, Any]],
) -> dict[tuple[str, int, int], list[dict[str, Any]]]:
    """(preset, fixture_idx, seed) 별로 entries 묶음.

    seed 를 키에 포함해 seed 가 다른 entry 가 같은 격자 셀을 덮어쓰는 문제 방지.
    """
    groups: defaultdict[tuple[str, int, int], list[dict[str, Any]]] = defaultdict(list)
    for e in entries:
        key = (e["preset"], e["fixture_idx"], int(e["params"]["seed"]))
        groups[key].append(e)
    return dict(groups)


def _draw_label(cell: Image.Image, text: str) -> None:
    """셀 좌상단에 검정 박스 배경 + 흰 텍스트 라벨 그림. in-place."""
    draw = ImageDraw.Draw(cell)
    font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    pad = 3
    draw.rectangle(
        [(0, 0), (text_w + pad * 2, text_h + pad * 2)],
        fill="black",
    )
    draw.text((pad, pad), text, fill="white", font=font)


def _render_grid(
    entries: list[dict[str, Any]],
    results_dir: Path,
) -> Image.Image:
    """한 그룹(단일 preset+fixture) 의 entries 를 strength × guidance 격자로.

    누락 또는 실패 entry 는 회색 placeholder + 'FAIL' 라벨로 대체 (격자 구조 유지).
    """
    strengths = sorted({float(e["params"]["strength"]) for e in entries})
    guidances = sorted({float(e["params"]["guidance_scale"]) for e in entries})

    cell_map: dict[tuple[float, float], dict[str, Any]] = {
        (float(e["params"]["strength"]), float(e["params"]["guidance_scale"])): e
        for e in entries
    }

    # 첫 성공 이미지에서 cell 크기 추출
    sample_entry = next(
        (e for e in entries if e["status"] == "ok"),
        entries[0],
    )
    sample_path = results_dir / sample_entry["filename"]
    if sample_path.exists():
        with Image.open(sample_path) as sample_img:
            cell_w, cell_h = sample_img.size
    else:
        # 샘플도 없으면 768x448 기본값
        cell_w, cell_h = 768, 448

    n_cols = len(guidances)
    n_rows = len(strengths)
    canvas_w = n_cols * cell_w + (n_cols + 1) * _CELL_PADDING
    canvas_h = n_rows * cell_h + (n_rows + 1) * _CELL_PADDING
    canvas = Image.new("RGB", (canvas_w, canvas_h), "black")

    for row, s in enumerate(strengths):
        for col, g in enumerate(guidances):
            x = _CELL_PADDING + col * (cell_w + _CELL_PADDING)
            y = _CELL_PADDING + row * (cell_h + _CELL_PADDING)
            label = f"s={s:g} g={g:g}"

            entry = cell_map.get((s, g))
            if entry is None or entry["status"] != "ok":
                placeholder = Image.new("RGB", (cell_w, cell_h), "dimgray")
                _draw_label(placeholder, f"{label} FAIL")
                canvas.paste(placeholder, (x, y))
                continue

            cell_path = results_dir / entry["filename"]
            if not cell_path.exists():
                placeholder = Image.new("RGB", (cell_w, cell_h), "dimgray")
                _draw_label(placeholder, f"{label} MISSING")
                canvas.paste(placeholder, (x, y))
                continue

            with Image.open(cell_path) as cell_img:
                cell = cell_img.convert("RGB")
            _draw_label(cell, label)
            canvas.paste(cell, (x, y))

    return canvas


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate contact sheet grids from sweep output"
    )
    parser.add_argument(
        "--run",
        required=True,
        type=Path,
        help="스윕 결과 디렉토리 (outputs/run_YYYYMMDD_HHMMSS)",
    )
    parser.add_argument(
        "--fixture",
        type=int,
        default=None,
        help="특정 fixture index 만 처리 (예: --fixture 0 → f0 만)",
    )
    args = parser.parse_args(argv)

    if not args.run.exists() or not args.run.is_dir():
        print(f"[error] run dir not found: {args.run}", file=sys.stderr)
        return 2

    try:
        manifest = _load_manifest(args.run)
    except FileNotFoundError as e:
        print(f"[error] {e}", file=sys.stderr)
        return 2

    if not manifest:
        print("[error] manifest is empty", file=sys.stderr)
        return 2

    groups = _group_by_preset_fixture(manifest)
    if args.fixture is not None:
        groups = {k: v for k, v in groups.items() if k[1] == args.fixture}
    results_dir = args.run / "results"
    grids_dir = args.run / "grids"
    grids_dir.mkdir(exist_ok=True)

    for (preset, fx_idx, seed), entries in sorted(groups.items()):
        grid = _render_grid(entries, results_dir)
        out_path = grids_dir / f"grid_{preset}_f{fx_idx}_seed{seed:05d}.png"
        grid.save(out_path, format="PNG")
        size_kb = out_path.stat().st_size / 1024
        print(
            f"[grid] {out_path.name}: {grid.size[0]}x{grid.size[1]} px, {size_kb:.0f} KB"
        )

    print(f"\n[done] saved {len(groups)} grid(s) to {grids_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
