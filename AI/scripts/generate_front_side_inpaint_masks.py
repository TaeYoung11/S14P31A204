"""Generate preview-only front/side localized inpaint masks.

This script does not run Stable Diffusion. It creates lower-facade masks for
the current 4-image front/side sample so the two-pass inpaint region can be
inspected before trying an inpaint model.

Examples:
    uv run python scripts/generate_front_side_inpaint_masks.py
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

from ai_rendering.ifc2img.style import _build_front_side_inpaint_mask  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEPTH_DIR = ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
DEFAULT_STYLED_DIR = ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "ifc2img_front_side_inpaint_mask_trial1" / "AC20-FZK-Haus"
PRESETS = ("scandinavian", "korean_villa")
VIEWS = ("front", "side")


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate preview-only front/side localized inpaint masks."
    )
    parser.add_argument(
        "--depth-dir",
        default=DEFAULT_DEPTH_DIR,
        type=Path,
        help="Directory containing depth_front.png and depth_side.png.",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_DIR,
        type=Path,
        help="Directory for inpaint mask PNGs.",
    )
    parser.add_argument(
        "--styled-dir",
        default=DEFAULT_STYLED_DIR,
        type=Path,
        help="Directory containing styled images for optional red mask overlays.",
    )
    return parser.parse_args(argv)


def _build_overlay(styled: Image.Image, mask: Image.Image) -> Image.Image:
    base = styled.convert("RGBA")
    mask_l = mask.convert("L").resize(base.size)
    red = Image.new("RGBA", base.size, (255, 0, 0, 110))
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    overlay.paste(red, mask=mask_l)
    return Image.alpha_composite(base, overlay).convert("RGB")


def generate_masks(depth_dir: Path, output_dir: Path, styled_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    saved: list[Path] = []
    for view in VIEWS:
        depth_path = depth_dir / f"depth_{view}.png"
        if not depth_path.exists():
            raise FileNotFoundError(f"missing depth input: {depth_path}")

        depth = Image.open(depth_path).convert("RGB")
        mask = _build_front_side_inpaint_mask(depth)
        for preset in PRESETS:
            out_path = output_dir / f"inpaint_mask_{preset}_day_{view}.png"
            mask.save(out_path, format="PNG")
            saved.append(out_path)

            styled_path = styled_dir / f"styled_{preset}_day_{view}.png"
            if styled_path.exists():
                styled = Image.open(styled_path).convert("RGB")
                overlay = _build_overlay(styled, mask)
                overlay_path = output_dir / f"inpaint_overlay_{preset}_day_{view}.png"
                overlay.save(overlay_path, format="PNG")
                saved.append(overlay_path)

    return saved


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    depth_dir = args.depth_dir.resolve()
    styled_dir = args.styled_dir.resolve()
    output_dir = args.output.resolve()

    print(f"[depth] {_display_path(depth_dir)}")
    print(f"[styled] {_display_path(styled_dir)}")
    print(f"[output] {_display_path(output_dir)}")

    try:
        saved = generate_masks(depth_dir, output_dir, styled_dir)
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    for path in saved:
        print(f"  saved {_display_path(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
