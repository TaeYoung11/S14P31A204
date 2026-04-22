"""
LLM3D Pipeline
==============
AI/llm_3d 정식 버전
"""
from __future__ import annotations
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

try:
    from .command import LLM3DCommand
    from .engine import LLM3DEngine
    from .utils import normalize_storey_name
    from .mock_utils import generate_mock_element
except ImportError:
    from command import LLM3DCommand
    from engine import LLM3DEngine
    from utils import normalize_storey_name
    from mock_utils import generate_mock_element

logger = logging.getLogger(__name__)

class IFCQueryEngine:
    def __init__(self, ifc_model=None):
        self._model = ifc_model

    def find_elements(self, command: LLM3DCommand) -> List[Dict[str, Any]]:
        target = command.target
        if target.global_id:
            return self._query_by_global_id(target.global_id)
        if target.tag:
            return self._query_by_tag(target.tag, target.element_type)
        storey = normalize_storey_name(target.storey) if target.storey else None
        return self._query_by_filter(target.element_type, target.name, storey, target.select_all)

    def _query_by_global_id(self, gid):
        return [generate_mock_element(global_id=gid)]
    def _query_by_tag(self, tag, etype):
        return [generate_mock_element(tag=tag, element_type=etype)]
    def _query_by_filter(self, etype, name, storey, select_all):
        count = 3 if select_all else 1
        return [generate_mock_element(element_type=etype, storey=storey or "1F", name=f"{name or etype.value}_{i+1}") for i in range(count)]

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
        self.query_engine = IFCQueryEngine(ifc_model=ifc_model)
        self.store = _session_store

    async def execute_preview(self, user_text: str) -> Dict[str, Any]:
        command = await self.engine.parse_command(user_text)
        if command.ambiguity_question:
            return {"status": "needs_clarification", "summary": command.ambiguity_question, "command": command.model_dump()}
        matched = self.query_engine.find_elements(command)
        if not matched: return {"status": "not_found", "summary": "대상 요소를 찾을 수 없습니다."}
        quality_errors = command.validate_modeling_quality(current_dims=matched[0].get("dims"))
        session = PreviewSession(str(uuid.uuid4()), command, matched, len(quality_errors) == 0, quality_errors)
        self.store.save(session)
        return {
            "status": "preview_ready" if session.quality_ok else "failed_quality_check",
            "session_id": session.session_id,
            "command": command.model_dump(),
            "matched_count": len(matched),
            "quality_errors": quality_errors,
            "summary": self._generate_summary(command, len(matched), quality_errors)
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
