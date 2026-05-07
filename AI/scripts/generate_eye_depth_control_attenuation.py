"""Generate preview assets for EYE ground-plane depth/control attenuation.

This only writes control preview images. It does not run generation.

Examples:
    uv run python scripts/generate_eye_depth_control_attenuation.py --input-dir outputs/my_eye_depths/AC20-FZK-Haus
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "packages" / "ai-rendering" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from ai_rendering.ifc2img.style import (  # noqa: E402
    EYE_GROUND_PLANE_CONTROL_ATTENUATION_STRENGTH,
    _apply_eye_ground_plane_control_attenuation,
    _build_eye_ground_plane_aware_mask,
)

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


DEFAULT_INPUT_DIR = (
    ROOT / "outputs" / "ifc2img_eye_depth_control_source1" / "AC20-FZK-Haus"
)
DEFAULT_OUTPUT_DIR = (
    ROOT
    / "outputs"
    / "ifc2img_eye_depth_control_attenuation_preview1"
    / "AC20-FZK-Haus"
)
DEFAULT_STRENGTHS = (0.12, EYE_GROUND_PLANE_CONTROL_ATTENUATION_STRENGTH, 0.24)
DEPTH_NAMES = ("depth_eye_ne.png", "depth_eye_nw.png", "depth_eye_se.png")


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate EYE depth/control attenuation preview assets."
    )
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR, type=Path)
    parser.add_argument(
        "--strengths",
        default=",".join(f"{value:.2f}" for value in DEFAULT_STRENGTHS),
        help="Comma-separated attenuation strengths, e.g. 0.12,0.18,0.24.",
    )
    return parser.parse_args(argv)


def _parse_strengths(raw: str) -> tuple[float, ...]:
    strengths: list[float] = []
    for item in raw.split(","):
        text = item.strip()
        if not text:
            continue
        value = float(text)
        if not 0.0 <= value <= 1.0:
            raise ValueError(f"strength must be in [0, 1]: {value}")
        strengths.append(value)
    if not strengths:
        raise ValueError("at least one strength is required")
    return tuple(strengths)


def _strength_slug(strength: float) -> str:
    return f"s{int(round(strength * 100)):03d}"


def _make_contact_sheet(
    rows: list[tuple[str, Image.Image, Image.Image, list[tuple[float, Image.Image]]]]
) -> Image.Image:
    if not rows:
        raise ValueError("no preview rows to compose")

    strengths = [strength for strength, _ in rows[0][3]]
    cell_w, cell_h = rows[0][1].size
    label_w = 92
    header_h = 28
    gap = 10
    columns = 2 + len(strengths)
    sheet_w = label_w + cell_w * columns + gap * (columns - 1)
    sheet_h = header_h + cell_h * len(rows)
    sheet = Image.new("RGB", (sheet_w, sheet_h), "white")
    draw = ImageDraw.Draw(sheet)

    headers = ["depth", "mask"] + [f"attenuation {_strength_slug(s)}" for s in strengths]
    for index, header in enumerate(headers):
        x = label_w + index * (cell_w + gap)
        draw.text((x + 4, 8), header, fill=(0, 0, 0))

    for row_index, (view_name, depth, mask, variants) in enumerate(rows):
        y = header_h + row_index * cell_h
        draw.text((4, y + 8), view_name, fill=(0, 0, 0))
        images = [depth.convert("RGB"), mask.convert("RGB")]
        images.extend(image.convert("RGB") for _strength, image in variants)
        for index, image in enumerate(images):
            x = label_w + index * (cell_w + gap)
            sheet.paste(image, (x, y))

    return sheet


def generate_previews(
    input_dir: Path,
    output_dir: Path,
    strengths: tuple[float, ...] = DEFAULT_STRENGTHS,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    saved: list[Path] = []
    rows: list[tuple[str, Image.Image, Image.Image, list[tuple[float, Image.Image]]]] = []
    for depth_name in DEPTH_NAMES:
        depth_path = input_dir / depth_name
        if not depth_path.exists():
            raise FileNotFoundError(f"missing depth input: {depth_path}")

        view_name = depth_name.removeprefix("depth_").removesuffix(".png")
        depth = Image.open(depth_path).convert("RGB")
        mask = _build_eye_ground_plane_aware_mask(depth)
        mask_path = output_dir / f"eye_ground_plane_attenuation_mask_{view_name}.png"
        mask.save(mask_path, format="PNG")
        saved.append(mask_path)

        variants: list[tuple[float, Image.Image]] = []
        for strength in strengths:
            attenuated = _apply_eye_ground_plane_control_attenuation(
                depth,
                strength=strength,
            )
            out_path = (
                output_dir
                / f"eye_ground_plane_attenuated_control_{view_name}_{_strength_slug(strength)}.png"
            )
            attenuated.save(out_path, format="PNG")
            saved.append(out_path)
            variants.append((strength, attenuated))
        rows.append((view_name, depth, mask, variants))

    sheet_path = output_dir / "compare_eye_depth_control_attenuation_preview.png"
    _make_contact_sheet(rows).save(sheet_path, format="PNG")
    saved.append(sheet_path)
    return saved


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    input_dir = args.input_dir.resolve()
    output_dir = args.output.resolve()

    print(f"[input] {_display_path(input_dir)}")
    print(f"[output] {_display_path(output_dir)}")
    try:
        strengths = _parse_strengths(args.strengths)
        print(f"[strengths] {', '.join(f'{s:.2f}' for s in strengths)}")
        saved = generate_previews(input_dir, output_dir, strengths)
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    for path in saved:
        print(f"[saved] {_display_path(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
