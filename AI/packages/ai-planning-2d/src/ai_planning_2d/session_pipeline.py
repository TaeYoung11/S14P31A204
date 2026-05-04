from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import uuid

from .command import CommandBatch, FloorNLPCommand, IFCContext
from .engine import FloorPlanEngine
from .executor import apply_space_plan
from .ifc_extractor import extract_ifc_context
from .policies import plan_remove_room, plan_resize_room
from .pipeline import to_ifc_commands
from .preview_validators import validate_preview_plan


@dataclass
class PreviewSession2D:
    session_id: str
    command: FloorNLPCommand
    command_batch: CommandBatch
    policy_plan: dict[str, Any] | None
    validation_warnings: list[str]


class LLM2DPipeline:
    def __init__(
        self,
        ifc_path: str | None = None,
        *,
        ifc_context: IFCContext | None = None,
        engine: FloorPlanEngine | None = None,
    ) -> None:
        self.ifc_path = ifc_path
        self.ifc_context = ifc_context or (
            extract_ifc_context(ifc_path) if ifc_path is not None else None
        )
        self.engine = engine or FloorPlanEngine()
        self.store: dict[str, PreviewSession2D] = {}

    async def execute_preview(self, user_text: str) -> dict[str, Any]:
        command = await self.engine.parse_command(user_text, self.ifc_context)
        return await self.execute_command_preview(command)

    async def execute_command_preview(self, command: FloorNLPCommand) -> dict[str, Any]:
        batch = to_ifc_commands(command, self.ifc_context)
        if batch.requires_clarification:
            return {
                "status": "needs_clarification",
                "summary": batch.clarification_question,
                "command": command.model_dump(),
            }

        policy_plan = self._build_policy_plan(command, batch)
        if policy_plan is not None:
            if policy_plan["status"] == "needs_clarification":
                return {
                    "status": "needs_clarification",
                    "summary": self._policy_summary(policy_plan),
                    "command": command.model_dump(),
                    "policy_plan": policy_plan,
                }
            if policy_plan["status"] == "unsupported":
                return {
                    "status": "unsupported",
                    "summary": self._policy_summary(policy_plan),
                    "command": command.model_dump(),
                    "policy_plan": policy_plan,
                }

        validation = validate_preview_plan(
            command=command,
            policy_plan=policy_plan,
            ifc_context=self.ifc_context,
        )
        if not validation.ok:
            return {
                "status": "failed_quality_check",
                "summary": validation.errors[0],
                "command": command.model_dump(),
                "policy_plan": policy_plan,
                "validation_warnings": validation.warnings,
                "validation_errors": validation.errors,
            }

        session = PreviewSession2D(
            session_id=str(uuid.uuid4()),
            command=command,
            command_batch=batch,
            policy_plan=policy_plan,
            validation_warnings=validation.warnings,
        )
        self.store[session.session_id] = session

        return {
            "status": "preview_ready",
            "session_id": session.session_id,
            "summary": self._preview_summary(command, batch, policy_plan),
            "command": command.model_dump(),
            "command_batch": batch.model_dump(),
            "policy_plan": policy_plan,
            "matched_count": len(batch.commands),
            "validation_warnings": validation.warnings,
        }

    async def execute_apply(
        self,
        session_id: str,
        output_path: str = "result.ifc",
    ) -> dict[str, Any]:
        session = self.store.get(session_id)
        if session is None:
            return {"status": "session_not_found"}

        try:
            if (
                self.ifc_path is not None
                and (
                    session.command.action == "add_room"
                    or (
                        session.policy_plan is not None
                        and session.policy_plan.get("status") == "planned"
                        and session.command.action in {"remove_room", "resize_room"}
                    )
                )
            ):
                result = apply_space_plan(
                    ifc_path=self.ifc_path,
                    output_path=output_path,
                    command=session.command,
                    command_batch=session.command_batch,
                    policy_plan=session.policy_plan,
                )
                result["command"] = session.command.model_dump()
                result["command_batch"] = session.command_batch.model_dump()
                result["policy_plan"] = session.policy_plan
                result["validation_warnings"] = session.validation_warnings
                return result

            return {
                "status": "apply_deferred",
                "summary": (
                    "2D preview/apply/session 파이프라인까지는 연결되었지만 "
                    "실제 IFC mutation executor는 아직 MR 이후 통합 예정입니다."
                ),
                "command": session.command.model_dump(),
                "command_batch": session.command_batch.model_dump(),
                "policy_plan": session.policy_plan,
                "validation_warnings": session.validation_warnings,
            }
        finally:
            self.store.pop(session_id, None)

    def _build_policy_plan(
        self,
        command: FloorNLPCommand,
        batch: CommandBatch,
    ) -> dict[str, Any] | None:
        if self.ifc_context is None:
            return None

        if command.action == "remove_room":
            return plan_remove_room(
                target_space_id=batch.commands[0].target_id,
                ifc_context=self.ifc_context,
            )

        if command.action == "resize_room":
            return plan_resize_room(
                target_space_id=batch.commands[0].target_id,
                new_width=command.resize_width or 0,
                new_height=command.resize_height or 0,
                ifc_context=self.ifc_context,
            )

        return None

    def _preview_summary(
        self,
        command: FloorNLPCommand,
        batch: CommandBatch,
        policy_plan: dict[str, Any] | None,
    ) -> str:
        if command.action == "add_room":
            name = command.new_room.name if command.new_room else "새 방"
            return f"'{name}' 추가 미리보기가 준비되었습니다."
        if command.action == "remove_room":
            if policy_plan:
                return self._policy_summary(policy_plan)
            return "방 삭제 미리보기가 준비되었습니다."
        if command.action == "resize_room":
            if policy_plan:
                return self._policy_summary(policy_plan)
            return "방 크기 변경 미리보기가 준비되었습니다."
        return f"{len(batch.commands)}개 명령의 미리보기가 준비되었습니다."

    def _policy_summary(self, policy_plan: dict[str, Any] | None) -> str:
        if policy_plan is None:
            return "정책 계획이 없습니다."

        reason = policy_plan.get("reason")
        if reason == "dominant_adjacent_absorber":
            return "삭제 대상 방을 인접한 단일 흡수 후보로 병합할 수 있습니다."
        if reason == "multiple_similar_absorbers":
            return "삭제 후 어느 인접 방이 흡수할지 애매합니다."
        if reason == "no_adjacent_absorber":
            return "삭제 후 공간을 흡수할 인접 방을 찾지 못했습니다."
        if reason == "single_direction_resize":
            direction = policy_plan.get("direction")
            return f"{direction} 방향으로만 안전하게 크기 변경할 수 있습니다."
        if reason == "resize_direction_ambiguous":
            return "크기 변경 방향이 여러 개로 해석되어 추가 확인이 필요합니다."
        if reason == "multi_axis_resize_unsupported":
            return "가로와 세로를 동시에 바꾸는 변경은 아직 자동 계획 대상이 아닙니다."
        if reason == "non_rectangular_space":
            return "직사각형이 아닌 방은 아직 자동 크기 변경을 지원하지 않습니다."
        if reason == "locked_room":
            return "잠금된 방은 자동 편집할 수 없습니다."
        if reason == "room_not_found":
            return "대상 방을 찾지 못했습니다."
        return f"정책 판정 결과: {reason}"
