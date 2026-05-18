"""End-to-end soft_lock photo pipeline (single time_of_day).

Library entry point that runs the IFC -> soft_lock diffusion -> Real-ESRGAN
H-3 upscale chain for one time_of_day at a time, returning the same
`Ifc2ImgPhotoJobResult` contract as :func:`run_ifc2img_photo_pipeline`.

Internal stages:

1. Regen IFC source debug artifacts (depth / element masks / debug manifest).
2. Build the F-2 IFC-locked baseline (init image + canny source for soft_lock).
3. Resolve a style prompt profile - SHINCHAN_STYLE_PROFILE on signature
   match, otherwise derived from the IFC color summary.
4. Run :class:`SoftLockDiffusionRenderer` per view with H-1.b hot tuned
   params; each output passes
   :func:`evaluate_ifc_geometry_fidelity_gate`. Below-threshold views fall
   back to the F-2 baseline before persistence.
5. Run :class:`RealEsrganUpscaler` x4 on the persisted photo.
6. Emit `Ifc2ImgPhotoManifest` + return `Ifc2ImgPhotoJobResult` whose
   `photo_path` points to the upscaled image.

The F-2 generator currently lives under ``scripts/`` (loaded via a sys.path
shim). Moving it into this package is tracked as a follow-up.
"""

from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path
from typing import Literal

from PIL import Image

from .element_masks import (
    IfcElementMaskRenderResult,
    evaluate_ifc_geometry_fidelity_gate,
    measure_ifc_geometry_fidelity,
)
from .semantics import (
    IfcColorSummary,
    extract_ifc_color_summary,
    nearest_prompt_color_name,
)
from .service import (
    DEFAULT_IFC2IMG_WORKER_TIME_OF_DAY,
    DEFAULT_PHOTO_PRESET,
    Ifc2ImgPhotoJobResult,
    Ifc2ImgPhotoManifest,
    Ifc2ImgPhotoViewResult,
    Ifc2ImgWorkerTimeOfDay,
    PUBLIC_TO_INTERNAL_VIEW,
    normalize_ifc2img_time_of_day,
    run_ifc2img_photo_pipeline,
    write_photo_manifest_file,
)
from .soft_lock import (
    CONTROLNET_V11_CANNY_ID,
    DEFAULT_CONTROLNET_DEPTH_ID,
    SHINCHAN_STYLE_PROFILE,
    SoftLockDiffusionRenderer,
    SoftLockRenderParams,
    StylePrompt,
    build_canny_control_from_no_background,
    build_region_aware_negative_prompt,
    build_region_aware_prompt,
    style_profile_from_ifc_color_summary,
    visible_categories_from_element_masks,
)


# Default model + per-time-of-day H-1.b hot tuning (mirrors the values used in
# scripts/run_shinchan_production_pipeline.py).
DEFAULT_SOFT_LOCK_MODEL_ID = "SG161222/Realistic_Vision_V6.0_B1_noVAE"
H1_RENDER_SIZE = (768, 448)
H1_GUIDANCE = 7.5
H1_STEPS = 30
_H1_PARAMS_BY_TIME_OF_DAY: dict[
    Ifc2ImgWorkerTimeOfDay, tuple[int, float, float, float]
] = {
    "DAY": (42, 0.68, 0.5, 0.4),
    "NIGHT": (33, 0.65, 0.5, 0.55),
}

VIEWS: tuple[str, ...] = ("front_diagonal_left", "front_diagonal_right")
PRESET_FOR_DEBUG_ARTIFACTS = "ifc_minimal"

# Color-name fingerprint of shinchan.ifc as classified by
# `nearest_prompt_color_name`. See
# scripts/run_shinchan_production_pipeline.py for the rationale (the
# classified families intentionally differ from the prompt words used by
# SHINCHAN_STYLE_PROFILE).
SHINCHAN_COLOR_SIGNATURE: dict[str, str] = {
    "ROOF": "red",
    "WALL": "white",
    "WINDOW": "tan",
    "DOOR": "brown",
}
SHINCHAN_SIGNATURE_MIN_MATCHES = 3

