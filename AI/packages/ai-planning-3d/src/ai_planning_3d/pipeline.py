from __future__ import annotations
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import ifcopenshell
import ifcopenshell.guid

from .command import LLM3DCommand, LLM3DCommandType, LLM3DElementType, LLM3DSizeMode
from .engine import LLM3DEngine
from .utils import normalize_storey_name, normalize_space_name

# 3D Engine (Execution Part) 임포트 - 새 패키지 구조 참조
from ai_authoring.engine_3d import (
    delete_element,
    modify_thickness,
    modify_height,
    modify_position,
    modify_material,
    modify_rotation,
    modify_face_offset,
    create_wall,
    create_slab,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# IFC Query Engine (Planning을 위한 모델 탐색 전담)
# ──────────────────────────────────────────────────────────────────────────────
class IFCQueryEngine:
    def __init__(self, ifc_model=None):
        self._model = ifc_model

    def find_elements(self, command: LLM3DCommand) -> List[Dict[str, Any]]:
        if not self._model: return []
        target = command.target
        if target.global_id: return self._query_by_global_id(target.global_id)
        
        storey = normalize_storey_name(target.storey) if target.storey else None
        space  = normalize_space_name(target.space_name) if target.space_name else None
        return self._query_by_filter(target.element_type, target.name, storey, space, target.direction, target.select_all)

    def _query_by_global_id(self, gid: str) -> List[Dict[str, Any]]:
        try:
            el = self._model.by_guid(gid)
            return [self._get_element_info(el)] if el else []
        except: return []

    def _query_by_filter(self, etype, name, storey, space, direction, select_all) -> List[Dict[str, Any]]:
        type_str = etype.value if hasattr(etype, "value") else etype
        elements = self._model.by_type(type_str)
        matched = []
        for el in elements:
            # 1. 가장 가벼운 이름 필터부터 수행 (불필요한 공간 조회 방지)
            if name and name.lower() not in (el.Name or "").lower(): 
                continue
            
            # 2. 그 다음 공간 정보 조회 (비교적 무거운 연산)
            s_st, s_sp, spl = self._get_spatial_context(el)
            
            if storey and (not s_st or storey.lower() not in s_st.lower()): 
                continue
            if space:
                sn = space.lower()
                hits = [
                    s_sp and sn in s_sp.lower(),
                    spl and sn in spl.lower(),
                    sn in (el.Name or "").lower(),   # "2F_Bathroom_..." 이름 형태 지원
                ]
                if not any(hits): continue
            if direction and direction.lower() not in (el.Name or "").lower(): continue
            matched.append(self._get_element_info(el, s_st, s_sp))
            if not select_all: break
        return matched

    def _get_spatial_context(self, element) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        st = sp = spl = None
        for rel in getattr(element, "ContainedInStructure", []):
            if not rel.is_a("IfcRelContainedInSpatialStructure"): continue
            p = rel.RelatingStructure
            if p.is_a("IfcBuildingStorey"): st = normalize_storey_name(p.Name)
            elif p.is_a("IfcSpace"):
                sp, spl = p.Name, p.LongName
                for d in getattr(p, "Decomposes", []):
                    if d.is_a("IfcRelAggregates") and d.RelatingObject.is_a("IfcBuildingStorey"):
                        st = normalize_storey_name(d.RelatingObject.Name)
        return st, sp, spl

    def _get_element_info(self, element, storey=None, space=None) -> Dict[str, Any]:
        if storey is None or space is None:
            s_st, s_sp, _ = self._get_spatial_context(element)
            storey, space = storey or s_st, space or s_sp
        
        # 지오메트리 읽기 (품질 검증용)
        dims = {"z_mm": 0.0, "height_mm": 2400.0, "width_mm": 200.0, "length_mm": 3000.0}
        placement = getattr(element, "ObjectPlacement", None)
        if placement and placement.is_a("IfcLocalPlacement"):
            rel = placement.RelativePlacement
            if rel and rel.is_a("IfcAxis2Placement3D") and rel.Location:
                coords = rel.Location.Coordinates
                if len(coords) > 2: dims["z_mm"] = float(coords[2])
        
        return {
            "global_id": element.GlobalId,
            "element_type": element.is_a(),
            "name": element.Name,
            "storey": storey or "1F",
            "space_name": space,
            "dims": dims
        }

    def get_model(self): return self._model

# ──────────────────────────────────────────────────────────────────────────────
# Pipeline (Planning + Dispatching)
# ──────────────────────────────────────────────────────────────────────────────
@dataclass
class PreviewSession:
    session_id: str
    command: LLM3DCommand
    matched: List[Dict[str, Any]]
    quality_ok: bool
    quality_errors: List[str] = field(default_factory=list)

class LLM3DPipeline:
    def __init__(self, ifc_path: str = None, ifc_model=None, engine=None):
        self.engine = engine or LLM3DEngine()
        if ifc_model is None and ifc_path:
            try:
                ifc_model = ifcopenshell.open(ifc_path)
            except Exception as e:
                logger.error(f"IFC 파일을 열 수 없습니다 ({ifc_path}): {e}")
                ifc_model = None
        self.query_engine = IFCQueryEngine(ifc_model=ifc_model)
        self.store: Dict[str, PreviewSession] = {}

    async def execute_preview(self, user_text: str) -> Dict[str, Any]:
        command = await self.engine.parse_command(user_text)
        if command.ambiguity_question:
            return {"status": "needs_clarification", "summary": command.ambiguity_question, "command": command.model_dump()}

        if command.command_type == LLM3DCommandType.CREATE:
            return await self._execute_create_preview(command)

        matched = self.query_engine.find_elements(command)
        if not matched:
            return {"status": "not_found", "summary": "대상 요소를 찾을 수 없습니다.", "command": command.model_dump()}

        all_errors = []
        for elem in matched:
            errs = command.validate_modeling_quality(current_dims=elem["dims"], current_z=elem["dims"]["z_mm"])
            for e in errs:
                if e not in all_errors: all_errors.append(e)

        quality_ok = len(all_errors) == 0
        session = PreviewSession(str(uuid.uuid4()), command, matched, quality_ok, all_errors)
        self.store[session.session_id] = session

        return {
            "status": "preview_ready" if quality_ok else "failed_quality_check",
            "session_id": session.session_id,
            "command": command.model_dump(),
            "matched_count": len(matched),
            "summary": self._generate_summary(command, len(matched), all_errors)
        }

    async def execute_apply(self, session_id: str, output_path: str = "result.ifc") -> Dict[str, Any]:
        session = self.store.get(session_id)
        if not session: return {"status": "session_not_found"}
        
        # 품질 검증에 실패한 세션은 실행 차단
        if not session.quality_ok:
            return {
                "status": "failed_quality_check", 
                "summary": "품질 검증을 통과하지 못한 명령은 적용할 수 없습니다.",
                "errors": session.quality_errors
            }

        command = session.command
        model = self.query_engine.get_model()
        
        # CREATE 분기
        if command.command_type == LLM3DCommandType.CREATE:
            try:
                return await self._execute_create_apply(session_id, output_path)
            finally:
                self.store.pop(session_id, None)

        applied_count = 0
        try:
            for item in session.matched:
                element = model.by_guid(item["global_id"])
                if not element: continue
                
                if command.command_type == LLM3DCommandType.DELETE:
                    if delete_element(model, element): applied_count += 1
                    continue

                changes = command.changes
                if not changes: continue
                
                applied_any = False
                if changes.width_mm: 
                    if modify_thickness(element, changes.width_mm.model_dump()): applied_any = True
                if changes.height_mm:
                    if modify_height(element, changes.height_mm.model_dump()): applied_any = True
                if changes.position_mm:
                    if modify_position(element, changes.position_mm.model_dump()): applied_any = True
                if changes.material:
                    if modify_material(model, element, changes.material.model_dump()): applied_any = True
                if changes.rotation_deg is not None:
                    if modify_rotation(model, element, changes.rotation_deg): applied_any = True
                if changes.face_offset_mm is not None:
                    if modify_face_offset(element, changes.face_offset_mm, command.target.direction or ""): applied_any = True
                
                if applied_any: applied_count += 1

            model.write(output_path)
            return {"status": "applied", "applied_count": applied_count, "summary": f"{applied_count}개 요소 반영 완료"}
        finally:
            self.store.pop(session_id, None)

    # ── CREATE Preview/Apply (Private) ──────────────────────────────────────────

    async def _execute_create_preview(self, command: LLM3DCommand) -> Dict[str, Any]:
        ci = command.create_info
        if not ci.direction:
            return {"status": "needs_clarification", "summary": "생성 방향을 알려주세요.", "command": command.model_dump()}
        
        model = self.query_engine.get_model()
        storeys = model.by_type("IfcBuildingStorey")
        target_storey = storeys[0] # 우선 첫 번째 층으로 단순화
        
        ci_dict = ci.model_dump()
        if not ci_dict.get("start_point"):
            ci_dict["start_point"] = {"x": 0.0, "y": 0.0, "z": 0.0}

        session = PreviewSession(str(uuid.uuid4()), command, [{"create_info": ci_dict, "storey_guid": target_storey.GlobalId}], True)
        self.store[session.session_id] = session
        return {"status": "preview_ready", "session_id": session.session_id, "command": command.model_dump(), "summary": "생성 준비 완료"}

    async def _execute_create_apply(self, session_id: str, output_path: str) -> Dict[str, Any]:
        session = self.store.get(session_id)
        model = self.query_engine.get_model()
        info = session.matched[0]
        ci_dict = info["create_info"]
        storey = model.by_guid(info["storey_guid"])
        
        creator = create_wall if ci_dict["element_type"] == "IfcWall" else create_slab
        entity = creator(model, storey, ci_dict)
        
        if entity:
            model.write(output_path)
            return {"status": "applied", "created_id": entity.GlobalId, "summary": "신규 부재 생성 완료"}
        return {"status": "error", "summary": "생성 실패"}

    def _generate_summary(self, command, count, errors):
        if errors: return f"품질 검증 실패: {errors[0]}"
        return f"[{command.command_type.value}] {count}개 요소 준비 완료"