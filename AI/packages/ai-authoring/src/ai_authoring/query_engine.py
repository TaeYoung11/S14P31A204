from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import ifcopenshell

# authoring 패키지 내의 유틸리티 참조
from .utils import normalize_space_name, normalize_storey_name

if TYPE_CHECKING:
    from ai_planning_3d.command import LLM3DCommand

logger = logging.getLogger(__name__)

_UNSET = object()


class IFCQueryEngine:
    """IFC 모델 탐색 전담 클래스 — Planning 단계에서 대상 요소를 찾는다."""

    def __init__(self, ifc_model: ifcopenshell.file | None = None) -> None:
        self._model = ifc_model
        self._last_query_reason = ""

    def get_model(self) -> ifcopenshell.file | None:
        return self._model

    def get_last_query_reason(self) -> str:
        return self._last_query_reason

    def find_elements(self, command: LLM3DCommand) -> list[dict[str, Any]]:
        if not self._model:
            self._last_query_reason = "IFC 모델이 로드되지 않았습니다."
            return []
        self._last_query_reason = ""
        target = command.target
        if target.global_id:
            return self._query_by_global_id(target.global_id)

        storey = normalize_storey_name(target.storey) if target.storey else None
        space = normalize_space_name(target.space_name) if target.space_name else None
        return self._query_by_filter(
            target.element_type,
            target.name,
            storey,
            space,
            target.direction,
            target.select_all,
        )

    # ── Private ───────────────────────────────────────────────────────────────

    def _query_by_global_id(self, gid: str) -> list[dict[str, Any]]:
        try:
            el = self._model.by_guid(gid)
            if not el:
                self._last_query_reason = f"GlobalId={gid} 요소를 찾을 수 없습니다."
            return [self._get_element_info(el)] if el else []
        except Exception:
            self._last_query_reason = f"GlobalId={gid} 조회 중 오류가 발생했습니다."
            return []

    def _query_by_filter(
        self,
        etype: Any,
        name: str | None,
        storey: str | None,
        space: str | None,
        direction: str | None,
        select_all: bool,
    ) -> list[dict[str, Any]]:
        if not etype:
            self._last_query_reason = "검색할 타입이 지정되지 않았습니다."
            return []
        type_str = etype.value if hasattr(etype, "value") else str(etype)
        matched: list[dict[str, Any]] = []
        total = 0
        rejected = {"name": 0, "storey": 0, "space": 0, "direction": 0}
        name_lower = name.lower() if name else None
        storey_lower = storey.lower() if storey else None
        space_lower = space.lower() if space else None
        direction_lower = direction.lower() if direction else None

        for el in self._model.by_type(type_str):
            total += 1
            element_name = (el.Name or "").lower()
            if name_lower and name_lower not in element_name:
                rejected["name"] += 1
                continue

            s_st, s_sp, spl = self._get_spatial_context(el)

            if storey_lower and (not s_st or storey_lower not in s_st.lower()):
                rejected["storey"] += 1
                continue
            if space_lower:
                space_nospace = space_lower.replace(" ", "")
                hits = [
                    s_sp and space_nospace in s_sp.lower().replace(" ", ""),
                    spl and space_nospace in spl.lower().replace(" ", ""),
                    space_nospace in element_name.replace(" ", ""),
                ]
                if not any(hits):
                    # space 매칭 실패 시 storey 필터만으로 fallback (층이 지정된 경우)
                    if not storey_lower:
                        rejected["space"] += 1
                        continue
                    logger.info(f"space '{space_lower}' 매칭 실패, storey fallback")
            if direction_lower and direction_lower not in element_name:
                rejected["direction"] += 1
                continue

            matched.append(self._get_element_info(el, s_st, s_sp))
            if not select_all:
                break

        if not matched:
            self._last_query_reason = self._format_miss_reason(
                type_str,
                total,
                rejected,
                storey,
                space,
                direction,
                name,
            )
        return matched

    def _format_miss_reason(
        self,
        type_str: str,
        total: int,
        rejected: dict[str, int],
        storey: str | None,
        space: str | None,
        direction: str | None,
        name: str | None,
    ) -> str:
        if total == 0:
            return f"{type_str} 요소가 IFC 모델에 없습니다."
        filters = []
        if storey:
            filters.append(f"층={storey}")
        if space:
            filters.append(f"공간={space}")
        if direction:
            filters.append(f"방향={direction}")
        if name:
            filters.append(f"이름~={name}")
        detail = ", ".join(filters) if filters else "필터 없음"
        rejected_parts = [f"{key}:{count}" for key, count in rejected.items() if count]
        rejected_detail = ", ".join(rejected_parts) if rejected_parts else "조건 불일치"
        return (
            f"{type_str} {total}개를 검사했지만 매칭되지 않았습니다 "
            f"({detail}; 제외 사유 {rejected_detail})."
        )

    def _get_spatial_context(
        self, element: ifcopenshell.entity_instance
    ) -> tuple[str | None, str | None, str | None]:
        st = sp = spl = None
        for rel in getattr(element, "ContainedInStructure", []):
            if not rel.is_a("IfcRelContainedInSpatialStructure"):
                continue
            p = rel.RelatingStructure
            if p.is_a("IfcBuildingStorey"):
                st = normalize_storey_name(p.Name)
            elif p.is_a("IfcSpace"):
                sp, spl = p.Name, p.LongName
                for d in getattr(p, "Decomposes", []):
                    if d.is_a("IfcRelAggregates") and d.RelatingObject.is_a("IfcBuildingStorey"):
                        st = normalize_storey_name(d.RelatingObject.Name)
        return st, sp, spl

    def _get_element_info(
        self,
        element: ifcopenshell.entity_instance,
        storey: str | None = _UNSET,  # type: ignore[assignment]
        space: str | None = _UNSET,  # type: ignore[assignment]
    ) -> dict[str, Any]:
        if storey is _UNSET or space is _UNSET:
            s_st, s_sp, _ = self._get_spatial_context(element)
            if storey is _UNSET:
                storey = s_st
            if space is _UNSET:
                space = s_sp

        # Z 좌표 추출 (품질 검증용)
        dims: dict[str, float] = {
            "z_mm": 0.0,
            "height_mm": 2400.0,
            "width_mm": 200.0,
            "length_mm": 3000.0,
        }
        placement = getattr(element, "ObjectPlacement", None)
        if placement and placement.is_a("IfcLocalPlacement"):
            rel = placement.RelativePlacement
            if rel and rel.is_a("IfcAxis2Placement3D") and rel.Location:
                coords = rel.Location.Coordinates
                if len(coords) > 2:
                    dims["z_mm"] = float(coords[2])

        return {
            "global_id": element.GlobalId,
            "element_type": element.is_a(),
            "name": element.Name,
            "storey": storey or "1F",
            "space_name": normalize_space_name(space),
            "dims": dims,
        }
