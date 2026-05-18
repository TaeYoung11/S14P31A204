"""Generate Phase E-3 combined final matrix artifacts."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from ai_rendering.ifc2img.semantics import extract_ifc_color_summary
from ai_rendering.ifc2img.service import run_ifc2img_photo_pipeline

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_ifc_color_artifact_matrix import _posix  # noqa: E402
from generate_ifc_geometry_color_e2_artifacts import (  # noqa: E402
    VIEWS,
    _load_json,
    _write_contact_sheet,
)
from generate_ifc_geometry_e26_preset_off_baseline import (  # noqa: E402
    DEFAULT_IFC_PATH,
    _load_debug_manifest,
)
from generate_ifc_geometry_e27_color_naturalization import (  # noqa: E402
    _measure_existing_view,
)
from generate_ifc_geometry_e29_roof_window_polish import (  # noqa: E402
    DEFAULT_E28_MANIFEST,
    E29_CASE_CONFIGS,
    _build_tuned_case_payload,
)

DEFAULT_E26_MANIFEST = Path(
    "outputs/ifc_geometry_e26_preset_off_baseline/e26_preset_off_baseline_manifest.json"
)
DEFAULT_E29_MANIFEST = Path(
    "outputs/ifc_geometry_e29_roof_window_polish/e29_roof_window_polish_manifest.json"
)
DEFAULT_OUTPUT_DIR = Path("outputs/ifc_geometry_e3_combined_final_matrix")
MANIFEST_NAME = "e3_combined_final_matrix_manifest.json"
CONTACT_SHEET_NAME = "e3_combined_final_matrix_contact_sheet.png"
METRIC_TABLE_NAME = "e3_combined_final_matrix_metrics.json"

BASELINE_DAY_CASE_NAME = "ifc_minimal_baseline_day"
IMPROVED_DAY_CASE_NAME = "ifc_minimal_post_color_lock_naturalized_from_E2_9_day"
BASELINE_NIGHT_CASE_NAME = "ifc_minimal_baseline_night"
IMPROVED_NIGHT_CASE_NAME = "ifc_minimal_post_color_lock_naturalized_from_E2_9_night"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate E-3 combined DAY/NIGHT final matrix artifacts."
    )
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC_PATH)
    parser.add_argument("--e26-manifest", type=Path, default=DEFAULT_E26_MANIFEST)
    parser.add_argument("--e29-manifest", type=Path, default=DEFAULT_E29_MANIFEST)
    parser.add_argument("--e28-manifest", type=Path, default=DEFAULT_E28_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_geometry_e3_combined_final_matrix(
        ifc_path=args.ifc,
        e26_manifest_path=args.e26_manifest,
        e29_manifest_path=args.e29_manifest,
        e28_manifest_path=args.e28_manifest,
        output_dir=args.output,
    )
    print(f"[geometry-e3] wrote {args.output / MANIFEST_NAME}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_geometry_e3_combined_final_matrix(
    *,
    ifc_path: Path,
    e26_manifest_path: Path,
    e29_manifest_path: Path,
    e28_manifest_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    ifc_path = ifc_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    color_summary = extract_ifc_color_summary(ifc_path)

    e26_manifest = _load_json(e26_manifest_path)
    day_baseline_case = _resolve_day_baseline_case(e26_manifest)
    day_baseline_dir = _resolve_case_dir(e26_manifest_path, day_baseline_case)
    day_baseline_debug_manifest = _load_debug_manifest(day_baseline_dir)

    e29_manifest = _load_json(e29_manifest_path)
    day_improved_case = _resolve_e29_recommended_case(e29_manifest)
    day_improved_dir = _resolve_case_dir(e29_manifest_path, day_improved_case)

    baseline_day_payload = _build_existing_case_payload(
        ifc_path=ifc_path,
        case_name=BASELINE_DAY_CASE_NAME,
        time_of_day="DAY",
        case_dir=day_baseline_dir,
        mask_case_dir=day_baseline_dir,
        debug_manifest=day_baseline_debug_manifest,
        color_summary=color_summary,
        color_mode="baseline",
        post_color_lock_strength=0.0,
        uses_ifc_color_prompt=False,
    )
    improved_day_payload = _build_existing_case_payload(
        ifc_path=ifc_path,
        case_name=IMPROVED_DAY_CASE_NAME,
        time_of_day="DAY",
        case_dir=day_improved_dir,
        mask_case_dir=day_baseline_dir,
        debug_manifest=day_baseline_debug_manifest,
        color_summary=color_summary,
        color_mode=str(day_improved_case.get("colorMode", "roof_window_polish")),
        post_color_lock_strength=_winner_post_color_lock_strength(),
        uses_ifc_color_prompt=False,
    )

    baseline_night_dir, baseline_night_debug_manifest = _generate_baseline_night(
        ifc_path=ifc_path,
        output_dir=output_dir,
    )
    baseline_night_payload = _build_existing_case_payload(
        ifc_path=ifc_path,
        case_name=BASELINE_NIGHT_CASE_NAME,
        time_of_day="NIGHT",
        case_dir=baseline_night_dir,
        mask_case_dir=baseline_night_dir,
        debug_manifest=baseline_night_debug_manifest,
        color_summary=color_summary,
        color_mode="baseline",
        post_color_lock_strength=0.0,
        uses_ifc_color_prompt=False,
    )
    improved_night_payload = _build_improved_night_case_payload(
        ifc_path=ifc_path,
        output_dir=output_dir,
        baseline_night_dir=baseline_night_dir,
        baseline_night_debug_manifest=baseline_night_debug_manifest,
        color_summary=color_summary,
    )

    case_payloads = [
        baseline_day_payload,
        improved_day_payload,
        baseline_night_payload,
        improved_night_payload,
    ]
    contact_sheet_path = output_dir / CONTACT_SHEET_NAME
    _write_contact_sheet(contact_sheet_path, case_payloads)
    metric_table = _build_metric_table(case_payloads)
    metric_table_path = output_dir / METRIC_TABLE_NAME
    metric_table_path.write_text(
        json.dumps(metric_table, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    manifest = {
        "schemaVersion": "ifc2img.geometryE3CombinedFinalMatrix.v1",
        "sourceIfcPath": str(ifc_path),
        "sourceE26Manifest": _posix(e26_manifest_path),
        "sourceE29Manifest": _posix(e29_manifest_path),
        "policy": {
            "preset": "ifc_minimal",
            "koreanHouseHandling": "historical_record_only",
            "geometryMode": "depth_edge",
            "shapeLockPromptUsed": False,
            "ifcColorPromptUsed": False,
        },
        "cases": case_payloads,
        "metricTable": _posix(metric_table_path),
        "contactSheet": _posix(contact_sheet_path),
        "visualReviewPaths": {
            case["caseName"]: {
                "caseDir": case["artifactPaths"]["caseDir"],
                "views": {
                    view_payload["view"]: view_payload["photo"]
                    for view_payload in case["views"]
                },
            }
            for case in case_payloads
        },
        "notes": [
            "E-3 compares only active ifc_minimal baseline and E-2.9 winner variants.",
            "DAY artifacts reuse validated E-2.6 baseline and E-2.9 winner outputs.",
            "NIGHT baseline/improved artifacts are generated under the E-3 combined root.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _resolve_day_baseline_case(e26_manifest: dict[str, Any]) -> dict[str, Any]:
    cases = e26_manifest.get("cases")
    if not isinstance(cases, list):
        raise ValueError("E-3 expects an E-2.6 cases list")
    for case in cases:
        if (
            isinstance(case, dict)
            and case.get("caseName") == "geometry_depth_edge_ifc_minimal_day"
        ):
            return case
    raise ValueError("E-3 could not resolve the E-2.6 DAY baseline case")


def _resolve_e29_recommended_case(e29_manifest: dict[str, Any]) -> dict[str, Any]:
    decision = e29_manifest.get("decision")
    if not isinstance(decision, dict):
        raise ValueError("E-3 expects an E-2.9 decision payload")
    winner_name = decision.get("recommendedForE3")
    if not isinstance(winner_name, str):
        raise ValueError("E-3 expects an E-2.9 recommendedForE3 case")
    cases = e29_manifest.get("cases")
    if not isinstance(cases, list):
        raise ValueError("E-3 expects an E-2.9 cases list")
    for case in cases:
        if isinstance(case, dict) and case.get("caseName") == winner_name:
            return case
    raise ValueError("E-3 could not resolve the E-2.9 winner case")


def _resolve_case_dir(manifest_path: Path, case_payload: dict[str, Any]) -> Path:
    case_dir = Path(str(case_payload["caseDir"]))
    if case_dir.is_absolute():
        return case_dir
    return Path.cwd() / case_dir


def _generate_baseline_night(
    *,
    ifc_path: Path,
    output_dir: Path,
) -> tuple[Path, dict[str, Any]]:
    case_dir = output_dir / BASELINE_NIGHT_CASE_NAME
    job = run_ifc2img_photo_pipeline(
        ifc_path,
        case_dir,
        preset="ifc_minimal",
        time_of_day="NIGHT",
        use_ifc_color_prompt_suffix=False,
        use_ifc_shape_lock_prompt=False,
        geometry_control_input_mode="depth_edge",
        debug_artifacts=True,
    )
    if not job.outputs:
        raise ValueError("E-3 NIGHT baseline generation returned no outputs")
    return case_dir, _load_debug_manifest(case_dir)


def _build_existing_case_payload(
    *,
    ifc_path: Path,
    case_name: str,
    time_of_day: str,
    case_dir: Path,
    mask_case_dir: Path,
    debug_manifest: dict[str, Any],
    color_summary: Any,
    color_mode: str,
    post_color_lock_strength: float,
    uses_ifc_color_prompt: bool,
) -> dict[str, Any]:
    views = [
        _measure_existing_view(
            ifc_path=ifc_path,
            case_dir=mask_case_dir,
            debug_manifest=debug_manifest,
            view=view,
            photo_path=case_dir / f"photo_{view}.png",
            color_summary=color_summary,
        )
        for view in VIEWS
    ]
    return _standardize_case_payload(
        case_name=case_name,
        time_of_day=time_of_day,
        color_mode=color_mode,
        case_dir=case_dir,
        debug_manifest_path=case_dir / "debug" / "debug_manifest.json",
        manifest_path=case_dir / "manifest.json",
        views=views,
        post_color_lock_strength=post_color_lock_strength,
        uses_ifc_color_prompt=uses_ifc_color_prompt,
    )


def _build_improved_night_case_payload(
    *,
    ifc_path: Path,
    output_dir: Path,
    baseline_night_dir: Path,
    baseline_night_debug_manifest: dict[str, Any],
    color_summary: Any,
) -> dict[str, Any]:
    configs = _e29_winner_category_configs()
    payload = _build_tuned_case_payload(
        ifc_path=ifc_path,
        source_case_dir=baseline_night_dir,
        mask_case_dir=baseline_night_dir,
        output_dir=output_dir,
        case_name=IMPROVED_NIGHT_CASE_NAME,
        debug_manifest=baseline_night_debug_manifest,
        color_summary=color_summary,
        category_configs=configs,
    )
    case_dir = output_dir / IMPROVED_NIGHT_CASE_NAME
    return _standardize_case_payload(
        case_name=IMPROVED_NIGHT_CASE_NAME,
        time_of_day="NIGHT",
        color_mode=str(payload.get("colorMode", "roof_window_polish")),
        case_dir=case_dir,
        debug_manifest_path=baseline_night_dir / "debug" / "debug_manifest.json",
        manifest_path=baseline_night_dir / "manifest.json",
        views=list(payload["views"]),
        post_color_lock_strength=_winner_post_color_lock_strength(),
        uses_ifc_color_prompt=False,
        category_configs=payload.get("categoryConfigs"),
    )


def _standardize_case_payload(
    *,
    case_name: str,
    time_of_day: str,
    color_mode: str,
    case_dir: Path,
    debug_manifest_path: Path,
    manifest_path: Path,
    views: list[dict[str, Any]],
    post_color_lock_strength: float,
    uses_ifc_color_prompt: bool,
    category_configs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "caseName": case_name,
        "timeOfDay": time_of_day,
        "geometryMode": "depth_edge",
        "colorMode": color_mode,
        "shapeLockPromptUsed": False,
        "ifcColorPromptUsed": uses_ifc_color_prompt,
        "postColorLockStrength": post_color_lock_strength,
        "artifactPaths": {
            "caseDir": _posix(case_dir),
            "manifest": _posix(manifest_path),
            "debugManifest": _posix(debug_manifest_path),
        },
        "geometryMetrics": _summarize_geometry_metrics(views),
        "colorMetrics": _summarize_color_metrics(views),
        "views": views,
    }
    if category_configs is not None:
        payload["categoryConfigs"] = category_configs
    return payload


def _summarize_geometry_metrics(views: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for view_payload in views:
        geometry = view_payload.get("geometryFidelity")
        if isinstance(geometry, dict):
            summary[str(view_payload["view"])] = geometry
    return summary


def _summarize_color_metrics(views: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for view_payload in views:
        summary[str(view_payload["view"])] = {
            "evaluation": view_payload.get("evaluation"),
            "colorDeltas": view_payload.get("colorDeltas"),
        }
    return summary


def _build_metric_table(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for case in cases:
        for view_payload in case["views"]:
            categories = (
                view_payload.get("evaluation", {}).get("categories", {})
                if isinstance(view_payload.get("evaluation"), dict)
                else {}
            )
            rows.append(
                {
                    "caseName": case["caseName"],
                    "timeOfDay": case["timeOfDay"],
                    "view": view_payload["view"],
                    "geometryMode": case["geometryMode"],
                    "colorMode": case["colorMode"],
                    "shapeLockPromptUsed": case["shapeLockPromptUsed"],
                    "ifcColorPromptUsed": case["ifcColorPromptUsed"],
                    "postColorLockStrength": case["postColorLockStrength"],
                    "estimatedPhotoForegroundFillRatio": (
                        view_payload.get("geometryFidelity", {}).get(
                            "estimatedPhotoForegroundFillRatio"
                        )
                    ),
                    "roofDeltaToTarget": _category_metric(categories, "ROOF", "deltaToTarget"),
                    "wallDeltaToTarget": _category_metric(categories, "WALL", "deltaToTarget"),
                    "windowDeltaToTarget": _category_metric(categories, "WINDOW", "deltaToTarget"),
                    "doorDeltaToTarget": _category_metric(categories, "DOOR", "deltaToTarget"),
                    "roofFamilyPass": _category_metric(categories, "ROOF", "familyPass"),
                    "wallFamilyPass": _category_metric(categories, "WALL", "familyPass"),
                    "windowFamilyPass": _category_metric(categories, "WINDOW", "familyPass"),
                    "doorFamilyPass": _category_metric(categories, "DOOR", "familyPass"),
                    "photo": view_payload.get("photo"),
                }
            )
    return rows


def _category_metric(
    categories: dict[str, Any], category: str, field: str
) -> Any:
    if not isinstance(categories, dict):
        return None
    payload = categories.get(category)
    if not isinstance(payload, dict):
        return None
    return payload.get(field)


def _e29_winner_category_configs() -> dict[str, Any]:
    return E29_CASE_CONFIGS["ifc_minimal_post_color_lock_roof_green_push_balanced_day"]


def _winner_post_color_lock_strength() -> float:
    configs = _e29_winner_category_configs()
    return max(float(config.strength) for config in configs.values())


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "caseCount": len(manifest["cases"]),
        "contactSheet": manifest["contactSheet"],
        "metricTable": manifest["metricTable"],
        "caseNames": [case["caseName"] for case in manifest["cases"]],
    }


if __name__ == "__main__":
    main()
