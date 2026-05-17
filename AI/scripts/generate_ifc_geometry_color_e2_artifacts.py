"""Generate Phase E-2 color candidates on top of the D-7 geometry winner."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from ai_rendering.ifc2img.semantics import extract_ifc_color_summary
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


DEFAULT_IFC_PATH = Path("packages/ai-rendering/tests/fixtures/ifc/shinchan.ifc")
DEFAULT_D7_MANIFEST = Path(
    "outputs/ifc_geometry_d7_winner/geometry_winner_manifest.json"
)
DEFAULT_OUTPUT_DIR = Path("outputs/ifc_geometry_e2_color_candidates")
MATRIX_MANIFEST_NAME = "e2_color_candidate_manifest.json"
CONTACT_SHEET_NAME = "e2_color_candidate_contact_sheet.png"
VIEWS = ("front_diagonal_left", "front_diagonal_right")


@dataclass(frozen=True)
class GeometryColorE2Case:
    case_name: str
    color_mode: str
    use_ifc_color_prompt_suffix: bool
    use_ifc_color_composite_probe: bool
    use_post_color_lock: bool
    post_color_lock_strength: float


E2_CASES: tuple[GeometryColorE2Case, ...] = (
    GeometryColorE2Case(
        case_name="geometry_depth_edge",
        color_mode="none",
        use_ifc_color_prompt_suffix=False,
        use_ifc_color_composite_probe=False,
        use_post_color_lock=False,
        post_color_lock_strength=0.0,
    ),
    GeometryColorE2Case(
        case_name="geometry_depth_edge_color_prompt",
        color_mode="prompt",
        use_ifc_color_prompt_suffix=True,
        use_ifc_color_composite_probe=False,
        use_post_color_lock=False,
        post_color_lock_strength=0.0,
    ),
    GeometryColorE2Case(
        case_name="geometry_depth_edge_color_composite_probe",
        color_mode="composite_probe",
        use_ifc_color_prompt_suffix=False,
        use_ifc_color_composite_probe=True,
        use_post_color_lock=False,
        post_color_lock_strength=0.0,
    ),
    GeometryColorE2Case(
        case_name="geometry_depth_edge_post_color_lock",
        color_mode="post_color_lock",
        use_ifc_color_prompt_suffix=False,
        use_ifc_color_composite_probe=False,
        use_post_color_lock=True,
        post_color_lock_strength=1.0,
    ),
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Phase E-2 color candidates with D-7 geometry locked."
    )
    parser.add_argument(
        "--ifc",
        type=Path,
        default=DEFAULT_IFC_PATH,
        help=f"Input IFC path. Defaults to {DEFAULT_IFC_PATH}.",
    )
    parser.add_argument(
        "--d7-manifest",
        type=Path,
        default=DEFAULT_D7_MANIFEST,
        help=f"D-7 winner manifest. Defaults to {DEFAULT_D7_MANIFEST}.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory. Defaults to {DEFAULT_OUTPUT_DIR}.",
    )
    parser.add_argument("--preset", default="korean_house")
    parser.add_argument("--time-of-day", default="DAY", choices=("DAY", "NIGHT"))
    parser.add_argument(
        "--post-color-lock-strength",
        type=float,
        default=1.0,
        help="Artifact-only post color lock blend strength in the 0.0-1.0 range.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_geometry_color_e2_artifacts(
        ifc_path=args.ifc,
        d7_manifest_path=args.d7_manifest,
        output_dir=args.output,
        preset=args.preset,
        time_of_day=args.time_of_day,
        post_color_lock_strength=args.post_color_lock_strength,
    )
    manifest_path = args.output / MATRIX_MANIFEST_NAME
    print(f"[geometry-e2] wrote {manifest_path}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_geometry_color_e2_artifacts(
    *,
    ifc_path: Path,
    d7_manifest_path: Path,
    output_dir: Path,
    preset: str,
    time_of_day: str,
    post_color_lock_strength: float,
) -> dict[str, Any]:
    """Generate color candidate artifacts with geometry locked to D-7 winner."""
    ifc_path = ifc_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    d7_manifest = _load_json(d7_manifest_path)
    phase_e_input = _resolve_phase_e_input(d7_manifest)
    color_summary = extract_ifc_color_summary(ifc_path)

    cases = _cases_with_strength(post_color_lock_strength)
    case_payloads: list[dict[str, Any]] = []
    for case in cases:
        case_dir = output_dir / f"{case.case_name}_{time_of_day.lower()}"
        job = run_ifc2img_photo_pipeline(
            ifc_path,
            case_dir,
            preset=preset,
            time_of_day=time_of_day,
            use_ifc_color_prompt_suffix=case.use_ifc_color_prompt_suffix,
            use_ifc_shape_lock_prompt=False,
            geometry_control_input_mode=phase_e_input["geometryControlInputMode"],
            debug_artifacts=True,
        )
        debug_manifest = _load_debug_manifest(case_dir)
        view_payloads = []
        for output in job.outputs:
            debug_view = _find_debug_view(debug_manifest, output.view)
            view_payloads.append(
                _measure_view_metrics(
                    ifc_path=ifc_path,
                    case_dir=case_dir,
                    debug_view=debug_view,
                    photo_path=output.photo_path,
                    color_summary=color_summary,
                    apply_post_color_lock=case.use_post_color_lock,
                    post_color_lock_strength=case.post_color_lock_strength,
                )
            )
        case_payloads.append(
            {
                "caseName": f"{case.case_name}_{time_of_day.lower()}",
                "colorMode": case.color_mode,
                "timeOfDay": time_of_day,
                "geometryMode": phase_e_input["geometryControlInputMode"],
                "useIfcShapeLockPrompt": False,
                "usesPromptColorInjection": case.use_ifc_color_prompt_suffix,
                "usesIfcColorCompositeProbe": case.use_ifc_color_composite_probe,
                "usesPostColorLockArtifact": case.use_post_color_lock,
                "postColorLockStrength": case.post_color_lock_strength,
                "caseDir": _posix(case_dir),
                "manifest": _posix(job.manifest_path),
                "debugManifest": _posix(case_dir / "debug" / "debug_manifest.json"),
                "views": view_payloads,
            }
        )

    contact_sheet_path = output_dir / CONTACT_SHEET_NAME
    _write_contact_sheet(contact_sheet_path, case_payloads)
    manifest = {
        "schemaVersion": "ifc2img.geometryColorE2.v1",
        "sourceIfcPath": str(ifc_path),
        "preset": preset,
        "timeOfDay": time_of_day,
        "geometryWinner": d7_manifest.get("winner", {}),
        "phaseEInput": phase_e_input,
        "cases": case_payloads,
        "dayNightFamilyConsistency": _build_day_night_consistency(case_payloads),
        "contactSheet": _posix(contact_sheet_path),
        "notes": [
            "All E-2 cases lock geometry_control_input_mode to the D-7 winner.",
            "use_ifc_shape_lock_prompt stays false for all E-2 color candidates.",
            "The color composite probe records debug artifacts only; it is not a "
            "production ControlNet input switch.",
        ],
    }
    (output_dir / MATRIX_MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _resolve_phase_e_input(d7_manifest: dict[str, Any]) -> dict[str, Any]:
    phase_e_input = d7_manifest.get("phaseEInput")
    if not isinstance(phase_e_input, dict):
        raise ValueError("D-7 manifest has no phaseEInput payload")
    geometry_mode = phase_e_input.get("geometryControlInputMode")
    use_shape_lock = phase_e_input.get("useIfcShapeLockPrompt")
    if geometry_mode != "depth_edge":
        raise ValueError(
            "Phase E-2 expects D-7 geometryControlInputMode='depth_edge', "
            f"got {geometry_mode!r}"
        )
    if use_shape_lock:
        raise ValueError("Phase E-2 expects useIfcShapeLockPrompt=false")
    return {
        "geometryControlInputMode": "depth_edge",
        "useIfcShapeLockPrompt": False,
        "caseDir": phase_e_input.get("caseDir"),
        "debugManifestPath": phase_e_input.get("debugManifestPath"),
        "photos": phase_e_input.get("photos", []),
    }


def _cases_with_strength(
    post_color_lock_strength: float,
) -> tuple[GeometryColorE2Case, ...]:
    return tuple(
        GeometryColorE2Case(
            case_name=case.case_name,
            color_mode=case.color_mode,
            use_ifc_color_prompt_suffix=case.use_ifc_color_prompt_suffix,
            use_ifc_color_composite_probe=case.use_ifc_color_composite_probe,
            use_post_color_lock=case.use_post_color_lock,
            post_color_lock_strength=(
                post_color_lock_strength
                if case.use_post_color_lock
                else case.post_color_lock_strength
            ),
        )
        for case in E2_CASES
    )


def _load_debug_manifest(case_dir: Path) -> dict[str, Any]:
    return _load_json(case_dir / "debug" / "debug_manifest.json")


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_contact_sheet(
    output_path: Path,
    cases: list[dict[str, Any]],
) -> None:
    thumb_size = (320, 192)
    label_height = 36
    padding = 12
    width = padding + len(VIEWS) * (thumb_size[0] + padding)
    height = padding + len(cases) * (thumb_size[1] + label_height + padding)
    sheet = Image.new("RGB", (width, height), (245, 245, 245))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for row_index, case in enumerate(cases):
        y = padding + row_index * (thumb_size[1] + label_height + padding)
        draw.text((padding, y), str(case["caseName"]), fill=(20, 20, 20), font=font)
        photos_by_view = _photos_by_view(case)
        for col_index, view in enumerate(VIEWS):
            x = padding + col_index * (thumb_size[0] + padding)
            draw.text((x, y + 16), view, fill=(40, 40, 40), font=font)
            photo_path = photos_by_view.get(view)
            if photo_path is None or not photo_path.exists():
                draw.rectangle(
                    (x, y + label_height, x + thumb_size[0], y + label_height + thumb_size[1]),
                    fill=(220, 220, 220),
                )
                continue
            with Image.open(photo_path) as image:
                thumb = image.convert("RGB")
                thumb.thumbnail(thumb_size)
                paste_x = x + (thumb_size[0] - thumb.width) // 2
                paste_y = y + label_height + (thumb_size[1] - thumb.height) // 2
                sheet.paste(thumb, (paste_x, paste_y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, format="PNG")


def _photos_by_view(case: dict[str, Any]) -> dict[str, Path]:
    photos: dict[str, Path] = {}
    for view_payload in case.get("views", []):
        if not isinstance(view_payload, dict):
            continue
        view = str(view_payload.get("view", ""))
        photo = view_payload.get("measuredPhoto") or view_payload.get("photo")
        if view and isinstance(photo, str):
            photos[view] = Path(photo)
    return photos


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "geometryMode": manifest["phaseEInput"]["geometryControlInputMode"],
        "useIfcShapeLockPrompt": manifest["phaseEInput"]["useIfcShapeLockPrompt"],
        "caseCount": len(manifest["cases"]),
        "contactSheet": manifest["contactSheet"],
    }


if __name__ == "__main__":
    main()
