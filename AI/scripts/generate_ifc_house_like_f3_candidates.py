"""Generate Phase F-3 appearance-only candidates from the F-2 baseline bundle."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_F2_MANIFEST = (
    ROOT
    / "outputs"
    / "ifc_geometry_f2_ifc_locked_baseline"
    / "f2_ifc_locked_baseline_manifest.json"
)
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "ifc_geometry_f3_house_like_candidates"
MANIFEST_NAME = "f3_house_like_candidates_manifest.json"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate house-like appearance-only candidates from the F-2 baseline."
    )
    parser.add_argument("--f2-manifest", type=Path, default=DEFAULT_F2_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_house_like_f3_candidates(
        f2_manifest_path=args.f2_manifest.resolve(),
        output_dir=args.output.resolve(),
    )
    print(f"[f3] wrote {args.output / MANIFEST_NAME}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_house_like_f3_candidates(
    *,
    f2_manifest_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    f2_manifest = _load_json(f2_manifest_path)
    accepted_builders = {
        "appearance_only_candidate_1_material_relight": _build_material_relight_candidate,
        "appearance_only_candidate_2_shadow_contrast_background": (
            _build_shadow_contrast_background_candidate
        ),
    }

    cases: list[dict[str, Any]] = []
    for base_case in f2_manifest.get("cases", []):
        if not isinstance(base_case, dict):
            continue
        time_of_day = str(base_case["timeOfDay"])
        for candidate_name, builder in accepted_builders.items():
            case_output_dir = output_dir / f"{candidate_name}_{time_of_day.lower()}"
            case_output_dir.mkdir(parents=True, exist_ok=True)
            views = []
            for view_payload in base_case.get("views", []):
                view_name = str(view_payload["view"])
                source_no_bg = Path(str(view_payload["baselineNoBackgroundImage"]))
                source_with_bg = Path(str(view_payload["baselineWithBackgroundImage"]))
                output_path = case_output_dir / f"photo_{view_name}.png"
                builder(
                    no_background_path=source_no_bg,
                    with_background_path=source_with_bg,
                    time_of_day=time_of_day,
                ).save(output_path, format="PNG")
                views.append(
                    {
                        "view": view_name,
                        "sourceNoBackgroundImage": _posix(source_no_bg),
                        "sourceWithBackgroundImage": _posix(source_with_bg),
                        "outputImage": _posix(output_path),
                        "geometryIdenticalToIfc": True,
                        "openingLayoutPreserved": True,
                        "silhouettePreserved": True,
                    }
                )
            cases.append(
                {
                    "caseName": f"{candidate_name}_{time_of_day.lower()}",
                    "candidateFamily": candidate_name,
                    "timeOfDay": time_of_day,
                    "appearanceOnly": True,
                    "geometryDriftDetected": False,
                    "views": views,
                }
            )

    manifest = {
        "schemaVersion": "ifc2img.f3HouseLikeCandidates.v1",
        "sourceF2Manifest": _posix(f2_manifest_path),
        "policy": {
            "geometrySource": "F-2 IFC-locked baseline only",
            "diffusionUsed": False,
            "acceptedCandidateCount": 2,
        },
        "acceptedCandidates": [
            {
                "candidateFamily": "appearance_only_candidate_1_material_relight",
                "reason": (
                    "Material tint and local relight only; "
                    "building alpha/silhouette preserved."
                ),
            },
            {
                "candidateFamily": "appearance_only_candidate_2_shadow_contrast_background",
                "reason": (
                    "Shadow/contrast/background adjustment only; "
                    "building alpha/silhouette preserved."
                ),
            },
        ],
        "rejectedCandidates": [
            {
                "candidateFamily": "masked_img2img_with_keep_mask",
                "reason": (
                    "Geometry-frozen keep mask still relies on diffusion "
                    "and can redraw openings."
                ),
            },
            {
                "candidateFamily": "direct_diffusion_final_photo_edit",
                "reason": (
                    "Starts from diffusion result instead of IFC-locked "
                    "baseline, so contract source is invalid."
                ),
            },
            {
                "candidateFamily": "free_background_inpaint",
                "reason": (
                    "Background inpaint can hallucinate foreground masses "
                    "near the silhouette boundary."
                ),
            },
        ],
        "cases": cases,
        "notes": [
            "All accepted candidates are built from F-2 baseline images only.",
            (
                "All accepted candidates preserve the exact building alpha "
                "silhouette from the baseline bundle."
            ),
            "Only color, contrast, relight, and background presentation are changed.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _build_material_relight_candidate(
    *,
    no_background_path: Path,
    with_background_path: Path,
    time_of_day: str,
) -> Image.Image:
    building = Image.open(no_background_path).convert("RGBA")
    background = Image.open(with_background_path).convert("RGB")
    rgb = building.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(0.78)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.10)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.05 if time_of_day == "DAY" else 0.92)
    relit = Image.merge("RGBA", (*rgb.split(), building.getchannel("A")))
    return Image.alpha_composite(background.convert("RGBA"), relit).convert("RGB")


def _build_shadow_contrast_background_candidate(
    *,
    no_background_path: Path,
    with_background_path: Path,
    time_of_day: str,
) -> Image.Image:
    building = Image.open(no_background_path).convert("RGBA")
    background = Image.open(with_background_path).convert("RGBA")
    tuned_bg = ImageEnhance.Color(background.convert("RGB")).enhance(
        0.92 if time_of_day == "DAY" else 0.78
    )
    tuned_bg = ImageEnhance.Contrast(tuned_bg).enhance(1.08 if time_of_day == "DAY" else 1.14)
    rgb = building.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.16)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.00 if time_of_day == "DAY" else 0.88)
    tuned_building = Image.merge("RGBA", (*rgb.split(), building.getchannel("A")))
    return Image.alpha_composite(tuned_bg.convert("RGBA"), tuned_building).convert("RGB")


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": manifest["schemaVersion"],
        "acceptedCandidates": [
            item["candidateFamily"] for item in manifest["acceptedCandidates"]
        ],
        "caseNames": [case["caseName"] for case in manifest["cases"]],
    }


def _posix(path: Path) -> str:
    return path.as_posix()


if __name__ == "__main__":
    main()
