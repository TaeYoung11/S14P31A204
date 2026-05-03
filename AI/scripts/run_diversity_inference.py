"""IFC 다양성 검증 — SD 추론 (3 fixture × 8뷰 × 1 preset).

`run_diversity_check.py`로 추출한 depth 24장을 SD 1.5 + ControlNet-depth로
추론. baseline 설정 그대로 (seed=7, guidance=7, steps=25, cn_base=1.15,
view-aware prompt suffix). cn_scale은 옵션 N(2026-04-29) 후 1.15 일관 —
view별 override는 모두 None(VIEW_CN_SCALE_OVERRIDES 정책).

기본 preset = scandinavian (옵션 A — EYE_* 품질 빠르게 확인 → 미세 조정 →
필요 시 다른 preset 확장).

사용:
    python scripts/run_diversity_inference.py
    python scripts/run_diversity_inference.py outputs/ifc2img_diversity_v2
    python scripts/run_diversity_inference.py outputs/diversity_v4_haus --fixture=Haus

CLI 인자:
  positional out_dir : 출력 경로(default `outputs/ifc2img_diversity/`).
  --fixture=<substr> : fixture 이름에 substr 포함하는 fixture만 처리(부분 일치).
                       빠른 처방 검증에 활용 (3 fixture → 1 fixture, ~6분 → ~2분).
출력: <out_dir>/{stem}/styled_{preset}_{view}.png  (필터 없으면 3 × 8 = 24장)
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
    fixture_filter: str | None = None
    positional: list[str] = []
    for arg in sys.argv[1:]:
        if arg.startswith("--fixture="):
            fixture_filter = arg.split("=", 1)[1]
        else:
            positional.append(arg)

    out_root = Path(positional[0]).resolve() if positional else DEFAULT_OUT_ROOT
    fixtures = (
        [f for f in FIXTURES if fixture_filter.lower() in f.name.lower()]
        if fixture_filter
        else FIXTURES
    )
    if not fixtures:
        print(
            f"[error] no fixture matches --fixture={fixture_filter!r}",
            file=sys.stderr,
        )
        return 2

    missing = [f for f in fixtures if not f.exists()]
    if missing:
        print("[error] fixtures not found:", file=sys.stderr)
        for m in missing:
            print(f"  {m}", file=sys.stderr)
        return 2

    print(f"[fixtures] {len(fixtures)}개" + (
        f" (필터 --fixture={fixture_filter})" if fixture_filter else ""
    ))
    for f in fixtures:
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
    for fixture in fixtures:
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
        f"완료: {total_styled}장 ({len(fixtures)} fixtures × "
        f"{len(DEFAULT_RENDER_VIEWS)} 뷰), 총 {time.time() - grand_t0:.1f}s"
    )
    print(f"산출물: {out_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
