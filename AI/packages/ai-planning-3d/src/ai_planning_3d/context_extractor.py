"""IFC 모델에서 층/공간/요소 현황을 파싱해 LLM 시스템 프롬프트용 텍스트를 생성한다."""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

import ifcopenshell

logger = logging.getLogger(__name__)

_EXTRACT_TYPES: frozenset[str] = frozenset(
    {
        "IfcWall",
        "IfcWallStandardCase",
        "IfcSlab",
        "IfcColumn",
        "IfcBeam",
        "IfcDoor",
        "IfcWindow",
        "IfcStair",
        "IfcRoof",
    }
)

# Revit 등 일부 툴이 IFC4에서도 WallStandardCase를 내보내는 경우가 있어 통합
_TYPE_NORMALIZE: dict[str, str] = {
    "IfcWallStandardCase": "IfcWall",
}

_LOAD_BEARING_PSET = "Pset_WallCommon"
_LOAD_BEARING_PROP = "LoadBearing"

MAX_ELEMENTS = 500


@dataclass
class StoreyInfo:
    id: str
    name: str
    index: int
    elevation_mm: float
    height_mm: float


@dataclass
class SpaceInfo:
    global_id: str
    name: str
    storey: str
    long_name: str | None = None


@dataclass
class SpaceBoundaryLink:
    space_global_id: str
    element_global_id: str


@dataclass
class ElementInfo:
    global_id: str
    element_type: str
    name: str | None = None
    storey: str | None = None
    space_name: str | None = None
    is_load_bearing: bool | None = None


@dataclass
class Scene3DContext:
    schema_version: str = "v1"
    scene_type: str = "SCENE_3D"
    scene_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "ifc-context"
    units: str = "mm"
    coordinate_frame: str = "PROJECT_GLOBAL_3D_MM"
    storeys: list[StoreyInfo] = field(default_factory=list)
    spaces: list[SpaceInfo] = field(default_factory=list)
    space_boundary_links: list[SpaceBoundaryLink] = field(default_factory=list)
    elements: list[ElementInfo] = field(default_factory=list)
    is_truncated: bool = False
    total_element_count: int = 0
    context_text: str | None = None


