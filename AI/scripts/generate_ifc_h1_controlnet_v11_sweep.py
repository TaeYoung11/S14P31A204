"""Phase H-1 (H-1.b hot winner). ControlNet 1.1 + native res + photoreal-tuned strength.

Steps:
1. Run run_ifc2img_photo_pipeline on shinchan.ifc to regenerate the IFC debug
   artifacts for DAY and NIGHT (depth control, element masks, color composite).
2. Build the F-2 IFC-locked baseline pair from the generated debug manifests.
3. Run the soft-lock diffusion pipeline with H-1.b hot winner settings:
   - second ControlNet = lllyasviel/control_v11p_sd15_canny (CN 1.1)
   - native resolution 768x448
   - Realistic Vision V6 photoreal checkpoint
   - strength 0.68, depth_cn 0.5, canny_cn 0.4, steps 30
   - default single seed 42 (override with --seeds for sweep)
4. Run both DAY and NIGHT by default (override with --time-of-day).
5. Write per-time contact sheets plus G-4 vs H-1.b comparison sheet.

The earlier H-1 baseline (strength 0.55, depth_cn 0.7, canny_cn 0.9, steps 25)
was illustration-like; H-1.b hot is the actual winner.
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
DEFAULT_OUTPUT_ROOT = ROOT / "outputs/ifc_geometry_h1_cn11_sweep"
DEFAULT_G4_DIR = ROOT / "outputs/ifc_geometry_g4_soft_lock_diffusion_realvision"
DEFAULT_REALVISION_MODEL = "SG161222/Realistic_Vision_V6.0_B1_noVAE"
DEFAULT_SEEDS: tuple[int, ...] = (42,)
RENDER_SIZE = (768, 448)
STRENGTH = 0.68
DEPTH_CN_SCALE = 0.5
CANNY_CN_SCALE = 0.4
GUIDANCE = 7.5
STEPS = 30
PRESET = "ifc_minimal"
VIEWS = ("front_diagonal_left", "front_diagonal_right")
TIME_OF_DAY_CHOICES = ("DAY", "NIGHT", "both")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Phase H-1 (H-1.b hot winner).")
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--g4-dir", type=Path, default=DEFAULT_G4_DIR)
    parser.add_argument("--model-id", default=DEFAULT_REALVISION_MODEL)
    parser.add_argument(
        "--time-of-day", choices=TIME_OF_DAY_CHOICES, default="both",
        help="Render DAY only, NIGHT only, or both (default).",
    )
    parser.add_argument(
        "--seeds", type=int, nargs="+", default=list(DEFAULT_SEEDS),
        help="Seeds to render per (view, time). Default single seed 42.",
    )
    parser.add_argument("--strength", type=float, default=STRENGTH)
    parser.add_argument("--depth-cn-scale", type=float, default=DEPTH_CN_SCALE)
    parser.add_argument("--canny-cn-scale", type=float, default=CANNY_CN_SCALE)
    parser.add_argument("--steps", type=int, default=STEPS)
    parser.add_argument("--guidance-scale", type=float, default=GUIDANCE)
    parser.add_argument("--skip-regen", action="store_true",
                        help="Reuse existing source/f2 artifacts if present.")
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
    for time_of_day in times:
        source_dir = output_root / f"ifc_source_{time_of_day.lower()}"
        if not args.skip_regen or not (source_dir / "debug" / "debug_manifest.json").exists():
            print(f"[h1] regenerating IFC source debug for {time_of_day}")
            _regen_ifc_source(args.ifc.resolve(), source_dir, time_of_day)
        else:
            print(f"[h1] reusing existing IFC source at {source_dir}")
        source_dirs[time_of_day] = source_dir

    # F-2 expects a DAY/NIGHT pair; build from whichever sources we have.
    fallback_source = next(iter(source_dirs.values()))
    day_debug = (
        source_dirs.get("DAY", fallback_source) / "debug" / "debug_manifest.json"
    )
    night_debug = (
        source_dirs.get("NIGHT", fallback_source) / "debug" / "debug_manifest.json"
    )
    if not args.skip_regen or not (f2_dir / "f2_ifc_locked_baseline_manifest.json").exists():
        print("[h1] regenerating F-2 IFC-locked baseline")
        _regen_f2(day_debug.resolve(), night_debug.resolve(), f2_dir)
    else:
        print(f"[h1] reusing existing F-2 at {f2_dir}")

    all_outputs: list[dict[str, Any]] = []
    for time_of_day in times:
        sweep_dir = output_root / f"sweep_{time_of_day.lower()}"
        sweep_dir.mkdir(parents=True, exist_ok=True)
        time_outputs = _run_h1_sweep(
            source_dir=source_dirs[time_of_day],
            f2_dir=f2_dir,
            sweep_dir=sweep_dir,
            model_id=args.model_id,
            time_of_day=time_of_day,
            seeds=tuple(args.seeds),
            strength=args.strength,
            depth_cn_scale=args.depth_cn_scale,
            canny_cn_scale=args.canny_cn_scale,
            steps=args.steps,
            guidance=args.guidance_scale,
        )
        _write_h1_seed_contact_sheet(sweep_dir, time_outputs, time_of_day)
        all_outputs.extend(time_outputs)

    _write_h1_vs_g4_contact_sheet(
        output_root=output_root,
        h1_outputs=all_outputs,
        g4_dir=args.g4_dir.resolve(),
    )
    _write_h1_winner_day_night_sheet(output_root, all_outputs)
    _write_h1_manifest(output_root, args, all_outputs)
    print(f"[h1] done. outputs at {output_root}")


def _regen_ifc_source(ifc_path: Path, source_dir: Path, time_of_day: str) -> None:
    if source_dir.exists():
        shutil.rmtree(source_dir)
    source_dir.mkdir(parents=True, exist_ok=True)
    from ai_rendering.ifc2img.service import run_ifc2img_photo_pipeline

    started = time.time()
    run_ifc2img_photo_pipeline(
        ifc_path=ifc_path,
        output_dir=source_dir,
        preset=PRESET,
        time_of_day=time_of_day,
        debug_artifacts=True,
    )
    print(f"[h1] IFC source regen {time_of_day} {time.time() - started:.1f}s")


def _regen_f2(day_debug_manifest: Path, night_debug_manifest: Path, f2_dir: Path) -> None:
    if f2_dir.exists():
        shutil.rmtree(f2_dir)
    f2_dir.mkdir(parents=True, exist_ok=True)
    generate_ifc_locked_baseline_f2(
        day_debug_manifest_path=day_debug_manifest,
        night_debug_manifest_path=night_debug_manifest,
        output_dir=f2_dir.resolve(),
    )


def _run_h1_sweep(
    *,
    source_dir: Path,
    f2_dir: Path,
    sweep_dir: Path,
    model_id: str,
    time_of_day: str,
    seeds: tuple[int, ...],
    strength: float,
    depth_cn_scale: float,
    canny_cn_scale: float,
    steps: int,
    guidance: float,
) -> list[dict[str, Any]]:
    from ai_rendering.ifc2img.soft_lock import (
        CONTROLNET_V11_CANNY_ID,
        DEFAULT_CONTROLNET_DEPTH_ID,
        SoftLockDiffusionRenderer,
        SoftLockRenderParams,
        build_canny_control_from_no_background,
        build_region_aware_negative_prompt,
        build_region_aware_prompt,
        visible_categories_from_element_masks,
    )

    debug_manifest = json.loads(
        (source_dir / "debug" / "debug_manifest.json").read_text(encoding="utf-8")
    )
    source_root = source_dir
    f2_time_dir = f2_dir / f"ifc_locked_baseline_{time_of_day.lower()}"

    started = time.time()
    renderer = SoftLockDiffusionRenderer(
        model_id=model_id,
        depth_controlnet_id=DEFAULT_CONTROLNET_DEPTH_ID,
        seg_controlnet_id=CONTROLNET_V11_CANNY_ID,
    )
    print(f"[h1] renderer load {time.time() - started:.1f}s "
          f"(model={model_id}, second_cn={CONTROLNET_V11_CANNY_ID})")

    results: list[dict[str, Any]] = []
    for view_payload in debug_manifest.get("views", []):
        view = str(view_payload["view"])
        if view not in VIEWS:
            continue
        files = view_payload.get("files", {})
        depth_path = source_root / str(files["depthControlImage"])
        masks = {
            key: source_root / str(value)
            for key, value in files.get("elementMasks", {}).items()
            if isinstance(value, str)
        }
        init_path = f2_time_dir / f"baseline_with_background_{view}.png"
        no_bg_path = f2_time_dir / f"baseline_no_background_{view}.png"

        visible = visible_categories_from_element_masks(masks)
        prompt = build_region_aware_prompt(
            visible_categories=visible, time_of_day=time_of_day
        )
        negative = build_region_aware_negative_prompt(time_of_day=time_of_day)

        init_image = Image.open(init_path).convert("RGB")
        depth_image = Image.open(depth_path).convert("RGB")
        canny_image = build_canny_control_from_no_background(no_bg_path)

        for seed in seeds:
            t0 = time.time()
            result = renderer.render(
                init_image=init_image,
                depth_image=depth_image,
                seg_image=canny_image,
                params=SoftLockRenderParams(
                    prompt=prompt,
                    negative_prompt=negative,
                    strength=strength,
                    guidance_scale=guidance,
                    num_inference_steps=steps,
                    depth_conditioning_scale=depth_cn_scale,
                    seg_conditioning_scale=canny_cn_scale,
                    seed=seed,
                ),
                width=RENDER_SIZE[0],
                height=RENDER_SIZE[1],
            )
            elapsed = time.time() - t0
            out_path = sweep_dir / f"h1_{time_of_day.lower()}_{view}_seed{seed}.png"
            result.save(out_path)
            print(f"[h1] {time_of_day} view={view} seed={seed} elapsed={elapsed:.1f}s")
            results.append({
                "timeOfDay": time_of_day,
                "view": view,
                "seed": seed,
                "outputPath": str(out_path),
                "elapsedSeconds": round(elapsed, 2),
            })
    return results


def _write_h1_seed_contact_sheet(
    sweep_dir: Path,
    outputs: list[dict[str, Any]],
    time_of_day: str,
) -> None:
    if not outputs:
        return
    sample = Image.open(outputs[0]["outputPath"]).convert("RGB")
    w, h = sample.size
    header = 30
    by_view: dict[str, list[dict[str, Any]]] = {}
    for o in outputs:
        by_view.setdefault(str(o["view"]), []).append(o)
    rows = len(by_view)
    cols = max(len(v) for v in by_view.values())
    canvas = Image.new("RGB", (cols * w, rows * (h + header)), (248, 248, 248))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for row_idx, (view, items) in enumerate(sorted(by_view.items())):
        for col_idx, item in enumerate(items):
            x = col_idx * w
            y = row_idx * (h + header)
            label = f"{time_of_day} {view}  seed={item['seed']}"
            draw.text((x + 8, y + 8), label, fill=(20, 20, 20), font=font)
            canvas.paste(
                Image.open(item["outputPath"]).convert("RGB"),
                (x, y + header),
            )
    out = sweep_dir / f"h1_seed_contact_sheet_{time_of_day.lower()}.png"
    canvas.save(out, format="PNG")
    print(f"[h1] seed contact sheet ({time_of_day}) -> {out}")


def _write_h1_winner_day_night_sheet(
    output_root: Path,
    outputs: list[dict[str, Any]],
) -> None:
    """2x2 sheet of first-seed DAY/NIGHT x left/right for quick visual check."""
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
    rows = 2
    cols = 2
    canvas = Image.new("RGB", (cols * w, rows * (h + header)), (248, 248, 248))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for idx, (tod, view, path) in enumerate(rows_layout):
        row, col = idx // 2, idx % 2
        x, y = col * w, row * (h + header)
        draw.text((x + 8, y + 8), f"{tod} {view}", fill=(20, 20, 20), font=font)
        if path and path.exists():
            canvas.paste(Image.open(path).convert("RGB"), (x, y + header))
    out = output_root / "h1_winner_day_night_sheet.png"
    canvas.save(out, format="PNG")
    print(f"[h1] winner DAY/NIGHT sheet -> {out}")


def _write_h1_vs_g4_contact_sheet(
    *,
    output_root: Path,
    h1_outputs: list[dict[str, Any]],
    g4_dir: Path,
) -> None:
    """Compare DAY G-4 winner vs DAY H-1.b hot winner (first seed) side by side."""
    day_outputs = [o for o in h1_outputs if o["timeOfDay"] == "DAY"]
    if not day_outputs:
        return
    first_seed = day_outputs[0]["seed"]
    rows = []
    for view in VIEWS:
        g4_path = (
            g4_dir
            / "final_day"
            / f"diffusion_soft_lock_final_s055_day_{view}.png"
        )
        h1_path = next(
            (
                Path(o["outputPath"])
                for o in day_outputs
                if o["view"] == view and o["seed"] == first_seed
            ),
            None,
        )
        rows.append((view, g4_path, h1_path))

    column_labels = [
        "G-4 winner (CN 1.0, 512x320, s=0.55)",
        f"H-1.b hot (CN 1.1, {RENDER_SIZE[0]}x{RENDER_SIZE[1]}, s={STRENGTH}, seed={first_seed})",
    ]
    cell_w = 480
    cell_h = 280
    header_h = 36
    row_label_w = 200
    cols = 2
    canvas_w = row_label_w + cols * cell_w
    canvas_h = header_h + len(rows) * cell_h
    canvas = Image.new("RGB", (canvas_w, canvas_h), (245, 245, 245))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for ci, label in enumerate(column_labels):
        draw.text((row_label_w + ci * cell_w + 8, 10), label, fill=(20, 20, 20), font=font)
    for ri, (view, g4_path, h1_path) in enumerate(rows):
        y = header_h + ri * cell_h
        draw.text((8, y + cell_h // 2 - 6), view, fill=(20, 20, 20), font=font)
        for ci, image_path in enumerate([g4_path, h1_path]):
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
    out = output_root / "h1_vs_g4_contact_sheet.png"
    canvas.save(out, format="PNG")
    print(f"[h1] vs G-4 contact sheet -> {out}")


def _fit(image: Image.Image, max_w: int, max_h: int) -> Image.Image:
    w, h = image.size
    scale = min(max_w / w, max_h / h)
    new_size = (max(int(w * scale), 1), max(int(h * scale), 1))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def _write_h1_manifest(
    output_root: Path,
    args: argparse.Namespace,
    h1_outputs: list[dict[str, Any]],
) -> None:
    payload = {
        "schemaVersion": "ifc2img.h1ControlnetV11Sweep.v2",
        "phase": "H-1.b hot winner",
        "modelId": args.model_id,
        "secondControlNetId": "lllyasviel/control_v11p_sd15_canny",
        "depthControlNetId": "lllyasviel/sd-controlnet-depth",
        "renderSize": list(RENDER_SIZE),
        "strength": args.strength,
        "depthConditioningScale": args.depth_cn_scale,
        "cannyConditioningScale": args.canny_cn_scale,
        "guidanceScale": args.guidance_scale,
        "steps": args.steps,
        "seeds": list(args.seeds),
        "timeOfDay": args.time_of_day,
        "preset": PRESET,
        "views": list(VIEWS),
        "outputs": h1_outputs,
    }
    out = output_root / "h1_manifest.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[h1] manifest -> {out}")


if __name__ == "__main__":
    main()
