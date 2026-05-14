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
ScreenRegion = Literal["top", "middle", "bottom", "unknown"]
FootprintSide = Literal["min_x", "max_x", "min_y", "max_y", "unknown"]
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
            "frontDirectionCandidates": [
                candidate.to_dict() for candidate in self.front_direction_candidates
            ],
            "mainDoorCandidate": _front_candidate_to_dict_or_none(
                self.main_door_candidate
            ),
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

    @property
    def front_direction_candidates(self) -> tuple[IfcFrontDirectionCandidate, ...]:
        return tuple(build_front_direction_candidates(self.elements))

    @property
    def main_door_candidate(self) -> IfcFrontDirectionCandidate | None:
        candidates = self.front_direction_candidates
        if not candidates:
            return None
        return max(candidates, key=lambda candidate: candidate.score)


@dataclass(frozen=True)
class IfcFrontDirectionCandidate:
    door_entity_id: int
    door_name: str | None
    door_center: tuple[float, float, float]
    nearest_footprint_side: FootprintSide
    distance_to_footprint_edge: float | None
    exterior_wall_near: bool
    nearest_wall_entity_id: int | None
    nearest_wall_distance: float | None
    front_vector: tuple[float, float, float]
    score: float

    def to_dict(self) -> dict[str, object]:
        return {
            "doorEntityId": self.door_entity_id,
            "doorName": self.door_name,
            "doorCenter": list(self.door_center),
            "nearestFootprintSide": self.nearest_footprint_side,
            "distanceToFootprintEdge": self.distance_to_footprint_edge,
            "exteriorWallNear": self.exterior_wall_near,
            "nearestWallEntityId": self.nearest_wall_entity_id,
            "nearestWallDistance": self.nearest_wall_distance,
            "frontVector": list(self.front_vector),
            "score": self.score,
        }


@dataclass(frozen=True)
class IfcSemanticScreenMaskStats:
    category: IfcSemanticCategory
    pixel_count: int
    y_min: int | None
    y_max: int | None
    image_height: int

    @property
    def y_center(self) -> float | None:
        if self.y_min is None or self.y_max is None:
            return None
        return (self.y_min + self.y_max) / 2.0

    @property
    def screen_region(self) -> ScreenRegion:
        center = self.y_center
        if self.pixel_count <= 0 or center is None or self.image_height <= 0:
            return "unknown"
        if center < self.image_height / 3:
            return "top"
        if center > self.image_height * 2 / 3:
            return "bottom"
        return "middle"

    def to_dict(self) -> dict[str, object]:
        return {
            "category": self.category,
            "pixelCount": self.pixel_count,
            "yMin": self.y_min,
            "yMax": self.y_max,
            "yCenter": self.y_center,
            "screenRegion": self.screen_region,
        }


def is_reliable_main_door_candidate(
    candidate: IfcFrontDirectionCandidate | None,
) -> bool:
    """Return whether a door candidate is reliable enough for semantic front camera."""
    if candidate is None:
        return False
    if not candidate.exterior_wall_near:
        return False
    if candidate.nearest_footprint_side == "unknown":
        return False
    if candidate.score <= 0.0:
        return False
    front_vector = np.asarray(candidate.front_vector, dtype=np.float64)
    if front_vector.shape != (3,):
        return False
    if not np.all(np.isfinite(front_vector)):
        return False
    xy_length = float(np.linalg.norm(front_vector[:2]))
    return abs(xy_length - 1.0) <= 1e-3 and abs(float(front_vector[2])) <= 1e-6


@dataclass(frozen=True)
class IfcProjectionDiagnostics:
    vertical_inversion_suspected: bool
    floor_screen_region: ScreenRegion
    roof_screen_region: ScreenRegion
    floor_above_roof_on_screen: bool | None
    floor_below_roof_in_world: bool | None

    @property
    def projection_vertical_inversion_suspected(self) -> bool:
        return self.vertical_inversion_suspected

    def to_dict(self) -> dict[str, object]:
        return {
            "projectionVerticalInversionSuspected": (
                self.projection_vertical_inversion_suspected
            ),
            "verticalInversionSuspected": self.vertical_inversion_suspected,
            "floorScreenRegion": self.floor_screen_region,
            "roofScreenRegion": self.roof_screen_region,
            "floorAboveRoofOnScreen": self.floor_above_roof_on_screen,
            "floorBelowRoofInWorld": self.floor_below_roof_in_world,
        }


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


def diagnose_projection_vertical_inversion(
    semantic_summary: IfcSemanticSummary,
    screen_masks: dict[IfcSemanticCategory, IfcSemanticScreenMaskStats],
) -> IfcProjectionDiagnostics:
    """Compare IFC world z semantics with screen y positions for inversion clues."""
    floor_summary = semantic_summary.categories["FLOOR"]
    roof_summary = semantic_summary.categories["ROOF"]
    floor_below_roof_in_world: bool | None
    if (
        floor_summary.z_max is None
        or roof_summary.z_min is None
        or floor_summary.count == 0
        or roof_summary.count == 0
    ):
        floor_below_roof_in_world = None
    else:
        floor_below_roof_in_world = floor_summary.z_max < roof_summary.z_min

    floor_mask = screen_masks.get("FLOOR")
    roof_mask = screen_masks.get("ROOF")
    floor_above_roof_on_screen: bool | None
    if (
        floor_mask is None
        or roof_mask is None
        or floor_mask.y_center is None
        or roof_mask.y_center is None
    ):
        floor_above_roof_on_screen = None
    else:
        floor_above_roof_on_screen = floor_mask.y_center < roof_mask.y_center

    vertical_inversion_suspected = bool(
        floor_below_roof_in_world is True
        and floor_above_roof_on_screen is True
    )

    return IfcProjectionDiagnostics(
        vertical_inversion_suspected=vertical_inversion_suspected,
        floor_screen_region=(
            floor_mask.screen_region if floor_mask is not None else "unknown"
        ),
        roof_screen_region=(
            roof_mask.screen_region if roof_mask is not None else "unknown"
        ),
        floor_above_roof_on_screen=floor_above_roof_on_screen,
        floor_below_roof_in_world=floor_below_roof_in_world,
    )


