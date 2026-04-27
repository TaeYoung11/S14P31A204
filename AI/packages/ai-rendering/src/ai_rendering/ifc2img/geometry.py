"""IFC 파일 → Open3D TriangleMesh 변환."""

from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import open3d as o3d  # type: ignore[import-untyped]

from .exceptions import IFCRenderError

DEFAULT_INCLUDED_BASE = "IfcBuildingElement"
"""기본 포함 기준 — IFC4의 건물 구성요소 추상 기반 클래스.

IfcWall/IfcSlab/IfcRoof/IfcDoor/IfcWindow/IfcStair/IfcColumn/IfcBeam/...
모두 이 클래스를 상속한다. 자동으로:
  - 포함: IfcBuildingElement 모든 서브타입 (벽/슬랩/지붕/문/창/계단/...)
  - 제외: IfcSite / IfcSpace / IfcGeographicElement / IfcOpeningElement /
          IfcAnnotation / IfcGrid / IfcDistributionElement / IfcFurnishingElement /
          IfcReinforcingBar / IfcTransportElement (IfcBuildingElement 비상속)

전체 씬이 필요하면 `included_base="IfcProduct"` 전달 (escape hatch).
"""


def load_mesh(
    ifc_path: Path,
    included_base: str = DEFAULT_INCLUDED_BASE,
    extra_types: frozenset[str] = frozenset(),
) -> tuple[o3d.geometry.TriangleMesh, np.ndarray]:
    """IFC4 파일을 파싱해 *건물 구성요소만* mesh와 AABB center로 반환한다.

    기본 동작: IfcBuildingElement 및 그 서브타입만 포함 → 주 건물에 카메라 framing 안정.
    실내 가구 등을 추가로 포함하려면 extra_types에 'IfcFurnishingElement' 등 전달.
    전체 씬이 필요하면 included_base="IfcProduct" (모든 IFC product의 공통 조상).

    Args:
        ifc_path: IFC4 파일 경로
        included_base: 포함 기준 IFC 타입. 이 타입 *또는 그 서브타입*인 entity만 포함.
            기본값 'IfcBuildingElement'.
        extra_types: included_base와 별개로 추가 포함할 타입 집합.
            예: frozenset({"IfcFurnishingElement"}) — 인테리어 렌더용.

    Returns:
        (mesh, center) — mesh는 vertex normals 계산 완료 상태.
        center는 shape (3,) ndarray, 포함된 entity의 AABB 중심.

    Raises:
        IFCRenderError: 파일 열기 실패, IFC4 외 스키마, geometry 없음,
            included_base/extra_types 매치 entity 0개.
    """
    try:
        model = ifcopenshell.open(str(ifc_path))
    except Exception as e:
        raise IFCRenderError(f"IFC 파일 열기 실패: {e}") from e

    if model.schema != "IFC4":
        raise IFCRenderError(
            f"IFC4 스키마만 지원합니다 (입력 파일 스키마: {model.schema})"
        )

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.WELD_VERTICES, True)

    verts_list: list[np.ndarray] = []
    faces_list: list[np.ndarray] = []
    offset = 0

    iterator = ifcopenshell.geom.iterator(settings, model)
    if not iterator.initialize():
        raise IFCRenderError("IFC 파일에 3D geometry가 없습니다.")

    while True:
        shape = iterator.get()
        entity = model.by_id(shape.id)
        if entity.is_a(included_base) or any(entity.is_a(t) for t in extra_types):
            geo = shape.geometry
            v = np.array(geo.verts, dtype=np.float64).reshape(-1, 3)
            f = np.array(geo.faces, dtype=np.int64).reshape(-1, 3) + offset
            verts_list.append(v)
            faces_list.append(f)
            offset += len(v)
        if not iterator.next():
            break

    if not verts_list:
        raise IFCRenderError(
            f"포함 가능한 geometry가 없습니다 "
            f"(included_base='{included_base}', extra_types={sorted(extra_types)})."
        )

    vertices = np.vstack(verts_list)
    faces = np.vstack(faces_list)

    if len(vertices) == 0:
        raise IFCRenderError("추출된 geometry가 없습니다.")

    mesh = o3d.geometry.TriangleMesh()
    mesh.vertices = o3d.utility.Vector3dVector(vertices)
    mesh.triangles = o3d.utility.Vector3iVector(faces)
    mesh.compute_vertex_normals()

    center = (vertices.min(axis=0) + vertices.max(axis=0)) / 2
    return mesh, center
