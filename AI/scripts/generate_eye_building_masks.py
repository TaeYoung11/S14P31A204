"""Generate preview-only EYE building masks from depth.

This script does not run generation. It extracts a building protection mask
from EYE depth images by excluding the lower ground-plane-aware shell.

Examples:
    uv run python scripts/generate_eye_building_masks.py
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "packages" / "ai-rendering" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from ai_rendering.ifc2img.style import (  # noqa: E402
    EYE_BUILDING_MASK_GROUND_SHELL_RATIO,
    _build_eye_building_mask,
)

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


DEFAULT_INPUT_DIR = (
    ROOT
    / "outputs"
    / "ifc2img_eye_ground_extent_105_style_smoke1"
    / "AC20-FZK-Haus"
)
DEFAULT_OUTPUT_DIR = (
    ROOT
    / "outputs"
    / "ifc2img_eye_building_mask_preview1"
    / "AC20-FZK-Haus"
)
DEPTH_NAMES = ("depth_eye_ne.png", "depth_eye_nw.png", "depth_eye_se.png")
DEFAULT_PROTECT_EXPAND_PX = 3
DEFAULT_FEATHER_RADIUS = 2


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate preview-only EYE building masks from depth."
    )
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR, type=Path)
    parser.add_argument(
        "--ground-shell-ratio",
        default=EYE_BUILDING_MASK_GROUND_SHELL_RATIO,
        type=float,
        help="Lower EYE geometry shell ratio to exclude as ground.",
    )
    parser.add_argument(
        "--protect-expand-px",
        default=DEFAULT_PROTECT_EXPAND_PX,
        type=int,
        help="Dilate building protection mask by this many pixels.",
    )
    parser.add_argument(
        "--feather-radius",
        default=DEFAULT_FEATHER_RADIUS,
        type=int,
        help="Blur the inpaint target mask by this radius for preview/use.",
    )
    return parser.parse_args(argv)


def _build_overlay(
    depth: Image.Image,
    mask: Image.Image,
    color: tuple[int, int, int, int],
) -> Image.Image:
    base = depth.convert("RGBA")
    mask_l = mask.convert("L").resize(base.size)
    tint = Image.new("RGBA", base.size, color)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(tint, mask=mask_l)
    return Image.alpha_composite(base, layer).convert("RGB")


def _build_protect_mask(
    building_mask: Image.Image,
    expand_px: int = DEFAULT_PROTECT_EXPAND_PX,
) -> Image.Image:
    protect = building_mask.convert("L")
    if expand_px <= 0:
        return protect
    kernel_size = max(3, expand_px * 2 + 1)
    if kernel_size % 2 == 0:
        kernel_size += 1
    return protect.filter(ImageFilter.MaxFilter(kernel_size))


def _build_inpaint_target_mask(
    protect_mask: Image.Image,
    feather_radius: int = DEFAULT_FEATHER_RADIUS,
) -> Image.Image:
    target = Image.eval(protect_mask.convert("L"), lambda px: 255 - px)
    if feather_radius <= 0:
        return target
    return target.filter(ImageFilter.GaussianBlur(radius=feather_radius))


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
        "depth",
        "building_mask",
        "protect_mask",
        "inpaint_target",
        "target_overlay",
    )
    for index, header in enumerate(headers):
        x = label_w + index * (cell_w + gap)
        draw.text((x + 4, 8), header, fill=(0, 0, 0))

    for row_index, (
        view_name,
        depth,
        building_mask,
        protect_mask,
        target_mask,
        target_overlay,
    ) in enumerate(rows):
        y = header_h + row_index * cell_h
        draw.text((4, y + 8), view_name, fill=(0, 0, 0))
        images = (
            depth,
            building_mask.convert("RGB"),
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
    ground_shell_ratio: float = EYE_BUILDING_MASK_GROUND_SHELL_RATIO,
    protect_expand_px: int = DEFAULT_PROTECT_EXPAND_PX,
    feather_radius: int = DEFAULT_FEATHER_RADIUS,
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
        mask = _build_eye_building_mask(
            depth,
            ground_shell_ratio=ground_shell_ratio,
        )
        protect_mask = _build_protect_mask(mask, expand_px=protect_expand_px)
        target_mask = _build_inpaint_target_mask(
            protect_mask,
            feather_radius=feather_radius,
        )
        building_overlay = _build_overlay(depth, mask, (0, 220, 80, 120))
        target_overlay = _build_overlay(depth, target_mask, (255, 0, 0, 110))

        mask_path = output_dir / f"building_mask_{view_name}.png"
        protect_path = output_dir / f"building_protect_mask_{view_name}.png"
        target_path = output_dir / f"background_inpaint_target_{view_name}.png"
        building_overlay_path = output_dir / f"building_overlay_{view_name}.png"
        target_overlay_path = output_dir / f"background_inpaint_overlay_{view_name}.png"
        mask.save(mask_path, format="PNG")
        protect_mask.save(protect_path, format="PNG")
        target_mask.save(target_path, format="PNG")
        building_overlay.save(building_overlay_path, format="PNG")
        target_overlay.save(target_overlay_path, format="PNG")
        saved.extend(
            (
                mask_path,
                protect_path,
                target_path,
                building_overlay_path,
                target_overlay_path,
            )
        )
        rows.append((view_name, depth, mask, protect_mask, target_mask, target_overlay))

    sheet_path = output_dir / "compare_eye_building_mask_preview.png"
    _make_contact_sheet(rows).save(sheet_path, format="PNG")
    saved.append(sheet_path)
    return saved


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    input_dir = args.input_dir.resolve()
    output_dir = args.output.resolve()

    print(f"[input] {_display_path(input_dir)}")
    print(f"[output] {_display_path(output_dir)}")
    print(f"[ground-shell-ratio] {args.ground_shell_ratio}")
    print(f"[protect-expand-px] {args.protect_expand_px}")
    print(f"[feather-radius] {args.feather_radius}")

    try:
        saved = generate_previews(
            input_dir,
            output_dir,
            ground_shell_ratio=args.ground_shell_ratio,
            protect_expand_px=args.protect_expand_px,
            feather_radius=args.feather_radius,
        )
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    for path in saved:
        print(f"[saved] {_display_path(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
