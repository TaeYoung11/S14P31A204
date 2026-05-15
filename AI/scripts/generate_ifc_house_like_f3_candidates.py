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
        "appearance_only_candidate_3_photo_finish_red_roof": (
            _build_photo_finish_red_roof_candidate
        ),
        "appearance_only_candidate_4_natural_photo_finish": (
            _build_natural_photo_finish_candidate
        ),
        "appearance_only_candidate_5_aggressive_material_realism": (
            _build_aggressive_material_realism_candidate
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
            "acceptedCandidateCount": 5,
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
            {
                "candidateFamily": "appearance_only_candidate_3_photo_finish_red_roof",
                "reason": (
                    "Roof red emphasis, stronger storey readability, and "
                    "photographic finish only; building alpha/silhouette preserved."
                ),
            },
            {
                "candidateFamily": "appearance_only_candidate_4_natural_photo_finish",
                "reason": (
                    "Less model-like micro-texture, softer photographic depth and "
                    "tone only; building alpha/silhouette preserved."
                ),
            },
            {
                "candidateFamily": "appearance_only_candidate_5_aggressive_material_realism",
                "reason": (
                    "Category-specific roof/wall/window/door material cues with "
                    "stronger roughness/specular shading only; building alpha/silhouette preserved."
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
    del with_background_path
    background = _build_background_plate(building.size, time_of_day=time_of_day)
    background = _tune_photographic_background(background, time_of_day=time_of_day)
    relit = _build_storey_and_color_preserving_building(
        building=building,
        time_of_day=time_of_day,
        source_element_masks=source_element_masks,
    )
    grounded_background = _apply_contact_shadow(
        background=background,
        building=relit,
        time_of_day=time_of_day,
    )
    composed = Image.alpha_composite(grounded_background.convert("RGBA"), relit).convert("RGB")
    return _apply_photographic_finish(composed, time_of_day=time_of_day)


def _build_shadow_contrast_background_candidate(
    *,
    no_background_path: Path,
    with_background_path: Path,
    time_of_day: str,
    source_element_masks: dict[str, Path],
) -> Image.Image:
    building = Image.open(no_background_path).convert("RGBA")
    del with_background_path
    background = _build_background_plate(building.size, time_of_day=time_of_day).convert("RGBA")
    tuned_bg = ImageEnhance.Color(background.convert("RGB")).enhance(
        0.92 if time_of_day == "DAY" else 0.78
    )
    tuned_bg = ImageEnhance.Contrast(tuned_bg).enhance(1.08 if time_of_day == "DAY" else 1.14)
    rgb = building.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.16)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.00 if time_of_day == "DAY" else 0.88)
    tuned_building = Image.merge("RGBA", (*rgb.split(), building.getchannel("A")))
    composed = Image.alpha_composite(tuned_bg.convert("RGBA"), tuned_building).convert("RGB")
    return _apply_photographic_finish(composed, time_of_day=time_of_day)


def _build_photo_finish_red_roof_candidate(
    *,
    no_background_path: Path,
    with_background_path: Path,
    time_of_day: str,
    source_element_masks: dict[str, Path],
) -> Image.Image:
    building = Image.open(no_background_path).convert("RGBA")
    del with_background_path
    background = _build_background_plate(building.size, time_of_day=time_of_day)
    background = _tune_photographic_background(background, time_of_day=time_of_day)
    background = background.filter(
        ImageFilter.GaussianBlur(radius=1.4 if time_of_day == "DAY" else 1.0)
    )
    relit = _build_storey_and_color_preserving_building(
        building=building,
        time_of_day=time_of_day,
        source_element_masks=source_element_masks,
    )
    boosted = _apply_photo_finish_red_roof_boost(
        relit=relit,
        time_of_day=time_of_day,
        source_element_masks=source_element_masks,
    )
    grounded_background = _apply_contact_shadow(
        background=background,
        building=boosted,
        time_of_day=time_of_day,
    )
    composed = Image.alpha_composite(grounded_background.convert("RGBA"), boosted).convert("RGB")
    return _apply_photo_candidate_finish(composed, time_of_day=time_of_day)


def _build_natural_photo_finish_candidate(
    *,
    no_background_path: Path,
    with_background_path: Path,
    time_of_day: str,
    source_element_masks: dict[str, Path],
) -> Image.Image:
    building = Image.open(no_background_path).convert("RGBA")
    del with_background_path
    background = _build_background_plate(building.size, time_of_day=time_of_day)
    background = _tune_natural_photo_background(background, time_of_day=time_of_day)
    relit = _build_storey_and_color_preserving_building(
        building=building,
        time_of_day=time_of_day,
        source_element_masks=source_element_masks,
    )
    naturalized = _apply_natural_photo_building_finish(
        relit=relit,
        time_of_day=time_of_day,
        source_element_masks=source_element_masks,
    )
    grounded_background = _apply_contact_shadow(
        background=background,
        building=naturalized,
        time_of_day=time_of_day,
    )
    composed = Image.alpha_composite(
        grounded_background.convert("RGBA"),
        naturalized,
    ).convert("RGB")
    return _apply_natural_photo_finish(composed, time_of_day=time_of_day)


def _build_aggressive_material_realism_candidate(
    *,
    no_background_path: Path,
    with_background_path: Path,
    time_of_day: str,
    source_element_masks: dict[str, Path],
) -> Image.Image:
    building = Image.open(no_background_path).convert("RGBA")
    del with_background_path
    background = _build_background_plate(building.size, time_of_day=time_of_day)
    background = _tune_material_realism_background(background, time_of_day=time_of_day)
    materialized = _build_material_realism_building(
        building=building,
        time_of_day=time_of_day,
        source_element_masks=source_element_masks,
    )
    grounded_background = _apply_contact_shadow(
        background=background,
        building=materialized,
        time_of_day=time_of_day,
    )
    composed = Image.alpha_composite(
        grounded_background.convert("RGBA"),
        materialized,
    ).convert("RGB")
    return _apply_material_realism_finish(composed, time_of_day=time_of_day)


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
    floor_mask = _load_mask(source_element_masks.get("floor"), rgba.size)

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

    rgb = _apply_category_texture(
        rgb,
        roof_mask,
        scale_x=18.0,
        scale_y=6.0,
        intensity=0.08 if time_of_day == "DAY" else 0.06,
    )
    rgb = _apply_category_texture(
        rgb,
        wall_mask,
        scale_x=42.0,
        scale_y=28.0,
        intensity=0.012 if time_of_day == "DAY" else 0.009,
    )
    rgb = _apply_category_texture(
        rgb,
        door_mask,
        scale_x=10.0,
        scale_y=20.0,
        intensity=0.045 if time_of_day == "DAY" else 0.035,
    )

    split_y = _estimate_storey_split_y(wall_mask=wall_mask, window_mask=window_mask)
    upper_wall_mask, lower_wall_mask = _split_wall_mask(wall_mask, split_y)
    rgb = _apply_mask_gain(
        rgb,
        upper_wall_mask,
        gain=(1.004, 1.004, 1.003) if time_of_day == "DAY" else (0.988, 0.988, 0.990),
    )
    rgb = _apply_mask_gain(
        rgb,
        lower_wall_mask,
        gain=(0.996, 0.996, 0.994) if time_of_day == "DAY" else (0.980, 0.980, 0.984),
    )

    separator_mask = _build_separator_mask(wall_mask=wall_mask, split_y=split_y)
    rgb = _apply_mask_gain(
        rgb,
        separator_mask,
        gain=(0.965, 0.965, 0.965) if time_of_day == "DAY" else (0.935, 0.935, 0.940),
    )

    rgb = _apply_window_reflection(
        rgb,
        window_mask,
        time_of_day=time_of_day,
    )
    rgb = _apply_ground_bounce(
        rgb,
        floor_mask=floor_mask,
        wall_mask=lower_wall_mask,
        time_of_day=time_of_day,
    )
    rgb = _apply_edge_ambient_occlusion(
        rgb,
        alpha=alpha,
        time_of_day=time_of_day,
    )

    # Mild global contrast that still keeps original IFC category colors readable.
    relit = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), mode="RGB")
    relit = ImageEnhance.Color(relit).enhance(0.97 if time_of_day == "DAY" else 0.92)
    relit = ImageEnhance.Contrast(relit).enhance(1.08 if time_of_day == "DAY" else 1.12)
    relit = ImageEnhance.Brightness(relit).enhance(1.01 if time_of_day == "DAY" else 0.94)
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


