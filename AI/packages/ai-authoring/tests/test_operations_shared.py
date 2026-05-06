from __future__ import annotations

import json

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.root
import pytest

from ai_authoring import apply_ifc_edit_payload
import ai_authoring.operations  # noqa: F401
from ai_authoring.operations.registry import all_types, get
from ai_domain import IfcEditCommandPayload


def _make_model() -> dict[str, ifcopenshell.entity_instance | ifcopenshell.file]:
    model = ifcopenshell.file(schema="IFC4")
    project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="Project")
    site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="L1")
    storey.Elevation = 0.0

    ifcopenshell.api.aggregate.assign_object(model, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(model, products=[building], relating_object=site)
    ifcopenshell.api.aggregate.assign_object(model, products=[storey], relating_object=building)
    return {"model": model, "storey": storey}


def test_shared_operation_registry_contains_2d_handlers() -> None:
    expected = {
        "create_element",
        "delete_elements",
        "transform_elements",
        "update_element_properties",
    }
    assert expected <= set(all_types())


def test_create_element_supports_ifc_space_with_storey_id() -> None:
    bundle = _make_model()
    handler = get("create_element")

    space = handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": bundle["storey"].GlobalId,
            "pset_name": "Batang_SpaceDimensions",
            "start_mm": {"x": 1000.0, "y": 2000.0, "z": 0.0},
            "dimensions_mm": {"width": 3200, "height": 2800},
            "properties": {
                "name": "Shared Room",
                "space_type": "office",
                "shape": "rect",
                "rects": [{"x": 0, "y": 0, "width": 3200, "height": 2800}],
                "locked": False,
            },
            "pset_updates": {
                "Batang_SpaceDimensions": {
                    "Width": 3200,
                    "Height": 2800,
                    "SpaceType": "office",
                    "Shape": "rect",
                }
            },
        },
    )

    assert space is not None
    assert space.is_a("IfcSpace")
    assert space.Name == "Shared Room"
    assert tuple(space.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (1.0, 2.0, 0.0)
    )
    body = space.Representation.Representations[0].Items[0]
    assert body.SweptArea.XDim == pytest.approx(3.2)
    assert body.SweptArea.YDim == pytest.approx(2.8)
    pset = next(
        rel.RelatingPropertyDefinition
        for rel in space.IsDefinedBy
        if rel.RelatingPropertyDefinition.Name == "Batang_SpaceDimensions"
    )
    props = {prop.Name: prop.NominalValue.wrappedValue for prop in pset.HasProperties}
    assert props["Width"] == 3200
    assert json.loads(props["Rects"]) == [{"x": 0, "y": 0, "width": 3200, "height": 2800}]


def test_transform_and_update_handlers_support_ifc_space() -> None:
    bundle = _make_model()
    create_handler = get("create_element")
    transform_handler = get("transform_elements")
    update_handler = get("update_element_properties")

    space = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"width": 3000, "height": 4000},
            "properties": {"name": "Mutable", "space_type": "living", "shape": "rect"},
        },
    )
    assert space is not None

    moved = transform_handler.execute(
        bundle["model"],
        None,
        {"translate_mm": {"x": 1000.0, "y": 0.0, "z": 0.0}},
        {"global_ids": [space.GlobalId]},
    )
    updated = update_handler.execute(
        bundle["model"],
        None,
        {
            "pset_name": "Batang_SpaceDimensions",
            "dimensions_mm": {"width": 5000, "height": 4000},
            "properties": {
                "name": "Updated",
                "shape": "rect",
                "rects": [{"x": 0, "y": 0, "width": 5000, "height": 4000}],
            },
            "pset_updates": {"Batang_SpaceDimensions": {"Width": 5000, "Height": 4000}},
        },
        {"global_ids": [space.GlobalId]},
    )

    assert moved == [space.GlobalId]
    assert updated == [space.GlobalId]
    assert tuple(space.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (1.0, 0.0, 0.0)
    )
    body = space.Representation.Representations[0].Items[0]
    assert body.SweptArea.XDim == pytest.approx(5.0)
    assert space.Name == "Updated"


def test_delete_elements_handler_removes_selected_product() -> None:
    bundle = _make_model()
    create_handler = get("create_element")
    delete_handler = get("delete_elements")
    space = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"width": 2000, "height": 2000},
            "properties": {"name": "Disposable"},
        },
    )
    assert space is not None
    space_id = space.GlobalId

    deleted = delete_handler.execute(
        bundle["model"],
        None,
        {"cascade": True},
        {"global_ids": [space_id]},
    )

    assert deleted == [space_id]
    with pytest.raises(RuntimeError):
        bundle["model"].by_guid(space_id)


def test_apply_ifc_edit_payload_runs_shared_authoring_roundtrip(tmp_path) -> None:
    bundle = _make_model()
    input_path = tmp_path / "shared-input.ifc"
    output_path = tmp_path / "shared-output.ifc"
    bundle["model"].write(str(input_path))

    payload = IfcEditCommandPayload.model_validate(
        {
            "engineRequest": {
                "schema_version": "v1",
                "request_id": "req-shared-1",
                "mode": "apply",
                "project_id": "proj-shared",
                "operations": [
                    {
                        "id": "op-create-space",
                        "type": "create_element",
                        "parameters": {
                            "element_type": "IfcSpace",
                            "storey_id": bundle["storey"].GlobalId,
                            "start_mm": {"x": 500.0, "y": 750.0, "z": 0.0},
                            "dimensions_mm": {"width": 2500, "height": 2200},
                            "properties": {
                                "name": "Payload Space",
                                "shape": "rect",
                                "space_type": "office",
                                "rects": [{"x": 0, "y": 0, "width": 2500, "height": 2200}],
                            },
                            "pset_name": "Batang_SpaceDimensions",
                            "pset_updates": {
                                "Batang_SpaceDimensions": {
                                    "Width": 2500,
                                    "Height": 2200,
                                    "SpaceType": "office",
                                }
                            },
                        },
                    }
                ],
            }
        }
    )

    result = apply_ifc_edit_payload(
        ifc_path=str(input_path),
        output_path=str(output_path),
        payload=payload,
    )

    assert result["status"] == "applied"
    assert len(result["created_ids"]) == 1
    updated = ifcopenshell.open(str(output_path))
    created = updated.by_guid(result["created_ids"][0])
    assert created is not None
    assert created.Name == "Payload Space"
