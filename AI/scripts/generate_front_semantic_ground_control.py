"""Generate preview assets for front-only semantic ground control.

This only writes semantic preview images. It does not run generation.

Examples:
    uv run python scripts/generate_front_semantic_ground_control.py
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "packages" / "ai-rendering" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from ai_rendering.ifc2img.style import (  # noqa: E402
    ADE20K_BUILDING_RGB,
    ADE20K_ROAD_RGB,
    ADE20K_SKY_RGB,
    _build_front_full_width_ground_mask,
    _build_front_full_width_seg_control,
)

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


DEFAULT_INPUT_DIR = ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
DEFAULT_OUTPUT_DIR = (
    ROOT / "outputs" / "ifc2img_front_semantic_ground_control_trial1" / "AC20-FZK-Haus"
)
DEFAULT_GROUND_CLASS = "neutral"


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate front-only semantic ground control preview assets."
    )
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR, type=Path)
    parser.add_argument("--ground-class", default=DEFAULT_GROUND_CLASS, choices=("neutral", "grass"))
    return parser.parse_args(argv)


def _class_overlay(depth: Image.Image, semantic: Image.Image) -> Image.Image:
    base = depth.convert("RGBA")
    seg_arr = np.asarray(semantic.convert("RGB"), dtype=np.uint8)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))

    for rgb, rgba in (
        (ADE20K_SKY_RGB, (0, 180, 255, 90)),
        (ADE20K_BUILDING_RGB, (255, 120, 0, 80)),
        (ADE20K_ROAD_RGB, (0, 220, 80, 120)),
    ):
        class_mask = np.all(seg_arr == np.array(rgb, dtype=np.uint8), axis=2)
        mask = Image.fromarray((class_mask * 255).astype(np.uint8), mode="L")
        tint = Image.new("RGBA", base.size, rgba)
        layer.paste(tint, mask=mask)

    return Image.alpha_composite(base, layer).convert("RGB")


def run(args: argparse.Namespace) -> list[Path]:
    input_dir = args.input_dir.resolve()
    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    depth_path = input_dir / "depth_front.png"
    if not depth_path.exists():
        raise FileNotFoundError(f"missing depth image: {depth_path}")

    depth = Image.open(depth_path).convert("RGB")
    ground_mask = _build_front_full_width_ground_mask(depth)
    semantic = _build_front_full_width_seg_control(
        depth,
        ground_class=args.ground_class,
    )

    saved = [
        output_dir / "front_semantic_ground_mask.png",
        output_dir / "front_semantic_ground.png",
        output_dir / "front_semantic_ground_overlay.png",
    ]
    ground_mask.save(saved[0], format="PNG")
    semantic.save(saved[1], format="PNG")
    _class_overlay(depth, semantic).save(saved[2], format="PNG")
    return saved


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    print(f"[input] {_display_path(args.input_dir.resolve())}")
    print(f"[output] {_display_path(args.output.resolve())}")
    print(f"[ground-class] {args.ground_class}")
    try:
        saved = run(args)
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1
    for path in saved:
        print(f"[saved] {_display_path(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