def _tune_photographic_background(background: Image.Image, *, time_of_day: str) -> Image.Image:
    tuned = ImageEnhance.Color(background).enhance(0.94 if time_of_day == "DAY" else 0.82)
    tuned = ImageEnhance.Contrast(tuned).enhance(1.06 if time_of_day == "DAY" else 1.12)
    tuned = ImageEnhance.Brightness(tuned).enhance(1.01 if time_of_day == "DAY" else 0.92)
    return tuned


def _tune_natural_photo_background(background: Image.Image, *, time_of_day: str) -> Image.Image:
    tuned = ImageEnhance.Color(background).enhance(0.90 if time_of_day == "DAY" else 0.80)
    tuned = ImageEnhance.Contrast(tuned).enhance(0.98 if time_of_day == "DAY" else 1.02)
    tuned = ImageEnhance.Brightness(tuned).enhance(1.00 if time_of_day == "DAY" else 0.90)
    return tuned.filter(ImageFilter.GaussianBlur(radius=1.2 if time_of_day == "DAY" else 0.8))


def _tune_material_realism_background(background: Image.Image, *, time_of_day: str) -> Image.Image:
    tuned = ImageEnhance.Color(background).enhance(0.88 if time_of_day == "DAY" else 0.78)
    tuned = ImageEnhance.Contrast(tuned).enhance(1.00 if time_of_day == "DAY" else 1.06)
    tuned = ImageEnhance.Brightness(tuned).enhance(0.98 if time_of_day == "DAY" else 0.88)
    return tuned.filter(ImageFilter.GaussianBlur(radius=1.6 if time_of_day == "DAY" else 1.1))


