"""Generate Phase F-3 appearance-only candidates from the F-2 baseline bundle."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

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
                source_element_masks = {
                    key: Path(str(value))
                    for key, value in (view_payload.get("sourceElementMasks") or {}).items()
                }
                output_path = case_output_dir / f"photo_{view_name}.png"
                builder(
                    no_background_path=source_no_bg,
                    with_background_path=source_with_bg,
                    time_of_day=time_of_day,
                    source_element_masks=source_element_masks,
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
    source_element_masks: dict[str, Path],
) -> Image.Image:
    building = Image.open(no_background_path).convert("RGBA")
    background = Image.open(with_background_path).convert("RGB")
    relit = _build_storey_and_color_preserving_building(
        building=building,
        time_of_day=time_of_day,
        source_element_masks=source_element_masks,
    )
    return Image.alpha_composite(background.convert("RGBA"), relit).convert("RGB")


def _build_shadow_contrast_background_candidate(
    *,
    no_background_path: Path,
    with_background_path: Path,
    time_of_day: str,
    source_element_masks: dict[str, Path],
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


def _build_storey_and_color_preserving_building(
    *,
    building: Image.Image,
    time_of_day: str,
    source_element_masks: dict[str, Path],
) -> Image.Image:
    rgba = building.convert("RGBA")
    rgb = np.asarray(rgba.convert("RGB"), dtype=np.float32)
    alpha = np.asarray(rgba.getchannel("A"), dtype=np.float32) / 255.0
    wall_mask = _load_mask(source_element_masks.get("wall"), rgba.size)
    roof_mask = _load_mask(source_element_masks.get("roof"), rgba.size)
    window_mask = _load_mask(source_element_masks.get("window"), rgba.size)
    door_mask = _load_mask(source_element_masks.get("door"), rgba.size)

    # Preserve IFC hue first, then add mild relight per category.
    rgb = _apply_mask_gain(
        rgb,
        roof_mask,
        gain=(0.96, 1.02, 0.96) if time_of_day == "DAY" else (0.88, 0.95, 0.88),
    )
    rgb = _apply_mask_gain(
        rgb,
        window_mask,
        gain=(0.93, 0.98, 1.08) if time_of_day == "DAY" else (0.82, 0.88, 1.04),
    )
    rgb = _apply_mask_gain(
        rgb,
        door_mask,
        gain=(1.03, 1.00, 0.95) if time_of_day == "DAY" else (0.90, 0.88, 0.84),
    )

    split_y = _estimate_storey_split_y(wall_mask=wall_mask, window_mask=window_mask)
    upper_wall_mask, lower_wall_mask = _split_wall_mask(wall_mask, split_y)
    rgb = _apply_mask_gain(
        rgb,
        upper_wall_mask,
        gain=(1.05, 1.05, 1.04) if time_of_day == "DAY" else (0.88, 0.88, 0.90),
    )
    rgb = _apply_mask_gain(
        rgb,
        lower_wall_mask,
        gain=(0.93, 0.93, 0.92) if time_of_day == "DAY" else (0.76, 0.76, 0.78),
    )

    separator_mask = _build_separator_mask(wall_mask=wall_mask, split_y=split_y)
    rgb = _apply_mask_gain(
        rgb,
        separator_mask,
        gain=(0.72, 0.72, 0.72) if time_of_day == "DAY" else (0.62, 0.62, 0.64),
    )

    # Mild global contrast that still keeps original IFC category colors readable.
    relit = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), mode="RGB")
    relit = ImageEnhance.Contrast(relit).enhance(1.05)
    relit = ImageEnhance.Brightness(relit).enhance(1.02 if time_of_day == "DAY" else 0.95)
    relit_rgba = np.dstack(
        [
            np.asarray(relit, dtype=np.uint8),
            np.clip(alpha * 255.0, 0, 255).astype(np.uint8),
        ]
    )
    return Image.fromarray(relit_rgba, mode="RGBA")


def _load_mask(path: Path | None, size: tuple[int, int]) -> np.ndarray:
    if path is None or not path.exists():
        return np.zeros((size[1], size[0]), dtype=np.float32)
    mask = Image.open(path).convert("L")
    if mask.size != size:
        mask = mask.resize(size, Image.Resampling.NEAREST)
    return np.asarray(mask, dtype=np.float32) / 255.0


def _apply_mask_gain(
    rgb: np.ndarray,
    mask: np.ndarray,
    *,
    gain: tuple[float, float, float],
) -> np.ndarray:
    if mask.max() <= 0.0:
        return rgb
    mask_3 = mask[..., None]
    target = rgb * np.asarray(gain, dtype=np.float32)
    return rgb * (1.0 - mask_3) + target * mask_3


def _estimate_storey_split_y(
    *,
    wall_mask: np.ndarray,
    window_mask: np.ndarray,
) -> int:
    window_rows = window_mask.sum(axis=1)
    window_y = np.where(window_rows > max(window_rows.max() * 0.15, 1.0))[0]
    if window_y.size >= 8 and window_y.max() - window_y.min() >= 24:
        median = int(np.median(window_y))
        top = window_y[window_y < median]
        bottom = window_y[window_y >= median]
        if top.size > 0 and bottom.size > 0:
            return int(round((top.mean() + bottom.mean()) / 2.0))
    wall_y = np.where(wall_mask.sum(axis=1) > 0)[0]
    if wall_y.size == 0:
        return wall_mask.shape[0] // 2
    top = int(wall_y.min())
    bottom = int(wall_y.max())
    return top + int(round((bottom - top) * 0.48))


def _split_wall_mask(wall_mask: np.ndarray, split_y: int) -> tuple[np.ndarray, np.ndarray]:
    upper = np.zeros_like(wall_mask)
    lower = np.zeros_like(wall_mask)
    split_y = int(np.clip(split_y, 0, wall_mask.shape[0] - 1))
    upper[:split_y, :] = wall_mask[:split_y, :]
    lower[split_y:, :] = wall_mask[split_y:, :]
    upper = _soften_mask(upper, radius=2)
    lower = _soften_mask(lower, radius=2)
    return upper, lower


def _build_separator_mask(*, wall_mask: np.ndarray, split_y: int) -> np.ndarray:
    separator = np.zeros_like(wall_mask)
    split_y = int(np.clip(split_y, 1, wall_mask.shape[0] - 2))
    separator[max(split_y - 2, 0) : min(split_y + 3, wall_mask.shape[0]), :] = wall_mask[
        max(split_y - 2, 0) : min(split_y + 3, wall_mask.shape[0]), :
    ]
    return _soften_mask(separator, radius=3)


def _soften_mask(mask: np.ndarray, *, radius: int) -> np.ndarray:
    image = Image.fromarray(np.clip(mask * 255.0, 0, 255).astype(np.uint8), mode="L")
    softened = image.filter(ImageFilter.GaussianBlur(radius=radius))
    return np.asarray(softened, dtype=np.float32) / 255.0


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
