"""IFC 파일 → Open3D TriangleMesh 변환."""

import math
from dataclasses import dataclass
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import open3d as o3d  # type: ignore[import-untyped]

from .exceptions import IFCRenderError

GROUND_EXTENT_FACTOR = 1.2
"""ground plane xy extent 배율 — mesh AABB xy extent의 N배.

front/side 정면 입면도에서 mesh 외부 영역이 depth=0(빈 배경)으로 들어가면 SD가
prompt 편향으로 *추가 층/지하* 환각을 만든다. ground plane을 mesh 바닥 z=AABB.z_min
에 추가하면 SD가 *지면*을 시각 단서로 인식해 빈 영역 환각이 차단된다.

값이 너무 크면(예: 2.0) 등각 시점에서 거대 평면이 화면을 차지해 빌딩 framing이
망가진다. 1.2는 사방 *약간 확장*만 하여 정면 시점에서 bottom 지면이 충분히 노출
되면서도 등각 시점 framing을 망가뜨리지 않는 균형점.
"""

GROUND_BASE_Z_PERCENTILE = 5.0
"""Robust lower percentile used to ignore sparse below-building outliers."""

GROUND_BASE_MIN_VERTEX_COUNT_FOR_ROBUST_Z = 20
"""Small synthetic meshes keep exact min-z behavior for predictable tests."""

MIN_PLAUSIBLE_HEIGHT_M = 1.0
"""Below this z extent, a building mesh is suspicious for Z-up rendering."""

MIN_HEIGHT_TO_FOOTPRINT_RATIO = 0.08
"""Very flat z extent compared with footprint can indicate a wrong up axis."""

MAX_HEIGHT_TO_FOOTPRINT_RATIO = 3.0
"""Very tall z extent compared with footprint can indicate a wrong up axis."""


WALL_NORMAL_VERTICAL_TOLERANCE = 0.1
"""수직 면(벽) 필터 임계값 — |face_normal_z| < 이 값이면 벽으로 분류.

지붕/슬래브(z 성분 큼) 제외하고 *facade 벽*만 사용해 axis-aligned 정렬 기준 산출.
"""

WALL_NORMAL_MIN_COUNT = 4
"""회전 보정 적용 최소 벽 면 개수.

직사각형 단순 박스 mesh도 4면(±x/±y) 최소 보유. 이보다 적으면 데이터 부족.
*분포 신뢰도*는 `WALL_NORMAL_MIN_MAGNITUDE`가 별도 가드 — 4중 대칭 circular
mean magnitude가 낮으면(둥근 건물 / 비표준 격자) 회전 미적용.
"""

WALL_NORMAL_MIN_MAGNITUDE = 0.3
"""4× wrap circular mean magnitude 임계값.

벽 면이 ±x/±y에 잘 정렬되면 magnitude → 1.0, 균등 분산이면 0.0.
이보다 낮으면 둥근 건물 / 비표준 격자(45°) → fallback(무회전).
"""

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


@dataclass(frozen=True)
class MeshOrientationDiagnostics:
    axis_extents: tuple[float, float, float]
    assumed_up_axis: str
    height_axis: str
    height_to_footprint_ratio: float
    z_is_plausible_height: bool
    horizontal_face_ratio: float
    vertical_face_ratio: float
    warnings: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, object]:
        return {
            "axisExtents": {
                "x": self.axis_extents[0],
                "y": self.axis_extents[1],
                "z": self.axis_extents[2],
            },
            "assumedUpAxis": self.assumed_up_axis,
            "heightAxis": self.height_axis,
            "heightToFootprintRatio": self.height_to_footprint_ratio,
            "zIsPlausibleHeight": self.z_is_plausible_height,
            "horizontalFaceRatio": self.horizontal_face_ratio,
            "verticalFaceRatio": self.vertical_face_ratio,
            "warnings": list(self.warnings),
        }


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

    vertices, _rotated = _align_walls_to_axes(vertices, faces)

    mesh = o3d.geometry.TriangleMesh()
    mesh.vertices = o3d.utility.Vector3dVector(vertices)
    mesh.triangles = o3d.utility.Vector3iVector(faces)
    mesh.compute_vertex_normals()

    center = (vertices.min(axis=0) + vertices.max(axis=0)) / 2
    return mesh, center


def attach_ground_plane_to_mesh(
    mesh: o3d.geometry.TriangleMesh,
    extent_factor: float = GROUND_EXTENT_FACTOR,
) -> o3d.geometry.TriangleMesh:
    """기존 mesh에 ground plane을 추가한 새 mesh 반환.

    Args:
        mesh: ground 없는 base mesh (load_mesh 산출물).

    Returns:
        ground plane(2 triangle, +z normal) 추가한 새 mesh. 입력 mesh는 변경 없음.
    """
    vertices = np.asarray(mesh.vertices)
    triangles = np.asarray(mesh.triangles)
    new_verts, new_tris = _add_ground_plane(
        vertices,
        triangles,
        extent_factor=extent_factor,
    )
    new_mesh = o3d.geometry.TriangleMesh()
    new_mesh.vertices = o3d.utility.Vector3dVector(new_verts)
    new_mesh.triangles = o3d.utility.Vector3iVector(new_tris)
    new_mesh.compute_vertex_normals()
    return new_mesh