def _build_background_plate(size: tuple[int, int], *, time_of_day: str) -> Image.Image:
    width, height = size
    background = Image.new("RGB", (width, height))
    bg = background.load()
    sky_top = (176, 211, 242) if time_of_day == "DAY" else (26, 35, 58)
    sky_bottom = (222, 233, 242) if time_of_day == "DAY" else (58, 69, 94)
    ground_top = (151, 149, 140) if time_of_day == "DAY" else (60, 58, 55)
    ground_bottom = (118, 116, 110) if time_of_day == "DAY" else (40, 39, 38)
    horizon = int(height * 0.72)

    for y in range(height):
        if y < horizon:
            t = 0.0 if horizon <= 1 else y / max(horizon - 1, 1)
            color = _lerp_rgb(sky_top, sky_bottom, t)
        else:
            t = 0.0 if height - horizon <= 1 else (y - horizon) / max(height - horizon - 1, 1)
            color = _lerp_rgb(ground_top, ground_bottom, t)
        for x in range(width):
            bg[x, y] = color
    return background


def _lerp_rgb(
    start: tuple[int, int, int],
    end: tuple[int, int, int],
    t: float,
) -> tuple[int, int, int]:
    return tuple(
        int(round(start[idx] + (end[idx] - start[idx]) * t))
        for idx in range(3)
    )


def _apply_contact_shadow(
    *,
    background: Image.Image,
    building: Image.Image,
    time_of_day: str,
) -> Image.Image:
    del building, time_of_day
    return background.convert("RGB")


def _apply_photographic_finish(image: Image.Image, *, time_of_day: str) -> Image.Image:
    rgb = ImageEnhance.Sharpness(image).enhance(1.08 if time_of_day == "DAY" else 1.02)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.03 if time_of_day == "DAY" else 1.06)
    return rgb


