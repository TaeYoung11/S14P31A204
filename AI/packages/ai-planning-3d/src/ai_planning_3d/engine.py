from __future__ import annotations

import logging
import os

import instructor
from instructor.core.exceptions import InstructorRetryException
from openai import AsyncOpenAI

from .command import (
    COLOR_ALIASES,
    LLM3DChanges,
    LLM3DCommand,
    LLM3DCommandType,
    LLM3DCreateInfo,
    LLM3DDimensionChange,
    LLM3DElementType,
    LLM3DMaterialChange,
    LLM3DPosition,
    LLM3DRoofShape,
    LLM3DSizeMode,
    LLM3DTarget,
    MATERIAL_ALIASES,
    SUPPORTED_MATERIAL_LIST,
    UNSUPPORTED_MATERIAL_ALIASES,
)

logger = logging.getLogger(__name__)

DEFAULT_LLM_MODEL = "qwen2.5:7b"
DEFAULT_LLM_BASE_URL = "http://localhost:11434/v1"
DEFAULT_LLM_API_KEY = "ollama"
DEFAULT_LLM_TIMEOUT_SECONDS = 30.0


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        parsed = float(value)
    except ValueError:
        logger.warning("invalid_float_env env=%s value=%r default=%s", name, value, default)
        return default
    return parsed if parsed > 0 else default


SYSTEM_PROMPT = (
    "### ROLE: BIM DATA ARCHITECT & IFC COMMAND GENERATOR\n"
    "You convert Korean natural language into one compact JSON object.\n"
    "Return JSON only. Do not wrap it in markdown. Do not add unknown fields.\n"
    "\n"
    "### SMALL SCHEMA\n"
    "Required top fields: command_type, target, changes, create_info, confidence, "
    "raw_instruction, ambiguity_question.\n"
    "Use null for unused objects.\n"
    "\n"
    "### NORMALIZATION\n"
    "element_type values: IfcWall, IfcRoof, IfcColumn, IfcBeam, IfcSlab, "
    "IfcDoor, IfcWindow, IfcStair.\n"
    "계단/stair means element_type IfcStair. Stairs may omit direction; default to North.\n"
    "storey: 1층=1F, 2층=2F, 옥상/RF=RF.\n"
    "space_name: 거실=LivingRoom, 안방=MasterBedroom, 침실=Bedroom, 화장실/욕실=Bathroom.\n"
    "direction: 북쪽=North, 남쪽=South, 동쪽/오른쪽=East, 서쪽/왼쪽=West.\n"
    "color aliases must use HEX values, e.g. white=#FFFFFF, red=#EF4444, blue=#3B82F6.\n"
    f"material allowed values only: {SUPPORTED_MATERIAL_LIST}.\n"
    "material aliases: 콘크리트=Concrete, 벽돌=Brick, 강철/철=Steel, "
    "목재/나무=Wood, 유리=Glass, 석재/돌=Stone, 타일=Tile.\n"
    "\n"
    "### RULES\n"
    "MODIFY dimension fields must be objects: "
    "{\"mode\":\"ABSOLUTE|RELATIVE|SCALE\",\"value\":number}.\n"
    "\"2배\" and other multiplier expressions must use mode SCALE.\n"
    "두껍게/더/올려/높게 without fixed final size means RELATIVE. 설정/맞춰/로 means ABSOLUTE.\n"
    "DELETE must include changes {\"deletion\":true}.\n"
    "CREATE must fill create_info. If storey or direction is missing, ask ambiguity_question, "
    "except roof on 옥상 may use storey RF and direction North.\n"
    "박공지붕 means create_info.shape_preset=\"GABLED\".\n"
    "If target or numeric value is too vague, set ambiguity_question and confidence 0.1.\n"
    "\n"
    "### EXAMPLES\n"
    "{\"command_type\":\"MODIFY\",\"target\":{\"element_type\":\"IfcWall\",\"storey\":\"1F\"},"
    "\"changes\":{\"width_mm\":{\"mode\":\"RELATIVE\",\"value\":50}},"
    "\"create_info\":null,\"confidence\":1,\"raw_instruction\":\"1층 외벽 두께 50mm 더\","
    "\"ambiguity_question\":null}\n"
    "{\"command_type\":\"CREATE\",\"target\":{\"element_type\":\"IfcRoof\"},\"changes\":null,"
    "\"create_info\":{\"element_type\":\"IfcRoof\",\"storey\":\"RF\",\"direction\":\"North\","
    "\"color\":\"#EF4444\",\"shape_preset\":\"GABLED\"},\"confidence\":1,"
    "\"raw_instruction\":\"옥상에 빨간색 박공지붕 만들어줘\",\"ambiguity_question\":null}\n"
)


