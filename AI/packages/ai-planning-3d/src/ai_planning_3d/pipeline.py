import uuid
import logging
import re
from typing import Any
import ifcopenshell
from .engine import LLM3DEngine
from .command import LLM3DCommand, LLM3DCommandType, LLM3DElementType, LLM3DPoint3D

# ai_authoring 공용 패키지에서 검색 엔진 및 유틸리티 참조
from ai_authoring.query_engine import IFCQueryEngine
from ai_authoring.utils import normalize_storey_name
from ai_authoring.llm3d_apply import apply_llm3d_modify_delete_to_ifc
from ai_authoring.engine_3d import (
    create_wall,
    create_slab,
    create_roof,
    create_stair_preset,
    create_generic_element,
)
import ai_authoring.operations  # noqa: F401
from ai_authoring.operations.registry import get as get_operation

# 검증 모듈 및 컨텍스트 추출기 임포트
from .clarification import ClarificationGenerator, ClarificationQuestion
from .context_extractor import IFCContextExtractor
from .validators import (
    CollisionValidator,
    CollisionResult,
    StructuralSafetyValidator,
    StructuralCheckResult,
)
from .query.adjacency import AdjacencyQueryEngine, AdjacencyResult

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# 세션 / 요약 데이터 클래스
# ──────────────────────────────────────────────────────────────────────────────


class PreviewSession:
    def __init__(
        self,
        session_id: str,
        command: LLM3DCommand,
        matched: list[dict[str, Any]],
        quality_ok: bool = True,
        quality_errors: list[str] | None = None,
        # 검증 결과 필드
        collision_warnings: list[str] | None = None,
        structural_warnings: list[str] | None = None,
        structural_blocked: bool = False,
    ):
        self.session_id = session_id
        self.command = command
        self.matched = matched
        self.quality_ok = quality_ok
        self.quality_errors = quality_errors or []
        # 충돌/구조 검증 결과 — 파이프라인 리포팅용
        self.collision_warnings: list[str] = collision_warnings or []
        self.structural_warnings: list[str] = structural_warnings or []
        self.structural_blocked: bool = structural_blocked
        self.clarification_questions: list[ClarificationQuestion] = []


