"""Generate Phase E-2.8 category-tuned post color lock artifacts."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from PIL import Image

from ai_rendering.ifc2img.semantics import IfcSemanticCategory, extract_ifc_color_summary

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_ifc_color_artifact_matrix import (  # noqa: E402
    _find_debug_view,
    _load_element_masks,
    _posix,
)
from generate_ifc_geometry_color_e2_artifacts import (  # noqa: E402
    VIEWS,
    _load_json,
    _write_contact_sheet,
)
from generate_ifc_geometry_e27_color_naturalization import (  # noqa: E402
    MANIFEST_NAME as E27_MANIFEST_NAME,
    NaturalizedColorLockConfig,
    _color_pass_count,
    _measure_existing_view,
    _resolve_case_dir,
    _serialize_category_configs,
    build_naturalized_ifc_color_lock_artifact,
)
from generate_ifc_geometry_e27_color_naturalization import (  # noqa: E402
    DEFAULT_IFC_PATH,
    DEFAULT_OUTPUT_DIR as DEFAULT_E27_OUTPUT_DIR,
)
from generate_ifc_geometry_e27_color_naturalization import (  # noqa: E402
    DEFAULT_E26_MANIFEST,
)
from generate_ifc_geometry_e27_color_naturalization import (  # noqa: E402
    NATURALIZED_CASE_NAME as E27_NATURALIZED_CASE_NAME,
)
from ai_rendering.ifc2img.element_masks import (  # noqa: E402
    measure_element_mask_mean_colors,
    measure_ifc_color_target_deltas,
    select_ifc_color_correction_candidates,
)

DEFAULT_E27_MANIFEST = DEFAULT_E27_OUTPUT_DIR / E27_MANIFEST_NAME
DEFAULT_OUTPUT_DIR = Path("outputs/ifc_geometry_e28_category_tuning")
MANIFEST_NAME = "e28_category_tuning_manifest.json"
CONTACT_SHEET_NAME = "e28_category_tuning_contact_sheet.png"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate E-2.8 roof/door-tuned post color lock artifacts."
    )
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC_PATH)
    parser.add_argument("--e26-manifest", type=Path, default=DEFAULT_E26_MANIFEST)
    parser.add_argument("--e27-manifest", type=Path, default=DEFAULT_E27_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_geometry_e28_category_tuning(
        ifc_path=args.ifc,
        e26_manifest_path=args.e26_manifest,
        e27_manifest_path=args.e27_manifest,
        output_dir=args.output,
    )
    manifest_path = args.output / MANIFEST_NAME
    print(f"[geometry-e2.8] wrote {manifest_path}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_geometry_e28_category_tuning(
    *,
    ifc_path: Path,
    e26_manifest_path: Path,
    e27_manifest_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    ifc_path = ifc_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    e26_manifest = _load_json(e26_manifest_path)
    e27_manifest = _load_json(e27_manifest_path)
    baseline_case = _resolve_e26_baseline_case(e26_manifest)
    e27_case = _resolve_e27_naturalized_case(e27_manifest)
    baseline_case_dir = _resolve_case_dir(e26_manifest_path, baseline_case)
    baseline_debug_manifest = _load_json(baseline_case_dir / "debug" / "debug_manifest.json")
    color_summary = extract_ifc_color_summary(ifc_path)

    case_payloads = [
        _build_baseline_case_payload(
            ifc_path=ifc_path,
            case_name="ifc_minimal_baseline_day",
            case_dir=baseline_case_dir,
            debug_manifest=baseline_debug_manifest,
            color_summary=color_summary,
        )
    ]
    for case_name, configs in E28_CASE_CONFIGS.items():
        case_payloads.append(
            _build_tuned_case_payload(
                ifc_path=ifc_path,
                source_case_dir=baseline_case_dir,
                output_dir=output_dir,
                case_name=case_name,
                debug_manifest=baseline_debug_manifest,
                color_summary=color_summary,
                category_configs=configs,
            )
        )
    contact_sheet_path = output_dir / CONTACT_SHEET_NAME
    _write_contact_sheet(contact_sheet_path, case_payloads)
    decision = _build_decision(case_payloads)
    manifest = {
        "schemaVersion": "ifc2img.geometryE28CategoryTuning.v1",
        "sourceIfcPath": str(ifc_path),
        "sourceE26Manifest": _posix(e26_manifest_path),
        "sourceE27Manifest": _posix(e27_manifest_path),
        "baselineCase": baseline_case,
        "sourceE27NaturalizedCase": e27_case["caseName"],
        "policy": {
            "preset": "ifc_minimal",
            "koreanHouseHandling": "historical_record_only",
            "referenceOnlyCandidates": "disabled",
        },
        "caseConfigs": {
            case_name: _serialize_category_configs(configs)
            for case_name, configs in E28_CASE_CONFIGS.items()
        },
        "cases": case_payloads,
        "decision": decision,
        "contactSheet": _posix(contact_sheet_path),
        "notes": [
            "E-2.8 reuses the E-2.6 ifc_minimal baseline render and tunes only category strengths.",
            "E-2.7 first naturalized case stays archived for comparison only.",
            "front_diagonal_right door pixelCount remains diagnostic-only when zero.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _base_case_config() -> dict[IfcSemanticCategory, NaturalizedColorLockConfig]:
    return {
        "ROOF": NaturalizedColorLockConfig(strength=0.78, feather_radius=4.0, erosion_radius=2),
        "WALL": NaturalizedColorLockConfig(strength=0.40, feather_radius=4.0, erosion_radius=1),
        "WINDOW": NaturalizedColorLockConfig(strength=0.82, feather_radius=1.5, erosion_radius=0),
        "DOOR": NaturalizedColorLockConfig(strength=0.88, feather_radius=0.8, erosion_radius=0),
    }


E28_CASE_CONFIGS: dict[str, dict[IfcSemanticCategory, NaturalizedColorLockConfig]] = {
    "ifc_minimal_post_color_lock_naturalized_balanced_day": _base_case_config(),
    "ifc_minimal_post_color_lock_naturalized_roof_soft_day": {
        **_base_case_config(),
        "ROOF": NaturalizedColorLockConfig(strength=0.68, feather_radius=5.0, erosion_radius=2),
    },
    "ifc_minimal_post_color_lock_naturalized_door_strong_day": {
        **_base_case_config(),
        "DOOR": NaturalizedColorLockConfig(strength=1.0, feather_radius=0.5, erosion_radius=0),
    },
}


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


def _build_tuned_case_payload(
    *,
    ifc_path: Path,
    source_case_dir: Path,
    output_dir: Path,
    case_name: str,
    debug_manifest: dict[str, Any],
    color_summary: Any,
    category_configs: dict[IfcSemanticCategory, NaturalizedColorLockConfig],
) -> dict[str, Any]:
    case_dir = output_dir / case_name
    case_dir.mkdir(parents=True, exist_ok=True)
    view_payloads: list[dict[str, Any]] = []
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
            output_image = build_naturalized_ifc_color_lock_artifact(
                base_image,
                element_masks,
                candidates,
                category_configs=category_configs,
            )
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
        "colorMode": "category_tuned_post_lock",
        "caseDir": _posix(case_dir),
        "categoryConfigs": _serialize_category_configs(category_configs),
        "views": view_payloads,
    }


def _resolve_e26_baseline_case(e26_manifest: dict[str, Any]) -> dict[str, Any]:
    if e26_manifest.get("preset") != "ifc_minimal":
        raise ValueError("E-2.8 expects an E-2.6 ifc_minimal manifest")
    cases = e26_manifest.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("E-2.6 manifest has no cases")
    case = cases[0]
    if not isinstance(case, dict):
        raise ValueError("E-2.6 case payload is invalid")
    return case


def _resolve_e27_naturalized_case(e27_manifest: dict[str, Any]) -> dict[str, Any]:
    cases = e27_manifest.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("E-2.7 manifest has no cases")
    for case in cases:
        if isinstance(case, dict) and case.get("caseName") == E27_NATURALIZED_CASE_NAME:
            return case
    raise ValueError("E-2.8 expects the E-2.7 first naturalized case")


def _case_score(case_payload: dict[str, Any]) -> float:
    if case_payload.get("colorMode") == "baseline":
        return float("-inf")
    views = case_payload.get("views")
    if not isinstance(views, list):
        return float("-inf")
    left = next((view for view in views if view.get("view") == "front_diagonal_left"), {})
    right = next((view for view in views if view.get("view") == "front_diagonal_right"), {})
    left_categories = left.get("evaluation", {}).get("categories", {})
    right_categories = right.get("evaluation", {}).get("categories", {})
    if not isinstance(left_categories, dict) or not isinstance(right_categories, dict):
        return float("-inf")
    left_roof = _category_score_payload(left_categories.get("ROOF"))
    left_window = _category_score_payload(left_categories.get("WINDOW"))
    left_wall = _category_score_payload(left_categories.get("WALL"))
    left_door = _category_score_payload(left_categories.get("DOOR"))
    right_roof = _category_score_payload(right_categories.get("ROOF"))
    right_window = _category_score_payload(right_categories.get("WINDOW"))
    right_wall = _category_score_payload(right_categories.get("WALL"))
    score = 0.0
    score += left_roof + right_roof
    score += left_window + right_window
    score += left_wall + right_wall
    score += 1.5 * left_door
    score += 0.5 * _color_pass_count(left)
    score += 0.5 * _color_pass_count(right)
    return score


def _category_score_payload(category_payload: Any) -> float:
    if not isinstance(category_payload, dict):
        return 0.0
    pixel_count = int(category_payload.get("pixelCount", 0))
    if pixel_count <= 0:
        return 0.0
    delta = float(category_payload.get("deltaToTarget", 1.0))
    family_pass = bool(category_payload.get("familyPass"))
    delta_pass = bool(category_payload.get("deltaPass"))
    score = max(0.0, 1.0 - delta)
    if family_pass:
        score += 1.0
    if delta_pass:
        score += 1.0
    return score


def _build_decision(case_payloads: list[dict[str, Any]]) -> dict[str, Any]:
    tuned_cases = [
        case_payload
        for case_payload in case_payloads
        if case_payload.get("colorMode") == "category_tuned_post_lock"
    ]
    if not tuned_cases:
        raise ValueError("E-2.8 requires at least one tuned case")
    scored = sorted(
        ((case_payload["caseName"], _case_score(case_payload)) for case_payload in tuned_cases),
        key=lambda item: item[1],
        reverse=True,
    )
    recommended_name = scored[0][0]
    return {
        "recommendedForE3": recommended_name,
        "scoreboard": [{"caseName": case_name, "score": score} for case_name, score in scored],
        "archivedCases": [
            "ifc_minimal_post_color_lock_hard_1_00_day",
            E27_NATURALIZED_CASE_NAME,
        ],
        "rightDoorHandling": "diagnostic_only_when_pixel_count_zero",
        "koreanHouseHandling": "historical_record_only",
    }


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "caseCount": len(manifest["cases"]),
        "recommendedForE3": manifest["decision"]["recommendedForE3"],
        "contactSheet": manifest["contactSheet"],
    }


if __name__ == "__main__":
    main()
