"""Generate preview-only front/side localized semantic masks.

This script intentionally does not run Stable Diffusion and does not alter the
render path. It converts existing front/side depth images into 3-class preview
masks so the ground-contact cue can be inspected before any renderer injection.

Examples:
    uv run python scripts/generate_front_side_semantic_masks.py
    uv run python scripts/generate_front_side_semantic_masks.py --input=outputs/foo
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from ai_rendering.ifc2img.style import _build_front_side_semantic_mask  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_DIR = ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "ifc2img_front_side_mask_trial1" / "AC20-FZK-Haus"
DEPTH_NAMES = ("depth_front.png", "depth_side.png")


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate preview-only front/side localized semantic masks."
    )
    parser.add_argument(
        "--input",
        default=DEFAULT_INPUT_DIR,
        type=Path,
        help="Directory containing depth_front.png and depth_side.png.",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_DIR,
        type=Path,
        help="Directory for semantic_mask_front.png and semantic_mask_side.png.",
    )
    return parser.parse_args(argv)


def generate_masks(input_dir: Path, output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    saved: list[Path] = []
    for depth_name in DEPTH_NAMES:
        depth_path = input_dir / depth_name
        if not depth_path.exists():
            raise FileNotFoundError(f"missing depth input: {depth_path}")

        depth = Image.open(depth_path).convert("RGB")
        mask = _build_front_side_semantic_mask(depth)
        out_name = depth_name.replace("depth_", "semantic_mask_")
        out_path = output_dir / out_name
        mask.save(out_path, format="PNG")
        saved.append(out_path)

    return saved


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    input_dir = args.input.resolve()
    output_dir = args.output.resolve()

    print(f"[input] {_display_path(input_dir)}")
    print(f"[output] {_display_path(output_dir)}")

    try:
        saved = generate_masks(input_dir, output_dir)
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    for path in saved:
        print(f"  saved {_display_path(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
