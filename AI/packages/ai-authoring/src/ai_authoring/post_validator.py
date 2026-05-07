"""PostEditValidator — IFC 오퍼레이션 일괄 적용 후 사후 검증.

AuthoringWorker 가 engine request 오퍼레이션을 IFC 모델에 적용한 뒤,
수정된 모델 상태를 검증하여 충돌/구조 위험 이슈를 보고한다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import ifcopenshell

from ai_common.logging import get_logger

_logger = get_logger(__name__)

# 충돌 검사 대상 IFC 타입
_COLLIDABLE_TYPES: frozenset[str] = frozenset(
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

# 내력벽 판별 키워드
_LOAD_BEARING_KEYWORDS: frozenset[str] = frozenset(
    {
        "load-bearing", "load bearing", "loadbearing", "structural",
        "bearing wall", "내력", "내력벽", "구조벽", "구조",
    }
)

# 면 접촉(공통벽)으로 간주하는 한 축의 최대 겹침 (mm)
_COMMON_WALL_OVERLAP_MM: float = 100.0

# 충돌로 간주하지 않는 여유 (mm)
_COLLISION_TOLERANCE_MM: float = 5.0


# ── 데이터 클래스 ───────────────────────────────────────────────────────────


@dataclass
class ValidationIssue:
    operation_id: str
    element_global_id: str
    element_type: str
    code: str
    severity: str  # "error" | "warning" | "info"
    message: str


@dataclass
class PostValidationReport:
    passed: bool
    issues: list[ValidationIssue] = field(default_factory=list)
    checked_element_count: int = 0
    collision_count: int = 0
    structural_risk_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "checked_element_count": self.checked_element_count,
            "collision_count": self.collision_count,
            "structural_risk_count": self.structural_risk_count,
            "issues": [
                {
                    "operation_id": i.operation_id,
                    "element_global_id": i.element_global_id,
                    "element_type": i.element_type,
                    "code": i.code,
                    "severity": i.severity,
                    "message": i.message,
                }
                for i in self.issues
            ],
        }


# ── AABB ────────────────────────────────────────────────────────────────────


@dataclass
class _BBox:
    min_x: float
    max_x: float
    min_y: float
    max_y: float
    min_z: float
    max_z: float

    def intersects(self, other: _BBox) -> bool:
        tol = _COLLISION_TOLERANCE_MM
        return (
            self.min_x < other.max_x - tol
            and self.max_x > other.min_x + tol
            and self.min_y < other.max_y - tol
            and self.max_y > other.min_y + tol
            and self.min_z < other.max_z - tol
            and self.max_z > other.min_z + tol
        )

    def overlap_x(self, other: _BBox) -> float:
        return min(self.max_x, other.max_x) - max(self.min_x, other.min_x)

    def overlap_y(self, other: _BBox) -> float:
        return min(self.max_y, other.max_y) - max(self.min_y, other.min_y)

    def has_common_wall_overlap(self, other: _BBox) -> bool:
        """한 축만 얇게 겹치는 wall-to-wall 접촉을 공통벽 후보로 간주."""
        ox = self.overlap_x(other)
        oy = self.overlap_y(other)
        x_thin = 0.0 < ox <= _COMMON_WALL_OVERLAP_MM
        y_thin = 0.0 < oy <= _COMMON_WALL_OVERLAP_MM
        return x_thin != y_thin


# ── PostEditValidator ────────────────────────────────────────────────────────


class PostEditValidator:
    """IFC 오퍼레이션 일괄 적용 후 수정된 모델 상태를 검증한다.

    검증 항목:
    - CREATE: 신규 요소 ↔ 기존 요소 충돌 (AABB 기반)
    - DELETE: 내력벽 등 구조 요소 삭제 경고
    - MODIFY: transform/update 후 충돌 재검사
    """

    def __init__(self, model: ifcopenshell.file, scale_to_mm: float | None = None) -> None:
        self._model = model
        self._scale = scale_to_mm if scale_to_mm is not None else self._infer_scale_to_mm(model)
        self._bbox_cache: dict[int, _BBox | None] = {}

    def validate(
        self,
        op_results: list[dict[str, Any]],
        engine_req: dict[str, Any],
    ) -> PostValidationReport:
        """op_results 와 원본 engine_req 를 받아 검증 리포트를 반환한다.

        Args:
            op_results: AuthoringWorker._run_operations() 반환값
            engine_req: 원본 engine request dict (operation params 참조용)
        """
        issues: list[ValidationIssue] = []
        checked = 0

        for result in op_results:
            if result.get("status") not in ("applied",):
                continue

            op_id: str = result.get("operation_id", "")
            op_type: str = result.get("operation_type", "")
            matched: list[dict[str, Any]] = result.get("matched_elements", [])

            if op_type in ("create_element", "create_wall"):
                issues.extend(self._check_create(op_id, matched))
                checked += len(matched)

            elif op_type == "delete_elements":
                issues.extend(self._check_delete(op_id, matched))
                checked += len(matched)

            elif op_type in ("update_element_properties", "transform_elements"):
                issues.extend(self._check_modify(op_id, matched))
                checked += len(matched)

        collision_count = sum(1 for i in issues if i.code == "COLLISION")
        structural_count = sum(1 for i in issues if i.code == "STRUCTURAL_RISK")
        error_count = sum(1 for i in issues if i.severity == "error")

        report = PostValidationReport(
            passed=error_count == 0,
            issues=issues,
            checked_element_count=checked,
            collision_count=collision_count,
            structural_risk_count=structural_count,
        )

        _logger.info(
            "post_edit_validation_done",
            passed=report.passed,
            checkedElements=checked,
            collisions=collision_count,
            structuralRisks=structural_count,
        )
        return report

    # ── CREATE 검증 ─────────────────────────────────────────────────────────

    def _check_create(
        self,
        op_id: str,
        matched: list[dict[str, Any]],
    ) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        for el_info in matched:
            gid: str = el_info.get("global_id", "")
            el_type: str = el_info.get("element_type", "")
            element = self._model.by_guid(gid)
            if element is None:
                continue
            new_bbox = self._bbox_of(element)
            if new_bbox is None:
                continue
            for collider in self._find_colliders(element, new_bbox):
                issues.append(
                    ValidationIssue(
                        operation_id=op_id,
                        element_global_id=gid,
                        element_type=el_type,
                        code="COLLISION",
                        severity="error",
                        message=(
                            f"[충돌] 신규 {el_type}({gid[:8]})가 "
                            f"{collider['element_type']}({collider['global_id'][:8]})와 겹칩니다."
                        ),
                    )
                )
        return issues

    # ── DELETE 검증 ─────────────────────────────────────────────────────────

    def _check_delete(
        self,
        op_id: str,
        matched: list[dict[str, Any]],
    ) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        for el_info in matched:
            gid: str = el_info.get("global_id", "")
            el_type: str = el_info.get("element_type", "")
            # DELETE 후에는 모델에서 이미 제거됐을 수 있으므로 삭제 전 스냅샷만으로 판별
            if el_type == "IfcWall" and self._delete_snapshot_implies_load_bearing(el_info):
                issues.append(
                    ValidationIssue(
                        operation_id=op_id,
                        element_global_id=gid,
                        element_type=el_type,
                        code="STRUCTURAL_RISK",
                        severity="warning",
                        message=(
                            f"[구조위험] 삭제된 IfcWall({gid[:8]})이 내력벽으로 "
                            "판별될 가능성이 있습니다. 구조 검토가 필요합니다."
                        ),
                    )
                )
        return issues

    # ── MODIFY 검증 ─────────────────────────────────────────────────────────

    def _check_modify(
        self,
        op_id: str,
        matched: list[dict[str, Any]],
    ) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        for el_info in matched:
            gid: str = el_info.get("global_id", "")
            el_type: str = el_info.get("element_type", "")
            element = self._model.by_guid(gid)
            if element is None:
                continue
            self._bbox_cache.pop(int(element.id()), None)  # 캐시 무효화
            mod_bbox = self._bbox_of(element)
            if mod_bbox is None:
                continue
            for collider in self._find_colliders(element, mod_bbox):
                issues.append(
                    ValidationIssue(
                        operation_id=op_id,
                        element_global_id=gid,
                        element_type=el_type,
                        code="COLLISION",
                        severity="error",
                        message=(
                            f"[충돌] 수정된 {el_type}({gid[:8]})가 "
                            f"{collider['element_type']}({collider['global_id'][:8]})와 겹칩니다."
                        ),
                    )
                )
        return issues

    # ── 충돌 탐색 ───────────────────────────────────────────────────────────

    def _find_colliders(
        self,
        target: ifcopenshell.entity_instance,
        target_bbox: _BBox,
    ) -> list[dict[str, Any]]:
        colliders: list[dict[str, Any]] = []
        target_id = int(target.id())
        seen_ids: set[int] = {target_id}

        for el_type in _COLLIDABLE_TYPES:
            for element in self._model.by_type(el_type):
                element_id = int(element.id())
                if element_id in seen_ids:
                    continue
                seen_ids.add(element_id)
                bbox = self._bbox_of(element)
                if bbox is None:
                    continue
                if not target_bbox.intersects(bbox):
                    continue
                if self._is_common_wall_contact(target, element, target_bbox, bbox):
                    continue
                colliders.append(
                    {
                        "global_id": element.GlobalId,
                        "element_type": element.is_a(),
                        "name": element.Name,
                    }
                )
        return colliders

    # ── AABB 계산 ───────────────────────────────────────────────────────────

    def _bbox_of(self, element: ifcopenshell.entity_instance) -> _BBox | None:
        cache_key = int(element.id())
        if cache_key in self._bbox_cache:
            return self._bbox_cache[cache_key]

        transform = self._placement_transform_2d(element)
        if transform is None:
            self._bbox_cache[cache_key] = None
            return None

        local_bbox = self._local_body_bbox(element)
        if local_bbox is None:
            self._bbox_cache[cache_key] = None
            return None

        ox, oy, oz, x_axis, y_axis = transform
        world_xs: list[float] = []
        world_ys: list[float] = []
        for lx in (local_bbox.min_x, local_bbox.max_x):
            for ly in (local_bbox.min_y, local_bbox.max_y):
                world_xs.append((ox + lx * x_axis[0] + ly * y_axis[0]) * self._scale)
                world_ys.append((oy + lx * x_axis[1] + ly * y_axis[1]) * self._scale)

        bbox = _BBox(
            min_x=min(world_xs),
            max_x=max(world_xs),
            min_y=min(world_ys),
            max_y=max(world_ys),
            min_z=(oz + local_bbox.min_z) * self._scale,
            max_z=(oz + local_bbox.max_z) * self._scale,
        )
        self._bbox_cache[cache_key] = bbox
        return bbox

    @staticmethod
    def _infer_scale_to_mm(model: ifcopenshell.file) -> float:
        for unit in model.by_type("IfcSIUnit"):
            if getattr(unit, "UnitType", None) != "LENGTHUNIT":
                continue
            prefix = getattr(unit, "Prefix", None)
            if prefix == "MILLI":
                return 1.0
            if prefix == "CENTI":
                return 10.0
            if prefix == "DECI":
                return 100.0
            if prefix is None:
                return 1000.0
        return 1.0

    def _placement_transform_2d(
        self, element: ifcopenshell.entity_instance
    ) -> tuple[float, float, float, tuple[float, float], tuple[float, float]] | None:
        placement = getattr(element, "ObjectPlacement", None)
        if not placement or not placement.is_a("IfcLocalPlacement"):
            return None

        return self._placement_matrix_2d(placement)

    def _placement_matrix_2d(
        self,
        placement: ifcopenshell.entity_instance | None,
    ) -> tuple[float, float, float, tuple[float, float], tuple[float, float]]:
        if not placement or not placement.is_a("IfcLocalPlacement"):
            return 0.0, 0.0, 0.0, (1.0, 0.0), (0.0, 1.0)

        px, py, pz, parent_x, parent_y = self._placement_matrix_2d(
            getattr(placement, "PlacementRelTo", None)
        )

        rel = getattr(placement, "RelativePlacement", None)
        loc = getattr(rel, "Location", None) if rel else None
        coords = tuple(getattr(loc, "Coordinates", ()) or ())
        lx = float(coords[0]) if len(coords) >= 1 else 0.0
        ly = float(coords[1]) if len(coords) >= 2 else 0.0
        lz = float(coords[2]) if len(coords) >= 3 else 0.0

        ref_dir = getattr(rel, "RefDirection", None) if rel else None
        ratios = tuple(getattr(ref_dir, "DirectionRatios", ()) or ())
        local_x = (1.0, 0.0)
        if len(ratios) >= 2:
            local_x = self._normalize_2d(float(ratios[0]), float(ratios[1]))
        local_y = (-local_x[1], local_x[0])

        ox = px + lx * parent_x[0] + ly * parent_y[0]
        oy = py + lx * parent_x[1] + ly * parent_y[1]
        oz = pz + lz
        return (
            ox,
            oy,
            oz,
            self._combine_axis(local_x, parent_x, parent_y),
            self._combine_axis(local_y, parent_x, parent_y),
        )

    @staticmethod
    def _combine_axis(
        local_axis: tuple[float, float],
        parent_x: tuple[float, float],
        parent_y: tuple[float, float],
    ) -> tuple[float, float]:
        return (
            local_axis[0] * parent_x[0] + local_axis[1] * parent_y[0],
            local_axis[0] * parent_x[1] + local_axis[1] * parent_y[1],
        )

    @staticmethod
    def _normalize_2d(x: float, y: float) -> tuple[float, float]:
        length = (x * x + y * y) ** 0.5
        if length <= 0.0:
            return 1.0, 0.0
        return x / length, y / length

    def _local_body_bbox(self, element: ifcopenshell.entity_instance) -> _BBox | None:
        rep = getattr(element, "Representation", None)
        if not rep:
            return None

        for representation in getattr(rep, "Representations", []) or []:
            if getattr(representation, "RepresentationIdentifier", None) != "Body":
                continue
            for item in getattr(representation, "Items", []) or []:
                if item.is_a("IfcExtrudedAreaSolid"):
                    profile_bbox = self._profile_bbox(item.SweptArea)
                    if profile_bbox is None:
                        continue
                    ix, iy, iz = self._axis3_location(getattr(item, "Position", None))
                    return _BBox(
                        min_x=profile_bbox.min_x + ix,
                        max_x=profile_bbox.max_x + ix,
                        min_y=profile_bbox.min_y + iy,
                        max_y=profile_bbox.max_y + iy,
                        min_z=iz,
                        max_z=iz + float(item.Depth),
                    )
                if item.is_a("IfcFacetedBrep"):
                    return self._brep_bbox(item)
        return None

    def _profile_bbox(self, profile: ifcopenshell.entity_instance | None) -> _BBox | None:
        if profile is None:
            return None
        if profile.is_a("IfcRectangleProfileDef"):
            px, py = self._axis2_location(getattr(profile, "Position", None))
            half_x = float(profile.XDim) / 2.0
            half_y = float(profile.YDim) / 2.0
            return _BBox(px - half_x, px + half_x, py - half_y, py + half_y, 0.0, 0.0)
        if profile.is_a("IfcArbitraryClosedProfileDef"):
            points = self._profile_points(profile)
            if not points:
                return None
            xs = [p[0] for p in points]
            ys = [p[1] for p in points]
            return _BBox(min(xs), max(xs), min(ys), max(ys), 0.0, 0.0)
        return None

    @staticmethod
    def _axis2_location(axis: ifcopenshell.entity_instance | None) -> tuple[float, float]:
        loc = getattr(axis, "Location", None) if axis else None
        coords = tuple(getattr(loc, "Coordinates", ()) or ())
        if len(coords) >= 2:
            return float(coords[0]), float(coords[1])
        return 0.0, 0.0

    @staticmethod
    def _axis3_location(axis: ifcopenshell.entity_instance | None) -> tuple[float, float, float]:
        loc = getattr(axis, "Location", None) if axis else None
        coords = tuple(getattr(loc, "Coordinates", ()) or ())
        if len(coords) >= 3:
            return float(coords[0]), float(coords[1]), float(coords[2])
        return 0.0, 0.0, 0.0

    def _profile_points(
        self, profile: ifcopenshell.entity_instance
    ) -> list[tuple[float, float]]:
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
        return points

    def _brep_bbox(self, brep: ifcopenshell.entity_instance) -> _BBox | None:
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
                        xs.append(float(coords[0]))
                        ys.append(float(coords[1]))
                        zs.append(float(coords[2]))
        if not xs:
            return None
        return _BBox(min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))

    # ── 내력벽 이름 판별 ────────────────────────────────────────────────────

    @staticmethod
    def _is_wall_type(element_type: str) -> bool:
        return element_type in ("IfcWall", "IfcWallStandardCase")

    def _is_common_wall_contact(
        self,
        target: ifcopenshell.entity_instance,
        other: ifcopenshell.entity_instance,
        target_bbox: _BBox,
        other_bbox: _BBox,
    ) -> bool:
        if not self._is_wall_type(target.is_a()) or not self._is_wall_type(other.is_a()):
            return False
        return target_bbox.has_common_wall_overlap(other_bbox)

    def _delete_snapshot_implies_load_bearing(self, el_info: dict[str, Any]) -> bool:
        if el_info.get("is_load_bearing") is True:
            return True
        text = " ".join(
            str(value)
            for value in (
                el_info.get("name"),
                el_info.get("description"),
                el_info.get("type_name"),
            )
            if value
        )
        return self._name_implies_load_bearing(text)

    @staticmethod
    def _name_implies_load_bearing(name: str) -> bool:
        name_lower = name.lower()
        return any(kw in name_lower for kw in _LOAD_BEARING_KEYWORDS)


__all__ = ["PostEditValidator", "PostValidationReport", "ValidationIssue"]
