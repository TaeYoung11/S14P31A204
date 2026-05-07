"""Run EYE auto-background inpaint smoke using full outside masks.

This script keeps the protected house body from the first-pass styled image and
repaints the full outside region with preset-specific yard/background prior.

Examples:
    uv run python scripts/run_eye_auto_background_inpaint.py
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import torch
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "packages" / "ai-rendering" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from ai_rendering.ifc2img import resolve_preset_background_params  # noqa: E402

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


DEFAULT_INPUT_DIR = (
    ROOT
    / "outputs"
    / "ifc2img_eye_ground_extent_105_style_smoke1"
    / "AC20-FZK-Haus"
)
DEFAULT_MASK_DIR = (
    ROOT
    / "outputs"
    / "ifc2img_eye_auto_background_mask_preview1"
    / "AC20-FZK-Haus"
)
DEFAULT_OUTPUT_DIR = (
    ROOT
    / "outputs"
    / "ifc2img_eye_auto_background_inpaint_smoke1"
    / "AC20-FZK-Haus"
)
DEFAULT_MODEL_ID = "runwayml/stable-diffusion-inpainting"
DEFAULT_PRESET = "korean_house"
DEFAULT_VIEWS = ("eye_ne", "eye_nw", "eye_se")
DEFAULT_STRENGTH = 0.55
DEFAULT_STEPS = 24
DEFAULT_GUIDANCE_SCALE = 6.0
DEFAULT_SEED = 52


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_views(raw: str) -> tuple[str, ...]:
    views = tuple(v.strip() for v in raw.split(",") if v.strip())
    if not views:
        raise argparse.ArgumentTypeError("at least one view is required")
    allowed = set(DEFAULT_VIEWS)
    invalid = [v for v in views if v not in allowed]
    if invalid:
        raise argparse.ArgumentTypeError(f"invalid EYE views: {invalid}")
    return views


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run EYE auto-background inpaint smoke."
    )
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, type=Path)
    parser.add_argument("--mask-dir", default=DEFAULT_MASK_DIR, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR, type=Path)
    parser.add_argument("--preset", default=DEFAULT_PRESET)
    parser.add_argument(
        "--views",
        default=",".join(DEFAULT_VIEWS),
        type=_parse_views,
        help="Comma-separated EYE views.",
    )
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID)
    parser.add_argument("--strength", default=DEFAULT_STRENGTH, type=float)
    parser.add_argument("--steps", default=DEFAULT_STEPS, type=int)
    parser.add_argument("--guidance-scale", default=DEFAULT_GUIDANCE_SCALE, type=float)
    parser.add_argument("--seed", default=DEFAULT_SEED, type=int)
    return parser.parse_args(argv)


def _load_inpaint_pipeline(model_id: str):
    from diffusers import DPMSolverMultistepScheduler, StableDiffusionInpaintPipeline

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    pipe = StableDiffusionInpaintPipeline.from_pretrained(
        model_id,
        torch_dtype=dtype,
        safety_checker=None,
    )
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(
        pipe.scheduler.config,
        use_karras_sigmas=True,
        algorithm_type="dpmsolver++",
    )
    device = "cuda" if torch.cuda.is_available() else "cpu"
    pipe = pipe.to(device)
    return pipe, device


def _make_contact_sheet(rows: list[tuple[str, Image.Image, Image.Image, Image.Image]]) -> Image.Image:
    if not rows:
        raise ValueError("no rows to compose")

    cell_w, cell_h = rows[0][1].size
    label_w = 92
    header_h = 28
    gap = 10
    sheet_w = label_w + cell_w * 3 + gap * 2
    sheet_h = header_h + cell_h * len(rows)
    sheet = Image.new("RGB", (sheet_w, sheet_h), "white")
    draw = ImageDraw.Draw(sheet)

    for index, header in enumerate(("input", "outside_mask", "inpaint")):
        x = label_w + index * (cell_w + gap)
        draw.text((x + 4, 8), header, fill=(0, 0, 0))

    for row_index, (view_name, source, mask, output) in enumerate(rows):
        y = header_h + row_index * cell_h
        draw.text((4, y + 8), view_name, fill=(0, 0, 0))
        for index, image in enumerate((source, mask.convert("RGB"), output)):
            x = label_w + index * (cell_w + gap)
            sheet.paste(image.convert("RGB"), (x, y))

    return sheet


def run(args: argparse.Namespace) -> list[Path]:
    input_dir = args.input_dir.resolve()
    mask_dir = args.mask_dir.resolve()
    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    params = resolve_preset_background_params(args.preset)
    prompt = params.prompt
    negative_prompt = params.negative_prompt

    pipe, device = _load_inpaint_pipeline(args.model_id)
    saved: list[Path] = []
    rows: list[tuple[str, Image.Image, Image.Image, Image.Image]] = []

    for index, view in enumerate(args.views):
        source_path = input_dir / f"style_{view}_{args.preset}.png"
        mask_path = mask_dir / f"auto_background_target_{view}.png"
        if not source_path.exists():
            raise FileNotFoundError(f"missing source image: {source_path}")
        if not mask_path.exists():
            raise FileNotFoundError(f"missing mask image: {mask_path}")

        source = Image.open(source_path).convert("RGB")
        mask = Image.open(mask_path).convert("L").resize(source.size)
        generator = torch.Generator(device=device).manual_seed(args.seed + index)
        output = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            image=source,
            mask_image=mask,
            width=source.width,
            height=source.height,
            strength=args.strength,
            guidance_scale=args.guidance_scale,
            num_inference_steps=args.steps,
            generator=generator,
        ).images[0]

        result_path = (
            output_dir
            / f"eye_auto_background_inpaint_{view}_{args.preset}_s{int(round(args.strength * 100)):03d}_seed{args.seed + index}.png"
        )
        output.save(result_path, format="PNG")
        saved.append(result_path)
        rows.append((view, source, mask, output))

    sheet_path = output_dir / "compare_eye_auto_background_inpaint_smoke.png"
    _make_contact_sheet(rows).save(sheet_path, format="PNG")
    saved.append(sheet_path)
    return saved


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    print(f"[input] {_display_path(args.input_dir.resolve())}")
    print(f"[mask] {_display_path(args.mask_dir.resolve())}")
    print(f"[output] {_display_path(args.output.resolve())}")
    print(f"[preset] {args.preset}")
    print(f"[views] {list(args.views)}")
    print(f"[strength] {args.strength}")
    print(f"[steps] {args.steps}")
    print(f"[guidance-scale] {args.guidance_scale}")

    try:
        params = resolve_preset_background_params(args.preset)
        print(f"[prompt] {params.prompt}")
        print(f"[negative] {params.negative_prompt}")
        saved = run(args)
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    for path in saved:
        print(f"[saved] {_display_path(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