def _apply_photo_finish_red_roof_boost(
    *,
    relit: Image.Image,
    time_of_day: str,
    source_element_masks: dict[str, Path],
) -> Image.Image:
    rgba = relit.convert("RGBA")
    rgb = np.asarray(rgba.convert("RGB"), dtype=np.float32)
    alpha = np.asarray(rgba.getchannel("A"), dtype=np.float32) / 255.0
    roof_mask = _load_mask(source_element_masks.get("roof"), rgba.size)
    wall_mask = _load_mask(source_element_masks.get("wall"), rgba.size)
    window_mask = _load_mask(source_element_masks.get("window"), rgba.size)
    door_mask = _load_mask(source_element_masks.get("door"), rgba.size)
    split_y = _estimate_storey_split_y(
        wall_mask=wall_mask,
        window_mask=window_mask,
    )
    upper_wall_mask, lower_wall_mask = _split_wall_mask(wall_mask, split_y)
    separator_mask = _build_separator_mask(wall_mask=wall_mask, split_y=split_y)

    rgb = _push_toward_color(
        rgb,
        roof_mask,
        target_rgb=(176.0, 64.0, 48.0) if time_of_day == "DAY" else (128.0, 52.0, 46.0),
        strength=0.34 if time_of_day == "DAY" else 0.26,
    )
    rgb = _apply_category_texture(
        rgb,
        roof_mask,
        scale_x=12.0,
        scale_y=4.0,
        intensity=0.11 if time_of_day == "DAY" else 0.08,
    )
    rgb = _apply_mask_gain(
        rgb,
        upper_wall_mask,
        gain=(1.006, 1.006, 1.004) if time_of_day == "DAY" else (0.988, 0.988, 0.990),
    )
    rgb = _apply_mask_gain(
        rgb,
        lower_wall_mask,
        gain=(0.994, 0.994, 0.992) if time_of_day == "DAY" else (0.978, 0.978, 0.982),
    )
    rgb = _apply_mask_gain(
        rgb,
        separator_mask,
        gain=(0.955, 0.955, 0.955) if time_of_day == "DAY" else (0.930, 0.930, 0.936),
    )
    rgb = _push_toward_color(
        rgb,
        door_mask,
        target_rgb=(156.0, 112.0, 74.0) if time_of_day == "DAY" else (120.0, 90.0, 68.0),
        strength=0.18 if time_of_day == "DAY" else 0.14,
    )
    rgb = _apply_window_reflection(
        rgb,
        window_mask,
        time_of_day=time_of_day,
    )
    rgb = _apply_local_clarity(
        rgb,
        alpha=alpha,
        amount=0.07 if time_of_day == "DAY" else 0.05,
    )
    boosted = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), mode="RGB")
    boosted = boosted.filter(
        ImageFilter.UnsharpMask(
            radius=1.8 if time_of_day == "DAY" else 1.5,
            percent=130 if time_of_day == "DAY" else 110,
            threshold=2,
        )
    )
    return Image.merge("RGBA", (*boosted.split(), rgba.getchannel("A")))


def _apply_natural_photo_building_finish(
    *,
    relit: Image.Image,
    time_of_day: str,
    source_element_masks: dict[str, Path],
) -> Image.Image:
    rgba = relit.convert("RGBA")
    rgb = np.asarray(rgba.convert("RGB"), dtype=np.float32)
    alpha = np.asarray(rgba.getchannel("A"), dtype=np.float32) / 255.0
    roof_mask = _load_mask(source_element_masks.get("roof"), rgba.size)
    wall_mask = _load_mask(source_element_masks.get("wall"), rgba.size)
    window_mask = _load_mask(source_element_masks.get("window"), rgba.size)
    door_mask = _load_mask(source_element_masks.get("door"), rgba.size)
    floor_mask = _load_mask(source_element_masks.get("floor"), rgba.size)

    rgb = _push_toward_color(
        rgb,
        roof_mask,
        target_rgb=(166.0, 68.0, 58.0) if time_of_day == "DAY" else (126.0, 56.0, 54.0),
        strength=0.20 if time_of_day == "DAY" else 0.16,
    )
    rgb = _apply_randomized_surface_variation(
        rgb,
        roof_mask,
        amount=0.028 if time_of_day == "DAY" else 0.020,
        warm_bias=0.010,
    )
    rgb = _apply_randomized_surface_variation(
        rgb,
        wall_mask,
        amount=0.018 if time_of_day == "DAY" else 0.014,
        warm_bias=0.0,
    )
    rgb = _push_toward_color(
        rgb,
        door_mask,
        target_rgb=(150.0, 112.0, 84.0) if time_of_day == "DAY" else (118.0, 90.0, 74.0),
        strength=0.12 if time_of_day == "DAY" else 0.10,
    )
    rgb = _apply_window_reflection(rgb, window_mask, time_of_day=time_of_day)
    rgb = _apply_ground_bounce(
        rgb,
        floor_mask=floor_mask,
        wall_mask=wall_mask,
        time_of_day=time_of_day,
    )
    rgb = _apply_edge_ambient_occlusion(rgb, alpha=alpha, time_of_day=time_of_day)
    rgb = _apply_atmospheric_softness(
        rgb,
        alpha=alpha,
        amount=0.060 if time_of_day == "DAY" else 0.045,
    )
    softened = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), mode="RGB")
    softened = softened.filter(
        ImageFilter.GaussianBlur(radius=0.35 if time_of_day == "DAY" else 0.28)
    )
    return Image.merge("RGBA", (*softened.split(), rgba.getchannel("A")))


