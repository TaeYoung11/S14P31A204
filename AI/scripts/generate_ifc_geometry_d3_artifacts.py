"""Generate Phase D-3 IFC geometry control artifacts for shinchan tuning."""

from __future__ import annotations

import argparse
import json
from collections.abc import Callable
from dataclasses import dataclass, replace
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from ai_rendering.ifc2img import service
from ai_rendering.ifc2img.style import DepthStyleParams


DEFAULT_IFC_PATH = Path("packages/ai-rendering/tests/fixtures/ifc/shinchan.ifc")
DEFAULT_OUTPUT_DIR = Path("outputs/ifc_geometry_d3_artifacts")
STRUCTURE_NEGATIVE_TERMS = (
    "extra floors, wrong roof, misplaced windows, changed silhouette, "
    "extra windows, missing entrance door, altered building mass"
)
VIEWS = ("front_diagonal_left", "front_diagonal_right")


@dataclass(frozen=True)
class GeometryD3Case:
    name: str
    controlnet_conditioning_scale: float
    guidance_scale: float | None = None
    negative_suffix: str = ""


D3_CASES = (
    GeometryD3Case("baseline_depth", 1.15),
    GeometryD3Case("strong_depth_1_35", 1.35),
    GeometryD3Case("strong_depth_1_55", 1.55),
    GeometryD3Case(
        "strong_depth_structure_negative",
        1.35,
        negative_suffix=STRUCTURE_NEGATIVE_TERMS,
    ),
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Phase D-3 geometry strength and control-input probes."
    )
    parser.add_argument(
        "--ifc",
        type=Path,
        default=DEFAULT_IFC_PATH,
        help=f"Input IFC path. Defaults to {DEFAULT_IFC_PATH}.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory. Defaults to {DEFAULT_OUTPUT_DIR}.",
    )
    parser.add_argument("--preset", default="korean_house")
    parser.add_argument("--time-of-day", default="DAY", choices=("DAY", "NIGHT"))
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    manifest = generate_ifc_geometry_d3_artifacts(
        ifc_path=args.ifc,
        output_dir=args.output,
        preset=args.preset,
        time_of_day=args.time_of_day,
    )
    manifest_path = args.output / "geometry_d3_manifest.json"
    print(f"[geometry-d3] wrote {manifest_path}")
    print(json.dumps(_summarize_manifest(manifest), ensure_ascii=False, indent=2))


def generate_ifc_geometry_d3_artifacts(
    *,
    ifc_path: Path,
    output_dir: Path,
    preset: str,
    time_of_day: str,
) -> dict[str, object]:
    ifc_path = ifc_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    case_payloads = []
    original_load_preset = service.load_preset
    for case in D3_CASES:
        case_dir = output_dir / case.name
        _run_strength_case(
            case=case,
            ifc_path=ifc_path,
            case_dir=case_dir,
            preset=preset,
            time_of_day=time_of_day,
            original_load_preset=original_load_preset,
        )
        debug_manifest = _load_debug_manifest(case_dir)
        control_probes = _write_control_probe_artifacts(case_dir, debug_manifest)
        case_payloads.append(
            {
                "caseName": case.name,
                "caseDir": _posix(case_dir),
                "controlnetConditioningScale": case.controlnet_conditioning_scale,
                "guidanceScale": case.guidance_scale,
                "negativeSuffix": case.negative_suffix,
                "photoArtifacts": _photo_artifacts(case_dir),
                "controlProbeArtifacts": control_probes,
            }
        )

    contact_sheets = _write_contact_sheets(output_dir)
    manifest = {
        "schemaVersion": "ifc2img.geometryD3Artifacts.v1",
        "sourceIfcPath": str(ifc_path),
        "preset": preset,
        "timeOfDay": time_of_day,
        "cases": case_payloads,
        "contactSheets": contact_sheets,
        "notes": [
            "Strength variants are generated through the current depth ControlNet path.",
            "Edge and element control probes are artifacts only; "
            "production control input is unchanged.",
        ],
    }
    (output_dir / "geometry_d3_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def _run_strength_case(
    *,
    case: GeometryD3Case,
    ifc_path: Path,
    case_dir: Path,
    preset: str,
    time_of_day: str,
    original_load_preset: Callable[..., DepthStyleParams],
) -> None:
    def load_case_preset(name: str, time_of_day: str = "day") -> DepthStyleParams:
        params = original_load_preset(name, time_of_day)
        negative_prompt = params.negative_prompt
        if case.negative_suffix:
            negative_prompt = f"{negative_prompt}, {case.negative_suffix}"
        return replace(
            params,
            negative_prompt=negative_prompt,
            guidance_scale=case.guidance_scale
            if case.guidance_scale is not None
            else params.guidance_scale,
            controlnet_conditioning_scale=case.controlnet_conditioning_scale,
        )

    previous = service.load_preset
    service.load_preset = load_case_preset
    try:
        service.run_ifc2img_photo_pipeline(
            ifc_path,
            case_dir,
            preset=preset,
            time_of_day=time_of_day,
            debug_artifacts=True,
        )
    finally:
        service.load_preset = previous


def _load_debug_manifest(case_dir: Path) -> dict[str, object]:
    return json.loads((case_dir / "debug" / "debug_manifest.json").read_text(encoding="utf-8"))


