from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from .validators.collision import CollisionResult
from .validators.structural import StructuralCheckResult


class ClarificationTrigger(StrEnum):
    DUPLICATE_ELEMENT   = "duplicate_element"
    LOAD_BEARING_DELETE = "load_bearing_delete"
    NO_SUPPORT_BELOW    = "no_support_below"
    CUSTOM              = "custom"


@dataclass(frozen=True)
class ClarificationOption:
    id: str
    label: str
    value: str

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "label": self.label, "value": self.value}


@dataclass(frozen=True)
class ClarificationQuestion:
    trigger: ClarificationTrigger
    question_ko: str
    options: tuple[ClarificationOption, ...]
    context: dict[str, Any]
    is_blocking: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "trigger": self.trigger.value,
            "question_ko": self.question_ko,
            "options": [o.to_dict() for o in self.options],
            "context": self.context,
            "is_blocking": self.is_blocking,
        }


_CANCEL       = ClarificationOption(id="cancel",       label="취소",      value="cancel")
_FORCE_CREATE = ClarificationOption(id="force_create", label="강제 생성", value="force_create")


class ClarificationGenerator:
    def generate(
        self,
        collision_result: CollisionResult | None = None,
        structural_result: StructuralCheckResult | None = None,
    ) -> list[ClarificationQuestion]:
        questions: list[ClarificationQuestion] = []

        if collision_result and collision_result.has_collision:
            ctx: dict[str, Any] = {"colliding_elements": collision_result.colliding_elements}
            if collision_result.is_common_wall_candidate:
                questions.append(ClarificationQuestion(
                    trigger=ClarificationTrigger.DUPLICATE_ELEMENT,
                    question_ko="신규 부재가 기존 부재와 면 접촉합니다. 어떻게 처리할까요?",
                    options=(
                        ClarificationOption(
                            id="share_wall", label="공유벽으로 처리", value="share_wall"
                        ),
                        _FORCE_CREATE,
                        _CANCEL,
                    ),
                    context=ctx,
                ))
            else:
                questions.append(ClarificationQuestion(
                    trigger=ClarificationTrigger.DUPLICATE_ELEMENT,
                    question_ko="신규 부재가 기존 부재와 겹칩니다. 강제로 생성할까요?",
                    options=(_FORCE_CREATE, _CANCEL),
                    context=ctx,
                ))

        if structural_result and not structural_result.safe and not structural_result.blocked:
            questions.append(ClarificationQuestion(
                trigger=ClarificationTrigger.NO_SUPPORT_BELOW,
                question_ko="하부에 지지 부재(벽/기둥)가 없습니다. 강제로 생성할까요?",
                options=(_FORCE_CREATE, _CANCEL),
                context={"warnings": structural_result.to_summary_lines()},
            ))

        return questions
