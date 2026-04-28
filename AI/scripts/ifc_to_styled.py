"""IFC → depth → 스타일 이미지 풀 파이프라인 1샷 스크립트.

사용 예시:
    # 가벼운 검증 (SD 미로드)
    uv run python scripts/ifc_to_styled.py \\
        --ifc packages/ai-rendering/tests/fixtures/ifc/AC-20-Smiley-West-10-Bldg.ifc \\
        --dry-run

    # 1샷 smoke test (1뷰 × 1프리셋)
    uv run python scripts/ifc_to_styled.py \\
        --ifc packages/ai-rendering/tests/fixtures/ifc/AC-20-Smiley-West-10-Bldg.ifc \\
        --views front --preset scandinavian

    # 풀 9장 (3뷰 × 3프리셋)
    uv run python scripts/ifc_to_styled.py \\
        --ifc packages/ai-rendering/tests/fixtures/ifc/AC-20-Smiley-West-10-Bldg.ifc

핵심 로직은 ai_rendering.ifc2img 모듈에 있다 — 이 스크립트는 thin wrapper.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

# Windows cp949 콘솔에서도 한글/이모지 출력 가능하도록 stdout/stderr 둘 다 래핑.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    import io

    sys.stdout = io.TextIOWrapper(
        sys.stdout.buffer, encoding="utf-8", errors="replace"
    )
    sys.stderr = io.TextIOWrapper(
        sys.stderr.buffer, encoding="utf-8", errors="replace"
    )

from ai_rendering.ifc2img import (
    IFCRenderer,
    IFCRenderError,
    IFCView,
    list_presets,
    load_preset,
)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="IFC → depth → 스타일 풀 파이프라인")
    p.add_argument(
        "--ifc",
        required=True,
        type=Path,
        help="IFC4 계열 파일 경로 (IFC4 / IFC4X1 / IFC4X3 등)",
    )
    p.add_argument(
        "--preset",
        default="all",
        help=f"프리셋 이름 또는 'all' (사용 가능: {list_presets()})",
    )
    p.add_argument(
        "--views",
        default="all",
        help="뷰 이름 콤마 구분 또는 'all' (예: front,side / all)",
    )
    p.add_argument(
        "--output",
        default=Path("outputs/ifc2img_e2e"),
        type=Path,
        help="저장 디렉토리",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="SD 미로드. IFC → depth 렌더 + 프리셋 정보만 출력.",
    )
    return p.parse_args()


def _resolve_views(arg: str) -> list[IFCView]:
    if arg == "all":
        return list(IFCView)
    names = [v.strip() for v in arg.split(",")]
    try:
        return [IFCView(n) for n in names]
    except ValueError as e:
        raise SystemExit(
            f"잘못된 뷰: {arg}. 사용 가능: {[v.value for v in IFCView]}"
        ) from e


def _resolve_presets(arg: str) -> list[str]:
    if arg == "all":
        return list_presets()
    if arg not in list_presets():
        raise SystemExit(
            f"잘못된 프리셋: {arg}. 사용 가능: {list_presets()}"
        )
    return [arg]


def _render_depths(
    ifc_path: Path,
    views: list[IFCView],
    output_dir: Path,
) -> dict[IFCView, Path]:
    """IFC → 뷰별 depth PNG 저장. {view: PNG 경로} 반환."""
    print(f"[depth] {ifc_path.name} → {len(views)}뷰 렌더링")
    renderer = IFCRenderer(width=768, height=448)
    images = renderer.render_views(ifc_path, views=views)

    saved: dict[IFCView, Path] = {}
    for view, img in images.items():
        path = output_dir / f"depth_{view.value}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        print(f"  {view.value:5s} → {path}")
        saved[view] = path
    return saved


def _print_preset_info(presets: list[str]) -> None:
    print(f"\n[preset] {len(presets)}개 프리셋 정보")
    for name in presets:
        p = load_preset(name)
        print(
            f"  {name:14s} guidance={p.guidance_scale} "
            f"steps={p.num_inference_steps} "
            f"cn_scale={p.controlnet_conditioning_scale}"
        )


def _render_styles(
    depth_paths: dict[IFCView, Path],
    presets: list[str],
    output_dir: Path,
) -> None:
    """depth 이미지들을 SD + ControlNet-depth로 스타일 변환 → 저장."""
    from PIL import Image

    from ai_rendering.ifc2img import DepthStyleRenderer

    print("\n[SD] DepthStyleRenderer 로드 중 (수 십초 소요)...")
    t0 = time.time()
    style_renderer = DepthStyleRenderer()
    print(f"  로드 완료 ({time.time() - t0:.1f}s) device={style_renderer.device}")

    total = len(depth_paths) * len(presets)
    done = 0
    for view, depth_path in depth_paths.items():
        depth = Image.open(depth_path)
        for preset_name in presets:
            done += 1
            t1 = time.time()
            params = load_preset(preset_name)
            result = style_renderer.render(depth, params)
            out_path = output_dir / f"style_{view.value}_{preset_name}.png"
            result.save(out_path)
            print(
                f"  [{done}/{total}] {view.value:5s} × {preset_name:14s} "
                f"→ {out_path.name} ({time.time() - t1:.1f}s)"
            )


def main() -> int:
    args = _parse_args()

    if not args.ifc.exists():
        print(f"오류: IFC 파일 없음 — {args.ifc}", file=sys.stderr)
        return 1

    args.output.mkdir(parents=True, exist_ok=True)

    views = _resolve_views(args.views)
    presets = _resolve_presets(args.preset)

    print(f"입력: {args.ifc}")
    print(f"뷰: {[v.value for v in views]}")
    print(f"프리셋: {presets}")
    print(f"출력: {args.output}")
    print(f"모드: {'dry-run' if args.dry_run else '풀 파이프라인'}\n")

    try:
        depth_paths = _render_depths(args.ifc, views, args.output)
        _print_preset_info(presets)

        if args.dry_run:
            print(f"\n[dry-run] depth {len(depth_paths)}장 + 프리셋 정보 출력 완료. SD 미실행.")
            return 0

        _render_styles(depth_paths, presets, args.output)
        print(f"\n완료: {args.output}")
        return 0

    except IFCRenderError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
