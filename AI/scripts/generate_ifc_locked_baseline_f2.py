"""Generate Phase F-2 IFC-locked baseline artifacts.

This script does not run diffusion. It reuses validated IFC debug artifacts and
builds two geometry-preserving baseline images per view:

1. no-background RGBA building-only composite
2. with-background RGB composite over a simple sky/ground backdrop

The building pixels come directly from the IFC color composite so silhouette and
opening layout stay identical to the IFC-derived mask.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DAY_DEBUG_MANIFEST = (
    ROOT
    / "outputs"
    / "ifc_geometry_e26_preset_off_baseline"
    / "geometry_depth_edge_ifc_minimal_day"
    / "debug"
    / "debug_manifest.json"
)
DEFAULT_NIGHT_DEBUG_MANIFEST = (
    ROOT
    / "outputs"
    / "ifc_geometry_e3_combined_final_matrix"
    / "ifc_minimal_baseline_night"
    / "debug"
    / "debug_manifest.json"
)
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "ifc_geometry_f2_ifc_locked_baseline"
MANIFEST_NAME = "f2_ifc_locked_baseline_manifest.json"
TARGET_FRAME_FILL = 0.82
FRAME_MARGIN_RATIO = 0.04


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate IFC-locked baseline images from existing debug artifacts."
    )
    parser.add_argument("--day-debug-manifest", type=Path, default=DEFAULT_DAY_DEBUG_MANIFEST)
    parser.add_argument(
        "--night-debug-manifest", type=Path, default=DEFAULT_NIGHT_DEBUG_MANIFEST
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_locked_baseline_f2(
        day_debug_manifest_path=args.day_debug_manifest.resolve(),
        night_debug_manifest_path=args.night_debug_manifest.resolve(),
        output_dir=args.output.resolve(),
    )
    print(f"[f2] wrote {args.output / MANIFEST_NAME}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_locked_baseline_f2(
    *,
    day_debug_manifest_path: Path,
    night_debug_manifest_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    day_debug_manifest = _load_json(day_debug_manifest_path)
    night_debug_manifest = _load_json(night_debug_manifest_path)

    cases = [
        _generate_case(
            case_name="ifc_locked_baseline_day",
            time_of_day="DAY",
            debug_manifest=day_debug_manifest,
            debug_manifest_path=day_debug_manifest_path,
            case_output_dir=output_dir / "ifc_locked_baseline_day",
        ),
        _generate_case(
            case_name="ifc_locked_baseline_night",
            time_of_day="NIGHT",
            debug_manifest=night_debug_manifest,
            debug_manifest_path=night_debug_manifest_path,
            case_output_dir=output_dir / "ifc_locked_baseline_night",
        ),
    ]

    manifest = {
        "schemaVersion": "ifc2img.f2IfcLockedBaseline.v1",
        "contract": {
            "geometryIdentical": True,
            "buildingSource": "ifcColorCompositeImage",
            "backgroundPolicy": (
                "Building pixels come only from IFC color composite. "
                "Background uses a procedural sky/ground plate."
            ),
            "diffusionUsed": False,
        },
        "sources": {
            "dayDebugManifest": _posix(day_debug_manifest_path),
            "nightDebugManifest": _posix(night_debug_manifest_path),
        },
        "cases": cases,
        "notes": [
            "No-background output is the raw IFC color composite with transparent background.",
            (
                "With-background output keeps the same building pixels and adds "
                "only a simple backdrop."
            ),
            "These artifacts are intended as F-3 appearance-only input baselines.",
        ],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _generate_case(
    *,
    case_name: str,
    time_of_day: str,
    debug_manifest: dict[str, Any],
    debug_manifest_path: Path,
    case_output_dir: Path,
) -> dict[str, Any]:
    case_output_dir.mkdir(parents=True, exist_ok=True)
    views_payload: list[dict[str, Any]] = []
    for view_payload in debug_manifest.get("views", []):
        if not isinstance(view_payload, dict):
            continue
        view_name = str(view_payload["view"])
        files = view_payload["files"]
        color_composite_path = debug_manifest_path.parent.parent / str(
            files["ifcColorCompositeImage"]
        )
        element_masks = files.get("elementMasks") or {}
        building_rgba = _build_building_rgba(Image.open(color_composite_path).convert("RGBA"))
        building_rgba = _fit_building_to_frame(building_rgba)
        no_background_path = case_output_dir / f"baseline_no_background_{view_name}.png"
        building_rgba.save(no_background_path, format="PNG")

        with_background = _compose_with_background(building_rgba, time_of_day=time_of_day)
        with_background_path = case_output_dir / f"baseline_with_background_{view_name}.png"
        with_background.save(with_background_path, format="PNG")

        views_payload.append(
            {
                "view": view_name,
                "sourceIfcColorCompositeImage": _posix(color_composite_path),
                "sourceElementMasks": {
                    key: _posix(debug_manifest_path.parent.parent / str(value))
                    for key, value in element_masks.items()
                    if isinstance(value, str)
                },
                "baselineNoBackgroundImage": _posix(no_background_path),
                "baselineWithBackgroundImage": _posix(with_background_path),
                "geometryIdenticalToIfc": True,
                "openingLayoutPreserved": True,
                "silhouettePreserved": True,
            }
        )

    return {
        "caseName": case_name,
        "timeOfDay": time_of_day,
        "debugManifestPath": _posix(debug_manifest_path),
        "views": views_payload,
    }


def _build_building_rgba(color_composite: Image.Image) -> Image.Image:
    rgba = color_composite.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, _ = pixels[x, y]
            alpha = 255 if (r, g, b) != (0, 0, 0) else 0
            pixels[x, y] = (r, g, b, alpha)
    return rgba


def _compose_with_background(building_rgba: Image.Image, *, time_of_day: str) -> Image.Image:
    width, height = building_rgba.size
    background = Image.new("RGBA", (width, height))
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
            bg[x, y] = (*color, 255)
    return Image.alpha_composite(background, building_rgba).convert("RGB")


def _fit_building_to_frame(building_rgba: Image.Image) -> Image.Image:
    width, height = building_rgba.size
    bbox = building_rgba.getbbox()
    if bbox is None:
        return building_rgba

    left, top, right, bottom = bbox
    building_w = max(right - left, 1)
    building_h = max(bottom - top, 1)
    margin_x = max(int(round(width * FRAME_MARGIN_RATIO)), 1)
    margin_top = max(int(round(height * FRAME_MARGIN_RATIO)), 1)
    margin_bottom = max(int(round(height * (FRAME_MARGIN_RATIO * 1.5))), 1)
    target_w = max(int(round(width * TARGET_FRAME_FILL)) - margin_x * 2, 1)
    target_h = max(int(round(height * TARGET_FRAME_FILL)) - margin_top - margin_bottom, 1)
    scale = min(target_w / building_w, target_h / building_h)
    if scale <= 1.0:
        return building_rgba

    crop = building_rgba.crop(bbox)
    scaled_size = (
        max(int(round(building_w * scale)), 1),
        max(int(round(building_h * scale)), 1),
    )
    resized = crop.resize(scaled_size, Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    paste_x = max((width - scaled_size[0]) // 2, margin_x)
    paste_x = min(paste_x, max(width - margin_x - scaled_size[0], 0))
    paste_y = max(height - margin_bottom - scaled_size[1], margin_top)
    canvas.alpha_composite(resized, (paste_x, paste_y))
    return canvas


def _lerp_rgb(
    start: tuple[int, int, int],
    end: tuple[int, int, int],
    t: float,
) -> tuple[int, int, int]:
    return tuple(
        int(round(start[idx] + (end[idx] - start[idx]) * t))
        for idx in range(3)
    )


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _summarize_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": manifest["schemaVersion"],
        "cases": [
            {
                "caseName": case["caseName"],
                "timeOfDay": case["timeOfDay"],
                "views": [view["view"] for view in case["views"]],
            }
            for case in manifest["cases"]
        ],
    }


def _posix(path: Path) -> str:
    return path.as_posix()


if __name__ == "__main__":
    main()
