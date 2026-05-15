"""Generate Phase F-5 exact-geometry final matrix."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont, ImageStat

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_F2_MANIFEST = (
    ROOT
    / "outputs"
    / "ifc_geometry_f2_ifc_locked_baseline"
    / "f2_ifc_locked_baseline_manifest.json"
)
DEFAULT_F3_MANIFEST = (
    ROOT
    / "outputs"
    / "ifc_geometry_f3_house_like_candidates"
    / "f3_house_like_candidates_manifest.json"
)
DEFAULT_F4_MANIFEST = (
    ROOT
    / "outputs"
    / "ifc_geometry_f4_exactness_metrics"
    / "f4_exactness_metrics_manifest.json"
)
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "ifc_geometry_f5_final_matrix"
MANIFEST_NAME = "f5_ifc_identical_final_matrix_manifest.json"
TABLE_NAME = "f5_ifc_identical_metric_table.json"
CONTACT_SHEET_NAME = "f5_ifc_identical_final_matrix_contact_sheet.png"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate exact-geometry final matrix from F-2/F-3/F-4 artifacts."
    )
    parser.add_argument("--f2-manifest", type=Path, default=DEFAULT_F2_MANIFEST)
    parser.add_argument("--f3-manifest", type=Path, default=DEFAULT_F3_MANIFEST)
    parser.add_argument("--f4-manifest", type=Path, default=DEFAULT_F4_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_identical_f5_final_matrix(
        f2_manifest_path=args.f2_manifest.resolve(),
        f3_manifest_path=args.f3_manifest.resolve(),
        f4_manifest_path=args.f4_manifest.resolve(),
        output_dir=args.output.resolve(),
    )
    print(f"[f5] wrote {args.output / MANIFEST_NAME}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_identical_f5_final_matrix(
    *,
    f2_manifest_path: Path,
    f3_manifest_path: Path,
    f4_manifest_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    f2_manifest = _load_json(f2_manifest_path)
    f3_manifest = _load_json(f3_manifest_path)
    f4_manifest = _load_json(f4_manifest_path)

    exact_pass_cases = _resolve_exact_pass_case_names(f4_manifest)
    case_payloads = _collect_case_payloads(f2_manifest, f3_manifest, exact_pass_cases)
    metric_rows = _build_metric_rows(case_payloads)
    family_summary = _build_family_summary(metric_rows)
    winner_family, fallback_family = _select_winner_and_fallback(family_summary)

    table_path = output_dir / TABLE_NAME
    table_path.write_text(
        json.dumps(metric_rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    contact_sheet_path = output_dir / CONTACT_SHEET_NAME
    _write_contact_sheet(contact_sheet_path, case_payloads)

    manifest = {
        "schemaVersion": "ifc2img.f5IfcIdenticalFinalMatrix.v1",
        "sourceF2Manifest": _posix(f2_manifest_path),
        "sourceF3Manifest": _posix(f3_manifest_path),
        "sourceF4Manifest": _posix(f4_manifest_path),
        "exactPassCases": sorted(exact_pass_cases),
        "excludedCases": _resolve_excluded_cases(f2_manifest, f3_manifest, exact_pass_cases),
        "cases": case_payloads,
        "metricTable": _posix(table_path),
        "contactSheet": _posix(contact_sheet_path),
        "familySummary": family_summary,
        "winner": {
            "family": winner_family,
            "reason": family_summary[winner_family]["selectionReason"],
        },
        "fallback": {
            "family": fallback_family,
            "reason": family_summary[fallback_family]["selectionReason"],
        },
        "notes": [
            "F-5 includes only exactPass=true cases from F-4.",
            "Visual realism is a heuristic ranking layer applied after exact geometry pass.",
            "Winner/fallback are selected at the family level so DAY/NIGHT stay paired.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _resolve_exact_pass_case_names(f4_manifest: dict[str, Any]) -> set[str]:
    return {
        case_name
        for case_name, payload in f4_manifest.get("summary", {}).items()
        if payload.get("rowCount") == payload.get("exactPassCount")
    }


def _collect_case_payloads(
    f2_manifest: dict[str, Any],
    f3_manifest: dict[str, Any],
    exact_pass_cases: set[str],
) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    for case in f2_manifest.get("cases", []):
        if case.get("caseName") in exact_pass_cases:
            payloads.append(_convert_f2_case(case))
    for case in f3_manifest.get("cases", []):
        if case.get("caseName") in exact_pass_cases:
            payloads.append(_convert_f3_case(case))
    return payloads


def _convert_f2_case(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "caseName": str(case["caseName"]),
        "family": "ifc_locked_baseline",
        "timeOfDay": str(case["timeOfDay"]),
        "sourceType": "f2_ifc_locked_baseline",
        "views": [
            {
                "view": str(view["view"]),
                "imagePath": str(view["baselineWithBackgroundImage"]),
            }
            for view in case.get("views", [])
        ],
    }


def _convert_f3_case(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "caseName": str(case["caseName"]),
        "family": str(case["candidateFamily"]),
        "timeOfDay": str(case["timeOfDay"]),
        "sourceType": "f3_appearance_only",
        "views": [
            {
                "view": str(view["view"]),
                "imagePath": str(view["outputImage"]),
            }
            for view in case.get("views", [])
        ],
    }


def _resolve_excluded_cases(
    f2_manifest: dict[str, Any],
    f3_manifest: dict[str, Any],
    exact_pass_cases: set[str],
) -> list[str]:
    all_cases = [
        *(str(case["caseName"]) for case in f2_manifest.get("cases", [])),
        *(str(case["caseName"]) for case in f3_manifest.get("cases", [])),
    ]
    return sorted(case_name for case_name in all_cases if case_name not in exact_pass_cases)


def _build_metric_rows(case_payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for case in case_payloads:
        for view in case["views"]:
            metrics = _compute_visual_realism_metrics(
                Path(str(view["imagePath"])),
                time_of_day=str(case["timeOfDay"]),
            )
            rows.append(
                {
                    "caseName": case["caseName"],
                    "family": case["family"],
                    "timeOfDay": case["timeOfDay"],
                    "view": view["view"],
                    "imagePath": view["imagePath"],
                    **metrics,
                }
            )
    return rows


def _compute_visual_realism_metrics(
    image_path: Path,
    *,
    time_of_day: str,
) -> dict[str, float]:
    image = Image.open(image_path).convert("RGB")
    stat = ImageStat.Stat(image)
    mean_rgb = [channel / 255.0 for channel in stat.mean]
    std_rgb = [channel / 255.0 for channel in stat.stddev]
    mean_luma = 0.299 * mean_rgb[0] + 0.587 * mean_rgb[1] + 0.114 * mean_rgb[2]
    luma_std = math.sqrt(
        (0.299 * std_rgb[0]) ** 2
        + (0.587 * std_rgb[1]) ** 2
        + (0.114 * std_rgb[2]) ** 2
    )
    colorfulness = sum(
        abs(mean_rgb[idx] - mean_rgb[(idx + 1) % 3]) for idx in range(3)
    ) / 3.0
    std_mean = sum(std_rgb) / 3.0
    score = _visual_realism_score(
        mean_luma=mean_luma,
        luma_std=luma_std,
        colorfulness=colorfulness,
        std_mean=std_mean,
        time_of_day=time_of_day,
    )
    return {
        "meanLuma": round(mean_luma, 4),
        "lumaStd": round(luma_std, 4),
        "colorfulness": round(colorfulness, 4),
        "rgbStdMean": round(std_mean, 4),
        "visualRealismScore": round(score, 4),
    }


def _visual_realism_score(
    *,
    mean_luma: float,
    luma_std: float,
    colorfulness: float,
    std_mean: float,
    time_of_day: str,
) -> float:
    if time_of_day == "DAY":
        targets = {
            "mean_luma": (0.55, 0.20),
            "luma_std": (0.20, 0.12),
            "colorfulness": (0.10, 0.10),
            "std_mean": (0.16, 0.10),
        }
    else:
        targets = {
            "mean_luma": (0.36, 0.18),
            "luma_std": (0.17, 0.10),
            "colorfulness": (0.08, 0.08),
            "std_mean": (0.13, 0.08),
        }
    parts = []
    for key, value in {
        "mean_luma": mean_luma,
        "luma_std": luma_std,
        "colorfulness": colorfulness,
        "std_mean": std_mean,
    }.items():
        target, tolerance = targets[key]
        parts.append(max(0.0, 1.0 - abs(value - target) / tolerance))
    return sum(parts) / len(parts)


def _build_family_summary(metric_rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {}
    for row in metric_rows:
        family = str(row["family"])
        payload = summary.setdefault(
            family,
            {
                "rowCount": 0,
                "scoreSum": 0.0,
                "dayCases": set(),
                "nightCases": set(),
            },
        )
        payload["rowCount"] += 1
        payload["scoreSum"] += float(row["visualRealismScore"])
        case_name = str(row["caseName"])
        if row["timeOfDay"] == "DAY":
            payload["dayCases"].add(case_name)
        else:
            payload["nightCases"].add(case_name)

    for family, payload in summary.items():
        avg_score = payload["scoreSum"] / max(payload["rowCount"], 1)
        payload["averageVisualRealismScore"] = round(avg_score, 4)
        payload["pairedDayNight"] = bool(payload["dayCases"] and payload["nightCases"])
        if family == "ifc_locked_baseline":
            payload["ifcColorFidelityPriority"] = 1
            payload["storeyReadabilityPriority"] = 1
            payload["selectionReason"] = (
                "Safest exact-geometry fallback with minimal appearance processing."
            )
        elif family == "appearance_only_candidate_1_material_relight":
            payload["ifcColorFidelityPriority"] = 3
            payload["storeyReadabilityPriority"] = 3
            payload["selectionReason"] = (
                "Exact geometry preserved while keeping IFC colors readable and "
                "making floor separation more legible."
            )
        else:
            payload["ifcColorFidelityPriority"] = 2
            payload["storeyReadabilityPriority"] = 1
            payload["selectionReason"] = (
                "Exact geometry preserved while adding house-like appearance adjustments."
            )
        payload["dayCases"] = sorted(payload["dayCases"])
        payload["nightCases"] = sorted(payload["nightCases"])
    return summary


def _select_winner_and_fallback(
    family_summary: dict[str, dict[str, Any]]
) -> tuple[str, str]:
    ranked = sorted(
        family_summary.items(),
        key=lambda item: (
            0 if item[0] == "ifc_locked_baseline" else 1,
            item[1].get("ifcColorFidelityPriority", 0),
            item[1].get("storeyReadabilityPriority", 0),
            item[1]["averageVisualRealismScore"],
        ),
        reverse=True,
    )
    winner = ranked[0][0]
    fallback = "ifc_locked_baseline"
    if winner == fallback and len(ranked) > 1:
        fallback = ranked[1][0]
    return winner, fallback


def _write_contact_sheet(output_path: Path, case_payloads: list[dict[str, Any]]) -> None:
    ordered = sorted(
        case_payloads,
        key=lambda case: (
            case["family"],
            0 if case["timeOfDay"] == "DAY" else 1,
        ),
    )
    sample = Image.open(Path(str(ordered[0]["views"][0]["imagePath"]))).convert("RGB")
    width, height = sample.size
    header_h = 34
    cols = 2
    rows = len(ordered)
    canvas = Image.new("RGB", (cols * width, rows * (height + header_h)), (248, 248, 248))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()

    for row_idx, case in enumerate(ordered):
        y_offset = row_idx * (height + header_h)
        label = f"{case['caseName']}"
        draw.text((8, y_offset + 8), label, fill=(20, 20, 20), font=font)
        for col_idx, view in enumerate(sorted(case["views"], key=lambda item: item["view"])):
            image = Image.open(Path(str(view["imagePath"]))).convert("RGB")
            x_offset = col_idx * width
            canvas.paste(image, (x_offset, y_offset + header_h))
            draw.text(
                (x_offset + 8, y_offset + 22),
                str(view["view"]),
                fill=(70, 70, 70),
                font=font,
            )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, format="PNG")


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": manifest["schemaVersion"],
        "winner": manifest["winner"]["family"],
        "fallback": manifest["fallback"]["family"],
        "caseCount": len(manifest["cases"]),
    }


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _posix(path: Path) -> str:
    return path.as_posix()


if __name__ == "__main__":
    main()
