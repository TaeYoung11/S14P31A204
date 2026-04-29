"""기울어짐 잔존 진단 — 회전된 mesh의 *벽 면법선* 분포 측정.

목적: PCA long_axis 정렬 후에도 front/side가 기울어 보이는 잔존 원인 분리.
가설 — PCA가 footprint 외곽 비대칭(부속/돌출/요철)에 끌려 facade 정면과 어긋남.
벽 면법선이 axis-aligned(±x, ±y)에서 *얼마나 벗어났는지*를 정량화하면 시각적
"살짝 기울어짐"과 직접 비교 가능.

알고리즘:
1. load_mesh(이미 PCA 회전 보정 적용됨) → mesh.triangles
2. face normal 계산 + face area 가중치
3. 수직 면 필터 — |normal_z| < 0.1 (벽만, 지붕/슬래브 제외)
4. xy 면법선 각도 atan2(ny, nx) → [0°, 90°)에 매핑 (4중 대칭)
5. 면적 가중 히스토그램 → 모드 각도 = 잔존 기울어짐 추정치

해석:
  모드 < 0.5°  → axis-aligned, 시각적 기울어짐 *다른 원인*
  모드 1°~3°  → PCA가 footprint 외곽 비대칭에 끌림. 벽 normal 모드로 보정 필요
  모드 > 5°   → 큰 어긋남. 처방 재검토
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

ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = ROOT / "packages" / "ai-rendering" / "tests" / "fixtures" / "ifc"

FIXTURES = [
    FIXTURES_DIR / "AC20-FZK-Haus.ifc",
    FIXTURES_DIR / "AC-20-Smiley-West-10-Bldg.ifc",
    FIXTURES_DIR / "Ifc4_SampleHouse.ifc",
]

VERTICAL_NORMAL_TOLERANCE = 0.1  # |n_z| < 이 값이면 수직 면(벽)


def measure_wall_normal_mode(
    vertices: np.ndarray, triangles: np.ndarray
) -> tuple[float, float, int]:
    """벽 면 면법선의 axis-aligned 어긋남 측정.

    Returns:
        (mode_angle_deg, signed_circular_mean_deg, n_walls)
        - mode_angle_deg: 면적 가중 히스토그램 모드 — [0°, 45°]에 매핑된 각도
        - signed_circular_mean_deg: 4중 대칭 circular mean — 회전 방향(부호) 포함
        - n_walls: 사용된 벽 면 개수
    """
    v0 = vertices[triangles[:, 0]]
    v1 = vertices[triangles[:, 1]]
    v2 = vertices[triangles[:, 2]]
    raw_n = np.cross(v1 - v0, v2 - v0)
    area = 0.5 * np.linalg.norm(raw_n, axis=1)
    nz_norm = np.linalg.norm(raw_n, axis=1, keepdims=True)
    valid = nz_norm[:, 0] > 1e-12
    raw_n = raw_n[valid]
    area = area[valid]
    nz_norm = nz_norm[valid]
    normal = raw_n / nz_norm

    # 수직 면(벽)만 — z 성분 거의 0
    wall_mask = np.abs(normal[:, 2]) < VERTICAL_NORMAL_TOLERANCE
    wall_normal = normal[wall_mask]
    wall_area = area[wall_mask]

    if len(wall_normal) == 0:
        return float("nan"), float("nan"), 0

    # 면법선 xy 각도 — atan2(ny, nx), [-180°, 180°]
    angles = np.degrees(np.arctan2(wall_normal[:, 1], wall_normal[:, 0]))
    # 4중 대칭(axis-aligned)에 매핑 — modulo 90° → [0°, 90°)
    abs_angles = np.mod(np.abs(angles), 90.0)
    # [0°, 45°]에 매핑 (45° 너머는 다음 axis가 더 가까움)
    abs_angles = np.where(abs_angles > 45.0, 90.0 - abs_angles, abs_angles)

    # 면적 가중 히스토그램 — 1° bin
    hist, edges = np.histogram(abs_angles, bins=90, range=(0.0, 90.0), weights=wall_area)
    mode_bin = int(np.argmax(hist))
    mode_angle = float((edges[mode_bin] + edges[mode_bin + 1]) / 2)

    # 4중 대칭 circular mean — 부호 보존 (반시계/시계 방향 구분)
    # 4× 각도로 angle wrap 제거 (90° 회전 = 같은 axis-aligned 상태)
    quad_angles_rad = np.radians(angles * 4)
    weights = wall_area / wall_area.sum()
    mean_x = float(np.sum(np.cos(quad_angles_rad) * weights))
    mean_y = float(np.sum(np.sin(quad_angles_rad) * weights))
    signed_mean_4x = math.degrees(math.atan2(mean_y, mean_x))
    signed_mean = signed_mean_4x / 4.0  # 4× 되돌리기 → [-22.5°, 22.5°]

    return mode_angle, signed_mean, int(len(wall_normal))


def main() -> int:
    print(f"VERTICAL_NORMAL_TOLERANCE: |n_z| < {VERTICAL_NORMAL_TOLERANCE}")
    print(
        f"\n{'fixture':30s}  {'walls':>6s}  {'mode°':>7s}  "
        f"{'signed mean°':>14s}  {'tilt sign':>10s}"
    )
    print("─" * 80)

    for fixture in FIXTURES:
        if not fixture.exists():
            print(f"[skip] {fixture}")
            continue
        mesh, _ = load_mesh(fixture)
        verts = np.asarray(mesh.vertices)
        tris = np.asarray(mesh.triangles)

        mode_ang, signed_mean, n_walls = measure_wall_normal_mode(verts, tris)
        if signed_mean > 0.1:
            tilt = "CCW (반시계)"
        elif signed_mean < -0.1:
            tilt = "CW (시계)"
        else:
            tilt = "none"
        print(
            f"{fixture.stem[:30]:30s}  {n_walls:>6d}  {mode_ang:>6.3f}°  "
            f"{signed_mean:>+13.3f}°  {tilt:>10s}"
        )

    print()
    print("범례:")
    print("  walls       = 수직 면(|n_z|<0.1) 개수")
    print("  mode°       = 면적 가중 히스토그램 1° bin 모드 — [0°, 45°]")
    print("  signed mean = 4중 대칭 circular mean — [-22.5°, 22.5°], 부호=회전 방향")
    print("                양수=반시계(CCW), 음수=시계(CW)")
    print()
    print("해석:")
    print("  |signed mean| < 0.5° → axis-aligned, 다른 원인")
    print("  |signed mean| 1°~3°  → PCA가 외곽 비대칭에 끌림. 벽 normal 보정 필요")
    print("  |signed mean| > 5°   → 큰 어긋남. 처방 재검토")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
