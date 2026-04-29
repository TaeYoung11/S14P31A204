"""IFC 다양성 검증 — SD 추론 (3 fixture × 8뷰 × 1 preset).

`run_diversity_check.py`로 추출한 depth 24장을 SD 1.5 + ControlNet-depth로
추론. baseline 설정 그대로 (seed=7, guidance=7, steps=25, cn_base=0.7,
iso_nw/se override 1.0, view-aware prompt suffix).

기본 preset = scandinavian (옵션 A — EYE_* 품질 빠르게 확인 → 미세 조정 →
필요 시 다른 preset 확장).

사용:
    python scripts/run_diversity_inference.py
    python scripts/run_diversity_inference.py outputs/ifc2img_diversity_v2

CLI 인자로 출력 경로를 덮어쓸 수 있다 — 처방 전후 비교에 활용.
출력: <out_dir>/{stem}/styled_{preset}_{view}.png  (3 × 8 = 24장)
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
FIXTURES_DIR = ROOT / "packages" / "ai-rendering" / "tests" / "fixtures" / "ifc"
DEFAULT_OUT_ROOT = ROOT / "outputs" / "ifc2img_diversity"
PRESET = "scandinavian"

FIXTURES = [
    FIXTURES_DIR / "AC20-FZK-Haus.ifc",
    FIXTURES_DIR / "AC-20-Smiley-West-10-Bldg.ifc",
    FIXTURES_DIR / "Ifc4_SampleHouse.ifc",
]


def main() -> int:
    out_root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUT_ROOT

    missing = [f for f in FIXTURES if not f.exists()]
    if missing:
        print("[error] fixtures not found:", file=sys.stderr)
        for m in missing:
            print(f"  {m}", file=sys.stderr)
        return 2

    print(f"[fixtures] {len(FIXTURES)}개")
    for f in FIXTURES:
        print(f"  - {f.name}")
    print(f"[preset] {PRESET}")
    print(f"[views] {[v.value for v in DEFAULT_RENDER_VIEWS]}")
    print(f"[output] {out_root}\n")

    print("[depth] IFCRenderer 로드...")
    t0 = time.time()
    ifc_renderer = IFCRenderer(
        width=768,
        height=448,
        auto_zoom=AutoZoomMode.ITERATIVE,
    )
    print(f"  로드 완료 ({time.time() - t0:.1f}s)\n")

    print("[SD] DepthStyleRenderer 로드 중...")
    t1 = time.time()
    style_renderer = DepthStyleRenderer()
    print(f"  로드 완료 ({time.time() - t1:.1f}s) device={style_renderer.device}\n")

    params = load_preset(PRESET)
    print(
        f"[params] seed={params.seed} guidance={params.guidance_scale} "
        f"steps={params.num_inference_steps} "
        f"cn_base={params.controlnet_conditioning_scale}\n"
    )

    grand_t0 = time.time()
    total_styled = 0
    for fixture in FIXTURES:
        stem = fixture.stem
        out_dir = out_root / stem
        out_dir.mkdir(parents=True, exist_ok=True)

        print(f"[{stem}] depth {len(DEFAULT_RENDER_VIEWS)}뷰 렌더링...")
        td = time.time()
        depth_images = ifc_renderer.render_views(fixture)
        print(f"  depth 완료 ({time.time() - td:.1f}s)")

        for i, (view, depth) in enumerate(depth_images.items(), start=1):
            ts = time.time()
            result = style_renderer.render(depth, params, view=view)
            out_path = out_dir / f"styled_{PRESET}_{view.value}.png"
            result.save(out_path)
            total_styled += 1
            print(
                f"  [{i}/{len(depth_images)}] {view.value:7s} → "
                f"{out_path.relative_to(ROOT)} ({time.time() - ts:.1f}s)"
            )
        print()

    print(
        f"완료: {total_styled}장 ({len(FIXTURES)} fixtures × "
        f"{len(DEFAULT_RENDER_VIEWS)} 뷰), 총 {time.time() - grand_t0:.1f}s"
    )
    print(f"산출물: {out_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
