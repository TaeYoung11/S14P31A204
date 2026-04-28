"""cn_scale sweep — iso_nw / iso_se 두 시점에서 depth 구속 강도 탐색.

5개 cn_scale × 2 뷰 = 10장. seed=7 고정, prompt/negative는 base preset 그대로.
다른 시점(front/side/iso_ne)은 sweep 비대상 — 이미 안정적, 비용 절감.

depth는 outputs/ifc2img_seed_sweep/depth/ 재사용.

출력: outputs/ifc2img_cn_scale_sweep/cn_{scale*100:03d}/style_{view}_scandinavian.png
"""

from __future__ import annotations

import io
import sys
import time
from dataclasses import replace
from pathlib import Path

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
OUT_ROOT = ROOT / "outputs" / "ifc2img_cn_scale_sweep"
PRESET = "scandinavian"
VIEWS = [IFCView.ISO_NW, IFCView.ISO_SE]
CN_SCALES = [0.7, 0.85, 1.0, 1.15, 1.3]


def main() -> int:
    if not DEPTH_DIR.exists():
        print(f"[error] depth dir not found: {DEPTH_DIR}", file=sys.stderr)
        return 2

    print("[SD] DepthStyleRenderer 로드 중...")
    t0 = time.time()
    style_renderer = DepthStyleRenderer()
    print(f"  로드 완료 ({time.time() - t0:.1f}s) device={style_renderer.device}")

    base_params = load_preset(PRESET)
    print(
        f"[preset] {PRESET} seed={base_params.seed} "
        f"base_cn_scale={base_params.controlnet_conditioning_scale}"
    )

    total = len(CN_SCALES) * len(VIEWS)
    done = 0
    for cn in CN_SCALES:
        out_dir = OUT_ROOT / f"cn_{int(round(cn * 100)):03d}"
        out_dir.mkdir(parents=True, exist_ok=True)
        params = replace(base_params, controlnet_conditioning_scale=cn)
        for view in VIEWS:
            depth = Image.open(DEPTH_DIR / f"depth_{view.value}.png")
            done += 1
            t1 = time.time()
            result = style_renderer.render(depth, params, view=view)
            out_path = out_dir / f"style_{view.value}_{PRESET}.png"
            result.save(out_path)
            print(
                f"  [{done:2d}/{total}] cn={cn:.2f}  {view.value:7s} "
                f"→ {out_path.relative_to(ROOT)} ({time.time() - t1:.1f}s)"
            )

    print(f"\n완료: {OUT_ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