# ──────────────────────────────────────────────────────────────────────────────
# 파이프라인 메인 클래스
# ──────────────────────────────────────────────────────────────────────────────


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

        # 검증기 및 인접 탐색 엔진 초기화
        self._scale = self._detect_scale_factor(ifc_model)
        self._collision_validator = (
            CollisionValidator(ifc_model, scale_to_mm=self._scale) if ifc_model else None
        )
        self._structural_validator = (
            StructuralSafetyValidator(ifc_model, scale_to_mm=self._scale) if ifc_model else None
        )
        self._adjacency_engine = (
            AdjacencyQueryEngine(ifc_model, scale_to_mm=self._scale) if ifc_model else None
        )

        # IFC 컨텍스트 추출 (초기화 시 1회 캐싱)
        _ctx = IFCContextExtractor(ifc_model, scale_to_mm=self._scale).extract()
        self._ifc_context_text: str | None = _ctx.context_text if _ctx else None

    @staticmethod
    def split_chat_commands(user_text: str) -> list[str]:
        decimal_dot = "__BATANG_DECIMAL_DOT__"
        user_text = re.sub(r"(?<=\d)\.(?=\d)", decimal_dot, user_text)
        normalized = re.sub(
            r"((?:만들|생성|추가|배치|넣|달|바꾸|변경|수정|삭제|제거|없애|지우|빼))고(?=\s|[,.;])\s*",
            lambda match: f"{LLM3DPipeline._complete_connected_verb(match.group(1))}.\n",
            user_text,
        )
        parts = re.split(r"(?:그리고|\.|,|\n|;)", normalized)
        commands: list[str] = []
        for part in parts:
            part = part.replace(decimal_dot, ".").strip()
            if part:
                commands.extend(LLM3DPipeline._expand_direction_pair_command(part))
        return LLM3DPipeline._carry_forward_command_subjects(commands or [user_text])

    @staticmethod
    def _carry_forward_command_subjects(commands: list[str]) -> list[str]:
        contextualized: list[str] = []
        previous_subject: str | None = None
        for command in commands:
            next_command = command
            if previous_subject and LLM3DPipeline._needs_previous_subject(command):
                next_command = f"{previous_subject} {command}"
            contextualized.append(next_command)

            subject = LLM3DPipeline._extract_command_subject(next_command)
            if subject:
                previous_subject = subject
        return contextualized

    @staticmethod
    def _needs_previous_subject(command: str) -> bool:
        if LLM3DPipeline._extract_command_subject(command):
            return False
        return any(
            word in command
            for word in (
                "회전",
                "돌려",
                "길이",
                "높이",
                "두께",
                "색",
                "색상",
                "재질",
                "오른쪽으로",
                "왼쪽으로",
            )
        )

    @staticmethod
    def _extract_command_subject(command: str) -> str | None:
        first_change_at = len(command)
        for word in (
            "길이",
            "높이",
            "두께",
            "색상",
            "색",
            "재질",
            "회전",
            "돌려",
            "오른쪽으로",
            "왼쪽으로",
        ):
            index = command.find(word)
            if index >= 0:
                first_change_at = min(first_change_at, index)
        candidate = command[:first_change_at].strip()
        candidate = re.sub(r"\s*(을|를|은|는|이|가|의|전체)$", "", candidate).strip()
        if not candidate:
            return None
        if not any(
            word in candidate.lower()
            for word in (
                "지붕",
                "roof",
                "벽",
                "wall",
                "기둥",
                "column",
                "보",
                "beam",
                "슬래브",
                "바닥",
                "slab",
                "문",
                "door",
                "창문",
                "window",
                "계단",
                "stair",
                "층",
                "거실",
                "침실",
                "화장실",
                "욕실",
            )
        ):
            return None
        return candidate

    @staticmethod
    def _complete_connected_verb(verb: str) -> str:
        endings = {
            "만들": "만들어줘",
            "생성": "생성해줘",
            "추가": "추가해줘",
            "배치": "배치해줘",
            "넣": "넣어줘",
            "달": "달아줘",
            "바꾸": "바꿔줘",
            "변경": "변경해줘",
            "수정": "수정해줘",
            "삭제": "삭제해줘",
            "제거": "제거해줘",
            "없애": "없애줘",
            "지우": "지워줘",
            "빼": "빼줘",
        }
        return endings.get(verb, verb)

    @staticmethod
    def _expand_direction_pair_command(user_text: str) -> list[str]:
        if "씩" not in user_text:
            return [user_text]
        direction_words = re.findall(r"(남쪽|북쪽|동쪽|서쪽|남측|북측|동측|서측)", user_text)
        if len(direction_words) < 2:
            return [user_text]
        element = "창문" if "창문" in user_text else "문" if "문" in user_text else None
        if element is None:
            return [user_text]
        verb_match = re.search(r"(만들|생성|추가|배치|넣|달)\S*", user_text)
        verb = verb_match.group(0) if verb_match else "만들어줘"
        first_direction_at = min(user_text.index(direction) for direction in direction_words)
        prefix = user_text[:first_direction_at].strip()
        prefix = re.sub(r"\s*에$", "", prefix)
        return [
            " ".join(part for part in (prefix, f"{direction}에", element, "1개", verb) if part)
            for direction in direction_words
        ]

    @staticmethod
    def _requested_repeat_count(user_text: str) -> int:
        match = re.search(r"(\d+)\s*개", user_text)
        if match:
            return max(1, min(int(match.group(1)), 20))
        korean_counts = {
            "한": 1,
            "하나": 1,
            "두": 2,
            "둘": 2,
            "세": 3,
            "셋": 3,
            "네": 4,
            "넷": 4,
        }
        for token, count in korean_counts.items():
            if re.search(rf"{token}\s*개", user_text):
                return count
        return 1

    def _offset_repeated_create_session(
        self,
        session_id: str,
        copy_index: int,
        repeat_count: int,
    ) -> None:
        if repeat_count <= 1:
            return
        session = self.store.get(session_id)
        if not session or session.command.command_type != LLM3DCommandType.CREATE:
            return
        command_ci = session.command.create_info
        if not command_ci or not self._is_door_window(command_ci.element_type):
            return
        if not session.matched:
            return

        info = session.matched[0]
        ci = info.get("create_info") or {}
        start_point = dict(info.get("start_point") or ci.get("start_point") or {})
        if not start_point:
            return

        length = float(ci.get("length_mm") or 1000.0)
        spacing = max(length + 300.0, 900.0)
        offset = (copy_index - (repeat_count - 1) / 2.0) * spacing
        direction = str(ci.get("direction") or "").lower()
        model = self.query_engine.get_model()
        host_wall = None
        if model and ci.get("host_wall_global_id"):
            host_wall = model.by_guid(ci["host_wall_global_id"])
        if host_wall is not None:
            fraction = (copy_index + 1) / (repeat_count + 1)
            target_storey = None
            target_name = normalize_storey_name(str(ci.get("storey") or "1F"))
            for storey in model.by_type("IfcBuildingStorey"):
                if target_name.lower() in (storey.Name or "").lower():
                    target_storey = storey
                    break
            sill_height_mm = float(ci.get("sill_height_mm") or 0.0)
            opening_z_mm = float(start_point.get("z", 0.0)) + sill_height_mm
            wall_point = self._point_on_host_wall(
                host_wall,
                fraction,
                start_point,
                storey=target_storey,
                opening_length_mm=float(ci.get("length_mm") or 0.0),
                opening_z_mm=opening_z_mm,
                opening_height_mm=float(ci.get("height_mm") or 0.0),
            )
            if wall_point:
                start_point = wall_point
            elif direction in {"east", "west"}:
                start_point["y"] = float(start_point.get("y", 0.0)) + offset
            else:
                start_point["x"] = float(start_point.get("x", 0.0)) + offset
        elif direction in {"east", "west"}:
            start_point["y"] = float(start_point.get("y", 0.0)) + offset
        else:
            start_point["x"] = float(start_point.get("x", 0.0)) + offset

        info["start_point"] = start_point
        ci["start_point"] = start_point
        command_ci.start_point = LLM3DPoint3D(**start_point)

    async def execute_chat_to_ifc(
        self,
        user_text: str,
        output_path: str,
    ) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        record_index = 1
        for command_text in self.split_chat_commands(user_text):
            repeat_count = self._requested_repeat_count(command_text)
            for copy_index in range(repeat_count):
                preview = await self.execute_preview(command_text)
                if preview.get("status") == "preview_ready":
                    self._offset_repeated_create_session(
                        str(preview["session_id"]),
                        copy_index,
                        repeat_count,
                    )
                    if repeat_count > 1 and preview.get("command"):
                        session = self.store.get(str(preview["session_id"]))
                        if session:
                            preview["command"] = session.command.model_dump()

                instruction = command_text
                if repeat_count > 1:
                    instruction = f"{command_text} ({copy_index + 1}/{repeat_count})"

                record: dict[str, Any] = {
                    "index": record_index,
                    "instruction": instruction,
                    "preview_status": preview.get("status"),
                    "summary": preview.get("summary"),
                    "collision_warnings": preview.get("collision_warnings", []),
                    "structural_warnings": preview.get("structural_warnings", []),
                    "matched_elements": preview.get("matched_elements", []),
                    "command": preview.get("command"),
                    "apply_status": "not_applied",
                    "ifc_written": False,
                    "output_ifc": None,
                }
                record_index += 1
                if preview.get("status") != "preview_ready":
                    record["apply_status"] = "preview_blocked"
                    record["not_applied_reason"] = (
                        preview.get("summary")
                        or "Preview did not reach preview_ready, so IFC was not written."
                    )
                    records.append(record)
                    continue

                result = await self.execute_apply(
                    str(preview["session_id"]),
                    output_path=output_path,
                )
                record["apply_status"] = result.get("status")
                record["apply_summary"] = result.get("summary")
                if result.get("status") == "applied":
                    record["ifc_written"] = True
                    record["output_ifc"] = output_path
                else:
                    record["not_applied_reason"] = result.get("summary") or "IFC was not written."
                records.append(record)
        return records

    # ── 단위 변환 헬퍼 ────────────────────────────────────────────────────

    def _detect_scale_factor(self, model: ifcopenshell.file | None) -> float:
        """IFC 모델의 LENGTHUNIT 프리픽스로부터 native → mm 변환 배율을 반환한다."""
        if not model:
            return 1.0
        for unit in model.by_type("IfcSIUnit"):
            if getattr(unit, "UnitType", None) != "LENGTHUNIT":
                continue
            prefix = getattr(unit, "Prefix", None)
            if prefix == "MILLI":
                return 1.0
            if prefix == "CENTI":
                return 10.0
            if prefix is None:
                return 1000.0
        return 1.0

    def _model_units_to_mm(self, value: float) -> float:
        return value * self._scale

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
                if item.is_a("IfcBoundingBox"):
                    return (
                        self._model_units_to_mm(float(item.XDim)),
                        self._model_units_to_mm(float(item.YDim)),
                        self._model_units_to_mm(float(item.ZDim)),
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

    def _storey_spaces(self, storey: ifcopenshell.entity_instance) -> list[Any]:
        spaces: list[Any] = []
        for rel in getattr(storey, "ContainsElements", []) or []:
            for element in getattr(rel, "RelatedElements", []) or []:
                if element.is_a("IfcSpace"):
                    spaces.append(element)
        for rel in getattr(storey, "IsDecomposedBy", []) or []:
            for element in getattr(rel, "RelatedObjects", []) or []:
                if element.is_a("IfcSpace"):
                    spaces.append(element)
        return spaces

    def _storey_walls(self, storey: ifcopenshell.entity_instance) -> list[Any]:
        walls: list[Any] = []
        for element in self._storey_elements(storey):
            if element.is_a("IfcWall"):
                walls.append(element)
        for space in self._storey_spaces(storey):
            for rel in getattr(space, "ContainsElements", []) or []:
                for element in getattr(rel, "RelatedElements", []) or []:
                    if element.is_a("IfcWall") and element not in walls:
                        walls.append(element)
        return walls

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
            "min_x": min(xs), "max_x": max(xs),
            "min_y": min(ys), "max_y": max(ys),
            "min_z": min(zs), "max_z": max(zs),
        }

    def _storey_bbox_mm(self, storey: ifcopenshell.entity_instance) -> dict[str, float] | None:
        return self._bbox_for_elements(self._storey_elements(storey))

    def _space_bbox_mm(
        self,
        storey: ifcopenshell.entity_instance,
        space_name: str | None,
    ) -> dict[str, float] | None:
        if not space_name:
            return None
        wanted = space_name.replace(" ", "").lower()
        model = self.query_engine.get_model()
        spaces = self._storey_spaces(storey) or model.by_type("IfcSpace")
        candidates: list[Any] = []
        for space in spaces:
            name = str(getattr(space, "Name", "") or "")
            normalized = name.replace(" ", "").lower()
            if wanted in normalized or normalized in wanted:
                candidates.append(space)
        if not candidates and wanted == "livingroom":
            candidates = [
                space
                for space in spaces
                if "living" in str(getattr(space, "Name", "") or "").lower()
            ]
        if not candidates:
            return None
        for space in candidates:
            placement = self._placement_xyz_mm(space)
            representation = getattr(space, "Representation", None)
            for rep in getattr(representation, "Representations", []) or []:
                for item in getattr(rep, "Items", []) or []:
                    if item.is_a("IfcBoundingBox"):
                        x, y, z = placement
                        sx = self._model_units_to_mm(float(item.XDim))
                        sy = self._model_units_to_mm(float(item.YDim))
                        sz = self._model_units_to_mm(float(item.ZDim))
                        return {
                            "min_x": x,
                            "max_x": x + sx,
                            "min_y": y,
                            "max_y": y + sy,
                            "min_z": z,
                            "max_z": z + sz,
                        }
        return self._bbox_for_elements(candidates)

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

    @staticmethod
    def _is_door_window(element_type: Any) -> bool:
        return str(element_type) in {
            str(LLM3DElementType.DOOR),
            str(LLM3DElementType.WINDOW),
        }

    def _wall_length_model_units(self, wall: Any) -> float:
        representation = getattr(wall, "Representation", None)
        if not representation:
            return 0.0
        for rep in getattr(representation, "Representations", []) or []:
            if getattr(rep, "RepresentationIdentifier", None) != "Body":
                continue
            for item in getattr(rep, "Items", []) or []:
                while item.is_a("IfcBooleanResult"):
                    item = item.FirstOperand
                if item.is_a("IfcExtrudedAreaSolid"):
                    swept = getattr(item, "SweptArea", None)
                    if swept and swept.is_a("IfcRectangleProfileDef"):
                        return max(float(swept.XDim), float(swept.YDim))
        return 0.0

    def _wall_axis_info_mm(
        self,
        wall: Any,
    ) -> dict[str, Any] | None:
        placement = getattr(wall, "ObjectPlacement", None)
        if not placement or not placement.is_a("IfcLocalPlacement"):
            return None
        relative = getattr(placement, "RelativePlacement", None)
        location = getattr(relative, "Location", None) if relative else None
        coords = tuple(getattr(location, "Coordinates", ()) or ())
        if len(coords) < 2:
            return None

        ref = getattr(relative, "RefDirection", None)
        rdx, rdy = (1.0, 0.0)
        if ref:
            rdx = float(ref.DirectionRatios[0])
            rdy = float(ref.DirectionRatios[1])

        ew_wall = True
        representation = getattr(wall, "Representation", None)
        if representation:
            for rep in getattr(representation, "Representations", []) or []:
                if getattr(rep, "RepresentationIdentifier", None) != "Body":
                    continue
                for item in getattr(rep, "Items", []) or []:
                    while item.is_a("IfcBooleanResult"):
                        item = item.FirstOperand
                    if item.is_a("IfcExtrudedAreaSolid"):
                        swept = getattr(item, "SweptArea", None)
                        if swept and swept.is_a("IfcRectangleProfileDef"):
                            ew_wall = float(swept.XDim) >= float(swept.YDim)
                            break

        if ew_wall:
            axis_x, axis_y = rdx, rdy
        else:
            axis_x, axis_y = -rdy, rdx
        length = self._wall_length_model_units(wall) * self._scale
        origin_x = float(coords[0]) * self._scale
        origin_y = float(coords[1]) * self._scale
        return {
            "origin_x": origin_x,
            "origin_y": origin_y,
            "axis_x": axis_x,
            "axis_y": axis_y,
            "length": length,
            "center_x": origin_x + axis_x * length / 2.0,
            "center_y": origin_y + axis_y * length / 2.0,
        }

    def _point_on_host_wall(
        self,
        wall: Any,
        fraction: float,
        base_point: dict[str, Any],
        storey: ifcopenshell.entity_instance | None = None,
        opening_length_mm: float = 0.0,
        opening_z_mm: float | None = None,
        opening_height_mm: float = 0.0,
    ) -> dict[str, Any] | None:
        axis = self._wall_axis_info_mm(wall)
        if not axis or axis["length"] <= 0.0:
            return None
        fraction = min(max(fraction, 0.05), 0.95)
        if storey is not None and opening_length_mm > 0.0:
            fraction = self._clear_host_wall_fraction(
                wall,
                storey,
                axis,
                fraction,
                opening_length_mm,
                opening_z_mm,
                opening_height_mm,
            )
        point = dict(base_point)
        point["x"] = axis["origin_x"] + axis["axis_x"] * axis["length"] * fraction
        point["y"] = axis["origin_y"] + axis["axis_y"] * axis["length"] * fraction
        return point

    def _clear_host_wall_fraction(
        self,
        host_wall: Any,
        storey: ifcopenshell.entity_instance,
        host_axis: dict[str, Any],
        desired_fraction: float,
        opening_length_mm: float,
        opening_z_mm: float | None,
        opening_height_mm: float,
    ) -> float:
        length = float(host_axis["length"])
        desired_u = length * desired_fraction
        half_opening = opening_length_mm / 2.0
        clearance = max(200.0, half_opening + 150.0)
        usable_min = half_opening + 100.0
        usable_max = length - half_opening - 100.0
        if usable_min >= usable_max:
            return desired_fraction

        ax, ay = float(host_axis["axis_x"]), float(host_axis["axis_y"])
        nx, ny = -ay, ax
        ox, oy = float(host_axis["origin_x"]), float(host_axis["origin_y"])
        host_z = self._placement_xyz_mm(host_wall)[2]
        _, _, host_height = self._element_size_mm(host_wall)
        z_min = opening_z_mm if opening_z_mm is not None else host_z
        z_max = z_min + opening_height_mm if opening_height_mm > 0.0 else host_z + host_height

        blocked: list[tuple[float, float]] = []
        for wall in self._storey_walls(storey):
            if wall == host_wall:
                continue
            name = str(getattr(wall, "Name", "") or "").lower()
            if any(token in name for token in ("rail", "fence")):
                continue
            other_axis = self._wall_axis_info_mm(wall)
            if not other_axis or other_axis["length"] <= 0.0:
                continue
            other_z = self._placement_xyz_mm(wall)[2]
            _, _, other_height = self._element_size_mm(wall)
            if opening_z_mm is not None and other_height > 0.0:
                if other_z + other_height < z_min or other_z > z_max:
                    continue

            points = (
                (other_axis["origin_x"], other_axis["origin_y"]),
                (
                    other_axis["origin_x"] + other_axis["axis_x"] * other_axis["length"],
                    other_axis["origin_y"] + other_axis["axis_y"] * other_axis["length"],
                ),
            )
            projections: list[tuple[float, float]] = []
            for px, py in points:
                dx, dy = float(px) - ox, float(py) - oy
                projections.append((dx * ax + dy * ay, dx * nx + dy * ny))
            u_values = [p[0] for p in projections]
            v_values = [p[1] for p in projections]
            if min(v_values) > 300.0 or max(v_values) < -300.0:
                continue
            center_u = (min(u_values) + max(u_values)) / 2.0
            if center_u < -clearance or center_u > length + clearance:
                continue
            blocked.append((center_u - clearance, center_u + clearance))

        if not blocked:
            return desired_fraction

        free: list[tuple[float, float]] = []
        cursor = usable_min
        for start, end in sorted(blocked):
            start = max(usable_min, start)
            end = min(usable_max, end)
            if start > cursor:
                free.append((cursor, start))
            cursor = max(cursor, end)
        if cursor < usable_max:
            free.append((cursor, usable_max))
        if not free:
            return desired_fraction
        if any(start <= desired_u <= end for start, end in free):
            return desired_fraction

        best_start, best_end = min(
            free,
            key=lambda interval: abs(((interval[0] + interval[1]) / 2.0) - desired_u),
        )
        return ((best_start + best_end) / 2.0) / length

    def _find_directional_host_wall(
        self,
        storey: ifcopenshell.entity_instance,
        direction: str | None,
        min_height_mm: float = 0.0,
        preferred_name_tokens: tuple[str, ...] = (),
    ) -> Any | None:
        direction = (direction or "").lower()
        if direction not in {"north", "south", "east", "west"}:
            return None
        walls = []
        for wall in self._storey_walls(storey):
            name = str(getattr(wall, "Name", "") or "").lower()
            if any(token in name for token in ("rail", "fence")):
                continue
            _, _, wall_height = self._element_size_mm(wall)
            if min_height_mm > 0.0 and wall_height > 0.0 and wall_height < min_height_mm:
                continue
            walls.append(wall)
        direction_in_name = {
            "north": ("north", "북"),
            "south": ("south", "남"),
            "east": ("east", "동"),
            "west": ("west", "서"),
        }[direction]
        named = [
            wall for wall in walls
            if any(
                token in str(getattr(wall, "Name", "") or "").lower()
                for token in direction_in_name
            )
        ]
        if named:
            preferred = [
                wall for wall in named
                if any(
                    token in str(getattr(wall, "Name", "") or "").lower()
                    for token in preferred_name_tokens
                )
            ]
            if preferred:
                return preferred[0]
            return named[0]

        candidates: list[tuple[float, Any]] = []
        for wall in walls:
            axis = self._wall_axis_info_mm(wall)
            if not axis:
                continue
            score = axis["center_y"] if direction == "north" else -axis["center_y"]
            if direction == "east":
                score = axis["center_x"]
            elif direction == "west":
                score = -axis["center_x"]
            candidates.append((score, wall))
        if not candidates:
            return None
        return max(candidates, key=lambda item: item[0])[1]

    def _find_host_wall_in_storey(
        self,
        model: ifcopenshell.file,
        storey: ifcopenshell.entity_instance,
        host_wall_global_id: str | None,
        x_mm: float,
        y_mm: float,
    ) -> ifcopenshell.entity_instance | None:
        if host_wall_global_id:
            wall = model.by_guid(host_wall_global_id)
            return wall if wall and wall.is_a("IfcWall") else None

        best_wall, best_dist = None, 3000.0 / self._scale
        for wall in self._storey_walls(storey):
            placement = getattr(wall, "ObjectPlacement", None)
            if not placement or not placement.is_a("IfcLocalPlacement"):
                continue
            relative = getattr(placement, "RelativePlacement", None)
            location = getattr(relative, "Location", None) if relative else None
            loc = tuple(getattr(location, "Coordinates", ()) or ())
            if len(loc) < 2:
                continue
            ref = getattr(relative, "RefDirection", None) if relative else None
            rdx, rdy = (1.0, 0.0)
            ratios = tuple(getattr(ref, "DirectionRatios", ()) or ()) if ref else ()
            if len(ratios) >= 2:
                rdx = float(ratios[0])
                rdy = float(ratios[1])

            dx = (x_mm / self._scale) - float(loc[0])
            dy = (y_mm / self._scale) - float(loc[1])
            u = dx * rdx + dy * rdy
            v = dx * (-rdy) + dy * rdx
            length = self._wall_length_model_units(wall)
            if -500.0 / self._scale <= u <= length + 500.0 / self._scale:
                dist = abs(v)
                if dist < best_dist:
                    best_dist = dist
                    best_wall = wall
        return best_wall

    def _wall_local_u_mm(self, wall: Any, point: dict[str, Any]) -> float | None:
        placement = getattr(wall, "ObjectPlacement", None)
        if not placement or not placement.is_a("IfcLocalPlacement"):
            return None
        relative = getattr(placement, "RelativePlacement", None)
        location = getattr(relative, "Location", None) if relative else None
        loc = tuple(getattr(location, "Coordinates", ()) or ())
        if len(loc) < 2:
            return None
        ref = getattr(relative, "RefDirection", None) if relative else None
        ratios = tuple(getattr(ref, "DirectionRatios", ()) or ()) if ref else ()
        rdx, rdy = (1.0, 0.0)
        if len(ratios) >= 2:
            rdx = float(ratios[0])
            rdy = float(ratios[1])
        dx = (float(point.get("x", 0.0)) / self._scale) - float(loc[0])
        dy = (float(point.get("y", 0.0)) / self._scale) - float(loc[1])
        return (dx * rdx + dy * rdy) * self._scale

    def _opening_location_mm(self, opening: Any) -> tuple[float, float, float] | None:
        placement = getattr(opening, "ObjectPlacement", None)
        relative = getattr(placement, "RelativePlacement", None) if placement else None
        location = getattr(relative, "Location", None) if relative else None
        coords = tuple(getattr(location, "Coordinates", ()) or ())
        if len(coords) < 3:
            return None
        return (
            float(coords[0]) * self._scale,
            float(coords[1]) * self._scale,
            float(coords[2]) * self._scale,
        )

    def _opening_size_mm(self, opening: Any) -> tuple[float, float, float] | None:
        representation = getattr(opening, "Representation", None)
        if not representation:
            return None
        for rep in getattr(representation, "Representations", []) or []:
            for item in getattr(rep, "Items", []) or []:
                if not item or not item.is_a("IfcExtrudedAreaSolid"):
                    continue
                profile = getattr(item, "SweptArea", None)
                if profile and profile.is_a("IfcRectangleProfileDef"):
                    return (
                        float(profile.XDim) * self._scale,
                        float(profile.YDim) * self._scale,
                        float(item.Depth) * self._scale,
                    )
        return None

    def _door_window_opening_overlap_warning(
        self,
        model: ifcopenshell.file,
        host_wall: Any,
        start_point: dict[str, Any],
        opening_length_mm: float,
        opening_z_mm: float,
        opening_height_mm: float,
    ) -> str | None:
        new_u = self._wall_local_u_mm(host_wall, start_point)
        if new_u is None or opening_length_mm <= 0.0 or opening_height_mm <= 0.0:
            return None
        new_start = new_u - opening_length_mm / 2.0
        new_end = new_u + opening_length_mm / 2.0
        new_z_start = opening_z_mm
        new_z_end = opening_z_mm + opening_height_mm

        for rel in model.by_type("IfcRelVoidsElement"):
            if getattr(rel, "RelatingBuildingElement", None) != host_wall:
                continue
            opening = getattr(rel, "RelatedOpeningElement", None)
            location = self._opening_location_mm(opening)
            size = self._opening_size_mm(opening)
            if not location or not size:
                continue
            existing_u = location[0]
            existing_length = size[0]
            existing_height = size[2]
            existing_start = existing_u - existing_length / 2.0
            existing_end = existing_u + existing_length / 2.0
            existing_z_start = location[2]
            existing_z_end = location[2] + existing_height
            overlaps_u = new_start < existing_end and existing_start < new_end
            overlaps_z = new_z_start < existing_z_end and existing_z_start < new_z_end
            if overlaps_u and overlaps_z:
                wall_name = getattr(host_wall, "Name", None) or host_wall.GlobalId
                return f"{wall_name} 벽의 기존 opening과 새 문/창문 위치가 겹칩니다."
        return None

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

        if element_type == LLM3DElementType.STAIR:
            stair_bbox = self._space_bbox_mm(target_storey, create_info.get("space_name")) or bbox
            stair_min_x, stair_max_x = stair_bbox["min_x"], stair_bbox["max_x"]
            stair_min_y, stair_max_y = stair_bbox["min_y"], stair_bbox["max_y"]
            stair_span_x = max(stair_max_x - stair_min_x, 3600.0)
            stair_span_y = max(stair_max_y - stair_min_y, 1000.0)
            return {
                "start_point": {
                    "x": stair_min_x + stair_span_x * 0.50,
                    "y": stair_min_y + stair_span_y * 0.35,
                    "z": storey_z,
                },
                "length_mm": float(create_info.get("length_mm") or 3600.0),
                "width_mm": float(create_info.get("width_mm") or 1000.0),
                "height_mm": float(create_info.get("height_mm") or 3000.0),
                "step_count": int(create_info.get("step_count") or 16),
            }

        if self._is_door_window(element_type):
            opening_bbox = self._space_bbox_mm(target_storey, create_info.get("space_name")) or bbox
            min_x, max_x = opening_bbox["min_x"], opening_bbox["max_x"]
            min_y, max_y = opening_bbox["min_y"], opening_bbox["max_y"]
            center_x = (min_x + max_x) / 2.0
            center_y = (min_y + max_y) / 2.0
            direction = str(create_info.get("direction") or "North").lower()
            start_point = {"x": center_x, "y": center_y, "z": storey_z}
            if direction == "north":
                start_point["y"] = max_y
            elif direction == "south":
                start_point["y"] = min_y
            elif direction == "east":
                start_point["x"] = max_x
            elif direction == "west":
                start_point["x"] = min_x

            is_window = element_type == LLM3DElementType.WINDOW
            default_length = 1200.0 if is_window else 900.0
            default_height = 1200.0 if is_window else 2100.0
            default_sill = 900.0 if is_window else 0.0
            return {
                "start_point": start_point,
                "length_mm": float(create_info.get("length_mm") or default_length),
                "width_mm": float(create_info.get("width_mm") or 200.0),
                "height_mm": float(create_info.get("height_mm") or default_height),
                "sill_height_mm": float(create_info.get("sill_height_mm") or default_sill),
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

        length_val = float(create_info.get("length_mm") or wall_length)
        return {
            "start_point": start_point,
            "length_mm": max(length_val, 3000.0),
        }

    # execute_preview — 검증 통합

    async def execute_preview(self, user_text: str) -> dict[str, Any]:
        command = await self.engine.parse_command(user_text, ifc_context=self._ifc_context_text)
        return await self.execute_command_preview(command)

    async def execute_command_preview(self, command: LLM3DCommand) -> dict[str, Any]:
        """Run preview validation for an already parsed command object."""
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

        # ── DELETE: 내력벽 구조 차단 검사 ──────────────────────────
        if command.command_type == LLM3DCommandType.DELETE:
            structural_result = self._run_structural_delete_check(matched)
            if structural_result.blocked:
                return {
                    "status": "failed_structural_check",
                    "summary": structural_result.warnings[0],
                    "structural_warnings": structural_result.to_summary_lines(),
                    "command": command.model_dump(),
                }

        # ModelingQualityValidator 품질 검증
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

        # ── MODIFY/DELETE: 구조 경고 수집 (차단 없음) ─────────────
        if command.command_type == LLM3DCommandType.DELETE and self._structural_validator:
            session.structural_warnings = structural_result.to_summary_lines()

        return {
            "status": "preview_ready" if quality_ok else "failed_quality_check",
            "session_id": session.session_id,
            "command": command.model_dump(),
            "matched_count": len(matched),
            "matched_elements": matched,
            "summary": self._generate_summary(command, len(matched), all_errors),
            # 검증 결과 포함
            "structural_warnings": session.structural_warnings,
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

        try:
            matched_ids = [str(item.get("global_id") or "") for item in session.matched]
            return apply_llm3d_modify_delete_to_ifc(
                model=model,
                command=command.model_dump(),
                matched=session.matched,
                output_path=output_path,
                scale=self._scale,
                failure_summary=self._generate_apply_failure_summary(
                    command,
                    missing_ids=[],
                    failed_ids=matched_ids,
                ),
            )
        finally:
            self.store.pop(session_id, None)

    async def _execute_create_preview(self, command: LLM3DCommand) -> dict[str, Any]:
        ci = command.create_info
        if not ci:
            return {"status": "error", "message": "CREATE info missing"}

        model = self.query_engine.get_model()
        if not model:
            return {"status": "error", "message": "IFC 모델이 로드되지 않았습니다."}

        target_name = normalize_storey_name(ci.storey or "1F")
        storeys = [
            s
            for s in model.by_type("IfcBuildingStorey")
            if target_name.lower() in (s.Name or "").lower()
        ]
        target_storey = storeys[0] if storeys else model.by_type("IfcBuildingStorey")[0]

        ci_dump = ci.model_dump()
        inferred = self._infer_create_geometry(ci_dump, target_storey)
        explicit_create_fields = ci.model_fields_set
        for key, value in inferred.items():
            if value is not None and (
                key not in explicit_create_fields or ci_dump.get(key) in (None, "", [], {})
            ):
                ci_dump[key] = value
        start_point = ci_dump["start_point"]

        ci.start_point = LLM3DPoint3D(**start_point)
        if ci_dump.get("length_mm") is not None:
            ci.length_mm = ci_dump["length_mm"]
        if ci_dump.get("width_mm") is not None:
            ci.width_mm = ci_dump["width_mm"]
        if ci_dump.get("height_mm") is not None:
            ci.height_mm = ci_dump["height_mm"]
        if ci_dump.get("ridge_height_mm") is not None:
            ci.ridge_height_mm = ci_dump["ridge_height_mm"]
        if ci_dump.get("step_count") is not None:
            ci.step_count = ci_dump["step_count"]
        if ci_dump.get("sill_height_mm") is not None:
            ci.sill_height_mm = ci_dump["sill_height_mm"]

        if self._is_door_window(ci.element_type):
            host_wall = None
            if ci_dump.get("host_wall_global_id"):
                host_wall = self._find_host_wall_in_storey(
                    model,
                    target_storey,
                    ci_dump.get("host_wall_global_id"),
                    float(start_point.get("x", 0.0)),
                    float(start_point.get("y", 0.0)),
                )
            if host_wall is None:
                min_host_height_mm = float(ci_dump.get("height_mm") or 0.0) + float(
                    ci_dump.get("sill_height_mm") or 0.0
                )
                space_name = str(ci_dump.get("space_name") or "").lower()
                preferred_name_tokens: list[str] = []
                if "living" in space_name:
                    preferred_name_tokens.extend(("living", "liv"))
                if "bath" in space_name:
                    preferred_name_tokens.append("bath")
                if "bed" in space_name:
                    preferred_name_tokens.append("bed")
                if "entrance" in space_name:
                    preferred_name_tokens.append("entrance")
                if "hall" in space_name:
                    preferred_name_tokens.append("hall")
                host_wall = self._find_directional_host_wall(
                    target_storey,
                    ci_dump.get("direction"),
                    min_height_mm=min_host_height_mm,
                    preferred_name_tokens=tuple(preferred_name_tokens),
                )
            if host_wall is None:
                host_wall = self._find_host_wall_in_storey(
                    model,
                    target_storey,
                    None,
                    float(start_point.get("x", 0.0)),
                    float(start_point.get("y", 0.0)),
                )
            if host_wall is None:
                return {
                    "status": "needs_clarification",
                    "command": command.model_dump(),
                    "summary": "문/창문을 붙일 host wall을 찾지 못해 IFC를 생성하지 않았습니다.",
                    "clarification_questions": [],
                    "collision_warnings": [
                        "문/창문 생성에는 벽 위치 또는 host_wall_global_id가 필요합니다."
                    ],
                    "structural_warnings": [],
                }
            sill_height_mm = float(ci_dump.get("sill_height_mm") or 0.0)
            opening_length_mm = float(ci_dump.get("length_mm") or 0.0)
            opening_height_mm = float(ci_dump.get("height_mm") or 0.0)
            opening_z_mm = float(start_point.get("z", 0.0)) + sill_height_mm
            wall_point = self._point_on_host_wall(
                host_wall,
                0.5,
                start_point,
                storey=target_storey,
                opening_length_mm=opening_length_mm,
                opening_z_mm=opening_z_mm,
                opening_height_mm=opening_height_mm,
            )
            if wall_point:
                start_point = wall_point
                ci_dump["start_point"] = start_point
                ci.start_point = LLM3DPoint3D(**start_point)
            ci_dump["host_wall_global_id"] = host_wall.GlobalId
            ci.host_wall_global_id = host_wall.GlobalId
            overlap_warning = self._door_window_opening_overlap_warning(
                model,
                host_wall,
                start_point,
                opening_length_mm,
                opening_z_mm,
                opening_height_mm,
            )
            if overlap_warning:
                return {
                    "status": "failed_collision_check",
                    "command": command.model_dump(),
                    "summary": overlap_warning,
                    "collision_warnings": [overlap_warning],
                    "structural_warnings": [],
                }

        # ── 충돌 검사 ────────────────────────────────────────────
        collision_result: CollisionResult | None = None
        collision_warnings: list[str] = []
        if self._collision_validator and not self._is_door_window(ci.element_type):
            collision_result = self._collision_validator.validate(ci_dump, target_storey)
            collision_warnings = collision_result.to_summary_lines()
            if not collision_result.is_ok:
                logger.warning(f"[Pipeline] CREATE 충돌 감지: {collision_warnings}")

        # ── 구조 지지체 검사 (슬래브/지붕) ─────────────────────
        structural_result: StructuralCheckResult | None = None
        structural_warnings: list[str] = []
        if self._structural_validator:
            structural_result = self._structural_validator.check_create_support(
                ci_dump, target_storey
            )
            structural_warnings = structural_result.to_summary_lines()
            if not structural_result.safe:
                logger.warning(f"[Pipeline] CREATE 구조 경고: {structural_warnings}")

        # ── Clarification 생성 ──────────────────────────────────
        questions = ClarificationGenerator().generate(
            collision_result=collision_result,
            structural_result=structural_result,
        )

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
            collision_warnings=collision_warnings,
            structural_warnings=structural_warnings,
        )
        session.clarification_questions = questions
        self.store[session.session_id] = session

        if questions:
            return {
                "status": "needs_clarification",
                "session_id": session.session_id,
                "command": command.model_dump(),
                "summary": "생성 전 확인이 필요합니다.",
                "clarification_questions": [q.to_dict() for q in questions],
                "collision_warnings": collision_warnings,
                "structural_warnings": structural_warnings,
            }

        return {
            "status": "preview_ready",
            "session_id": session.session_id,
            "command": command.model_dump(),
            "summary": f"{target_storey.Name}에 {ci.element_type} 생성 준비 완료",
            "collision_warnings": collision_warnings,
            "structural_warnings": structural_warnings,
        }

    @staticmethod
    def _unpack_create_info(
        ci: dict[str, Any],
        start_point: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """LLM3DCreateInfo dict → engine_3d primitive 파라미터로 변환."""
        sp = start_point or ci.get("start_point") or {}
        mat = ci.get("material") or {}
        return {
            "length_mm":      ci.get("length_mm"),
            "width_mm":       ci.get("width_mm"),
            "height_mm":      ci.get("height_mm"),
            "ridge_height_mm": ci.get("ridge_height_mm"),
            "x_mm":           sp.get("x", 0.0),
            "y_mm":           sp.get("y", 0.0),
            "z_mm":           sp.get("z", 0.0),
            "direction":      str(ci.get("direction") or "north"),
            "shape_preset":   str(ci.get("shape_preset") or "FLAT"),
            "color":          ci.get("color"),
            "material_name":  mat.get("name") if mat else None,
            "step_count":     ci.get("step_count"),
            "riser_height_mm": ci.get("riser_height_mm"),
            "tread_depth_mm": ci.get("tread_depth_mm"),
            "host_wall_global_id": ci.get("host_wall_global_id"),
            "sill_height_mm": ci.get("sill_height_mm"),
            "opening_offset_mm": ci.get("opening_offset_mm"),
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
        storey = model.by_guid(info["storey_guid"])
        params = self._unpack_create_info(ci, start_point=info.get("start_point"))
        # roof 전용 키를 제외한 공통 파라미터
        base_params = {
            k: v for k, v in params.items()
            if k not in (
                "ridge_height_mm",
                "shape_preset",
                "step_count",
                "riser_height_mm",
                "tread_depth_mm",
                "host_wall_global_id",
                "sill_height_mm",
                "opening_offset_mm",
            )
        }

        etype = ci["element_type"]
        if etype == LLM3DElementType.WALL:
            entity = create_wall(model, storey, **base_params)
        elif etype == LLM3DElementType.SLAB:
            entity = create_slab(model, storey, **base_params)
        elif etype == LLM3DElementType.ROOF:
            entity = create_roof(model, storey, **params)
        elif etype == LLM3DElementType.STAIR:
            stair_params = {
                k: v for k, v in params.items()
                if k not in ("ridge_height_mm", "shape_preset") and v is not None
            }
            entity = create_stair_preset(model, storey, **stair_params)
        elif self._is_door_window(etype):
            create_params = {
                "element_type": str(etype),
                "storey": getattr(storey, "Name", None),
                "coordinate_space": "PROJECT_ABSOLUTE_MM",
                "start_mm": {
                    "x": params["x_mm"],
                    "y": params["y_mm"],
                    "z": params["z_mm"],
                },
                "dimensions_mm": {
                    "length": params["length_mm"],
                    "width": params["width_mm"],
                    "height": params["height_mm"],
                },
                "direction": params["direction"],
                "color": params.get("color"),
                "material": params.get("material_name"),
                "host_wall_global_id": params.get("host_wall_global_id"),
                "sill_height_mm": params.get("sill_height_mm"),
                "opening_offset_mm": params.get("opening_offset_mm"),
            }
            entity = get_operation("create_element").execute(model, storey, create_params)
        else:
            entity = create_generic_element(model, storey, etype.value, **base_params)

        if entity:
            model.write(output_path)
            return {
                "status": "applied",
                "created_id": entity.GlobalId,
                "summary": f"신규 {etype} 생성 완료",
            }
        return {"status": "error", "summary": "생성 실패"}

    # ── DELETE 구조 검사 헬퍼 ─────────────────────────────────────

    def _run_structural_delete_check(
        self, matched: list[dict[str, Any]]
    ) -> StructuralCheckResult:
        """
        DELETE 대상 부재 목록에 내력벽이 포함되어 있는지 검사한다.
        하나라도 blocked이면 전체를 차단한다.
        """
        if not self._structural_validator:
            return StructuralCheckResult(safe=True)

        model = self.query_engine.get_model()
        if not model:
            return StructuralCheckResult(safe=True)

        all_warnings: list[str] = []
        for item in matched:
            element = model.by_guid(item["global_id"])
            if not element:
                continue
            result = self._structural_validator.check_delete(element)
            if result.blocked:
                # 첫 번째 차단 발견 시 즉시 반환 (fast-fail)
                return result
            all_warnings.extend(result.warnings)

        return StructuralCheckResult(safe=True, warnings=all_warnings)

    # ── 인접 부재 탐색 공개 메서드 ────────────────────────────────

    def find_adjacent_elements(
        self,
        reference_matched_item: dict[str, Any],
        direction: str | None = None,
        element_type: str = "IfcWall",
        threshold_mm: float = 500.0,
        max_results: int = 5,
    ) -> AdjacencyResult:
        """
        기존 matched 항목을 기준으로 인접 부재를 탐색한다.
        """
        if not self._adjacency_engine:
            return AdjacencyResult(
                reference_id=reference_matched_item.get("global_id", ""),
                message="[인접탐색] AdjacencyQueryEngine이 초기화되지 않았습니다.",
            )
        return self._adjacency_engine.find_adjacent(
            reference_info=reference_matched_item,
            direction=direction,
            element_type=element_type,
            threshold_mm=threshold_mm,
            max_results=max_results,
        )

    def find_adjacent_by_text(
        self,
        reference_matched_item: dict[str, Any],
        text: str,
        element_type: str = "IfcWall",
    ) -> AdjacencyResult:
        """
        자연어 텍스트에서 방향을 추출하여 인접 부재를 탐색한다.
        """
        if not self._adjacency_engine:
            return AdjacencyResult(
                reference_id=reference_matched_item.get("global_id", ""),
                message="[인접탐색] AdjacencyQueryEngine이 초기화되지 않았습니다.",
            )
        return self._adjacency_engine.find_adjacent_by_text(
            reference_info=reference_matched_item,
            text=text,
            element_type=element_type,
        )

    # ── 요약 생성 헬퍼 ────────────────────────────────────────────────────

    def _generate_summary(self, command, count, errors) -> str:
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
