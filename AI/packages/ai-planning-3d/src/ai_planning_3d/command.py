from __future__ import annotations

import logging
from enum import StrEnum
from typing import ClassVar

from pydantic import BaseModel, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


class LLM3DCommandType(StrEnum):
    MODIFY = "MODIFY"
    DELETE = "DELETE"
    CREATE = "CREATE"


class LLM3DElementType(StrEnum):
    WALL = "IfcWall"
    SLAB = "IfcSlab"
    COLUMN = "IfcColumn"
    BEAM = "IfcBeam"
    DOOR = "IfcDoor"
    WINDOW = "IfcWindow"
    STAIR = "IfcStair"
    ROOF = "IfcRoof"


class LLM3DSizeMode(StrEnum):
    ABSOLUTE = "ABSOLUTE"
    RELATIVE = "RELATIVE"


class LLM3DRoofShape(StrEnum):
    """지붕 형상 프리셋 — CREATE 시 shape_preset 필드에 사용"""

    FLAT = "FLAT"  # 평지붕 (기본값)
    GABLED = "GABLED"  # 박공지붕


class LLM3DWallCategory(StrEnum):
    """벽 카테고리 — 외벽/내벽 구분 (색상·재질 정책 분기에 사용)"""

    EXTERIOR = "EXTERIOR"  # 외벽: 색상 + 재질 모두 지원
    INTERIOR = "INTERIOR"  # 내벽: 색상만 지원
    PARTITION = "PARTITION"  # 파티션: 색상만 지원


class LLM3DDimensionChange(BaseModel):
    """치수 변경 정보 (mode: 절대/상대, value: mm 단위)"""

    mode: LLM3DSizeMode
    value: float


class LLM3DMaterialChange(BaseModel):
    """재질 변경 정보 (name: 재료명)"""

    name: str
    grade: str | None = None
    finish: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def translate_hallucination(cls, v: str) -> str:
        """Qwen 등 모델의 한자 출력(환각) 방어"""
        mapping = {
            "铝": "Aluminum",
            "混凝土": "Concrete",
            "钢": "Steel",
            "木": "Timber",
            "玻璃": "Glass",
            "砖": "Brick",
            "钢筋混凝土": "Reinforced Concrete",
        }
        return mapping.get(v, v)


class LLM3DPosition(BaseModel):
    """
    Move Gizmo 대응 — X/Y/Z 이동량 (mm).
    RELATIVE: 현재 위치 delta / ABSOLUTE: 절대 좌표
    """

    mode: LLM3DSizeMode = LLM3DSizeMode.RELATIVE
    x: float = Field(0.0, description="X축 이동량 (mm)")
    y: float = Field(0.0, description="Y축 이동량 (mm)")
    z: float = Field(0.0, description="Z축 이동량 (mm)")

    @model_validator(mode="after")
    def must_have_nonzero(self) -> LLM3DPosition:
        if self.x == 0.0 and self.y == 0.0 and self.z == 0.0:
            raise ValueError("position_mm: x/y/z 중 하나 이상이 0이 아니어야 합니다.")
        return self


class LLM3DPoint3D(BaseModel):
    """IFC 공간 내 절대 좌표 (단위: mm)"""

    x: float = Field(0.0, description="X 좌표 (mm)")
    y: float = Field(0.0, description="Y 좌표 (mm)")
    z: float = Field(0.0, description="Z 좌표 (mm)")


