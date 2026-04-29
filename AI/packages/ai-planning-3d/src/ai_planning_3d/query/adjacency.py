"""
AdjacencyQueryEngine — 공간 인접성 기반 컨텍스트 참조 고도화
Ticket #210: 다중 부재 편집을 위한 공간 인접성 기반 컨텍스트 참조 고도화
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any

import ifcopenshell

logger = logging.getLogger(__name__)

DIRECTION_VECTORS: dict[str, tuple[float, float]] = {
    "north": (0.0, 1.0),
    "south": (0.0, -1.0),
    "east": (1.0, 0.0),
    "west": (-1.0, 0.0),
}

DIRECTION_KO_ALIASES: dict[str, str] = {
    "북": "north", "북쪽": "north", "위쪽": "north",
    "남": "south", "남쪽": "south", "아래쪽": "south",
    "동": "east", "동쪽": "east", "오른쪽": "east",
    "서": "west", "서쪽": "west", "왼쪽": "west",
}

ADJACENCY_KEYWORDS: frozenset[str] = frozenset({"옆", "근처", "인접", "옆에", "next to"})
DEFAULT_THRESHOLD_MM: float = 500.0
EXTENDED_THRESHOLD_MM: float = 1500.0


@dataclass
class AdjacencyCandidate:
    element_info: dict[str, Any]
    distance_mm: float
    dot_score: float

    @property
    def sort_key(self) -> tuple[float, float]:
        return (self.distance_mm, -self.dot_score)


@dataclass
class AdjacencyResult:
    reference_id: str
    adjacent_elements: list[dict[str, Any]] = field(default_factory=list)
    search_direction: str | None = None
    threshold_mm: float = DEFAULT_THRESHOLD_MM
    message: str = ""

    @property
    def found(self) -> bool:
        return bool(self.adjacent_elements)

    @property
    def elements(self) -> list[dict[str, Any]]:
        """Backward-compatible alias for older scenario tests."""
        return self.adjacent_elements


class AdjacencyQueryEngine:
    def __init__(self, model: ifcopenshell.file, scale_to_mm: float = 1.0) -> None:
        self._model = model
        self._scale = scale_to_mm

    def find_adjacent(
        self, reference_info: dict[str, Any], direction: str | None = None,
        element_type: str = "IfcWall", threshold_mm: float = DEFAULT_THRESHOLD_MM,
        max_results: int = 5, exclude_ids: set[str] | None = None,
    ) -> AdjacencyResult:
        ref_gid = reference_info.get("global_id", "")
        ref_element = self._model.by_guid(ref_gid) if ref_gid else None
        if not ref_element:
            return AdjacencyResult(reference_id=ref_gid, message="기준 부재를 찾을 수 없습니다.")

        exclude = set(exclude_ids or set())
        exclude.add(ref_gid)
        ref_center = self._element_center_mm(ref_element)
        if ref_center is None:
            return AdjacencyResult(
                reference_id=ref_gid,
                message="기준 부재의 위치를 계산할 수 없습니다.",
            )
        norm_dir = self._normalize_direction(direction)

        candidates: list[AdjacencyCandidate] = []
        for el in self._model.by_type(element_type):
            if el.GlobalId in exclude:
                continue
            el_center = self._element_center_mm(el)
            if el_center is None:
                continue
            dist_mm, dot = self._distance_and_dot(ref_center, el_center, norm_dir)
            if dist_mm > threshold_mm:
                continue

            if norm_dir is not None and dot < 0:
                continue

            candidates.append(AdjacencyCandidate(
                element_info=self._element_to_dict(el), distance_mm=dist_mm, dot_score=dot
            ))

        candidates.sort(key=lambda c: c.sort_key)
        top = [c.element_info for c in candidates[:max_results]]
        return AdjacencyResult(
            reference_id=ref_gid, adjacent_elements=top,
            search_direction=norm_dir, threshold_mm=threshold_mm,
            message=f"{len(top)}개 인접 부재 발견"
        )

    def find_adjacent_by_text(
        self, reference_info: dict[str, Any], text: str, element_type: str = "IfcWall"
    ) -> AdjacencyResult:
        direction = self._extract_direction_from_text(text)
        threshold = (
            EXTENDED_THRESHOLD_MM
            if any(kw in text for kw in ADJACENCY_KEYWORDS)
            else DEFAULT_THRESHOLD_MM
        )
        return self.find_adjacent(reference_info, direction, element_type, threshold)

    def _element_center_mm(
        self, element: ifcopenshell.entity_instance
    ) -> tuple[float, float, float] | None:
        placement = getattr(element, "ObjectPlacement", None)
        if not placement or not placement.is_a("IfcLocalPlacement"):
            return None

        coords_sum = [0.0, 0.0, 0.0]
        current = placement
        while current and current.is_a("IfcLocalPlacement"):
            rel = getattr(current, "RelativePlacement", None)
            loc = getattr(rel, "Location", None) if rel else None
            coords = tuple(getattr(loc, "Coordinates", ()) or ())
            if len(coords) >= 3:
                coords_sum[0] += float(coords[0]) * self._scale
                coords_sum[1] += float(coords[1]) * self._scale
                coords_sum[2] += float(coords[2]) * self._scale
            current = getattr(current, "PlacementRelTo", None)
        return tuple(coords_sum)

    def _distance_and_dot(self, ref, target, direction) -> tuple[float, float]:
        dx, dy = target[0] - ref[0], target[1] - ref[1]
        dist = math.sqrt(dx*dx + dy*dy)
        if direction is None or dist < 1e-6:
            return dist, 1.0
        nx, ny = DIRECTION_VECTORS[direction]
        return dist, (dx/dist)*nx + (dy/dist)*ny

    def _element_to_dict(self, element: ifcopenshell.entity_instance) -> dict[str, Any]:
        center = self._element_center_mm(element) or (0.0, 0.0, 0.0)
        cx, cy, cz = center
        lx, ly, lz = self._element_dims_mm(element)
        return {
            "global_id": element.GlobalId,
            "element_type": element.is_a(),
            "name": element.Name,
            "center_mm": {"x": cx, "y": cy, "z": cz},
            "dims": {
                "z_mm": cz,
                "height_mm": lz,
                "width_mm": ly,
                "length_mm": lx,
            },
        }

    def _element_dims_mm(
        self,
        element: ifcopenshell.entity_instance,
    ) -> tuple[float, float, float]:
        rep = getattr(element, "Representation", None)
        if not rep:
            return 0.0, 0.0, 0.0

        for representation in getattr(rep, "Representations", []) or []:
            if getattr(representation, "RepresentationIdentifier", None) != "Body":
                continue
            for item in getattr(representation, "Items", []) or []:
                if item.is_a("IfcExtrudedAreaSolid"):
                    profile = getattr(item, "SweptArea", None)
                    if profile and profile.is_a("IfcRectangleProfileDef"):
                        return (
                            float(profile.XDim) * self._scale,
                            float(profile.YDim) * self._scale,
                            float(item.Depth) * self._scale,
                        )
                    dims = self._profile_dims_mm(profile)
                    if dims is not None:
                        return dims[0], dims[1], float(item.Depth) * self._scale
        return 0.0, 0.0, 0.0

    def _profile_dims_mm(
        self,
        profile: ifcopenshell.entity_instance | None,
    ) -> tuple[float, float] | None:
        if not profile or not profile.is_a("IfcArbitraryClosedProfileDef"):
            return None

        curve = getattr(profile, "OuterCurve", None)
        points: list[tuple[float, float]] = []
        if curve and curve.is_a("IfcIndexedPolyCurve"):
            point_list = getattr(curve, "Points", None)
            for coords in getattr(point_list, "CoordList", []) or []:
                if len(coords) >= 2:
                    points.append((float(coords[0]), float(coords[1])))
        elif curve and curve.is_a("IfcPolyline"):
            for point in getattr(curve, "Points", []) or []:
                coords = tuple(getattr(point, "Coordinates", ()) or ())
                if len(coords) >= 2:
                    points.append((float(coords[0]), float(coords[1])))

        if not points:
            return None
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        return (max(xs) - min(xs)) * self._scale, (max(ys) - min(ys)) * self._scale

    def _normalize_direction(self, direction: str | None) -> str | None:
        if not direction:
            return None
        key = direction.strip().lower()
        normalized = DIRECTION_KO_ALIASES.get(key, key)
        return normalized if normalized in DIRECTION_VECTORS else None

    def _extract_direction_from_text(self, text: str) -> str | None:
        key = text.strip().lower()
        combined = {**DIRECTION_KO_ALIASES, **{name: name for name in DIRECTION_VECTORS}}
        for alias, normalized in combined.items():
            if alias in key:
                return normalized
        return None
