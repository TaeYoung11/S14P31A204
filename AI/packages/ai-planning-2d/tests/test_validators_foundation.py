from __future__ import annotations

from ai_planning_2d.preview_validators import PreviewValidationResult, validate_preview_plan
from ai_planning_2d.schemas.command import ActionType, CommandBatch, FloorNLPCommand, IFCCommand
from ai_planning_2d.validator import validate_command_batch

from _fixtures.synthetic import make_minimal_ifc_context


def test_validate_command_batch_import_path_still_returns_clarification() -> None:
    batch = CommandBatch(
        commands=[
            IFCCommand(
                action=ActionType.CREATE_SPACE,
                target_id=None,
                params={
                    "geometry": {"dimensions": {"width": 100, "height": 200}},
                    "properties": {"shape": "rect"},
                },
                confidence=0.8,
            )
        ],
        requires_clarification=False,
    )

    result = validate_command_batch(batch)

    assert result.requires_clarification is True
    assert result.clarification_question is not None


def test_validate_preview_plan_import_path_still_returns_dataclass_result() -> None:
    result = validate_preview_plan(
        command=FloorNLPCommand(
            action="remove_room",
            target_room_name="거실",
            target_floor=1,
            confidence=0.9,
        ),
        policy_plan={"status": "planned", "remove_opening_ids": ["door-1"]},
        ifc_context=make_minimal_ifc_context(),
    )

    assert isinstance(result, PreviewValidationResult)
    assert result.ok is True
    assert result.warnings