def _add_ground_plane(
    vertices: np.ndarray,
    triangles: np.ndarray,
    extent_factor: float = GROUND_EXTENT_FACTOR,
) -> tuple[np.ndarray, np.ndarray]:
    """mesh AABB의 z_min에 axis-aligned ground plane(2 triangles, normal +z) 추가.

    front/side 정면 입면도에서 mesh 외부 영역이 depth=0 빈 배경이면 SD가 prompt
    편향으로 *추가 층/지하* 환각을 만든다. ground plane을 추가하면 depth 이미지에
    *지면 영역*이 명시되어 SD가 빈 영역을 ground로 인식 → 환각 차단.

    구성:
    - 위치: AABB z_min (mesh 바닥과 정렬)
    - 크기: xy extent × GROUND_EXTENT_FACTOR — 사방 확장
    - normal: +z (위쪽) — `_align_walls_to_axes` wall_mask(|n_z|<0.1)에 안 걸려
      회전 보정에 영향 없음

    Returns:
        (new_vertices, new_triangles) — 4 vertex + 2 triangle 추가.
    """
    if len(vertices) < 3:
        return vertices, triangles
    aabb_min = vertices.min(axis=0)
    aabb_max = vertices.max(axis=0)
    z_ground = _estimate_ground_z(vertices)
    cx = float((aabb_min[0] + aabb_max[0]) / 2)
    cy = float((aabb_min[1] + aabb_max[1]) / 2)
    half_x = float((aabb_max[0] - aabb_min[0]) / 2 * extent_factor)
    half_y = float((aabb_max[1] - aabb_min[1]) / 2 * extent_factor)

    ground_verts = np.array(
        [
            [cx - half_x, cy - half_y, z_ground],  # 0: SW
            [cx + half_x, cy - half_y, z_ground],  # 1: SE
            [cx + half_x, cy + half_y, z_ground],  # 2: NE
            [cx - half_x, cy + half_y, z_ground],  # 3: NW
        ],
        dtype=np.float64,
    )
    offset = len(vertices)
    # 2 triangles, CCW from +z direction → cross((1)-(0), (2)-(0)) = +z normal.
    ground_tris = np.array(
        [
            [offset + 0, offset + 1, offset + 2],
            [offset + 0, offset + 2, offset + 3],
        ],
        dtype=np.int64,
    )
    new_vertices = np.vstack([vertices, ground_verts])
    new_triangles = np.vstack([triangles, ground_tris])
    return new_vertices, new_triangles


def _estimate_ground_z(vertices: np.ndarray) -> float:
    """Estimate the building base z while ignoring sparse lower outliers."""
    if len(vertices) < GROUND_BASE_MIN_VERTEX_COUNT_FOR_ROBUST_Z:
        return float(vertices[:, 2].min())
    z_values = np.asarray(vertices[:, 2], dtype=np.float64)
    return float(np.percentile(z_values, GROUND_BASE_Z_PERCENTILE))


def diagnose_mesh_orientation(
    vertices: np.ndarray,
    triangles: np.ndarray,
) -> MeshOrientationDiagnostics:
    """Return conservative diagnostics for whether the mesh looks Z-up."""
    if len(vertices) == 0:
        raise IFCRenderError("cannot diagnose empty mesh orientation")

    vertices = np.asarray(vertices, dtype=np.float64)
    triangles = np.asarray(triangles, dtype=np.int64)
    extents_arr = vertices.max(axis=0) - vertices.min(axis=0)
    axis_extents = tuple(float(value) for value in extents_arr)
    axis_names = ("x", "y", "z")
    height_axis = axis_names[int(np.argmax(extents_arr))]
    footprint = max(float(extents_arr[0]), float(extents_arr[1]), 1e-9)
    z_extent = float(extents_arr[2])
    ratio = z_extent / footprint

    horizontal_face_ratio, vertical_face_ratio = _face_orientation_ratios(
        vertices,
        triangles,
    )
    warnings: list[str] = []
    if z_extent < MIN_PLAUSIBLE_HEIGHT_M:
        warnings.append("z extent is below plausible building height")
    if ratio < MIN_HEIGHT_TO_FOOTPRINT_RATIO:
        warnings.append("z extent is very small compared with xy footprint")
    if ratio > MAX_HEIGHT_TO_FOOTPRINT_RATIO:
        warnings.append("z extent is very large compared with xy footprint")
    if triangles.size and horizontal_face_ratio < 0.02:
        warnings.append("few horizontal faces found for assumed Z-up mesh")
    if triangles.size and vertical_face_ratio < 0.02:
        warnings.append("few vertical faces found for assumed Z-up mesh")

    z_is_plausible = not warnings
    return MeshOrientationDiagnostics(
        axis_extents=axis_extents,
        assumed_up_axis="z",
        height_axis=height_axis,
        height_to_footprint_ratio=float(ratio),
        z_is_plausible_height=z_is_plausible,
        horizontal_face_ratio=float(horizontal_face_ratio),
        vertical_face_ratio=float(vertical_face_ratio),
        warnings=tuple(warnings),
    )


