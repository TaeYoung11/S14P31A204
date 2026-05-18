"""Generate Phase E-2.5 compact color prompt and post color lock recheck artifacts."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_rendering.ifc2img.presets import load_preset
from ai_rendering.ifc2img.semantics import (
    build_ifc_color_prompt_suffix,
    build_ifc_compact_color_prompt_suffix,
    compact_ifc_color_base_prompt,
    extract_ifc_color_summary,
    inject_ifc_color_prompt,
    remove_ifc_color_conflicting_prompt_terms,
    select_ifc_color_summary_category_cues,
)
from ai_rendering.ifc2img.service import run_ifc2img_photo_pipeline

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_ifc_color_artifact_matrix import (  # noqa: E402
    _build_day_night_consistency,
    _find_debug_view,
    _measure_view_metrics,
    _posix,
)
from generate_ifc_geometry_color_e2_artifacts import (  # noqa: E402
    DEFAULT_D7_MANIFEST,
    DEFAULT_IFC_PATH,
    VIEWS,
    _load_debug_manifest,
    _load_json,
    _resolve_phase_e_input,
    _write_contact_sheet,
)

DEFAULT_OUTPUT_DIR = Path("outputs/ifc_geometry_e25_color_recheck")
MANIFEST_NAME = "e25_color_recheck_manifest.json"
CONTACT_SHEET_NAME = "e25_color_recheck_contact_sheet.png"


@dataclass(frozen=True)
class GeometryColorE25Case:
    case_name: str
    color_mode: str
    use_ifc_color_prompt_suffix: bool
    ifc_color_prompt_style: str
    use_post_color_lock: bool
    post_color_lock_strength: float
    render_source: str


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Phase E-2.5 color prompt/post-lock recheck artifacts."
    )
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC_PATH)
    parser.add_argument("--d7-manifest", type=Path, default=DEFAULT_D7_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--preset", default="korean_house")
    parser.add_argument("--time-of-day", default="DAY", choices=("DAY", "NIGHT"))
    parser.add_argument(
        "--post-color-lock-strengths",
        type=float,
        nargs="+",
        default=[0.5, 0.75, 1.0],
        help="Artifact-only post color lock strengths to compare.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_geometry_color_e25_recheck(
        ifc_path=args.ifc,
        d7_manifest_path=args.d7_manifest,
        output_dir=args.output,
        preset=args.preset,
        time_of_day=args.time_of_day,
        post_color_lock_strengths=tuple(args.post_color_lock_strengths),
    )
    manifest_path = args.output / MANIFEST_NAME
    print(f"[geometry-e2.5] wrote {manifest_path}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_geometry_color_e25_recheck(
    *,
    ifc_path: Path,
    d7_manifest_path: Path,
    output_dir: Path,
    preset: str,
    time_of_day: str,
    post_color_lock_strengths: tuple[float, ...],
) -> dict[str, Any]:
    """Run compact prompt and post color lock comparisons after E-2."""
    ifc_path = ifc_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    d7_manifest = _load_json(d7_manifest_path)
    phase_e_input = _resolve_phase_e_input(d7_manifest)
    color_summary = extract_ifc_color_summary(ifc_path)
    prompt_metadata = _build_prompt_metadata(
        color_summary=color_summary,
        preset=preset,
        time_of_day=time_of_day,
    )

    case_payloads: list[dict[str, Any]] = []
    reference_case = GeometryColorE25Case(
        case_name=f"geometry_depth_edge_reference_{time_of_day.lower()}",
        color_mode="none",
        use_ifc_color_prompt_suffix=False,
        ifc_color_prompt_style="default",
        use_post_color_lock=False,
        post_color_lock_strength=0.0,
        render_source="rendered",
    )
    compact_case = GeometryColorE25Case(
        case_name=f"geometry_depth_edge_color_prompt_compact_{time_of_day.lower()}",
        color_mode="compact_prompt",
        use_ifc_color_prompt_suffix=True,
        ifc_color_prompt_style="compact",
        use_post_color_lock=False,
        post_color_lock_strength=0.0,
        render_source="rendered",
    )
    for case in (reference_case, compact_case):
        case_payloads.append(
            _render_case(
                ifc_path=ifc_path,
                output_dir=output_dir,
                preset=preset,
                time_of_day=time_of_day,
                phase_e_input=phase_e_input,
                color_summary=color_summary,
                case=case,
            )
        )

    reference_payload = case_payloads[0]
    for strength in _normalized_strengths(post_color_lock_strengths):
        case = GeometryColorE25Case(
            case_name=_post_lock_case_name(time_of_day, strength),
            color_mode="post_color_lock",
            use_ifc_color_prompt_suffix=False,
            ifc_color_prompt_style="default",
            use_post_color_lock=True,
            post_color_lock_strength=strength,
            render_source="reference_copy",
        )
        case_payloads.append(
            _copy_reference_and_measure_post_lock(
                output_dir=output_dir,
                ifc_path=ifc_path,
                color_summary=color_summary,
                reference_payload=reference_payload,
                case=case,
            )
        )

    contact_sheet_path = output_dir / CONTACT_SHEET_NAME
    _write_contact_sheet(contact_sheet_path, case_payloads)
    decision = _build_e25_decision(case_payloads)
    manifest = {
        "schemaVersion": "ifc2img.geometryColorE25.v1",
        "sourceIfcPath": str(ifc_path),
        "preset": preset,
        "timeOfDay": time_of_day,
        "geometryWinner": d7_manifest.get("winner", {}),
        "phaseEInput": phase_e_input,
        "promptMetadata": prompt_metadata,
        "cases": case_payloads,
        "decision": decision,
        "dayNightFamilyConsistency": _build_day_night_consistency(case_payloads),
        "contactSheet": _posix(contact_sheet_path),
        "notes": [
            "Compact color prompt is evaluated as a reference candidate only.",
            "Post color lock strengths reuse the same reference render for fair comparison.",
            "Production default and worker payload remain unchanged.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _render_case(
    *,
    ifc_path: Path,
    output_dir: Path,
    preset: str,
    time_of_day: str,
    phase_e_input: dict[str, Any],
    color_summary: Any,
    case: GeometryColorE25Case,
) -> dict[str, Any]:
    case_dir = output_dir / case.case_name
    job = run_ifc2img_photo_pipeline(
        ifc_path,
        case_dir,
        preset=preset,
        time_of_day=time_of_day,
        use_ifc_color_prompt_suffix=case.use_ifc_color_prompt_suffix,
        ifc_color_prompt_style=case.ifc_color_prompt_style,  # type: ignore[arg-type]
        use_ifc_shape_lock_prompt=False,
        geometry_control_input_mode=phase_e_input["geometryControlInputMode"],
        debug_artifacts=True,
    )
    debug_manifest = _load_debug_manifest(case_dir)
    view_payloads = [
        _measure_view_metrics(
            ifc_path=ifc_path,
            case_dir=case_dir,
            debug_view=_find_debug_view(debug_manifest, output.view),
            photo_path=output.photo_path,
            color_summary=color_summary,
            apply_post_color_lock=case.use_post_color_lock,
            post_color_lock_strength=case.post_color_lock_strength,
        )
        for output in job.outputs
    ]
    return _case_payload(
        case=case,
        case_dir=case_dir,
        manifest_path=job.manifest_path,
        debug_manifest_path=case_dir / "debug" / "debug_manifest.json",
        view_payloads=view_payloads,
    )


def _copy_reference_and_measure_post_lock(
    *,
    output_dir: Path,
    ifc_path: Path,
    color_summary: Any,
    reference_payload: dict[str, Any],
    case: GeometryColorE25Case,
) -> dict[str, Any]:
    source_dir = Path(str(reference_payload["caseDir"]))
    case_dir = output_dir / case.case_name
    case_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_dir / "manifest.json", case_dir / "manifest.json")
    shutil.copytree(source_dir / "debug", case_dir / "debug", dirs_exist_ok=True)
    for view in VIEWS:
        filename = f"photo_{view}.png"
        shutil.copy2(source_dir / filename, case_dir / filename)
    debug_manifest = _load_debug_manifest(case_dir)
    view_payloads = []
    for view in VIEWS:
        debug_view = _find_debug_view(debug_manifest, view)
        view_payloads.append(
            _measure_view_metrics(
                ifc_path=ifc_path,
                case_dir=case_dir,
                debug_view=debug_view,
                photo_path=case_dir / f"photo_{view}.png",
                color_summary=color_summary,
                apply_post_color_lock=True,
                post_color_lock_strength=case.post_color_lock_strength,
            )
        )
    return _case_payload(
        case=case,
        case_dir=case_dir,
        manifest_path=case_dir / "manifest.json",
        debug_manifest_path=case_dir / "debug" / "debug_manifest.json",
        view_payloads=view_payloads,
    )


def _case_payload(
    *,
    case: GeometryColorE25Case,
    case_dir: Path,
    manifest_path: Path,
    debug_manifest_path: Path,
    view_payloads: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "caseName": case.case_name,
        "colorMode": case.color_mode,
        "renderSource": case.render_source,
        "usesPromptColorInjection": case.use_ifc_color_prompt_suffix,
        "ifcColorPromptStyle": case.ifc_color_prompt_style,
        "usesPostColorLockArtifact": case.use_post_color_lock,
        "postColorLockStrength": case.post_color_lock_strength,
        "caseDir": _posix(case_dir),
        "manifest": _posix(manifest_path),
        "debugManifest": _posix(debug_manifest_path),
        "views": view_payloads,
    }


def _build_prompt_metadata(
    *,
    color_summary: Any,
    preset: str,
    time_of_day: str,
) -> dict[str, Any]:
    base_prompt = load_preset(preset, time_of_day.lower()).prompt
    color_cues = select_ifc_color_summary_category_cues(color_summary)
    color_safe_prompt = remove_ifc_color_conflicting_prompt_terms(
        base_prompt,
        color_cues,
    )
    default_suffix = build_ifc_color_prompt_suffix(color_summary)
    compact_suffix = build_ifc_compact_color_prompt_suffix(color_summary)
    default_prompt = inject_ifc_color_prompt(color_safe_prompt, default_suffix)
    compact_base_prompt = compact_ifc_color_base_prompt(color_safe_prompt)
    compact_prompt = inject_ifc_color_prompt(compact_base_prompt, compact_suffix)
    return {
        "basePromptWordCount": _word_count(base_prompt),
        "colorSafePromptWordCount": _word_count(color_safe_prompt),
        "compactBasePromptWordCount": _word_count(compact_base_prompt),
        "defaultColorPrompt": default_suffix,
        "defaultColorPromptWordCount": _word_count(default_suffix),
        "compactColorPrompt": compact_suffix,
        "compactColorPromptWordCount": _word_count(compact_suffix),
        "defaultInjectedPromptWordCount": _word_count(default_prompt),
        "compactInjectedPromptWordCount": _word_count(compact_prompt),
        "compactPromptWithin77WordBudget": _word_count(compact_prompt) <= 77,
    }


def _build_e25_decision(cases: list[dict[str, Any]]) -> dict[str, Any]:
    post_lock_cases = [
        case
        for case in cases
        if case.get("usesPostColorLockArtifact") is True
    ]
    passing_strengths = [
        case["postColorLockStrength"]
        for case in post_lock_cases
        if _case_measurable_categories_pass(case)
    ]
    recommended_strength = min(passing_strengths) if passing_strengths else None
    return {
        "compactColorPrompt": "reference_only",
        "postColorLock": "candidate" if recommended_strength is not None else "needs_review",
        "recommendedPostColorLockStrength": recommended_strength,
        "reason": (
            "Use the lowest post color lock strength that passes measurable category "
            "color checks; keep compact prompt out of the default E-3 matrix unless "
            "visual review says it helps."
        ),
    }


def _case_measurable_categories_pass(case: dict[str, Any]) -> bool:
    for view in case.get("views", []):
        if not isinstance(view, dict):
            continue
        evaluation = view.get("evaluation")
        if not isinstance(evaluation, dict):
            return False
        categories = evaluation.get("categories")
        if not isinstance(categories, dict):
            return False
        for category_payload in categories.values():
            if not isinstance(category_payload, dict):
                continue
            if int(category_payload.get("pixelCount", 0)) <= 0:
                continue
            if not category_payload.get("familyPass"):
                return False
            if not category_payload.get("deltaPass"):
                return False
    return True


def _normalized_strengths(strengths: tuple[float, ...]) -> tuple[float, ...]:
    normalized = sorted({round(max(0.0, min(1.0, strength)), 2) for strength in strengths})
    return tuple(normalized or [1.0])


def _post_lock_case_name(time_of_day: str, strength: float) -> str:
    strength_key = f"{strength:.2f}".replace(".", "_")
    return f"geometry_depth_edge_post_color_lock_{strength_key}_{time_of_day.lower()}"


def _word_count(prompt: str) -> int:
    return len(prompt.replace(",", " ").split())


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "caseCount": len(manifest["cases"]),
        "compactPromptWords": manifest["promptMetadata"]["compactColorPromptWordCount"],
        "compactPromptWithin77WordBudget": manifest["promptMetadata"][
            "compactPromptWithin77WordBudget"
        ],
        "recommendedPostColorLockStrength": manifest["decision"][
            "recommendedPostColorLockStrength"
        ],
        "contactSheet": manifest["contactSheet"],
    }


if __name__ == "__main__":
    main()
