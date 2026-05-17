"""Phase H-3 Real-ESRGAN x4 upscale + full model comparison matrix.

1. Takes H-1.b hot DAY+NIGHT outputs (4 images at 768x448)
2. Upscales each with Real-ESRGAN x4 -> 3072x1792
3. Builds a comprehensive model matrix contact sheet across all completed
   phases: G-4 / H-1.b / H-2 SDXL base / H-2 Juggernaut+Lightning /
   H-2 Juggernaut full / H-3 upscaled.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_H1_DIR = ROOT / "outputs/ifc_geometry_h1_cn11_sweep"
DEFAULT_OUTPUT_ROOT = ROOT / "outputs/ifc_geometry_h3_realesrgan"
DEFAULT_MATRIX_OUTPUT = ROOT / "outputs/model_full_matrix.png"

DEFAULT_G4_DIR = ROOT / "outputs/ifc_geometry_g4_soft_lock_diffusion_realvision"
DEFAULT_H2_SDXL_DIR = ROOT / "outputs/ifc_geometry_h2_sdxl"
DEFAULT_H2_JLIGHT_DIR = ROOT / "outputs/ifc_geometry_h2_sdxl_juggernaut_lightning"
DEFAULT_H2_JFULL_DIR = ROOT / "outputs/ifc_geometry_h2_sdxl_juggernaut_full"

VIEWS = ("front_diagonal_left", "front_diagonal_right")
TIMES = ("DAY", "NIGHT")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Phase H-3 Real-ESRGAN upscale + full model matrix."
    )
    parser.add_argument("--h1-dir", type=Path, default=DEFAULT_H1_DIR)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--matrix-output", type=Path, default=DEFAULT_MATRIX_OUTPUT)
    parser.add_argument("--g4-dir", type=Path, default=DEFAULT_G4_DIR)
    parser.add_argument("--h2-sdxl-dir", type=Path, default=DEFAULT_H2_SDXL_DIR)
    parser.add_argument("--h2-jlight-dir", type=Path, default=DEFAULT_H2_JLIGHT_DIR)
    parser.add_argument("--h2-jfull-dir", type=Path, default=DEFAULT_H2_JFULL_DIR)
    parser.add_argument("--skip-upscale", action="store_true",
                        help="Reuse existing H-3 outputs and only rebuild matrix.")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    output_root: Path = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    upscaled_dir = output_root / "upscaled"
    upscaled_dir.mkdir(parents=True, exist_ok=True)

    upscaled_paths: dict[tuple[str, str], Path] = {}
    if not args.skip_upscale:
        upscaled_paths = _run_upscale(
            h1_dir=args.h1_dir.resolve(),
            upscaled_dir=upscaled_dir,
        )
    else:
        for tod in TIMES:
            for view in VIEWS:
                candidate = upscaled_dir / f"h3_{tod.lower()}_{view}_x4.png"
                if candidate.exists():
                    upscaled_paths[(tod, view)] = candidate

    _write_h3_winner_sheet(output_root, upscaled_paths)
    _write_h3_manifest(output_root, args, upscaled_paths)
    _write_model_full_matrix(
        matrix_output=args.matrix_output.resolve(),
        h1_dir=args.h1_dir.resolve(),
        g4_dir=args.g4_dir.resolve(),
        h2_sdxl_dir=args.h2_sdxl_dir.resolve(),
        h2_jlight_dir=args.h2_jlight_dir.resolve(),
        h2_jfull_dir=args.h2_jfull_dir.resolve(),
        upscaled_paths=upscaled_paths,
    )
    print(f"[h3] done. outputs at {output_root}")


def _run_upscale(*, h1_dir: Path, upscaled_dir: Path) -> dict[tuple[str, str], Path]:
    from ai_rendering.ifc2img.postprocess import RealEsrganUpscaler

    print("[h3] loading Real-ESRGAN upscaler")
    t0 = time.time()
    upscaler = RealEsrganUpscaler()
    print(f"[h3] upscaler loaded {time.time() - t0:.1f}s on {upscaler.device}")

    results: dict[tuple[str, str], Path] = {}
    for tod in TIMES:
        sweep_dir = h1_dir / f"sweep_{tod.lower()}"
        for view in VIEWS:
            # H-1.b hot manifests use seed42 naming
            src = sweep_dir / f"h1_{tod.lower()}_{view}_seed42.png"
            if not src.exists():
                # try sweep_day_b (where H-1.b hot inline-generated NIGHT lived)
                alt = h1_dir / f"sweep_{tod.lower()}_b" / (
                    f"h1b_cn11_hot_{view}.png"
                    if tod == "DAY"
                    else f"h1b_cn11_hot_night_{view}.png"
                )
                if alt.exists():
                    src = alt
            if not src.exists():
                print(f"[h3] skip {tod} {view}: no source at {src}")
                continue
            t1 = time.time()
            image = Image.open(src).convert("RGB")
            up = upscaler.upscale_image(image)
            out = upscaled_dir / f"h3_{tod.lower()}_{view}_x4.png"
            up.save(out, format="PNG")
            print(
                f"[h3] {tod} {view} {src.name} -> {up.size} "
                f"in {time.time() - t1:.1f}s"
            )
            results[(tod, view)] = out
    return results


def _write_h3_winner_sheet(
    output_root: Path,
    upscaled_paths: dict[tuple[str, str], Path],
) -> None:
    if not upscaled_paths:
        return
    sample = Image.open(next(iter(upscaled_paths.values()))).convert("RGB")
    w_native, h_native = sample.size
    cell_w = 640
    cell_h = int(cell_w * h_native / max(w_native, 1))
    header = 30
    cols = 2
    rows = 2
    canvas = Image.new("RGB", (cols * cell_w, rows * (cell_h + header)), (248, 248, 248))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for idx, tod in enumerate(TIMES):
        for vi, view in enumerate(VIEWS):
            row, col = idx, vi
            x = col * cell_w
            y = row * (cell_h + header)
            label = f"{tod} {view}  (Real-ESRGAN x4 -> {w_native}x{h_native})"
            draw.text((x + 8, y + 8), label, fill=(20, 20, 20), font=font)
            p = upscaled_paths.get((tod, view))
            if p and p.exists():
                fitted = Image.open(p).convert("RGB").resize(
                    (cell_w, cell_h), Image.Resampling.LANCZOS
                )
                canvas.paste(fitted, (x, y + header))
    out = output_root / "h3_winner_day_night_sheet.png"
    canvas.save(out, format="PNG")
    print(f"[h3] winner DAY/NIGHT sheet -> {out}")


def _write_h3_manifest(
    output_root: Path,
    args: argparse.Namespace,
    upscaled_paths: dict[tuple[str, str], Path],
) -> None:
    payload = {
        "schemaVersion": "ifc2img.h3RealEsrganX4.v1",
        "phase": "H-3",
        "model": "RealESRGAN_x4plus",
        "scale": 4,
        "sourceH1Dir": args.h1_dir.as_posix(),
        "upscaled": {
            f"{tod}|{view}": path.as_posix()
            for (tod, view), path in upscaled_paths.items()
        },
    }
    out = output_root / "h3_manifest.json"
    out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[h3] manifest -> {out}")


def _write_model_full_matrix(
    *,
    matrix_output: Path,
    h1_dir: Path,
    g4_dir: Path,
    h2_sdxl_dir: Path,
    h2_jlight_dir: Path,
    h2_jfull_dir: Path,
    upscaled_paths: dict[tuple[str, str], Path],
) -> None:
    """Compare every completed model variant on DAY+NIGHT × left+right."""
    columns = [
        ("G-4 (SD1.5+RV6, CN1.0, 512x320)", _g4_resolver(g4_dir)),
        ("H-1.b hot (SD1.5+RV6, CN1.1, 768x448)", _h1_resolver(h1_dir)),
        ("H-2 SDXL base (1024x640)", _h2_sdxl_resolver(h2_sdxl_dir)),
        ("H-2 Juggernaut+Lightning-8", _h2_resolver(h2_jlight_dir)),
        ("H-2 Juggernaut full (1024x640)", _h2_resolver(h2_jfull_dir)),
        ("H-3 H-1.b x4 (Real-ESRGAN, 3072x1792)", _h3_resolver(upscaled_paths)),
    ]
    rows: list[tuple[str, str]] = []
    for tod in TIMES:
        for view in VIEWS:
            rows.append((tod, view))

    cell_w = 360
    cell_h = 220
    header_h = 50
    row_label_w = 240
    canvas_w = row_label_w + len(columns) * cell_w
    canvas_h = header_h + len(rows) * cell_h
    canvas = Image.new("RGB", (canvas_w, canvas_h), (245, 245, 245))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for ci, (label, _) in enumerate(columns):
        for li, line in enumerate(_wrap_label(label, 42)):
            draw.text(
                (row_label_w + ci * cell_w + 6, 6 + li * 14),
                line,
                fill=(20, 20, 20),
                font=font,
            )
    for ri, (tod, view) in enumerate(rows):
        y = header_h + ri * cell_h
        draw.text(
            (6, y + cell_h // 2 - 6),
            f"{tod}\n{view}",
            fill=(20, 20, 20),
            font=font,
        )
        for ci, (_, resolver) in enumerate(columns):
            x = row_label_w + ci * cell_w
            path = resolver(tod, view)
            if path and path.exists():
                image = Image.open(path).convert("RGB")
                w, h = image.size
                scale = min((cell_w - 4) / w, (cell_h - 4) / h)
                new_size = (max(int(w * scale), 1), max(int(h * scale), 1))
                fitted = image.resize(new_size, Image.Resampling.LANCZOS)
                px = x + (cell_w - new_size[0]) // 2
                py = y + (cell_h - new_size[1]) // 2
                canvas.paste(fitted, (px, py))
            else:
                draw.rectangle(
                    [(x + 2, y + 2), (x + cell_w - 2, y + cell_h - 2)],
                    outline=(180, 60, 60),
                )
                draw.text(
                    (x + 8, y + cell_h // 2 - 6),
                    "missing",
                    fill=(180, 60, 60),
                    font=font,
                )
    matrix_output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(matrix_output, format="PNG")
    print(f"[h3] full model matrix -> {matrix_output}")


def _wrap_label(label: str, width: int) -> list[str]:
    words = label.split()
    lines: list[str] = []
    current = ""
    for w in words:
        candidate = (current + " " + w).strip()
        if len(candidate) > width and current:
            lines.append(current)
            current = w
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _g4_resolver(g4_dir: Path):
    def _resolve(tod: str, view: str) -> Path | None:
        return g4_dir / f"final_{tod.lower()}" / (
            f"diffusion_soft_lock_final_s055_{tod.lower()}_{view}.png"
        )
    return _resolve


def _h1_resolver(h1_dir: Path):
    def _resolve(tod: str, view: str) -> Path | None:
        # Latest H-1.b hot (DAY: sweep_day from updated script; NIGHT: sweep_night_b inline)
        candidates = [
            h1_dir / f"sweep_{tod.lower()}" / f"h1_{tod.lower()}_{view}_seed42.png",
            h1_dir / f"sweep_{tod.lower()}_b" / (
                f"h1b_cn11_hot_{view}.png"
                if tod == "DAY"
                else f"h1b_cn11_hot_night_{view}.png"
            ),
        ]
        for c in candidates:
            if c.exists():
                return c
        return None
    return _resolve


def _h2_sdxl_resolver(h2_sdxl_dir: Path):
    def _resolve(tod: str, view: str) -> Path | None:
        if tod == "NIGHT":
            return None  # SDXL base only DAY run
        return h2_sdxl_dir / "sweep_day" / f"h2_day_{view}_seed42.png"
    return _resolve


def _h2_resolver(h2_dir: Path):
    def _resolve(tod: str, view: str) -> Path | None:
        return h2_dir / f"sweep_{tod.lower()}" / f"h2_{tod.lower()}_{view}_seed42.png"
    return _resolve


def _h3_resolver(upscaled_paths: dict[tuple[str, str], Path]):
    def _resolve(tod: str, view: str) -> Path | None:
        return upscaled_paths.get((tod, view))
    return _resolve


if __name__ == "__main__":
    main()
