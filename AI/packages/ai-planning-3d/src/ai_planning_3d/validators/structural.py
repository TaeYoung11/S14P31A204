"""
StructuralSafetyValidator — 건축적 유효성 및 구조 안정성 사후 검증
Ticket #209: 건축적 유효성 및 구조 안정성 사후 검증 필터 구현
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import ifcopenshell

logger = logging.getLogger(__name__)

LOAD_BEARING_KEYWORDS: frozenset[str] = frozenset(
    {
        "load-bearing", "load bearing", "loadbearing", "structural",
        "bearing wall", "내력", "내력벽", "구조벽", "구조"
    }
)

LOAD_BEARING_PSET_PROPS: frozenset[str] = frozenset(
    {"loadbearing", "load_bearing", "load bearing", "isloadbearing"}
)

SUPPORT_TYPES: frozenset[str] = frozenset({"IfcWall", "IfcColumn"})
DEFAULT_SUPPORT_TOLERANCE_MM: float = 300.0
LOAD_BEARING_PSET_KEYS: frozenset[str] = frozenset(
    prop.replace("_", "").replace(" ", "") for prop in LOAD_BEARING_PSET_PROPS
)


@dataclass(frozen=True)
class Footprint:
    min_x: float
    max_x: float
    min_y: float
    max_y: float
    min_z: float
    max_z: float

    def overlaps_xy(self, other: Footprint, tolerance_mm: float = 0.0) -> bool:
        return (
            self.min_x <= other.max_x + tolerance_mm
            and self.max_x >= other.min_x - tolerance_mm
            and self.min_y <= other.max_y + tolerance_mm
            and self.max_y >= other.min_y - tolerance_mm
        )


@dataclass
class StructuralCheckResult:
    """StructuralSafetyValidator 검사 결과 봉투."""

    safe: bool
    warnings: list[str] = field(default_factory=list)
    blocked: bool = False

    @property
    def messages(self) -> list[str]:
        return list(self.warnings)

    def to_summary_lines(self) -> list[str]:
        return list(self.warnings)

    @classmethod
    def ok(cls) -> StructuralCheckResult:
        return cls(safe=True)


class StructuralSafetyValidator:
    """
    삭제/생성 작업 시 구조 안전성을 사후 검증한다.
    """

    def __init__(self, model: ifcopenshell.file, scale_to_mm: float = 1.0) -> None:
        self._model = model
        self._scale = scale_to_mm

    def check_delete(
        self, element: ifcopenshell.entity_instance
    ) -> StructuralCheckResult:
        if not element.is_a("IfcWall"):
            return StructuralCheckResult.ok()

        if self._is_load_bearing(element):
            name = element.Name or element.GlobalId[:8]
            return StructuralCheckResult(
                safe=False,
                blocked=True,
                warnings=[
                    f"[구조차단] '{name}'은(는) 내력벽(Load-bearing Wall)으로 "
                    "판별되었습니다. 삭제 시 구조 안전성에 영향을 줄 수 있습니다."
                ],
            )
        return StructuralCheckResult.ok()

    def check_create_support(
        self,
        create_info: dict[str, Any],
        storey: ifcopenshell.entity_instance,
        support_tolerance_mm: float = DEFAULT_SUPPORT_TOLERANCE_MM,
    ) -> StructuralCheckResult:
        element_type = str(create_info.get("element_type", ""))
        if element_type not in ("IfcSlab", "IfcRoof"):
            return StructuralCheckResult.ok()

        sp = create_info.get("start_point") or {}
        try:
            new_z = float(sp.get("z") or 0.0)
        except (TypeError, ValueError):
            return StructuralCheckResult(
                safe=False,
                blocked=False,
                warnings=["[구조검사] 생성 부재의 Z 좌표를 계산할 수 없습니다."],
            )

        has_support = self._find_support_below(
            storey,
            create_info,
            new_z,
            support_tolerance_mm,
        )
        if not has_support:
            return StructuralCheckResult(
                safe=False,
                blocked=False,
                warnings=[
                    f"[구조경고] {element_type} 하단(Z={new_z:.0f}mm)에 "
                    f"지지 부재(벽/기둥)가 감지되지 않았습니다."
                ],
            )
        return StructuralCheckResult.ok()

    def _is_load_bearing(self, wall: ifcopenshell.entity_instance) -> bool:
        name_lower = (wall.Name or "").lower()
        desc_lower = (getattr(wall, "Description", None) or "").lower()
        if any(kw in name_lower or kw in desc_lower for kw in LOAD_BEARING_KEYWORDS):
            return True

        if self._check_pset_load_bearing(wall):
            return True

        for rel in getattr(wall, "IsTypedBy", []) or []:
            wtype = getattr(rel, "RelatingType", None)
            if wtype:
                type_name = (wtype.Name or "").lower()
                if any(kw in type_name for kw in LOAD_BEARING_KEYWORDS):
                    return True
        return False

    def _check_pset_load_bearing(self, wall: ifcopenshell.entity_instance) -> bool:
        for rel in getattr(wall, "IsDefinedBy", []) or []:
            if not rel.is_a("IfcRelDefinesByProperties"):
                continue
            pset = rel.RelatingPropertyDefinition
            if not pset or not hasattr(pset, "Name"):
                continue
            pset_name = (pset.Name or "").lower()
            if "wallcommon" not in pset_name and "wall" not in pset_name:
                continue
            for prop in getattr(pset, "HasProperties", []) or []:
                prop_name = (prop.Name or "").lower().replace(" ", "").replace("_", "")
                if prop_name in LOAD_BEARING_PSET_KEYS:
                    val = getattr(prop, "NominalValue", None)
                    if val and getattr(val, "wrappedValue", None) is True:
                        return True
        return False

    def _find_support_below(
        self,
        storey: ifcopenshell.entity_instance,
        create_info: dict[str, Any],
        target_z_mm: float,
        tolerance_mm: float,
    ) -> bool:
        target_footprint = self._footprint_from_create_info(create_info, target_z_mm)
        if target_footprint is None:
            return False

        storey_elements = self._spatial_elements(storey)

        if not storey_elements:
            for etype in SUPPORT_TYPES:
                storey_elements.extend(self._model.by_type(etype))

        for el in storey_elements:
            if el.is_a() not in SUPPORT_TYPES:
                continue
            support_footprint = self._footprint_from_element(el)
            if support_footprint is None:
                continue
            top_z = support_footprint.max_z
            if abs(top_z - target_z_mm) <= tolerance_mm:
                if target_footprint.overlaps_xy(support_footprint, tolerance_mm):
                    return True
        return False

    def _spatial_elements(
        self,
        spatial: ifcopenshell.entity_instance,
    ) -> list[ifcopenshell.entity_instance]:
        elements: list[ifcopenshell.entity_instance] = []
        seen: set[int] = set()

        def add_element(element: ifcopenshell.entity_instance) -> None:
            element_id = int(element.id())
            if element_id not in seen:
                seen.add(element_id)
                elements.append(element)

        def visit(node: ifcopenshell.entity_instance) -> None:
            for rel in getattr(node, "ContainsElements", []) or []:
                for element in getattr(rel, "RelatedElements", []) or []:
                    add_element(element)
            for rel in getattr(node, "IsDecomposedBy", []) or []:
                for child in getattr(rel, "RelatedObjects", []) or []:
                    visit(child)

        visit(spatial)
        return elements

    def _footprint_from_create_info(
        self, create_info: dict[str, Any], target_z_mm: float
    ) -> Footprint | None:
        sp = create_info.get("start_point") or {}
        try:
            x = float(sp.get("x") or 0.0)
            y = float(sp.get("y") or 0.0)
            length = float(create_info.get("length_mm") or 3000.0)
            width = float(create_info.get("width_mm") or 200.0)
            height = float(create_info.get("height_mm") or 200.0)
        except (TypeError, ValueError):
            return None
        if length <= 0.0 or width <= 0.0:
            return None
        return Footprint(
            min_x=x - length / 2.0,
            max_x=x + length / 2.0,
            min_y=y - width / 2.0,
            max_y=y + width / 2.0,
            min_z=target_z_mm,
            max_z=target_z_mm + height,
        )

    def _footprint_from_element(
        self, element: ifcopenshell.entity_instance
    ) -> Footprint | None:
        x, y, z = self._element_xyz_mm(element)
        length, width, height = self._element_size_mm(element)
        if length <= 0.0 or width <= 0.0 or height <= 0.0:
            return None
        return Footprint(
            min_x=x - length / 2.0,
            max_x=x + length / 2.0,
            min_y=y - width / 2.0,
            max_y=y + width / 2.0,
            min_z=z,
            max_z=z + height,
        )

    def _element_z_and_height_mm(
        self, element: ifcopenshell.entity_instance
    ) -> tuple[float, float]:
        return self._element_xyz_mm(element)[2], self._element_size_mm(element)[2]

    def _element_xyz_mm(
        self, element: ifcopenshell.entity_instance
    ) -> tuple[float, float, float]:
        x = y = z = 0.0
        placement = getattr(element, "ObjectPlacement", None)
        current = placement if placement and placement.is_a("IfcLocalPlacement") else None
        while current and current.is_a("IfcLocalPlacement"):
            relative = getattr(current, "RelativePlacement", None)
            location = getattr(relative, "Location", None) if relative else None
            coords = tuple(getattr(location, "Coordinates", ()) or ())
            if len(coords) >= 3:
                x += float(coords[0]) * self._scale
                y += float(coords[1]) * self._scale
                z += float(coords[2]) * self._scale
            current = getattr(current, "PlacementRelTo", None)
        return x, y, z

    def _element_size_mm(
        self, element: ifcopenshell.entity_instance
    ) -> tuple[float, float, float]:
        length = width = height = 0.0
        rep = getattr(element, "Representation", None)
        if rep:
            for r in getattr(rep, "Representations", []) or []:
                if getattr(r, "RepresentationIdentifier", None) != "Body":
                    continue
                for item in getattr(r, "Items", []) or []:
                    if item.is_a("IfcExtrudedAreaSolid"):
                        profile = getattr(item, "SweptArea", None)
                        if profile and profile.is_a("IfcRectangleProfileDef"):
                            length = float(profile.XDim) * self._scale
                            width = float(profile.YDim) * self._scale
                        else:
                            profile_dims = self._profile_dims_mm(profile)
                            if profile_dims is not None:
                                length, width = profile_dims
                        height = float(item.Depth) * self._scale
                        break
        return length, width, height

    def _profile_dims_mm(
        self, profile: ifcopenshell.entity_instance | None
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
