"""Run a wide-ground prefill + tighter artifact inpaint experiment.

The experiment keeps the first-pass Realistic Vision image outside the inpaint
mask, but it changes the inpaint init image more broadly: the lower foreground
is prefilled as a neutral paved ground plane before only a tighter artifact
region is repainted.

Examples:
    uv run python scripts/run_front_side_wide_ground_inpaint.py
"""

from __future__ import annotations

import argparse
import io
import math
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFilter

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_DIR = ROOT / "outputs" / "ifc2img_front_side_rv_trial1" / "AC20-FZK-Haus"
DEFAULT_OUTPUT_DIR = (
    ROOT / "outputs" / "ifc2img_front_side_inpaint_wide_ground_trial1" / "AC20-FZK-Haus"
)
DEFAULT_MODEL_ID = "runwayml/stable-diffusion-inpainting"
DEFAULT_PRESET = "korean_villa"
DEFAULT_VIEW = "side"
DEFAULT_STRENGTH = 0.60
DEFAULT_SEED = 42

POSITIVE_PROMPT = (
    "realistic Korean villa exterior, flat neutral concrete paved ground directly "
    "touching the building base, continuous simple ground plane across the full "
    "foreground, subtle perspective, no height difference at facade base, natural "
    "daylight, realistic residential facade"
)
NEGATIVE_PROMPT = (
    "snow, retaining wall, concrete wall, parapet, platform, terrace, roof strip, "
    "raised foundation, extra lower floor, basement, stairs, balcony, railing, "
    "fence, low wall, new windows in lower area, new entrance below facade, "
    "deformed facade, warped house, melted building, ornate entrance, foggy "
    "transition, haze, floating ground patch"
)


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a wide-ground prefill + tighter artifact inpaint experiment."
    )
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, type=Path)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR, type=Path)
    parser.add_argument("--preset", default=DEFAULT_PRESET)
    parser.add_argument("--view", default=DEFAULT_VIEW, choices=("front", "side"))
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID)
    parser.add_argument("--strength", default=DEFAULT_STRENGTH, type=float)
    parser.add_argument("--seed", default=DEFAULT_SEED, type=int)
    parser.add_argument("--steps", default=30, type=int)
    parser.add_argument("--guidance-scale", default=7.5, type=float)
    return parser.parse_args(argv)


def _depth_geometry_bbox(depth: Image.Image) -> tuple[int, int, int, int, int]:
    arr = np.asarray(depth.convert("RGB"), dtype=np.uint8)
    geom_mask = ~np.all(arr == 0, axis=2)
    if not np.any(geom_mask):
        raise ValueError("depth image has no non-background geometry")

    ys, xs = np.nonzero(geom_mask)
    height, _ = geom_mask.shape
    bottom_by_x = np.full(geom_mask.shape[1], -1, dtype=np.int32)
    for x in np.unique(xs):
        bottom_by_x[x] = int(ys[xs == x].max())

    support_bottoms = bottom_by_x[bottom_by_x >= 0]
    base_y = int(np.percentile(support_bottoms, 75))
    base_y = int(np.clip(base_y, 0, height - 1))
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()), base_y


def _build_wide_ground_mask(size: tuple[int, int], bbox: tuple[int, int, int, int, int]) -> Image.Image:
    width, height = size
    left, _top, right, _bottom, base_y = bbox
    bbox_width = max(1, right - left + 1)
    side_expand = max(16, int(round(bbox_width * 0.20)))

    top_y = min(height - 1, base_y + int(round(height * 0.025)))
    bottom_y = height - 1
    polygon = [
        (max(0, left - int(side_expand * 0.45)), top_y),
        (min(width - 1, right + int(side_expand * 0.45)), top_y + 2),
        (min(width - 1, right + side_expand), bottom_y),
        (max(0, left - side_expand), bottom_y),
    ]

    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(radius=2))


def _build_tighter_artifact_mask(
    size: tuple[int, int],
    bbox: tuple[int, int, int, int, int],
) -> Image.Image:
    width, height = size
    left, _top, right, _bottom, base_y = bbox
    bbox_width = max(1, right - left + 1)
    side_expand = max(10, int(round(bbox_width * 0.055)))

    top_y = min(height - 1, base_y + int(round(height * 0.050)))
    bottom_y = height - 1
    polygon = [
        (max(0, left + int(bbox_width * 0.055)), top_y),
        (min(width - 1, right - int(bbox_width * 0.055)), top_y + 2),
        (min(width - 1, right + side_expand), bottom_y),
        (max(0, left - side_expand), bottom_y),
    ]

    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(radius=5))