class LLM3DCreateInfo(BaseModel):
    """
    CREATE 명령 전용 파라미터 봉투.

    LLM은 direction/storey/space_name/color/shape_preset 등 의미 힌트만 채우고,
    start_point 절대 좌표는 파이프라인이 IFC 모델을 참조해 계산한다.
    LLM이 좌표를 직접 추측하는 것은 설계상 금지한다.
    """

    element_type: LLM3DElementType = Field(..., description="생성할 부재 타입")
    start_point: LLM3DPoint3D | None = Field(
        None,
        description="시작 좌표 (mm 절대값) — None이면 파이프라인이 공간 정보로 계산",
    )
    end_point: LLM3DPoint3D | None = Field(
        None,
        description="끝 좌표 (mm) — 선형 부재(벽, 보)에서 사용",
    )
    length_mm: float | None = Field(
        None,
        description="부재 길이 (mm) — end_point 없을 때 사용",
    )
    height_mm: float = Field(2400.0, description="생성 높이/두께 (mm)")
    width_mm: float = Field(200.0, description="두께/단면 폭 (mm)")
    direction: str | None = Field(
        None,
        description="배치 방향 — 반드시 명시 (North/South/East/West)",
    )
    storey: str | None = Field(None, description="배치 층 (1F, 2F 등)")
    space_name: str | None = Field(None, description="배치 공간 이름")
    material: LLM3DMaterialChange | None = Field(None, description="초기 재질 — None이면 기본값")
    color: str | None = Field(None, description="색상 (CSS 이름 또는 HEX #RRGGBB)")
    shape_preset: LLM3DRoofShape | None = Field(
        None,
        description="지붕 형상 프리셋 (IfcRoof 전용): FLAT / GABLED",
    )
    ridge_height_mm: float = Field(
        1200.0,
        description="박공지붕 용마루 높이 (mm) — shape_preset=GABLED 전용",
    )
    wall_category: LLM3DWallCategory | None = Field(
        None,
        description="벽 카테고리 (외벽 EXTERIOR / 내벽 INTERIOR / 파티션 PARTITION)",
    )

    @model_validator(mode="after")
    def length_or_endpoints(self) -> LLM3DCreateInfo:
        """선형 부재(벽·보)는 길이를 특정할 수 없으면 배치가 불가능하다."""
        linear_types = {LLM3DElementType.WALL, LLM3DElementType.BEAM}
        if self.element_type in linear_types:
            if self.end_point is None and self.length_mm is None:
                raise ValueError(
                    "선형 부재(벽/보): end_point 또는 length_mm 중 하나는 반드시 지정해야 합니다."
                )
        return self

    @model_validator(mode="after")
    def validate_color_policy(self) -> LLM3DCreateInfo:
        """내벽/파티션에 재질 지정 시 경고 로그만 남기고 material을 None으로 초기화한다."""
        interior_cats = {LLM3DWallCategory.INTERIOR, LLM3DWallCategory.PARTITION}
        if self.wall_category in interior_cats and self.material is not None:
            logger.warning(
                "[CREATE] 내벽/파티션은 재질(material) 변경 정책 제한"
                " — material 필드를 무시합니다."
            )
            self.material = None
        return self


class LLM3DChanges(BaseModel):
    """수정 대상의 변경 속성 집합"""

    material: LLM3DMaterialChange | None = None
    color: str | None = Field(None, description="색상 (Name 또는 HEX)")
    length_mm: LLM3DDimensionChange | None = None
    height_mm: LLM3DDimensionChange | None = None
    width_mm: LLM3DDimensionChange | None = None
    position_mm: LLM3DPosition | None = Field(None, description="Move Gizmo — XYZ 이동 (mm)")
    rotation_deg: float | None = Field(None, description="Rotate Gizmo — Z축 회전 (도)")
    face_offset_mm: float | None = Field(None, description="특정 면 오프셋 (mm)")
    deletion: bool = False

    @model_validator(mode="before")
    @classmethod
    def normalize_llm_field_names(cls, data: dict) -> dict:
        """LLM hallucination 방어: 잘못된 필드명을 올바른 필드명으로 변환."""
        if not isinstance(data, dict):
            return data
        for bad_key in ("material_change", "materialChange", "material_info"):
            if bad_key in data and "material" not in data:
                data["material"] = data.pop(bad_key)
        if "face_offset" in data and "face_offset_mm" not in data:
            data["face_offset_mm"] = data.pop("face_offset")
        known = {
            "material", "color", "length_mm", "height_mm", "width_mm",
            "position_mm", "rotation_deg", "face_offset_mm", "deletion",
        }
        for key in list(data.keys()):
            if key not in known:
                data.pop(key)
        return data

    @model_validator(mode="after")
    def deletion_is_exclusive(self) -> LLM3DChanges:
        has_other = any([
            self.material is not None, self.color is not None,
            self.length_mm is not None, self.height_mm is not None,
            self.width_mm is not None, self.position_mm is not None,
            self.rotation_deg is not None, self.face_offset_mm is not None,
        ])
        if self.deletion and has_other:
            raise ValueError("deletion은 다른 변경 사항과 동시에 지정할 수 없습니다.")
        return self

    @model_validator(mode="after")
    def at_least_one_change(self) -> LLM3DChanges:
        has_any = any([
            self.material is not None, self.color is not None,
            self.length_mm is not None, self.height_mm is not None,
            self.width_mm is not None, self.position_mm is not None,
            self.rotation_deg is not None, self.face_offset_mm is not None,
            self.deletion,
        ])
        if not has_any:
            raise ValueError("하나 이상의 변경 사항을 지정해야 합니다.")
        return self


