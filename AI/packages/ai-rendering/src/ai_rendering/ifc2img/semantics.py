"""IFC semantic element extraction helpers for debug and view diagnosis."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import ifcopenshell
import ifcopenshell.geom
import numpy as np

from .exceptions import IFCRenderError

IfcSemanticCategory = Literal["FLOOR", "ROOF", "WALL", "WINDOW", "DOOR"]
SUPPORTED_SEMANTIC_CATEGORIES: tuple[IfcSemanticCategory, ...] = (
    "FLOOR",
    "ROOF",
    "WALL",
    "WINDOW",
    "DOOR",
)


@dataclass(frozen=True)
class IfcSemanticBounds:
    min_xyz: tuple[float, float, float]
    max_xyz: tuple[float, float, float]
    center_xyz: tuple[float, float, float]

    @property
    def z_min(self) -> float:
        return self.min_xyz[2]

    @property
    def z_max(self) -> float:
        return self.max_xyz[2]

    def to_dict(self) -> dict[str, object]:
        return {
            "min": list(self.min_xyz),
            "max": list(self.max_xyz),
            "center": list(self.center_xyz),
            "zMin": self.z_min,
            "zMax": self.z_max,
        }


@dataclass(frozen=True)
class IfcSemanticElement:
    category: IfcSemanticCategory
    entity_id: int
    ifc_type: str
    predefined_type: str | None
    name: str | None
    vertex_count: int
    face_count: int
    bounds: IfcSemanticBounds

    def to_dict(self) -> dict[str, object]:
        return {
            "category": self.category,
            "entityId": self.entity_id,
            "ifcType": self.ifc_type,
            "predefinedType": self.predefined_type,
            "name": self.name,
            "vertexCount": self.vertex_count,
            "faceCount": self.face_count,
            "bounds": self.bounds.to_dict(),
        }


@dataclass(frozen=True)
class IfcSemanticCategorySummary:
    category: IfcSemanticCategory
    count: int
    z_min: float | None
    z_max: float | None
    vertex_count: int
    face_count: int

    def to_dict(self) -> dict[str, object]:
        return {
            "count": self.count,
            "zMin": self.z_min,
            "zMax": self.z_max,
            "vertexCount": self.vertex_count,
            "faceCount": self.face_count,
        }


@dataclass(frozen=True)
class IfcSemanticSummary:
    source_ifc_path: Path
    elements: tuple[IfcSemanticElement, ...]
    categories: dict[IfcSemanticCategory, IfcSemanticCategorySummary]

    def to_dict(self) -> dict[str, object]:
        return {
            "sourceIfcPath": str(self.source_ifc_path),
            "categories": {
                category: summary.to_dict()
                for category, summary in self.categories.items()
            },
            "lowestFloor": _element_to_dict_or_none(self.lowest_floor),
            "highestRoof": _element_to_dict_or_none(self.highest_roof),
            "doorCandidates": [element.to_dict() for element in self.door_candidates],
            "elements": [element.to_dict() for element in self.elements],
        }

    @property
    def lowest_floor(self) -> IfcSemanticElement | None:
        floors = [element for element in self.elements if element.category == "FLOOR"]
        if not floors:
            return None
        return min(floors, key=lambda element: element.bounds.z_min)

    @property
    def highest_roof(self) -> IfcSemanticElement | None:
        roofs = [element for element in self.elements if element.category == "ROOF"]
        if not roofs:
            return None
        return max(roofs, key=lambda element: element.bounds.z_max)

    @property
    def door_candidates(self) -> tuple[IfcSemanticElement, ...]:
        return tuple(element for element in self.elements if element.category == "DOOR")


def extract_ifc_semantic_summary(ifc_path: Path | str) -> IfcSemanticSummary:
    """Extract key architectural IFC elements with world-space geometry bounds."""
    ifc_path = Path(ifc_path)
    try:
        model = ifcopenshell.open(str(ifc_path))
    except Exception as exc:
        raise IFCRenderError(f"IFC semantic read failed: {exc}") from exc

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.WELD_VERTICES, True)

    iterator = ifcopenshell.geom.iterator(settings, model)
    if not iterator.initialize():
        raise IFCRenderError("IFC semantic geometry iterator failed.")

    elements: list[IfcSemanticElement] = []
    while True:
        shape = iterator.get()
        entity = model.by_id(shape.id)
        category = _semantic_category_for_entity(entity)
        if category is not None:
            vertices = np.asarray(shape.geometry.verts, dtype=np.float64).reshape(-1, 3)
            faces = np.asarray(shape.geometry.faces, dtype=np.int64).reshape(-1, 3)
            if len(vertices) > 0 and len(faces) > 0:
                elements.append(
                    IfcSemanticElement(
                        category=category,
                        entity_id=int(entity.id()),
                        ifc_type=str(entity.is_a()),
                        predefined_type=_entity_predefined_type(entity),
                        name=_entity_name(entity),
                        vertex_count=int(len(vertices)),
                        face_count=int(len(faces)),
                        bounds=_bounds_for_vertices(vertices),
                    )
                )
        if not iterator.next():
            break

    return IfcSemanticSummary(
        source_ifc_path=ifc_path,
        elements=tuple(elements),
        categories=_summarize_categories(elements),
    )


def _semantic_category_for_entity(entity: object) -> IfcSemanticCategory | None:
    if _is_a(entity, "IfcSlab"):
        predefined_type = _entity_predefined_type(entity)
        if predefined_type == "FLOOR":
            return "FLOOR"
        if predefined_type == "ROOF":
            return "ROOF"
        return None
    if _is_a(entity, "IfcRoof"):
        return "ROOF"
    if _is_a(entity, "IfcWall") or _is_a(entity, "IfcWallStandardCase"):
        return "WALL"
    if _is_a(entity, "IfcWindow"):
        return "WINDOW"
    if _is_a(entity, "IfcDoor"):
        return "DOOR"
    return None


def _summarize_categories(
    elements: list[IfcSemanticElement],
) -> dict[IfcSemanticCategory, IfcSemanticCategorySummary]:
    summaries: dict[IfcSemanticCategory, IfcSemanticCategorySummary] = {}
    for category in SUPPORTED_SEMANTIC_CATEGORIES:
        category_elements = [
            element for element in elements if element.category == category
        ]
        if category_elements:
            z_min = min(element.bounds.z_min for element in category_elements)
            z_max = max(element.bounds.z_max for element in category_elements)
        else:
            z_min = None
            z_max = None
        summaries[category] = IfcSemanticCategorySummary(
            category=category,
            count=len(category_elements),
            z_min=z_min,
            z_max=z_max,
            vertex_count=sum(element.vertex_count for element in category_elements),
            face_count=sum(element.face_count for element in category_elements),
        )
    return summaries


def _bounds_for_vertices(vertices: np.ndarray) -> IfcSemanticBounds:
    min_xyz_arr = vertices.min(axis=0)
    max_xyz_arr = vertices.max(axis=0)
    center_xyz_arr = (min_xyz_arr + max_xyz_arr) / 2
    return IfcSemanticBounds(
        min_xyz=tuple(float(value) for value in min_xyz_arr),
        max_xyz=tuple(float(value) for value in max_xyz_arr),
        center_xyz=tuple(float(value) for value in center_xyz_arr),
    )


def _entity_predefined_type(entity: object) -> str | None:
    value = getattr(entity, "PredefinedType", None)
    if value is None:
        return None
    return str(value).upper()


def _entity_name(entity: object) -> str | None:
    value = getattr(entity, "Name", None)
    if value is None:
        return None
    return str(value)


def _is_a(entity: object, ifc_type: str) -> bool:
    is_a = getattr(entity, "is_a", None)
    if not callable(is_a):
        return False
    return bool(is_a(ifc_type))


def _element_to_dict_or_none(
    element: IfcSemanticElement | None,
) -> dict[str, object] | None:
    if element is None:
        return None
    return element.to_dict()
