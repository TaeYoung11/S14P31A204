"""cn_scale sweep 비교 그리드 — 5 cn_scale × 2 뷰(iso_nw / iso_se).

출력:
    outputs/ifc2img_cn_scale_sweep_grids/
        grid_iso_nw.png   (1 row × 5 cols)
        grid_iso_se.png   (1 row × 5 cols)
        grid_all.png      (2 rows × 5 cols)
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SWEEP_DIR = ROOT / "outputs" / "ifc2img_cn_scale_sweep"
OUT_DIR = ROOT / "outputs" / "ifc2img_cn_scale_sweep_grids"

VIEWS = ["iso_nw", "iso_se"]
CN_SCALES = [0.7, 0.85, 1.0, 1.15, 1.3]
PRESET = "scandinavian"
PADDING = 4


def _path(cn: float, view: str) -> Path:
    return SWEEP_DIR / f"cn_{int(round(cn * 100)):03d}" / f"style_{view}_{PRESET}.png"


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
    sample = _path(CN_SCALES[0], VIEWS[0])
    with Image.open(sample) as im:
        return im.size


def _make_per_view(view: str, cw: int, ch: int) -> Image.Image:
    n = len(CN_SCALES)
    canvas = Image.new(
        "RGB", (n * cw + (n + 1) * PADDING, ch + 2 * PADDING), "black"
    )
    for col, cn in enumerate(CN_SCALES):
        x = PADDING + col * (cw + PADDING)
        y = PADDING
        with Image.open(_path(cn, view)) as im:
            cell = im.convert("RGB").copy()
        _draw_label(cell, f"{view} cn={cn:.2f}")
        canvas.paste(cell, (x, y))
    return canvas


def _make_all(cw: int, ch: int) -> Image.Image:
    nr = len(VIEWS)
    nc = len(CN_SCALES)
    canvas = Image.new(
        "RGB",
        (nc * cw + (nc + 1) * PADDING, nr * ch + (nr + 1) * PADDING),
        "black",
    )
    for r, view in enumerate(VIEWS):
        for c, cn in enumerate(CN_SCALES):
            x = PADDING + c * (cw + PADDING)
            y = PADDING + r * (ch + PADDING)
            with Image.open(_path(cn, view)) as im:
                cell = im.convert("RGB").copy()
            _draw_label(cell, f"{view} cn={cn:.2f}")
            canvas.paste(cell, (x, y))
    return canvas


def main() -> int:
    if not SWEEP_DIR.exists():
        print(f"[error] sweep dir not found: {SWEEP_DIR}")
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cw, ch = _cell_size()
    print(f"[info] cell: {cw}x{ch}, cn_scales={CN_SCALES}, views={VIEWS}")

    for view in VIEWS:
        grid = _make_per_view(view, cw, ch)
        out = OUT_DIR / f"grid_{view}.png"
        grid.save(out, format="PNG")
        kb = out.stat().st_size / 1024
        print(f"[grid] {out.name}: {grid.size[0]}x{grid.size[1]} px, {kb:.0f} KB")

    grid = _make_all(cw, ch)
    out = OUT_DIR / "grid_all.png"
    grid.save(out, format="PNG")
    kb = out.stat().st_size / 1024
    print(f"[grid] {out.name}: {grid.size[0]}x{grid.size[1]} px, {kb:.0f} KB")

    print(f"\n[done] saved to {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
