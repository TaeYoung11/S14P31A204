"""Generate preview-only front diagonal auto-background inpaint masks.

This script does not run generation. It protects the inferred building body
from front diagonal depth images and marks the full outside region as the inpaint target.

Examples:
    uv run python scripts/generate_front_diagonal_auto_background_masks.py
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "packages" / "ai-rendering" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from ai_rendering.ifc2img.style import (  # noqa: E402
    FRONT_DIAGONAL_BUILDING_MASK_GROUND_SHELL_RATIO,
    _build_front_diagonal_building_mask,
)

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


DEFAULT_INPUT_DIR = (
    ROOT
    / "outputs"
    / "ifc2img_front_diagonal_ground_extent_105_style_smoke1"
    / "AC20-FZK-Haus"
)
DEFAULT_OUTPUT_DIR = (
    ROOT
    / "outputs"
    / "ifc2img_front_diagonal_auto_background_mask_tight_preview1"
    / "AC20-FZK-Haus"
)
DEPTH_NAMES = ("depth_front_diagonal_right.png", "depth_front_diagonal_left.png")
DEFAULT_PRESET = "korean_house"
DEFAULT_PROTECT_EXPAND_PX = 5
DEFAULT_TARGET_FEATHER_RADIUS = 4
DEFAULT_PROTECT_FEATHER_RADIUS = 1


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate preview-only front diagonal full outside auto-background masks."
    )
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR, type=Path)
    parser.add_argument("--preset", default=DEFAULT_PRESET)
    parser.add_argument(
        "--ground-shell-ratio",
        default=FRONT_DIAGONAL_BUILDING_MASK_GROUND_SHELL_RATIO,
        type=float,
        help="Lower front diagonal geometry shell ratio to exclude as ground.",
    )
    parser.add_argument(
        "--protect-expand-px",
        default=DEFAULT_PROTECT_EXPAND_PX,
        type=int,
        help="Dilate building protection mask by this many pixels.",
    )
    parser.add_argument(
        "--target-feather-radius",
        default=DEFAULT_TARGET_FEATHER_RADIUS,
        type=int,
        help="Blur the full outside target mask by this radius.",
    )
    parser.add_argument(
        "--protect-feather-radius",
        default=DEFAULT_PROTECT_FEATHER_RADIUS,
        type=int,
        help="Blur the displayed protection mask by this radius.",
    )
    return parser.parse_args(argv)


def _build_overlay(
    source: Image.Image,
    mask: Image.Image,
    color: tuple[int, int, int, int],
) -> Image.Image:
    base = source.convert("RGBA")
    mask_l = mask.convert("L").resize(base.size)
    tint = Image.new("RGBA", base.size, color)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(tint, mask=mask_l)
    return Image.alpha_composite(base, layer).convert("RGB")


def _build_protect_mask(
    building_mask: Image.Image,
    expand_px: int = DEFAULT_PROTECT_EXPAND_PX,
    feather_radius: int = DEFAULT_PROTECT_FEATHER_RADIUS,
) -> Image.Image:
    protect = building_mask.convert("L")
    if expand_px > 0:
        kernel_size = max(3, expand_px * 2 + 1)
        if kernel_size % 2 == 0:
            kernel_size += 1
        protect = protect.filter(ImageFilter.MaxFilter(kernel_size))
    if feather_radius > 0:
        protect = protect.filter(ImageFilter.GaussianBlur(radius=feather_radius))
    return protect


def _build_full_outside_target_mask(
    protect_mask: Image.Image,
    feather_radius: int = DEFAULT_TARGET_FEATHER_RADIUS,
) -> Image.Image:
    protect_arr = np.asarray(protect_mask.convert("L"), dtype=np.uint8)
    target_arr = np.where(protect_arr > 127, 0, 255).astype(np.uint8)
    target = Image.fromarray(target_arr, mode="L")
    if feather_radius <= 0:
        return target
    return target.filter(ImageFilter.GaussianBlur(radius=feather_radius))


def _load_style_image(
    input_dir: Path,
    view_name: str,
    preset: str,
    depth: Image.Image,
) -> Image.Image:
    style_path = input_dir / f"style_{view_name}_{preset}.png"
    if style_path.exists():
        return Image.open(style_path).convert("RGB")
    return depth.convert("RGB")


def _make_contact_sheet(
    rows: list[
        tuple[
            str,
            Image.Image,
            Image.Image,
            Image.Image,
            Image.Image,
            Image.Image,
        ]
    ],
) -> Image.Image:
    if not rows:
        raise ValueError("no preview rows to compose")

    cell_w, cell_h = rows[0][1].size
    label_w = 92
    header_h = 28
    gap = 10
    sheet_w = label_w + cell_w * 5 + gap * 4
    sheet_h = header_h + cell_h * len(rows)
    sheet = Image.new("RGB", (sheet_w, sheet_h), "white")
    draw = ImageDraw.Draw(sheet)

    headers = (
        "source",
        "depth",
        "protect",
        "outside_target",
        "target_overlay",
    )
    for index, header in enumerate(headers):
        x = label_w + index * (cell_w + gap)
        draw.text((x + 4, 8), header, fill=(0, 0, 0))

    for row_index, (
        view_name,
        source,
        depth,
        protect_mask,
        target_mask,
        target_overlay,
    ) in enumerate(rows):
        y = header_h + row_index * cell_h
        draw.text((4, y + 8), view_name, fill=(0, 0, 0))
        images = (
            source,
            depth,
            protect_mask.convert("RGB"),
            target_mask.convert("RGB"),
            target_overlay,
        )
        for index, image in enumerate(images):
            x = label_w + index * (cell_w + gap)
            sheet.paste(image.convert("RGB"), (x, y))

    return sheet


def generate_previews(
    input_dir: Path,
    output_dir: Path,
    preset: str = DEFAULT_PRESET,
    ground_shell_ratio: float = FRONT_DIAGONAL_BUILDING_MASK_GROUND_SHELL_RATIO,
    protect_expand_px: int = DEFAULT_PROTECT_EXPAND_PX,
    target_feather_radius: int = DEFAULT_TARGET_FEATHER_RADIUS,
    protect_feather_radius: int = DEFAULT_PROTECT_FEATHER_RADIUS,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    saved: list[Path] = []
    rows: list[
        tuple[
            str,
            Image.Image,
            Image.Image,
            Image.Image,
            Image.Image,
            Image.Image,
        ]
    ] = []
    for depth_name in DEPTH_NAMES:
        depth_path = input_dir / depth_name
        if not depth_path.exists():
            raise FileNotFoundError(f"missing depth input: {depth_path}")

        view_name = depth_name.removeprefix("depth_").removesuffix(".png")
        depth = Image.open(depth_path).convert("RGB")
        source = _load_style_image(input_dir, view_name, preset, depth)
        building_mask = _build_front_diagonal_building_mask(
            depth,
            ground_shell_ratio=ground_shell_ratio,
        )
        protect_mask = _build_protect_mask(
            building_mask,
            expand_px=protect_expand_px,
            feather_radius=protect_feather_radius,
        )
        target_mask = _build_full_outside_target_mask(
            protect_mask,
            feather_radius=target_feather_radius,
        )
        protect_overlay = _build_overlay(source, protect_mask, (0, 220, 80, 110))
        target_overlay = _build_overlay(source, target_mask, (255, 0, 0, 105))

        protect_path = output_dir / f"auto_background_protect_{view_name}.png"
        target_path = output_dir / f"auto_background_target_{view_name}.png"
        protect_overlay_path = output_dir / f"auto_background_protect_overlay_{view_name}.png"
        target_overlay_path = output_dir / f"auto_background_target_overlay_{view_name}.png"
        protect_mask.save(protect_path, format="PNG")
        target_mask.save(target_path, format="PNG")
        protect_overlay.save(protect_overlay_path, format="PNG")
        target_overlay.save(target_overlay_path, format="PNG")
        saved.extend((protect_path, target_path, protect_overlay_path, target_overlay_path))
        rows.append((view_name, source, depth, protect_mask, target_mask, target_overlay))

    sheet_path = output_dir / "compare_front_diagonal_auto_background_mask_preview.png"
    _make_contact_sheet(rows).save(sheet_path, format="PNG")
    saved.append(sheet_path)
    return saved


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    input_dir = args.input_dir.resolve()
    output_dir = args.output.resolve()

    print(f"[input] {_display_path(input_dir)}")
    print(f"[output] {_display_path(output_dir)}")
    print(f"[preset] {args.preset}")
    print(f"[ground-shell-ratio] {args.ground_shell_ratio}")
    print(f"[protect-expand-px] {args.protect_expand_px}")
    print(f"[target-feather-radius] {args.target_feather_radius}")
    print(f"[protect-feather-radius] {args.protect_feather_radius}")

    try:
        saved = generate_previews(
            input_dir,
            output_dir,
            preset=args.preset,
            ground_shell_ratio=args.ground_shell_ratio,
            protect_expand_px=args.protect_expand_px,
            target_feather_radius=args.target_feather_radius,
            protect_feather_radius=args.protect_feather_radius,
        )
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    for path in saved:
        print(f"[saved] {_display_path(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
