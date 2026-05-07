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
    / "ifc2img_eye_auto_background_mask_tight_preview1"
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
DEFAULT_BACKGROUND_MODE = "guided"
BACKGROUND_MODES = ("guided", "free")
FREE_BACKGROUND_PROMPTS: dict[str, str] = {
    "korean_house": (
        "realistic Korean residential setting, natural daylight, "
        "background matching the house"
    ),
    "korean_villa": (
        "realistic Korean villa surroundings, natural daylight, "
        "background matching the house"
    ),
    "scandinavian": (
        "realistic Nordic residential setting, natural daylight, "
        "background matching the house"
    ),
}
FREE_BACKGROUND_NEGATIVE = (
    "pool, water, reflection, mirror floor, display base, model base, extra floor, "
    "foreground grass strip, lawn strip"
)
DEFAULT_STRENGTH = 0.55
DEFAULT_STEPS = 24
DEFAULT_GUIDANCE_SCALE = 6.0
DEFAULT_SEED = 52
DEFAULT_BOTTOM_STRIP_RATIO = 0.10
DEFAULT_BOTTOM_STRIP_PREFILL_MODE = "solid"
BOTTOM_STRIP_PREFILL_MODES = ("solid", "feather")
DEFAULT_SECOND_PASS_BOTTOM_STRIP_RATIO = 0.16
DEFAULT_SECOND_PASS_STRENGTH = 0.75
DEFAULT_SECOND_PASS_FEATHER_RATIO = 0.35
BOTTOM_STRIP_COLORS: dict[str, tuple[int, int, int]] = {
    "neutral_paved": (134, 130, 120),
    "dry_ground": (142, 133, 112),
}
BOTTOM_STRIP_SECOND_PASS_PROMPT = (
    "seamless foreground ground matching the scene, natural residential setting"
)
BOTTOM_STRIP_SECOND_PASS_NEGATIVE = (
    "grass strip, green strip, gray strip, hard horizontal band, text, numbers, "
    "watermark, pool, water, reflection"
)


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
        "--background-mode",
        choices=BACKGROUND_MODES,
        default=DEFAULT_BACKGROUND_MODE,
        help="guided uses preset yard/background terms; free lets the model infer context.",
    )
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
    parser.add_argument(
        "--prefill-bottom-strip",
        action="store_true",
        help="Prefill the source image bottom strip before inpaint.",
    )
    parser.add_argument(
        "--bottom-strip-ratio",
        default=DEFAULT_BOTTOM_STRIP_RATIO,
        type=float,
        help="Source image height ratio to prefill from the bottom.",
    )
    parser.add_argument(
        "--bottom-strip-color",
        choices=tuple(BOTTOM_STRIP_COLORS),
        default="neutral_paved",
        help="Color preset used for bottom strip prefill.",
    )
    parser.add_argument(
        "--bottom-strip-prefill-mode",
        choices=BOTTOM_STRIP_PREFILL_MODES,
        default=DEFAULT_BOTTOM_STRIP_PREFILL_MODE,
        help="Use solid replacement or a vertical feather toward the bottom.",
    )
    parser.add_argument(
        "--second-pass-bottom-strip",
        action="store_true",
        help="Run a second inpaint pass only over the lower strip.",
    )
    parser.add_argument(
        "--second-pass-bottom-strip-ratio",
        default=DEFAULT_SECOND_PASS_BOTTOM_STRIP_RATIO,
        type=float,
        help="Image height ratio covered by the second-pass lower strip mask.",
    )
    parser.add_argument(
        "--second-pass-strength",
        default=DEFAULT_SECOND_PASS_STRENGTH,
        type=float,
        help="Inpaint strength for the second-pass lower strip.",
    )
    parser.add_argument(
        "--second-pass-feather-ratio",
        default=DEFAULT_SECOND_PASS_FEATHER_RATIO,
        type=float,
        help="Fraction of the second-pass strip height used as top feather.",
    )
    return parser.parse_args(argv)