_CATEGORY_KEY_TO_SEMANTIC: dict[str, str] = {
    "floor": "FLOOR",
    "roof": "ROOF",
    "wall": "WALL",
    "window": "WINDOW",
    "door": "DOOR",
}


def _import_f2_generator():
    """Import the F-2 generator that still lives under scripts/.

    Tracked as follow-up to relocate into the package.
    """
    repo_root = Path(__file__).resolve().parents[5]
    scripts_dir = repo_root / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from generate_ifc_locked_baseline_f2 import (  # type: ignore[import-not-found]
        generate_ifc_locked_baseline_f2_for_time_of_day,
    )

    return generate_ifc_locked_baseline_f2_for_time_of_day


def _classify_category_color(summary: IfcColorSummary, semantic: str) -> str | None:
    category_summary = summary.categories.get(semantic)
    if category_summary is None or category_summary.color is None:
        return None
    rgb = category_summary.color.rgb
    if rgb is None:
        return None
    return nearest_prompt_color_name(rgb)


def matches_shinchan_color_signature(summary: IfcColorSummary) -> bool:
    matches = sum(
        1
        for semantic, expected in SHINCHAN_COLOR_SIGNATURE.items()
        if _classify_category_color(summary, semantic) == expected
    )
    return matches >= SHINCHAN_SIGNATURE_MIN_MATCHES


def resolve_style_profile(
    summary: IfcColorSummary,
) -> tuple[StylePrompt, Literal["SHINCHAN_STYLE_PROFILE", "derived_from_ifc_color_summary"]]:
    if matches_shinchan_color_signature(summary):
        return SHINCHAN_STYLE_PROFILE, "SHINCHAN_STYLE_PROFILE"
    return (
        style_profile_from_ifc_color_summary(summary),
        "derived_from_ifc_color_summary",
    )