def _build_material_realism_building(
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
    floor_mask = _load_mask(source_element_masks.get("floor"), rgba.size)

    split_y = _estimate_storey_split_y(wall_mask=wall_mask, window_mask=window_mask)
    upper_wall_mask, lower_wall_mask = _split_wall_mask(wall_mask, split_y)
    separator_mask = _build_separator_mask(wall_mask=wall_mask, split_y=split_y)

    rgb = _push_toward_color(
        rgb,
        roof_mask,
        target_rgb=(170.0, 62.0, 48.0) if time_of_day == "DAY" else (126.0, 54.0, 48.0),
        strength=0.28 if time_of_day == "DAY" else 0.24,
    )
    rgb = _apply_roof_tile_material(
        rgb,
        roof_mask,
        time_of_day=time_of_day,
    )
    rgb = _apply_wall_plaster_material(
        rgb,
        upper_wall_mask=upper_wall_mask,
        lower_wall_mask=lower_wall_mask,
        time_of_day=time_of_day,
    )
    rgb = _apply_window_glass_material(
        rgb,
        window_mask=window_mask,
        time_of_day=time_of_day,
    )
    rgb = _apply_door_wood_material(
        rgb,
        door_mask=door_mask,
        time_of_day=time_of_day,
    )
    rgb = _apply_mask_gain(
        rgb,
        separator_mask,
        gain=(0.50, 0.50, 0.50) if time_of_day == "DAY" else (0.42, 0.42, 0.45),
    )
    rgb = _apply_ground_bounce(
        rgb,
        floor_mask=floor_mask,
        wall_mask=lower_wall_mask,
        time_of_day=time_of_day,
    )
    rgb = _apply_edge_ambient_occlusion(rgb, alpha=alpha, time_of_day=time_of_day)
    rgb = _apply_local_clarity(
        rgb,
        alpha=alpha,
        amount=0.10 if time_of_day == "DAY" else 0.08,
    )
    material = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), mode="RGB")
    material = material.filter(
        ImageFilter.UnsharpMask(
            radius=1.4 if time_of_day == "DAY" else 1.2,
            percent=100 if time_of_day == "DAY" else 80,
            threshold=2,
        )
    )
    return Image.merge("RGBA", (*material.split(), rgba.getchannel("A")))


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


def _push_toward_color(
    rgb: np.ndarray,
    mask: np.ndarray,
    *,
    target_rgb: tuple[float, float, float],
    strength: float,
) -> np.ndarray:
    if mask.max() <= 0.0 or strength <= 0.0:
        return rgb
    mask_3 = mask[..., None] * strength
    target = np.asarray(target_rgb, dtype=np.float32)
    return np.clip(rgb * (1.0 - mask_3) + target * mask_3, 0.0, 255.0)


def _apply_category_texture(
    rgb: np.ndarray,
    mask: np.ndarray,
    *,
    scale_x: float,
    scale_y: float,
    intensity: float,
) -> np.ndarray:
    if mask.max() <= 0.0 or intensity <= 0.0:
        return rgb
    texture = _procedural_texture(mask.shape, scale_x=scale_x, scale_y=scale_y)
    texture_3 = texture[..., None] * mask[..., None] * 255.0 * intensity
    return np.clip(rgb + texture_3, 0.0, 255.0)


