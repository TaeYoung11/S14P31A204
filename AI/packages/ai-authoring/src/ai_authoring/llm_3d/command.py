from __future__ import annotations
import logging
from enum import Enum
from typing import ClassVar, Dict, Optional, List, Set, Tuple
from pydantic import BaseModel, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


class LLM3DCommandType(str, Enum):
    MODIFY = "MODIFY"
    DELETE = "DELETE"
    CREATE = "CREATE"


class LLM3DElementType(str, Enum):
    WALL   = "IfcWall"
    SLAB   = "IfcSlab"
    COLUMN = "IfcColumn"
    BEAM   = "IfcBeam"
    DOOR   = "IfcDoor"
    WINDOW = "IfcWindow"
    STAIR  = "IfcStair"
    ROOF   = "IfcRoof"


class LLM3DSizeMode(str, Enum):
    ABSOLUTE = "ABSOLUTE"
    RELATIVE = "RELATIVE"


class LLM3DDimensionChange(BaseModel):
    """치수 변경 정보 (mode: 절대/상대, value: mm 단위)"""
    mode:  LLM3DSizeMode
    value: float


class LLM3DMaterialChange(BaseModel):
    """재질 변경 정보 (name: 재료명)"""
    name:   str
    grade:  Optional[str] = None
    finish: Optional[str] = None


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
    def must_have_nonzero(self) -> "LLM3DPosition":
        if self.x == 0.0 and self.y == 0.0 and self.z == 0.0:
            raise ValueError("position_mm: x/y/z 중 하나 이상이 0이 아니어야 합니다.")
        return self


class LLM3DChanges(BaseModel):
    """수정 대상의 변경 속성 집합"""
    material:     Optional[LLM3DMaterialChange]  = None
    color:        Optional[str]                  = Field(None, description="색상 (Name 또는 HEX)")
    length_mm:    Optional[LLM3DDimensionChange] = None
    height_mm:    Optional[LLM3DDimensionChange] = None
    width_mm:     Optional[LLM3DDimensionChange] = None
    position_mm:  Optional[LLM3DPosition]        = Field(None, description="Move Gizmo — XYZ 이동 (mm)")
    rotation_deg: Optional[float]                = Field(None, description="Rotate Gizmo — Z축 회전 (도)")
    face_offset_mm: Optional[float]              = Field(None, description="특정 면 오프셋 (mm)")
    deletion:     bool                           = False

    @model_validator(mode="before")
    @classmethod
    def normalize_llm_field_names(cls, data: dict) -> dict:
        """
        LLM hallucination 방어: 잘못된 필드명을 올바른 필드명으로 변환.
        - material_change / materialChange → material
        - face_offset → face_offset_mm (단위 누락 대응)
        """
        if not isinstance(data, dict):
            return data
        # material 계열 잘못된 필드명 정규화
        for bad_key in ("material_change", "materialChange", "material_info"):
            if bad_key in data and "material" not in data:
                data["material"] = data.pop(bad_key)
            elif bad_key in data:
                data.pop(bad_key)  # 중복이면 버림
        # face_offset 단위 누락 대응
        if "face_offset" in data and "face_offset_mm" not in data:
            data["face_offset_mm"] = data.pop("face_offset")
        # 알 수 없는 필드 조용히 제거 (스키마 오염 방지)
        known = {
            "material", "color", "length_mm", "height_mm", "width_mm",
            "position_mm", "rotation_deg", "face_offset_mm", "deletion",
        }
        for key in list(data.keys()):
            if key not in known:
                logger.debug(f"[LLM3DChanges] 알 수 없는 필드 제거: {key}={data[key]!r}")
                data.pop(key)
        return data

    @model_validator(mode="after")
    def deletion_is_exclusive(self) -> "LLM3DChanges":
        has_other = any([
            self.material is not None, self.color is not None,
            self.length_mm is not None, self.height_mm is not None, self.width_mm is not None,
            self.position_mm is not None, self.rotation_deg is not None, self.face_offset_mm is not None,
        ])
        if self.deletion and has_other:
            raise ValueError("deletion은 다른 변경 사항과 동시에 지정할 수 없습니다.")
        return self

    @model_validator(mode="after")
    def at_least_one_change(self) -> "LLM3DChanges":
        # 0.0은 falsy이므로 is not None으로 체크 (rotation_deg=0, face_offset_mm=0 정상 허용)
        has_any = any([
            self.material is not None,
            self.color is not None,
            self.length_mm is not None,
            self.height_mm is not None,
            self.width_mm is not None,
            self.position_mm is not None,
            self.rotation_deg is not None,
            self.face_offset_mm is not None,
            self.deletion,
        ])
        if not has_any:
            raise ValueError("하나 이상의 변경 사항을 지정해야 합니다.")
        return self



