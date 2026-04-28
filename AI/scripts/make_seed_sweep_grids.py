"""seed sweep 결과 비교 그리드 생성 — 4 seeds × 5 views.

사용:
    uv run python scripts/make_seed_sweep_grids.py

출력:
    outputs/ifc2img_seed_sweep_grids/
        grid_{view}.png         (1 row × 4 seeds, per-view 비교)
        grid_all_views.png      (5 rows × 4 cols, 전체 매트릭스)
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SWEEP_DIR = ROOT / "outputs" / "ifc2img_seed_sweep"
OUT_DIR = ROOT / "outputs" / "ifc2img_seed_sweep_grids"

VIEWS = ["front", "side", "iso_ne", "iso_nw", "iso_se"]
SEEDS = [42, 100, 7, 1234]
PRESET = "scandinavian"
PADDING = 4


def _seed_dir(seed: int) -> Path:
    return SWEEP_DIR / f"seed_{seed:04d}"


def _style_path(seed: int, view: str) -> Path:
    return _seed_dir(seed) / f"style_{view}_{PRESET}.png"


def _draw_label(img: Image.Image, text: str) -> None:
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    pad = 4
    draw.rectangle([(0, 0), (w + pad * 2, h + pad * 2)], fill="black")
    draw.text((pad, pad), text, fill="white", font=font)


def _cell_size() -> tuple[int, int]:
    sample = _style_path(SEEDS[0], VIEWS[0])
    with Image.open(sample) as im:
        return im.size


def _make_per_view_grid(view: str, cell_w: int, cell_h: int) -> Image.Image:
    n_cols = len(SEEDS)
    canvas_w = n_cols * cell_w + (n_cols + 1) * PADDING
    canvas_h = cell_h + 2 * PADDING
    canvas = Image.new("RGB", (canvas_w, canvas_h), "black")

    for col, seed in enumerate(SEEDS):
        x = PADDING + col * (cell_w + PADDING)
        y = PADDING
        path = _style_path(seed, view)
        with Image.open(path) as im:
            cell = im.convert("RGB").copy()
        _draw_label(cell, f"{view} seed={seed}")
        canvas.paste(cell, (x, y))
    return canvas


def _make_all_views_grid(cell_w: int, cell_h: int) -> Image.Image:
    n_rows = len(VIEWS)
    n_cols = len(SEEDS)
    canvas_w = n_cols * cell_w + (n_cols + 1) * PADDING
    canvas_h = n_rows * cell_h + (n_rows + 1) * PADDING
    canvas = Image.new("RGB", (canvas_w, canvas_h), "black")

    for row, view in enumerate(VIEWS):
        for col, seed in enumerate(SEEDS):
            x = PADDING + col * (cell_w + PADDING)
            y = PADDING + row * (cell_h + PADDING)
            path = _style_path(seed, view)
            with Image.open(path) as im:
                cell = im.convert("RGB").copy()
            _draw_label(cell, f"{view} seed={seed}")
            canvas.paste(cell, (x, y))
    return canvas


def main() -> int:
    if not SWEEP_DIR.exists():
        print(f"[error] sweep dir not found: {SWEEP_DIR}")
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cell_w, cell_h = _cell_size()
    print(f"[info] cell size: {cell_w}x{cell_h}, seeds={SEEDS}, views={VIEWS}")

    for view in VIEWS:
        grid = _make_per_view_grid(view, cell_w, cell_h)
        out_path = OUT_DIR / f"grid_{view}.png"
        grid.save(out_path, format="PNG")
        kb = out_path.stat().st_size / 1024
        print(f"[grid] {out_path.name}: {grid.size[0]}x{grid.size[1]} px, {kb:.0f} KB")

    all_grid = _make_all_views_grid(cell_w, cell_h)
    all_path = OUT_DIR / "grid_all_views.png"
    all_grid.save(all_path, format="PNG")
    kb = all_path.stat().st_size / 1024
    print(f"[grid] {all_path.name}: {all_grid.size[0]}x{all_grid.size[1]} px, {kb:.0f} KB")

    print(f"\n[done] saved {len(VIEWS) + 1} grid(s) to {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
