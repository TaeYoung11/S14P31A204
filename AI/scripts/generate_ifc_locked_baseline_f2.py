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

import numpy as np
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
DAY_CATEGORY_COLORS = {
    "floor": (145, 255, 0),
    "wall": (236, 232, 232),
    "roof": (236, 132, 145),
    "window": (20, 129, 186),
    "door": (214, 166, 94),
}
NIGHT_CATEGORY_COLORS = {
    "floor": (128, 230, 0),
    "wall": (210, 205, 210),
    "roof": (224, 124, 138),
    "window": (26, 118, 176),
    "door": (184, 140, 84),
}


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


def generate_ifc_locked_baseline_f2_for_time_of_day(
    *,
    time_of_day: str,
    debug_manifest_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    """Single-TOD F-2 baseline generator for soft_lock photo pipeline callers."""
    output_dir.mkdir(parents=True, exist_ok=True)
    debug_manifest = _load_json(debug_manifest_path)
    case_name = f"ifc_locked_baseline_{time_of_day.lower()}"
    case = _generate_case(
        case_name=case_name,
        time_of_day=time_of_day,
        debug_manifest=debug_manifest,
        debug_manifest_path=debug_manifest_path,
        case_output_dir=output_dir / case_name,
    )
    manifest = {
        "schemaVersion": "ifc2img.f2IfcLockedBaseline.v1",
        "contract": {
            "geometryIdentical": True,
            "buildingSource": "elementMaskRecomposite",
            "diffusionUsed": False,
            "scope": "single_time_of_day",
        },
        "sources": {"debugManifest": _posix(debug_manifest_path)},
        "cases": [case],
    }
    (output_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


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
            "buildingSource": "elementMaskRecomposite",
            "backgroundPolicy": (
                "Building pixels are recomposed from IFC element masks and "
                "canonical category colors. "
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
            (
                "No-background output is a clean IFC element-mask recomposite "
                "with transparent background."
            ),
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
        building_rgba = _build_building_rgba(
            Image.open(color_composite_path).convert("RGBA"),
            element_mask_paths={
                key: debug_manifest_path.parent.parent / str(value)
                for key, value in element_masks.items()
                if isinstance(value, str)
            },
            time_of_day=time_of_day,
        )
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


def _build_building_rgba(
    color_composite: Image.Image,
    *,
    element_mask_paths: dict[str, Path],
    time_of_day: str,
) -> Image.Image:
    rgba = color_composite.convert("RGBA")
    width, height = rgba.size
    source = np.asarray(rgba.convert("RGB"), dtype=np.uint8)
    out = np.zeros((height, width, 4), dtype=np.uint8)
    palette = DAY_CATEGORY_COLORS if time_of_day == "DAY" else NIGHT_CATEGORY_COLORS

    # Compose stable category colors so gray shading artifacts baked into the
    # raw IFC composite do not leak into the F-2 baseline.
    for category in ("floor", "wall", "roof", "window", "door"):
        mask = _load_mask(element_mask_paths.get(category), (width, height))
        active = mask > 0.5
        if not np.any(active):
            continue
        out[active, :3] = np.asarray(palette[category], dtype=np.uint8)
        out[active, 3] = 255

    # Preserve any remaining non-black IFC pixels that are not covered by the
    # known semantic masks so we do not accidentally erase valid geometry.
    source_active = np.any(source != 0, axis=2)
    uncovered = source_active & (out[..., 3] == 0)
    out[uncovered, :3] = source[uncovered]
    out[uncovered, 3] = 255
    return Image.fromarray(out, mode="RGBA")


def _load_mask(path: Path | None, size: tuple[int, int]) -> np.ndarray:
    if path is None or not path.exists():
        return np.zeros((size[1], size[0]), dtype=np.float32)
    mask = Image.open(path).convert("L")
    if mask.size != size:
        mask = mask.resize(size, Image.Resampling.NEAREST)
    return np.asarray(mask, dtype=np.float32) / 255.0


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
