"""IFC 파일 → Open3D TriangleMesh 변환."""

from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import open3d as o3d

from .exceptions import IFCRenderError


def load_mesh(ifc_path: Path) -> tuple[o3d.geometry.TriangleMesh, np.ndarray]:
    """IFC 파일을 파싱해 mesh와 AABB center를 반환한다.

    Returns:
        (mesh, center) — mesh는 vertex normals 계산 완료 상태.
        center는 shape (3,) ndarray.

    Raises:
        IFCRenderError: 파일 열기 실패, geometry 없음, vertex 없음.
    """
    try:
        model = ifcopenshell.open(str(ifc_path))
    except Exception as e:
        raise IFCRenderError(f"IFC 파일 열기 실패: {e}") from e

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
        geo = shape.geometry
        v = np.array(geo.verts, dtype=np.float64).reshape(-1, 3)
        f = np.array(geo.faces, dtype=np.int64).reshape(-1, 3) + offset
        verts_list.append(v)
        faces_list.append(f)
        offset += len(v)
        if not iterator.next():
            break

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
