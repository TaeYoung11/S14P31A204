"""
LLM3D Pipeline
==============
AI/llm_3d 정식 버전
"""
from __future__ import annotations
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
import ifcopenshell

try:
    from .command import LLM3DCommand, LLM3DCommandType, LLM3DElementType
    from .engine import LLM3DEngine
    from .utils import normalize_storey_name
except ImportError:
    from command import LLM3DCommand, LLM3DCommandType, LLM3DElementType
    from engine import LLM3DEngine
    from utils import normalize_storey_name

logger = logging.getLogger(__name__)

class IFCQueryEngine:
    def __init__(self, ifc_model=None):
        self._model = ifc_model

    def find_elements(self, command: LLM3DCommand) -> List[Dict[str, Any]]:
        if not self._model:
            logger.warning("IFC 모델이 로드되지 않았습니다. 빈 결과를 반환합니다.")
            return []

        target = command.target
        if target.global_id:
            return self._query_by_global_id(target.global_id)
        if target.tag:
            return self._query_by_tag(target.tag, target.element_type)
        
        storey = normalize_storey_name(target.storey) if target.storey else None
        return self._query_by_filter(
            target.element_type, 
            target.name, 
            storey, 
            target.space_name, 
            target.direction, 
            target.select_all
        )

    def _query_by_global_id(self, gid: str) -> List[Dict[str, Any]]:
        try:
            element = self._model.by_guid(gid)
            if element:
                return [self._get_element_info(element)]
        except Exception as e:
            logger.error(f"GlobalId {gid} 조회 중 오류: {e}")
        return []

    def _query_by_tag(self, tag: str, etype: Optional[str]) -> List[Dict[str, Any]]:
        # TODO: IfcPropertySet 또는 사용자 정의 속성(Pset) 기반의 상세 태그 검색 로직 확장 예정
        # 현재는 검색 편의를 위해 Name 속성에 해당 태그가 포함되어 있는지 확인
        elements = self._model.by_type(etype.value if hasattr(etype, 'value') else etype)
        matched = []
        for el in elements:
            if tag.lower() in (el.Name or "").lower():
                matched.append(self._get_element_info(el))
        return matched

    def _query_by_filter(self, etype, name, storey, space_name, direction, select_all) -> List[Dict[str, Any]]:
        type_str = etype.value if hasattr(etype, 'value') else etype
        elements = self._model.by_type(type_str)
        matched = []

        for el in elements:
            el_name = el.Name or ""
            # 1. 이름 필터링
            if name and name.lower() not in el_name.lower():
                continue
            
            # 2. 층(Storey) 필터링
            if storey:
                el_storey = self._get_storey_name(el)
                if not el_storey or storey.lower() not in el_storey.lower():
                    # 디버깅용: 층이 일치하지 않아 제외된 경우 로그 (너무 많을 수 있으니 주의)
                    # print(f"  [Debug] Element {el_name} excluded: Storey '{el_storey}' != target '{storey}'")
                    continue

            # 3. 공간(Space) 필터링 (Name과 LongName 둘 다 비교)
            if space_name:
                s_name, s_long = self._get_space_info(el)
                sn_lower = space_name.lower()
                name_match = s_name and sn_lower in s_name.lower()
                long_match = s_long and sn_lower in s_long.lower()
                if not (name_match or long_match):
                    continue

            # 4. 방향(Direction) 필터링
            if direction:
                if direction.lower() not in el_name.lower():
                    continue

            matched.append(self._get_element_info(el))
            if not select_all and len(matched) >= 1:
                break

        if not matched and len(elements) > 0:
            # 하나도 못 찾았을 때 첫 번째 부재의 정보를 샘플로 출력하여 원인 파악 도움
            sample_el = elements[0]
            s_name, _ = self._get_space_info(sample_el)
            print(f"  [Debug] No match found. Sample Element: Name='{sample_el.Name}', Storey='{self._get_storey_name(sample_el)}', Space='{s_name}'", flush=True)

        return matched

    def _get_storey_name(self, element) -> Optional[str]:
        """부재가 속한 IfcBuildingStorey의 이름을 반환"""
        for rel in getattr(element, "ContainedInStructure", []):
            if rel.is_a("IfcRelContainedInSpatialStructure"):
                parent = rel.RelatingStructure
                if parent.is_a("IfcBuildingStorey"):
                    return normalize_storey_name(parent.Name)
        return None

    def _get_space_info(self, element) -> Tuple[Optional[str], Optional[str]]:
        """부재가 속한 IfcSpace의 (Name, LongName) 튜플을 반환"""
        for rel in getattr(element, "ContainedInStructure", []):
            if rel.is_a("IfcRelContainedInSpatialStructure"):
                parent = rel.RelatingStructure
                if parent.is_a("IfcSpace"):
                    return parent.Name, parent.LongName
        return None, None

    def _get_element_info(self, element) -> Dict[str, Any]:
        """IFC 객체를 딕셔너리 정보로 변환 (Mock 규격 대응)"""
        # TODO: QuantitySet(Qto_*) 분석 및 Geometry 엔진 연동을 통한 실측 치수 데이터 추출 로직 추가 예정
        # 현재는 부재 식별 테스트를 위해 기본 규격 정보(Dummy)를 반환
        return {
            "global_id": element.GlobalId,
            "element_type": element.is_a(),
            "name": element.Name,
            "storey": self._get_storey_name(element) or "1F",
            "space_name": self._get_space_info(element)[0],
            "dims": {
                "x_mm": 0, "y_mm": 0, "z_mm": 0,
                "length_mm": 3000, "height_mm": 2400, "width_mm": 200
            }
        }