def _apply_window_reflection(
    rgb: np.ndarray,
    window_mask: np.ndarray,
    *,
    time_of_day: str,
) -> np.ndarray:
    if window_mask.max() <= 0.0:
        return rgb
    height, width = window_mask.shape
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    grad = 1.0 - (yy / max(height - 1, 1))
    diagonal = np.clip((xx / max(width - 1, 1)) * 0.6 + grad * 0.8, 0.0, 1.0)
    mask = _soften_mask(window_mask, radius=1)
    boost = (0.10 if time_of_day == "DAY" else 0.07) * mask * diagonal
    out = rgb.copy()
    out[..., 2] = np.clip(out[..., 2] + boost * 255.0, 0.0, 255.0)
    out[..., 1] = np.clip(out[..., 1] + boost * 110.0, 0.0, 255.0)
    return out


def _apply_local_clarity(
    rgb: np.ndarray,
    *,
    alpha: np.ndarray,
    amount: float,
) -> np.ndarray:
    if alpha.max() <= 0.0 or amount <= 0.0:
        return rgb
    mean = rgb.mean(axis=2, keepdims=True)
    detail = rgb - mean
    return np.clip(rgb + detail * (alpha[..., None] * amount), 0.0, 255.0)


def _apply_randomized_surface_variation(
    rgb: np.ndarray,
    mask: np.ndarray,
    *,
    amount: float,
    warm_bias: float,
) -> np.ndarray:
    if mask.max() <= 0.0 or amount <= 0.0:
        return rgb
    texture = _randomized_texture(mask.shape)
    texture_3 = texture[..., None] * mask[..., None]
    variation = np.array(
        [1.0 + warm_bias, 1.0, 1.0 - warm_bias],
        dtype=np.float32,
    )
    target = rgb * (1.0 + texture_3 * amount * variation)
    return np.clip(rgb * (1.0 - mask[..., None]) + target * mask[..., None], 0.0, 255.0)


def _apply_roof_tile_material(
    rgb: np.ndarray,
    roof_mask: np.ndarray,
    *,
    time_of_day: str,
) -> np.ndarray:
    if roof_mask.max() <= 0.0:
        return rgb
    tile = _roof_tile_texture(roof_mask.shape)
    highlight = np.clip(tile, 0.0, 1.0)
    shadow = np.clip(-tile, 0.0, 1.0)
    mask_3 = roof_mask[..., None]
    out = rgb.copy()
    out += highlight[..., None] * mask_3 * np.asarray(
        (18.0, 10.0, 8.0) if time_of_day == "DAY" else (10.0, 6.0, 6.0),
        dtype=np.float32,
    )
    out -= shadow[..., None] * mask_3 * np.asarray(
        (16.0, 8.0, 7.0) if time_of_day == "DAY" else (12.0, 7.0, 6.0),
        dtype=np.float32,
    )
    return np.clip(out, 0.0, 255.0)


def _apply_wall_plaster_material(
    rgb: np.ndarray,
    *,
    upper_wall_mask: np.ndarray,
    lower_wall_mask: np.ndarray,
    time_of_day: str,
) -> np.ndarray:
    wall_mask = np.maximum(upper_wall_mask, lower_wall_mask)
    if wall_mask.max() <= 0.0:
        return rgb
    plaster = _plaster_texture(wall_mask.shape)
    out = rgb.copy()
    out = _apply_mask_gain(
        out,
        upper_wall_mask,
        gain=(1.06, 1.05, 1.04) if time_of_day == "DAY" else (0.90, 0.90, 0.92),
    )
    out = _apply_mask_gain(
        out,
        lower_wall_mask,
        gain=(0.92, 0.92, 0.91) if time_of_day == "DAY" else (0.77, 0.77, 0.79),
    )
    plaster_boost = plaster[..., None] * wall_mask[..., None] * (
        10.0 if time_of_day == "DAY" else 7.0
    )
    return np.clip(out + plaster_boost, 0.0, 255.0)


def _apply_window_glass_material(
    rgb: np.ndarray,
    *,
    window_mask: np.ndarray,
    time_of_day: str,
) -> np.ndarray:
    if window_mask.max() <= 0.0:
        return rgb
    out = _apply_window_reflection(rgb, window_mask, time_of_day=time_of_day)
    glass = _glass_texture(window_mask.shape)
    mask_3 = window_mask[..., None]
    tint = np.asarray(
        (0.0, 8.0, 20.0) if time_of_day == "DAY" else (2.0, 6.0, 18.0),
        dtype=np.float32,
    )
    out += mask_3 * tint
    out += glass[..., None] * mask_3 * np.asarray((6.0, 8.0, 10.0), dtype=np.float32)
    return np.clip(out, 0.0, 255.0)