def _face_orientation_ratios(
    vertices: np.ndarray,
    triangles: np.ndarray,
) -> tuple[float, float]:
    if len(triangles) == 0:
        return 0.0, 0.0

    v0 = vertices[triangles[:, 0]]
    v1 = vertices[triangles[:, 1]]
    v2 = vertices[triangles[:, 2]]
    raw_n = np.cross(v1 - v0, v2 - v0)
    norm = np.linalg.norm(raw_n, axis=1)
    valid = norm > 1e-12
    if not np.any(valid):
        return 0.0, 0.0

    normal_z = np.abs(raw_n[valid, 2] / norm[valid])
    horizontal = float(np.count_nonzero(normal_z > 0.75) / normal_z.size)
    vertical = float(np.count_nonzero(normal_z < 0.25) / normal_z.size)
    return horizontal, vertical


def _align_walls_to_axes(
    vertices: np.ndarray,
    triangles: np.ndarray,
) -> tuple[np.ndarray, bool]:
    """수직 면(벽) 면법선이 ±x/±y에 정렬되도록 mesh 전체에 yaw 회전을 적용.

    PCA long_axis 정렬은 footprint 외곽 비대칭(부속/돌출/요철)에 끌려 facade 벽
    axis와 어긋난다(예: 13°까지 잔존). 벽 면법선의 4× wrap circular mean은 *시각적
    facade 정렬*과 정합하므로 PCA 대신 벽 normal mean을 정렬 기준으로 사용한다.

    알고리즘:
    1. mesh.triangles → face normal + face area 계산
    2. 수직 면 필터 (|n_z| < WALL_NORMAL_VERTICAL_TOLERANCE) — 벽만, 지붕 제외
    3. xy 면법선 각도 atan2 → 4× wrap (90° 4중 대칭) → 면적 가중 circular mean
    4. ÷4 되돌림 → signed yaw 각도 [-22.5°, 22.5°]
    5. mesh 전체를 -signed_yaw로 회전 (벽이 axis-aligned되도록)

    Fallback (무회전):
    - vertex 또는 face 부족
    - 수직 면 < WALL_NORMAL_MIN_COUNT
    - circular mean magnitude < WALL_NORMAL_MIN_MAGNITUDE (둥근 건물 / 45° 격자)

    Returns:
        (rotated_vertices, did_rotate) — did_rotate는 진단·테스트용.
    """
    if len(vertices) < 3 or len(triangles) == 0:
        return vertices, False

    v0 = vertices[triangles[:, 0]]
    v1 = vertices[triangles[:, 1]]
    v2 = vertices[triangles[:, 2]]
    raw_n = np.cross(v1 - v0, v2 - v0)
    nz_norm = np.linalg.norm(raw_n, axis=1)
    valid = nz_norm > 1e-12
    if not np.any(valid):
        return vertices, False
    raw_n = raw_n[valid]
    nz_norm = nz_norm[valid]
    area = 0.5 * nz_norm
    normal = raw_n / nz_norm[:, None]

    wall_mask = np.abs(normal[:, 2]) < WALL_NORMAL_VERTICAL_TOLERANCE
    wall_normal = normal[wall_mask]
    wall_area = area[wall_mask]
    if len(wall_normal) < WALL_NORMAL_MIN_COUNT:
        return vertices, False

    angles_rad = np.arctan2(wall_normal[:, 1], wall_normal[:, 0])
    quad_rad = angles_rad * 4.0
    weights = wall_area / wall_area.sum()
    mean_x = float(np.sum(np.cos(quad_rad) * weights))
    mean_y = float(np.sum(np.sin(quad_rad) * weights))
    magnitude = (mean_x * mean_x + mean_y * mean_y) ** 0.5
    if magnitude < WALL_NORMAL_MIN_MAGNITUDE:
        return vertices, False

    signed_yaw = math.atan2(mean_y, mean_x) / 4.0
    # mesh를 -signed_yaw 만큼 회전 (벽 normal이 axis-aligned되도록).
    # centroid 기준 회전 — origin 기준이면 mean이 (0,0)이 아닐 때 mesh가 이동.
    cos_t = math.cos(-signed_yaw)
    sin_t = math.sin(-signed_yaw)
    rot = np.array(
        [
            [cos_t, -sin_t, 0.0],
            [sin_t, cos_t, 0.0],
            [0.0, 0.0, 1.0],
        ]
    )
    mean_xy = vertices[:, :2].mean(axis=0)
    centered_3d = vertices.copy()
    centered_3d[:, 0] -= mean_xy[0]
    centered_3d[:, 1] -= mean_xy[1]
    rotated = centered_3d @ rot.T
    rotated[:, 0] += mean_xy[0]
    rotated[:, 1] += mean_xy[1]
    return rotated, True
