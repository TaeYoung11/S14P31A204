"""ifc2img v2 baseline 풀 렌더 — IFC → depth 5뷰 → SD 5장.

baseline 정의 (2026-04-28 확정):
- seed=7 (presets.py 명시)
- guidance=7, steps=25
- cn_scale base 0.7, iso_nw/iso_se override 1.0
- view-aware prompt suffix (iso_ne/nw/se 환경 묘사)
- view-aware negative suffix 비활성 (C-1 폐기)
- DEFAULT_RENDER_VIEWS 5개: front/side/iso_ne/iso_nw/iso_se
- render(depth, params, view=v) 단일 진입점

호출 진입점만 사용 — 모든 view-aware 합성/override 자동.

출력: outputs/ifc2img_baseline/{depth_*,style_*}.png
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

    # 1) IFC → depth 5뷰
    print("[depth] IFCRenderer 로드 + 렌더 중...")
    t0 = time.time()
    ifc_renderer = IFCRenderer(
        width=768,
        height=448,
        auto_zoom=AutoZoomMode.ITERATIVE,
    )
    depth_images = ifc_renderer.render_views(IFC_PATH)  # views=None → DEFAULT_RENDER_VIEWS
    for view, img in depth_images.items():
        path = OUT_DIR / f"depth_{view.value}.png"
        img.save(path)
        print(f"  {view.value:7s} → {path.name}")
    print(f"  depth 완료 ({time.time() - t0:.1f}s)\n")

    # 2) DepthStyleRenderer 로드 + 5뷰 추론 (view 인자로 baseline 합성/override 자동 적용)
    print("[SD] DepthStyleRenderer 로드 중...")
    t1 = time.time()
    style_renderer = DepthStyleRenderer()
    print(f"  로드 완료 ({time.time() - t1:.1f}s) device={style_renderer.device}\n")

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
            f"  [{i}/{total}] {view.value:7s} → {out_path.name} ({time.time() - t2:.1f}s)"
        )

    print(f"\n완료: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