def _apply_door_wood_material(
    rgb: np.ndarray,
    *,
    door_mask: np.ndarray,
    time_of_day: str,
) -> np.ndarray:
    if door_mask.max() <= 0.0:
        return rgb
    wood = _wood_grain_texture(door_mask.shape)
    out = _push_toward_color(
        rgb,
        door_mask,
        target_rgb=(152.0, 112.0, 78.0) if time_of_day == "DAY" else (118.0, 90.0, 70.0),
        strength=0.22 if time_of_day == "DAY" else 0.18,
    )
    out += wood[..., None] * door_mask[..., None] * np.asarray(
        (10.0, 7.0, 3.0) if time_of_day == "DAY" else (8.0, 6.0, 3.0),
        dtype=np.float32,
    )
    return np.clip(out, 0.0, 255.0)


def _apply_atmospheric_softness(
    rgb: np.ndarray,
    *,
    alpha: np.ndarray,
    amount: float,
) -> np.ndarray:
    if alpha.max() <= 0.0 or amount <= 0.0:
        return rgb
    height, width = alpha.shape
    yy = np.mgrid[0:height, 0:width][0].astype(np.float32)
    sky_mix = 1.0 - (yy / max(height - 1, 1))
    haze = alpha[..., None] * sky_mix[..., None] * amount
    haze_color = np.asarray((214.0, 221.0, 229.0), dtype=np.float32)
    return np.clip(rgb * (1.0 - haze) + haze_color * haze, 0.0, 255.0)


def _apply_ground_bounce(
    rgb: np.ndarray,
    *,
    floor_mask: np.ndarray,
    wall_mask: np.ndarray,
    time_of_day: str,
) -> np.ndarray:
    if floor_mask.max() <= 0.0 or wall_mask.max() <= 0.0:
        return rgb
    bounce = np.roll(floor_mask, shift=-10, axis=0)
    bounce = np.minimum(bounce, wall_mask)
    bounce = _soften_mask(bounce, radius=5)
    tint = np.asarray(
        (1.02, 1.01, 0.96) if time_of_day == "DAY" else (0.96, 0.97, 1.02),
        dtype=np.float32,
    )
    bounce_3 = bounce[..., None]
    target = rgb * tint
    return rgb * (1.0 - bounce_3 * 0.12) + target * (bounce_3 * 0.12)


def _apply_edge_ambient_occlusion(
    rgb: np.ndarray,
    *,
    alpha: np.ndarray,
    time_of_day: str,
) -> np.ndarray:
    if alpha.max() <= 0.0:
        return rgb
    outer = _soften_mask(alpha, radius=5)
    inner = _soften_mask(alpha, radius=1)
    edge = np.clip(outer - inner, 0.0, 1.0)
    strength = 0.03 if time_of_day == "DAY" else 0.04
    edge_3 = edge[..., None] * strength
    return np.clip(rgb * (1.0 - edge_3), 0.0, 255.0)


def _procedural_texture(
    shape: tuple[int, int],
    *,
    scale_x: float,
    scale_y: float,
) -> np.ndarray:
    height, width = shape
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    base = (
        np.sin(xx / max(scale_x, 1.0))
        + 0.7 * np.cos(yy / max(scale_y, 1.0))
        + 0.5 * np.sin((xx + yy) / max((scale_x + scale_y) * 0.7, 1.0))
    )
    base = base / 2.2
    return base.astype(np.float32)


def _randomized_texture(shape: tuple[int, int]) -> np.ndarray:
    height, width = shape
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    base = (
        0.55 * np.sin(xx * 0.19 + yy * 0.11)
        + 0.35 * np.cos(xx * 0.07 - yy * 0.13)
        + 0.20 * np.sin((xx + yy) * 0.043)
        + 0.15 * np.cos((xx - yy) * 0.031)
    )
    return (base / 1.25).astype(np.float32)


def _roof_tile_texture(shape: tuple[int, int]) -> np.ndarray:
    height, width = shape
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    rows = np.sin(yy * 0.85) * 0.45
    cols = np.sin(xx * 0.28 + yy * 0.10) * 0.25
    return (rows + cols).astype(np.float32)


