from __future__ import annotations

import logging
from typing import Any

import ifcopenshell

from .command import LLM3DCommand, LLM3DElementType
from .utils import normalize_space_name, normalize_storey_name

logger = logging.getLogger(__name__)


class IFCQueryEngine:
    """IFC 모델 탐색 전담 클래스 — Planning 단계에서 대상 요소를 찾는다."""

    def __init__(self, ifc_model: ifcopenshell.file | None = None) -> None:
        self._model = ifc_model

    def get_model(self) -> ifcopenshell.file | None:
        return self._model

    def find_elements(self, command: LLM3DCommand) -> list[dict[str, Any]]:
        if not self._model:
            return []
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
            return [self._get_element_info(el)] if el else []
        except Exception:
            return []

    def _query_by_filter(
        self,
        etype: LLM3DElementType,
        name: str | None,
        storey: str | None,
        space: str | None,
        direction: str | None,
        select_all: bool,
    ) -> list[dict[str, Any]]:
        type_str = etype.value if hasattr(etype, "value") else str(etype)
        elements = self._model.by_type(type_str)
        matched: list[dict[str, Any]] = []

        for el in elements:
            # 1. 이름 필터 (가벼운 연산 우선)
            if name and name.lower() not in (el.Name or "").lower():
                continue

            # 2. 공간 컨텍스트 조회 (무거운 연산)
            s_st, s_sp, spl = self._get_spatial_context(el)

            if storey and (not s_st or storey.lower() not in s_st.lower()):
                continue
            if space:
                sn = space.lower()
                hits = [
                    s_sp and sn in s_sp.lower(),
                    spl and sn in spl.lower(),
                    sn in (el.Name or "").lower(),
                ]
                if not any(hits):
                    continue
            if direction and direction.lower() not in (el.Name or "").lower():
                continue

            matched.append(self._get_element_info(el, s_st, s_sp))
            if not select_all:
                break

        return matched

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
                    if d.is_a("IfcRelAggregates") and d.RelatingObject.is_a(
                        "IfcBuildingStorey"
                    ):
                        st = normalize_storey_name(d.RelatingObject.Name)
        return st, sp, spl

    def _get_element_info(
        self,
        element: ifcopenshell.entity_instance,
        storey: str | None = None,
        space: str | None = None,
    ) -> dict[str, Any]:
        if storey is None or space is None:
            s_st, s_sp, _ = self._get_spatial_context(element)
            storey = storey or s_st
            space = space or s_sp

        # Z 좌표 추출 (품질 검증용)
        dims: dict[str, float] = {
            "z_mm": 0.0, "height_mm": 2400.0,
            "width_mm": 200.0, "length_mm": 3000.0,
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
            "space_name": space,
            "dims": dims,
        }