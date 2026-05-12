from pathlib import Path

import ifcopenshell
import pytest

from ai_planning_2d import LLM2DPipeline, FloorNLPCommand, extract_ifc_context


HOUSE_KR_PATH = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
PARAMETRIC_DOOR_ID = "1Oms875aH3Wg$9l65H2ZGw"
PARAMETRIC_DOOR_OPENING_ID = "0LM8GvGe$G3dlW4mZ4aA9R"
PARAMETRIC_WINDOW_ID = "1srAI$R4T8ihLXSNHmUSET"
PARAMETRIC_WINDOW_OPENING_ID = "0seqbT9MlcQAX_K0YLzD86"
BCR_WINDOW_ID = "1zOBw0Gej5Wf0QAJfHnOc0"
DIRECT_OPENING_ID = "16PF6khT5_p$Z03P73inyv"


def _assert_deleted_ids_are_unreferenced(
    model: ifcopenshell.file,
    deleted_ids: set[str],
) -> None:
    relation_specs = [
        ("IfcRelFillsElement", ("RelatedBuildingElement", "RelatingOpeningElement")),
        ("IfcRelVoidsElement", ("RelatingOpeningElement", "RelatingBuildingElement")),
        ("IfcRelContainedInSpatialStructure", ("RelatedElements",)),
        ("IfcRelDefinesByType", ("RelatedObjects",)),
        ("IfcRelDefinesByProperties", ("RelatedObjects",)),
        ("IfcRelAssociatesMaterial", ("RelatedObjects",)),
    ]
    for relation_name, attributes in relation_specs:
        for relation in model.by_type(relation_name):
            for attribute in attributes:
                value = getattr(relation, attribute, None)
                if value is None:
                    continue
                if isinstance(value, tuple):
                    related_ids = {
                        item.GlobalId for item in value if getattr(item, "GlobalId", None)
                    }
                    assert deleted_ids.isdisjoint(related_ids)
                    continue
                related_id = getattr(value, "GlobalId", None)
                if related_id is not None:
                    assert related_id not in deleted_ids


@pytest.mark.asyncio
async def test_pipeline_preview_delete_wall_void_on_house_kr_parametric_door() -> None:
    ctx = extract_ifc_context(str(HOUSE_KR_PATH))
    pipeline = LLM2DPipeline(ifc_path=str(HOUSE_KR_PATH), ifc_context=ctx)
    command = FloorNLPCommand(
        action="delete_wall_void",
        target_element_id=PARAMETRIC_DOOR_ID,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "preview_ready"
    assert preview["engine_request"]["operations"][0]["type"] == "delete_wall_void"
    assert preview["command_batch"]["commands"][0]["action"] == "delete_wall_void"


@pytest.mark.asyncio
async def test_pipeline_preview_delete_wall_void_rejects_bcr_hosted_window() -> None:
    ctx = extract_ifc_context(str(HOUSE_KR_PATH))
    pipeline = LLM2DPipeline(ifc_path=str(HOUSE_KR_PATH), ifc_context=ctx)
    command = FloorNLPCommand(
        action="delete_wall_void",
        target_element_id=BCR_WINDOW_ID,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert "BCR" in preview["summary"]


@pytest.mark.asyncio
async def test_pipeline_preview_delete_wall_void_rejects_opening_target() -> None:
    ctx = extract_ifc_context(str(HOUSE_KR_PATH))
    pipeline = LLM2DPipeline(ifc_path=str(HOUSE_KR_PATH), ifc_context=ctx)
    command = FloorNLPCommand(
        action="delete_wall_void",
        target_element_id=DIRECT_OPENING_ID,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "needs_clarification"
    assert "opening" in preview["summary"]


@pytest.mark.asyncio
async def test_pipeline_apply_delete_wall_void_on_house_kr_parametric_door(tmp_path) -> None:
    output_path = str(tmp_path / "house-kr-delete-door.ifc")
    ctx = extract_ifc_context(str(HOUSE_KR_PATH))
    pipeline = LLM2DPipeline(ifc_path=str(HOUSE_KR_PATH), ifc_context=ctx)
    command = FloorNLPCommand(
        action="delete_wall_void",
        target_element_id=PARAMETRIC_DOOR_ID,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    updated = ifcopenshell.open(output_path)
    updated_ctx = extract_ifc_context(output_path)

    assert preview["status"] == "preview_ready"
    assert result["status"] == "applied"
    assert result["apply_mode"] == "shared_authoring"
    assert result["affected_ids"] == [PARAMETRIC_DOOR_ID]
    with pytest.raises(RuntimeError):
        updated.by_guid(PARAMETRIC_DOOR_ID)
    with pytest.raises(RuntimeError):
        updated.by_guid(PARAMETRIC_DOOR_OPENING_ID)
    assert len(updated.by_type("IfcDoor")) == len(ctx["doors"]) - 1
    assert len(updated_ctx["openings"]) == len(ctx["openings"]) - 1
    _assert_deleted_ids_are_unreferenced(updated, {PARAMETRIC_DOOR_ID, PARAMETRIC_DOOR_OPENING_ID})


@pytest.mark.asyncio
async def test_pipeline_apply_delete_wall_void_on_house_kr_parametric_window(tmp_path) -> None:
    output_path = str(tmp_path / "house-kr-delete-window.ifc")
    ctx = extract_ifc_context(str(HOUSE_KR_PATH))
    pipeline = LLM2DPipeline(ifc_path=str(HOUSE_KR_PATH), ifc_context=ctx)
    command = FloorNLPCommand(
        action="delete_wall_void",
        target_element_id=PARAMETRIC_WINDOW_ID,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    updated = ifcopenshell.open(output_path)
    updated_ctx = extract_ifc_context(output_path)

    assert preview["status"] == "preview_ready"
    assert result["status"] == "applied"
    assert result["apply_mode"] == "shared_authoring"
    assert result["affected_ids"] == [PARAMETRIC_WINDOW_ID]
    with pytest.raises(RuntimeError):
        updated.by_guid(PARAMETRIC_WINDOW_ID)
    with pytest.raises(RuntimeError):
        updated.by_guid(PARAMETRIC_WINDOW_OPENING_ID)
    assert len(updated.by_type("IfcWindow")) == len(ctx["windows"]) - 1
    assert len(updated_ctx["openings"]) == len(ctx["openings"]) - 1
    _assert_deleted_ids_are_unreferenced(
        updated,
        {PARAMETRIC_WINDOW_ID, PARAMETRIC_WINDOW_OPENING_ID},
    )
