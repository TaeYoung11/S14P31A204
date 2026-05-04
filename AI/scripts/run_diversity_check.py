"""IFC 다양성 검증 — depth 추출 (3 fixture × 5뷰).

baseline 렌더링 설정이 다른 IFC4 파일에서도 일관 작동하는지 검증하기 위한
*depth 풀 추출*. mesh는 `_align_walls_to_axes`로 벽 normal 기준 axis-aligned
정렬 + 카메라는 정적 vector(`pca_align=False` default).

검증 대상:
- AC20-FZK-Haus.ifc       (단일 주택, 중형 ~10m, baseline 튜닝 기준)
- AC-20-Smiley-West-10-Bldg.ifc (사무실 빌딩, 대형 ~70m, 비대칭 footprint)
- Ifc4_SampleHouse.ifc    (소형 주택 ~5m, IFC 좌표계 회전된 모델)

사용:
    python scripts/run_diversity_check.py
    python scripts/run_diversity_check.py outputs/ifc2img_diversity_v2

CLI 인자로 출력 경로를 덮어쓸 수 있다.
출력: <out_dir>/{fixture_stem}/depth_*.png  (3 × 5 = 15장)
"""

from __future__ import annotations

import io
import sys
import time
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from ai_rendering.ifc2img import IFCRenderer
from ai_rendering.ifc2img.views import DEFAULT_RENDER_VIEWS, AutoZoomMode

ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = ROOT / "packages" / "ai-rendering" / "tests" / "fixtures" / "ifc"
DEFAULT_OUT_ROOT = ROOT / "outputs" / "ifc2img_diversity"

FIXTURES = [
    FIXTURES_DIR / "AC20-FZK-Haus.ifc",
    FIXTURES_DIR / "AC-20-Smiley-West-10-Bldg.ifc",
    FIXTURES_DIR / "Ifc4_SampleHouse.ifc",
]


def _display_path(path: Path) -> Path:
    """진행 출력용 경로 — ROOT 내부면 짧은 상대경로, 외부면 절대경로 그대로.

    out_dir이 ROOT 바깥(예: 다른 드라이브)이면 `relative_to(ROOT)`이 ValueError로
    프로세스가 죽으므로 try/except로 fallback.
    """
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


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

    total_views = 0
    grand_t0 = time.time()
    for fixture in FIXTURES:
        stem = fixture.stem
        out_dir = out_root / stem
        out_dir.mkdir(parents=True, exist_ok=True)

        print(f"[{stem}] depth {len(DEFAULT_RENDER_VIEWS)}뷰 렌더링...")
        t1 = time.time()
        depth_images = ifc_renderer.render_views(fixture)  # views=None → DEFAULT_RENDER_VIEWS
        for view, img in depth_images.items():
            path = out_dir / f"depth_{view.value}.png"
            img.save(path)
            print(f"  {view.value:7s} → {_display_path(path)}")
            total_views += 1
        print(f"  소요: {time.time() - t1:.1f}s\n")

    print(
        f"완료: {total_views}장 ({len(FIXTURES)} fixtures × {len(DEFAULT_RENDER_VIEWS)} 뷰), "
        f"총 {time.time() - grand_t0:.1f}s"
    )
    print(f"산출물: {out_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
