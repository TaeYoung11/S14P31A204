"""Generate Phase F-6 production/opt-in decision from the F-5 final matrix."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_F5_MANIFEST = (
    ROOT
    / "outputs"
    / "ifc_geometry_f5_final_matrix"
    / "f5_ifc_identical_final_matrix_manifest.json"
)
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "ifc_geometry_f6_production_decision"
MANIFEST_NAME = "f6_production_decision_manifest.json"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate production/opt-in decision from F-5 exact-geometry matrix."
    )
    parser.add_argument("--f5-manifest", type=Path, default=DEFAULT_F5_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_f6_production_decision(
        f5_manifest_path=args.f5_manifest.resolve(),
        output_dir=args.output.resolve(),
    )
    print(f"[f6] wrote {args.output / MANIFEST_NAME}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_f6_production_decision(
    *,
    f5_manifest_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    f5_manifest = _load_json(f5_manifest_path)
    winner_family = str(f5_manifest["winner"]["family"])
    fallback_family = str(f5_manifest["fallback"]["family"])
    family_summary = f5_manifest["familySummary"]

    decision = {
        "productionDefault": {
            "enabled": False,
            "family": fallback_family,
            "reason": (
                "Current winner is exact-geometry safe for shinchan, but the path "
                "has not been validated on general IFC inputs."
            ),
        },
        "optIn": {
            "enabled": True,
            "family": winner_family,
            "modeName": "ifc_identical_house_like",
            "scope": "shinchan_or_internal_only",
            "reason": (
                "Winner preserves the IFC exactness contract and improves house-like "
                "appearance, but remains fixture-scoped."
            ),
        },
        "fallback": {
            "enabled": True,
            "family": fallback_family,
            "modeName": "ifc_locked_baseline",
            "reason": "Safest exact-geometry fallback with the least appearance risk.",
        },
        "publicPayloadExposure": {
            "changeRequiredNow": False,
            "reason": "Keep the decision internal until a broader IFC validation pass exists.",
        },
        "recommendedOptions": {
            "ifcGeometryMode": "locked_baseline_source",
            "ifcAppearanceMode": winner_family,
            "ifcExactContractRequired": True,
        },
        "rolloutPolicy": {
            "defaultRollout": "hold",
            "internalRollout": "allow",
            "fixtureSpecificRollout": "allow",
        },
        "residualRisk": [
            "Winner has only been validated on shinchan.ifc and paired DAY/NIGHT views.",
            "Visual realism ranking is heuristic and does not replace broader qualitative review.",
            "General IFCs may need different house-like appearance tuning families.",
        ],
    }

    manifest = {
        "schemaVersion": "ifc2img.f6ProductionDecision.v1",
        "sourceF5Manifest": _posix(f5_manifest_path),
        "winnerFamily": winner_family,
        "fallbackFamily": fallback_family,
        "winnerSummary": family_summary[winner_family],
        "fallbackSummary": family_summary[fallback_family],
        "decision": decision,
        "notes": [
            "Exact geometry contract remains mandatory for any future rollout.",
            "Winner is approved only for opt-in/internal use at this stage.",
            "Baseline family remains the production-safe fallback source.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    decision = manifest["decision"]
    return {
        "schemaVersion": manifest["schemaVersion"],
        "productionDefaultEnabled": decision["productionDefault"]["enabled"],
        "optInEnabled": decision["optIn"]["enabled"],
        "winnerFamily": manifest["winnerFamily"],
        "fallbackFamily": manifest["fallbackFamily"],
    }


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _posix(path: Path) -> str:
    return path.as_posix()


if __name__ == "__main__":
    main()
