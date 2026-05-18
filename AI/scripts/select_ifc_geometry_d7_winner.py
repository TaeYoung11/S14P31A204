"""Select the Phase D-7 IFC geometry winner from D-6/D-6.5 artifacts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


DEFAULT_D6_DIR = Path("outputs/ifc_geometry_d6_matrix")
DEFAULT_D65_DIR = Path("outputs/ifc_geometry_d65_shape_lock_recheck")
DEFAULT_OUTPUT_DIR = Path("outputs/ifc_geometry_d7_winner")
MANIFEST_NAME = "geometry_winner_manifest.json"
CONTACT_SHEET_NAME = "d7_geometry_winner_contact_sheet.png"
VIEWS = ("front_diagonal_left", "front_diagonal_right")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Select the Phase D-7 geometry winner from existing artifacts."
    )
    parser.add_argument(
        "--d6-dir",
        type=Path,
        default=DEFAULT_D6_DIR,
        help=f"Phase D-6 matrix output directory. Defaults to {DEFAULT_D6_DIR}.",
    )
    parser.add_argument(
        "--d65-dir",
        type=Path,
        default=DEFAULT_D65_DIR,
        help=f"Phase D-6.5 recheck output directory. Defaults to {DEFAULT_D65_DIR}.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Phase D-7 decision output directory. Defaults to {DEFAULT_OUTPUT_DIR}.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = select_ifc_geometry_d7_winner(
        d6_dir=args.d6_dir,
        d65_dir=args.d65_dir,
        output_dir=args.output,
    )
    manifest_path = args.output / MANIFEST_NAME
    print(f"[geometry-d7] wrote {manifest_path}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def select_ifc_geometry_d7_winner(
    *,
    d6_dir: Path,
    d65_dir: Path,
    output_dir: Path,
) -> dict[str, Any]:
    """Write a D-7 decision manifest without changing production defaults."""
    d6_dir = d6_dir.resolve()
    d65_dir = d65_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    d6_manifest = _load_json(d6_dir / "matrix_manifest.json")
    d65_manifest = _load_json(d65_dir / "matrix_manifest.json")
    d65_delta = _load_json(d65_dir / "d65_metric_delta.json")

    case_index = {
        str(case["caseName"]): case
        for case in [*d6_manifest.get("cases", []), *d65_manifest.get("cases", [])]
    }
    metrics_by_case = _group_metrics_by_case(d65_delta)

    winner_case = "depth_edge_control"
    reference_case = "depth_edge_control_plus_shape_lock_compressed"
    fallback_case = "baseline_default"

    required_cases = (winner_case, reference_case, fallback_case)
    missing = [case for case in required_cases if case not in case_index]
    if missing:
        raise FileNotFoundError(
            "missing D-7 source case(s): " + ", ".join(sorted(missing))
        )

    contact_sheet_path = output_dir / CONTACT_SHEET_NAME
    _write_contact_sheet(
        contact_sheet_path,
        [
            ("fallback", case_index[fallback_case]),
            ("winner", case_index[winner_case]),
            ("reference", case_index[reference_case]),
        ],
    )

    manifest = {
        "schemaVersion": "ifc2img.geometryD7Winner.v1",
        "sourceIfcPath": d65_manifest.get("sourceIfcPath")
        or d6_manifest.get("sourceIfcPath"),
        "preset": d65_manifest.get("preset") or d6_manifest.get("preset"),
        "timeOfDay": d65_manifest.get("timeOfDay") or d6_manifest.get("timeOfDay"),
        "cudaAvailable": bool(
            d65_manifest.get("cudaAvailable", d6_manifest.get("cudaAvailable", False))
        ),
        "winner": _case_decision_payload(
            case_index[winner_case],
            role="winner",
            decision="selected_for_phase_e",
            metrics=metrics_by_case.get(winner_case, {}),
            reasons=[
                "No shape-lock token truncation risk.",
                "Keeps the geometry control hook simple: depth_edge only.",
                "D-6.5 preserved the right-view edgeAlignmentScore improvement.",
                "More stable than compressed shape lock for D-7 production candidate.",
            ],
        ),
        "referenceCandidates": [
            _case_decision_payload(
                case_index[reference_case],
                role="reference",
                decision="held_reference_only",
                metrics=metrics_by_case.get(reference_case, {}),
                reasons=[
                    "Token warning was removed after compression.",
                    "Right-view silhouette improvement from D-6 was not preserved.",
                    "Left view does not regress badly, but the prompt no longer adds enough value.",
                ],
            )
        ],
        "fallback": _case_decision_payload(
            case_index[fallback_case],
            role="fallback",
            decision="keep_default_fallback",
            metrics={},
            reasons=[
                "Default depth-only path remains available.",
                "Worker public payload and production default are unchanged.",
            ],
        ),
        "rejectedCandidates": [
            {
                "caseName": "depth_edge_control_plus_shape_lock",
                "decision": "rejected",
                "source": _posix(d6_dir / "depth_edge_control_plus_shape_lock"),
                "reason": "D-6 artifact had CLIP token truncation warning.",
            },
            {
                "caseName": "element_composite_control",
                "decision": "held",
                "source": _posix(d6_dir / "element_composite_control"),
                "reason": "Segmentation-like control is still a model/input-contract risk.",
            },
            {
                "caseName": "element_composite_control_plus_shape_lock",
                "decision": "held",
                "source": _posix(d6_dir / "element_composite_control_plus_shape_lock"),
                "reason": "Combines element composite risk with shape prompt risk.",
            },
            {
                "caseName": "shape_lock_only",
                "decision": "rejected",
                "source": _posix(d6_dir / "shape_lock_only"),
                "reason": "Prompt-only geometry preservation is weaker than control input.",
            },
        ],
        "phaseEInput": {
            "geometryControlInputMode": "depth_edge",
            "useIfcShapeLockPrompt": False,
            "caseDir": case_index[winner_case]["caseDir"],
            "debugManifestPath": case_index[winner_case]["debugManifestPath"],
            "photos": case_index[winner_case].get("photos", []),
        },
        "contactSheet": _posix(contact_sheet_path),
        "notes": [
            "D-7 selects an internal/shinchan geometry candidate, not a production default change.",
            "Phase E must evaluate color preservation on top of this geometry winner.",
            "Foreground fill ratio remains a reference-only metric.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _case_decision_payload(
    case: dict[str, Any],
    *,
    role: str,
    decision: str,
    metrics: dict[str, dict[str, float]],
    reasons: list[str],
) -> dict[str, Any]:
    return {
        "caseName": case["caseName"],
        "role": role,
        "decision": decision,
        "geometryControlInputMode": case.get("geometryControlInputMode"),
        "useIfcShapeLockPrompt": case.get("useIfcShapeLockPrompt"),
        "caseDir": case.get("caseDir"),
        "debugManifestPath": case.get("debugManifestPath"),
        "photos": case.get("photos", []),
        "metrics": metrics,
        "reasons": reasons,
    }


def _group_metrics_by_case(rows: object) -> dict[str, dict[str, dict[str, float]]]:
    grouped: dict[str, dict[str, dict[str, float]]] = {}
    if not isinstance(rows, list):
        return grouped
    for row in rows:
        if not isinstance(row, dict):
            continue
        case = str(row.get("case", ""))
        view = str(row.get("view", ""))
        if not case or not view:
            continue
        grouped.setdefault(case, {})[view] = {
            "silhouetteIou": _number(row.get("silhouetteIou")),
            "deltaSilhouetteIou": _number(row.get("deltaSilhouetteIou")),
            "edgeAlignmentScore": _number(row.get("edgeAlignmentScore")),
            "deltaEdgeAlignmentScore": _number(row.get("deltaEdgeAlignmentScore")),
            "buildingBboxOverlap": _number(row.get("buildingBboxOverlap")),
            "deltaBuildingBboxOverlap": _number(row.get("deltaBuildingBboxOverlap")),
        }
    return grouped


def _write_contact_sheet(
    output_path: Path,
    rows: list[tuple[str, dict[str, Any]]],
) -> None:
    thumb_size = (320, 192)
    label_height = 36
    padding = 12
    width = padding + len(VIEWS) * (thumb_size[0] + padding)
    height = padding + len(rows) * (thumb_size[1] + label_height + padding)
    sheet = Image.new("RGB", (width, height), (245, 245, 245))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for row_index, (role, case) in enumerate(rows):
        y = padding + row_index * (thumb_size[1] + label_height + padding)
        draw.text((padding, y), f"{role}: {case['caseName']}", fill=(20, 20, 20), font=font)
        photos = [Path(str(photo)) for photo in case.get("photos", [])]
        photos_by_view = {path.stem.replace("photo_", ""): path for path in photos}
        for col_index, view in enumerate(VIEWS):
            x = padding + col_index * (thumb_size[0] + padding)
            photo_path = photos_by_view.get(view)
            if photo_path is None or not photo_path.exists():
                draw.rectangle(
                    (x, y + label_height, x + thumb_size[0], y + label_height + thumb_size[1]),
                    fill=(220, 220, 220),
                )
                draw.text(
                    (x + 8, y + label_height + 8),
                    f"missing {view}",
                    fill=(80, 0, 0),
                    font=font,
                )
                continue
            with Image.open(photo_path) as image:
                thumb = image.convert("RGB")
                thumb.thumbnail(thumb_size)
                paste_x = x + (thumb_size[0] - thumb.width) // 2
                paste_y = y + label_height + (thumb_size[1] - thumb.height) // 2
                sheet.paste(thumb, (paste_x, paste_y))
            draw.text((x, y + 16), view, fill=(40, 40, 40), font=font)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, format="PNG")


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "winner": manifest["winner"]["caseName"],
        "geometryControlInputMode": manifest["phaseEInput"]["geometryControlInputMode"],
        "useIfcShapeLockPrompt": manifest["phaseEInput"]["useIfcShapeLockPrompt"],
        "contactSheet": manifest["contactSheet"],
    }


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _number(value: object) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0


def _posix(path: Path | str) -> str:
    return str(path).replace("\\", "/")


if __name__ == "__main__":
    main()