def _make_ground_texture(size: tuple[int, int], seed: int) -> Image.Image:
    width, height = size
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, height, dtype=np.float32)[:, None]
    x = np.linspace(0, 1, width, dtype=np.float32)[None, :]
    shade = 182 + y * 22 + (x - 0.5) * 4
    noise = rng.normal(0, 4.0, (height, width)).astype(np.float32)
    arr = np.stack([shade + noise, shade + noise, shade - 8 + noise], axis=2)

    for line_y in np.linspace(int(height * 0.12), height - 1, 5):
        thickness = max(1, int(round(1 + line_y / max(1, height) * 2)))
        y0 = int(round(line_y))
        arr[max(0, y0 - thickness) : min(height, y0 + thickness), :, :] -= 8

    return Image.fromarray(np.clip(np.rint(arr), 0, 255).astype(np.uint8), mode="RGB")


def _prefill_ground(image: Image.Image, mask: Image.Image, seed: int) -> Image.Image:
    base = image.convert("RGB")
    texture = _make_ground_texture(base.size, seed)
    alpha = np.asarray(mask.convert("L"), dtype=np.float32) / 255.0
    alpha = np.clip(alpha * 0.92, 0.0, 0.92)
    src = np.asarray(base, dtype=np.float32)
    tex = np.asarray(texture, dtype=np.float32)
    out = src * (1.0 - alpha[..., None]) + tex * alpha[..., None]
    return Image.fromarray(np.clip(np.rint(out), 0, 255).astype(np.uint8), mode="RGB")


def _overlay(image: Image.Image, mask: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    base = image.convert("RGBA")
    mask_l = mask.convert("L")
    tint = Image.new("RGBA", base.size, color)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(tint, mask=mask_l)
    return Image.alpha_composite(base, layer).convert("RGB")


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


def run(args: argparse.Namespace) -> list[Path]:
    input_dir = args.input_dir.resolve()
    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    depth_path = input_dir / f"depth_{args.view}.png"
    styled_path = input_dir / f"styled_{args.preset}_day_{args.view}.png"
    if not depth_path.exists():
        raise FileNotFoundError(f"missing depth image: {depth_path}")
    if not styled_path.exists():
        raise FileNotFoundError(f"missing styled image: {styled_path}")

    depth = Image.open(depth_path).convert("RGB")
    styled = Image.open(styled_path).convert("RGB")
    bbox = _depth_geometry_bbox(depth)

    wide_mask = _build_wide_ground_mask(styled.size, bbox)
    artifact_mask = _build_tighter_artifact_mask(styled.size, bbox)
    prefill = _prefill_ground(styled, wide_mask, args.seed)

    slug = f"{args.preset}_day_{args.view}"
    saved = [
        output_dir / f"wide_ground_mask_{slug}.png",
        output_dir / f"artifact_inpaint_mask_{slug}.png",
        output_dir / f"wide_ground_overlay_{slug}.png",
        output_dir / f"artifact_mask_overlay_{slug}.png",
        output_dir / f"prefill_wide_ground_{slug}.png",
    ]
    wide_mask.save(saved[0], format="PNG")
    artifact_mask.save(saved[1], format="PNG")
    _overlay(styled, wide_mask, (0, 128, 255, 100)).save(saved[2], format="PNG")
    _overlay(prefill, artifact_mask, (255, 0, 0, 115)).save(saved[3], format="PNG")
    prefill.save(saved[4], format="PNG")

    pipe, device = _load_inpaint_pipeline(args.model_id)
    generator = torch.Generator(device=device).manual_seed(args.seed)
    output = pipe(
        prompt=POSITIVE_PROMPT,
        negative_prompt=NEGATIVE_PROMPT,
        image=prefill,
        mask_image=artifact_mask,
        strength=args.strength,
        guidance_scale=args.guidance_scale,
        num_inference_steps=args.steps,
        generator=generator,
    ).images[0]

    result_path = (
        output_dir
        / f"inpaint_wide_ground_{slug}_s{int(round(args.strength * 100)):03d}_seed{args.seed}.png"
    )
    output.save(result_path, format="PNG")
    saved.append(result_path)
    return saved


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    print(f"[input] {_display_path(args.input_dir.resolve())}")
    print(f"[output] {_display_path(args.output.resolve())}")
    print(f"[slot] {args.preset} day {args.view}")
    print(f"[strength] {args.strength}")

    try:
        saved = run(args)
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1

    for path in saved:
        print(f"  saved {_display_path(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
