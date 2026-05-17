"""Generate Phase G-4 soft-lock diffusion candidates.

This script runs StableDiffusionControlNetImg2ImgPipeline (SD 1.5 + ControlNet
depth + ControlNet seg) on top of F-2 IFC-locked baseline images. Building
silhouette/opening preservation is delegated to ControlNet conditioning + low
img2img strength + F-4 exactness reject downstream.

Stages:
- smoke      : 1 view, 384x224, depth ControlNet only, 1 strength
- mini       : 1 view, 384x224, depth + seg ControlNet, 3 strengths
- final_day  : 2 views, 512x320, depth + seg ControlNet, best strength, DAY
- final_night: 2 views, 512x320, depth + seg ControlNet, best strength, NIGHT

The output manifest matches the F-3 candidate schema so the existing F-4 and
F-5 scripts can consume it as another candidate set.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_F2_MANIFEST = (
    ROOT
    / "outputs"
    / "shinchan_full_gpu_f_pipeline_20260515_shadowghost_fix1"
    / "f2"
    / "f2_ifc_locked_baseline_manifest.json"
)
DEFAULT_DAY_DEBUG_MANIFEST = (
    ROOT
    / "outputs"
    / "shinchan_full_gpu_f_pipeline_20260515_fullregen1"
    / "e26_day"
    / "geometry_depth_edge_ifc_minimal_day"
    / "debug"
    / "debug_manifest.json"
)
DEFAULT_NIGHT_DEBUG_MANIFEST = (
    ROOT
    / "outputs"
    / "shinchan_full_gpu_f_pipeline_20260515_fullregen1"
    / "e26_night"
    / "geometry_depth_edge_ifc_minimal_night"
    / "debug"
    / "debug_manifest.json"
)
DEFAULT_OUTPUT_ROOT = ROOT / "outputs" / "ifc_geometry_g4_soft_lock_diffusion"
DEFAULT_PRIMARY_VIEW = "front_diagonal_left"

SMOKE_SIZE = (384, 224)
MINI_SIZE = (384, 224)
FINAL_SIZE = (512, 320)
MINI_STRENGTHS = (0.35, 0.45, 0.55)
SMOKE_STRENGTH = 0.40
DEFAULT_DEPTH_CN_SCALE = 0.7
DEFAULT_SEG_CN_SCALE = 0.45
DEFAULT_GUIDANCE_SCALE = 7.5
SMOKE_STEPS = 18
MINI_STEPS = 20
FINAL_STEPS = 25
DEFAULT_SEED = 42


@dataclass
class ViewSources:
    view: str
    init_with_background: Path
    init_no_background: Path
    depth_control: Path
    element_composite: Path
    element_mask_paths: dict[str, Path]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Phase G-4 soft-lock diffusion candidates."
    )
    parser.add_argument(
        "--stage",
        choices=("smoke", "mini", "final_day", "final_night", "all"),
        required=True,
    )
    parser.add_argument("--f2-manifest", type=Path, default=DEFAULT_F2_MANIFEST)
    parser.add_argument(
        "--day-debug-manifest", type=Path, default=DEFAULT_DAY_DEBUG_MANIFEST
    )
    parser.add_argument(
        "--night-debug-manifest", type=Path, default=DEFAULT_NIGHT_DEBUG_MANIFEST
    )
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--primary-view", default=DEFAULT_PRIMARY_VIEW)
    parser.add_argument("--strength", type=float, default=None)
    parser.add_argument("--depth-cn-scale", type=float, default=DEFAULT_DEPTH_CN_SCALE)
    parser.add_argument("--seg-cn-scale", type=float, default=DEFAULT_SEG_CN_SCALE)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--guidance-scale", type=float, default=DEFAULT_GUIDANCE_SCALE)
    parser.add_argument("--steps", type=int, default=None)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    run_stages: list[str]
    if args.stage == "all":
        run_stages = ["smoke", "mini", "final_day", "final_night"]
    else:
        run_stages = [args.stage]

    f2_manifest = _load_json(args.f2_manifest.resolve())
    day_debug = _load_json(args.day_debug_manifest.resolve())
    night_debug = _load_json(args.night_debug_manifest.resolve())

    day_sources = _resolve_view_sources(
        f2_manifest=f2_manifest,
        time_of_day="DAY",
        debug_manifest=day_debug,
        debug_manifest_path=args.day_debug_manifest.resolve(),
    )
    night_sources = _resolve_view_sources(
        f2_manifest=f2_manifest,
        time_of_day="NIGHT",
        debug_manifest=night_debug,
        debug_manifest_path=args.night_debug_manifest.resolve(),
    )

    renderer_cache: dict[str, Any] = {}

    for stage in run_stages:
        if stage == "smoke":
            _run_smoke_stage(
                day_sources=day_sources,
                primary_view=args.primary_view,
                output_root=args.output_root.resolve(),
                renderer_cache=renderer_cache,
                strength=args.strength or SMOKE_STRENGTH,
                depth_cn_scale=args.depth_cn_scale,
                seed=args.seed,
                guidance_scale=args.guidance_scale,
                steps=args.steps or SMOKE_STEPS,
            )
        elif stage == "mini":
            _run_mini_stage(
                day_sources=day_sources,
                primary_view=args.primary_view,
                output_root=args.output_root.resolve(),
                renderer_cache=renderer_cache,
                depth_cn_scale=args.depth_cn_scale,
                seg_cn_scale=args.seg_cn_scale,
                seed=args.seed,
                guidance_scale=args.guidance_scale,
                steps=args.steps or MINI_STEPS,
            )
        elif stage == "final_day":
            _run_final_stage(
                sources=day_sources,
                time_of_day="DAY",
                output_root=args.output_root.resolve(),
                renderer_cache=renderer_cache,
                strength=args.strength,
                depth_cn_scale=args.depth_cn_scale,
                seg_cn_scale=args.seg_cn_scale,
                seed=args.seed,
                guidance_scale=args.guidance_scale,
                steps=args.steps or FINAL_STEPS,
            )
        elif stage == "final_night":
            _run_final_stage(
                sources=night_sources,
                time_of_day="NIGHT",
                output_root=args.output_root.resolve(),
                renderer_cache=renderer_cache,
                strength=args.strength,
                depth_cn_scale=args.depth_cn_scale,
                seg_cn_scale=args.seg_cn_scale,
                seed=args.seed,
                guidance_scale=args.guidance_scale,
                steps=args.steps or FINAL_STEPS,
            )

    _write_combined_manifest(args.output_root.resolve(), args.f2_manifest.resolve())


def _resolve_view_sources(
    *,
    f2_manifest: dict[str, Any],
    time_of_day: str,
    debug_manifest: dict[str, Any],
    debug_manifest_path: Path,
) -> dict[str, ViewSources]:
    f2_case = _find_f2_case(f2_manifest, time_of_day)
    debug_root = debug_manifest_path.parent.parent
    f2_root = _find_f2_manifest_root(f2_case)
    sources: dict[str, ViewSources] = {}
    for view_payload in debug_manifest.get("views", []):
        if not isinstance(view_payload, dict):
            continue
        view_name = str(view_payload["view"])
        files = view_payload.get("files", {})
        f2_view = _find_f2_view(f2_case, view_name)
        if f2_view is None:
            continue
        sources[view_name] = ViewSources(
            view=view_name,
            init_with_background=_resolve_artifact_path(
                str(f2_view["baselineWithBackgroundImage"]), f2_root
            ),
            init_no_background=_resolve_artifact_path(
                str(f2_view["baselineNoBackgroundImage"]), f2_root
            ),
            depth_control=(debug_root / str(files["depthControlImage"])).resolve(),
            element_composite=(
                debug_root / str(files["elementMasks"]["composite"])
            ).resolve(),
            element_mask_paths={
                key: (debug_root / str(value)).resolve()
                for key, value in files.get("elementMasks", {}).items()
                if isinstance(value, str)
            },
        )
    return sources


def _find_f2_manifest_root(f2_case: dict[str, Any]) -> Path:
    """Best-effort root for F-2 manifest paths.

    F-2 stores baseline paths as posix strings that may be relative to the
    repo root. We fall back to the absolute repo root when needed.
    """
    return ROOT.parent


def _resolve_artifact_path(raw: str, manifest_root: Path) -> Path:
    candidate = Path(raw)
    if candidate.is_absolute() and candidate.exists():
        return candidate.resolve()
    if candidate.exists():
        return candidate.resolve()
    rel = manifest_root / raw
    if rel.exists():
        return rel.resolve()
    repo_rel = ROOT / raw
    if repo_rel.exists():
        return repo_rel.resolve()
    return candidate.resolve()


def _find_f2_case(f2_manifest: dict[str, Any], time_of_day: str) -> dict[str, Any]:
    for case in f2_manifest.get("cases", []):
        if str(case.get("timeOfDay")) == time_of_day:
            return case
    raise SystemExit(f"[g4] F-2 manifest has no {time_of_day} case")


def _find_f2_view(case: dict[str, Any], view_name: str) -> dict[str, Any] | None:
    for view in case.get("views", []):
        if str(view.get("view")) == view_name:
            return view
    return None


def _build_seg_image(source: ViewSources) -> Image.Image:
    """Build an ADE20K-palette seg image from the F-2 no-background building alpha."""
    from ai_rendering.ifc2img.soft_lock import (
        build_ade20k_seg_control,
        building_mask_from_no_background,
    )

    mask = building_mask_from_no_background(source.init_no_background)
    return build_ade20k_seg_control(building_mask=mask, ground_class="grass")


def _run_smoke_stage(
    *,
    day_sources: dict[str, ViewSources],
    primary_view: str,
    output_root: Path,
    renderer_cache: dict[str, Any],
    strength: float,
    depth_cn_scale: float,
    seed: int,
    guidance_scale: float,
    steps: int,
) -> None:
    from ai_rendering.ifc2img.soft_lock import (
        SoftLockRenderParams,
        build_region_aware_negative_prompt,
        build_region_aware_prompt,
        visible_categories_from_element_masks,
    )

    print("[g4][smoke] starting")
    stage_dir = output_root / "smoke"
    stage_dir.mkdir(parents=True, exist_ok=True)
    source = day_sources.get(primary_view) or next(iter(day_sources.values()))
    visible = visible_categories_from_element_masks(source.element_mask_paths)
    prompt = build_region_aware_prompt(visible_categories=visible, time_of_day="DAY")
    negative = build_region_aware_negative_prompt(time_of_day="DAY")

    renderer = _get_renderer(
        renderer_cache,
        key="depth_only",
        depth_only=True,
    )
    init_image = Image.open(source.init_with_background).convert("RGB")
    depth_image = Image.open(source.depth_control).convert("RGB")

    case_name = f"diffusion_soft_lock_smoke_s{int(round(strength * 100)):03d}_day"
    started = time.time()
    result = renderer.render(
        init_image=init_image,
        depth_image=depth_image,
        seg_image=None,
        params=SoftLockRenderParams(
            prompt=prompt,
            negative_prompt=negative,
            strength=strength,
            guidance_scale=guidance_scale,
            num_inference_steps=steps,
            depth_conditioning_scale=depth_cn_scale,
            seg_conditioning_scale=0.0,
            seed=seed,
        ),
        width=SMOKE_SIZE[0],
        height=SMOKE_SIZE[1],
    )
    elapsed = time.time() - started
    output_path = stage_dir / f"{case_name}_{source.view}.png"
    result.save(output_path)

    case_payload = _build_case_payload(
        case_name=case_name,
        family="diffusion_soft_lock_smoke",
        time_of_day="DAY",
        views=[
            {
                "view": source.view,
                "outputImage": _posix(output_path),
                "sourceNoBackgroundImage": _posix(source.init_no_background),
                "sourceWithBackgroundImage": _posix(source.init_with_background),
                "elapsedSeconds": round(elapsed, 2),
                "renderParams": {
                    "stage": "smoke",
                    "strength": strength,
                    "depthCnScale": depth_cn_scale,
                    "segCnScale": 0.0,
                    "steps": steps,
                    "guidanceScale": guidance_scale,
                    "seed": seed,
                    "size": list(SMOKE_SIZE),
                },
                "promptUsed": prompt,
                "negativePromptUsed": negative,
            }
        ],
    )
    manifest_path = stage_dir / "smoke_manifest.json"
    _write_manifest(manifest_path, [case_payload], stage="smoke")
    print(f"[g4][smoke] wrote {output_path} in {elapsed:.1f}s")


def _run_mini_stage(
    *,
    day_sources: dict[str, ViewSources],
    primary_view: str,
    output_root: Path,
    renderer_cache: dict[str, Any],
    depth_cn_scale: float,
    seg_cn_scale: float,
    seed: int,
    guidance_scale: float,
    steps: int,
) -> None:
    from ai_rendering.ifc2img.soft_lock import (
        SoftLockRenderParams,
        build_region_aware_negative_prompt,
        build_region_aware_prompt,
        visible_categories_from_element_masks,
    )

    print("[g4][mini] starting")
    stage_dir = output_root / "mini"
    stage_dir.mkdir(parents=True, exist_ok=True)
    source = day_sources.get(primary_view) or next(iter(day_sources.values()))
    visible = visible_categories_from_element_masks(source.element_mask_paths)
    prompt = build_region_aware_prompt(visible_categories=visible, time_of_day="DAY")
    negative = build_region_aware_negative_prompt(time_of_day="DAY")

    renderer = _get_renderer(renderer_cache, key="depth_plus_seg", depth_only=False)
    init_image = Image.open(source.init_with_background).convert("RGB")
    depth_image = Image.open(source.depth_control).convert("RGB")
    seg_image = _build_seg_image(source)

    cases_payload: list[dict[str, Any]] = []
    for strength in MINI_STRENGTHS:
        case_name = f"diffusion_soft_lock_mini_s{int(round(strength * 100)):03d}_day"
        started = time.time()
        result = renderer.render(
            init_image=init_image,
            depth_image=depth_image,
            seg_image=seg_image,
            params=SoftLockRenderParams(
                prompt=prompt,
                negative_prompt=negative,
                strength=strength,
                guidance_scale=guidance_scale,
                num_inference_steps=steps,
                depth_conditioning_scale=depth_cn_scale,
                seg_conditioning_scale=seg_cn_scale,
                seed=seed,
            ),
            width=MINI_SIZE[0],
            height=MINI_SIZE[1],
        )
        elapsed = time.time() - started
        output_path = stage_dir / f"{case_name}_{source.view}.png"
        result.save(output_path)
        cases_payload.append(
            _build_case_payload(
                case_name=case_name,
                family=f"diffusion_soft_lock_s{int(round(strength * 100)):03d}",
                time_of_day="DAY",
                views=[
                    {
                        "view": source.view,
                        "outputImage": _posix(output_path),
                        "sourceNoBackgroundImage": _posix(source.init_no_background),
                        "sourceWithBackgroundImage": _posix(source.init_with_background),
                        "elapsedSeconds": round(elapsed, 2),
                        "renderParams": {
                            "stage": "mini",
                            "strength": strength,
                            "depthCnScale": depth_cn_scale,
                            "segCnScale": seg_cn_scale,
                            "steps": steps,
                            "guidanceScale": guidance_scale,
                            "seed": seed,
                            "size": list(MINI_SIZE),
                        },
                        "promptUsed": prompt,
                        "negativePromptUsed": negative,
                    }
                ],
            )
        )
        print(f"[g4][mini] strength={strength} elapsed={elapsed:.1f}s -> {output_path}")
    manifest_path = stage_dir / "mini_manifest.json"
    _write_manifest(manifest_path, cases_payload, stage="mini")


def _run_final_stage(
    *,
    sources: dict[str, ViewSources],
    time_of_day: str,
    output_root: Path,
    renderer_cache: dict[str, Any],
    strength: float | None,
    depth_cn_scale: float,
    seg_cn_scale: float,
    seed: int,
    guidance_scale: float,
    steps: int,
) -> None:
    from ai_rendering.ifc2img.soft_lock import (
        SoftLockRenderParams,
        build_region_aware_negative_prompt,
        build_region_aware_prompt,
        visible_categories_from_element_masks,
    )

    chosen_strength = strength if strength is not None else _read_best_strength(output_root)
    print(
        f"[g4][final_{time_of_day.lower()}] starting strength={chosen_strength}"
    )
    stage_dir = output_root / f"final_{time_of_day.lower()}"
    stage_dir.mkdir(parents=True, exist_ok=True)

    renderer = _get_renderer(renderer_cache, key="depth_plus_seg", depth_only=False)

    family_name = (
        f"diffusion_soft_lock_final_s{int(round(chosen_strength * 100)):03d}"
    )
    case_name = f"{family_name}_{time_of_day.lower()}"
    views_payload: list[dict[str, Any]] = []
    for view_name in sorted(sources.keys()):
        source = sources[view_name]
        visible = visible_categories_from_element_masks(source.element_mask_paths)
        prompt = build_region_aware_prompt(
            visible_categories=visible, time_of_day=time_of_day
        )
        negative = build_region_aware_negative_prompt(time_of_day=time_of_day)
        init_image = Image.open(source.init_with_background).convert("RGB")
        depth_image = Image.open(source.depth_control).convert("RGB")
        seg_image = _build_seg_image(source)

        started = time.time()
        result = renderer.render(
            init_image=init_image,
            depth_image=depth_image,
            seg_image=seg_image,
            params=SoftLockRenderParams(
                prompt=prompt,
                negative_prompt=negative,
                strength=chosen_strength,
                guidance_scale=guidance_scale,
                num_inference_steps=steps,
                depth_conditioning_scale=depth_cn_scale,
                seg_conditioning_scale=seg_cn_scale,
                seed=seed,
            ),
            width=FINAL_SIZE[0],
            height=FINAL_SIZE[1],
        )
        elapsed = time.time() - started
        output_path = stage_dir / f"{case_name}_{source.view}.png"
        result.save(output_path)
        views_payload.append(
            {
                "view": source.view,
                "outputImage": _posix(output_path),
                "sourceNoBackgroundImage": _posix(source.init_no_background),
                "sourceWithBackgroundImage": _posix(source.init_with_background),
                "elapsedSeconds": round(elapsed, 2),
                "renderParams": {
                    "stage": f"final_{time_of_day.lower()}",
                    "strength": chosen_strength,
                    "depthCnScale": depth_cn_scale,
                    "segCnScale": seg_cn_scale,
                    "steps": steps,
                    "guidanceScale": guidance_scale,
                    "seed": seed,
                    "size": list(FINAL_SIZE),
                },
                "promptUsed": prompt,
                "negativePromptUsed": negative,
            }
        )
        print(
            f"[g4][final_{time_of_day.lower()}] view={view_name} "
            f"elapsed={elapsed:.1f}s -> {output_path}"
        )

    case_payload = _build_case_payload(
        case_name=case_name,
        family=family_name,
        time_of_day=time_of_day,
        views=views_payload,
    )
    manifest_path = stage_dir / f"final_{time_of_day.lower()}_manifest.json"
    _write_manifest(manifest_path, [case_payload], stage=f"final_{time_of_day.lower()}")


def _read_best_strength(output_root: Path) -> float:
    """Heuristic: if mini stage was run, return its middle strength as default best."""
    mini_manifest_path = output_root / "mini" / "mini_manifest.json"
    if mini_manifest_path.exists():
        manifest = _load_json(mini_manifest_path)
        cases = manifest.get("cases", [])
        if cases:
            strengths = sorted(
                {
                    float(view["renderParams"]["strength"])
                    for case in cases
                    for view in case.get("views", [])
                }
            )
            if strengths:
                return strengths[len(strengths) // 2]
    return MINI_STRENGTHS[len(MINI_STRENGTHS) // 2]


def _get_renderer(
    cache: dict[str, Any],
    *,
    key: str,
    depth_only: bool,
) -> Any:
    if key in cache:
        return cache[key]
    from ai_rendering.ifc2img.soft_lock import (
        DEFAULT_CONTROLNET_SEG_ID,
        SoftLockDiffusionRenderer,
    )

    started = time.time()
    renderer = SoftLockDiffusionRenderer(
        seg_controlnet_id=None if depth_only else DEFAULT_CONTROLNET_SEG_ID,
    )
    cache[key] = renderer
    print(f"[g4] loaded renderer key={key} in {time.time() - started:.1f}s")
    return renderer


def _build_case_payload(
    *,
    case_name: str,
    family: str,
    time_of_day: str,
    views: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "caseName": case_name,
        "candidateFamily": family,
        "timeOfDay": time_of_day,
        "views": views,
    }


def _write_manifest(
    manifest_path: Path,
    cases: list[dict[str, Any]],
    *,
    stage: str,
) -> None:
    manifest = {
        "schemaVersion": "ifc2img.g4SoftLockDiffusion.v1",
        "stage": stage,
        "cases": cases,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _write_combined_manifest(output_root: Path, f2_manifest_path: Path) -> None:
    """Aggregate per-stage manifests into a single G-4 manifest in F-3 schema."""
    combined: list[dict[str, Any]] = []
    for stage in ("smoke", "mini", "final_day", "final_night"):
        stage_manifest_path = output_root / stage / f"{stage}_manifest.json"
        if not stage_manifest_path.exists():
            continue
        stage_manifest = _load_json(stage_manifest_path)
        for case in stage_manifest.get("cases", []):
            combined.append(case)
    if not combined:
        return
    combined_path = output_root / "g4_soft_lock_diffusion_manifest.json"
    combined_payload = {
        "schemaVersion": "ifc2img.g4SoftLockDiffusion.combined.v1",
        "sourceF2Manifest": _posix(f2_manifest_path),
        "cases": combined,
    }
    combined_path.write_text(
        json.dumps(combined_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[g4] combined manifest -> {combined_path}")


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _posix(path: Path) -> str:
    return path.as_posix()


if __name__ == "__main__":
    main()
