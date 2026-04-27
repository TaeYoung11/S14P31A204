"""Step 2: IFC 파싱 단독 검증.

ifcopenshell만 사용해 geometry를 추출하고 수치를 출력한다.
Open3D / 렌더링 없이 파서만 격리해서 검증.

실행:
    uv run python scripts/step2_ifc_parse.py <파일명.ifc>
    uv run python scripts/step2_ifc_parse.py  # fixtures/ifc/ 전체 순회
"""

import io
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import ifcopenshell
import ifcopenshell.geom
import numpy as np

FIXTURE_DIR = Path(__file__).parent.parent / "packages/ai-rendering/tests/fixtures/ifc"


def parse_ifc(ifc_path: Path) -> None:
    print(f"\n{'='*60}")
    print(f"파일: {ifc_path.name}")
    print(f"{'='*60}")

    try:
        model = ifcopenshell.open(str(ifc_path))
    except Exception as e:
        print(f"  [오류] 파일 열기 실패: {e}")
        return

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.WELD_VERTICES, True)

    vertices_list: list[np.ndarray] = []
    faces_list: list[np.ndarray] = []
    shape_count = 0
    offset = 0

    iterator = ifcopenshell.geom.iterator(settings, model)
    if not iterator.initialize():
        print("  [경고] geometry 없음 — IFC 파일에 3D 형상이 없습니다.")
        return

    while True:
        shape = iterator.get()
        geo = shape.geometry
        verts = np.array(geo.verts, dtype=np.float64).reshape(-1, 3)
        faces = np.array(geo.faces, dtype=np.int64).reshape(-1, 3) + offset
        vertices_list.append(verts)
        faces_list.append(faces)
        offset += len(verts)
        shape_count += 1
        if not iterator.next():
            break

    vertices = np.vstack(vertices_list)
    faces = np.vstack(faces_list)

    aabb_min = vertices.min(axis=0)
    aabb_max = vertices.max(axis=0)
    extent = aabb_max - aabb_min

    print(f"  shape 수:      {shape_count}")
    print(f"  vertex 수:     {len(vertices):,}")
    print(f"  face 수:       {len(faces):,}")
    print(f"  AABB min:      [{aabb_min[0]:.2f}, {aabb_min[1]:.2f}, {aabb_min[2]:.2f}]")
    print(f"  AABB max:      [{aabb_max[0]:.2f}, {aabb_max[1]:.2f}, {aabb_max[2]:.2f}]")
    print(f"  크기 (W×D×H): {extent[0]:.2f} × {extent[1]:.2f} × {extent[2]:.2f}")

    # 단위 추정: 건물 높이가 100 이상이면 mm 단위 가능성 높음
    if extent[2] > 100:
        print("  [주의] 높이가 100 초과 → mm 단위 가능성. CONVERT_BACK_UNITS 설정 필요할 수 있음.")
    else:
        print("  [단위] 미터 단위로 보임 ✓")


def main() -> None:
    if len(sys.argv) > 1:
        targets = [Path(sys.argv[1])]
    else:
        targets = sorted(FIXTURE_DIR.glob("*.ifc"))
        if not targets:
            print(f"IFC 파일 없음: {FIXTURE_DIR}")
            print("사용법: uv run python scripts/step2_ifc_parse.py <파일명.ifc>")
            return

    for path in targets:
        parse_ifc(path)

    print("\n완료.")


if __name__ == "__main__":
    main()