def _plaster_texture(shape: tuple[int, int]) -> np.ndarray:
    height, width = shape
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    coarse = np.sin(xx * 0.13 + yy * 0.07) * 0.45
    fine = np.cos(xx * 0.47 - yy * 0.35) * 0.18
    return ((coarse + fine) / 1.8).astype(np.float32)


def _glass_texture(shape: tuple[int, int]) -> np.ndarray:
    height, width = shape
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    diag = np.sin((xx + yy) * 0.18) * 0.22
    vertical = np.cos(xx * 0.33) * 0.12
    return (diag + vertical).astype(np.float32)


def _wood_grain_texture(shape: tuple[int, int]) -> np.ndarray:
    height, width = shape
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    grain = np.sin(yy * 0.52 + np.sin(xx * 0.08) * 2.4) * 0.38
    streak = np.cos(yy * 0.11 - xx * 0.04) * 0.16
    return (grain + streak).astype(np.float32)


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


def _apply_photo_candidate_finish(image: Image.Image, *, time_of_day: str) -> Image.Image:
    rgb = ImageEnhance.Color(image).enhance(0.98 if time_of_day == "DAY" else 0.94)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.10 if time_of_day == "DAY" else 1.12)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.18 if time_of_day == "DAY" else 1.10)
    arr = np.asarray(rgb, dtype=np.float32)
    arr = _apply_vignette(arr, strength=0.08 if time_of_day == "DAY" else 0.10)
    arr = _apply_sensor_grain(arr, amount=2.6 if time_of_day == "DAY" else 2.0)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")


def _apply_natural_photo_finish(image: Image.Image, *, time_of_day: str) -> Image.Image:
    rgb = ImageEnhance.Color(image).enhance(0.93 if time_of_day == "DAY" else 0.90)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.02 if time_of_day == "DAY" else 1.05)
    rgb = ImageEnhance.Sharpness(rgb).enhance(0.96 if time_of_day == "DAY" else 0.98)
    arr = np.asarray(rgb, dtype=np.float32)
    arr = _apply_filmic_tone_curve(arr)
    arr = _apply_vignette(arr, strength=0.04 if time_of_day == "DAY" else 0.06)
    arr = _apply_sensor_grain(arr, amount=1.2 if time_of_day == "DAY" else 1.0)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")


def _apply_material_realism_finish(image: Image.Image, *, time_of_day: str) -> Image.Image:
    rgb = ImageEnhance.Color(image).enhance(0.96 if time_of_day == "DAY" else 0.92)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.08 if time_of_day == "DAY" else 1.10)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.04 if time_of_day == "DAY" else 1.02)
    arr = np.asarray(rgb, dtype=np.float32)
    arr = _apply_filmic_tone_curve(arr)
    arr = _apply_vignette(arr, strength=0.06 if time_of_day == "DAY" else 0.08)
    arr = _apply_sensor_grain(arr, amount=1.8 if time_of_day == "DAY" else 1.5)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")


def _apply_vignette(arr: np.ndarray, *, strength: float) -> np.ndarray:
    height, width = arr.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    nx = (xx / max(width - 1, 1)) * 2.0 - 1.0
    ny = (yy / max(height - 1, 1)) * 2.0 - 1.0
    radius = np.sqrt(nx * nx + ny * ny)
    vignette = np.clip(1.0 - np.maximum(radius - 0.25, 0.0) * strength, 0.84, 1.0)
    return arr * vignette[..., None]


def _apply_filmic_tone_curve(arr: np.ndarray) -> np.ndarray:
    normalized = np.clip(arr / 255.0, 0.0, 1.0)
    toned = normalized * normalized * (3.0 - 2.0 * normalized)
    lifted = toned * 0.94 + 0.03
    return np.clip(lifted * 255.0, 0.0, 255.0)


def _apply_sensor_grain(arr: np.ndarray, *, amount: float) -> np.ndarray:
    height, width = arr.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    grain = (
        np.sin(xx * 1.73 + yy * 0.81)
        + 0.7 * np.cos(xx * 0.41 - yy * 1.29)
        + 0.45 * np.sin((xx + yy) * 2.11)
    ) / 2.15
    return np.clip(arr + grain[..., None] * amount, 0.0, 255.0)


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
