"""옵션 C-1 Before/After 비교 그리드 — view-별 negative suffix 효과 측정.

Before: outputs/ifc2img_seed_sweep/seed_0007/  (seed=7, base negative)
After:  outputs/ifc2img_option_c1/             (seed=7, view-aware negative)

출력:
    outputs/ifc2img_option_c1_grids/
        grid_{view}.png         (1 row × 2 cols — Before / After)
        grid_all_views.png      (5 rows × 2 cols)
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BEFORE_DIR = ROOT / "outputs" / "ifc2img_seed_sweep" / "seed_0007"
AFTER_DIR = ROOT / "outputs" / "ifc2img_option_c1"
OUT_DIR = ROOT / "outputs" / "ifc2img_option_c1_grids"

VIEWS = ["front", "side", "iso_ne", "iso_nw", "iso_se"]
PRESET = "scandinavian"
PADDING = 4

COLUMNS = [
    ("Before (base neg)", BEFORE_DIR),
    ("After (C-1 view neg)", AFTER_DIR),
]


def _path(src_dir: Path, view: str) -> Path:
    return src_dir / f"style_{view}_{PRESET}.png"


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
    sample = _path(BEFORE_DIR, VIEWS[0])
    with Image.open(sample) as im:
        return im.size


def _make_per_view(view: str, cw: int, ch: int) -> Image.Image:
    n_cols = len(COLUMNS)
    canvas = Image.new(
        "RGB",
        (n_cols * cw + (n_cols + 1) * PADDING, ch + 2 * PADDING),
        "black",
    )
    for col, (label, src) in enumerate(COLUMNS):
        x = PADDING + col * (cw + PADDING)
        y = PADDING
        with Image.open(_path(src, view)) as im:
            cell = im.convert("RGB").copy()
        _draw_label(cell, f"{view} {label}")
        canvas.paste(cell, (x, y))
    return canvas


def _make_all_views(cw: int, ch: int) -> Image.Image:
    n_rows = len(VIEWS)
    n_cols = len(COLUMNS)
    canvas = Image.new(
        "RGB",
        (n_cols * cw + (n_cols + 1) * PADDING, n_rows * ch + (n_rows + 1) * PADDING),
        "black",
    )
    for row, view in enumerate(VIEWS):
        for col, (label, src) in enumerate(COLUMNS):
            x = PADDING + col * (cw + PADDING)
            y = PADDING + row * (ch + PADDING)
            with Image.open(_path(src, view)) as im:
                cell = im.convert("RGB").copy()
            _draw_label(cell, f"{view} {label}")
            canvas.paste(cell, (x, y))
    return canvas


def main() -> int:
    if not BEFORE_DIR.exists() or not AFTER_DIR.exists():
        print(f"[error] missing: {BEFORE_DIR} or {AFTER_DIR}")
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cw, ch = _cell_size()
    print(f"[info] cell: {cw}x{ch}, columns={[c[0] for c in COLUMNS]}, views={VIEWS}")

    for view in VIEWS:
        grid = _make_per_view(view, cw, ch)
        out = OUT_DIR / f"grid_{view}.png"
        grid.save(out, format="PNG")
        kb = out.stat().st_size / 1024
        print(f"[grid] {out.name}: {grid.size[0]}x{grid.size[1]} px, {kb:.0f} KB")

    grid = _make_all_views(cw, ch)
    out = OUT_DIR / "grid_all_views.png"
    grid.save(out, format="PNG")
    kb = out.stat().st_size / 1024
    print(f"[grid] {out.name}: {grid.size[0]}x{grid.size[1]} px, {kb:.0f} KB")

    print(f"\n[done] saved to {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
