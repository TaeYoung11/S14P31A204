"""End-to-end shinchan.ifc production pipeline.

One command runs the full Phase H pipeline:
1. Regenerate IFC source debug artifacts for DAY and NIGHT (run_ifc2img_photo_pipeline)
2. Build F-2 IFC-locked baseline pair
3. Run H-1.b hot diffusion (SD 1.5 + Realistic Vision V6 + ControlNet 1.1 canny)
   - DAY  seed 42  (default photoreal winner)
   - NIGHT seed 555 (no background-building hallucination)
   - Each output passes through evaluate_ifc_geometry_fidelity_gate; below-threshold
     views fall back to the F-2 IFC-locked baseline before persistence.
4. Run H-3 Real-ESRGAN x4 upscale on the 4 photoreal outputs (accepted or fallback)
5. Write a final 2x2 DAY/NIGHT contact sheet and manifest

Output root default: AI/outputs/ifc_production_shinchan/
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_ifc_locked_baseline_f2 import generate_ifc_locked_baseline_f2  # noqa: E402

DEFAULT_IFC = ROOT / "packages/ai-rendering/tests/fixtures/ifc/shinchan.ifc"
DEFAULT_OUTPUT_ROOT = ROOT / "outputs/ifc_production_shinchan"
DEFAULT_REALVISION_MODEL = "SG161222/Realistic_Vision_V6.0_B1_noVAE"

H1_RENDER_SIZE = (768, 448)
H1_GUIDANCE = 7.5
H1_STEPS = 30
# DAY: H-1.b hot winner (photoreal, no extra hallucination at 0.68)
H1_DAY_STRENGTH = 0.68
H1_DAY_DEPTH_CN = 0.5
H1_DAY_CANNY_CN = 0.4
H1_DAY_SEED = 42
# NIGHT: sweet spot — slightly higher strength than DAY-tight to keep photoreal
# texture while still discouraging the small IFC rooftop protrusion from being
# amplified into a fake background building. Verified seed 33 photoreal both views.
H1_NIGHT_STRENGTH = 0.65
H1_NIGHT_DEPTH_CN = 0.5
H1_NIGHT_CANNY_CN = 0.55
H1_NIGHT_SEED = 33

PRESET = "ifc_minimal"
VIEWS = ("front_diagonal_left", "front_diagonal_right")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="End-to-end shinchan production pipeline (H-1.b hot + H-3)."
    )
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--model-id", default=DEFAULT_REALVISION_MODEL)
    parser.add_argument("--day-seed", type=int, default=H1_DAY_SEED)
    parser.add_argument("--night-seed", type=int, default=H1_NIGHT_SEED)
    parser.add_argument(
        "--skip-regen", action="store_true",
        help="Reuse existing IFC source/F-2 artifacts when present.",
    )
    parser.add_argument(
        "--skip-upscale", action="store_true",
        help="Skip H-3 upscale (keep H-1.b 768x448 only).",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    output_root: Path = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    overall_started = time.time()
    timings: dict[str, float] = {}

    # Step 1+2: IFC regen + F-2
    source_dirs, t = _step_regen_sources(args.ifc.resolve(), output_root, args.skip_regen)
    timings["ifc_regen"] = t
    f2_dir, t = _step_build_f2(source_dirs, output_root, args.skip_regen)
    timings["f2_baseline"] = t

    # Step 3: H-1.b hot diffusion + fidelity gate
    h1_outputs, t, gate_log = _step_h1_diffusion(
        source_dirs=source_dirs,
        f2_dir=f2_dir,
        output_root=output_root,
        model_id=args.model_id,
        day_seed=args.day_seed,
        night_seed=args.night_seed,
    )
    timings["h1_diffusion"] = t

    # Step 4: H-3 upscale (optional)
    h3_outputs: dict[tuple[str, str], Path] = {}
    if not args.skip_upscale:
        h3_outputs, t = _step_h3_upscale(h1_outputs, output_root)
        timings["h3_upscale"] = t

    # Step 5: final sheet + manifest
    _write_final_sheet(output_root, h1_outputs, h3_outputs)
    _write_manifest(
        output_root=output_root,
        args=args,
        timings=timings,
        h1_outputs=h1_outputs,
        h3_outputs=h3_outputs,
        gate_log=gate_log,
        total_elapsed=time.time() - overall_started,
    )

    print(f"[prod] done. outputs at {output_root}")
    print(f"[prod] total elapsed {time.time() - overall_started:.1f}s")


def _step_regen_sources(
    ifc_path: Path,
    output_root: Path,
    skip_regen: bool,
) -> tuple[dict[str, Path], float]:
    t0 = time.time()
    from ai_rendering.ifc2img.service import run_ifc2img_photo_pipeline

    source_dirs: dict[str, Path] = {}
    for tod in ("DAY", "NIGHT"):
        source_dir = output_root / f"ifc_source_{tod.lower()}"
        if (
            skip_regen
            and (source_dir / "debug" / "debug_manifest.json").exists()
        ):
            print(f"[prod] reuse source {tod}: {source_dir}")
        else:
            if source_dir.exists():
                shutil.rmtree(source_dir)
            source_dir.mkdir(parents=True, exist_ok=True)
            t1 = time.time()
            print(f"[prod] regen IFC source {tod} -> {source_dir}")
            run_ifc2img_photo_pipeline(
                ifc_path=ifc_path,
                output_dir=source_dir,
                preset=PRESET,
                time_of_day=tod,
                debug_artifacts=True,
            )
            print(f"[prod] {tod} source regen {time.time() - t1:.1f}s")
        source_dirs[tod] = source_dir
    return source_dirs, time.time() - t0


def _step_build_f2(
    source_dirs: dict[str, Path],
    output_root: Path,
    skip_regen: bool,
) -> tuple[Path, float]:
    t0 = time.time()
    f2_dir = output_root / "f2"
    f2_manifest = f2_dir / "f2_ifc_locked_baseline_manifest.json"
    if skip_regen and f2_manifest.exists():
        print(f"[prod] reuse F-2: {f2_dir}")
        return f2_dir, time.time() - t0

    if f2_dir.exists():
        shutil.rmtree(f2_dir)
    f2_dir.mkdir(parents=True, exist_ok=True)
    print("[prod] build F-2 IFC-locked baseline")
    day_debug = source_dirs["DAY"] / "debug" / "debug_manifest.json"
    night_debug = source_dirs["NIGHT"] / "debug" / "debug_manifest.json"
    generate_ifc_locked_baseline_f2(
        day_debug_manifest_path=day_debug.resolve(),
        night_debug_manifest_path=night_debug.resolve(),
        output_dir=f2_dir.resolve(),
    )
    return f2_dir, time.time() - t0


_CATEGORY_KEY_TO_SEMANTIC: dict[str, str] = {
    "floor": "FLOOR",
    "roof": "ROOF",
    "wall": "WALL",
    "window": "WINDOW",
    "door": "DOOR",
}


def _step_h1_diffusion(
    *,
    source_dirs: dict[str, Path],
    f2_dir: Path,
    output_root: Path,
    model_id: str,
    day_seed: int,
    night_seed: int,
) -> tuple[dict[tuple[str, str], Path], float, dict[tuple[str, str], dict]]:
    t0 = time.time()
    from ai_rendering.ifc2img.element_masks import (
        IfcElementMaskRenderResult,
        evaluate_ifc_geometry_fidelity_gate,
        measure_ifc_geometry_fidelity,
    )
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

    print(
        f"[prod] load H-1.b hot renderer (model={model_id}, cn=depth+v11_canny)"
    )
    t_load = time.time()
    renderer = SoftLockDiffusionRenderer(
        model_id=model_id,
        depth_controlnet_id=DEFAULT_CONTROLNET_DEPTH_ID,
        seg_controlnet_id=CONTROLNET_V11_CANNY_ID,
    )
    print(f"[prod] renderer load {time.time() - t_load:.1f}s")

    h1_dir = output_root / "h1_photoreal"
    h1_dir.mkdir(parents=True, exist_ok=True)
    results: dict[tuple[str, str], Path] = {}
    gate_log: dict[tuple[str, str], dict] = {}

    tod_params = {
        "DAY": (day_seed, H1_DAY_STRENGTH, H1_DAY_DEPTH_CN, H1_DAY_CANNY_CN),
        "NIGHT": (night_seed, H1_NIGHT_STRENGTH, H1_NIGHT_DEPTH_CN, H1_NIGHT_CANNY_CN),
    }
    for tod, (seed, strength, depth_cn, canny_cn) in tod_params.items():
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
            no_bg_path = f2_time_dir / f"baseline_no_background_{view}.png"

            visible = visible_categories_from_element_masks(masks)
            prompt = build_region_aware_prompt(
                visible_categories=visible, time_of_day=tod
            )
            negative = build_region_aware_negative_prompt(time_of_day=tod)
            init_image = Image.open(init_path).convert("RGB")
            depth_image = Image.open(depth_path).convert("RGB")
            canny_image = build_canny_control_from_no_background(no_bg_path)

            t1 = time.time()
            result = renderer.render(
                init_image=init_image,
                depth_image=depth_image,
                seg_image=canny_image,
                params=SoftLockRenderParams(
                    prompt=prompt,
                    negative_prompt=negative,
                    strength=strength,
                    guidance_scale=H1_GUIDANCE,
                    num_inference_steps=H1_STEPS,
                    depth_conditioning_scale=depth_cn,
                    seg_conditioning_scale=canny_cn,
                    seed=seed,
                ),
                width=H1_RENDER_SIZE[0],
                height=H1_RENDER_SIZE[1],
            )
            out_path = h1_dir / f"prod_{tod.lower()}_{view}.png"
            mask_images = {
                _CATEGORY_KEY_TO_SEMANTIC[key]: Image.open(path).convert("L")
                for key, path in masks.items()
                if key in _CATEGORY_KEY_TO_SEMANTIC
            }
            mask_set = IfcElementMaskRenderResult(
                masks=mask_images,
                composite=Image.new("RGB", result.image.size, (0, 0, 0)),
            )
            fidelity_report = measure_ifc_geometry_fidelity(result.image, mask_set)
            decision = evaluate_ifc_geometry_fidelity_gate(fidelity_report)
            entry: dict[str, object] = {
                "decision": decision.to_dict(),
                "fidelity": fidelity_report.to_dict(),
                "fallbackUsed": False,
            }
            if decision.accepted:
                result.save(out_path)
                print(
                    f"[prod] H-1.b {tod} {view} seed={seed} "
                    f"strength={strength} cn(d/c)={depth_cn}/{canny_cn} "
                    f"{time.time() - t1:.1f}s -> {out_path} "
                    f"[gate:pass iou={decision.silhouette_iou:.3f}]"
                )
            else:
                init_image.save(out_path, format="PNG")
                entry["fallbackUsed"] = True
                entry["fallbackSource"] = init_path.as_posix()
                print(
                    f"[prod] H-1.b {tod} {view} seed={seed} REJECTED "
                    f"reasons={list(decision.fail_reasons)} "
                    f"iou={decision.silhouette_iou:.3f} "
                    f"edge={decision.edge_alignment_score:.3f} "
                    f"bbox={decision.building_bbox_overlap} "
                    f"-> fallback F-2 baseline -> {out_path}"
                )
            results[(tod, view)] = out_path
            gate_log[(tod, view)] = entry

    return results, time.time() - t0, gate_log


def _step_h3_upscale(
    h1_outputs: dict[tuple[str, str], Path],
    output_root: Path,
) -> tuple[dict[tuple[str, str], Path], float]:
    t0 = time.time()
    from ai_rendering.ifc2img.postprocess import RealEsrganUpscaler

    print("[prod] load Real-ESRGAN upscaler")
    t_load = time.time()
    upscaler = RealEsrganUpscaler()
    print(f"[prod] upscaler load {time.time() - t_load:.1f}s on {upscaler.device}")

    h3_dir = output_root / "h3_upscaled"
    h3_dir.mkdir(parents=True, exist_ok=True)
    results: dict[tuple[str, str], Path] = {}
    for (tod, view), src in h1_outputs.items():
        t1 = time.time()
        image = Image.open(src).convert("RGB")
        up = upscaler.upscale_image(image)
        out_path = h3_dir / f"prod_{tod.lower()}_{view}_x4.png"
        up.save(out_path, format="PNG")
        results[(tod, view)] = out_path
        print(
            f"[prod] H-3 {tod} {view} -> {up.size} "
            f"in {time.time() - t1:.1f}s -> {out_path}"
        )
    return results, time.time() - t0


def _write_final_sheet(
    output_root: Path,
    h1_outputs: dict[tuple[str, str], Path],
    h3_outputs: dict[tuple[str, str], Path],
) -> None:
    pick = h3_outputs or h1_outputs
    if not pick:
        return
    sample = Image.open(next(iter(pick.values()))).convert("RGB")
    w_native, h_native = sample.size
    cell_w = 640
    cell_h = int(cell_w * h_native / max(w_native, 1))
    header = 30
    canvas = Image.new("RGB", (2 * cell_w, 2 * (cell_h + header)), (248, 248, 248))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    label_suffix = (
        f" x4 {w_native}x{h_native}" if h3_outputs else f" {w_native}x{h_native}"
    )
    for idx, tod in enumerate(("DAY", "NIGHT")):
        for ci, view in enumerate(VIEWS):
            x = ci * cell_w
            y = idx * (cell_h + header)
            draw.text(
                (x + 8, y + 8),
                f"{tod} {view}{label_suffix}",
                fill=(20, 20, 20),
                font=font,
            )
            p = pick.get((tod, view))
            if p and p.exists():
                fitted = Image.open(p).convert("RGB").resize(
                    (cell_w, cell_h), Image.Resampling.LANCZOS
                )
                canvas.paste(fitted, (x, y + header))
    out = output_root / "production_final_sheet.png"
    canvas.save(out, format="PNG")
    print(f"[prod] final sheet -> {out}")


def _write_manifest(
    *,
    output_root: Path,
    args: argparse.Namespace,
    timings: dict[str, float],
    h1_outputs: dict[tuple[str, str], Path],
    h3_outputs: dict[tuple[str, str], Path],
    gate_log: dict[tuple[str, str], dict],
    total_elapsed: float,
) -> None:
    payload = {
        "schemaVersion": "ifc2img.shinchanProduction.v1",
        "ifc": str(args.ifc.resolve()),
        "modelId": args.model_id,
        "preset": PRESET,
        "h1RenderSize": list(H1_RENDER_SIZE),
        "h1Guidance": H1_GUIDANCE,
        "h1Steps": H1_STEPS,
        "h1Day": {
            "seed": args.day_seed,
            "strength": H1_DAY_STRENGTH,
            "depthCnScale": H1_DAY_DEPTH_CN,
            "cannyCnScale": H1_DAY_CANNY_CN,
        },
        "h1Night": {
            "seed": args.night_seed,
            "strength": H1_NIGHT_STRENGTH,
            "depthCnScale": H1_NIGHT_DEPTH_CN,
            "cannyCnScale": H1_NIGHT_CANNY_CN,
        },
        "h3UpscaleApplied": bool(h3_outputs),
        "timings": {k: round(v, 2) for k, v in timings.items()},
        "totalElapsedSeconds": round(total_elapsed, 2),
        "h1Outputs": {
            f"{tod}|{view}": path.as_posix()
            for (tod, view), path in h1_outputs.items()
        },
        "h3Outputs": {
            f"{tod}|{view}": path.as_posix()
            for (tod, view), path in h3_outputs.items()
        },
        "h1FidelityGate": {
            f"{tod}|{view}": entry for (tod, view), entry in gate_log.items()
        },
        "h1FidelityFallbackCount": sum(
            1 for entry in gate_log.values() if entry.get("fallbackUsed")
        ),
    }
    out = output_root / "production_manifest.json"
    out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[prod] manifest -> {out}")


if __name__ == "__main__":
    main()
