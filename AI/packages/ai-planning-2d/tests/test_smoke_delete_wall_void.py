from pathlib import Path

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.root
import ifcopenshell.api.unit
import pytest

from ai_planning_2d import LLM2DPipeline, FloorNLPCommand, extract_ifc_context


HOUSE_KR_PATH = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
PARAMETRIC_DOOR_ID = "1Oms875aH3Wg$9l65H2ZGw"
PARAMETRIC_DOOR_OPENING_ID = "0LM8GvGe$G3dlW4mZ4aA9R"
PARAMETRIC_WINDOW_ID = "1srAI$R4T8ihLXSNHmUSET"
PARAMETRIC_WINDOW_OPENING_ID = "0seqbT9MlcQAX_K0YLzD86"
BCR_WINDOW_ID = "1zOBw0Gej5Wf0QAJfHnOc0"
DIRECT_OPENING_ID = "16PF6khT5_p$Z03P73inyv"


def _write_ifc(tmp_path, model: ifcopenshell.file, name: str) -> str:
    path = tmp_path / name
    model.write(str(path))
    return str(path)


def _make_parametric_bare_opening_ifc() -> tuple[ifcopenshell.file, str]:
    model = ifcopenshell.file(schema="IFC4")
    project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="P")
    project.UnitsInContext = model.create_entity(
        "IfcUnitAssignment",
        Units=[
            model.create_entity(
                "IfcSIUnit",
                UnitType="LENGTHUNIT",
                Name="METRE",
            )
        ],
    )
    model_ctx = ifcopenshell.api.context.add_context(model, context_type="Model")
    body = ifcopenshell.api.context.add_context(
        model,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=model_ctx,
    )
    site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="S")
    building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="B")
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="1F")
    ifcopenshell.api.aggregate.assign_object(model, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(model, products=[building], relating_object=site)
    ifcopenshell.api.aggregate.assign_object(model, products=[storey], relating_object=building)

    wall = ifcopenshell.api.root.create_entity(model, ifc_class="IfcWall", name="Wall")
    axis3 = model.create_entity(
        "IfcAxis2Placement3D",
        Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
    )
    wall.ObjectPlacement = model.create_entity("IfcLocalPlacement", RelativePlacement=axis3)
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=5.0,
        YDim=0.2,
    )
    solid = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=axis3,
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=2.7,
    )
    shape = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=body,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[solid],
    )
    wall.Representation = model.create_entity("IfcProductDefinitionShape", Representations=[shape])
    ifcopenshell.api.aggregate.assign_object(model, products=[wall], relating_object=storey)

    opening = ifcopenshell.api.root.create_entity(
        model, ifc_class="IfcOpeningElement", name="Bare Opening"
    )
    opening.ObjectPlacement = model.create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=wall.ObjectPlacement,
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(1.0, 0.0, 1.0)),
        ),
    )
    model.create_entity(
        "IfcRelVoidsElement",
        GlobalId=ifcopenshell.guid.new(),
        RelatingBuildingElement=wall,
        RelatedOpeningElement=opening,
    )
    return model, opening.GlobalId


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
async def test_pipeline_preview_delete_wall_void_allows_bare_opening_on_parametric_host(
    tmp_path,
) -> None:
    model, opening_id = _make_parametric_bare_opening_ifc()
    input_path = _write_ifc(tmp_path, model, "bare-opening.ifc")
    ctx = extract_ifc_context(input_path)
    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=ctx)
    command = FloorNLPCommand(
        action="delete_wall_void",
        target_element_id=opening_id,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)

    assert preview["status"] == "preview_ready"
    assert preview["engine_request"]["operations"][0]["type"] == "delete_wall_void"


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


@pytest.mark.asyncio
async def test_pipeline_apply_delete_wall_void_on_parametric_bare_opening(tmp_path) -> None:
    model, opening_id = _make_parametric_bare_opening_ifc()
    input_path = _write_ifc(tmp_path, model, "bare-opening-apply.ifc")
    output_path = str(tmp_path / "bare-opening-result.ifc")
    ctx = extract_ifc_context(input_path)
    pipeline = LLM2DPipeline(ifc_path=input_path, ifc_context=ctx)
    command = FloorNLPCommand(
        action="delete_wall_void",
        target_element_id=opening_id,
        confidence=0.95,
    )

    preview = await pipeline.execute_command_preview(command)
    result = await pipeline.execute_apply(preview["session_id"], output_path=output_path)
    updated = ifcopenshell.open(output_path)

    assert preview["status"] == "preview_ready"
    assert result["status"] == "applied"
    assert result["affected_ids"] == [opening_id]
    with pytest.raises(RuntimeError):
        updated.by_guid(opening_id)
    assert len(updated.by_type("IfcOpeningElement")) == 0
    assert len(updated.by_type("IfcRelVoidsElement")) == 0
