from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import uuid

from ai_authoring import apply_ifc_edit_payload

from .command import CommandBatch, FloorNLPCommand, IFCContext
from .engine import FloorPlanEngine
from .engine_request import build_engine_request, build_ifc_edit_payload
from .executor import apply_space_plan
from .ifc_extractor import extract_ifc_context
from .pipeline import to_ifc_commands
from .policies import plan_remove_room, plan_resize_room
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
        project_id: str = "local-2d",
        base_revision_id: str | None = None,
    ) -> None:
        self.ifc_path = ifc_path
        self.ifc_context = ifc_context or (
            extract_ifc_context(ifc_path) if ifc_path is not None else None
        )
        self.engine = engine or FloorPlanEngine()
        self.project_id = project_id
        self.base_revision_id = base_revision_id
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
        try:
            payload = self._shared_payload(
                mode="preview",
                request_id=session.session_id,
                command=command,
                command_batch=batch,
                policy_plan=policy_plan,
            )
        except ValueError as exc:
            self.store.pop(session.session_id, None)
            return {
                "status": "unsupported",
                "summary": str(exc),
                "command": command.model_dump(),
                "command_batch": batch.model_dump(),
                "policy_plan": policy_plan,
            }

        return {
            "status": "preview_ready",
            "session_id": session.session_id,
            "summary": self._preview_summary(command, batch, policy_plan),
            "command": command.model_dump(),
            "command_batch": batch.model_dump(),
            "policy_plan": policy_plan,
            "matched_count": len(batch.commands),
            "validation_warnings": validation.warnings,
            "engine_request": payload["engine_request"],
            "ifc_edit_payload": payload["ifc_edit_payload"],
            "engine_capabilities": self._engine_capabilities(),
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
            payload = self._shared_payload(
                mode="apply",
                request_id=session.session_id,
                command=session.command,
                command_batch=session.command_batch,
                policy_plan=session.policy_plan,
            )
            response: dict[str, Any] = {
                "command": session.command.model_dump(),
                "command_batch": session.command_batch.model_dump(),
                "policy_plan": session.policy_plan,
                "validation_warnings": session.validation_warnings,
                "engine_request": payload["engine_request"],
                "ifc_edit_payload": payload["ifc_edit_payload"],
                "engine_capabilities": self._engine_capabilities(),
            }

            if self.ifc_path is not None:
                try:
                    result = apply_ifc_edit_payload(
                        ifc_path=self.ifc_path,
                        output_path=output_path,
                        payload=payload["ifc_edit_payload"],
                    )
                    response.update(result)
                    response["apply_mode"] = "shared_authoring"
                    if len(result.get("created_ids", [])) == 1:
                        response["created_space_id"] = result["created_ids"][0]
                    return response
                except (RuntimeError, OSError) as exc:
                    if self._can_apply_locally(session):
                        result = apply_space_plan(
                            ifc_path=self.ifc_path,
                            output_path=output_path,
                            command=session.command,
                            command_batch=session.command_batch,
                            policy_plan=session.policy_plan,
                        )
                        response.update(result)
                        response["apply_mode"] = "local_fallback"
                        response["fallback_reason"] = str(exc)
                        return response
                    response.update(
                        {
                            "status": "apply_failed",
                            "apply_mode": "shared_authoring",
                            "summary": f"shared authoring apply failed: {exc}",
                        }
                    )
                    return response
                except (ValueError, TypeError, KeyError) as exc:
                    response.update(
                        {
                            "status": "apply_failed",
                            "apply_mode": "shared_authoring",
                            "summary": f"shared authoring apply failed: {exc}",
                        }
                    )
                    return response

            response.update(
                {
                    "status": "apply_deferred",
                    "apply_mode": "shared_engine_request",
                    "summary": (
                        "shared engineRequest is ready, but there is no local IFC path to "
                        "execute shared apply in-process."
                    ),
                }
            )
            return response
        finally:
            self.store.pop(session_id, None)

    def _can_apply_locally(self, session: PreviewSession2D) -> bool:
        if self.ifc_path is None:
            return False
        if session.command.action == "add_room":
            return True
        return (
            session.policy_plan is not None
            and session.policy_plan.get("status") == "planned"
            and session.command.action in {"remove_room", "resize_room"}
        )


    def _shared_payload(
        self,
        *,
        mode: str,
        request_id: str,
        command: FloorNLPCommand,
        command_batch: CommandBatch,
        policy_plan: dict[str, Any] | None,
    ) -> dict[str, Any]:
        engine_request = build_engine_request(
            mode=mode,
            request_id=request_id,
            project_id=self.project_id,
            base_revision_id=self.base_revision_id,
            command=command,
            command_batch=command_batch,
            policy_plan=policy_plan,
            ifc_context=self.ifc_context,
        )
        ifc_edit_payload = build_ifc_edit_payload(
            mode=mode,
            request_id=request_id,
            project_id=self.project_id,
            base_revision_id=self.base_revision_id,
            command=command,
            command_batch=command_batch,
            policy_plan=policy_plan,
            ifc_context=self.ifc_context,
        )
        return {
            "engine_request": engine_request.model_dump(mode="json"),
            "ifc_edit_payload": ifc_edit_payload.model_dump(mode="json"),
        }

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
                preferred_direction=command.resize_direction,
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
            name = command.new_room.name if command.new_room else "room"
            return f"'{name}' room preview is ready."
        if command.action in {"remove_room", "resize_room"} and policy_plan is not None:
            return self._policy_summary(policy_plan)
        return f"Preview is ready for {len(batch.commands)} commands."

    def _policy_summary(self, policy_plan: dict[str, Any] | None) -> str:
        if policy_plan is None:
            return "Policy preview is ready."

        reason = policy_plan.get("reason")
        if reason == "dominant_adjacent_absorber":
            return "A dominant adjacent absorber was found for room removal."
        if reason == "multiple_similar_absorbers":
            return "Multiple adjacent absorber candidates exist and clarification is needed."
        if reason == "no_adjacent_absorber":
            return "No adjacent absorber was found for room removal."
        if reason == "single_direction_resize":
            direction = policy_plan.get("direction")
            return f"Resize can be applied toward {direction}."
        if reason == "resize_direction_ambiguous":
            return "Resize direction is ambiguous and clarification is needed."
        if reason == "resize_direction_axis_mismatch":
            return "The requested resize direction does not match the changed axis."
        if reason == "multi_axis_resize_unsupported":
            return "Multi-axis resize is currently unsupported."
        if reason == "non_rectangular_space":
            return "Resize is unsupported for non-rectangular rooms."
        if reason == "locked_room":
            return "The target room is locked."
        if reason == "room_not_found":
            return "The target room was not found."
        return f"Policy result: {reason}"

    def _engine_capabilities(self) -> dict[str, Any]:
        return {
            "shared_payload": True,
            "shared_handlers_expected": [
                "create_element",
                "delete_elements",
                "transform_elements",
                "update_element_properties",
            ],
            "shared_orchestration_attached": True,
            "preferred_apply_mode": "shared_authoring",
            "local_fallback_actions": ["add_room", "remove_room", "resize_room"],
        }
