"""2D 계획 세션의 preview와 apply 흐름을 오케스트레이션한다."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast
import uuid

from ai_authoring import apply_ifc_edit_payload

from ..command import CommandBatch, FloorNLPCommand, IFCContext
from ..engine_request import build_engine_request, build_ifc_edit_payload
from ..executor import apply_space_plan
from ..ifc_extractor import extract_ifc_context
from ..toilet_demo import (
    UserIntent as ToiletDemoUserIntent,
    build_toilet_insertion_geometry_plan,
)
from ..validators.preview import validate_preview_plan
from .engine import FloorPlanEngine
from .pipeline import to_ifc_commands
from .policies import (
    RemoveRoomPolicyResult,
    ResizeRoomPolicyResult,
    plan_remove_room,
    plan_resize_room,
)

_ROOM_PLANNING_ACTIONS = {"add_room", "remove_room", "resize_room", "insert_toilet"}
_LOCAL_APPLY_ONLY_ACTIONS = {"delete_wall"}
PolicyPlan = RemoveRoomPolicyResult | ResizeRoomPolicyResult | dict[str, Any]


@dataclass
class PreviewSession2D:
    session_id: str
    command: FloorNLPCommand
    command_batch: CommandBatch
    policy_plan: PolicyPlan | None
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
        if command.action in _ROOM_PLANNING_ACTIONS:
            return self._room_planning_assist_preview(command)

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
        if command.action == "insert_toilet":
            return {
                "status": "preview_ready",
                "session_id": session.session_id,
                "summary": self._preview_summary(command, batch, policy_plan),
                "command": command.model_dump(),
                "command_batch": batch.model_dump(),
                "policy_plan": policy_plan,
                "matched_count": len(batch.commands),
                "validation_warnings": validation.warnings,
                "engine_capabilities": {
                    **self._engine_capabilities(),
                    "shared_payload": False,
                    "preferred_apply_mode": "local_demo_only",
                },
            }
        if command.action in _LOCAL_APPLY_ONLY_ACTIONS:
            return {
                "status": "preview_ready",
                "session_id": session.session_id,
                "summary": self._preview_summary(command, batch, policy_plan),
                "command": command.model_dump(),
                "command_batch": batch.model_dump(),
                "policy_plan": policy_plan,
                "matched_count": len(batch.commands),
                "validation_warnings": validation.warnings,
                "engine_capabilities": {
                    **self._engine_capabilities(),
                    "shared_payload": False,
                    "preferred_apply_mode": "local_healing_apply",
                },
            }
        try:
            # Preview and apply intentionally share the same session_id-backed request_id so the
            # shared payload can be correlated across the two-step flow without a second token.
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
            if session.command.action in _LOCAL_APPLY_ONLY_ACTIONS:
                if self.ifc_path is None:
                    return {
                        "status": "apply_deferred",
                        "apply_mode": "local_healing_apply",
                        "summary": (
                            "delete_wall preview is ready, but there is no local IFC path to "
                            "execute the healing apply."
                        ),
                        "command": session.command.model_dump(),
                        "command_batch": session.command_batch.model_dump(),
                        "policy_plan": session.policy_plan,
                        "validation_warnings": session.validation_warnings,
                        "engine_capabilities": {
                            **self._engine_capabilities(),
                            "shared_payload": False,
                            "preferred_apply_mode": "local_healing_apply",
                        },
                    }
                result = apply_space_plan(
                    ifc_path=self.ifc_path,
                    output_path=output_path,
                    command=session.command,
                    command_batch=session.command_batch,
                    policy_plan=session.policy_plan,
                    ifc_context=self.ifc_context,
                )
                return {
                    **result,
                    "apply_mode": "local_healing_apply",
                    "command": session.command.model_dump(),
                    "command_batch": session.command_batch.model_dump(),
                    "policy_plan": session.policy_plan,
                    "validation_warnings": session.validation_warnings,
                    "engine_capabilities": {
                        **self._engine_capabilities(),
                        "shared_payload": False,
                        "preferred_apply_mode": "local_healing_apply",
                    },
                }
            if session.command.action == "insert_toilet":
                if self.ifc_path is None:
                    return {
                        "status": "apply_deferred",
                        "apply_mode": "local_demo_only",
                        "summary": (
                            "insert_toilet preview is planned, "
                            "but there is no local IFC path to execute the demo apply."
                        ),
                        "command": session.command.model_dump(),
                        "command_batch": session.command_batch.model_dump(),
                        "policy_plan": session.policy_plan,
                        "validation_warnings": session.validation_warnings,
                        "engine_capabilities": {
                            **self._engine_capabilities(),
                            "shared_payload": False,
                            "preferred_apply_mode": "local_demo_only",
                        },
                    }
                result = apply_space_plan(
                    ifc_path=self.ifc_path,
                    output_path=output_path,
                    command=session.command,
                    command_batch=session.command_batch,
                    policy_plan=session.policy_plan,
                    ifc_context=self.ifc_context,
                )
                return {
                    **result,
                    "apply_mode": "local_demo_apply",
                    "command": session.command.model_dump(),
                    "command_batch": session.command_batch.model_dump(),
                    "policy_plan": session.policy_plan,
                    "validation_warnings": session.validation_warnings,
                    "engine_capabilities": {
                        **self._engine_capabilities(),
                        "shared_payload": False,
                        "preferred_apply_mode": "local_demo_only",
                    },
                }
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
                    if (
                        session.command.action == "create_door"
                        and not result.get("created_ids", [])
                    ):
                        response.update(result)
                        response.update(
                            {
                                "status": "apply_failed",
                                "apply_mode": "shared_authoring",
                                "summary": (
                                    "shared authoring apply failed: "
                                    "reusable door-opening template pair was not found."
                                ),
                            }
                        )
                        return response
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
                            ifc_context=self.ifc_context,
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
        return session.command.action in _LOCAL_APPLY_ONLY_ACTIONS

    def _room_planning_assist_preview(self, command: FloorNLPCommand) -> dict[str, Any]:
        batch = to_ifc_commands(command, self.ifc_context)
        if batch.requires_clarification:
            floor_alts = self._build_floor_alternatives(command)
            if floor_alts:
                return {
                    "status": "alternatives",
                    "summary": batch.clarification_question or "어느 층 방을 대상으로 할까요?",
                    "command": command.model_dump(),
                    "command_batch": batch.model_dump(),
                    "alternatives": floor_alts,
                }
            return {
                "status": "needs_clarification",
                "summary": batch.clarification_question,
                "command": command.model_dump(),
                "command_batch": batch.model_dump(),
            }

        policy_plan = self._build_policy_plan(command, batch)
        if command.action == "remove_room":
            return self._remove_room_alternatives_preview(command, batch, policy_plan)
        if command.action == "insert_toilet":
            return self._insert_toilet_alternatives_preview(command, batch, policy_plan)
        if command.action == "resize_room":
            return {
                "status": "needs_clarification",
                "summary": (
                    "Room resize is handled as a planning-assist request in this demo. "
                    "Please confirm which adjacent space may change together."
                ),
                "command": command.model_dump(),
                "command_batch": batch.model_dump(),
                "policy_plan": policy_plan,
            }
        return {
            "status": "needs_clarification",
            "summary": (
                "Adding a new room is not auto-applied in this demo. "
                "Please review a design alternative first."
            ),
            "command": command.model_dump(),
            "command_batch": batch.model_dump(),
            "policy_plan": policy_plan,
        }

    def _insert_toilet_alternatives_preview(
        self,
        command: FloorNLPCommand,
        batch: CommandBatch,
        policy_plan: PolicyPlan | None,
    ) -> dict[str, Any]:
        if policy_plan is None:
            return {
                "status": "unsupported",
                "summary": (
                    "Toilet insertion could not find a feasible donor room on this floor."
                ),
                "command": command.model_dump(),
                "command_batch": batch.model_dump(),
            }

        if policy_plan.get("status") == "planned":
            donor_name = policy_plan.get("donor_room_name") or "adjacent room"
            anchor_name = policy_plan.get("anchor_room_name")
            title = (
                f"Split '{donor_name}' to insert a toilet"
                if anchor_name is None
                else f"Insert a toilet near '{anchor_name}' by shrinking '{donor_name}'"
            )
            return {
                "status": "alternatives",
                "summary": (
                    "Toilet insertion is handled as a planning-assist request in this demo. "
                    "Review the feasibility and donor-room impact first."
                ),
                "command": command.model_dump(),
                "command_batch": batch.model_dump(),
                "policy_plan": policy_plan,
                "alternatives": [
                    {
                        "alternative_id": "insert-toilet-primary",
                        "title": title,
                        "description": (
                            f"Use '{donor_name}' as the donor room and reserve space for a toilet "
                            "after detailed geometry and opening review."
                        ),
                        "fill": {
                            "target_room_name": anchor_name or donor_name,
                            "target_floor": command.target_floor,
                            "action": "insert_toilet",
                        },
                        "affected_entities": [
                            item
                            for item in [
                                policy_plan.get("anchor_room_id"),
                                policy_plan.get("donor_room_id"),
                            ]
                            if item is not None
                        ],
                        "warnings": [
                            "This branch does not auto-apply toilet insertion IFC changes.",
                            "Donor room quality, wall topology, and opening "
                            "conflicts must be reviewed.",
                        ],
                        "metrics": [
                            f"preferred_width_mm={policy_plan.get('preferred_width_mm')}",
                            f"preferred_height_mm={policy_plan.get('preferred_height_mm')}",
                            f"donor_room_name={donor_name}",
                        ],
                    }
                ],
            }

        if policy_plan.get("status") == "needs_clarification":
            return {
                "status": "needs_clarification",
                "summary": self._policy_summary(policy_plan),
                "command": command.model_dump(),
                "command_batch": batch.model_dump(),
                "policy_plan": policy_plan,
            }

        return {
            "status": "unsupported",
            "summary": self._policy_summary(policy_plan),
            "command": command.model_dump(),
            "command_batch": batch.model_dump(),
            "policy_plan": policy_plan,
        }

    def _remove_room_alternatives_preview(
        self,
        command: FloorNLPCommand,
        batch: CommandBatch,
        policy_plan: PolicyPlan | None,
    ) -> dict[str, Any]:
        if policy_plan is None:
            return {
                "status": "needs_clarification",
                "summary": (
                    "Room removal needs additional review before any IFC change can be applied."
                ),
                "command": command.model_dump(),
                "command_batch": batch.model_dump(),
            }

        if policy_plan.get("status") == "planned":
            merge_target_id_value = policy_plan.get("merge_target_space_id")
            merge_target_id = (
                merge_target_id_value if isinstance(merge_target_id_value, str) else None
            )
            merge_target_name = self._space_name(merge_target_id) or "adjacent room"
            target_name = command.target_room_name or "selected room"
            return {
                "status": "alternatives",
                "summary": (
                    "Room removal is handled as a planning-assist request in this demo. "
                    "Review the proposed merge alternative first."
                ),
                "command": command.model_dump(),
                "command_batch": batch.model_dump(),
                "policy_plan": policy_plan,
                "alternatives": [
                    {
                        "alternative_id": "merge-primary",
                        "title": f"Merge into '{merge_target_name}'",
                        "description": (
                            f"Remove '{target_name}' and absorb it into '{merge_target_name}'."
                        ),
                        "fill": {
                            "target_room_name": target_name,
                            "target_floor": command.target_floor,
                        },
                        "affected_entities": [
                            item
                            for item in [
                                policy_plan.get("target_space_id"),
                                merge_target_id,
                            ]
                            if item is not None
                        ],
                        "warnings": [
                            "This demo does not auto-apply room removal. "
                            "Review the IFC impact first."
                        ],
                        "metrics": [
                            "shared_contact_mm="
                            f"{policy_plan.get('shared_contact_length_mm') or 0.0}",
                        ],
                    }
                ],
            }

        return {
            "status": "needs_clarification",
            "summary": self._policy_summary(policy_plan),
            "command": command.model_dump(),
            "command_batch": batch.model_dump(),
            "policy_plan": policy_plan,
        }

    def _build_floor_alternatives(self, command: FloorNLPCommand) -> list[dict[str, Any]]:
        """동일 이름 방이 복수 층에 있을 때 층 선택 alternatives를 생성한다."""
        if command.action not in {"remove_room", "resize_room"}:
            return []
        target_name = command.target_room_name
        if not target_name or self.ifc_context is None:
            return []
        spaces = self.ifc_context.get("spaces", [])
        matching = [s for s in spaces if s.get("name") == target_name]
        if len(matching) < 2:
            return []
        action_label = "삭제" if command.action == "remove_room" else "변경"
        alternatives = []
        for space in sorted(matching, key=lambda s: s.get("floor", 0)):
            floor = space.get("floor", 0)
            alternatives.append(
                {
                    "alternative_id": f"{command.action}-{target_name}-{floor}f",
                    "title": f"{floor}층 {target_name} {action_label}",
                    "description": f"{floor}층 {target_name}에 대해 작업합니다.",
                    "fill": {"target_floor": floor, "target_room_name": target_name},
                    "affected_entities": [space["id"]] if space.get("id") else [],
                    "warnings": [],
                    "metrics": [],
                }
            )
        return alternatives

    def _space_name(self, space_id: str | None) -> str | None:
        if space_id is None or self.ifc_context is None:
            return None
        for space in self.ifc_context.get("spaces", []):
            if space.get("id") == space_id:
                return space.get("name")
        return None

    def _shared_payload(
        self,
        *,
        mode: str,
        request_id: str,
        command: FloorNLPCommand,
        command_batch: CommandBatch,
        policy_plan: PolicyPlan | None,
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
    ) -> PolicyPlan | None:
        if self.ifc_context is None:
            return None

        if command.action == "remove_room":
            target_space_id = batch.commands[0].target_id
            if target_space_id is None:
                return None
            preferred_merge_target_space_id = None
            if command.adjacency_target and self.ifc_context is not None:
                preferred_merge_target_space_id = next(
                    (
                        space["id"]
                        for space in self.ifc_context.get("spaces", [])
                        if space.get("name") == command.adjacency_target
                        and (
                            command.target_floor is None
                            or space.get("floor") == command.target_floor
                        )
                    ),
                    None,
                )
            return plan_remove_room(
                target_space_id=target_space_id,
                preferred_merge_target_space_id=preferred_merge_target_space_id,
                ifc_context=self.ifc_context,
            )

        if command.action == "resize_room":
            target_space_id = batch.commands[0].target_id
            if target_space_id is None:
                return None
            return plan_resize_room(
                target_space_id=target_space_id,
                new_width=command.resize_width or 0,
                new_height=command.resize_height or 0,
                preferred_direction=command.resize_direction,
                ifc_context=self.ifc_context,
            )

        if command.action == "insert_toilet":
            floor = command.target_floor or 1
            user_intent_value = command.user_intent or "shared_toilet_any_strategy"
            if user_intent_value not in {
                "shared_toilet_any_strategy",
                "shared_toilet_corridor_carve",
                "shared_toilet_split_big_room",
            }:
                user_intent_value = "shared_toilet_any_strategy"
            plan = build_toilet_insertion_geometry_plan(
                self.ifc_context,
                floor=floor,
                anchor_room_name=command.target_room_name,
                user_intent=cast(ToiletDemoUserIntent, user_intent_value),
            )
            if plan is None:
                return {
                    "status": "unsupported",
                    "reason": "insert_toilet_no_adjacent_donor",
                }
            if plan.get("status") == "needs_clarification":
                return {
                    "status": "needs_clarification",
                    "reason": "insert_toilet_needs_clarification",
                    **plan,
                }
            if plan.get("status") == "rejected":
                return {
                    "status": "unsupported",
                    "reason": "insert_toilet_rejected",
                    **plan,
                }
            return {
                "status": "planned",
                "reason": "insert_toilet_demo",
                **plan,
            }

        return None

    def _preview_summary(
        self,
        command: FloorNLPCommand,
        batch: CommandBatch,
        policy_plan: PolicyPlan | None,
    ) -> str:
        if command.action == "add_room":
            name = command.new_room.name if command.new_room else "room"
            return f"'{name}' room preview is ready."
        if command.action == "insert_toilet" and policy_plan is not None:
            donor = policy_plan.get("donor_room_name") or "adjacent room"
            anchor = policy_plan.get("anchor_room_name") or command.target_room_name
            if anchor is None:
                return (
                    f"Public toilet insertion preview is ready "
                    f"using '{donor}' as the donor room."
                )
            return (
                f"Toilet insertion preview is ready near '{anchor}' "
                f"using '{donor}' as the donor room."
            )
        if command.action in {"remove_room", "resize_room"} and policy_plan is not None:
            return self._policy_summary(policy_plan)
        return f"Preview is ready for {len(batch.commands)} commands."

    def _policy_summary(self, policy_plan: PolicyPlan | None) -> str:
        if policy_plan is None:
            return "Policy preview is ready."

        reason = policy_plan.get("reason")
        if reason == "dominant_adjacent_absorber":
            return "A dominant adjacent absorber was found for room removal."
        if reason == "preferred_adjacent_absorber":
            return "The requested adjacent merge target can absorb the removed room."
        if reason == "multiple_similar_absorbers":
            return "Multiple adjacent absorber candidates exist and clarification is needed."
        if reason == "preferred_absorber_not_adjacent":
            return "The requested merge target is not adjacent to the removed room."
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
        if reason == "resize_outside_boundary":
            return "Resize is unsupported because the result would leave the floor boundary."
        if reason == "non_rectangular_space":
            return "Resize is unsupported for non-rectangular rooms."
        if reason == "locked_room":
            return "The target room is locked."
        if reason == "room_not_found":
            return "The target room was not found."
        if reason == "insert_toilet_demo":
            donor = policy_plan.get("donor_room_name") or "adjacent room"
            anchor = policy_plan.get("anchor_room_name")
            if anchor is None:
                return f"Public toilet insertion can proceed by shrinking {donor}."
            return f"Toilet insertion can proceed near {anchor} by shrinking {donor}."
        if reason == "insert_toilet_no_adjacent_donor":
            return "No adjacent donor room was found for toilet insertion."
        return f"Policy result: {reason}"

    def _engine_capabilities(self) -> dict[str, Any]:
        return {
            "shared_payload": True,
            "shared_handlers_expected": [
                "create_element",
                "delete_wall_void",
                "delete_elements",
                "transform_elements",
                "update_element_properties",
            ],
            "shared_orchestration_attached": True,
            "preferred_apply_mode": "shared_authoring",
            "local_fallback_actions": sorted(_LOCAL_APPLY_ONLY_ACTIONS),
        }
