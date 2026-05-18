"""Generate the IFC color preservation artifact matrix for one IFC fixture."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from ai_rendering.ifc2img.element_masks import (
    IfcElementMaskRenderResult,
    build_ifc_color_artifact_matrix,
    build_ifc_color_lock_artifact,
    compare_ifc_color_family_consistency,
    evaluate_ifc_quantitative_color,
    measure_element_mask_mean_colors,
    measure_ifc_color_target_deltas,
    select_ifc_color_correction_candidates,
)
from ai_rendering.ifc2img.semantics import (
    IfcSemanticCategory,
    extract_ifc_color_summary,
)
from ai_rendering.ifc2img.service import run_ifc2img_photo_pipeline

DEFAULT_IFC_PATH = Path("packages/ai-rendering/tests/fixtures/ifc/shinchan.ifc")
DEFAULT_OUTPUT_DIR = Path("outputs/ifc_color_artifact_matrix")
MATRIX_MANIFEST_NAME = "matrix_manifest.json"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate an 8-case IFC color artifact matrix."
    )
    parser.add_argument(
        "--ifc",
        type=Path,
        default=DEFAULT_IFC_PATH,
        help=f"Input IFC path. Defaults to {DEFAULT_IFC_PATH}.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory. Defaults to {DEFAULT_OUTPUT_DIR}.",
    )
    parser.add_argument(
        "--preset",
        default="korean_house",
        help="ifc2img preset to use.",
    )
    parser.add_argument(
        "--post-color-lock-strength",
        type=float,
        default=1.0,
        help="Artifact-only post color lock blend strength in the 0.0-1.0 range.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_color_artifact_matrix(
        ifc_path=args.ifc,
        output_dir=args.output,
        preset=args.preset,
        post_color_lock_strength=args.post_color_lock_strength,
    )
    manifest_path = args.output / MATRIX_MANIFEST_NAME
    print(f"[matrix] wrote {manifest_path}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_color_artifact_matrix(
    *,
    ifc_path: Path,
    output_dir: Path,
    preset: str,
    post_color_lock_strength: float,
) -> dict[str, object]:
    """Generate matrix artifacts and metrics without changing production defaults."""
    ifc_path = ifc_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    color_summary = extract_ifc_color_summary(ifc_path)
    cases = build_ifc_color_artifact_matrix(
        post_color_lock_strength=post_color_lock_strength
    )

    case_payloads: list[dict[str, object]] = []
    reports_by_time: dict[str, dict[str, object]] = {}
    for case in cases:
        case_dir = output_dir / case.case_name
        job = run_ifc2img_photo_pipeline(
            ifc_path,
            case_dir,
            preset=preset,
            time_of_day=case.time_of_day,
            use_ifc_color_prompt_suffix=case.use_prompt_color_injection,
            debug_artifacts=True,
        )
        debug_manifest = _load_debug_manifest(case_dir)
        payload = {
            "caseName": case.case_name,
            "variant": case.variant,
            "timeOfDay": case.time_of_day,
            "ifcColorMode": case.ifc_color_mode,
            "usesPromptColorInjection": case.use_prompt_color_injection,
            "usesIfcColorCompositeCandidate": case.use_ifc_color_composite,
            "usesPostColorLockArtifact": case.use_post_color_lock,
            "postColorLockStrength": case.post_color_lock_strength,
            "caseDir": _posix(case_dir),
            "manifest": _posix(job.manifest_path),
            "views": [],
        }

        view_payloads: list[dict[str, object]] = []
        for output in job.outputs:
            debug_view = _find_debug_view(debug_manifest, output.view)
            metrics = _measure_view_metrics(
                ifc_path=ifc_path,
                case_dir=case_dir,
                debug_view=debug_view,
                photo_path=output.photo_path,
                color_summary=color_summary,
                apply_post_color_lock=case.use_post_color_lock,
                post_color_lock_strength=case.post_color_lock_strength,
            )
            view_payloads.append(metrics)
        payload["views"] = view_payloads
        case_payloads.append(payload)
        reports_by_time[case.case_name] = {
            str(view["view"]): view["evaluation"]
            for view in view_payloads
        }

    manifest = {
        "schemaVersion": "ifc2img.colorArtifactMatrix.v1",
        "sourceIfcPath": str(ifc_path),
        "preset": preset,
        "cases": case_payloads,
        "dayNightFamilyConsistency": _build_day_night_consistency(case_payloads),
        "notes": [
            "hybrid_color records the IFC color composite candidate artifact; "
            "it does not switch production ControlNet input yet.",
            "post_color_lock writes comparison artifacts only; production output is unchanged.",
        ],
    }
    manifest_path = output_dir / MATRIX_MANIFEST_NAME
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _measure_view_metrics(
    *,
    ifc_path: Path,
    case_dir: Path,
    debug_view: dict[str, object],
    photo_path: Path,
    color_summary: object,
    apply_post_color_lock: bool,
    post_color_lock_strength: float,
) -> dict[str, object]:
    element_masks = _load_element_masks(case_dir, debug_view)
    measured_photo_path = photo_path
    color_lock_path: Path | None = None

    with Image.open(photo_path) as image:
        base_image = image.convert("RGB")
        measurements = measure_element_mask_mean_colors(base_image, element_masks)
        deltas = measure_ifc_color_target_deltas(measurements, color_summary)
        candidates = select_ifc_color_correction_candidates(deltas)
        if apply_post_color_lock:
            locked = build_ifc_color_lock_artifact(
                base_image,
                element_masks,
                candidates,
                strength=post_color_lock_strength,
            )
            color_lock_path = photo_path.with_name(
                f"{photo_path.stem}_post_color_lock.png"
            )
            locked.save(color_lock_path, format="PNG")
            measured_photo_path = color_lock_path

    with Image.open(measured_photo_path) as measured_image:
        final_measurements = measure_element_mask_mean_colors(
            measured_image.convert("RGB"),
            element_masks,
        )
    final_deltas = measure_ifc_color_target_deltas(final_measurements, color_summary)
    evaluation = evaluate_ifc_quantitative_color(
        final_deltas,
        total_pixel_count=measured_image_size(measured_photo_path),
    )

    return {
        "view": debug_view["view"],
        "photo": _posix(photo_path),
        "measuredPhoto": _posix(measured_photo_path),
        "postColorLockArtifact": _posix(color_lock_path) if color_lock_path else None,
        "ifcColorCompositeImage": _debug_file(case_dir, debug_view, "ifcColorCompositeImage"),
        "sourceIfcPath": str(ifc_path),
        "colorDeltasBeforePostLock": _serialize_deltas(deltas),
        "correctionCandidates": [
            {
                "category": candidate.category,
                "pixelCount": candidate.pixel_count,
                "meanRgb": list(candidate.mean_rgb) if candidate.mean_rgb else None,
                "targetRgb": list(candidate.target_rgb) if candidate.target_rgb else None,
                "delta": candidate.delta,
            }
            for candidate in candidates
        ],
        "evaluation": _serialize_evaluation(evaluation),
    }


def _load_debug_manifest(case_dir: Path) -> dict[str, object]:
    manifest_path = case_dir / "debug" / "debug_manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def _find_debug_view(
    debug_manifest: dict[str, object],
    view: str,
) -> dict[str, object]:
    views = debug_manifest.get("views")
    if not isinstance(views, list):
        raise ValueError("debug manifest has no views list")
    for item in views:
        if isinstance(item, dict) and item.get("view") == view:
            return item
    raise ValueError(f"debug manifest has no view: {view}")


def _load_element_masks(
    case_dir: Path,
    debug_view: dict[str, object],
) -> IfcElementMaskRenderResult:
    files = debug_view["files"]
    if not isinstance(files, dict):
        raise ValueError("debug view files payload is invalid")
    element_mask_files = files["elementMasks"]
    if not isinstance(element_mask_files, dict):
        raise ValueError("debug view elementMasks payload is invalid")
    masks: dict[IfcSemanticCategory, Image.Image] = {}
    for category, key in (
        ("FLOOR", "floor"),
        ("ROOF", "roof"),
        ("WALL", "wall"),
        ("WINDOW", "window"),
        ("DOOR", "door"),
    ):
        masks[category] = Image.open(case_dir / str(element_mask_files[key])).convert("L")
    composite = Image.open(case_dir / str(element_mask_files["composite"])).convert("RGB")
    return IfcElementMaskRenderResult(masks=masks, composite=composite)


def _debug_file(
    case_dir: Path,
    debug_view: dict[str, object],
    key: str,
) -> str | None:
    files = debug_view.get("files")
    if not isinstance(files, dict):
        return None
    value = files.get(key)
    return _posix(case_dir / str(value)) if isinstance(value, str) else None


def measured_image_size(path: Path) -> int:
    with Image.open(path) as image:
        width, height = image.size
    return width * height


def _serialize_deltas(deltas: dict[IfcSemanticCategory, object]) -> dict[str, object]:
    payload: dict[str, object] = {}
    for category, item in deltas.items():
        payload[category] = {
            "pixelCount": item.pixel_count,
            "meanRgb": list(item.mean_rgb) if item.mean_rgb else None,
            "targetRgb": list(item.target_rgb) if item.target_rgb else None,
            "deltaToTarget": item.delta,
        }
    return payload


def _serialize_evaluation(report: object) -> dict[str, object]:
    return {
        "success": report.success,
        "colorFamilyPass": report.color_family_pass,
        "deltaPass": report.delta_pass,
        "shapeCollapseNotes": report.shape_collapse_notes,
        "backgroundRegressionNotes": report.background_regression_notes,
        "categories": {
            category: {
                "deltaToTarget": item.delta_to_target,
                "pixelCount": item.pixel_count,
                "pixelCoverage": item.pixel_coverage,
                "measuredColorFamily": item.measured_color_family,
                "targetColorFamily": item.target_color_family,
                "expectedColorFamilies": list(item.expected_color_families),
                "familyPass": item.family_pass,
                "deltaPass": item.delta_pass,
            }
            for category, item in report.categories.items()
        },
    }


def _build_day_night_consistency(
    cases: list[dict[str, object]],
) -> dict[str, object]:
    consistency: dict[str, object] = {}
    by_name = {str(case["caseName"]): case for case in cases}
    for variant in ("default", "prompt_injection", "hybrid_color", "post_color_lock"):
        day = by_name.get(f"{variant}_day")
        night = by_name.get(f"{variant}_night")
        if day is None or night is None:
            continue
        variant_payload: dict[str, object] = {}
        day_views = {
            str(view["view"]): view
            for view in day["views"]
            if isinstance(view, dict)
        }
        for night_view in night["views"]:
            if not isinstance(night_view, dict):
                continue
            view_name = str(night_view["view"])
            day_view = day_views.get(view_name)
            if day_view is None:
                continue
            variant_payload[view_name] = compare_ifc_color_family_consistency(
                _evaluation_from_payload(day_view["evaluation"]),
                _evaluation_from_payload(night_view["evaluation"]),
            )
        consistency[variant] = variant_payload
    return consistency


def _evaluation_from_payload(payload: object) -> object:
    from ai_rendering.ifc2img.element_masks import (
        IfcCategoryColorEvaluation,
        IfcColorEvaluationReport,
    )

    if not isinstance(payload, dict):
        raise ValueError("evaluation payload is invalid")
    categories_payload = payload["categories"]
    if not isinstance(categories_payload, dict):
        raise ValueError("evaluation categories payload is invalid")
    categories = {
        category: IfcCategoryColorEvaluation(
            category=category,
            delta_to_target=item["deltaToTarget"],
            pixel_count=item["pixelCount"],
            pixel_coverage=item["pixelCoverage"],
            measured_color_family=item["measuredColorFamily"],
            target_color_family=item["targetColorFamily"],
            expected_color_families=tuple(item["expectedColorFamilies"]),
            family_pass=item["familyPass"],
            delta_pass=item["deltaPass"],
        )
        for category, item in categories_payload.items()
    }
    return IfcColorEvaluationReport(
        categories=categories,
        shape_collapse_notes=str(payload["shapeCollapseNotes"]),
        background_regression_notes=str(payload["backgroundRegressionNotes"]),
    )


def _summarize_manifest(manifest: dict[str, object]) -> dict[str, object]:
    cases = manifest.get("cases", [])
    return {
        "caseCount": len(cases) if isinstance(cases, list) else 0,
        "manifest": MATRIX_MANIFEST_NAME,
    }


def _posix(path: Path | None) -> str | None:
    return path.as_posix() if path is not None else None


if __name__ == "__main__":
    main()