def run_ifc2img_soft_lock_photo_pipeline(
    ifc_path: Path | str,
    output_dir: Path | str,
    *,
    preset: str = DEFAULT_PHOTO_PRESET,
    time_of_day: object | None = DEFAULT_IFC2IMG_WORKER_TIME_OF_DAY,
    model_id: str = DEFAULT_SOFT_LOCK_MODEL_ID,
    skip_h3_upscale: bool = False,
) -> Ifc2ImgPhotoJobResult:
    """Run the soft_lock + H-3 photo pipeline for one time_of_day.

    Signature is compatible with `pipeline=` injection in
    :func:`handle_ifc2img_worker_request`.
    """
    ifc_path = Path(ifc_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    preset_time_of_day = normalize_ifc2img_time_of_day(time_of_day)
    worker_time_of_day: Ifc2ImgWorkerTimeOfDay = (
        "DAY" if preset_time_of_day == "day" else "NIGHT"
    )
    if worker_time_of_day not in _H1_PARAMS_BY_TIME_OF_DAY:
        raise ValueError(f"unsupported time_of_day: {worker_time_of_day!r}")

    source_dir = output_dir / f"ifc_source_{worker_time_of_day.lower()}"
    if source_dir.exists():
        shutil.rmtree(source_dir)
    source_dir.mkdir(parents=True, exist_ok=True)
    run_ifc2img_photo_pipeline(
        ifc_path=ifc_path,
        output_dir=source_dir,
        preset=PRESET_FOR_DEBUG_ARTIFACTS,
        time_of_day=worker_time_of_day,
        debug_artifacts=True,
    )

    f2_root = output_dir / "f2"
    if f2_root.exists():
        shutil.rmtree(f2_root)
    debug_manifest_path = source_dir / "debug" / "debug_manifest.json"
    generate_f2 = _import_f2_generator()
    generate_f2(
        time_of_day=worker_time_of_day,
        debug_manifest_path=debug_manifest_path,
        output_dir=f2_root,
    )
    f2_time_dir = f2_root / f"ifc_locked_baseline_{worker_time_of_day.lower()}"

    summary = extract_ifc_color_summary(ifc_path)
    style_profile, style_profile_source = resolve_style_profile(summary)

    renderer = SoftLockDiffusionRenderer(
        model_id=model_id,
        depth_controlnet_id=DEFAULT_CONTROLNET_DEPTH_ID,
        seg_controlnet_id=CONTROLNET_V11_CANNY_ID,
    )

    h1_dir = output_dir / "h1_photoreal"
    h1_dir.mkdir(parents=True, exist_ok=True)

    seed, strength, depth_cn, canny_cn = _H1_PARAMS_BY_TIME_OF_DAY[worker_time_of_day]
    debug_manifest = json.loads(debug_manifest_path.read_text(encoding="utf-8"))

    h1_results: dict[str, Path] = {}
    gate_log: dict[str, dict[str, object]] = {}

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
            visible_categories=visible,
            time_of_day=worker_time_of_day,
            style_profile=style_profile,
        )
        negative = build_region_aware_negative_prompt(time_of_day=worker_time_of_day)
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

        out_path = h1_dir / f"photo_{view}.png"
        entry: dict[str, object] = {
            "decision": decision.to_dict(),
            "fidelity": fidelity_report.to_dict(),
            "fallbackUsed": False,
            "elapsedSeconds": round(time.time() - t1, 2),
        }
        if decision.accepted:
            result.save(out_path)
        else:
            init_image.save(out_path, format="PNG")
            entry["fallbackUsed"] = True
            entry["fallbackSource"] = init_path.as_posix()
        h1_results[view] = out_path
        gate_log[view] = entry

    if skip_h3_upscale:
        final_photos = dict(h1_results)
        h3_dir = None
    else:
        from .postprocess import RealEsrganUpscaler

        upscaler = RealEsrganUpscaler()
        h3_dir = output_dir / "h3_upscaled"
        h3_dir.mkdir(parents=True, exist_ok=True)
        final_photos = {}
        for view, src in h1_results.items():
            image = Image.open(src).convert("RGB")
            upscaled = upscaler.upscale_image(image)
            dst = h3_dir / f"photo_{view}.png"
            upscaled.save(dst, format="PNG")
            final_photos[view] = dst

    outputs: list[Ifc2ImgPhotoViewResult] = []
    for view in VIEWS:
        if view not in final_photos:
            continue
        photo_path = final_photos[view]
        with Image.open(photo_path) as image:
            width, height = image.size
        depth_for_view = source_dir / f"depth_{view}.png"
        outputs.append(
            Ifc2ImgPhotoViewResult(
                view=view,
                internal_view=PUBLIC_TO_INTERNAL_VIEW[view],
                photo_path=photo_path,
                depth_path=depth_for_view,
                width=width,
                height=height,
            )
        )

    manifest = Ifc2ImgPhotoManifest(
        source_ifc_path=ifc_path,
        preset=preset,
        outputs=tuple(outputs),
        time_of_day=worker_time_of_day,
    )
    manifest_path = write_photo_manifest_file(
        output_dir / "manifest.v1.json",
        manifest,
    )

    gate_payload = {
        "stylePrompt": {
            "source": style_profile_source,
            "shinchanSignatureMatched": (
                style_profile_source == "SHINCHAN_STYLE_PROFILE"
            ),
        },
        "h1FidelityGate": gate_log,
        "h1FidelityFallbackCount": sum(
            1 for entry in gate_log.values() if entry.get("fallbackUsed")
        ),
        "h3UpscaleApplied": not skip_h3_upscale,
    }
    (output_dir / "soft_lock_gate.json").write_text(
        json.dumps(gate_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return Ifc2ImgPhotoJobResult(
        preset=preset,
        output_dir=output_dir,
        outputs=tuple(outputs),
        manifest_path=manifest_path,
        time_of_day=worker_time_of_day,
    )
