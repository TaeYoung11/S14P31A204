"""IFC element-type debug mask rendering."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import open3d as o3d
from PIL import Image

from .exceptions import IFCRenderError
from .semantics import IfcSemanticCategory, SUPPORTED_SEMANTIC_CATEGORIES
from .semantics import _semantic_category_for_entity as semantic_category_for_entity

ELEMENT_MASK_COLORS: dict[IfcSemanticCategory, tuple[int, int, int]] = {
    "FLOOR": (255, 64, 64),
    "ROOF": (64, 128, 255),
    "WALL": (160, 160, 160),
    "WINDOW": (64, 220, 255),
    "DOOR": (255, 160, 64),
}


@dataclass(frozen=True)
class IfcElementMaskRenderResult:
    masks: dict[IfcSemanticCategory, Image.Image]
    composite: Image.Image


def render_ifc_element_masks(
    ifc_path: Path | str,
    *,
    eye: tuple[float, float, float] | list[float],
    look_at: tuple[float, float, float] | list[float],
    up: tuple[float, float, float] | list[float],
    width: int,
    height: int,
) -> IfcElementMaskRenderResult:
    """Render visible FLOOR/ROOF/WALL/WINDOW/DOOR masks from IFC geometry."""
    ifc_path = Path(ifc_path)
    category_meshes = _load_category_meshes(ifc_path)
    all_mesh = _merge_meshes(list(category_meshes.values()))
    if all_mesh is None:
        raise IFCRenderError("IFC element mask rendering found no supported geometry.")

    rays = _create_rays(
        eye=np.asarray(eye, dtype=np.float32),
        look_at=np.asarray(look_at, dtype=np.float32),
        up=np.asarray(up, dtype=np.float32),
        width=width,
        height=height,
    )
    full_depth = _cast_depth(all_mesh, rays, width=width, height=height)
    masks: dict[IfcSemanticCategory, Image.Image] = {}
    composite_arr = np.zeros((height, width, 3), dtype=np.uint8)

    for category in SUPPORTED_SEMANTIC_CATEGORIES:
        mesh = category_meshes.get(category)
        if mesh is None:
            mask_arr = np.zeros((height, width), dtype=np.uint8)
        else:
            category_depth = _cast_depth(mesh, rays, width=width, height=height)
            visible = _visible_category_mask(full_depth, category_depth)
            mask_arr = visible.astype(np.uint8) * 255
            composite_arr[visible] = ELEMENT_MASK_COLORS[category]
        masks[category] = Image.fromarray(mask_arr, mode="L")

    return IfcElementMaskRenderResult(
        masks=masks,
        composite=Image.fromarray(composite_arr, mode="RGB"),
    )


def _load_category_meshes(ifc_path: Path) -> dict[IfcSemanticCategory, Any]:
    try:
        model = ifcopenshell.open(str(ifc_path))
    except Exception as exc:
        raise IFCRenderError(f"IFC element mask read failed: {exc}") from exc

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.WELD_VERTICES, True)

    iterator = ifcopenshell.geom.iterator(settings, model)
    if not iterator.initialize():
        raise IFCRenderError("IFC element mask geometry iterator failed.")

    grouped_vertices: dict[IfcSemanticCategory, list[np.ndarray]] = {
        category: [] for category in SUPPORTED_SEMANTIC_CATEGORIES
    }
    grouped_faces: dict[IfcSemanticCategory, list[np.ndarray]] = {
        category: [] for category in SUPPORTED_SEMANTIC_CATEGORIES
    }

    while True:
        shape = iterator.get()
        entity = model.by_id(shape.id)
        category = semantic_category_for_entity(entity)
        if category is not None:
            vertices = np.asarray(shape.geometry.verts, dtype=np.float64).reshape(-1, 3)
            faces = np.asarray(shape.geometry.faces, dtype=np.int64).reshape(-1, 3)
            if len(vertices) > 0 and len(faces) > 0:
                grouped_vertices[category].append(vertices)
                grouped_faces[category].append(faces)
        if not iterator.next():
            break

    meshes: dict[IfcSemanticCategory, Any] = {}
    for category in SUPPORTED_SEMANTIC_CATEGORIES:
        mesh = _mesh_from_parts(grouped_vertices[category], grouped_faces[category])
        if mesh is not None:
            meshes[category] = mesh
    return meshes


def _mesh_from_parts(
    vertices_parts: list[np.ndarray],
    faces_parts: list[np.ndarray],
) -> Any | None:
    if not vertices_parts or not faces_parts:
        return None
    merged_vertices: list[np.ndarray] = []
    merged_faces: list[np.ndarray] = []
    offset = 0
    for vertices, faces in zip(vertices_parts, faces_parts, strict=True):
        merged_vertices.append(vertices)
        merged_faces.append(faces + offset)
        offset += len(vertices)
    mesh = o3d.geometry.TriangleMesh()
    mesh.vertices = o3d.utility.Vector3dVector(np.vstack(merged_vertices))
    mesh.triangles = o3d.utility.Vector3iVector(np.vstack(merged_faces))
    return mesh


def _merge_meshes(meshes: list[Any]) -> Any | None:
    vertices_parts: list[np.ndarray] = []
    faces_parts: list[np.ndarray] = []
    for mesh in meshes:
        vertices_parts.append(np.asarray(mesh.vertices, dtype=np.float64))
        faces_parts.append(np.asarray(mesh.triangles, dtype=np.int64))
    return _mesh_from_parts(vertices_parts, faces_parts)


def _create_rays(
    *,
    eye: np.ndarray,
    look_at: np.ndarray,
    up: np.ndarray,
    width: int,
    height: int,
) -> Any:
    return o3d.t.geometry.RaycastingScene.create_rays_pinhole(
        60.0,
        o3d.core.Tensor(look_at, dtype=o3d.core.Dtype.Float32),
        o3d.core.Tensor(eye, dtype=o3d.core.Dtype.Float32),
        o3d.core.Tensor(up, dtype=o3d.core.Dtype.Float32),
        width,
        height,
    )


def _cast_depth(
    mesh: Any,
    rays: Any,
    *,
    width: int,
    height: int,
) -> np.ndarray:
    scene = o3d.t.geometry.RaycastingScene()
    mesh_t = o3d.t.geometry.TriangleMesh.from_legacy(mesh)
    scene.add_triangles(mesh_t)
    ans = scene.cast_rays(rays)
    depth = ans["t_hit"].numpy().reshape((height, width)).astype(np.float32, copy=False)
    depth[~np.isfinite(depth)] = 0.0
    return depth


def _visible_category_mask(
    full_depth: np.ndarray,
    category_depth: np.ndarray,
) -> np.ndarray:
    full_hit = full_depth > 0
    category_hit = category_depth > 0
    epsilon = np.maximum(full_depth * 1e-3, 1e-3)
    return full_hit & category_hit & (np.abs(category_depth - full_depth) <= epsilon)