def _resolve_background_prompt_pair(
    preset: str,
    background_mode: str,
) -> tuple[str, str]:
    if background_mode == "guided":
        params = resolve_preset_background_params(preset)
        return params.prompt, params.negative_prompt
    if background_mode == "free":
        prompt = FREE_BACKGROUND_PROMPTS.get(preset)
        if prompt is None:
            raise ValueError(f"unknown free background preset: {preset}")
        return prompt, FREE_BACKGROUND_NEGATIVE
    raise ValueError(f"unsupported background mode: {background_mode}")


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


def _prefill_bottom_strip(
    source: Image.Image,
    ratio: float = DEFAULT_BOTTOM_STRIP_RATIO,
    color_name: str = "neutral_paved",
    mode: str = DEFAULT_BOTTOM_STRIP_PREFILL_MODE,
) -> Image.Image:
    if ratio <= 0:
        return source.convert("RGB")
    if ratio >= 1:
        raise ValueError("bottom strip ratio must be less than 1.0")
    if mode not in BOTTOM_STRIP_PREFILL_MODES:
        raise ValueError(f"unsupported bottom strip prefill mode: {mode}")
    color = BOTTOM_STRIP_COLORS.get(color_name)
    if color is None:
        raise ValueError(f"unsupported bottom strip color: {color_name}")

    image = source.convert("RGB").copy()
    height = image.height
    strip_height = max(1, int(round(height * ratio)))
    y_start = max(0, height - strip_height)
    if mode == "solid":
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, y_start, image.width, image.height), fill=color)
        return image

    pixels = image.load()
    denominator = max(1, strip_height - 1)
    for y in range(y_start, height):
        alpha = (y - y_start) / denominator
        for x in range(image.width):
            current = pixels[x, y]
            pixels[x, y] = tuple(
                int(round(current[channel] * (1.0 - alpha) + color[channel] * alpha))
                for channel in range(3)
            )
    return image


def _make_bottom_strip_mask(
    size: tuple[int, int],
    ratio: float = DEFAULT_SECOND_PASS_BOTTOM_STRIP_RATIO,
    feather_ratio: float = DEFAULT_SECOND_PASS_FEATHER_RATIO,
) -> Image.Image:
    if ratio <= 0:
        raise ValueError("bottom strip mask ratio must be greater than 0")
    if ratio >= 1:
        raise ValueError("bottom strip mask ratio must be less than 1.0")
    if feather_ratio < 0 or feather_ratio > 1:
        raise ValueError("bottom strip mask feather ratio must be in [0, 1]")

    width, height = size
    strip_height = max(1, int(round(height * ratio)))
    y_start = max(0, height - strip_height)
    feather_height = int(round(strip_height * feather_ratio))
    mask = Image.new("L", size, 0)
    pixels = mask.load()
    for y in range(y_start, height):
        if feather_height > 0 and y < y_start + feather_height:
            alpha = (y - y_start + 1) / feather_height
            value = int(round(255 * alpha))
        else:
            value = 255
        for x in range(width):
            pixels[x, y] = value
    return mask


def _make_contact_sheet(
    rows: list[tuple[str, Image.Image, Image.Image, Image.Image, Image.Image]]
) -> Image.Image:
    if not rows:
        raise ValueError("no rows to compose")

    cell_w, cell_h = rows[0][1].size
    label_w = 92
    header_h = 28
    gap = 10
    sheet_w = label_w + cell_w * 4 + gap * 3
    sheet_h = header_h + cell_h * len(rows)
    sheet = Image.new("RGB", (sheet_w, sheet_h), "white")
    draw = ImageDraw.Draw(sheet)

    for index, header in enumerate(("input", "prefill", "outside_mask", "inpaint")):
        x = label_w + index * (cell_w + gap)
        draw.text((x + 4, 8), header, fill=(0, 0, 0))

    for row_index, (view_name, original, source, mask, output) in enumerate(rows):
        y = header_h + row_index * cell_h
        draw.text((4, y + 8), view_name, fill=(0, 0, 0))
        for index, image in enumerate((original, source, mask.convert("RGB"), output)):
            x = label_w + index * (cell_w + gap)
            sheet.paste(image.convert("RGB"), (x, y))

    return sheet