def _write_control_probe_artifacts(
    case_dir: Path,
    debug_manifest: dict[str, object],
) -> list[dict[str, object]]:
    probes = []
    views = debug_manifest.get("views", [])
    if not isinstance(views, list):
        return probes
    for view_payload in views:
        if not isinstance(view_payload, dict):
            continue
        view = str(view_payload.get("view"))
        files = view_payload.get("files")
        if not isinstance(files, dict):
            continue
        element_files = files.get("elementMasks")
        if not isinstance(element_files, dict):
            continue
        debug_dir = case_dir / "debug"
        element_path = case_dir / str(element_files["composite"])
        depth_path = case_dir / str(files["depthImage"])
        edge_path = debug_dir / f"geometry_edge_silhouette_{view}.png"
        depth_edge_path = debug_dir / f"geometry_depth_edge_{view}.png"
        element_control_path = debug_dir / f"geometry_element_composite_control_{view}.png"
        _build_edge_silhouette(element_path).save(edge_path, format="PNG")
        _build_edge_silhouette(depth_path).save(depth_edge_path, format="PNG")
        with Image.open(element_path) as element_image:
            element_image.convert("RGB").save(element_control_path, format="PNG")
        probes.append(
            {
                "view": view,
                "edgeSilhouette": _posix(edge_path),
                "depthEdge": _posix(depth_edge_path),
                "elementCompositeControl": _posix(element_control_path),
            }
        )
    return probes


def _build_edge_silhouette(path: Path) -> Image.Image:
    with Image.open(path) as image:
        mask = image.convert("L").point(lambda value: 255 if value > 0 else 0)
    edges = mask.filter(ImageFilter.FIND_EDGES)
    return edges.filter(ImageFilter.MaxFilter(3)).convert("RGB")


def _photo_artifacts(case_dir: Path) -> dict[str, str]:
    return {
        view: _posix(case_dir / f"photo_{view}.png")
        for view in VIEWS
        if (case_dir / f"photo_{view}.png").exists()
    }


def _write_contact_sheets(output_dir: Path) -> dict[str, str]:
    sheets = {
        "photos": output_dir / "geometry_d3_photos_contact_sheet.png",
        "controls": output_dir / "geometry_d3_control_probes_contact_sheet.png",
    }
    _write_photo_contact_sheet(output_dir, sheets["photos"])
    _write_control_contact_sheet(output_dir, sheets["controls"])
    return {key: _posix(path) for key, path in sheets.items()}


def _write_photo_contact_sheet(output_dir: Path, out_path: Path) -> None:
    case_dirs = [output_dir / case.name for case in D3_CASES]
    _write_sheet(
        out_path=out_path,
        rows=[case.name for case in D3_CASES],
        cols=list(VIEWS),
        image_for=lambda row, col: case_dirs[row] / f"photo_{col}.png",
    )


def _write_control_contact_sheet(output_dir: Path, out_path: Path) -> None:
    case_dir = output_dir / D3_CASES[0].name
    cols = ["edge", "depth_edge", "element"]

    def image_for(row: int, col: str) -> Path:
        view = VIEWS[row]
        names = {
            "edge": f"geometry_edge_silhouette_{view}.png",
            "depth_edge": f"geometry_depth_edge_{view}.png",
            "element": f"geometry_element_composite_control_{view}.png",
        }
        return case_dir / "debug" / names[col]

    _write_sheet(
        out_path=out_path,
        rows=list(VIEWS),
        cols=cols,
        image_for=image_for,
    )


def _write_sheet(
    *,
    out_path: Path,
    rows: list[str],
    cols: list[str],
    image_for: Callable[[int, str], Path],
) -> None:
    thumb_size = (220, 128)
    cell_w, cell_h = 220, 158
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    sheet = Image.new("RGB", (cell_w * len(cols), cell_h * (len(rows) + 1)), "white")
    draw = ImageDraw.Draw(sheet)
    for col_index, col in enumerate(cols):
        draw.text((col_index * cell_w + 8, 8), col, fill="black", font=font)
    for row_index, row in enumerate(rows, start=1):
        draw.text((8, row_index * cell_h + 4), row, fill="black", font=font)
        for col_index, col in enumerate(cols):
            path = image_for(row_index - 1, col)
            if not path.exists():
                continue
            with Image.open(path) as image:
                thumb = image.convert("RGB")
                thumb.thumbnail(thumb_size, Image.Resampling.LANCZOS)
                canvas = Image.new("RGB", thumb_size, "white")
                canvas.paste(
                    thumb,
                    ((thumb_size[0] - thumb.width) // 2, (thumb_size[1] - thumb.height) // 2),
                )
            sheet.paste(canvas, (col_index * cell_w, row_index * cell_h + 26))
    sheet.save(out_path, format="PNG")


def _summarize_manifest(manifest: dict[str, object]) -> dict[str, object]:
    return {
        "schemaVersion": manifest["schemaVersion"],
        "caseCount": len(manifest["cases"]),
        "contactSheets": manifest["contactSheets"],
    }


def _posix(path: Path | None) -> str:
    if path is None:
        return ""
    return path.as_posix()


if __name__ == "__main__":
    main()
