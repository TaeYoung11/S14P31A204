"""Generate Phase E-2.9 roof/window polish artifacts from the E-2.8 winner."""

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
    DEFAULT_IFC_PATH,
    NaturalizedColorLockConfig,
    _color_pass_count,
    _measure_existing_view,
    _serialize_category_configs,
    build_naturalized_ifc_color_lock_artifact,
)
from ai_rendering.ifc2img.element_masks import (  # noqa: E402
    measure_element_mask_mean_colors,
    measure_ifc_color_target_deltas,
    select_ifc_color_correction_candidates,
)

DEFAULT_E28_MANIFEST = Path(
    "outputs/ifc_geometry_e28_category_tuning/e28_category_tuning_manifest.json"
)
DEFAULT_OUTPUT_DIR = Path("outputs/ifc_geometry_e29_roof_window_polish")
MANIFEST_NAME = "e29_roof_window_polish_manifest.json"
CONTACT_SHEET_NAME = "e29_roof_window_polish_contact_sheet.png"
E28_WINNER_CASE_NAME = "ifc_minimal_post_color_lock_naturalized_door_strong_day"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate E-2.9 roof/window polish artifacts from the E-2.8 winner."
    )
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC_PATH)
    parser.add_argument("--e28-manifest", type=Path, default=DEFAULT_E28_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_geometry_e29_roof_window_polish(
        ifc_path=args.ifc,
        e28_manifest_path=args.e28_manifest,
        output_dir=args.output,
    )
    manifest_path = args.output / MANIFEST_NAME
    print(f"[geometry-e2.9] wrote {manifest_path}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_geometry_e29_roof_window_polish(
    *,
    ifc_path: Path,
    e28_manifest_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    ifc_path = ifc_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    e28_manifest = _load_json(e28_manifest_path)
    winner_case = _resolve_e28_winner_case(e28_manifest)
    winner_case_dir = _resolve_case_dir_from_payload(e28_manifest_path, winner_case)
    baseline_e26_case = e28_manifest.get("baselineCase")
    if not isinstance(baseline_e26_case, dict):
        raise ValueError("E-2.9 expects an E-2.8 manifest baselineCase payload")
    baseline_e26_dir = _resolve_case_dir_from_payload(e28_manifest_path, baseline_e26_case)
    debug_manifest = _load_json(baseline_e26_dir / "debug" / "debug_manifest.json")
    color_summary = extract_ifc_color_summary(ifc_path)

    case_payloads = [
        _build_existing_case_payload(
            ifc_path=ifc_path,
            case_name=winner_case["caseName"],
            case_dir=winner_case_dir,
            mask_case_dir=baseline_e26_dir,
            debug_manifest=debug_manifest,
            color_summary=color_summary,
            color_mode="e28_winner_baseline",
        )
    ]
    for case_name, configs in E29_CASE_CONFIGS.items():
        case_payloads.append(
            _build_tuned_case_payload(
                ifc_path=ifc_path,
                source_case_dir=winner_case_dir,
                mask_case_dir=baseline_e26_dir,
                output_dir=output_dir,
                case_name=case_name,
                debug_manifest=debug_manifest,
                color_summary=color_summary,
                category_configs=configs,
            )
        )

    contact_sheet_path = output_dir / CONTACT_SHEET_NAME
    _write_contact_sheet(contact_sheet_path, case_payloads)
    decision = _build_decision(case_payloads)
    manifest = {
        "schemaVersion": "ifc2img.geometryE29RoofWindowPolish.v1",
        "sourceIfcPath": str(ifc_path),
        "sourceE28Manifest": _posix(e28_manifest_path),
        "sourceE28WinnerCase": winner_case["caseName"],
        "policy": {
            "preset": "ifc_minimal",
            "koreanHouseHandling": "historical_record_only",
            "referenceOnlyCandidates": "disabled",
        },
        "caseConfigs": {
            case_name: _serialize_category_configs(configs)
            for case_name, configs in E29_CASE_CONFIGS.items()
        },
        "cases": case_payloads,
        "decision": decision,
        "contactSheet": _posix(contact_sheet_path),
        "notes": [
            "E-2.9 reuses the E-2.8 winner image and polishes roof/window only.",
            "Door improvement from E-2.8 should be preserved or the case is rejected.",
            "front_diagonal_right door pixelCount remains diagnostic-only when zero.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _winner_base_config() -> dict[IfcSemanticCategory, NaturalizedColorLockConfig]:
    return {
        "ROOF": NaturalizedColorLockConfig(strength=0.0, feather_radius=0.0, erosion_radius=0),
        "WALL": NaturalizedColorLockConfig(strength=0.0, feather_radius=0.0, erosion_radius=0),
        "WINDOW": NaturalizedColorLockConfig(strength=0.0, feather_radius=0.0, erosion_radius=0),
        "DOOR": NaturalizedColorLockConfig(strength=0.0, feather_radius=0.0, erosion_radius=0),
    }


E29_CASE_CONFIGS: dict[str, dict[IfcSemanticCategory, NaturalizedColorLockConfig]] = {
    "ifc_minimal_post_color_lock_roof_green_push_soft_day": {
        **_winner_base_config(),
        "ROOF": NaturalizedColorLockConfig(strength=0.70, feather_radius=3.5, erosion_radius=1),
        "WINDOW": NaturalizedColorLockConfig(strength=0.18, feather_radius=1.2, erosion_radius=0),
    },
    "ifc_minimal_post_color_lock_roof_green_push_balanced_day": {
        **_winner_base_config(),
        "ROOF": NaturalizedColorLockConfig(strength=0.85, feather_radius=2.5, erosion_radius=1),
        "WINDOW": NaturalizedColorLockConfig(strength=0.22, feather_radius=1.0, erosion_radius=0),
    },
    "ifc_minimal_post_color_lock_window_delta_balanced_day": {
        **_winner_base_config(),
        "ROOF": NaturalizedColorLockConfig(strength=0.55, feather_radius=3.0, erosion_radius=1),
        "WINDOW": NaturalizedColorLockConfig(strength=0.35, feather_radius=0.8, erosion_radius=0),
    },
}


def _build_existing_case_payload(
    *,
    ifc_path: Path,
    case_name: str,
    case_dir: Path,
    mask_case_dir: Path,
    debug_manifest: dict[str, Any],
    color_summary: Any,
    color_mode: str,
) -> dict[str, Any]:
    return {
        "caseName": case_name,
        "colorMode": color_mode,
        "caseDir": _posix(case_dir),
        "views": [
            _measure_existing_view(
                ifc_path=ifc_path,
                case_dir=mask_case_dir,
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
    mask_case_dir: Path,
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
        element_masks = _load_element_masks(mask_case_dir, debug_view)
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
                case_dir=mask_case_dir,
                debug_manifest=debug_manifest,
                view=view,
                photo_path=output_photo_path,
                color_summary=color_summary,
            )
        )
    return {
        "caseName": case_name,
        "colorMode": "roof_window_polish",
        "caseDir": _posix(case_dir),
        "categoryConfigs": _serialize_category_configs(category_configs),
        "views": view_payloads,
    }


def _resolve_e28_winner_case(e28_manifest: dict[str, Any]) -> dict[str, Any]:
    decision = e28_manifest.get("decision")
    if not isinstance(decision, dict):
        raise ValueError("E-2.9 expects an E-2.8 decision payload")
    winner_name = decision.get("recommendedForE3")
    if not isinstance(winner_name, str):
        raise ValueError("E-2.9 expects an E-2.8 recommendedForE3 case")
    cases = e28_manifest.get("cases")
    if not isinstance(cases, list):
        raise ValueError("E-2.9 expects an E-2.8 cases list")
    for case in cases:
        if isinstance(case, dict) and case.get("caseName") == winner_name:
            return case
    raise ValueError("E-2.9 could not resolve the E-2.8 winner case")


def _resolve_case_dir_from_payload(manifest_path: Path, case_payload: dict[str, Any]) -> Path:
    case_dir = Path(str(case_payload["caseDir"]))
    if case_dir.is_absolute():
        return case_dir
    if str(case_dir).startswith("outputs"):
        return manifest_path.parent.parent / case_dir.relative_to("outputs")
    return Path.cwd() / case_dir


def _view_category(view_payload: dict[str, Any], category: str) -> dict[str, Any]:
    categories = view_payload.get("evaluation", {}).get("categories", {})
    if not isinstance(categories, dict):
        return {}
    category_payload = categories.get(category)
    return category_payload if isinstance(category_payload, dict) else {}


def _category_score(category_payload: dict[str, Any]) -> float:
    pixel_count = int(category_payload.get("pixelCount", 0))
    if pixel_count <= 0:
        return 0.0
    delta = float(category_payload.get("deltaToTarget", 1.0))
    family_pass = bool(category_payload.get("familyPass"))
    delta_pass = bool(category_payload.get("deltaPass"))
    score = max(0.0, 1.0 - delta)
    if family_pass:
        score += 1.2
    if delta_pass:
        score += 1.0
    return score


def _case_score(case_payload: dict[str, Any], *, source_left_door_delta: float) -> float:
    if case_payload.get("colorMode") != "roof_window_polish":
        return float("-inf")
    views = case_payload.get("views")
    if not isinstance(views, list):
        return float("-inf")
    left = next((view for view in views if view.get("view") == "front_diagonal_left"), {})
    right = next((view for view in views if view.get("view") == "front_diagonal_right"), {})
    left_roof = _view_category(left, "ROOF")
    right_roof = _view_category(right, "ROOF")
    left_window = _view_category(left, "WINDOW")
    right_window = _view_category(right, "WINDOW")
    left_door = _view_category(left, "DOOR")
    left_wall = _view_category(left, "WALL")
    right_wall = _view_category(right, "WALL")
    score = 0.0
    score += 1.6 * _category_score(left_roof)
    score += 1.4 * _category_score(right_roof)
    score += 1.2 * _category_score(left_window)
    score += 1.0 * _category_score(right_window)
    score += 0.6 * _category_score(left_wall)
    score += 0.6 * _category_score(right_wall)
    score += 0.8 * _color_pass_count(left)
    score += 0.4 * _color_pass_count(right)
    left_door_delta = float(left_door.get("deltaToTarget", 1.0)) if left_door else 1.0
    if int(left_door.get("pixelCount", 0)) > 0:
        if left_door_delta <= source_left_door_delta + 0.02:
            score += 0.8
        else:
            score -= 1.5
    return score


def _build_decision(case_payloads: list[dict[str, Any]]) -> dict[str, Any]:
    source_case = next(
        case_payload
        for case_payload in case_payloads
        if case_payload.get("colorMode") == "e28_winner_baseline"
    )
    source_left = next(
        view for view in source_case["views"] if view.get("view") == "front_diagonal_left"
    )
    source_left_door = _view_category(source_left, "DOOR")
    source_left_door_delta = float(source_left_door.get("deltaToTarget", 1.0))
    tuned_cases = [
        case_payload
        for case_payload in case_payloads
        if case_payload.get("colorMode") == "roof_window_polish"
    ]
    scored = sorted(
        (
            (
                case_payload["caseName"],
                _case_score(
                    case_payload,
                    source_left_door_delta=source_left_door_delta,
                ),
            )
            for case_payload in tuned_cases
        ),
        key=lambda item: item[1],
        reverse=True,
    )
    recommended_name = scored[0][0]
    return {
        "recommendedForE3": recommended_name,
        "scoreboard": [{"caseName": case_name, "score": score} for case_name, score in scored],
        "sourceWinnerCase": source_case["caseName"],
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
