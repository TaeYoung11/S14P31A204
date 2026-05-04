"""IFC 다양성 검증 — SD 추론 (N fixture × 5뷰 × preset × time-of-day).

`run_diversity_check.py`로 추출한 depth를 SD 1.5 + ControlNet-depth로 추론.
baseline 설정(seed=7, guidance=7, steps=25, cn 1.15 일관, view-aware prompt suffix).

기본 preset = scandinavian, 기본 time = day. korean_villa/korean_house preset 및
night variant 사용 가능 — 산출물 품질 빠르게 확인 → 미세 조정 → 필요 시 확장.

사용:
    python scripts/run_diversity_inference.py
    python scripts/run_diversity_inference.py outputs/ifc2img_diversity_v2
    python scripts/run_diversity_inference.py outputs/diversity_haus --fixture=Haus
    python scripts/run_diversity_inference.py outputs/haus_night \
        --fixture=Haus --time=night
    python scripts/run_diversity_inference.py outputs/haus_korean \
        --fixture=Haus --preset=korean_villa

CLI 인자:
  positional out_dir : 출력 경로(default `outputs/ifc2img_diversity/`).
  --fixture=<substr> : fixture 이름에 substr 포함하는 fixture만 처리(부분 일치).
                       빠른 처방 검증에 활용 (3 fixture → 1 fixture).
  --preset=<name>    : preset 선택(default `scandinavian`).
                       사용 가능 — `scandinavian` / `korean_villa` / `korean_house`.
  --time=<day|night> : 시간대 선택(default `day`). night는 야간 조명 단서 합성.
출력: <out_dir>/{stem}/styled_{preset}_{time}_{view}.png  (필터 없으면 3 × 5 = 15장)
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
    IFCRenderError,
    list_presets,
    load_preset,
)
from ai_rendering.ifc2img.views import DEFAULT_RENDER_VIEWS, AutoZoomMode

ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = ROOT / "packages" / "ai-rendering" / "tests" / "fixtures" / "ifc"
DEFAULT_OUT_ROOT = ROOT / "outputs" / "ifc2img_diversity"
DEFAULT_PRESET = "scandinavian"
DEFAULT_TIME = "day"

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
    fixture_filter: str | None = None
    preset_name = DEFAULT_PRESET
    time_of_day = DEFAULT_TIME
    positional: list[str] = []
    for arg in sys.argv[1:]:
        if arg.startswith("--fixture="):
            fixture_filter = arg.split("=", 1)[1]
        elif arg.startswith("--preset="):
            preset_name = arg.split("=", 1)[1]
        elif arg.startswith("--time="):
            time_of_day = arg.split("=", 1)[1]
        else:
            positional.append(arg)

    try:
        params = load_preset(preset_name, time_of_day=time_of_day)
    except IFCRenderError as e:
        print(f"[error] {e}", file=sys.stderr)
        print(f"  --preset 사용 가능: {list_presets()}", file=sys.stderr)
        print("  --time 사용 가능: ['day', 'night']", file=sys.stderr)
        return 2

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
    print(f"[preset] {preset_name}")
    print(f"[time] {time_of_day}")
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
            out_path = out_dir / f"styled_{preset_name}_{time_of_day}_{view.value}.png"
            result.save(out_path)
            total_styled += 1
            print(
                f"  [{i}/{len(depth_images)}] {view.value:7s} → "
                f"{_display_path(out_path)} ({time.time() - ts:.1f}s)"
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
