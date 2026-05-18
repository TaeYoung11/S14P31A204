"""Record Phase E-4 combined visual review from the E-3 matrix outputs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_ifc_color_artifact_matrix import _posix  # noqa: E402
from generate_ifc_geometry_color_e2_artifacts import _load_json  # noqa: E402

DEFAULT_E3_MANIFEST = Path(
    "outputs/ifc_geometry_e3_combined_final_matrix/e3_combined_final_matrix_manifest.json"
)
DEFAULT_E3_METRICS = Path(
    "outputs/ifc_geometry_e3_combined_final_matrix/e3_combined_final_matrix_metrics.json"
)
DEFAULT_OUTPUT_DIR = Path("outputs/ifc_geometry_e4_visual_review")
MANIFEST_NAME = "e4_visual_review_manifest.json"
MARKDOWN_NAME = "e4_visual_review_table.md"

VISUAL_REVIEW_PRESETS: dict[str, dict[str, Any]] = {
    "ifc_minimal_baseline_day": {
        "rank": 1,
        "decision": "winner",
        "notes": [
            "가장 자연스러운 외관으로 보인다.",
            "roof/window/door 색은 IFC 목표와 다르지만 색 띠 artifact는 없다.",
            "geometry silhouette은 안정적이고 DAY 기준 기준선으로 적합하다.",
        ],
    },
    "ifc_minimal_baseline_night": {
        "rank": 2,
        "decision": "fallback",
        "notes": [
            "야간 장면으로는 가장 자연스럽다.",
            "색상 정확도는 낮지만 인위적인 post color lock 띠는 없다.",
            "DAY winner의 NIGHT fallback 기준으로 유지 가능하다.",
        ],
    },
    "ifc_minimal_post_color_lock_naturalized_from_E2_9_day": {
        "rank": 3,
        "decision": "rejected",
        "notes": [
            "roof/window 영역에 녹색/청색 띠가 직접 보인다.",
            "metric은 가장 좋지만 visual quality가 production 후보로 보기 어렵다.",
            "geometry는 유지되지만 post color lock artifact가 너무 강하다.",
        ],
        "rejectReason": "DAY view에서 roof/window color banding이 명확해 visual quality를 해친다.",
    },
    "ifc_minimal_post_color_lock_naturalized_from_E2_9_night": {
        "rank": 4,
        "decision": "rejected",
        "notes": [
            "야간에도 roof/window color 띠가 남아 있다.",
            "roof는 green family를 유지하지만 wall/window/door consistency가 약하다.",
            "DAY 개선을 NIGHT까지 확장하는 과정에서 자연스러움이 충분히 확보되지 않았다.",
        ],
        "rejectReason": (
            "NIGHT에서도 color lock 흔적이 남고 "
            "wall/window/door consistency가 부족하다."
        ),
    },
}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create the E-4 visual review manifest from E-3 outputs."
    )
    parser.add_argument("--e3-manifest", type=Path, default=DEFAULT_E3_MANIFEST)
    parser.add_argument("--e3-metrics", type=Path, default=DEFAULT_E3_METRICS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = review_ifc_geometry_e4_visual_review(
        e3_manifest_path=args.e3_manifest,
        e3_metrics_path=args.e3_metrics,
        output_dir=args.output,
    )
    print(f"[geometry-e4] wrote {args.output / MANIFEST_NAME}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def review_ifc_geometry_e4_visual_review(
    *,
    e3_manifest_path: Path,
    e3_metrics_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    e3_manifest = _load_json(e3_manifest_path)
    metric_rows = _load_json(e3_metrics_path)
    metric_summary = _build_metric_summary(metric_rows)
    metric_winner_case = _select_metric_winner(metric_summary)
    review_table = _build_review_table(e3_manifest, metric_summary, metric_winner_case)
    visual_winner = next(
        row["caseName"] for row in review_table if row["decision"] == "winner"
    )
    fallback = next(
        row["caseName"] for row in review_table if row["decision"] == "fallback"
    )
    rejected_cases = [
        {
            "caseName": row["caseName"],
            "reason": row["rejectReason"],
        }
        for row in review_table
        if row["decision"] == "rejected"
    ]
    manifest = {
        "schemaVersion": "ifc2img.geometryE4VisualReview.v1",
        "sourceE3Manifest": _posix(e3_manifest_path),
        "sourceE3MetricTable": _posix(e3_metrics_path),
        "contactSheet": e3_manifest.get("contactSheet"),
        "metricWinnerCase": metric_winner_case,
        "visualWinnerCase": visual_winner,
        "fallbackCase": fallback,
        "metricVsVisualMatch": metric_winner_case == visual_winner,
        "reviewTable": review_table,
        "rejectedCases": rejected_cases,
        "residualRisk": [
            (
                "현재 active improved 후보는 DAY/NIGHT 모두 "
                "roof/window color banding artifact가 남아 있다."
            ),
            "NIGHT 조건에서는 wall/window/door color family consistency가 충분하지 않다.",
            (
                "production default 변경 후보를 고르기에는 "
                "자연스러움과 color fidelity가 동시에 만족되지 않았다."
            ),
            "shinchan.ifc 외 일반 IFC로의 일반화 여부는 아직 검증되지 않았다.",
        ],
        "decision": {
            "summary": (
                "metric winner는 E-2.9 improved DAY지만, visual winner는 baseline DAY로 기록한다. "
                "따라서 E-5에서는 default 유지와 opt-in 보류를 우선 검토한다."
            ),
            "visualPriorityReason": (
                "post color lock artifact가 roof/window 영역에서 직접 보여 "
                "production quality를 해친다."
            ),
        },
        "notes": [
            (
                "E-4 visual review는 E-3 combined final matrix "
                "contact sheet와 metric table을 함께 사용했다."
            ),
            "DAY/NIGHT pair는 같은 geometry lock(depth_edge, shape lock off) 기준으로 비교했다.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (output_dir / MARKDOWN_NAME).write_text(
        _render_markdown_review(manifest),
        encoding="utf-8",
    )
    return manifest


def _build_metric_summary(metric_rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {}
    for row in metric_rows:
        case_name = str(row["caseName"])
        bucket = summary.setdefault(
            case_name,
            {
                "passCount": 0,
                "roofDeltaSum": 0.0,
                "wallDeltaSum": 0.0,
                "windowDeltaSum": 0.0,
                "doorDeltaSum": 0.0,
                "foregroundFillRatioSum": 0.0,
                "rowCount": 0,
            },
        )
        bucket["rowCount"] += 1
        bucket["passCount"] += sum(
            1
            for key in (
                "roofFamilyPass",
                "wallFamilyPass",
                "windowFamilyPass",
                "doorFamilyPass",
            )
            if row.get(key) is True
        )
        for delta_key, bucket_key in (
            ("roofDeltaToTarget", "roofDeltaSum"),
            ("wallDeltaToTarget", "wallDeltaSum"),
            ("windowDeltaToTarget", "windowDeltaSum"),
            ("doorDeltaToTarget", "doorDeltaSum"),
        ):
            value = row.get(delta_key)
            if isinstance(value, int | float):
                bucket[bucket_key] += float(value)
        fill_ratio = row.get("estimatedPhotoForegroundFillRatio")
        if isinstance(fill_ratio, int | float):
            bucket["foregroundFillRatioSum"] += float(fill_ratio)
    return summary


def _select_metric_winner(metric_summary: dict[str, dict[str, Any]]) -> str:
    def score(item: tuple[str, dict[str, Any]]) -> tuple[float, float]:
        case_name, payload = item
        total_delta = (
            payload["roofDeltaSum"]
            + payload["wallDeltaSum"]
            + payload["windowDeltaSum"]
            + payload["doorDeltaSum"]
        )
        return (float(payload["passCount"]), -float(total_delta))

    return max(metric_summary.items(), key=score)[0]


def _build_review_table(
    e3_manifest: dict[str, Any],
    metric_summary: dict[str, dict[str, Any]],
    metric_winner_case: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for case in e3_manifest.get("cases", []):
        if not isinstance(case, dict):
            continue
        case_name = str(case["caseName"])
        preset = VISUAL_REVIEW_PRESETS[case_name]
        metrics = metric_summary[case_name]
        row_count = max(int(metrics["rowCount"]), 1)
        rows.append(
            {
                "rank": preset["rank"],
                "caseName": case_name,
                "timeOfDay": case.get("timeOfDay"),
                "decision": preset["decision"],
                "metricWinner": case_name == metric_winner_case,
                "passCount": metrics["passCount"],
                "avgRoofDelta": metrics["roofDeltaSum"] / row_count,
                "avgWallDelta": metrics["wallDeltaSum"] / row_count,
                "avgWindowDelta": metrics["windowDeltaSum"] / row_count,
                "avgDoorDelta": metrics["doorDeltaSum"] / row_count,
                "avgForegroundFillRatio": metrics["foregroundFillRatioSum"] / row_count,
                "notes": preset["notes"],
                "rejectReason": preset.get("rejectReason"),
                "artifactPaths": case.get("artifactPaths", {}),
            }
        )
    return sorted(rows, key=lambda row: int(row["rank"]))


def _render_markdown_review(manifest: dict[str, Any]) -> str:
    lines = [
        "# E-4 Visual Review",
        "",
        f"- metric winner: `{manifest['metricWinnerCase']}`",
        f"- visual winner: `{manifest['visualWinnerCase']}`",
        f"- fallback: `{manifest['fallbackCase']}`",
        f"- metric/visual match: `{manifest['metricVsVisualMatch']}`",
        "",
        (
            "| rank | case | decision | metric winner | passCount | "
            "avgRoofDelta | avgWallDelta | avgWindowDelta | avgDoorDelta |"
        ),
        "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in manifest["reviewTable"]:
        lines.append(
            (
                "| {rank} | `{case}` | {decision} | {metric_winner} | "
                "{pass_count} | {roof:.4f} | {wall:.4f} | "
                "{window:.4f} | {door:.4f} |"
            ).format(
                rank=row["rank"],
                case=row["caseName"],
                decision=row["decision"],
                metric_winner="yes" if row["metricWinner"] else "no",
                pass_count=row["passCount"],
                roof=row["avgRoofDelta"],
                wall=row["avgWallDelta"],
                window=row["avgWindowDelta"],
                door=row["avgDoorDelta"],
            )
        )
    lines.extend(
        [
            "",
            "## Rejected Cases",
            "",
        ]
    )
    for rejected in manifest["rejectedCases"]:
        lines.append(f"- `{rejected['caseName']}`: {rejected['reason']}")
    lines.extend(["", "## Residual Risk", ""])
    for risk in manifest["residualRisk"]:
        lines.append(f"- {risk}")
    lines.append("")
    return "\n".join(lines)


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "metricWinnerCase": manifest["metricWinnerCase"],
        "visualWinnerCase": manifest["visualWinnerCase"],
        "fallbackCase": manifest["fallbackCase"],
        "reviewTablePath": f"outputs/ifc_geometry_e4_visual_review/{MARKDOWN_NAME}",
    }


if __name__ == "__main__":
    main()
