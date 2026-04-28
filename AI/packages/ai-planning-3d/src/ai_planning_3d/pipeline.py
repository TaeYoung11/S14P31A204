import uuid
import logging
from typing import Any
import ifcopenshell
from .engine import LLM3DEngine
from .command import LLM3DCommand, LLM3DCommandType, LLM3DElementType, LLM3DPoint3D
# ai_authoring 공용 패키지에서 검색 엔진 및 유틸리티 참조
from ai_authoring.query_engine import IFCQueryEngine
from ai_authoring.utils import normalize_storey_name
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
    create_roof,
    create_generic_element,
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

    def _model_units_to_mm(self, value: float) -> float:
        model = self.query_engine.get_model()
        if not model:
            return value
        for unit in model.by_type("IfcSIUnit"):
            if getattr(unit, "UnitType", None) != "LENGTHUNIT":
                continue
            prefix = getattr(unit, "Prefix", None)
            if prefix == "MILLI":
                return value
            if prefix == "CENTI":
                return value * 10.0
            if prefix == "DECI":
                return value * 100.0
            if prefix is None:
                return value * 1000.0
        return value

    def _storey_elevation_mm(self, storey: ifcopenshell.entity_instance) -> float:
        elevation = getattr(storey, "Elevation", None)
        if elevation is not None:
            return self._model_units_to_mm(float(elevation))
        placement = getattr(storey, "ObjectPlacement", None)
        if placement and placement.is_a("IfcLocalPlacement"):
            relative = getattr(placement, "RelativePlacement", None)
            location = getattr(relative, "Location", None) if relative else None
            coords = tuple(getattr(location, "Coordinates", ()) or ())
            if len(coords) >= 3:
                return self._model_units_to_mm(float(coords[2]))
        return 0.0

    def _placement_xyz_mm(
        self,
        element: ifcopenshell.entity_instance,
    ) -> tuple[float, float, float]:
        placement = getattr(element, "ObjectPlacement", None)
        if not placement or not placement.is_a("IfcLocalPlacement"):
            return (0.0, 0.0, 0.0)
        relative = getattr(placement, "RelativePlacement", None)
        location = getattr(relative, "Location", None) if relative else None
        coords = tuple(getattr(location, "Coordinates", ()) or ())
        while len(coords) < 3:
            coords += (0.0,)
        return tuple(self._model_units_to_mm(float(v)) for v in coords[:3])

    def _element_size_mm(self, element: ifcopenshell.entity_instance) -> tuple[float, float, float]:
        representation = getattr(element, "Representation", None)
        if not representation:
            return (0.0, 0.0, 0.0)
        for rep in getattr(representation, "Representations", []) or []:
            if getattr(rep, "RepresentationIdentifier", None) != "Body":
                continue
            for item in getattr(rep, "Items", []) or []:
                if item.is_a("IfcExtrudedAreaSolid"):
                    profile = getattr(item, "SweptArea", None)
                    if profile and profile.is_a("IfcRectangleProfileDef"):
                        return (
                            self._model_units_to_mm(float(profile.XDim)),
                            self._model_units_to_mm(float(profile.YDim)),
                            self._model_units_to_mm(float(item.Depth)),
                        )
                if item.is_a("IfcFacetedBrep"):
                    return self._brep_size_mm(item)
        return (0.0, 0.0, 0.0)

    def _brep_size_mm(
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
                        xs.append(self._model_units_to_mm(float(coords[0])))
                        ys.append(self._model_units_to_mm(float(coords[1])))
                        zs.append(self._model_units_to_mm(float(coords[2])))
        if not xs or not ys or not zs:
            return (0.0, 0.0, 0.0)
        return (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))

    def _storey_elements(self, storey: ifcopenshell.entity_instance) -> list[Any]:
        elements: list[Any] = []
        for rel in getattr(storey, "ContainsElements", []) or []:
            elements.extend(list(getattr(rel, "RelatedElements", []) or []))
        return elements

    def _bbox_for_elements(self, elements: list[Any]) -> dict[str, float] | None:
        xs: list[float] = []
        ys: list[float] = []
        zs: list[float] = []
        for element in elements:
            x, y, z = self._placement_xyz_mm(element)
            sx, sy, sz = self._element_size_mm(element)
            xs.extend([x - sx / 2.0, x + sx / 2.0])
            ys.extend([y - sy / 2.0, y + sy / 2.0])
            zs.extend([z, z + sz])
        if not xs or not ys or not zs:
            return None
        return {
            "min_x": min(xs),
            "max_x": max(xs),
            "min_y": min(ys),
            "max_y": max(ys),
            "min_z": min(zs),
            "max_z": max(zs),
        }

    def _storey_bbox_mm(self, storey: ifcopenshell.entity_instance) -> dict[str, float] | None:
        return self._bbox_for_elements(self._storey_elements(storey))

    def _model_bbox_mm(self) -> dict[str, float] | None:
        model = self.query_engine.get_model()
        if not model:
            return None
        products = [
            product
            for product in model.by_type("IfcProduct")
            if getattr(product, "Representation", None)
        ]
        return self._bbox_for_elements(products)

    def _infer_create_geometry(
        self,
        create_info: dict[str, Any],
        target_storey: ifcopenshell.entity_instance,
    ) -> dict[str, Any]:
        storey_bbox = self._storey_bbox_mm(target_storey)
        bbox = storey_bbox or self._model_bbox_mm()
        if not bbox:
            return {
                "start_point": create_info.get("start_point") or {"x": 0.0, "y": 0.0, "z": 0.0},
            }

        min_x, max_x = bbox["min_x"], bbox["max_x"]
        min_y, max_y = bbox["min_y"], bbox["max_y"]
        center_x = (min_x + max_x) / 2.0
        center_y = (min_y + max_y) / 2.0
        span_x = max(max_x - min_x, 3000.0)
        span_y = max(max_y - min_y, 3000.0)
        element_type = str(create_info.get("element_type"))
        storey_z = self._storey_elevation_mm(target_storey)

        if element_type == LLM3DElementType.ROOF:
            return {
                "start_point": {
                    "x": center_x,
                    "y": center_y,
                    "z": storey_z,
                },
                "length_mm": max(span_x * 1.05, 4000.0),
                "width_mm": max(span_y * 1.05, 3000.0),
                "ridge_height_mm": max(float(create_info.get("ridge_height_mm") or 1200.0), 1200.0),
            }

        direction = str(create_info.get("direction") or "North").lower()
        wall_length = span_x if direction in ("north", "south") else span_y
        start_point = {"x": center_x, "y": center_y, "z": storey_z}
        offset = 100.0
        if direction == "north":
            start_point["y"] = max_y + offset
        elif direction == "south":
            start_point["y"] = min_y - offset
        elif direction == "east":
            start_point["x"] = max_x + offset
        elif direction == "west":
            start_point["x"] = min_x - offset

        return {
            "start_point": start_point,
            "length_mm": max(float(create_info.get("length_mm") or wall_length), 3000.0),
        }

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
            summary = self.query_engine.get_last_query_reason() or "대상 요소를 찾을 수 없습니다."
            return {
                "status": "not_found",
                "summary": summary,
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
        if not model:
            return {
                "status": "error",
                "summary": "IFC 모델이 로드되지 않아 적용할 수 없습니다.",
            }

        if command.command_type == LLM3DCommandType.CREATE:
            try:
                return await self._execute_create_apply(session_id, output_path)
            finally:
                self.store.pop(session_id, None)

        applied_count = 0
        missing_ids: list[str] = []
        failed_ids: list[str] = []
        try:
            for item in session.matched:
                element = model.by_guid(item["global_id"])
                if not element:
                    missing_ids.append(item["global_id"])
                    continue

                if command.command_type == LLM3DCommandType.DELETE:
                    if delete_element(model, element):
                        applied_count += 1
                    else:
                        failed_ids.append(item["global_id"])
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
                else:
                    failed_ids.append(item["global_id"])

            if applied_count == 0:
                return {
                    "status": "not_applied",
                    "applied_count": 0,
                    "summary": self._generate_apply_failure_summary(
                        command,
                        missing_ids,
                        failed_ids,
                    ),
                    "missing_ids": missing_ids,
                    "failed_ids": failed_ids,
                }
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
        if not model:
            return {"status": "error", "message": "IFC 모델이 로드되지 않았습니다."}
        # 1. 층(Storey) 매칭 로직 (ai_authoring.utils에서 가져온 함수 사용)
        target_name = normalize_storey_name(ci.storey or "1F")
        storeys = [
            s
            for s in model.by_type("IfcBuildingStorey")
            if target_name.lower() in (s.Name or "").lower()
        ]
        target_storey = storeys[0] if storeys else model.by_type("IfcBuildingStorey")[0]

        ci_dump = ci.model_dump()
        inferred = self._infer_create_geometry(ci_dump, target_storey)
        ci_dump.update({k: v for k, v in inferred.items() if v is not None})
        start_point = ci_dump["start_point"]

        ci.start_point = LLM3DPoint3D(**start_point)
        if ci_dump.get("length_mm") is not None:
            ci.length_mm = ci_dump["length_mm"]
        if ci_dump.get("width_mm") is not None:
            ci.width_mm = ci_dump["width_mm"]
        if ci_dump.get("ridge_height_mm") is not None:
            ci.ridge_height_mm = ci_dump["ridge_height_mm"]

        session = PreviewSession(
            session_id=str(uuid.uuid4()),
            command=command,
            matched=[
                {
                    "create_info": ci_dump,
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

    def _generate_apply_failure_summary(
        self,
        command: LLM3DCommand,
        missing_ids: list[str],
        failed_ids: list[str],
    ) -> str:
        target = command.target
        target_desc = (
            f"{target.element_type}"
            f" 층={target.storey or '-'}"
            f" 공간={target.space_name or '-'}"
            f" 방향={target.direction or '-'}"
        )
        if missing_ids:
            return (
                "미리보기 이후 대상 요소가 IFC 모델에서 사라져 적용하지 못했습니다 "
                f"({target_desc}, missing={len(missing_ids)})."
            )
        if failed_ids:
            return (
                "대상은 찾았지만 요청한 수정 함수가 처리할 수 있는 geometry/material 구조가 "
                f"아니어서 0개 반영되었습니다 ({target_desc})."
            )
        return f"적용할 대상 변경 사항이 없습니다 ({target_desc})."