def build_front_direction_candidates(
    elements: tuple[IfcSemanticElement, ...] | list[IfcSemanticElement],
) -> list[IfcFrontDirectionCandidate]:
    """Infer front direction candidates from exterior-like door positions."""
    doors = [element for element in elements if element.category == "DOOR"]
    if not doors:
        return []

    footprint_elements = [
        element
        for element in elements
        if element.category in {"FLOOR", "ROOF", "WALL", "DOOR"}
    ]
    footprint = _footprint_bounds(footprint_elements)
    walls = [element for element in elements if element.category == "WALL"]
    footprint_extent = max(
        footprint[1] - footprint[0],
        footprint[3] - footprint[2],
        1.0,
    )
    edge_threshold = max(0.5, footprint_extent * 0.08)
    wall_threshold = max(0.25, footprint_extent * 0.05)

    candidates: list[IfcFrontDirectionCandidate] = []
    for door in doors:
        side, edge_distance, front_vector = _nearest_footprint_side(
            door.bounds.center_xyz,
            footprint,
        )
        nearest_wall, wall_distance = _nearest_wall(door, walls)
        exterior_wall_near = (
            edge_distance <= edge_threshold
            and wall_distance is not None
            and wall_distance <= wall_threshold
        )
        door_extent = (
            door.bounds.max_xyz[0] - door.bounds.min_xyz[0],
            door.bounds.max_xyz[1] - door.bounds.min_xyz[1],
            door.bounds.max_xyz[2] - door.bounds.min_xyz[2],
        )
        door_size_score = max(door_extent[0], door_extent[1]) * max(door_extent[2], 0.1)
        edge_score = max(0.0, 1.0 - edge_distance / edge_threshold)
        wall_score = (
            max(0.0, 1.0 - wall_distance / wall_threshold)
            if wall_distance is not None
            else 0.0
        )
        score = door_size_score + edge_score + wall_score
        if exterior_wall_near:
            score += 2.0
        candidates.append(
            IfcFrontDirectionCandidate(
                door_entity_id=door.entity_id,
                door_name=door.name,
                door_center=door.bounds.center_xyz,
                nearest_footprint_side=side,
                distance_to_footprint_edge=edge_distance,
                exterior_wall_near=exterior_wall_near,
                nearest_wall_entity_id=(
                    nearest_wall.entity_id if nearest_wall is not None else None
                ),
                nearest_wall_distance=wall_distance,
                front_vector=front_vector,
                score=float(score),
            )
        )
    return sorted(candidates, key=lambda candidate: candidate.score, reverse=True)


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


def _footprint_bounds(
    elements: list[IfcSemanticElement],
) -> tuple[float, float, float, float]:
    if not elements:
        return (0.0, 0.0, 0.0, 0.0)
    min_x = min(element.bounds.min_xyz[0] for element in elements)
    max_x = max(element.bounds.max_xyz[0] for element in elements)
    min_y = min(element.bounds.min_xyz[1] for element in elements)
    max_y = max(element.bounds.max_xyz[1] for element in elements)
    return (min_x, max_x, min_y, max_y)


def _nearest_footprint_side(
    center_xyz: tuple[float, float, float],
    footprint: tuple[float, float, float, float],
) -> tuple[FootprintSide, float, tuple[float, float, float]]:
    x, y, _z = center_xyz
    min_x, max_x, min_y, max_y = footprint
    distances: dict[FootprintSide, float] = {
        "min_x": abs(x - min_x),
        "max_x": abs(max_x - x),
        "min_y": abs(y - min_y),
        "max_y": abs(max_y - y),
    }
    side = min(distances, key=distances.__getitem__)
    vectors: dict[FootprintSide, tuple[float, float, float]] = {
        "min_x": (-1.0, 0.0, 0.0),
        "max_x": (1.0, 0.0, 0.0),
        "min_y": (0.0, -1.0, 0.0),
        "max_y": (0.0, 1.0, 0.0),
        "unknown": (0.0, -1.0, 0.0),
    }
    return side, float(distances[side]), vectors[side]


def _nearest_wall(
    door: IfcSemanticElement,
    walls: list[IfcSemanticElement],
) -> tuple[IfcSemanticElement | None, float | None]:
    if not walls:
        return None, None
    nearest = min(walls, key=lambda wall: _xy_aabb_distance(door, wall))
    return nearest, _xy_aabb_distance(door, nearest)


def _xy_aabb_distance(first: IfcSemanticElement, second: IfcSemanticElement) -> float:
    dx = max(
        first.bounds.min_xyz[0] - second.bounds.max_xyz[0],
        second.bounds.min_xyz[0] - first.bounds.max_xyz[0],
        0.0,
    )
    dy = max(
        first.bounds.min_xyz[1] - second.bounds.max_xyz[1],
        second.bounds.min_xyz[1] - first.bounds.max_xyz[1],
        0.0,
    )
    return float((dx * dx + dy * dy) ** 0.5)


def _element_to_dict_or_none(
    element: IfcSemanticElement | None,
) -> dict[str, object] | None:
    if element is None:
        return None
    return element.to_dict()


def _front_candidate_to_dict_or_none(
    candidate: IfcFrontDirectionCandidate | None,
) -> dict[str, object] | None:
    if candidate is None:
        return None
    return candidate.to_dict()