class LLM3DTarget(BaseModel):
    """수정 대상을 식별하기 위한 정보"""

    element_type: LLM3DElementType = Field(..., description="대상 부재 타입")
    global_id: str | None = Field(None, description="IFC GlobalId (22자)")
    name: str | None = Field(None, description="부재 이름")
    storey: str | None = Field(None, description="층 정보(B1, 1F 등)")
    space_name: str | None = Field(None, description="공간 이름(거실, 안방 등)")
    direction: str | None = Field(None, description="방향 (North, East, Left 등)")
    tag: str | None = Field(None, description="사용자 정의 태그")
    select_all: bool = Field(False, description="동일 조건 전체 선택 여부")

    @field_validator("global_id", mode="before")
    @classmethod
    def sanitize_global_id(cls, v: str | None) -> str | None:
        import re

        if v and re.fullmatch(r"[0-9A-Za-z_$]{22}", v):
            return v
        return None


class LLM3DCommand(BaseModel):
    """LLM이 파싱한 최종 수정 명령 구조체"""

    command_type: LLM3DCommandType
    target: LLM3DTarget
    changes: LLM3DChanges | None = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    raw_instruction: str
    ambiguity_question: str | None = None
    create_info: LLM3DCreateInfo | None = None

    _READ_ONLY_TYPES: ClassVar[set[LLM3DElementType]] = {
        LLM3DElementType.DOOR,
        LLM3DElementType.WINDOW,
        LLM3DElementType.STAIR,
        LLM3DElementType.SLAB,
        LLM3DElementType.COLUMN,
        LLM3DElementType.BEAM,
    }

    _DIM_CONSTRAINTS: ClassVar[dict[LLM3DElementType, dict[str, tuple[float, float]]]] = {
        LLM3DElementType.WALL: {"height_mm": (150.0, 5000.0), "width_mm": (50.0, 1000.0)},
        LLM3DElementType.ROOF: {"height_mm": (100.0, 10000.0)},
    }

    _Z_RANGE_MM: ClassVar[tuple[float, float]] = (-20_000.0, 200_000.0)

    @model_validator(mode="after")
    def validate_command_integrity(self) -> LLM3DCommand:
        """
        검증 에러(ValueError)를 던지면 Instructor가 무한 재시도를 하므로,
        여기서는 최소한의 스키마 정합성만 확인하고
        상세한 타겟 특정 여부는 파이프라인(pipeline.py)에서 처리합니다.
        """
        if self.command_type == LLM3DCommandType.CREATE and self.create_info is None:
            self.ambiguity_question = "어떤 부재를 어디에 생성할까요?"
            self.confidence = 0.1
        return self

    def validate_modeling_quality(
        self,
        current_dims: dict[str, float] | None = None,
        current_z: float | None = None,
    ) -> list[str]:
        errors: list[str] = []
        if self.command_type not in (LLM3DCommandType.MODIFY, LLM3DCommandType.DELETE):
            return errors

        if self.target.element_type in self._READ_ONLY_TYPES:
            if self.command_type == LLM3DCommandType.MODIFY and self.changes:
                has_shape_change = any([
                    self.changes.length_mm is not None,
                    self.changes.height_mm is not None,
                    self.changes.width_mm is not None,
                    self.changes.face_offset_mm is not None,
                ])
                if has_shape_change:
                    errors.append(
                        "[수정불가] 문, 창문, 기둥 등은 치수/형태를 변경할 수 없는 고정 요소입니다."
                    )
                    return errors

        if self.command_type != LLM3DCommandType.MODIFY or not self.changes:
            return errors

        current_dims = current_dims or {}
        constraints = self._DIM_CONSTRAINTS.get(self.target.element_type, {})

        resolved: dict[str, float] = {}
        for fname in ["height_mm", "width_mm", "length_mm"]:
            change = getattr(self.changes, fname)
            if change:
                base = current_dims.get(fname, 2400.0)
                if change.mode == LLM3DSizeMode.ABSOLUTE:
                    resolved[fname] = change.value
                else:
                    resolved[fname] = base + change.value
            elif fname in current_dims:
                resolved[fname] = current_dims[fname]

        for fname, (lo, hi) in constraints.items():
            val = resolved.get(fname)
            if val is not None and not (lo <= val <= hi):
                errors.append(f"[범위초과] {fname}={val:.0f}mm (허용: {lo:.0f}~{hi:.0f}mm)")

        return errors