@dataclass
class PreviewSession:
    session_id:  str
    command:     LLM3DCommand
    matched:     List[Dict[str, Any]]
    quality_ok:  bool
    quality_errors: List[str] = field(default_factory=list)

class SessionStore:
    def __init__(self): self._store = {}
    def save(self, s): self._store[s.session_id] = s
    def get(self, sid): return self._store.get(sid)
    def delete(self, sid): self._store.pop(sid, None)

_session_store = SessionStore()

class LLM3DPipeline:
    def __init__(self, ifc_path: str, ifc_model=None, engine=None):
        self.ifc_path = ifc_path
        self.engine = engine or LLM3DEngine()
        
        # IFC 모델 로드 (전달받은 모델이 없으면 경로에서 로드)
        if ifc_model is None and ifc_path:
            try:
                ifc_model = ifcopenshell.open(ifc_path)
                logger.info(f"IFC 모델 로드 성공: {ifc_path}")
            except Exception as e:
                logger.error(f"IFC 모델 로드 실패 ({ifc_path}): {e}")

        self.query_engine = IFCQueryEngine(ifc_model=ifc_model)
        self.store = _session_store

    async def execute_preview(self, user_text: str) -> Dict[str, Any]:
        command = await self.engine.parse_command(user_text)

        # 재질문 — LLM이 모호하다고 판단한 경우
        if command.ambiguity_question:
            return {"status": "needs_clarification", "summary": command.ambiguity_question, "command": command.model_dump()}

        # 0. 특정 부재(수정 불가) 체크 (검색 전 우선 수행)
        readonly_types = {
            LLM3DElementType.DOOR, LLM3DElementType.WINDOW, LLM3DElementType.STAIR,
            LLM3DElementType.SLAB, LLM3DElementType.COLUMN, LLM3DElementType.BEAM,
        }
        if command.target.element_type in readonly_types:
            return {
                "status": "readonly_element",
                "summary": "[수정불가] 문, 창문, 계단, 슬래브, 기둥, 보는 수정할 수 없는 특정 부재입니다.",
                "command": command.model_dump(),
            }

        # CREATE는 IFC 검색 불필요 — 별도 생성 파이프라인으로 위임 (1순위 수정 로직과 분리)
        if command.command_type == LLM3DCommandType.CREATE:
            return {
                "status":  "create_not_supported",
                "summary": "CREATE 명령은 생성 파이프라인에서 처리됩니다.",
                "command": command.model_dump(),
            }

        # IFC 요소 검색
        matched = self.query_engine.find_elements(command)
        if not matched:
            return {"status": "not_found", "summary": "대상 요소를 찾을 수 없습니다.", "command": command.model_dump()}

        # 품질 검증 — select_all=True 이면 매칭된 모든 요소를 검사, 오류는 누적
        all_quality_errors: List[str] = []
        for elem in matched:
            dims     = elem.get("dims", {})
            current_z = dims.get("z_mm")          # IFC 요소의 Z 좌표 (없으면 None → validator 내부에서 0으로 처리)
            errs = command.validate_modeling_quality(current_dims=dims, current_z=current_z)
            for e in errs:
                if e not in all_quality_errors:    # 동일 오류 중복 제거
                    all_quality_errors.append(e)

        session = PreviewSession(str(uuid.uuid4()), command, matched, len(all_quality_errors) == 0, all_quality_errors)
        self.store.save(session)
        return {
            "status":        "preview_ready" if session.quality_ok else "failed_quality_check",
            "session_id":    session.session_id,
            "command":       command.model_dump(),
            "matched_count": len(matched),
            "quality_errors": all_quality_errors,
            "summary":       self._generate_summary(command, len(matched), all_quality_errors),
        }

    async def execute_apply(self, session_id: str) -> Dict[str, Any]:
        session = self.store.get(session_id)
        if not session: return {"status": "session_not_found"}
        if not session.quality_ok: return {"status": "quality_not_passed"}
        self.store.delete(session_id)
        return {"status": "applied", "applied_elements": session.matched, "summary": f"{len(session.matched)}개 요소 변경 완료"}

    def _generate_summary(self, command, count, errors):
        if errors: return f"품질 검증 실패: {errors[0]} 등"
        return f"[{command.command_type.value}] {count}개 수정 준비 완료."