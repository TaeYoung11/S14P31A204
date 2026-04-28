import uuid
import logging
from typing import Any
import ifcopenshell
from .engine import LLM3DEngine
from .command import LLM3DCommand, LLM3DCommandType, LLM3DElementType
from .query_engine import IFCQueryEngine
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


class PreviewSession:
    def __init__(
        self,
        session_id: str,
        command: LLM3DCommand,
        matched: list[dict[str, Any]],
        quality_ok: bool = True,
        quality_errors: list[str] | None = None,
    ):
        self.session_id = session_id
        self.command = command
        self.matched = matched
        self.quality_ok = quality_ok
        self.quality_errors = quality_errors or []


class LLM3DPipeline:
    def __init__(self, ifc_path: str | None = None, model_name: str = "qwen2.5:7b"):
        self.engine = LLM3DEngine(model=model_name)
        ifc_model = None
        if ifc_path:
            try:
                ifc_model = ifcopenshell.open(ifc_path)
            except Exception as e:
                logger.error(f"IFC 파일을 열 수 없습니다 ({ifc_path}): {e}")
        self.query_engine = IFCQueryEngine(ifc_model=ifc_model)
        self.store: dict[str, PreviewSession] = {}

    async def execute_preview(self, user_text: str) -> dict[str, Any]:
        command = await self.engine.parse_command(user_text)
        if command.ambiguity_question:
            return {
                "status": "needs_clarification",
                "summary": command.ambiguity_question,
                "command": command.model_dump(),
            }

        if command.command_type == LLM3DCommandType.CREATE:
            return await self._execute_create_preview(command)

        matched = self.query_engine.find_elements(command)
        if not matched:
            return {
                "status": "not_found",
                "summary": "대상 요소를 찾을 수 없습니다.",
                "command": command.model_dump(),
            }

        all_errors = []
        for elem in matched:
            errs = command.validate_modeling_quality(
                current_dims=elem["dims"], current_z=elem["dims"]["z_mm"]
            )
            for e in errs:
                if e not in all_errors:
                    all_errors.append(e)

        quality_ok = len(all_errors) == 0
        session = PreviewSession(
            str(uuid.uuid4()), command, matched, quality_ok, all_errors
        )
        self.store[session.session_id] = session

        return {
            "status": "preview_ready" if quality_ok else "failed_quality_check",
            "session_id": session.session_id,
            "command": command.model_dump(),
            "matched_count": len(matched),
            "summary": self._generate_summary(command, len(matched), all_errors),
        }

    async def execute_apply(
        self, session_id: str, output_path: str = "result.ifc"
    ) -> dict[str, Any]:
        session = self.store.get(session_id)
        if not session:
            return {"status": "session_not_found"}

        if not session.quality_ok:
            return {
                "status": "failed_quality_check",
                "summary": "품질 검증을 통과하지 못한 명령은 적용할 수 없습니다.",
                "errors": session.quality_errors,
            }

        command = session.command
        model = self.query_engine.get_model()

        if command.command_type == LLM3DCommandType.CREATE:
            try:
                return await self._execute_create_apply(session_id, output_path)
            finally:
                self.store.pop(session_id, None)

        applied_count = 0
        try:
            for item in session.matched:
                element = model.by_guid(item["global_id"])
                if not element:
                    continue

                if command.command_type == LLM3DCommandType.DELETE:
                    if delete_element(model, element):
                        applied_count += 1
                    continue

                changes = command.changes
                if not changes:
                    continue

                applied_any = False
                if changes.width_mm:
                    if modify_thickness(element, changes.width_mm.model_dump()):
                        applied_any = True
                if changes.height_mm:
                    if modify_height(element, changes.height_mm.model_dump()):
                        applied_any = True
                if changes.position_mm:
                    if modify_position(element, changes.position_mm.model_dump()):
                        applied_any = True
                if changes.material:
                    if modify_material(model, element, changes.material.model_dump()):
                        applied_any = True
                if changes.rotation_deg is not None:
                    if modify_rotation(model, element, changes.rotation_deg):
                        applied_any = True
                if changes.face_offset_mm is not None:
                    if modify_face_offset(
                        element, changes.face_offset_mm, command.target.direction or ""
                    ):
                        applied_any = True

                if applied_any:
                    applied_count += 1

            model.write(output_path)
            return {
                "status": "applied",
                "applied_count": applied_count,
                "summary": f"{applied_count}개 요소 반영 완료",
            }
        finally:
            self.store.pop(session_id, None)

    async def _execute_create_preview(self, command: LLM3DCommand) -> dict[str, Any]:
        ci = command.create_info
        if not ci:
            return {"status": "error", "message": "CREATE info missing"}

        model = self.query_engine.get_model()
        from .utils import normalize_storey_name

        target_name = normalize_storey_name(ci.storey or "1F")
        storeys = [
            s
            for s in model.by_type("IfcBuildingStorey")
            if target_name.lower() in (s.Name or "").lower()
        ]
        target_storey = storeys[0] if storeys else model.by_type("IfcBuildingStorey")[0]

        start_point = (
            ci.start_point.model_dump()
            if ci.start_point
            else {"x": 0.0, "y": 0.0, "z": 0.0}
        )

        session = PreviewSession(
            session_id=str(uuid.uuid4()),
            command=command,
            matched=[
                {
                    "create_info": ci.model_dump(),
                    "storey_guid": target_storey.GlobalId,
                    "start_point": start_point,
                }
            ],
            quality_ok=True,
        )
        self.store[session.session_id] = session
        return {
            "status": "preview_ready",
            "session_id": session.session_id,
            "command": command.model_dump(),
            "summary": f"{target_storey.Name}에 {ci.element_type} 생성 준비 완료",
        }

    async def _execute_create_apply(
        self, session_id: str, output_path: str
    ) -> dict[str, Any]:
        session = self.store.get(session_id)
        if not session:
            return {"status": "error", "summary": "세션을 찾을 수 없습니다."}
        model = self.query_engine.get_model()
        info = session.matched[0]
        ci = info["create_info"]
        ci["start_point"] = info["start_point"]
        storey = model.by_guid(info["storey_guid"])

        from ai_authoring.engine_3d import create_roof, create_generic_element

        etype = ci["element_type"]
        if etype == LLM3DElementType.WALL:
            entity = create_wall(model, storey, ci)
        elif etype == LLM3DElementType.SLAB:
            entity = create_slab(model, storey, ci)
        elif etype == LLM3DElementType.ROOF:
            entity = create_roof(model, storey, ci)
        else:
            entity = create_generic_element(model, storey, etype, ci)

        if entity:
            model.write(output_path)
            return {
                "status": "applied",
                "created_id": entity.GlobalId,
                "summary": f"신규 {etype} 생성 완료",
            }
        return {"status": "error", "summary": "생성 실패"}

    def _generate_summary(self, command, count, errors):
        if errors:
            return f"품질 검증 실패: {errors[0]}"
        return f"[{command.command_type.value}] {count}개 요소 준비 완료"