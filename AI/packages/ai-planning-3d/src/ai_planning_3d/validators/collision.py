"""Collision and space-boundary validation for IFC CREATE previews.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import ifcopenshell

logger = logging.getLogger(__name__)

COLLIDABLE_TYPES: frozenset[str] = frozenset(
    {
        "IfcBeam",
        "IfcColumn",
        "IfcCovering",
        "IfcCurtainWall",
        "IfcDoor",
        "IfcMember",
        "IfcPlate",
        "IfcRailing",
        "IfcRamp",
        "IfcRoof",
        "IfcSlab",
        "IfcStair",
        "IfcWall",
        "IfcWallStandardCase",
        "IfcWindow",
    }
)

SPACE_NAME_ALIASES: dict[str, tuple[str, ...]] = {
    "거실": ("living room", "livingroom", "living"),
    "living room": ("living room", "livingroom", "living"),
    "안방": ("bedroom", "bed room", "master bedroom"),
    "침실": ("bedroom", "bed room", "master bedroom"),
    "bedroom": ("bedroom", "bed room", "master bedroom"),
    "화장실": ("bathroom", "bath room", "toilet", "wc"),
    "욕실": ("bathroom", "bath room", "toilet", "wc"),
    "bathroom": ("bathroom", "bath room", "toilet", "wc"),
    "주방": ("kitchen",),
    "부엌": ("kitchen",),
    "kitchen": ("kitchen",),
}


@dataclass
class BoundingBox:
    """Axis-aligned bounding box in millimeters."""

    min_x: float
    max_x: float
    min_y: float
    max_y: float
    min_z: float
    max_z: float

    def intersects(self, other: BoundingBox, tolerance_mm: float = 1.0) -> bool:
        return (
            self.min_x < other.max_x - tolerance_mm
            and self.max_x > other.min_x + tolerance_mm
            and self.min_y < other.max_y - tolerance_mm
            and self.max_y > other.min_y + tolerance_mm
            and self.min_z < other.max_z - tolerance_mm
            and self.max_z > other.min_z + tolerance_mm
        )

    def contains(self, other: BoundingBox, tolerance_mm: float = 10.0) -> bool:
        return (
            self.min_x - tolerance_mm <= other.min_x
            and self.max_x + tolerance_mm >= other.max_x
            and self.min_y - tolerance_mm <= other.min_y
            and self.max_y + tolerance_mm >= other.max_y
            and self.min_z - tolerance_mm <= other.min_z
            and self.max_z + tolerance_mm >= other.max_z
        )

    @property
    def center(self) -> tuple[float, float, float]:
        return (
            (self.min_x + self.max_x) / 2.0,
            (self.min_y + self.max_y) / 2.0,
            (self.min_z + self.max_z) / 2.0,
        )

    @property
    def size(self) -> tuple[float, float, float]:
        return (
            self.max_x - self.min_x,
            self.max_y - self.min_y,
            self.max_z - self.min_z,
        )


@dataclass
class CollisionResult:
    has_collision: bool
    colliding_elements: list[dict[str, Any]] = field(default_factory=list)
    out_of_space: bool = False
    messages: list[str] = field(default_factory=list)

    @property
    def is_ok(self) -> bool:
        return not self.has_collision and not self.out_of_space

    def to_summary_lines(self) -> list[str]:
        return list(self.messages)


class CollisionValidator:
    """Validate CREATE preview geometry against existing IFC products and spaces."""

    COLLIDABLE_TYPES: frozenset[str] = COLLIDABLE_TYPES

    def __init__(
        self,
        model: ifcopenshell.file,
        scale_to_mm: float = 1.0,
        use_geom_precision: bool = False,
    ) -> None:
        self._model = model
        self._scale = scale_to_mm
        self._use_geom = use_geom_precision
        self._bbox_cache: dict[int, BoundingBox | None] = {}

    def validate(
        self,
        create_info: dict[str, Any],
        storey: ifcopenshell.entity_instance,
    ) -> CollisionResult:
        new_bbox = self._bbox_from_create_info(create_info)
        if new_bbox is None:
            return CollisionResult(
                has_collision=False,
                messages=[
                    "[간섭감지] 신규 부재의 위치 또는 크기를 계산할 수 없습니다."
                ],
            )

        colliders = self._check_element_collision(new_bbox, storey)
        out_of_space, space_msg = self._check_space_boundary(
            new_bbox,
            create_info.get("space_name"),
            storey,
        )

        if self._use_geom and colliders:
            colliders = self._refine_with_geom(new_bbox, colliders)

        messages: list[str] = []
        if colliders:
            names = ", ".join(c.get("name") or c["global_id"][:8] for c in colliders)
            messages.append(
                f"[간섭감지] 신규 부재가 기존 부재와 겹칩니다: {names}"
            )
        if out_of_space:
            messages.append(space_msg)

        return CollisionResult(
            has_collision=bool(colliders),
            colliding_elements=colliders,
            out_of_space=out_of_space,
            messages=messages,
        )

    def check_pair(
        self,
        element_a: ifcopenshell.entity_instance,
        element_b: ifcopenshell.entity_instance,
    ) -> bool:
        bbox_a = self._bbox_from_element(element_a)
        bbox_b = self._bbox_from_element(element_b)
        if bbox_a is None or bbox_b is None:
            return False
        return bbox_a.intersects(bbox_b)

    def _bbox_from_create_info(self, create_info: dict[str, Any]) -> BoundingBox | None:
        sp = create_info.get("start_point") or {}
        try:
            ox = float(sp.get("x") or 0.0)
            oy = float(sp.get("y") or 0.0)
            oz = float(sp.get("z") or 0.0)
            lx = float(create_info.get("length_mm") or 3000.0)
            ly = float(create_info.get("width_mm") or 200.0)
            lz = float(create_info.get("height_mm") or 2400.0)
        except (TypeError, ValueError):
            return None

        if lx <= 0.0 or ly <= 0.0 or lz <= 0.0:
            return None

        return BoundingBox(
            min_x=ox - lx / 2.0,
            max_x=ox + lx / 2.0,
            min_y=oy - ly / 2.0,
            max_y=oy + ly / 2.0,
            min_z=oz,
            max_z=oz + lz,
        )

    def _bbox_from_element(
        self,
        element: ifcopenshell.entity_instance,
    ) -> BoundingBox | None:
        cache_key = int(element.id())
        if cache_key in self._bbox_cache:
            return self._bbox_cache[cache_key]

        coords = self._placement_xyz(element)
        if coords is None:
            self._bbox_cache[cache_key] = None
            return None

        lx, ly, lz = self._element_dims_mm(element)
        if lx <= 0.0 or ly <= 0.0 or lz <= 0.0:
            self._bbox_cache[cache_key] = None
            return None

        ox = float(coords[0]) * self._scale
        oy = float(coords[1]) * self._scale
        oz = float(coords[2]) * self._scale
        bbox = BoundingBox(
            min_x=ox - lx / 2.0,
            max_x=ox + lx / 2.0,
            min_y=oy - ly / 2.0,
            max_y=oy + ly / 2.0,
            min_z=oz,
            max_z=oz + lz,
        )
        self._bbox_cache[cache_key] = bbox
        return bbox

    def _placement_xyz(
        self,
        element: ifcopenshell.entity_instance,
    ) -> tuple[float, float, float] | None:
        placement = getattr(element, "ObjectPlacement", None)
        if not placement or not placement.is_a("IfcLocalPlacement"):
            return None

        x = y = z = 0.0
        current = placement
        while current and current.is_a("IfcLocalPlacement"):
            rel = getattr(current, "RelativePlacement", None)
            loc = getattr(rel, "Location", None) if rel else None
            coords = tuple(getattr(loc, "Coordinates", ()) or ())
            if len(coords) >= 3:
                x += float(coords[0])
                y += float(coords[1])
                z += float(coords[2])
            current = getattr(current, "PlacementRelTo", None)
        return x, y, z

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
                if item.is_a("IfcFacetedBrep"):
                    return self._brep_dims_mm(item)
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

    def _brep_dims_mm(
        self,
        brep: ifcopenshell.entity_instance,
    ) -> tuple[float, float, float]:
        xs: list[float] = []
        ys: list[float] = []
        zs: list[float] = []
        shell = getattr(brep, "Outer", None)
        for face in getattr(shell, "CfsFaces", []) or []:
            for bound in getattr(face, "Bounds", []) or []:
                loop = getattr(bound, "Bound", None)
                for point in getattr(loop, "Polygon", []) or []:
                    coords = tuple(getattr(point, "Coordinates", ()) or ())
                    if len(coords) >= 3:
                        xs.append(float(coords[0]) * self._scale)
                        ys.append(float(coords[1]) * self._scale)
                        zs.append(float(coords[2]) * self._scale)
        if not xs:
            return 0.0, 0.0, 0.0
        return max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)

    def _check_element_collision(
        self,
        new_bbox: BoundingBox,
        storey: ifcopenshell.entity_instance,
    ) -> list[dict[str, Any]]:
        colliders: list[dict[str, Any]] = []
        for element in self._spatial_elements(storey):
            if element.is_a() not in self.COLLIDABLE_TYPES:
                continue
            el_bbox = self._bbox_from_element(element)
            if el_bbox is None:
                continue
            if new_bbox.intersects(el_bbox):
                colliders.append(
                    {
                        "global_id": element.GlobalId,
                        "element_type": element.is_a(),
                        "name": element.Name,
                    }
                )
        return colliders

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

    def _check_space_boundary(
        self,
        new_bbox: BoundingBox,
        space_name: str | None,
        storey: ifcopenshell.entity_instance,
    ) -> tuple[bool, str]:
        if not space_name or not self._model:
            return False, ""

        space = self._find_space(space_name, storey)
        if space is None:
            return (
                True,
                f"[공간경계] '{space_name}' 공간을 IFC 모델에서 찾을 수 없습니다.",
            )

        space_bbox = self._bbox_from_element(space)
        if space_bbox is None:
            space_bbox = self._bbox_from_spatial_contents(space)
        if space_bbox is None:
            return True, f"[공간경계] '{space_name}' 공간의 형상을 계산할 수 없습니다."

        if not space_bbox.contains(new_bbox):
            return (
                True,
                f"[경계이탈] 신규 부재가 '{space_name}' 공간 경계 밖에 배치됩니다. "
                "배치 좌표 또는 방향을 확인하세요.",
            )
        return False, ""

    def _find_space(
        self,
        space_name: str,
        storey: ifcopenshell.entity_instance,
    ) -> ifcopenshell.entity_instance | None:
        requested_names = self._space_match_terms(space_name)
        spaces = list(self._spaces_under_storey(storey)) or list(
            self._model.by_type("IfcSpace")
        )

        for space in spaces:
            if self._space_name_matches(space, requested_names):
                return space
        return None

    def _bbox_from_spatial_contents(
        self,
        spatial: ifcopenshell.entity_instance,
    ) -> BoundingBox | None:
        bboxes = [
            bbox
            for element in self._spatial_elements(spatial)
            if element.is_a() in self.COLLIDABLE_TYPES
            for bbox in [self._bbox_from_element(element)]
            if bbox is not None
        ]
        if not bboxes:
            return None
        return BoundingBox(
            min_x=min(bbox.min_x for bbox in bboxes),
            max_x=max(bbox.max_x for bbox in bboxes),
            min_y=min(bbox.min_y for bbox in bboxes),
            max_y=max(bbox.max_y for bbox in bboxes),
            min_z=min(bbox.min_z for bbox in bboxes),
            max_z=max(bbox.max_z for bbox in bboxes),
        )

    def _space_match_terms(self, space_name: str) -> set[str]:
        key = space_name.strip().lower()
        aliases = SPACE_NAME_ALIASES.get(key, ())
        return {key, key.replace(" ", ""), *aliases}

    def _space_name_matches(
        self,
        space: ifcopenshell.entity_instance,
        requested_names: set[str],
    ) -> bool:
        actual_names = {
            (space.Name or "").strip().lower(),
            (space.LongName or "").strip().lower(),
        }
        actual_names |= {name.replace(" ", "") for name in actual_names if name}
        return any(
            requested in actual or actual in requested
            for requested in requested_names
            for actual in actual_names
            if requested and actual
        )

    def _spaces_under_storey(
        self,
        storey: ifcopenshell.entity_instance,
    ) -> list[ifcopenshell.entity_instance]:
        spaces: list[ifcopenshell.entity_instance] = []
        seen: set[int] = set()

        def add_space(space: ifcopenshell.entity_instance) -> None:
            space_id = int(space.id())
            if space_id not in seen:
                seen.add(space_id)
                spaces.append(space)

        def visit(node: ifcopenshell.entity_instance) -> None:
            for rel in getattr(node, "IsDecomposedBy", []) or []:
                for child in getattr(rel, "RelatedObjects", []) or []:
                    if child.is_a("IfcSpace"):
                        add_space(child)
                    visit(child)

        visit(storey)
        return spaces

    def _refine_with_geom(
        self,
        new_bbox: BoundingBox,
        candidates: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        try:
            import ifcopenshell.geom
        except ImportError:
            return candidates

        settings = ifcopenshell.geom.settings()
        confirmed: list[dict[str, Any]] = []
        for candidate in candidates:
            try:
                element = self._model.by_guid(candidate["global_id"])
                if element is None:
                    continue
                shape = ifcopenshell.geom.create_shape(settings, element)
                verts = list(getattr(shape.geometry, "verts", []) or [])
                if len(verts) < 3:
                    confirmed.append(candidate)
                    continue
                xs = [verts[i] * self._scale for i in range(0, len(verts), 3)]
                ys = [verts[i] * self._scale for i in range(1, len(verts), 3)]
                zs = [verts[i] * self._scale for i in range(2, len(verts), 3)]
                geom_bbox = BoundingBox(
                    min_x=min(xs),
                    max_x=max(xs),
                    min_y=min(ys),
                    max_y=max(ys),
                    min_z=min(zs),
                    max_z=max(zs),
                )
                if new_bbox.intersects(geom_bbox):
                    confirmed.append(candidate)
            except Exception as exc:
                logger.debug(
                    "Failed to refine collision with ifcopenshell.geom: %s",
                    exc,
                )
                confirmed.append(candidate)
        return confirmed
