"""Generate Phase E-2.6 preset-off/minimal IFC baseline artifacts."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from ai_rendering.ifc2img.presets import load_preset
from ai_rendering.ifc2img.semantics import extract_ifc_color_summary
from ai_rendering.ifc2img.service import run_ifc2img_photo_pipeline

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_ifc_color_artifact_matrix import (  # noqa: E402
    _find_debug_view,
    _measure_view_metrics,
    _posix,
)
from generate_ifc_geometry_color_e2_artifacts import (  # noqa: E402
    DEFAULT_D7_MANIFEST,
    DEFAULT_IFC_PATH,
    _load_debug_manifest,
    _load_json,
    _resolve_phase_e_input,
    _write_contact_sheet,
)

DEFAULT_OUTPUT_DIR = Path("outputs/ifc_geometry_e26_preset_off_baseline")
DEFAULT_REFERENCE_MANIFEST = Path(
    "outputs/ifc_geometry_e25_color_recheck/e25_color_recheck_manifest.json"
)
MANIFEST_NAME = "e26_preset_off_baseline_manifest.json"
CONTACT_SHEET_NAME = "e26_preset_off_baseline_contact_sheet.png"
DEFAULT_PRESET = "ifc_minimal"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Phase E-2.6 preset-off baseline artifacts."
    )
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC_PATH)
    parser.add_argument("--d7-manifest", type=Path, default=DEFAULT_D7_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--preset", default=DEFAULT_PRESET)
    parser.add_argument("--time-of-day", default="DAY", choices=("DAY", "NIGHT"))
    parser.add_argument(
        "--korean-reference-manifest",
        type=Path,
        default=DEFAULT_REFERENCE_MANIFEST,
        help="Optional E-2.5 korean_house reference manifest for comparison.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_geometry_e26_preset_off_baseline(
        ifc_path=args.ifc,
        d7_manifest_path=args.d7_manifest,
        output_dir=args.output,
        preset=args.preset,
        time_of_day=args.time_of_day,
        korean_reference_manifest_path=args.korean_reference_manifest,
    )
    manifest_path = args.output / MANIFEST_NAME
    print(f"[geometry-e2.6] wrote {manifest_path}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_geometry_e26_preset_off_baseline(
    *,
    ifc_path: Path,
    d7_manifest_path: Path,
    output_dir: Path,
    preset: str,
    time_of_day: str,
    korean_reference_manifest_path: Path | None,
) -> dict[str, Any]:
    """Render a minimal IFC baseline after D-7 geometry selection."""
    if preset == "korean_house":
        raise ValueError("E-2.6 must run with korean_house disabled")
    ifc_path = ifc_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    d7_manifest = _load_json(d7_manifest_path)
    phase_e_input = _resolve_phase_e_input(d7_manifest)
    color_summary = extract_ifc_color_summary(ifc_path)
    case_name = _case_name(preset, time_of_day)
    case_dir = output_dir / case_name
    job = run_ifc2img_photo_pipeline(
        ifc_path,
        case_dir,
        preset=preset,
        time_of_day=time_of_day,
        use_ifc_color_prompt_suffix=False,
        use_ifc_shape_lock_prompt=False,
        geometry_control_input_mode=phase_e_input["geometryControlInputMode"],
        debug_artifacts=True,
    )
    debug_manifest = _load_debug_manifest(case_dir)
    view_payloads = [
        _measure_e26_view(
            ifc_path=ifc_path,
            case_dir=case_dir,
            debug_manifest=debug_manifest,
            output=output,
            color_summary=color_summary,
        )
        for output in job.outputs
    ]
    case_payload = {
        "caseName": case_name,
        "preset": preset,
        "timeOfDay": time_of_day,
        "geometryMode": phase_e_input["geometryControlInputMode"],
        "useIfcShapeLockPrompt": False,
        "usesPromptColorInjection": False,
        "usesPostColorLockArtifact": False,
        "caseDir": _posix(case_dir),
        "manifest": _posix(job.manifest_path),
        "debugManifest": _posix(case_dir / "debug" / "debug_manifest.json"),
        "views": view_payloads,
    }
    contact_sheet_path = output_dir / CONTACT_SHEET_NAME
    _write_contact_sheet(contact_sheet_path, [case_payload])
    reference_payload = _load_korean_reference(korean_reference_manifest_path)
    manifest = {
        "schemaVersion": "ifc2img.geometryE26PresetOff.v1",
        "sourceIfcPath": str(ifc_path),
        "preset": preset,
        "timeOfDay": time_of_day,
        "phaseEInput": phase_e_input,
        "promptMetadata": _build_prompt_metadata(preset, time_of_day),
        "cases": [case_payload],
        "koreanHouseReference": reference_payload,
        "comparisonToKoreanHouseReference": _compare_to_reference(
            case_payload,
            reference_payload,
        ),
        "contactSheet": _posix(contact_sheet_path),
        "decision": _build_decision(case_payload, reference_payload),
        "notes": [
            "E-2.6 disables korean_house style/color priors by using ifc_minimal.",
            "D-7 geometry_control_input_mode is preserved as depth_edge.",
            "No IFC color prompt or post color lock is applied in this baseline.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _measure_e26_view(
    *,
    ifc_path: Path,
    case_dir: Path,
    debug_manifest: dict[str, Any],
    output: Any,
    color_summary: Any,
) -> dict[str, Any]:
    debug_view = _find_debug_view(debug_manifest, output.view)
    metrics = _measure_view_metrics(
        ifc_path=ifc_path,
        case_dir=case_dir,
        debug_view=debug_view,
        photo_path=output.photo_path,
        color_summary=color_summary,
        apply_post_color_lock=False,
        post_color_lock_strength=0.0,
    )
    metrics["geometryFidelity"] = debug_view.get("geometryFidelity")
    return metrics


def _build_prompt_metadata(preset: str, time_of_day: str) -> dict[str, Any]:
    params = load_preset(preset, time_of_day.lower())
    prompt_lower = params.prompt.lower()
    forbidden_cues = [
        "korean house",
        "white concrete facade",
        "simple tile roof",
        "subtle brick trim",
    ]
    return {
        "preset": preset,
        "prompt": params.prompt,
        "negativePrompt": params.negative_prompt,
        "promptWordCount": _word_count(params.prompt),
        "negativePromptWordCount": _word_count(params.negative_prompt),
        "hasKoreanHouseStyleCue": any(cue in prompt_lower for cue in forbidden_cues),
        "forbiddenStyleCues": forbidden_cues,
    }


def _load_korean_reference(path: Path | None) -> dict[str, Any] | None:
    if path is None or not path.exists():
        return None
    manifest = _load_json(path)
    cases = manifest.get("cases", [])
    if not isinstance(cases, list):
        return None
    for case in cases:
        if (
            isinstance(case, dict)
            and case.get("caseName") == "geometry_depth_edge_reference_day"
        ):
            return case
    return None


def _compare_to_reference(
    case_payload: dict[str, Any],
    reference_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    if reference_payload is None:
        return {"available": False}
    return {
        "available": True,
        "currentCaseName": case_payload["caseName"],
        "referenceCaseName": reference_payload.get("caseName"),
        "views": [
            _compare_view_to_reference(view_payload, reference_payload)
            for view_payload in case_payload["views"]
        ],
    }


def _compare_view_to_reference(
    view_payload: dict[str, Any],
    reference_payload: dict[str, Any],
) -> dict[str, Any]:
    view = view_payload.get("view")
    reference_view = _find_case_view(reference_payload, str(view))
    return {
        "view": view,
        "currentColorPassCount": _color_pass_count(view_payload),
        "referenceColorPassCount": (
            _color_pass_count(reference_view) if reference_view else None
        ),
        "currentBuildingFillRatio": _building_fill_ratio(view_payload),
        "referenceBuildingFillRatio": (
            _building_fill_ratio(reference_view) if reference_view else None
        ),
    }


def _find_case_view(case_payload: dict[str, Any], view: str) -> dict[str, Any] | None:
    for view_payload in case_payload.get("views", []):
        if isinstance(view_payload, dict) and view_payload.get("view") == view:
            return view_payload
    return None


def _color_pass_count(view_payload: dict[str, Any]) -> int:
    categories = (
        view_payload.get("evaluation", {})
        .get("categories", {})
    )
    if not isinstance(categories, dict):
        return 0
    return sum(
        1
        for payload in categories.values()
        if isinstance(payload, dict)
        and int(payload.get("pixelCount", 0)) > 0
        and payload.get("familyPass")
        and payload.get("deltaPass")
    )


def _building_fill_ratio(view_payload: dict[str, Any]) -> float | None:
    geometry = view_payload.get("geometryFidelity")
    if not isinstance(geometry, dict):
        return None
    ratio = geometry.get("estimatedPhotoForegroundFillRatio")
    if ratio is None:
        ratio = geometry.get("buildingPixelCoverage")
    return float(ratio) if isinstance(ratio, int | float) else None


def _build_decision(
    case_payload: dict[str, Any],
    reference_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    has_style_cue = False
    if reference_payload is not None:
        has_style_cue = True
    return {
        "presetOffBaseline": "created",
        "nextPhase": "E-2.7 post color lock feathering should use this baseline",
        "koreanHouseDisabled": True,
        "referenceAvailable": reference_payload is not None,
        "referenceHadKoreanHousePreset": has_style_cue,
        "reason": (
            "Use ifc_minimal as the next color/naturalization baseline so hard "
            "korean_house style and color priors do not mask IFC color behavior."
        ),
        "caseName": case_payload["caseName"],
    }


def _case_name(preset: str, time_of_day: str) -> str:
    return f"geometry_depth_edge_{preset}_{time_of_day.lower()}"


def _word_count(prompt: str) -> int:
    return len(prompt.replace(",", " ").split())


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    case = manifest["cases"][0]
    return {
        "caseName": case["caseName"],
        "preset": manifest["preset"],
        "timeOfDay": manifest["timeOfDay"],
        "geometryMode": manifest["phaseEInput"]["geometryControlInputMode"],
        "promptWords": manifest["promptMetadata"]["promptWordCount"],
        "hasKoreanHouseStyleCue": manifest["promptMetadata"]["hasKoreanHouseStyleCue"],
        "contactSheet": manifest["contactSheet"],
    }


if __name__ == "__main__":
    main()
