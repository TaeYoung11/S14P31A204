"""Run the ifc2img baseline over the supported production views.

Supported views are front, side, front_diagonal_right, and front_diagonal_left.
Output: outputs/ifc2img_baseline/{depth_*,style_*}.png
"""

from __future__ import annotations

import io
import sys
import time
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from ai_rendering.ifc2img import (
    DepthStyleRenderer,
    IFCRenderer,
    load_preset,
)
from ai_rendering.ifc2img.views import DEFAULT_RENDER_VIEWS, AutoZoomMode

ROOT = Path(__file__).resolve().parents[1]
IFC_PATH = ROOT / "packages" / "ai-rendering" / "tests" / "fixtures" / "ifc" / "AC20-FZK-Haus.ifc"
OUT_DIR = ROOT / "outputs" / "ifc2img_baseline"
PRESET = "scandinavian"


def main() -> int:
    if not IFC_PATH.exists():
        print(f"[error] IFC not found: {IFC_PATH}", file=sys.stderr)
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[input] {IFC_PATH.name}")
    print(f"[preset] {PRESET}")
    print(f"[views] {[v.value for v in DEFAULT_RENDER_VIEWS]}")
    print(f"[output] {OUT_DIR}\n")

    # 1) IFC ??depth 5酉?
    print("[depth] IFCRenderer 濡쒕뱶 + ?뚮뜑 以?..")
    t0 = time.time()
    ifc_renderer = IFCRenderer(
        width=768,
        height=448,
        auto_zoom=AutoZoomMode.ITERATIVE,
    )
    depth_images = ifc_renderer.render_views(IFC_PATH)  # views=None ??DEFAULT_RENDER_VIEWS
    for view, img in depth_images.items():
        path = OUT_DIR / f"depth_{view.value}.png"
        img.save(path)
        print(f"  {view.value:7s} ??{path.name}")
    print(f"  depth ?꾨즺 ({time.time() - t0:.1f}s)\n")

    # 2) DepthStyleRenderer 濡쒕뱶 + 5酉?異붾줎 (view ?몄옄濡?baseline ?⑹꽦/override ?먮룞 ?곸슜)
    print("[SD] DepthStyleRenderer 濡쒕뱶 以?..")
    t1 = time.time()
    style_renderer = DepthStyleRenderer()
    print(f"  濡쒕뱶 ?꾨즺 ({time.time() - t1:.1f}s) device={style_renderer.device}\n")

    params = load_preset(PRESET)
    print(
        f"[params] seed={params.seed} guidance={params.guidance_scale} "
        f"steps={params.num_inference_steps} cn_base={params.controlnet_conditioning_scale}"
    )

    total = len(depth_images)
    for i, (view, depth) in enumerate(depth_images.items(), start=1):
        t2 = time.time()
        result = style_renderer.render(depth, params, view=view)
        out_path = OUT_DIR / f"style_{view.value}_{PRESET}.png"
        result.save(out_path)
        print(
            f"  [{i}/{total}] {view.value:7s} ??{out_path.name} ({time.time() - t2:.1f}s)"
        )

    print(f"\n?꾨즺: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