def run(args: argparse.Namespace) -> list[Path]:
    input_dir = args.input_dir.resolve()
    mask_dir = args.mask_dir.resolve()
    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt, negative_prompt = _resolve_background_prompt_pair(
        args.preset,
        args.background_mode,
    )

    pipe, device = _load_inpaint_pipeline(args.model_id)
    saved: list[Path] = []
    rows: list[tuple[str, Image.Image, Image.Image, Image.Image, Image.Image]] = []

    for index, view in enumerate(args.views):
        source_path = input_dir / f"style_{view}_{args.preset}.png"
        mask_path = mask_dir / f"auto_background_target_{view}.png"
        if not source_path.exists():
            raise FileNotFoundError(f"missing source image: {source_path}")
        if not mask_path.exists():
            raise FileNotFoundError(f"missing mask image: {mask_path}")

        original = Image.open(source_path).convert("RGB")
        source = original
        if args.prefill_bottom_strip:
            source = _prefill_bottom_strip(
                original,
                ratio=args.bottom_strip_ratio,
                color_name=args.bottom_strip_color,
                mode=args.bottom_strip_prefill_mode,
            )
            prefill_path = (
                output_dir
                / f"eye_auto_background_prefill_source_{view}_{args.preset}_{args.background_mode}_{args.bottom_strip_prefill_mode}_r{int(round(args.bottom_strip_ratio * 100)):03d}.png"
            )
            source.save(prefill_path, format="PNG")
            saved.append(prefill_path)
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

        if args.second_pass_bottom_strip:
            bottom_mask = _make_bottom_strip_mask(
                output.size,
                ratio=args.second_pass_bottom_strip_ratio,
                feather_ratio=args.second_pass_feather_ratio,
            )
            second_mask_path = (
                output_dir
                / f"eye_auto_background_second_pass_bottom_mask_{view}_r{int(round(args.second_pass_bottom_strip_ratio * 100)):03d}.png"
            )
            bottom_mask.save(second_mask_path, format="PNG")
            saved.append(second_mask_path)
            second_generator = torch.Generator(device=device).manual_seed(
                args.seed + 1000 + index
            )
            output = pipe(
                prompt=BOTTOM_STRIP_SECOND_PASS_PROMPT,
                negative_prompt=BOTTOM_STRIP_SECOND_PASS_NEGATIVE,
                image=output,
                mask_image=bottom_mask,
                width=output.width,
                height=output.height,
                strength=args.second_pass_strength,
                guidance_scale=args.guidance_scale,
                num_inference_steps=args.steps,
                generator=second_generator,
            ).images[0]

        result_path = (
            output_dir
            / f"eye_auto_background_inpaint_{view}_{args.preset}_{args.background_mode}_s{int(round(args.strength * 100)):03d}_seed{args.seed + index}.png"
        )
        output.save(result_path, format="PNG")
        saved.append(result_path)
        rows.append((view, original, source, mask, output))

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
    print(f"[background-mode] {args.background_mode}")
    print(f"[views] {list(args.views)}")
    print(f"[strength] {args.strength}")
    print(f"[steps] {args.steps}")
    print(f"[guidance-scale] {args.guidance_scale}")
    print(f"[prefill-bottom-strip] {args.prefill_bottom_strip}")
    if args.prefill_bottom_strip:
        print(f"[bottom-strip-ratio] {args.bottom_strip_ratio}")
        print(f"[bottom-strip-color] {args.bottom_strip_color}")
        print(f"[bottom-strip-prefill-mode] {args.bottom_strip_prefill_mode}")
    print(f"[second-pass-bottom-strip] {args.second_pass_bottom_strip}")
    if args.second_pass_bottom_strip:
        print(f"[second-pass-bottom-strip-ratio] {args.second_pass_bottom_strip_ratio}")
        print(f"[second-pass-strength] {args.second_pass_strength}")
        print(f"[second-pass-feather-ratio] {args.second_pass_feather_ratio}")

    try:
        prompt, negative = _resolve_background_prompt_pair(
            args.preset,
            args.background_mode,
        )
        print(f"[prompt] {prompt}")
        print(f"[negative] {negative}")
        saved = run(args)
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    for path in saved:
        print(f"[saved] {_display_path(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
