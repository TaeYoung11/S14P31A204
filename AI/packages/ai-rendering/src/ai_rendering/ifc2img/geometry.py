"""IFC 파일 → Open3D TriangleMesh 변환."""

from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import open3d as o3d  # type: ignore[import-untyped]

from .exceptions import IFCRenderError
from .views import PCA_EIGENVALUE_RATIO_MIN

SUPPORTED_SCHEMA_PREFIX = "IFC4"
"""지원 스키마 prefix — IFC4 계열 (IFC4, IFC4X1, IFC4X2, IFC4X3, ...).

IFC2x3, IFC2x2 등 IFC4 이전 버전은 엔티티 시그니처가 달라 거부한다 (예: IfcDoor 인자 수 변경).
IFC4 계열은 geometry 추출 경로와 IfcBuildingElement 상속 트리가 동일하므로 통합 지원.
"""

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
    """IFC4 계열 파일을 파싱해 *건물 구성요소만* mesh와 AABB center로 반환한다.

    지원 스키마: IFC4 / IFC4X1 / IFC4X2 / IFC4X3 등 IFC4 계열 (prefix='IFC4').
    IFC2x3 이전 버전은 엔티티 시그니처가 달라 거부.

    기본 동작: IfcBuildingElement 및 그 서브타입만 포함 → 주 건물에 카메라 framing 안정.
    실내 가구 등을 추가로 포함하려면 extra_types에 'IfcFurnishingElement' 등 전달.
    전체 씬이 필요하면 included_base="IfcProduct" (모든 IFC product의 공통 조상).

    Args:
        ifc_path: IFC4 계열 파일 경로
        included_base: 포함 기준 IFC 타입. 이 타입 *또는 그 서브타입*인 entity만 포함.
            기본값 'IfcBuildingElement'.
        extra_types: included_base와 별개로 추가 포함할 타입 집합.
            예: frozenset({"IfcFurnishingElement"}) — 인테리어 렌더용.

    Returns:
        (mesh, center) — mesh는 vertex normals 계산 완료 상태.
        center는 shape (3,) ndarray, 포함된 entity의 AABB 중심.

    Raises:
        IFCRenderError: 파일 열기 실패, IFC4 계열 외 스키마, geometry 없음,
            included_base/extra_types 매치 entity 0개.
    """
    try:
        model = ifcopenshell.open(str(ifc_path))
    except Exception as e:
        raise IFCRenderError(f"IFC 파일 열기 실패: {e}") from e

    if not model.schema.startswith(SUPPORTED_SCHEMA_PREFIX):
        raise IFCRenderError(
            f"IFC4 계열 스키마만 지원합니다 "
            f"(IFC4 / IFC4X1 / IFC4X3 등; 입력 파일 스키마: {model.schema})"
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

    vertices, _rotated = _align_long_axis_to_x(vertices)

    mesh = o3d.geometry.TriangleMesh()
    mesh.vertices = o3d.utility.Vector3dVector(vertices)
    mesh.triangles = o3d.utility.Vector3iVector(faces)
    mesh.compute_vertex_normals()

    center = (vertices.min(axis=0) + vertices.max(axis=0)) / 2
    return mesh, center


def _align_long_axis_to_x(
    vertices: np.ndarray,
) -> tuple[np.ndarray, bool]:
    """xy 평면 PCA long_axis가 +x에 정렬되도록 mesh 전체에 yaw 회전을 적용.

    배경 (2026-04-29 다양성 검증 Phase 1+2 진단):
    - haus(3.73°)·SampleHouse(10.03°) IFC 모델이 좌표계 자체가 회전된 상태로
      저장돼 있어 front/side 입면도가 좌측으로 기울어 보임.
    - Smiley(0.02°)는 표준 좌표계라 영향 없음.
    - 모든 fixture eig_ratio ≥ 3.2 ≫ 1.2 — PCA 자체는 신뢰 가능.

    설계:
    - vertex 부족(<3)·eigenvalue 격차 부족(<PCA_EIGENVALUE_RATIO_MIN)이면 무회전.
    - 그 외 long_axis가 +x에 수렴하도록 z축 기준 yaw 회전 행렬 적용 (xy만 회전,
      z 보존). center는 vertices에서 다시 계산되므로 별도 처리 불필요.

    Returns:
        (rotated_vertices, did_rotate) — did_rotate는 진단·테스트용.
    """
    if len(vertices) < 3:
        return vertices, False
    xy = vertices[:, :2]
    mean_xy = xy.mean(axis=0)
    centered = xy - mean_xy
    cov = np.cov(centered.T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    if eigvals[0] < 1e-12:
        return vertices, False
    if (eigvals[1] / eigvals[0]) < PCA_EIGENVALUE_RATIO_MIN:
        return vertices, False
    long_xy = eigvecs[:, 1]
    cos_t = float(long_xy[0])
    sin_t = float(long_xy[1])
    norm = (cos_t * cos_t + sin_t * sin_t) ** 0.5
    if norm < 1e-9:
        return vertices, False
    cos_t /= norm
    sin_t /= norm
    # eigh의 ±v 비결정성 정규화 — long_xy를 +x 쪽으로 고정해 같은 입력에
    # 같은 결과 보장. cos_t<0 또는 cos_t≈0이면서 sin_t<0이면 뒤집기.
    if cos_t < 0 or (abs(cos_t) < 1e-9 and sin_t < 0):
        cos_t = -cos_t
        sin_t = -sin_t
    # long_axis가 +x로 가도록 회전 — 역행렬 (cos, sin; -sin, cos)을 xy에 곱.
    # mean을 빼고 회전 후 다시 더함 (centroid 기준 회전) — origin 기준 회전 시
    # mean이 (0,0)이 아니면 mesh 전체가 이동해 카메라/AABB 정렬이 깨짐.
    # [x']   [ cos_t  sin_t] [x - mean_x]   [mean_x]
    # [y'] = [-sin_t  cos_t] [y - mean_y] + [mean_y]
    rot = np.array(
        [
            [cos_t, sin_t, 0.0],
            [-sin_t, cos_t, 0.0],
            [0.0, 0.0, 1.0],
        ]
    )
    centered_3d = vertices.copy()
    centered_3d[:, 0] -= mean_xy[0]
    centered_3d[:, 1] -= mean_xy[1]
    rotated = centered_3d @ rot.T
    rotated[:, 0] += mean_xy[0]
    rotated[:, 1] += mean_xy[1]
    return rotated, True
