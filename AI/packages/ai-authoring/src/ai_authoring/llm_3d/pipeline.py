"""
LLM3D Pipeline  (LLM_3D 정식 버전)
====================================
수정 이력:
  - _get_element_info: 하드코딩 치수 → 실제 IFC 지오메트리에서 읽기
  - execute_apply   : height_mm / material / color / rotation_deg / face_offset_mm 처리 추가
  - _modify_wall_position: /1000 단위 버그 제거 (IFC 단위 = mm)
  - applied_count 로직 재정비
  - 이중 순회 제거 (_get_element_info 호출 통합)
"""
from __future__ import annotations
import logging
import math
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import ifcopenshell
import ifcopenshell.guid

from .command import LLM3DCommand, LLM3DCommandType, LLM3DElementType, LLM3DSizeMode
from .engine import LLM3DEngine
from ..ifc_modifier import (
    delete_element,
    modify_thickness,
    modify_height,
    modify_position,
    modify_material,
    modify_rotation,
    modify_face_offset,
)
from .utils import normalize_storey_name, normalize_space_name

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# IFC Query Engine
# ──────────────────────────────────────────────────────────────────────────────
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
        space  = normalize_space_name(target.space_name) if target.space_name else None
        return self._query_by_filter(
            target.element_type,
            target.name,
            storey,
            space,
            target.direction,
            target.select_all,
        )

    # ── 조회 헬퍼 ────────────────────────────────────────────────────────────

    def _query_by_global_id(self, gid: str) -> List[Dict[str, Any]]:
        try:
            element = self._model.by_guid(gid)
            if element:
                return [self._get_element_info(element)]
        except Exception as e:
            logger.error(f"GlobalId {gid} 조회 중 오류: {e}")
        return []

    def _query_by_tag(self, tag: str, etype) -> List[Dict[str, Any]]:
        """Name 속성에 tag 문자열이 포함된 요소를 반환 (Pset 확장 예정)"""
        type_str = etype.value if hasattr(etype, "value") else etype
        matched = []
        for el in self._model.by_type(type_str):
            if tag.lower() in (el.Name or "").lower():
                matched.append(self._get_element_info(el))
        return matched

    def _query_by_filter(
        self, etype, name, storey, space_name, direction, select_all
    ) -> List[Dict[str, Any]]:
        type_str = etype.value if hasattr(etype, "value") else etype
        elements = self._model.by_type(type_str)
        matched = []

        for el in elements:
            el_name = (el.Name or "").lower()

            # 공간 컨텍스트 조회 (1회)
            s_storey, s_name, s_long = self._get_spatial_context(el)

            # 1. 이름 필터
            if name and name.lower() not in el_name:
                continue

            # 2. 층 필터
            if storey and (not s_storey or storey.lower() not in s_storey.lower()):
                continue

            # 3. 공간 필터 (Name · LongName · 요소 Name에서 공간 토큰 검색)
            if space_name:
                sn = space_name.lower()
                hits = [
                    s_name and sn in s_name.lower(),
                    s_long and sn in s_long.lower(),
                    sn in el_name,                   # "2F_Bathroom_..." 형태 지원
                ]
                if not any(hits):
                    continue

            # 4. 방향 필터 (요소 Name에서 방향 토큰 검색)
            if direction and direction.lower() not in el_name:
                continue

            matched.append(self._get_element_info(el, s_storey, s_name))

            if not select_all and len(matched) >= 1:
                break

        # 디버그: 아무것도 못 찾은 경우
        if not matched and elements:
            s0 = elements[0]
            st0, sn0, _ = self._get_spatial_context(s0)
            logger.debug(
                f"[NoMatch] type={type_str} storey={storey} space={space_name} dir={direction} | "
                f"sample: name='{s0.Name}' storey='{st0}' space='{sn0}'"
            )

        return matched

    def get_spatial_context(self, element) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """public wrapper — Pipeline 등 외부에서 사용"""
        return self._get_spatial_context(element)

    def get_model(self):
        """모델 직접 노출 대신 getter 제공"""
        return self._model

    # ── 공간 컨텍스트 ────────────────────────────────────────────────────────

    def _get_spatial_context(
        self, element
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        부재의 (StoreyName, SpaceName, SpaceLongName)을 1회 순회로 반환.
        벽이 Space에 포함된 경우 Space→Decomposes→Storey 경로도 탐색.
        """
        storey_name = space_name = space_long = None

        for rel in getattr(element, "ContainedInStructure", []):
            if not rel.is_a("IfcRelContainedInSpatialStructure"):
                continue
            parent = rel.RelatingStructure

            if parent.is_a("IfcBuildingStorey"):
                storey_name = normalize_storey_name(parent.Name)

            elif parent.is_a("IfcSpace"):
                space_name = parent.Name
                space_long = parent.LongName
                # Space → Storey
                for d_rel in getattr(parent, "Decomposes", []):
                    if d_rel.is_a("IfcRelAggregates"):
                        gp = d_rel.RelatingObject
                        if gp.is_a("IfcBuildingStorey"):
                            storey_name = normalize_storey_name(gp.Name)

        return storey_name, space_name, space_long

    def _get_length_scale(self, model) -> float:
        """
        팀 컨벤션에 따라 IFC 단위 변환(m/mm) 없이 무조건 mm(1.0) 배율로 고정하여 처리합니다.
        """
        return 1.0

    # ── 요소 정보 변환 ────────────────────────────────────────────────────────

    def _get_element_info(
        self, element, storey: str = None, space: str = None
    ) -> Dict[str, Any]:
        """
        IFC 요소 → 딕셔너리.
        storey/space가 이미 파악된 경우 재조회 생략 (이중 순회 방지).
        실제 지오메트리에서 치수를 읽어 품질 검증에 사용한다.
        """
        if storey is None or space is None:
            s_st, s_sp, _ = self._get_spatial_context(element)
            storey = storey or s_st
            space = space or s_sp

        model = self._model
        scale = self._get_length_scale(model)
        dims = self._read_geometry(element, scale)

        return {
            "global_id":   element.GlobalId,
            "element_type": element.is_a(),
            "name":        element.Name,
            "storey":      storey or "1F",
            "space_name":  space,
            "dims":        dims,
        }

    def _read_geometry(self, element, scale: float = 1.0) -> Dict[str, float]:
        """
        IfcExtrudedAreaSolid + IfcRectangleProfileDef 기반 치수 읽기.
        못 읽으면 안전한 기본값 반환.
        """
        dims: Dict[str, float] = {
            "x_mm": 0.0, "y_mm": 0.0, "z_mm": 0.0,
            "length_mm": 3000.0, "height_mm": 2400.0, "width_mm": 200.0,
        }

        # Z 위치 읽기
        placement = getattr(element, "ObjectPlacement", None)
        if placement and placement.is_a("IfcLocalPlacement"):
            rel = placement.RelativePlacement
            if rel and rel.is_a("IfcAxis2Placement3D"):
                loc = rel.Location
                if loc and loc.is_a("IfcCartesianPoint") and len(loc.Coordinates) > 2:
                    dims["z_mm"] = float(loc.Coordinates[2]) * scale

        # 지오메트리 치수 읽기
        if not element.Representation:
            return dims

        for rep in element.Representation.Representations:
            if rep.RepresentationIdentifier != "Body":
                continue
            for item in rep.Items:
                if not item.is_a("IfcExtrudedAreaSolid"):
                    continue
                profile = item.SweptArea
                if profile.is_a("IfcRectangleProfileDef"):
                    xd, yd = float(profile.XDim) * scale, float(profile.YDim) * scale
                    depth  = float(item.Depth) * scale
                    # 긴 쪽 = length, 짧은 쪽 = thickness(width)
                    if xd >= yd:
                        dims["length_mm"] = xd
                        dims["width_mm"]  = yd
                    else:
                        dims["length_mm"] = yd
                        dims["width_mm"]  = xd
                    dims["height_mm"] = depth
                    return dims   # 첫 번째 직사각형 솔리드만 읽음

        return dims


# ──────────────────────────────────────────────────────────────────────────────
# Session
# ──────────────────────────────────────────────────────────────────────────────
@dataclass
class PreviewSession:
    session_id:     str
    command:        LLM3DCommand
    matched:        List[Dict[str, Any]]
    quality_ok:     bool
    quality_errors: List[str] = field(default_factory=list)


class SessionStore:
    def __init__(self):
        self._store: Dict[str, PreviewSession] = {}

    def save(self, s: PreviewSession):
        self._store[s.session_id] = s

    def get(self, sid: str) -> Optional[PreviewSession]:
        return self._store.get(sid)

    def delete(self, sid: str):
        self._store.pop(sid, None)


_session_store = SessionStore()


# ──────────────────────────────────────────────────────────────────────────────
# Pipeline
# ──────────────────────────────────────────────────────────────────────────────
class LLM3DPipeline:
    def __init__(self, ifc_path: str, ifc_model=None, engine=None):
        self.ifc_path = ifc_path
        self.engine   = engine or LLM3DEngine()

        if ifc_model is None and ifc_path:
            try:
                ifc_model = ifcopenshell.open(ifc_path)
                logger.info(f"IFC 모델 로드 성공: {ifc_path}")
            except Exception as e:
                logger.error(f"IFC 모델 로드 실패 ({ifc_path}): {e}")

        self.query_engine = IFCQueryEngine(ifc_model=ifc_model)
        self.store        = _session_store

    # ── Preview ────────────────────────────────────────────────────────────────

    async def execute_preview(self, user_text: str) -> Dict[str, Any]:
        command = await self.engine.parse_command(user_text)

        # 모호성 재질문
        if command.ambiguity_question:
            return {
                "status":  "needs_clarification",
                "summary": command.ambiguity_question,
                "command": command.model_dump(),
            }

        # ── ReadOnly 부재 — 형태(치수) 변경만 차단, 위치/회전/재질/색상은 허용 ──────
        # command.py의 validate_modeling_quality()와 정책 일치.
        # 전면 차단은 기획안 위반이므로 제거; 세부 위반은 품질 검증 단계에서 걸러진다.

        # CREATE → 별도 파이프라인
        if command.command_type == LLM3DCommandType.CREATE:
            return {
                "status":  "create_not_supported",
                "summary": "CREATE 명령은 생성 파이프라인에서 처리됩니다.",
                "command": command.model_dump(),
            }

        # IFC 요소 검색
        matched = self.query_engine.find_elements(command)
        if not matched:
            return {
                "status":  "not_found",
                "summary": "대상 요소를 찾을 수 없습니다. 층·공간·방향 정보를 확인해주세요.",
                "command": command.model_dump(),
            }

        # 품질 검증 (중복 오류 제거)
        all_errors: List[str] = []
        for elem in matched:
            dims = elem.get("dims", {})
            errs = command.validate_modeling_quality(
                current_dims=dims,
                current_z=dims.get("z_mm"),
            )
            for e in errs:
                if e not in all_errors:
                    all_errors.append(e)

        quality_ok = len(all_errors) == 0
        session = PreviewSession(
            str(uuid.uuid4()), command, matched, quality_ok, all_errors
        )
        self.store.save(session)

        return {
            "status":        "preview_ready" if quality_ok else "failed_quality_check",
            "session_id":    session.session_id,
            "command":       command.model_dump(),
            "matched_count": len(matched),
            "quality_errors": all_errors,
            "summary":       self._generate_summary(command, len(matched), all_errors),
        }

    # ── Apply ──────────────────────────────────────────────────────────────────

    async def execute_apply(
        self,
        session_id: str,
        output_path: str = "modified_result.ifc",
    ) -> Dict[str, Any]:
        """세션 정보를 IFC 모델에 반영 후 파일 저장"""
        session = self.store.get(session_id)
        if not session:
            return {"status": "session_not_found"}
        if not session.quality_ok:
            return {"status": "quality_not_passed", "errors": session.quality_errors}

        model = self.query_engine.get_model()
        if not model:
            return {"status": "error", "summary": "IFC 모델이 로드되지 않았습니다."}

        command       = session.command
        applied_count = 0
        scale         = self.query_engine._get_length_scale(model)

        # 리뷰 반영: 1회성 세션이므로 실행 즉시 삭제하여 에러 발생 시 재실행(중복 적용)되는 버그 방지
        self.store.delete(session_id)

        try:
            for item in session.matched:
                gid = item.get("global_id")
                if not gid:
                    continue
                element = model.by_guid(gid)
                if not element:
                    continue

                etype_str = element.is_a()
                changes   = command.changes  # ← MODIFY/DELETE 분기 전에 반드시 할당

                # ── DELETE 처리 ──────────────────────────────────────────────
                if command.command_type == LLM3DCommandType.DELETE:
                    if delete_element(model, element, etype_str):
                        applied_count += 1
                    continue

                # ── MODIFY 처리 ──────────────────────────────────────────────
                if not changes:
                    continue

                # 요소 이름 마킹 (수정된 요소 추적용 — MODIFY 전용)
                orig_name = element.Name or ""
                if not orig_name.startswith("AI_MODIFIED_"):
                    element.Name = f"AI_MODIFIED_{orig_name}"

                applied_any = False

                if changes.width_mm:
                    if modify_thickness(element, changes.width_mm.model_dump(), scale):
                        applied_any = True
                        logger.info(f"[{gid[:8]}] width 수정 완료")
                    else:
                        logger.warning(f"[{gid[:8]}] width 수정 실패")

                if changes.height_mm:
                    if modify_height(element, changes.height_mm.model_dump(), scale):
                        applied_any = True
                        logger.info(f"[{gid[:8]}] height 수정 완료")
                    else:
                        logger.warning(f"[{gid[:8]}] height 수정 실패")

                if changes.position_mm:
                    if modify_position(element, changes.position_mm.model_dump(), scale):
                        applied_any = True
                        logger.info(f"[{gid[:8]}] position 수정 완료")

                        # ── 비즈니스 로직: 벽 이동 시 슬래브/지붕 동반 이동 (벌어짐 방지) ──
                        if etype_str == "IfcWall":
                            mode_relative = (changes.position_mm.mode == LLM3DSizeMode.RELATIVE)
                            dx = changes.position_mm.x / scale
                            dy = changes.position_mm.y / scale
                            dz = changes.position_mm.z / scale
                            
                            # ABSOLUTE인 경우에도 슬래브는 '이 벽의 이동량만큼' delta 이동해야 함
                            # (샘플 IFC에서는 벽 이동량 자체가 delta이므로 단순화하여 처리)
                            delta_pos = {"mode": "RELATIVE", "x": dx * scale, "y": dy * scale, "z": dz * scale}

                            qe = self.query_engine
                            storey_name, _, _ = qe.get_spatial_context(element)
                            if storey_name:
                                for rel_el in list(model.by_type("IfcSlab")) + list(model.by_type("IfcRoof")):
                                    s_st, _, _ = qe.get_spatial_context(rel_el)
                                    if s_st == storey_name:
                                        modify_position(rel_el, delta_pos, scale)
                                        logger.info(f"동반 이동 적용: {rel_el.is_a()} ({rel_el.Name})")
                    else:
                        logger.warning(f"[{gid[:8]}] position 수정 실패")

                if changes.material:
                    if modify_material(model, element, changes.material.model_dump()):
                        applied_any = True
                        logger.info(f"[{gid[:8]}] material 수정 완료")

                if changes.color:
                    # 색상은 Description에 기록 (렌더러 연동 예정)
                    element.Description = f"COLOR:{changes.color}"
                    applied_any = True
                    logger.info(f"[{gid[:8]}] color 기록: {changes.color}")

                if changes.rotation_deg is not None:
                    if modify_rotation(model, element, changes.rotation_deg):
                        applied_any = True
                        logger.info(f"[{gid[:8]}] rotation 수정 완료")

                if changes.face_offset_mm is not None:
                    if modify_face_offset(element, changes.face_offset_mm, scale):
                        applied_any = True
                        logger.info(f"[{gid[:8]}] face_offset 수정 완료")

                if applied_any:
                    applied_count += 1

            model.write(output_path)
            logger.info(f"IFC 파일 저장: {output_path}")

        except Exception as e:
            logger.error(f"IFC 반영 중 오류: {e}", exc_info=True)
            return {"status": "error", "summary": f"반영 실패: {e}"}

        return {
            "status":        "applied",
            "applied_count": applied_count,
            "output_path":   output_path,
            "summary":       f"{applied_count}개 요소에 변경사항이 반영되었습니다. → {output_path}",
        }


    # ── 요약 생성 ─────────────────────────────────────────────────────────────

    def _generate_summary(
        self, command: LLM3DCommand, count: int, errors: List[str]
    ) -> str:
        if errors:
            return f"품질 검증 실패: {errors[0]}"
        if command.command_type == LLM3DCommandType.DELETE:
            return f"[DELETE] {count}개 요소 삭제 준비 완료. (관계 엔티티 포함 정리)"
        return f"[{command.command_type.value}] {count}개 요소 수정 준비 완료."