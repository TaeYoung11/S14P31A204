"""Generate preview assets for front-only full-width ground control.

Examples:
    uv run python scripts/generate_front_full_width_ground_control.py
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "packages" / "ai-rendering" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from ai_rendering.ifc2img.style import (  # noqa: E402
    _apply_front_full_width_ground_control,
    _build_front_full_width_ground_mask,
)

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


DEFAULT_INPUT_DIR = ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
DEFAULT_OUTPUT_DIR = (
    ROOT / "outputs" / "ifc2img_front_full_width_ground_control_trial1" / "AC20-FZK-Haus"
)


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate front full-width ground control preview assets."
    )
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR, type=Path)
    return parser.parse_args(argv)


def _overlay(depth: Image.Image, mask: Image.Image) -> Image.Image:
    base = depth.convert("RGBA")
    tint = Image.new("RGBA", base.size, (0, 160, 255, 120))
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(tint, mask=mask.convert("L"))
    return Image.alpha_composite(base, layer).convert("RGB")


def run(args: argparse.Namespace) -> list[Path]:
    input_dir = args.input_dir.resolve()
    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    depth_path = input_dir / "depth_front.png"
    if not depth_path.exists():
        raise FileNotFoundError(f"missing depth image: {depth_path}")

    depth = Image.open(depth_path).convert("RGB")
    mask = _build_front_full_width_ground_mask(depth)
    control = _apply_front_full_width_ground_control(depth)

    saved = [
        output_dir / "front_full_width_ground_mask.png",
        output_dir / "front_full_width_ground_overlay.png",
        output_dir / "front_full_width_ground_control.png",
    ]
    mask.save(saved[0], format="PNG")
    _overlay(depth, mask).save(saved[1], format="PNG")
    control.save(saved[2], format="PNG")
    return saved


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    print(f"[input] {_display_path(args.input_dir.resolve())}")
    print(f"[output] {_display_path(args.output.resolve())}")
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
