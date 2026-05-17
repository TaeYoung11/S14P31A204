"""Phase H-1. ControlNet 1.1 + native-resolution + seed sweep over G-4 winner.

Steps:
1. Run run_ifc2img_photo_pipeline on shinchan.ifc to regenerate the IFC debug
   artifacts (depth control, element masks, color composite).
2. Build the F-2 IFC-locked baseline (no_background + with_background) from
   the generated debug manifest.
3. Run the soft-lock diffusion pipeline with:
   - second ControlNet = lllyasviel/control_v11p_sd15_canny (CN 1.1)
   - native resolution 768x448
   - Realistic Vision V6 photoreal checkpoint
   - seed sweep [42, 7, 123]
4. Write a per-seed contact sheet plus a G-4 vs H-1 comparison sheet.
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
SWEEP_SEEDS = (42, 7, 123)
RENDER_SIZE = (768, 448)
STRENGTH = 0.55
DEPTH_CN_SCALE = 0.7
CANNY_CN_SCALE = 0.9
GUIDANCE = 7.5
STEPS = 25
PRESET = "ifc_minimal"
VIEWS = ("front_diagonal_left", "front_diagonal_right")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Phase H-1 sweep.")
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--g4-dir", type=Path, default=DEFAULT_G4_DIR)
    parser.add_argument("--model-id", default=DEFAULT_REALVISION_MODEL)
    parser.add_argument("--skip-regen", action="store_true",
                        help="Reuse existing source/f2 artifacts if present.")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    output_root: Path = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    source_dir = output_root / "ifc_source_day"
    f2_dir = output_root / "f2"
    sweep_dir = output_root / "sweep_day"
    sweep_dir.mkdir(parents=True, exist_ok=True)

    if not args.skip_regen or not (source_dir / "debug" / "debug_manifest.json").exists():
        print("[h1] regenerating IFC source debug for DAY")
        _regen_ifc_source(args.ifc.resolve(), source_dir)
    else:
        print(f"[h1] reusing existing IFC source at {source_dir}")

    if not args.skip_regen or not (f2_dir / "f2_ifc_locked_baseline_manifest.json").exists():
        print("[h1] regenerating F-2 IFC-locked baseline DAY")
        _regen_f2(source_dir, f2_dir)
    else:
        print(f"[h1] reusing existing F-2 at {f2_dir}")

    h1_outputs = _run_h1_sweep(
        source_dir=source_dir,
        f2_dir=f2_dir,
        sweep_dir=sweep_dir,
        model_id=args.model_id,
    )

    _write_h1_seed_contact_sheet(sweep_dir, h1_outputs)
    _write_h1_vs_g4_contact_sheet(
        output_root=output_root,
        h1_outputs=h1_outputs,
        g4_dir=args.g4_dir.resolve(),
    )
    _write_h1_manifest(output_root, args, h1_outputs)
    print(f"[h1] done. outputs at {output_root}")


def _regen_ifc_source(ifc_path: Path, source_dir: Path) -> None:
    if source_dir.exists():
        shutil.rmtree(source_dir)
    source_dir.mkdir(parents=True, exist_ok=True)
    from ai_rendering.ifc2img.service import run_ifc2img_photo_pipeline

    started = time.time()
    run_ifc2img_photo_pipeline(
        ifc_path=ifc_path,
        output_dir=source_dir,
        preset=PRESET,
        time_of_day="DAY",
        debug_artifacts=True,
    )
    print(f"[h1] IFC source regen {time.time() - started:.1f}s")


def _regen_f2(source_dir: Path, f2_dir: Path) -> None:
    if f2_dir.exists():
        shutil.rmtree(f2_dir)
    f2_dir.mkdir(parents=True, exist_ok=True)
    day_debug_manifest = source_dir / "debug" / "debug_manifest.json"
    # F-2 expects DAY+NIGHT pair; reuse the DAY manifest for both so the F-2
    # NIGHT case is structurally present even though H-1 only renders DAY.
    generate_ifc_locked_baseline_f2(
        day_debug_manifest_path=day_debug_manifest.resolve(),
        night_debug_manifest_path=day_debug_manifest.resolve(),
        output_dir=f2_dir.resolve(),
    )


def _run_h1_sweep(
    *,
    source_dir: Path,
    f2_dir: Path,
    sweep_dir: Path,
    model_id: str,
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
    f2_day_dir = f2_dir / "ifc_locked_baseline_day"

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
        init_path = f2_day_dir / f"baseline_with_background_{view}.png"
        no_bg_path = f2_day_dir / f"baseline_no_background_{view}.png"

        visible = visible_categories_from_element_masks(masks)
        prompt = build_region_aware_prompt(
            visible_categories=visible, time_of_day="DAY"
        )
        negative = build_region_aware_negative_prompt(time_of_day="DAY")

        init_image = Image.open(init_path).convert("RGB")
        depth_image = Image.open(depth_path).convert("RGB")
        canny_image = build_canny_control_from_no_background(no_bg_path)

        for seed in SWEEP_SEEDS:
            t0 = time.time()
            result = renderer.render(
                init_image=init_image,
                depth_image=depth_image,
                seg_image=canny_image,
                params=SoftLockRenderParams(
                    prompt=prompt,
                    negative_prompt=negative,
                    strength=STRENGTH,
                    guidance_scale=GUIDANCE,
                    num_inference_steps=STEPS,
                    depth_conditioning_scale=DEPTH_CN_SCALE,
                    seg_conditioning_scale=CANNY_CN_SCALE,
                    seed=seed,
                ),
                width=RENDER_SIZE[0],
                height=RENDER_SIZE[1],
            )
            elapsed = time.time() - t0
            out_path = sweep_dir / f"h1_day_{view}_seed{seed}.png"
            result.save(out_path)
            print(f"[h1] view={view} seed={seed} elapsed={elapsed:.1f}s")
            results.append({
                "view": view,
                "seed": seed,
                "outputPath": str(out_path),
                "elapsedSeconds": round(elapsed, 2),
            })
    return results


def _write_h1_seed_contact_sheet(sweep_dir: Path, outputs: list[dict[str, Any]]) -> None:
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
            label = f"{view}  seed={item['seed']}"
            draw.text((x + 8, y + 8), label, fill=(20, 20, 20), font=font)
            canvas.paste(
                Image.open(item["outputPath"]).convert("RGB"),
                (x, y + header),
            )
    out = sweep_dir / "h1_seed_contact_sheet.png"
    canvas.save(out, format="PNG")
    print(f"[h1] seed contact sheet -> {out}")


def _write_h1_vs_g4_contact_sheet(
    *,
    output_root: Path,
    h1_outputs: list[dict[str, Any]],
    g4_dir: Path,
) -> None:
    if not h1_outputs:
        return
    rows = []
    for view in VIEWS:
        g4_path = (
            g4_dir
            / "final_day"
            / f"diffusion_soft_lock_final_s055_day_{view}.png"
        )
        # H-1: pick the first seed result for direct comparison (seed=42).
        h1_path = next(
            (
                Path(o["outputPath"])
                for o in h1_outputs
                if o["view"] == view and o["seed"] == SWEEP_SEEDS[0]
            ),
            None,
        )
        rows.append((view, g4_path, h1_path))

    column_labels = [
        f"G-4 winner (CN 1.0, 512x320, seed=42)",
        f"H-1 (CN 1.1, {RENDER_SIZE[0]}x{RENDER_SIZE[1]}, seed={SWEEP_SEEDS[0]})",
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
        "schemaVersion": "ifc2img.h1ControlnetV11Sweep.v1",
        "phase": "H-1",
        "modelId": args.model_id,
        "secondControlNetId": "lllyasviel/control_v11p_sd15_canny",
        "depthControlNetId": "lllyasviel/sd-controlnet-depth",
        "renderSize": list(RENDER_SIZE),
        "strength": STRENGTH,
        "depthConditioningScale": DEPTH_CN_SCALE,
        "cannyConditioningScale": CANNY_CN_SCALE,
        "guidanceScale": GUIDANCE,
        "steps": STEPS,
        "seedSweep": list(SWEEP_SEEDS),
        "preset": PRESET,
        "views": list(VIEWS),
        "outputs": h1_outputs,
    }
    out = output_root / "h1_manifest.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[h1] manifest -> {out}")


if __name__ == "__main__":
    main()
