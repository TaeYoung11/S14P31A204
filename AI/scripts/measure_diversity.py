"""IFC 다양성 검증 — Step 2: fill% / PCA valid / max_extent 측정.

Step 1에서 저장된 depth 15장 + 3 fixture mesh를 분석해 baseline의
fixture별 동작을 정량화.

측정 항목:
- fill% — depth PNG에서 (gray > 0).mean() (배경 0, geometry > 0).
  주: `_depth_to_image`의 normalize 결과 가장 먼 픽셀은 gray=0이 되어
  배경과 구분 불가 → 측정값은 *근소 underestimate* 가능 (대부분 영향 없음).
- PCA valid — mesh load 후 `compute_principal_axes(verts)` 호출, eigenvalue
  격차 충분 여부 (PCA_EIGENVALUE_RATIO_MIN=1.2 초과).
- max_extent — AABB 최장변 길이 (m). fixture 크기 의존성 분석용.

출력: 콘솔 표 + DEVLOG에 사용자가 복붙 가능한 형식.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from ai_rendering.ifc2img.geometry import load_mesh
from ai_rendering.ifc2img.views import (
    DEFAULT_RENDER_VIEWS,
    VIEW_TARGET_RATIOS,
    compute_principal_axes,
)

ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = ROOT / "packages" / "ai-rendering" / "tests" / "fixtures" / "ifc"
DEPTH_ROOT = ROOT / "outputs" / "ifc2img_diversity"

FIXTURES = [
    FIXTURES_DIR / "AC20-FZK-Haus.ifc",
    FIXTURES_DIR / "AC-20-Smiley-West-10-Bldg.ifc",
    FIXTURES_DIR / "Ifc4_SampleHouse.ifc",
]


def measure_fill_percent(png_path: Path) -> float:
    """PNG에서 geometry 픽셀 비율 (≈ fill%) 측정."""
    with Image.open(png_path) as im:
        arr = np.array(im.convert("L"))
    return float((arr > 0).mean())


def main() -> int:
    print(f"{'fixture':30s}  {'max_ext':>7s}  {'PCA':>5s}  {'view':7s}  "
          f"{'target':>6s}  {'fill%':>6s}  {'Δ':>5s}")
    print("─" * 80)

    for fixture in FIXTURES:
        stem = fixture.stem
        depth_dir = DEPTH_ROOT / stem
        if not depth_dir.exists():
            print(f"[skip] depth dir not found: {depth_dir}")
            continue

        # mesh load + PCA + max_extent
        mesh, _center = load_mesh(fixture)
        verts = np.asarray(mesh.vertices)
        max_extent = float(np.max(verts.max(axis=0) - verts.min(axis=0)))
        _, _, pca_valid = compute_principal_axes(verts)

        for i, view in enumerate(DEFAULT_RENDER_VIEWS):
            png = depth_dir / f"depth_{view.value}.png"
            if not png.exists():
                continue
            fill = measure_fill_percent(png)
            target = VIEW_TARGET_RATIOS[view]
            diff = fill - target
            mark = "✓" if abs(diff) <= 0.10 else ("↑" if diff > 0 else "↓")

            # 첫 view에만 fixture/extent/PCA 출력 (가독성)
            if i == 0:
                fixture_col = stem[:30]
                extent_col = f"{max_extent:.1f}m"
                pca_col = "T" if pca_valid else "F"
            else:
                fixture_col = ""
                extent_col = ""
                pca_col = ""

            print(
                f"{fixture_col:30s}  {extent_col:>7s}  {pca_col:>5s}  "
                f"{view.value:7s}  {target:>6.2f}  {fill:>6.3f}  {diff:>+5.3f} {mark}"
            )
        print()

    print("범례: target = VIEW_TARGET_RATIOS, fill% = (depth > 0).mean(), "
          "Δ = fill - target. ✓ = ±0.10 안 (수렴), ↑/↓ = 초과/미달.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
