"""옵션 C-1 효과 측정 — view-별 negative_prompt suffix 적용 후 5뷰 재렌더.

Before: outputs/ifc2img_seed_sweep/seed_0007/ (seed=7, base negative만)
After:  outputs/ifc2img_option_c1/ (seed=7, view=v 전달 → iso_nw/iso_se에 차단 토큰 합성)

depth는 outputs/ifc2img_seed_sweep/depth/ 재사용.
"""

from __future__ import annotations

import io
import sys
import time
from pathlib import Path

# Windows cp949 콘솔 utf-8 래핑.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from PIL import Image

from ai_rendering.ifc2img import (
    DepthStyleRenderer,
    IFCView,
    load_preset,
)

ROOT = Path(__file__).resolve().parents[1]
DEPTH_DIR = ROOT / "outputs" / "ifc2img_seed_sweep" / "depth"
OUT_DIR = ROOT / "outputs" / "ifc2img_option_c1"
PRESET = "scandinavian"
VIEWS = [IFCView.FRONT, IFCView.SIDE, IFCView.ISO_NE, IFCView.ISO_NW, IFCView.ISO_SE]


def main() -> int:
    if not DEPTH_DIR.exists():
        print(f"[error] depth dir not found: {DEPTH_DIR}", file=sys.stderr)
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("[SD] DepthStyleRenderer 로드 중...")
    t0 = time.time()
    style_renderer = DepthStyleRenderer()
    print(f"  로드 완료 ({time.time() - t0:.1f}s) device={style_renderer.device}")

    params = load_preset(PRESET)
    print(f"[preset] {PRESET} seed={params.seed} cn_scale={params.controlnet_conditioning_scale}")

    total = len(VIEWS)
    for i, view in enumerate(VIEWS, start=1):
        depth_path = DEPTH_DIR / f"depth_{view.value}.png"
        depth = Image.open(depth_path)
        t1 = time.time()
        result = style_renderer.render(depth, params, view=view)
        out_path = OUT_DIR / f"style_{view.value}_{PRESET}.png"
        result.save(out_path)
        print(f"  [{i}/{total}] {view.value:7s} → {out_path.name} ({time.time() - t1:.1f}s)")

    print(f"\n완료: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
