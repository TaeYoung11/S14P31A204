"""기울어짐 진단 — 3 fixture의 PCA long_axis 회전각 측정.

목적: haus/SampleHouse front+side가 좌측으로 미세 기울어진 원인이
*PCA가 회전된 축을 잡아서*인지(false positive), *IFC 좌표계 자체 회전*인지
정량 데이터로 분리.

측정 항목 (fixture별):
- max_extent (m) — AABB 최장변
- long_axis (x, y) — compute_principal_axes 반환 단위벡터 (z=0)
- 회전 각도 (°) — atan2(long_axis[1], long_axis[0])
- eigenvalue 비율 — eigvals[1] / eigvals[0]
- 현재 임계값 통과 여부 (PCA_EIGENVALUE_RATIO_MIN=1.2)

분기 판정 (Step 4):
- 작은 fixture(<20m) 회전각 ≥ 5° + eig_ratio < 2.0 → 5a (PCA 처방)
- 작은 fixture 회전각 ≥ 5° + eig_ratio ≥ 2.0 → 5b (IFC TrueNorth)
- 회전각 < 1° → 5c (카메라 정밀화)
"""

from __future__ import annotations

import io
import math
import sys
from pathlib import Path

import numpy as np

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from ai_rendering.ifc2img.geometry import load_mesh
from ai_rendering.ifc2img.views import PCA_EIGENVALUE_RATIO_MIN

ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = ROOT / "packages" / "ai-rendering" / "tests" / "fixtures" / "ifc"

FIXTURES = [
    FIXTURES_DIR / "AC20-FZK-Haus.ifc",
    FIXTURES_DIR / "AC-20-Smiley-West-10-Bldg.ifc",
    FIXTURES_DIR / "Ifc4_SampleHouse.ifc",
]


def measure_pca_raw(vertices: np.ndarray) -> tuple[np.ndarray, float, float]:
    """xy 평면 PCA — long_axis(단위벡터) + eigenvalue 비율 + extent.

    `compute_principal_axes`와 동일 알고리즘이지만 *부호 정규화 없이* raw eigvec 반환.
    회전 각도 측정용 — 부호 정규화는 카메라 결정성에만 의미, 회전 진단은 raw가 정확.
    """
    if len(vertices) < 3:
        raise ValueError("vertex 부족 — PCA 불가")
    xy = vertices[:, :2]
    centered = xy - xy.mean(axis=0)
    cov = np.cov(centered.T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    long_xy = eigvecs[:, 1]  # 큰 eigenvalue 쪽
    long_axis_2d = np.array([float(long_xy[0]), float(long_xy[1])])
    if eigvals[0] < 1e-12:
        eig_ratio = float("inf")
    else:
        eig_ratio = float(eigvals[1] / eigvals[0])
    return long_axis_2d, eig_ratio


def main() -> int:
    print(f"PCA_EIGENVALUE_RATIO_MIN (현재 임계값): {PCA_EIGENVALUE_RATIO_MIN}\n")
    print(
        f"{'fixture':30s}  {'extent':>7s}  {'long_axis(x,y)':>16s}  "
        f"{'angle°':>7s}  {'|angle|':>7s}  {'eig_ratio':>9s}  {'valid':>5s}"
    )
    print("─" * 96)

    for fixture in FIXTURES:
        if not fixture.exists():
            print(f"[skip] {fixture}")
            continue
        mesh, _ = load_mesh(fixture)
        verts = np.asarray(mesh.vertices)
        max_extent = float(np.max(verts.max(axis=0) - verts.min(axis=0)))

        long_2d, eig_ratio = measure_pca_raw(verts)
        # (1,0)에서 회전 각도 — atan2(y, x), degrees, [-180, 180]
        angle_deg = math.degrees(math.atan2(long_2d[1], long_2d[0]))
        # 절대 회전 — 축은 ±v 동일이라 |angle| 또는 (angle + 180) % 180 으로
        # *축 회전*만 보려면 [0, 90]에 매핑 (대칭성 활용)
        abs_angle = abs(angle_deg)
        if abs_angle > 90:
            abs_angle = 180 - abs_angle
        valid = "T" if eig_ratio >= PCA_EIGENVALUE_RATIO_MIN else "F"
        long_str = f"({long_2d[0]:+.3f}, {long_2d[1]:+.3f})"
        print(
            f"{fixture.stem[:30]:30s}  {max_extent:>6.1f}m  {long_str:>16s}  "
            f"{angle_deg:>+7.2f}  {abs_angle:>6.2f}°  {eig_ratio:>9.3f}  {valid:>5s}"
        )

    print()
    print("범례:")
    print("  long_axis = compute_principal_axes의 큰 eigenvalue 쪽 (raw, 부호 정규화 X)")
    print("  angle°    = atan2(y, x) — (1,0)에서 회전 각도, 부호 포함 [-180, 180]")
    print("  |angle|   = 축 회전 — [0, 90]에 매핑 (PCA 축은 ±v 동일이라)")
    print("  eig_ratio = eigvals[1] / eigvals[0] — 격차 1.0=정사각, ↑ 비대칭 강함")
    print("  valid     = eig_ratio ≥ PCA_EIGENVALUE_RATIO_MIN(1.2)")
    print()
    print("분기 판정 가이드:")
    print("  |angle| ≥ 5° + eig_ratio < 2.0  → 5a (PCA false positive — 약한 비대칭)")
    print("  |angle| ≥ 5° + eig_ratio ≥ 2.0  → 5b (IFC 좌표계 회전 — TrueNorth 보정)")
    print("  |angle| < 1°                    → 5c (카메라 정밀화 — 드문 케이스)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
