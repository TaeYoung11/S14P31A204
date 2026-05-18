"""Generate Phase E-2.7 naturalized post color lock artifacts."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageFilter

from ai_rendering.ifc2img.element_masks import (
    IfcElementColorCorrectionCandidate,
    IfcElementMaskRenderResult,
    build_ifc_color_lock_artifact,
    evaluate_ifc_quantitative_color,
    measure_element_mask_mean_colors,
    measure_ifc_color_target_deltas,
    select_ifc_color_correction_candidates,
)
from ai_rendering.ifc2img.semantics import IfcSemanticCategory, extract_ifc_color_summary

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_ifc_color_artifact_matrix import (  # noqa: E402
    _debug_file,
    _find_debug_view,
    _load_element_masks,
    _posix,
    _serialize_deltas,
    _serialize_evaluation,
    measured_image_size,
)
from generate_ifc_geometry_color_e2_artifacts import (  # noqa: E402
    VIEWS,
    _load_json,
    _write_contact_sheet,
)

DEFAULT_IFC_PATH = Path("packages/ai-rendering/tests/fixtures/ifc/shinchan.ifc")
DEFAULT_E26_MANIFEST = Path(
    "outputs/ifc_geometry_e26_preset_off_baseline/e26_preset_off_baseline_manifest.json"
)
DEFAULT_OUTPUT_DIR = Path("outputs/ifc_geometry_e27_color_naturalization")
MANIFEST_NAME = "e27_color_naturalization_manifest.json"
CONTACT_SHEET_NAME = "e27_color_naturalization_contact_sheet.png"
NATURALIZED_CASE_NAME = "ifc_minimal_post_color_lock_naturalized_day"


@dataclass(frozen=True)
class NaturalizedColorLockConfig:
    strength: float
    feather_radius: float
    erosion_radius: int


DEFAULT_CATEGORY_CONFIGS: dict[IfcSemanticCategory, NaturalizedColorLockConfig] = {
    "ROOF": NaturalizedColorLockConfig(strength=0.85, feather_radius=2.0, erosion_radius=1),
    "WALL": NaturalizedColorLockConfig(strength=0.45, feather_radius=4.0, erosion_radius=1),
    "WINDOW": NaturalizedColorLockConfig(strength=0.90, feather_radius=1.0, erosion_radius=0),
    "DOOR": NaturalizedColorLockConfig(strength=0.75, feather_radius=1.0, erosion_radius=0),
}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate E-2.7 naturalized post color lock artifacts."
    )
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC_PATH)
    parser.add_argument("--e26-manifest", type=Path, default=DEFAULT_E26_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_geometry_e27_color_naturalization(
        ifc_path=args.ifc,
        e26_manifest_path=args.e26_manifest,
        output_dir=args.output,
    )
    manifest_path = args.output / MANIFEST_NAME
    print(f"[geometry-e2.7] wrote {manifest_path}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_geometry_e27_color_naturalization(
    *,
    ifc_path: Path,
    e26_manifest_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    """Build hard and naturalized color-lock artifacts from the E-2.6 baseline."""
    ifc_path = ifc_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    e26_manifest = _load_json(e26_manifest_path)
    baseline_case = _resolve_e26_baseline_case(e26_manifest)
    baseline_case_dir = _resolve_case_dir(e26_manifest_path, baseline_case)
    debug_manifest = _load_json(baseline_case_dir / "debug" / "debug_manifest.json")
    color_summary = extract_ifc_color_summary(ifc_path)

    case_payloads = [
        _build_baseline_case_payload(
            ifc_path=ifc_path,
            case_name="ifc_minimal_baseline_day",
            case_dir=baseline_case_dir,
            debug_manifest=debug_manifest,
            color_summary=color_summary,
        ),
        _build_color_lock_case_payload(
            ifc_path=ifc_path,
            source_case_dir=baseline_case_dir,
            output_dir=output_dir,
            case_name="ifc_minimal_post_color_lock_hard_1_00_day",
            debug_manifest=debug_manifest,
            color_summary=color_summary,
            mode="hard",
        ),
        _build_color_lock_case_payload(
            ifc_path=ifc_path,
            source_case_dir=baseline_case_dir,
            output_dir=output_dir,
            case_name=NATURALIZED_CASE_NAME,
            debug_manifest=debug_manifest,
            color_summary=color_summary,
            mode="naturalized",
        ),
    ]
    contact_sheet_path = output_dir / CONTACT_SHEET_NAME
    _write_contact_sheet(contact_sheet_path, case_payloads)
    manifest = {
        "schemaVersion": "ifc2img.geometryE27ColorNaturalization.v1",
        "sourceIfcPath": str(ifc_path),
        "sourceE26Manifest": _posix(e26_manifest_path),
        "baselineCase": baseline_case,
        "policy": {
            "preset": "ifc_minimal",
            "koreanHouseHandling": "historical_record_only",
            "referenceOnlyCandidates": "disabled",
        },
        "naturalizedConfig": _serialize_category_configs(DEFAULT_CATEGORY_CONFIGS),
        "cases": case_payloads,
        "decision": _build_decision(case_payloads),
        "contactSheet": _posix(contact_sheet_path),
        "notes": [
            "E-2.7 reuses the E-2.6 ifc_minimal baseline render.",
            "korean_house artifacts are not used as reference or winner candidates.",
            "Hard color lock is archived for boundary comparison only.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def build_naturalized_ifc_color_lock_artifact(
    image: Image.Image,
    element_masks: IfcElementMaskRenderResult,
    candidates: tuple[IfcElementColorCorrectionCandidate, ...],
    *,
    category_configs: dict[IfcSemanticCategory, NaturalizedColorLockConfig] | None = None,
) -> Image.Image:
    """Blend IFC target colors through feathered masks for artifact comparison."""
    configs = category_configs or DEFAULT_CATEGORY_CONFIGS
    image_rgb = image.convert("RGB")
    if not candidates:
        return image_rgb
    output = np.asarray(image_rgb, dtype=np.float32)
    for candidate in candidates:
        if candidate.target_rgb is None:
            continue
        config = configs.get(candidate.category)
        if config is None or config.strength <= 0.0:
            continue
        mask = element_masks.masks.get(candidate.category)
        if mask is None:
            continue
        alpha = _build_soft_alpha_mask(
            mask,
            expected_size=image_rgb.size,
            config=config,
        )
        if not np.any(alpha > 0.0):
            continue
        target = np.asarray(candidate.target_rgb, dtype=np.float32) * 255.0
        output = output * (1.0 - alpha[..., None]) + target * alpha[..., None]
    return Image.fromarray(np.clip(np.round(output), 0, 255).astype(np.uint8), mode="RGB")


def _build_soft_alpha_mask(
    mask: Image.Image,
    *,
    expected_size: tuple[int, int],
    config: NaturalizedColorLockConfig,
) -> np.ndarray:
    if not 0.0 <= config.strength <= 1.0:
        raise ValueError("naturalized color lock strength must be between 0.0 and 1.0")
    if config.erosion_radius < 0:
        raise ValueError("erosion_radius must be non-negative")
    if mask.size != expected_size:
        raise ValueError(f"mask size {mask.size} does not match image size {expected_size}")
    mask_l = mask.convert("L")
    if config.erosion_radius > 0:
        size = config.erosion_radius * 2 + 1
        mask_l = mask_l.filter(ImageFilter.MinFilter(size))
    if config.feather_radius > 0.0:
        mask_l = mask_l.filter(ImageFilter.GaussianBlur(config.feather_radius))
    alpha = np.asarray(mask_l, dtype=np.float32) / 255.0
    return np.clip(alpha * config.strength, 0.0, config.strength)


def _build_baseline_case_payload(
    *,
    ifc_path: Path,
    case_name: str,
    case_dir: Path,
    debug_manifest: dict[str, Any],
    color_summary: Any,
) -> dict[str, Any]:
    return {
        "caseName": case_name,
        "colorMode": "baseline",
        "caseDir": _posix(case_dir),
        "views": [
            _measure_existing_view(
                ifc_path=ifc_path,
                case_dir=case_dir,
                debug_manifest=debug_manifest,
                view=view,
                photo_path=case_dir / f"photo_{view}.png",
                color_summary=color_summary,
            )
            for view in VIEWS
        ],
    }


def _build_color_lock_case_payload(
    *,
    ifc_path: Path,
    source_case_dir: Path,
    output_dir: Path,
    case_name: str,
    debug_manifest: dict[str, Any],
    color_summary: Any,
    mode: str,
) -> dict[str, Any]:
    case_dir = output_dir / case_name
    case_dir.mkdir(parents=True, exist_ok=True)
    view_payloads = []
    for view in VIEWS:
        source_photo_path = source_case_dir / f"photo_{view}.png"
        output_photo_path = case_dir / f"photo_{view}.png"
        debug_view = _find_debug_view(debug_manifest, view)
        element_masks = _load_element_masks(source_case_dir, debug_view)
        with Image.open(source_photo_path) as image:
            base_image = image.convert("RGB")
            measurements = measure_element_mask_mean_colors(base_image, element_masks)
            deltas = measure_ifc_color_target_deltas(measurements, color_summary)
            candidates = select_ifc_color_correction_candidates(deltas)
            if mode == "hard":
                output_image = build_ifc_color_lock_artifact(
                    base_image,
                    element_masks,
                    candidates,
                    strength=1.0,
                )
            elif mode == "naturalized":
                output_image = build_naturalized_ifc_color_lock_artifact(
                    base_image,
                    element_masks,
                    candidates,
                )
            else:
                raise ValueError(f"unknown E-2.7 color lock mode: {mode}")
            output_image.save(output_photo_path, format="PNG")
        view_payloads.append(
            _measure_existing_view(
                ifc_path=ifc_path,
                case_dir=source_case_dir,
                debug_manifest=debug_manifest,
                view=view,
                photo_path=output_photo_path,
                color_summary=color_summary,
            )
        )
    return {
        "caseName": case_name,
        "colorMode": mode,
        "caseDir": _posix(case_dir),
        "views": view_payloads,
    }


def _measure_existing_view(
    *,
    ifc_path: Path,
    case_dir: Path,
    debug_manifest: dict[str, Any],
    view: str,
    photo_path: Path,
    color_summary: Any,
) -> dict[str, Any]:
    debug_view = _find_debug_view(debug_manifest, view)
    element_masks = _load_element_masks(case_dir, debug_view)
    with Image.open(photo_path) as image:
        measurements = measure_element_mask_mean_colors(image.convert("RGB"), element_masks)
    deltas = measure_ifc_color_target_deltas(measurements, color_summary)
    evaluation = evaluate_ifc_quantitative_color(
        deltas,
        total_pixel_count=measured_image_size(photo_path),
    )
    return {
        "view": view,
        "photo": _posix(photo_path),
        "measuredPhoto": _posix(photo_path),
        "ifcColorCompositeImage": _debug_file(case_dir, debug_view, "ifcColorCompositeImage"),
        "sourceIfcPath": str(ifc_path),
        "colorDeltas": _serialize_deltas(deltas),
        "evaluation": _serialize_evaluation(evaluation),
        "geometryFidelity": debug_view.get("geometryFidelity"),
    }


def _resolve_e26_baseline_case(e26_manifest: dict[str, Any]) -> dict[str, Any]:
    if e26_manifest.get("preset") != "ifc_minimal":
        raise ValueError("E-2.7 expects an E-2.6 ifc_minimal manifest")
    cases = e26_manifest.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("E-2.6 manifest has no cases")
    case = cases[0]
    if not isinstance(case, dict):
        raise ValueError("E-2.6 case payload is invalid")
    if case.get("preset") != "ifc_minimal":
        raise ValueError("E-2.7 expects an ifc_minimal baseline case")
    if case.get("geometryMode") != "depth_edge":
        raise ValueError("E-2.7 expects depth_edge geometry baseline")
    return case


def _resolve_case_dir(manifest_path: Path, case_payload: dict[str, Any]) -> Path:
    case_dir = Path(str(case_payload["caseDir"]))
    if case_dir.is_absolute():
        return case_dir
    return Path.cwd() / case_dir


def _serialize_category_configs(
    configs: dict[IfcSemanticCategory, NaturalizedColorLockConfig],
) -> dict[str, Any]:
    return {
        category: {
            "strength": config.strength,
            "featherRadius": config.feather_radius,
            "erosionRadius": config.erosion_radius,
        }
        for category, config in configs.items()
    }


def _build_decision(cases: list[dict[str, Any]]) -> dict[str, Any]:
    naturalized = next(
        case for case in cases if case["caseName"] == NATURALIZED_CASE_NAME
    )
    return {
        "recommendedForE3": NATURALIZED_CASE_NAME,
        "reason": (
            "Use the ifc_minimal baseline with feathered/category-weighted color "
            "lock as the next candidate; keep hard lock archived for boundary comparison."
        ),
        "naturalizedColorPassByView": {
            str(view["view"]): _color_pass_count(view)
            for view in naturalized["views"]
            if isinstance(view, dict)
        },
        "hardLockHandling": "archived_only",
        "koreanHouseHandling": "historical_record_only",
    }


def _color_pass_count(view_payload: dict[str, Any]) -> int:
    categories = view_payload.get("evaluation", {}).get("categories", {})
    if not isinstance(categories, dict):
        return 0
    return sum(
        1
        for category_payload in categories.values()
        if isinstance(category_payload, dict)
        and int(category_payload.get("pixelCount", 0)) > 0
        and category_payload.get("familyPass")
        and category_payload.get("deltaPass")
    )


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "caseCount": len(manifest["cases"]),
        "recommendedForE3": manifest["decision"]["recommendedForE3"],
        "contactSheet": manifest["contactSheet"],
    }


if __name__ == "__main__":
    main()