class IFCContextExtractor:
    def __init__(
        self,
        model: ifcopenshell.file | None,
        scale_to_mm: float = 1.0,
    ) -> None:
        self._model = model
        self._scale = scale_to_mm

    def extract(self) -> Scene3DContext | None:
        if not self._model:
            return None
        try:
            return self._extract()
        except Exception:
            logger.warning("컨텍스트 추출 실패", exc_info=True)
            return None

    def _extract(self) -> Scene3DContext | None:
        model = self._model
        raw_storeys = model.by_type("IfcBuildingStorey")
        if not raw_storeys:
            return None

        sorted_storeys = sorted(
            raw_storeys,
            key=lambda s: float(getattr(s, "Elevation", None) or 0),
        )

        storey_infos: list[StoreyInfo] = []
        space_infos: list[SpaceInfo] = []
        boundary_links: list[SpaceBoundaryLink] = []
        element_infos: list[ElementInfo] = []
        total_count = 0

        for idx, storey in enumerate(sorted_storeys, start=1):
            s_name = self._storey_label(storey)
            elevation = self._to_mm(float(getattr(storey, "Elevation", None) or 0))

            storey_infos.append(
                StoreyInfo(
                    id=f"storey-{idx}",
                    name=s_name,
                    index=idx,
                    elevation_mm=elevation,
                    height_mm=self._storey_height_mm(storey, sorted_storeys, idx),
                )
            )

            for space in self._spaces_in_storey(storey):
                sp_name = (space.Name or "").strip()
                sp_long = (space.LongName or "").strip() or None
                space_infos.append(
                    SpaceInfo(
                        global_id=space.GlobalId,
                        name=sp_name or sp_long or "Unknown",
                        storey=s_name,
                        long_name=sp_long,
                    )
                )
                for rel in model.get_inverse(space):
                    if rel.is_a("IfcRelSpaceBoundary"):
                        elem = getattr(rel, "RelatedBuildingElement", None)
                        if elem and elem.is_a() in _EXTRACT_TYPES:
                            boundary_links.append(
                                SpaceBoundaryLink(
                                    space_global_id=space.GlobalId,
                                    element_global_id=elem.GlobalId,
                                )
                            )

            for el in self._elements_in_storey(storey):
                total_count += 1
                if len(element_infos) >= MAX_ELEMENTS:
                    continue
                etype = _TYPE_NORMALIZE.get(el.is_a(), el.is_a())
                space_name = self._element_space_name(el)
                _structural_types = ("IfcWall", "IfcSlab", "IfcColumn", "IfcBeam", "IfcRoof")
                is_lb = self._is_load_bearing(el) if etype in _structural_types else None
                element_infos.append(
                    ElementInfo(
                        global_id=el.GlobalId,
                        element_type=etype,
                        name=(el.Name or "").strip() or None,
                        storey=s_name,
                        space_name=space_name,
                        is_load_bearing=is_lb,
                    )
                )

        if not element_infos and not space_infos:
            return None

        ctx = Scene3DContext(
            storeys=storey_infos,
            spaces=space_infos,
            space_boundary_links=boundary_links,
            elements=element_infos,
            is_truncated=total_count > MAX_ELEMENTS,
            total_element_count=total_count,
        )
        ctx.context_text = self._build_context_text(ctx)
        return ctx

    def _build_context_text(self, ctx: Scene3DContext) -> str:
        lines: list[str] = ["[IFC 모델 현황]"]

        space_by_storey: dict[str, list[SpaceInfo]] = defaultdict(list)
        for sp in ctx.spaces:
            space_by_storey[sp.storey].append(sp)

        elem_by_storey_space: dict[str, dict[str, list[str]]] = defaultdict(
            lambda: defaultdict(list)
        )
        for el in ctx.elements:
            storey_key = el.storey or "Unknown"
            space_key = el.space_name or "__unspaced__"
            elem_by_storey_space[storey_key][space_key].append(el.element_type)

        for storey in ctx.storeys:
            s = storey.name
            parts: list[str] = []

            space_elems = elem_by_storey_space.get(s, {})
            for sp in space_by_storey.get(s, []):
                sp_key = sp.name
                elems = space_elems.get(sp_key, [])
                if elems:
                    counts = _count_types(elems)
                    parts.append(f"{sp_key}({counts})")
                else:
                    parts.append(sp_key)

            unspaced = space_elems.get("__unspaced__", [])
            if unspaced:
                counts = _count_types(unspaced)
                parts.append(f"공간미지정({counts})")

            if parts:
                lines.append(f"{s}: {', '.join(parts)}")

        if ctx.is_truncated:
            lines.append(f"(요소 {ctx.total_element_count}개 중 {MAX_ELEMENTS}개만 표시)")

        return "\n".join(lines)

    def _storey_label(self, storey: ifcopenshell.entity_instance) -> str:
        name = (storey.Name or "").strip()
        _map = {
            "1층": "1F", "2층": "2F", "3층": "3F", "4층": "4F",
            "지하": "B1", "지하1층": "B1", "옥상": "RF",
        }
        return _map.get(name, name or "Unknown")

    def _storey_height_mm(
        self,
        storey: ifcopenshell.entity_instance,
        all_storeys: list[ifcopenshell.entity_instance],
        idx: int,
    ) -> float:
        current_elev = self._to_mm(float(getattr(storey, "Elevation", None) or 0))
        if idx < len(all_storeys):
            next_elev = self._to_mm(
                float(getattr(all_storeys[idx], "Elevation", None) or 0)
            )
            h = next_elev - current_elev
            if h > 0:
                return h
        return 2800.0

    def _spaces_in_storey(
        self, storey: ifcopenshell.entity_instance
    ) -> list[ifcopenshell.entity_instance]:
        spaces: list[ifcopenshell.entity_instance] = []
        seen: set[int] = set()

        def visit(node: Any) -> None:
            for rel in getattr(node, "IsDecomposedBy", []) or []:
                for child in getattr(rel, "RelatedObjects", []) or []:
                    sid = int(child.id())
                    if child.is_a("IfcSpace") and sid not in seen:
                        seen.add(sid)
                        spaces.append(child)
                    visit(child)

        visit(storey)
        return spaces

    def _elements_in_storey(
        self, storey: ifcopenshell.entity_instance
    ) -> list[ifcopenshell.entity_instance]:
        model = self._model
        result: list[ifcopenshell.entity_instance] = []
        seen: set[int] = set()
        for rel in model.get_inverse(storey):
            if not rel.is_a("IfcRelContainedInSpatialStructure"):
                continue
            for el in getattr(rel, "RelatedElements", []) or []:
                eid = int(el.id())
                if el.is_a() in _EXTRACT_TYPES and eid not in seen:
                    seen.add(eid)
                    result.append(el)
        # IfcSpace에 직접 컨테인된 요소는 Storey 역방향 조회에 안 잡힌다
        for space in self._spaces_in_storey(storey):
            for rel in model.get_inverse(space):
                if not rel.is_a("IfcRelContainedInSpatialStructure"):
                    continue
                for el in getattr(rel, "RelatedElements", []) or []:
                    eid = int(el.id())
                    if el.is_a() in _EXTRACT_TYPES and eid not in seen:
                        seen.add(eid)
                        result.append(el)
        return result

    def _element_space_name(
        self, el: ifcopenshell.entity_instance
    ) -> str | None:
        for rel in getattr(el, "ContainedInStructure", []) or []:
            if rel.is_a("IfcRelContainedInSpatialStructure"):
                sp = rel.RelatingStructure
                if sp.is_a("IfcSpace"):
                    return (sp.Name or sp.LongName or "").strip() or None
        return None

    def _is_load_bearing(self, el: ifcopenshell.entity_instance) -> bool | None:
        for rel in getattr(el, "IsDefinedBy", []) or []:
            if not rel.is_a("IfcRelDefinesByProperties"):
                continue
            pset = rel.RelatingPropertyDefinition
            if not hasattr(pset, "Name") or pset.Name != _LOAD_BEARING_PSET:
                continue
            for prop in getattr(pset, "HasProperties", []) or []:
                if getattr(prop, "Name", None) == _LOAD_BEARING_PROP:
                    val = getattr(prop, "NominalValue", None)
                    if val is not None:
                        return bool(getattr(val, "wrappedValue", False))
        return None

    def _to_mm(self, value: float) -> float:
        return value * self._scale


def _count_types(type_list: list[str]) -> str:
    counts: dict[str, int] = defaultdict(int)
    for t in type_list:
        counts[t] += 1
    return ", ".join(f"{t}×{n}" for t, n in sorted(counts.items()))