class LLM3DEngine:
    def __init__(
        self,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
    ):
        resolved_model = model or os.getenv("LLM_MODEL_NAME") or DEFAULT_LLM_MODEL
        resolved_base_url = base_url or os.getenv("LLM_BASE_URL") or DEFAULT_LLM_BASE_URL
        resolved_api_key = api_key or os.getenv("LLM_API_KEY") or DEFAULT_LLM_API_KEY
        resolved_timeout = timeout if timeout is not None else _env_float(
            "LLM_TIMEOUT_SECONDS",
            DEFAULT_LLM_TIMEOUT_SECONDS,
        )
        self._raw_client = AsyncOpenAI(
            base_url=resolved_base_url,
            api_key=resolved_api_key,
            timeout=resolved_timeout,
        )
        self.client = instructor.from_openai(self._raw_client, mode=instructor.Mode.JSON)
        self.model = resolved_model
        self.base_url = resolved_base_url

    async def parse_command(
        self, user_text: str, ifc_context: str | None = None
    ) -> LLM3DCommand:
        system_content = (
            SYSTEM_PROMPT + "\n\n" + ifc_context if ifc_context else SYSTEM_PROMPT
        )
        try:
            command: LLM3DCommand = await self.client.chat.completions.create(
                model=self.model,
                response_model=LLM3DCommand,
                messages=[
                    {"role": "system", "content": system_content},
                    {"role": "user", "content": user_text},
                ],
                temperature=0.0,
                top_p=0.1,
                max_retries=1,
            )
            return self._repair_or_replace(user_text, command)
        except InstructorRetryException:
            logger.warning(f"[LLM3DEngine] 파싱 실패 → 재질문 응답으로 대체: {user_text!r}")
            return self.parse_command_heuristic(user_text)
        except Exception as exc:
            logger.error(f"[LLM3DEngine] 파싱 실패: {exc}", exc_info=True)
            raise

    def parse_command_heuristic(self, user_text: str) -> LLM3DCommand:
        """Parse a command without calling the LLM, for deterministic local tests."""
        return self._heuristic_parse(user_text)

    def _repair_or_replace(self, user_text: str, command: LLM3DCommand) -> LLM3DCommand:
        if not command.raw_instruction:
            command = command.model_copy(update={"raw_instruction": user_text})
        requested_type = self._command_type(user_text)

        invalid_material = self._invalid_material(user_text)
        if invalid_material:
            return self._unsupported_material(user_text, invalid_material)
        if self._is_ambiguous(user_text):
            return self._ambiguous(user_text, self._ambiguity_reason(user_text))
        if command.command_type != requested_type:
            return self._heuristic_parse(user_text)

        if command.command_type == LLM3DCommandType.CREATE:
            if command.create_info is None:
                return self._heuristic_parse(user_text)
            heuristic_info: LLM3DCreateInfo | None = None
            create_info = command.create_info
            if create_info.storey is None:
                heuristic_info = heuristic_info or self._create_info(user_text)
                create_info = create_info.model_copy(update={"storey": heuristic_info.storey})
            if create_info.direction is None:
                heuristic_info = heuristic_info or self._create_info(user_text)
                create_info = create_info.model_copy(update={"direction": heuristic_info.direction})
            if create_info.space_name is None:
                heuristic_info = heuristic_info or self._create_info(user_text)
                create_info = create_info.model_copy(
                    update={"space_name": heuristic_info.space_name}
                )
            if create_info.color is None:
                heuristic_info = heuristic_info or self._create_info(user_text)
                create_info = create_info.model_copy(update={"color": heuristic_info.color})
            if create_info.shape_preset is None:
                heuristic_info = heuristic_info or self._create_info(user_text)
                create_info = create_info.model_copy(
                    update={"shape_preset": heuristic_info.shape_preset}
                )
            if create_info is not command.create_info:
                command = command.model_copy(update={"create_info": create_info})
            if create_info.storey is None or (
                create_info.direction is None
                and create_info.element_type != LLM3DElementType.STAIR
            ):
                return self._ambiguous(user_text, "CREATE에는 층과 방향 정보가 필요합니다.")
            if command.ambiguity_question:
                command = command.model_copy(
                    update={
                        "ambiguity_question": None,
                        "confidence": max(command.confidence, 1.0),
                    }
                )
            return command

        if command.command_type == LLM3DCommandType.DELETE:
            if command.changes is None or not command.changes.deletion:
                command = command.model_copy(update={"changes": LLM3DChanges(deletion=True)})
            if command.target.element_type == LLM3DElementType.STAIR or (
                command.target.element_type in {LLM3DElementType.DOOR, LLM3DElementType.WINDOW}
                and self._explicit_select_all_delete(user_text)
            ):
                command = command.model_copy(
                    update={"target": command.target.model_copy(update={"select_all": True})}
                )
            return command

        if command.command_type == LLM3DCommandType.MODIFY:
            if command.changes is None:
                return self._heuristic_parse(user_text)
            heuristic_target: LLM3DTarget | None = None
            target = command.target
            if target.storey is None:
                heuristic_target = heuristic_target or self._target(user_text)
                target = target.model_copy(update={"storey": heuristic_target.storey})
            if target.space_name is None:
                heuristic_target = heuristic_target or self._target(user_text)
                target = target.model_copy(update={"space_name": heuristic_target.space_name})
            if target.direction is None:
                heuristic_target = heuristic_target or self._target(user_text)
                target = target.model_copy(update={"direction": heuristic_target.direction})
            if target.element_type == LLM3DElementType.WALL:
                heuristic_target = heuristic_target or self._target(user_text)
                target = target.model_copy(update={"element_type": heuristic_target.element_type})
            if target is not command.target:
                command = command.model_copy(update={"target": target})

        if command.ambiguity_question:
            heuristic = self._heuristic_parse(user_text)
            if heuristic.confidence > command.confidence:
                return heuristic
        return command

    def _heuristic_parse(self, text: str) -> LLM3DCommand:
        invalid_material = self._invalid_material(text)
        if invalid_material:
            return self._unsupported_material(text, invalid_material)

        if self._is_ambiguous(text):
            return self._ambiguous(text, self._ambiguity_reason(text))

        command_type = self._command_type(text)
        target = self._target(text)

        if command_type == LLM3DCommandType.CREATE:
            create_info = self._create_info(text)
            missing = []
            if not create_info.storey:
                missing.append("층")
            if not create_info.direction and create_info.element_type != LLM3DElementType.STAIR:
                missing.append("방향")
            if missing:
                return self._ambiguous(text, f"CREATE에는 {', '.join(missing)} 정보가 필요합니다.")
            return LLM3DCommand(
                command_type=command_type,
                target=LLM3DTarget(element_type=create_info.element_type),
                changes=None,
                create_info=create_info,
                confidence=1.0,
                raw_instruction=text,
            )

        if command_type == LLM3DCommandType.DELETE:
            if not self._explicit_select_all_delete(text):
                target = target.model_copy(update={"select_all": False})
            if target.element_type == LLM3DElementType.STAIR or (
                target.element_type in {LLM3DElementType.DOOR, LLM3DElementType.WINDOW}
                and self._explicit_select_all_delete(text)
            ):
                target = target.model_copy(update={"select_all": True})
            return LLM3DCommand(
                command_type=command_type,
                target=target,
                changes=LLM3DChanges(deletion=True),
                create_info=None,
                confidence=1.0,
                raw_instruction=text,
            )

        changes = self._changes(text)
        if changes is None:
            return self._ambiguous(text, "수정할 속성이나 수치가 명확하지 않습니다.")
        return LLM3DCommand(
            command_type=command_type,
            target=target,
            changes=changes,
            create_info=None,
            confidence=1.0,
            raw_instruction=text,
        )

    def _command_type(self, text: str) -> LLM3DCommandType:
        if any(word in text for word in ("빼", "제거")):
            return LLM3DCommandType.DELETE
        if any(word in text for word in ("배치", "넣")) or self._is_install_create(text):
            return LLM3DCommandType.CREATE
        if any(word in text for word in ("삭제", "지워", "없애", "remove", "delete")):
            return LLM3DCommandType.DELETE
        if any(word in text for word in ("만들", "생성", "추가", "create", "add")):
            return LLM3DCommandType.CREATE
        if any(word in text for word in ("삭제", "지워", "제거")):
            return LLM3DCommandType.DELETE
        if any(word in text for word in ("만들", "생성", "세워", "추가")):
            return LLM3DCommandType.CREATE
        return LLM3DCommandType.MODIFY

    @staticmethod
    def _explicit_select_all_delete(text: str) -> bool:
        return any(token in text for token in ("모든", "전체", "전부", "모두", "다 "))

    @staticmethod
    def _is_install_create(text: str) -> bool:
        if any(token in text for token in ("옮겨달", "바꿔달", "변경해달", "수정해달", "이동해달")):
            return False
        if not any(token in text for token in ("문", "창문", "door", "window")):
            return False
        return any(token in text for token in ("달아", "달고", "달기", "설치"))

    def _target(self, text: str) -> LLM3DTarget:
        element_type = self._element_type(text)
        storey = self._storey(text)
        space_name = self._space(text)
        direction = self._direction(text)
        return LLM3DTarget(
            element_type=element_type,
            storey=storey,
            space_name=space_name,
            direction=direction,
            select_all=self._select_all_target(element_type, storey, space_name, direction),
        )

    @staticmethod
    def _select_all_target(
        element_type: LLM3DElementType,
        storey: str | None,
        space_name: str | None,
        direction: str | None,
    ) -> bool:
        return storey is None and space_name is None and direction is None

    def _create_info(self, text: str) -> LLM3DCreateInfo:
        element_type = self._element_type(text)
        storey = self._storey(text)
        direction = self._direction(text)
        material = self._material(text)
        color = self._color(text)
        if element_type == LLM3DElementType.ROOF and "옥상" in text:
            storey = storey or "RF"
            direction = direction or "North"

        if element_type == LLM3DElementType.STAIR:
            direction = direction or "North"
        if element_type in {LLM3DElementType.DOOR, LLM3DElementType.WINDOW}:
            direction = direction or "North"

        length_mm = 3000.0 if element_type == LLM3DElementType.WALL else None
        width_mm = 200.0
        height_mm = 2400.0
        sill_height_mm = None

        if element_type == LLM3DElementType.STAIR:
            width_mm = 1000.0
            height_mm = 3000.0
        elif element_type == LLM3DElementType.DOOR:
            length_mm = 900.0
            height_mm = 2100.0
            sill_height_mm = 0.0
            color = color or "#8B5E3C"
            material = material or LLM3DMaterialChange(
                name="Steel" if "현관문" in text or "front door" in text.lower() else "Wood"
            )
        elif element_type == LLM3DElementType.WINDOW:
            length_mm = 1200.0
            height_mm = 1200.0
            sill_height_mm = 900.0
            color = color or "#8FD3FF"
            material = material or LLM3DMaterialChange(name="Glass")

        return LLM3DCreateInfo(
            element_type=element_type,
            storey=storey,
            space_name=self._space(text),
            direction=direction,
            color=color,
            material=material,
            shape_preset=LLM3DRoofShape.GABLED if "박공지붕" in text else None,
            length_mm=length_mm,
            width_mm=width_mm,
            height_mm=height_mm,
            step_count=16 if element_type == LLM3DElementType.STAIR else None,
            sill_height_mm=sill_height_mm,
        )

    def _dimension_change(
        self,
        text: str,
        absolute_words: tuple[str, ...],
    ) -> LLM3DDimensionChange | None:
        if "배" in text:
            value = self._number_before_unit(text, "배")
            if value is None:
                return None
            return LLM3DDimensionChange(mode=LLM3DSizeMode.SCALE, value=value)

        value = self._number_mm(text)
        if value is None:
            return None
        mode = (
            LLM3DSizeMode.ABSOLUTE
            if any(word in text for word in absolute_words)
            else LLM3DSizeMode.RELATIVE
        )
        return LLM3DDimensionChange(mode=mode, value=value)

    def _changes(self, text: str) -> LLM3DChanges | None:
        material = self._material(text)
        color = self._color(text)

        absolute_words = ("설정", "맞춰", "로", "으로")

        if any(word in text for word in ("길이", "가로", "수평")):
            change = self._dimension_change(text, absolute_words)
            if change is None:
                return None
            return LLM3DChanges(length_mm=change, material=material, color=color)

        if any(word in text for word in ("두께", "두껍")) and "배" in text:
            change = self._dimension_change(text, absolute_words)
            if change is None:
                return None
            return LLM3DChanges(width_mm=change, material=material, color=color)

        if any(word in text for word in ("높이", "높게")) and "배" in text:
            change = self._dimension_change(text, absolute_words)
            if change is None:
                return None
            return LLM3DChanges(height_mm=change, material=material, color=color)

        if "두께" in text or "두껍" in text:
            value = self._number_mm(text)
            if value is None:
                return None
            return LLM3DChanges(
                width_mm=LLM3DDimensionChange(mode=LLM3DSizeMode.RELATIVE, value=value),
                material=material,
                color=color,
            )

        if "높이" in text or "높게" in text:
            value = self._number_mm(text)
            if value is None:
                return None
            mode = (
                LLM3DSizeMode.ABSOLUTE
                if any(w in text for w in ("설정", "맞춰", "로"))
                else LLM3DSizeMode.RELATIVE
            )
            return LLM3DChanges(
                height_mm=LLM3DDimensionChange(mode=mode, value=value),
                material=material,
                color=color,
            )

        if "밀어" in text or "당겨" in text:
            value = self._number_mm(text)
            if value is None:
                return None
            if "당겨" in text or "안으로" in text:
                value = -abs(value)
            return LLM3DChanges(face_offset_mm=value, material=material, color=color)

        if any(word in text for word in ("이동", "옮겨", "움직")):
            value = self._number_mm(text)
            if value is None:
                return None
            x = value if "오른쪽" in text or "동쪽" in text else -value
            return LLM3DChanges(
                position_mm=LLM3DPosition(mode=LLM3DSizeMode.RELATIVE, x=x, y=0.0, z=0.0),
                material=material,
                color=color,
            )

        if "돌리" in text or "회전" in text:
            value = self._number_before_unit(text, "도") or self._number(text)
            return LLM3DChanges(rotation_deg=value or 0.0, material=material, color=color)

        if material or color:
            return LLM3DChanges(material=material, color=color)
        return None

    def _element_type(self, text: str) -> LLM3DElementType:
        import re

        if re.search(r"창(?!(고|고문))", text):
            return LLM3DElementType.WINDOW
        if re.search(r"현관문|방문|(?<!창)문", text):
            return LLM3DElementType.DOOR
        if re.search(r"계단|stair", text, re.I):
            return LLM3DElementType.STAIR
        if re.search(r"지붕|루프|roof", text, re.I):
            return LLM3DElementType.ROOF
        if re.search(r"기둥|column", text, re.I):
            return LLM3DElementType.COLUMN
        if re.search(r"빔|(?<![가-힣])보(?![가-힣])|beam", text, re.I):
            return LLM3DElementType.BEAM
        if re.search(r"슬래브|바닥|slab", text, re.I):
            return LLM3DElementType.SLAB
        if re.search(r"(?<![가-힣])문(?![가-힣])|door", text, re.I):
            return LLM3DElementType.DOOR
        if re.search(r"창문|창측|window", text, re.I):
            return LLM3DElementType.WINDOW
        return LLM3DElementType.WALL

    def _storey(self, text: str) -> str | None:
        if "일층" in text:
            return "1F"
        if "이층" in text:
            return "2F"
        if "삼층" in text:
            return "3F"
        if "1층" in text:
            return "1F"
        if "2층" in text:
            return "2F"
        if "3층" in text:
            return "3F"
        if "지하2" in text:
            return "B2"
        if "지하1" in text:
            return "B1"
        if "1층" in text:
            return "1F"
        if "2층" in text:
            return "2F"
        if "3층" in text:
            return "3F"
        if "옥상" in text or "옥탑" in text or "루프" in text:
            return "RF"
        return None

    def _space(self, text: str) -> str | None:
        if "현관" in text or "entrance" in text.lower():
            return "Entrance"
        if "거실" in text or "living room" in text.lower():
            return "LivingRoom"
        if "거실" in text:
            return "LivingRoom"
        if "안방" in text:
            return "MasterBedroom"
        if "침실" in text:
            return "Bedroom"
        if "화장실" in text or "욕실" in text:
            return "Bathroom"
        if "주방" in text or "부엌" in text:
            return "Kitchen"
        return None

    def _direction(self, text: str) -> str | None:
        lower_text = text.lower()
        if "north" in lower_text:
            return "North"
        if "south" in lower_text:
            return "South"
        if "east" in lower_text:
            return "East"
        if "west" in lower_text:
            return "West"
        lateral_rotation = (
            any(word in text for word in ("회전", "돌려"))
            and ("오른쪽으로" in text or "왼쪽으로" in text)
        )
        if "북쪽" in text or "북측" in text:
            return "North"
        if "남쪽" in text or "남측" in text:
            return "South"
        if "동쪽" in text or "동측" in text or ("오른쪽" in text and not lateral_rotation):
            return "East"
        if "서쪽" in text or "서측" in text or ("왼쪽" in text and not lateral_rotation):
            return "West"
        return None

    def _color(self, text: str) -> str | None:
        lower_text = text.lower()
        for alias, color_name in sorted(
            COLOR_ALIASES.items(),
            key=lambda item: len(item[0]),
            reverse=True,
        ):
            if alias in text or alias.lower() in lower_text:
                return color_name
        return None

    def _material(self, text: str) -> LLM3DMaterialChange | None:
        lower_text = text.lower()
        for alias, material_name in sorted(
            MATERIAL_ALIASES.items(),
            key=lambda item: len(item[0]),
            reverse=True,
        ):
            if alias in text or alias.lower() in lower_text:
                return LLM3DMaterialChange(name=material_name)
        return None

    def _invalid_material(self, text: str) -> str | None:
        lower_text = text.lower()
        for keyword, label in sorted(
            UNSUPPORTED_MATERIAL_ALIASES.items(),
            key=lambda item: len(item[0]),
            reverse=True,
        ):
            if keyword in text or keyword.lower() in lower_text:
                return label
        return None

    def _number(self, text: str) -> float | None:
        import re

        match = re.search(r"(\d+(?:\.\d+)?)", text)
        return float(match.group(1)) if match else None

    def _number_before_unit(self, text: str, unit: str) -> float | None:
        import re

        match = re.search(rf"(\d+(?:\.\d+)?)\s*{re.escape(unit)}", text)
        return float(match.group(1)) if match else None

    def _number_mm(self, text: str) -> float | None:
        import re

        # 1. 단위가 명시된 숫자 우선 검색 (mm, m, 미터)
        match = re.search(r"(\d+(?:\.\d+)?)\s*(mm|m|미터)", text)
        if match:
            value = float(match.group(1))
            unit = match.group(2)
            if unit in ("m", "미터"):
                value *= 1000.0
            return value

        # 2. 단위가 없지만 층 번호가 아닌 숫자 검색 (부정 후방 탐색으로 '층' 제외)
        match = re.search(r"(\d+(?:\.\d+)?)(?!\s*층)", text)
        if match:
            return float(match.group(1))

        return None

    def _is_ambiguous(self, text: str) -> bool:
        return (
            "좀 더" in text
            or "이쪽" in text
            or "10m 넘게" in text
            or ("크기" in text and not self._direction(text))
        )

    def _ambiguity_reason(self, text: str) -> str:
        if "이쪽" in text:
            return "지시어만으로는 대상 면을 특정할 수 없습니다."
        if "10m 넘게" in text:
            return "최종 높이 수치가 모호하고 허용 범위를 넘을 수 있습니다."
        if "크기" in text:
            return "방 크기 변경에는 늘릴 방향과 수치가 필요합니다."
        return "명령을 정확히 이해하지 못했습니다. 더 구체적으로 말씀해 주세요."

    def _ambiguous(self, text: str, question: str) -> LLM3DCommand:
        return LLM3DCommand(
            command_type=LLM3DCommandType.MODIFY,
            target=LLM3DTarget(element_type=LLM3DElementType.WALL),
            changes=None,
            confidence=0.1,
            raw_instruction=text,
            ambiguity_question=question,
        )

    def _unsupported_material(self, text: str, material: str) -> LLM3DCommand:
        return self._ambiguous(
            text,
            (
                f"{material} 재질은 지원하지 않습니다. 사용 가능한 재질은 "
                f"{SUPPORTED_MATERIAL_LIST} 입니다."
            ),
        )
