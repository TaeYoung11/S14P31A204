"""Generate preview assets for EYE full-width semantic ground control.

This only writes semantic preview images. It does not run generation.

Examples:
    uv run python scripts/generate_eye_semantic_ground_control.py
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "packages" / "ai-rendering" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from ai_rendering.ifc2img.style import (  # noqa: E402
    ADE20K_BUILDING_RGB,
    ADE20K_GRASS_RGB,
    ADE20K_ROAD_RGB,
    ADE20K_SKY_RGB,
    _build_eye_ground_mask,
    _build_eye_ground_plane_aware_mask,
    _build_eye_ground_seg_control,
)

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


DEFAULT_INPUT_DIR = (
    ROOT
    / "outputs"
    / "ifc2img_eye_ground_grass_platform_negative_t025_style1"
    / "AC20-FZK-Haus"
)
DEFAULT_OUTPUT_DIR = (
    ROOT
    / "outputs"
    / "ifc2img_eye_full_width_semantic_ground_preview1"
    / "AC20-FZK-Haus"
)
DEFAULT_GROUND_CLASS = "grass"
DEFAULT_VARIANT = "ground_plane_aware"
DEPTH_NAMES = ("depth_eye_ne.png", "depth_eye_nw.png", "depth_eye_se.png")


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate EYE full-width semantic ground control preview assets."
    )
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR, type=Path)
    parser.add_argument(
        "--ground-class",
        default=DEFAULT_GROUND_CLASS,
        choices=("neutral", "grass"),
    )
    parser.add_argument(
        "--variant",
        default=DEFAULT_VARIANT,
        choices=("lower_background", "ground_plane_aware"),
        help="Semantic mask variant to preview.",
    )
    return parser.parse_args(argv)


def _class_overlay(depth: Image.Image, semantic: Image.Image) -> Image.Image:
    base = depth.convert("RGBA")
    seg_arr = np.asarray(semantic.convert("RGB"), dtype=np.uint8)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))

    for rgb, rgba in (
        (ADE20K_SKY_RGB, (0, 180, 255, 90)),
        (ADE20K_BUILDING_RGB, (255, 120, 0, 80)),
        (ADE20K_GRASS_RGB, (0, 220, 80, 120)),
        (ADE20K_ROAD_RGB, (170, 170, 170, 120)),
    ):
        class_mask = np.all(seg_arr == np.array(rgb, dtype=np.uint8), axis=2)
        mask = Image.fromarray((class_mask * 255).astype(np.uint8), mode="L")
        tint = Image.new("RGBA", base.size, rgba)
        layer.paste(tint, mask=mask)

    return Image.alpha_composite(base, layer).convert("RGB")


def _make_contact_sheet(rows: list[tuple[str, Image.Image, Image.Image, Image.Image]]) -> Image.Image:
    if not rows:
        raise ValueError("no preview rows to compose")

    cell_w, cell_h = rows[0][1].size
    label_w = 92
    header_h = 28
    gap = 10
    sheet_w = label_w + cell_w * 3 + gap * 2
    sheet_h = header_h + cell_h * len(rows)
    sheet = Image.new("RGB", (sheet_w, sheet_h), "white")
    draw = ImageDraw.Draw(sheet)

    headers = ("depth", "semantic", "overlay")
    for index, header in enumerate(headers):
        x = label_w + index * (cell_w + gap)
        draw.text((x + 4, 8), header, fill=(0, 0, 0))

    for row_index, (view_name, depth, semantic, overlay) in enumerate(rows):
        y = header_h + row_index * cell_h
        draw.text((4, y + 8), view_name, fill=(0, 0, 0))
        for index, image in enumerate((depth, semantic, overlay)):
            x = label_w + index * (cell_w + gap)
            sheet.paste(image.convert("RGB"), (x, y))

    return sheet


def generate_previews(
    input_dir: Path,
    output_dir: Path,
    ground_class: str,
    variant: str = DEFAULT_VARIANT,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    include_ground_plane = variant == "ground_plane_aware"

    saved: list[Path] = []
    rows: list[tuple[str, Image.Image, Image.Image, Image.Image]] = []
    for depth_name in DEPTH_NAMES:
        depth_path = input_dir / depth_name
        if not depth_path.exists():
            raise FileNotFoundError(f"missing depth input: {depth_path}")

        view_name = depth_name.removeprefix("depth_").removesuffix(".png")
        depth = Image.open(depth_path).convert("RGB")
        if include_ground_plane:
            ground_mask = _build_eye_ground_plane_aware_mask(depth)
        else:
            ground_mask = _build_eye_ground_mask(depth)
        semantic = _build_eye_ground_seg_control(
            depth,
            ground_class=ground_class,
            include_ground_plane=include_ground_plane,
        )
        overlay = _class_overlay(depth, semantic)

        view_outputs = [
            output_dir / f"eye_{variant}_mask_{view_name}.png",
            output_dir / f"eye_{variant}_semantic_{view_name}.png",
            output_dir / f"eye_{variant}_overlay_{view_name}.png",
        ]
        ground_mask.save(view_outputs[0], format="PNG")
        semantic.save(view_outputs[1], format="PNG")
        overlay.save(view_outputs[2], format="PNG")
        saved.extend(view_outputs)
        rows.append((view_name, depth, semantic, overlay))

    sheet_path = output_dir / f"compare_eye_{variant}_semantic_ground_preview.png"
    _make_contact_sheet(rows).save(sheet_path, format="PNG")
    saved.append(sheet_path)
    return saved


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    input_dir = args.input_dir.resolve()
    output_dir = args.output.resolve()

    print(f"[input] {_display_path(input_dir)}")
    print(f"[output] {_display_path(output_dir)}")
    print(f"[ground-class] {args.ground_class}")
    print(f"[variant] {args.variant}")

    try:
        saved = generate_previews(input_dir, output_dir, args.ground_class, args.variant)
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    for path in saved:
        print(f"[saved] {_display_path(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
