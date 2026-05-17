"""Build a side-by-side comparison contact sheet for G-4 vs F-2 vs F-3 winner.

Each row shows one (timeOfDay, view) pair across the candidate families:
- F-2 ifc_locked_baseline (with-background)
- F-3 appearance_only_candidate_3_photo_finish_red_roof (current heuristic winner)
- G-4 diffusion_soft_lock_final
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_F2_DIR = (
    ROOT
    / "outputs"
    / "shinchan_full_gpu_f_pipeline_20260515_shadowghost_fix1"
    / "f2"
)
DEFAULT_F3_DIR = (
    ROOT
    / "outputs"
    / "shinchan_full_gpu_f_pipeline_20260516_doubleimage_fix1"
    / "f3"
)
DEFAULT_G4_DIR = ROOT / "outputs" / "ifc_geometry_g4_soft_lock_diffusion_realvision"
DEFAULT_OUTPUT = (
    ROOT
    / "outputs"
    / "ifc_geometry_g4_soft_lock_diffusion_realvision"
    / "g4_vs_f3_winner_contact_sheet.png"
)
VIEWS = ("front_diagonal_left", "front_diagonal_right")
TIMES = ("DAY", "NIGHT")
F3_WINNER_FAMILY = "appearance_only_candidate_3_photo_finish_red_roof"
G4_FINAL_FILENAME_PREFIX = "diffusion_soft_lock_final_s055"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="G-4 vs F-2/F-3 comparison contact sheet."
    )
    parser.add_argument("--f2-dir", type=Path, default=DEFAULT_F2_DIR)
    parser.add_argument("--f3-dir", type=Path, default=DEFAULT_F3_DIR)
    parser.add_argument("--g4-dir", type=Path, default=DEFAULT_G4_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    f2_dir = args.f2_dir.resolve()
    f3_dir = args.f3_dir.resolve()
    g4_dir = args.g4_dir.resolve()
    output_path = args.output.resolve()

    column_labels = [
        "F-2 IFC-locked baseline",
        f"F-3 {F3_WINNER_FAMILY}",
        "G-4 soft-lock diffusion",
    ]

    rows: list[tuple[str, list[Path]]] = []
    for time in TIMES:
        for view in VIEWS:
            row_label = f"{time} {view}"
            f2_path = f2_dir / f"ifc_locked_baseline_{time.lower()}" / (
                f"baseline_with_background_{view}.png"
            )
            f3_path = (
                f3_dir
                / f"{F3_WINNER_FAMILY}_{time.lower()}"
                / f"photo_{view}.png"
            )
            g4_path = (
                g4_dir
                / f"final_{time.lower()}"
                / f"{G4_FINAL_FILENAME_PREFIX}_{time.lower()}_{view}.png"
            )
            rows.append((row_label, [f2_path, f3_path, g4_path]))

    cell_width = 320
    cell_height = 200
    header_h = 36
    row_label_w = 180

    cols = len(column_labels)
    canvas_width = row_label_w + cols * cell_width
    canvas_height = header_h + len(rows) * cell_height
    canvas = Image.new("RGB", (canvas_width, canvas_height), (245, 245, 245))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()

    for col_idx, label in enumerate(column_labels):
        x = row_label_w + col_idx * cell_width + 8
        draw.text((x, 10), label, fill=(20, 20, 20), font=font)

    for row_idx, (row_label, paths) in enumerate(rows):
        y = header_h + row_idx * cell_height
        draw.text((8, y + cell_height // 2 - 6), row_label, fill=(20, 20, 20), font=font)
        for col_idx, image_path in enumerate(paths):
            x = row_label_w + col_idx * cell_width
            if image_path.exists():
                image = Image.open(image_path).convert("RGB")
                fitted = _fit(image, cell_width - 4, cell_height - 4)
                px = x + (cell_width - fitted.size[0]) // 2
                py = y + (cell_height - fitted.size[1]) // 2
                canvas.paste(fitted, (px, py))
            else:
                draw.rectangle(
                    [(x + 2, y + 2), (x + cell_width - 2, y + cell_height - 2)],
                    outline=(180, 60, 60),
                )
                draw.text(
                    (x + 8, y + cell_height // 2 - 6),
                    "missing",
                    fill=(180, 60, 60),
                    font=font,
                )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, format="PNG")
    print(f"[g4][compare] wrote {output_path}")


def _fit(image: Image.Image, max_w: int, max_h: int) -> Image.Image:
    w, h = image.size
    scale = min(max_w / w, max_h / h)
    new_size = (max(int(w * scale), 1), max(int(h * scale), 1))
    return image.resize(new_size, Image.Resampling.LANCZOS)


if __name__ == "__main__":
    main()