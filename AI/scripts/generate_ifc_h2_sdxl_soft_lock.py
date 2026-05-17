"""Phase H-2. SDXL soft-lock img2img on F-2 IFC-locked baseline.

Reuses the H-1 source/F-2 artifacts when present, otherwise regenerates from
shinchan.ifc. Renders DAY and NIGHT with Juggernaut-XL-v9 + SDXL depth ControlNet
at 1024x640. Soft-lock parameters mirror the H-1.b hot tuning principle: low CN
scale + medium strength so init image colors persist while photoreal texture
emerges.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_ifc_locked_baseline_f2 import generate_ifc_locked_baseline_f2  # noqa: E402

DEFAULT_IFC = ROOT / "packages/ai-rendering/tests/fixtures/ifc/shinchan.ifc"
DEFAULT_OUTPUT_ROOT = ROOT / "outputs/ifc_geometry_h2_sdxl"
DEFAULT_H1_DIR = ROOT / "outputs/ifc_geometry_h1_cn11_sweep"
DEFAULT_G4_DIR = ROOT / "outputs/ifc_geometry_g4_soft_lock_diffusion_realvision"
DEFAULT_SDXL_PHOTOREAL_ID = "RunDiffusion/Juggernaut-XL-v9"
RENDER_SIZE = (1024, 640)
STRENGTH = 0.55
DEPTH_CN_SCALE = 0.55
GUIDANCE = 6.0
STEPS = 30
PRESET = "ifc_minimal"
VIEWS = ("front_diagonal_left", "front_diagonal_right")
TIME_OF_DAY_CHOICES = ("DAY", "NIGHT", "both")
DEFAULT_SEED = 42


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Phase H-2. SDXL soft-lock.")
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument(
        "--h1-dir", type=Path, default=DEFAULT_H1_DIR,
        help="Reuse H-1 source / F-2 artifacts when present.",
    )
    parser.add_argument("--g4-dir", type=Path, default=DEFAULT_G4_DIR)
    parser.add_argument("--model-id", default=DEFAULT_SDXL_PHOTOREAL_ID)
    parser.add_argument(
        "--time-of-day", choices=TIME_OF_DAY_CHOICES, default="both",
    )
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--strength", type=float, default=STRENGTH)
    parser.add_argument("--depth-cn-scale", type=float, default=DEPTH_CN_SCALE)
    parser.add_argument("--guidance-scale", type=float, default=GUIDANCE)
    parser.add_argument("--steps", type=int, default=STEPS)
    parser.add_argument("--width", type=int, default=RENDER_SIZE[0])
    parser.add_argument("--height", type=int, default=RENDER_SIZE[1])
    parser.add_argument(
        "--cpu-offload", action="store_true",
        help="Enable sequential CPU offload (slower but safer for low VRAM).",
    )
    parser.add_argument(
        "--lightning-steps", type=int, choices=(4, 8), default=None,
        help="Load SDXL Lightning N-step LoRA for distilled fast inference.",
    )
    parser.add_argument(
        "--skip-regen", action="store_true",
        help="Reuse cached H-1 source/F-2 artifacts.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    output_root: Path = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    times: list[str]
    if args.time_of_day == "both":
        times = ["DAY", "NIGHT"]
    else:
        times = [args.time_of_day]

    f2_dir = output_root / "f2"
    source_dirs: dict[str, Path] = {}
    for tod in times:
        source_dir = _resolve_source_dir(
            time_of_day=tod,
            output_root=output_root,
            h1_dir=args.h1_dir.resolve(),
            skip_regen=args.skip_regen,
            ifc_path=args.ifc.resolve(),
        )
        source_dirs[tod] = source_dir

    if not args.skip_regen or not (f2_dir / "f2_ifc_locked_baseline_manifest.json").exists():
        print("[h2] regenerating F-2 IFC-locked baseline")
        fallback_source = next(iter(source_dirs.values()))
        day_debug = (
            source_dirs.get("DAY", fallback_source) / "debug" / "debug_manifest.json"
        )
        night_debug = (
            source_dirs.get("NIGHT", fallback_source) / "debug" / "debug_manifest.json"
        )
        if f2_dir.exists():
            shutil.rmtree(f2_dir)
        f2_dir.mkdir(parents=True, exist_ok=True)
        generate_ifc_locked_baseline_f2(
            day_debug_manifest_path=day_debug.resolve(),
            night_debug_manifest_path=night_debug.resolve(),
            output_dir=f2_dir.resolve(),
        )
    else:
        print(f"[h2] reusing existing F-2 at {f2_dir}")

    all_outputs = _run_h2(
        source_dirs=source_dirs,
        f2_dir=f2_dir,
        output_root=output_root,
        model_id=args.model_id,
        times=times,
        seed=args.seed,
        strength=args.strength,
        depth_cn_scale=args.depth_cn_scale,
        guidance=args.guidance_scale,
        steps=args.steps,
        width=args.width,
        height=args.height,
        cpu_offload=args.cpu_offload,
        lightning_steps=args.lightning_steps,
    )

    _write_h2_winner_day_night_sheet(output_root, all_outputs)
    _write_h2_vs_h1_vs_g4_sheet(
        output_root=output_root,
        h2_outputs=all_outputs,
        h1_dir=args.h1_dir.resolve(),
        g4_dir=args.g4_dir.resolve(),
    )
    _write_h2_manifest(output_root, args, all_outputs)
    print(f"[h2] done. outputs at {output_root}")


def _resolve_source_dir(
    *,
    time_of_day: str,
    output_root: Path,
    h1_dir: Path,
    skip_regen: bool,
    ifc_path: Path,
) -> Path:
    """Prefer existing H-1 source debug; otherwise regenerate locally."""
    h1_source = h1_dir / f"ifc_source_{time_of_day.lower()}"
    if (h1_source / "debug" / "debug_manifest.json").exists():
        print(f"[h2] reusing H-1 source for {time_of_day}: {h1_source}")
        return h1_source

    local_source = output_root / f"ifc_source_{time_of_day.lower()}"
    if skip_regen and (local_source / "debug" / "debug_manifest.json").exists():
        print(f"[h2] reusing local source for {time_of_day}: {local_source}")
        return local_source

    if local_source.exists():
        shutil.rmtree(local_source)
    local_source.mkdir(parents=True, exist_ok=True)
    print(f"[h2] regenerating IFC source for {time_of_day} -> {local_source}")
    from ai_rendering.ifc2img.service import run_ifc2img_photo_pipeline

    started = time.time()
    run_ifc2img_photo_pipeline(
        ifc_path=ifc_path,
        output_dir=local_source,
        preset=PRESET,
        time_of_day=time_of_day,
        debug_artifacts=True,
    )
    print(f"[h2] IFC source regen {time_of_day} {time.time() - started:.1f}s")
    return local_source


def _run_h2(
    *,
    source_dirs: dict[str, Path],
    f2_dir: Path,
    output_root: Path,
    model_id: str,
    times: list[str],
    seed: int,
    strength: float,
    depth_cn_scale: float,
    guidance: float,
    steps: int,
    width: int,
    height: int,
    cpu_offload: bool,
    lightning_steps: int | None = None,
) -> list[dict[str, Any]]:
    from ai_rendering.ifc2img.sdxl_soft_lock import (
        DEFAULT_SDXL_DEPTH_CONTROLNET_ID,
        DEFAULT_SDXL_VAE_FP16_FIX_ID,
        SdxlSoftLockDiffusionRenderer,
        SdxlSoftLockRenderParams,
    )
    from ai_rendering.ifc2img.soft_lock import (
        build_region_aware_negative_prompt,
        build_region_aware_prompt,
        visible_categories_from_element_masks,
    )

    started = time.time()
    renderer = SdxlSoftLockDiffusionRenderer(
        model_id=model_id,
        depth_controlnet_id=DEFAULT_SDXL_DEPTH_CONTROLNET_ID,
        vae_id=DEFAULT_SDXL_VAE_FP16_FIX_ID,
        cpu_offload=cpu_offload,
        lightning_steps=lightning_steps,
    )
    print(
        f"[h2] renderer load {time.time() - started:.1f}s "
        f"(model={model_id}, depth_cn={DEFAULT_SDXL_DEPTH_CONTROLNET_ID}, "
        f"offload={cpu_offload}, lightning_steps={lightning_steps})"
    )

    results: list[dict[str, Any]] = []
    for tod in times:
        sweep_dir = output_root / f"sweep_{tod.lower()}"
        sweep_dir.mkdir(parents=True, exist_ok=True)
        source_dir = source_dirs[tod]
        debug_manifest = json.loads(
            (source_dir / "debug" / "debug_manifest.json").read_text(encoding="utf-8")
        )
        f2_time_dir = f2_dir / f"ifc_locked_baseline_{tod.lower()}"

        for view_payload in debug_manifest.get("views", []):
            view = str(view_payload["view"])
            if view not in VIEWS:
                continue
            files = view_payload.get("files", {})
            depth_path = source_dir / str(files["depthControlImage"])
            masks = {
                key: source_dir / str(value)
                for key, value in files.get("elementMasks", {}).items()
                if isinstance(value, str)
            }
            init_path = f2_time_dir / f"baseline_with_background_{view}.png"

            visible = visible_categories_from_element_masks(masks)
            prompt = build_region_aware_prompt(
                visible_categories=visible, time_of_day=tod
            )
            negative = build_region_aware_negative_prompt(time_of_day=tod)

            init_image = Image.open(init_path).convert("RGB")
            depth_image = Image.open(depth_path).convert("RGB")

            t0 = time.time()
            result = renderer.render(
                init_image=init_image,
                depth_image=depth_image,
                params=SdxlSoftLockRenderParams(
                    prompt=prompt,
                    negative_prompt=negative,
                    strength=strength,
                    guidance_scale=guidance,
                    num_inference_steps=steps,
                    depth_conditioning_scale=depth_cn_scale,
                    seed=seed,
                ),
                width=width,
                height=height,
            )
            elapsed = time.time() - t0
            out_path = sweep_dir / f"h2_{tod.lower()}_{view}_seed{seed}.png"
            result.save(out_path)
            print(f"[h2] {tod} view={view} elapsed={elapsed:.1f}s")
            results.append({
                "timeOfDay": tod,
                "view": view,
                "seed": seed,
                "outputPath": str(out_path),
                "elapsedSeconds": round(elapsed, 2),
            })
    return results


def _write_h2_winner_day_night_sheet(
    output_root: Path,
    outputs: list[dict[str, Any]],
) -> None:
    pick: dict[tuple[str, str], Path] = {}
    for o in outputs:
        key = (str(o["timeOfDay"]), str(o["view"]))
        if key not in pick:
            pick[key] = Path(str(o["outputPath"]))
    if not pick:
        return
    sample = Image.open(next(iter(pick.values()))).convert("RGB")
    w, h = sample.size
    header = 30
    rows_layout = []
    for tod in ("DAY", "NIGHT"):
        for view in VIEWS:
            rows_layout.append((tod, view, pick.get((tod, view))))
    canvas = Image.new("RGB", (2 * w, 2 * (h + header)), (248, 248, 248))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for idx, (tod, view, path) in enumerate(rows_layout):
        row, col = idx // 2, idx % 2
        x, y = col * w, row * (h + header)
        draw.text((x + 8, y + 8), f"{tod} {view}", fill=(20, 20, 20), font=font)
        if path and path.exists():
            canvas.paste(Image.open(path).convert("RGB"), (x, y + header))
    out = output_root / "h2_winner_day_night_sheet.png"
    canvas.save(out, format="PNG")
    print(f"[h2] winner DAY/NIGHT sheet -> {out}")


def _write_h2_vs_h1_vs_g4_sheet(
    *,
    output_root: Path,
    h2_outputs: list[dict[str, Any]],
    h1_dir: Path,
    g4_dir: Path,
) -> None:
    """3-column compare (G-4 vs H-1.b vs H-2) per DAY view."""
    day_outputs = [o for o in h2_outputs if o["timeOfDay"] == "DAY"]
    if not day_outputs:
        return
    seed = day_outputs[0]["seed"]
    rows = []
    for view in VIEWS:
        g4_path = (
            g4_dir / "final_day"
            / f"diffusion_soft_lock_final_s055_day_{view}.png"
        )
        h1_path = h1_dir / "sweep_day" / f"h1_day_{view}_seed42.png"
        h2_path = next(
            (
                Path(o["outputPath"])
                for o in day_outputs
                if o["view"] == view and o["seed"] == seed
            ),
            None,
        )
        rows.append((view, g4_path, h1_path, h2_path))

    column_labels = [
        "G-4 winner (SD1.5 + CN1.0, 512x320)",
        "H-1.b hot (SD1.5 + CN1.1, 768x448)",
        "H-2 (SDXL Juggernaut-XL, 1024x640)",
    ]
    cell_w = 480
    cell_h = 300
    header_h = 36
    row_label_w = 200
    cols = 3
    canvas_w = row_label_w + cols * cell_w
    canvas_h = header_h + len(rows) * cell_h
    canvas = Image.new("RGB", (canvas_w, canvas_h), (245, 245, 245))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for ci, label in enumerate(column_labels):
        draw.text((row_label_w + ci * cell_w + 8, 10), label, fill=(20, 20, 20), font=font)
    for ri, (view, *paths) in enumerate(rows):
        y = header_h + ri * cell_h
        draw.text((8, y + cell_h // 2 - 6), view, fill=(20, 20, 20), font=font)
        for ci, image_path in enumerate(paths):
            x = row_label_w + ci * cell_w
            if image_path and image_path.exists():
                image = Image.open(image_path).convert("RGB")
                fitted = _fit(image, cell_w - 4, cell_h - 4)
                px = x + (cell_w - fitted.size[0]) // 2
                py = y + (cell_h - fitted.size[1]) // 2
                canvas.paste(fitted, (px, py))
            else:
                draw.rectangle(
                    [(x + 2, y + 2), (x + cell_w - 2, y + cell_h - 2)],
                    outline=(180, 60, 60),
                )
                draw.text(
                    (x + 8, y + cell_h // 2 - 6),
                    "missing", fill=(180, 60, 60), font=font,
                )
    out = output_root / "h2_vs_h1_vs_g4_contact_sheet.png"
    canvas.save(out, format="PNG")
    print(f"[h2] 3-way comparison sheet -> {out}")


def _fit(image: Image.Image, max_w: int, max_h: int) -> Image.Image:
    w, h = image.size
    scale = min(max_w / w, max_h / h)
    new_size = (max(int(w * scale), 1), max(int(h * scale), 1))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def _write_h2_manifest(
    output_root: Path,
    args: argparse.Namespace,
    h2_outputs: list[dict[str, Any]],
) -> None:
    payload = {
        "schemaVersion": "ifc2img.h2SdxlSoftLock.v1",
        "phase": "H-2",
        "modelId": args.model_id,
        "depthControlNetId": "diffusers/controlnet-depth-sdxl-1.0",
        "vaeId": "madebyollin/sdxl-vae-fp16-fix",
        "renderSize": [args.width, args.height],
        "strength": args.strength,
        "depthConditioningScale": args.depth_cn_scale,
        "guidanceScale": args.guidance_scale,
        "steps": args.steps,
        "seed": args.seed,
        "timeOfDay": args.time_of_day,
        "cpuOffload": args.cpu_offload,
        "lightningSteps": args.lightning_steps,
        "preset": PRESET,
        "views": list(VIEWS),
        "outputs": h2_outputs,
    }
    out = output_root / "h2_manifest.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[h2] manifest -> {out}")


if __name__ == "__main__":
    main()
