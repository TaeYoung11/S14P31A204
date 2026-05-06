"""Run a first-pass Korean-villa prompt prior experiment.

This script keeps the same depth input, model, seed, and ControlNet settings as
the normal `korean_villa` preset, but swaps the prompt to a simpler single-mass
residential house prior. It is meant to check whether the lower facade artifact
is caused before inpaint by the Korean-villa prompt itself.

Examples:
    uv run python scripts/run_korean_villa_prompt_prior_trial.py
"""

from __future__ import annotations

import argparse
import io
import sys
from dataclasses import replace
from pathlib import Path

from PIL import Image

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from ai_rendering.ifc2img import DepthStyleRenderer, IFCView, load_preset  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_DIR = ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "ifc2img_korean_villa_prompt_prior_trial1" / "AC20-FZK-Haus"
DEFAULT_VIEW = "side"
DEFAULT_VARIANT = "simple_mass"

SIMPLE_MASS_PROMPT = (
    "RAW photo, Korean style single-volume house, flat paved ground touches facade, "
    "light concrete wall, subtle brick accents, simple tile roof, no balcony, "
    "no piloti, no podium"
)

COMPACT_NEGATIVE = (
    "stone wall, retaining wall, fence, foreground wall, raised platform, podium, "
    "piloti, balcony, basement, extra floor, shopfront, stairs"
)

SHORT_GROUND_PROMPT = (
    "RAW photo, simple Korean house, ground directly touches facade, no foreground "
    "wall, single-volume mass, plain concrete facade, simple tile roof"
)

FLAT_PLAZA_PROMPT = (
    "RAW photo, minimal Korean style house on flat concrete plaza, ground touches "
    "facade, simple concrete house, simple tile roof, no fence, no foreground wall"
)

VARIANTS = {
    "simple_mass": SIMPLE_MASS_PROMPT,
    "short_ground": SHORT_GROUND_PROMPT,
    "flat_plaza": FLAT_PLAZA_PROMPT,
}


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Korean-villa first-pass prompt-prior trial."
    )
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR, type=Path)
    parser.add_argument("--view", default=DEFAULT_VIEW, choices=("front", "side"))
    parser.add_argument("--variant", default=DEFAULT_VARIANT, choices=tuple(VARIANTS))
    return parser.parse_args(argv)


def _build_params(variant: str):
    base = load_preset("korean_villa", "day")
    return replace(
        base,
        prompt=VARIANTS[variant],
        negative_prompt=COMPACT_NEGATIVE,
    )


def run(args: argparse.Namespace) -> Path:
    input_dir = args.input_dir.resolve()
    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    view = IFCView(args.view)
    depth_path = input_dir / f"depth_{args.view}.png"
    if not depth_path.exists():
        raise FileNotFoundError(f"missing depth image: {depth_path}")

    depth = Image.open(depth_path).convert("RGB")
    params = _build_params(args.variant)
    renderer = DepthStyleRenderer(warmup=False)
    result = renderer.render(depth, params, view=view)

    out_path = output_dir / f"styled_korean_villa_{args.variant}_day_{args.view}.png"
    result.save(out_path)
    return out_path


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    print(f"[input] {_display_path(args.input_dir.resolve())}")
    print(f"[output] {_display_path(args.output.resolve())}")
    print(f"[variant] {args.variant}")
    print(f"[view] {args.view}")

    try:
        out_path = run(args)
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    print(f"  saved {_display_path(out_path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