class LLM3DTarget(BaseModel):
    """수정 대상을 식별하기 위한 정보"""
    element_type: LLM3DElementType = Field(..., description="대상 부재 타입")
    global_id:    Optional[str]    = Field(None, description="IFC GlobalId (22자)")
    name:         Optional[str]    = Field(None, description="부재 이름")
    storey:       Optional[str]    = Field(None, description="층 정보(B1, 1F 등)")
    space_name:   Optional[str]    = Field(None, description="공간 이름(거실, 안방 등)")
    direction:    Optional[str]    = Field(None, description="방향 (North, East, Left 등)")
    tag:          Optional[str]    = Field(None, description="사용자 정의 태그")
    select_all:   bool             = Field(False, description="동일 조건 전체 선택 여부")

    @field_validator("global_id", mode="before")
    @classmethod
    def sanitize_global_id(cls, v: Optional[str]) -> Optional[str]:
        """LLM hallucination 방어 — 패턴 불일치 시 None으로 무시"""
        import re
        if v and re.fullmatch(r"[0-9A-Za-z_$]{22}", v):
            return v
        return None




class LLM3DCommand(BaseModel):
    """LLM이 파싱한 최종 수정 명령 구조체"""
    command_type:       LLM3DCommandType
    target:             LLM3DTarget
    changes:            Optional[LLM3DChanges] = None
    confidence:         float                  = Field(..., ge=0.0, le=1.0)
    raw_instruction:    str
    ambiguity_question: Optional[str]          = None

    # -------------------------------------------------------------------------
    # 운영 정책: 수정 가능 Whitelist → IfcWall, IfcRoof 만 허용
    # 나머지는 모두 ReadOnly (문, 창문, 계단, 슬래브, 기둥, 보)
    # -------------------------------------------------------------------------
    # ClassVar로 선언 → Pydantic v2가 ModelPrivateAttr로 처리하지 않음
    _READ_ONLY_TYPES: ClassVar[Set["LLM3DElementType"]] = {
        LLM3DElementType.DOOR,
        LLM3DElementType.WINDOW,
        LLM3DElementType.STAIR,
        LLM3DElementType.SLAB,
        LLM3DElementType.COLUMN,
        LLM3DElementType.BEAM,
    }

    # 부재별 치수 제약 (mm)
    _DIM_CONSTRAINTS: ClassVar[Dict["LLM3DElementType", Dict[str, Tuple[float, float]]]] = {
        LLM3DElementType.WALL: {"height_mm": (150.0, 5000.0), "width_mm": (50.0, 1000.0)},
        LLM3DElementType.ROOF: {"height_mm": (100.0, 10000.0)},
    }

    # 층 Z 범위 제약 (지하 5층 ~ 50층 수준)
    _Z_RANGE_MM: ClassVar[Tuple[float, float]] = (-20_000.0, 200_000.0)

    @model_validator(mode="after")
    def validate_command_integrity(self) -> "LLM3DCommand":
        """
        구조적 정합성 검사.
        ambiguity_question이 있으면 LLM이 의도적으로 재질문 중이므로 완화 적용.
        """
        if not self.ambiguity_question:
            # 1. 타겟 식별자 체크 — CREATE는 기존 요소 불필요하므로 제외
            if self.command_type != LLM3DCommandType.CREATE:
                t = self.target
                if not any([t.global_id, t.name, t.tag, t.storey, t.space_name, t.direction, t.select_all]):
                    raise ValueError("타겟을 특정할 수 없습니다. 층, 공간, 방향, 이름 등 식별자가 필요합니다.")

            # 2. changes 필수 체크 — MODIFY/DELETE 모두 해당
            if self.command_type in (LLM3DCommandType.MODIFY, LLM3DCommandType.DELETE) \
                    and self.changes is None:
                raise ValueError("MODIFY/DELETE 명령에는 반드시 changes가 필요합니다.")

        return self

    def validate_modeling_quality(
        self,
        current_dims: Optional[dict[str, float]] = None,
        current_z:    Optional[float] = None,
    ) -> List[str]:
        """
        운영 정책 + 물리적 제약 검증.

        검증 순서:
          1. ReadOnly 부재 차단 (정책)
          2. 치수 범위 검사
          3. Move Gizmo Z 범위 검사
          4. Rotate Gizmo 극단값 검사
        """
        errors: List[str] = []
        if self.command_type not in (LLM3DCommandType.MODIFY, LLM3DCommandType.DELETE):
            return errors

        # 1. 고정 부재(창문, 문, 기둥 등)의 치수/형태 수정 차단
        if self.target.element_type in self._READ_ONLY_TYPES:
            if self.command_type == LLM3DCommandType.MODIFY and self.changes:
                has_shape_change = any([
                    self.changes.length_mm is not None,
                    self.changes.height_mm is not None,
                    self.changes.width_mm is not None,
                    self.changes.face_offset_mm is not None
                ])
                if has_shape_change:
                    errors.append(
                        "[수정불가] 문, 창문, 기둥 등은 치수/형태를 변경할 수 없는 고정 요소입니다. (위치, 색상, 재질만 변경 가능)"
                    )
                    return errors

        if self.command_type != LLM3DCommandType.MODIFY or not self.changes:
            return errors

        current_dims = current_dims or {}
        constraints  = self._DIM_CONSTRAINTS.get(self.target.element_type, {})

        # 2. 치수 범위 검사
        resolved: dict[str, float] = {}
        for fname in ["height_mm", "width_mm", "length_mm"]:
            change = getattr(self.changes, fname)
            if change:
                base = current_dims.get(fname, 2400.0)
                resolved[fname] = change.value if change.mode == LLM3DSizeMode.ABSOLUTE \
                                   else base + change.value
            elif fname in current_dims:
                resolved[fname] = current_dims[fname]

        for fname, (lo, hi) in constraints.items():
            val = resolved.get(fname)
            if val is not None and not (lo <= val <= hi):
                errors.append(f"[범위초과] {fname}={val:.0f}mm (허용: {lo:.0f}~{hi:.0f}mm)")

        h = resolved.get("height_mm")
        if h is not None and not (150.0 <= h <= 6000.0):
            if "height_mm" not in constraints:
                errors.append(f"[층고위반] height={h:.0f}mm — 비정상적인 높이입니다.")

        # 3. Move Gizmo Z 범위 검사
        if self.changes.position_mm:
            pos = self.changes.position_mm
            z_after = (current_z or 0.0) + pos.z \
                      if pos.mode == LLM3DSizeMode.RELATIVE else pos.z
            zlo, zhi = self._Z_RANGE_MM
            if not (zlo <= z_after <= zhi):
                errors.append(
                    f"[이동범위초과] Z={z_after:.0f}mm — 허용 범위: {zlo:.0f}~{zhi:.0f}mm"
                )

        # 4. Rotate Gizmo 극단값 검사
        if self.changes.rotation_deg is not None and abs(self.changes.rotation_deg) > 3600.0:
            errors.append(
                f"[회전값이상] rotation_deg={self.changes.rotation_deg}° — 입력 오류일 수 있습니다."
            )

        return errors