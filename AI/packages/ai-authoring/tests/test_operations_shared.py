from __future__ import annotations

import json

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.root
import ifcopenshell.guid
import pytest

from ai_authoring import apply_ifc_edit_payload
import ai_authoring.operations  # noqa: F401
import ai_authoring.operations.update_element_properties as update_element_properties
from ai_authoring.operations.registry import all_types, get
from ai_domain import IfcEditCommandPayload


def _make_model() -> dict[str, ifcopenshell.entity_instance | ifcopenshell.file]:
    model = ifcopenshell.file(schema="IFC4")
    project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="Project")
    site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="L1")
    storey.Elevation = 0.0

    model_ctx = model.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Model",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        ),
    )
    project.RepresentationContexts = [model_ctx]

    ifcopenshell.api.aggregate.assign_object(model, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(model, products=[building], relating_object=site)
    ifcopenshell.api.aggregate.assign_object(model, products=[storey], relating_object=building)
    return {"model": model, "storey": storey}


def _add_metre_length_unit(model: ifcopenshell.file) -> None:
    unit = model.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Prefix=None, Name="METRE")
    model.create_entity("IfcUnitAssignment", Units=[unit])


def _make_wall(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    *,
    start: tuple[float, float],
    end: tuple[float, float],
) -> ifcopenshell.entity_instance:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = (dx**2 + dy**2) ** 0.5
    ref_direction = (dx / length, dy / length, 0.0)
    wall = ifcopenshell.api.root.create_entity(model, ifc_class="IfcWallStandardCase", name="Wall")
    wall.ObjectPlacement = model.create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=getattr(storey, "ObjectPlacement", None),
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity(
                "IfcCartesianPoint",
                Coordinates=(start[0], start[1], 0.0),
            ),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=ref_direction),
        ),
    )
    axis = model.create_entity(
        "IfcShapeRepresentation",
        RepresentationIdentifier="Axis",
        RepresentationType="Curve2D",
        Items=[
            model.create_entity(
                "IfcPolyline",
                Points=[
                    model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0)),
                    model.create_entity("IfcCartesianPoint", Coordinates=(length, 0.0)),
                ],
            )
        ],
    )
    body = model.create_entity(
        "IfcShapeRepresentation",
        RepresentationIdentifier="Body",
        RepresentationType="Clipping",
        Items=[
            model.create_entity(
                "IfcExtrudedAreaSolid",
                SweptArea=model.create_entity(
                    "IfcArbitraryClosedProfileDef",
                    ProfileType="AREA",
                    OuterCurve=model.create_entity(
                        "IfcPolyline",
                        Points=[
                            model.create_entity("IfcCartesianPoint", Coordinates=(0.3, -0.3)),
                            model.create_entity(
                                "IfcCartesianPoint", Coordinates=(length - 0.3, -0.3)
                            ),
                            model.create_entity("IfcCartesianPoint", Coordinates=(length, 0.0)),
                            model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0)),
                            model.create_entity("IfcCartesianPoint", Coordinates=(0.3, -0.3)),
                        ],
                    ),
                ),
                Position=model.create_entity(
                    "IfcAxis2Placement3D",
                    Location=model.create_entity(
                        "IfcCartesianPoint",
                        Coordinates=(0.0, 0.0, 0.0),
                    ),
                    Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
                    RefDirection=model.create_entity(
                        "IfcDirection",
                        DirectionRatios=(1.0, 0.0, 0.0),
                    ),
                ),
                ExtrudedDirection=model.create_entity(
                    "IfcDirection",
                    DirectionRatios=(0.0, 0.0, 1.0),
                ),
                Depth=3.5,
            )
        ],
    )
    box = model.create_entity(
        "IfcShapeRepresentation",
        RepresentationIdentifier="Box",
        RepresentationType="BoundingBox",
        Items=[
            model.create_entity(
                "IfcBoundingBox",
                Corner=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, -0.3, 0.0)),
                XDim=length,
                YDim=0.3,
                ZDim=3.5,
            )
        ],
    )
    wall.Representation = model.create_entity(
        "IfcProductDefinitionShape",
        Representations=[body, box, axis],
    )
    return wall


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
        (1000.0, 2000.0, 0.0)
    )
    body = space.Representation.Representations[0].Items[0]
    assert body.SweptArea.XDim == pytest.approx(3200.0)
    assert body.SweptArea.YDim == pytest.approx(2800.0)
    assert tuple(body.SweptArea.Position.Location.Coordinates) == pytest.approx(
        (1600.0, 1400.0)
    )
    assert body.Depth == pytest.approx(2700.0)
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
        (1000.0, 0.0, 0.0)
    )
    body = space.Representation.Representations[0].Items[0]
    assert body.SweptArea.XDim == pytest.approx(5000.0)
    assert space.Name == "Updated"


def test_create_element_wall_preserves_diagonal_start_end_direction() -> None:
    bundle = _make_model()
    create_handler = get("create_element")

    wall = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcWall",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "end_mm": {"x": 3000.0, "y": 4000.0, "z": 0.0},
            "dimensions_mm": {"width": 200.0, "height": 2400.0},
        },
    )

    assert wall is not None
    ref_direction = wall.ObjectPlacement.RelativePlacement.RefDirection.DirectionRatios
    assert tuple(ref_direction) == pytest.approx((0.6, 0.8, 0.0))


def test_update_element_properties_unwraps_space_dimension_values() -> None:
    bundle = _make_model()
    create_handler = get("create_element")
    update_handler = get("update_element_properties")

    space = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"width": 3000, "height": 4000},
            "properties": {"name": "Wrapped Dimension Space"},
        },
    )
    assert space is not None

    updated = update_handler.execute(
        bundle["model"],
        None,
        {
            "dimensions_mm": {
                "width": {"mode": "ABSOLUTE", "value": 5000},
                "height": {"mode": "ABSOLUTE", "value": 4200},
            }
        },
        {"global_ids": [space.GlobalId]},
    )

    assert updated == [space.GlobalId]
    body = space.Representation.Representations[0].Items[0]
    assert body.SweptArea.XDim == pytest.approx(5000.0)
    assert body.SweptArea.YDim == pytest.approx(4200.0)


def test_update_element_properties_accepts_wrapped_wall_dimensions() -> None:
    bundle = _make_model()
    _add_metre_length_unit(bundle["model"])
    create_handler = get("create_element")
    update_handler = get("update_element_properties")

    wall = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcWall",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "end_mm": {"x": 3000.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"width": 200.0, "height": 2400.0},
        },
    )
    assert wall is not None

    updated = update_handler.execute(
        bundle["model"],
        None,
        {
            "dimensions_mm": {
                "length": {"mode": "ABSOLUTE", "value": 4500.0},
                "width": {"mode": "ABSOLUTE", "value": 250.0},
                "height": {"mode": "ABSOLUTE", "value": 2800.0},
            }
        },
        {"global_ids": [wall.GlobalId]},
    )

    assert updated == [wall.GlobalId]
    body = wall.Representation.Representations[0].Items[0]
    assert body.SweptArea.XDim == pytest.approx(4.5)
    assert body.SweptArea.YDim == pytest.approx(0.25)
    assert body.Depth == pytest.approx(2.8)


@pytest.mark.parametrize(
    ("ifc_class", "expected_propagation"),
    [("IfcWall", False), ("IfcRoof", True)],
)
def test_update_element_properties_limits_roof_appearance_propagation_to_roofs(
    monkeypatch,
    ifc_class: str,
    expected_propagation: bool,
) -> None:
    calls: list[dict[str, object]] = []

    def fake_modify_color(*args: object, **kwargs: object) -> bool:
        del args
        calls.append(dict(kwargs))
        return True

    monkeypatch.setattr(update_element_properties, "modify_color", fake_modify_color)
    bundle = _make_model()
    product = bundle["model"].create_entity(
        ifc_class,
        GlobalId=ifcopenshell.guid.new(),
        Name=f"Test {ifc_class}",
    )
    update_handler = get("update_element_properties")

    updated = update_handler.execute(
        bundle["model"],
        None,
        {"color": "#3B82F6", "propagate_roof_appearance": True},
        {"global_ids": [product.GlobalId]},
    )

    assert updated == [product.GlobalId]
    assert calls == [
        {
            "propagate_mapped_sources": expected_propagation,
            "propagate_roof_descendants": expected_propagation,
        }
    ]


def test_update_element_properties_skips_space_pset_name_only_update() -> None:
    bundle = _make_model()
    create_handler = get("create_element")
    update_handler = get("update_element_properties")

    space = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"width": 3000, "height": 4000},
            "properties": {"name": "Noop Space"},
        },
    )
    assert space is not None

    updated = update_handler.execute(
        bundle["model"],
        None,
        {"pset_name": "Batang_SpaceDimensions"},
        {"global_ids": [space.GlobalId]},
    )

    assert updated == []


def test_transform_translation_units_do_not_depend_on_rotation() -> None:
    bundle = _make_model()
    create_handler = get("create_element")
    transform_handler = get("transform_elements")

    space_translate_only = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"width": 1000, "height": 1000},
            "properties": {"name": "Translate Only"},
        },
    )
    space_translate_rotate = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 2000.0, "z": 0.0},
            "dimensions_mm": {"width": 1000, "height": 1000},
            "properties": {"name": "Translate Rotate"},
        },
    )
    assert space_translate_only is not None
    assert space_translate_rotate is not None

    transform_handler.execute(
        bundle["model"],
        None,
        {"translate_mm": {"x": 1000.0, "y": 0.0, "z": 0.0}},
        {"global_ids": [space_translate_only.GlobalId]},
    )
    transform_handler.execute(
        bundle["model"],
        None,
        {
            "translate_mm": {"x": 1000.0, "y": 0.0, "z": 0.0},
            "rotation_deg": {"z": 45.0},
        },
        {"global_ids": [space_translate_rotate.GlobalId]},
    )

    translate_only_x = float(
        space_translate_only.ObjectPlacement.RelativePlacement.Location.Coordinates[0]
    )
    translate_rotate_x = float(
        space_translate_rotate.ObjectPlacement.RelativePlacement.Location.Coordinates[0]
    )
    assert translate_only_x == pytest.approx(translate_rotate_x)
    assert translate_rotate_x == pytest.approx(1000.0)


def test_transform_handler_accepts_legacy_zero_xy_z_rotation() -> None:
    bundle = _make_model()
    create_handler = get("create_element")
    transform_handler = get("transform_elements")

    space = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"width": 1000, "height": 1000},
            "properties": {"name": "Legacy Z Rotation"},
        },
    )
    assert space is not None

    moved = transform_handler.execute(
        bundle["model"],
        None,
        {"rotation_deg": {"x": 0.0, "y": 0.0, "z": 45.0}},
        {"global_ids": [space.GlobalId]},
    )

    assert moved == [space.GlobalId]


@pytest.mark.parametrize("axis", ["x", "y"])
def test_transform_handler_rejects_legacy_xy_rotation(axis: str) -> None:
    bundle = _make_model()
    create_handler = get("create_element")
    transform_handler = get("transform_elements")

    space = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"width": 1000, "height": 1000},
            "properties": {"name": "Reject Legacy Rotation"},
        },
    )
    assert space is not None

    with pytest.raises(ValueError, match="legacy rotation_deg only supports z"):
        transform_handler.execute(
            bundle["model"],
            None,
            {"rotation_deg": {axis: 30.0, "z": 45.0}},
            {"global_ids": [space.GlobalId]},
        )


def test_transform_handler_does_not_mutate_shared_location_point() -> None:
    bundle = _make_model()
    transform_handler = get("transform_elements")
    shared_point = bundle["model"].create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0))
    placement_a = bundle["model"].create_entity(
        "IfcLocalPlacement",
        RelativePlacement=bundle["model"].create_entity(
            "IfcAxis2Placement3D",
            Location=shared_point,
            Axis=bundle["model"].create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=bundle["model"].create_entity(
                "IfcDirection",
                DirectionRatios=(1.0, 0.0, 0.0),
            ),
        ),
    )
    placement_b = bundle["model"].create_entity(
        "IfcLocalPlacement",
        RelativePlacement=bundle["model"].create_entity(
            "IfcAxis2Placement3D",
            Location=shared_point,
            Axis=bundle["model"].create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=bundle["model"].create_entity(
                "IfcDirection",
                DirectionRatios=(1.0, 0.0, 0.0),
            ),
        ),
    )
    space_a = ifcopenshell.api.root.create_entity(bundle["model"], ifc_class="IfcSpace", name="A")
    space_b = ifcopenshell.api.root.create_entity(bundle["model"], ifc_class="IfcSpace", name="B")
    space_a.ObjectPlacement = placement_a
    space_b.ObjectPlacement = placement_b

    moved = transform_handler.execute(
        bundle["model"],
        None,
        {"translate_mm": {"x": 1000.0, "y": 0.0, "z": 0.0}},
        {"global_ids": [space_a.GlobalId]},
    )

    assert moved == [space_a.GlobalId]
    assert tuple(space_a.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (1000.0, 0.0, 0.0)
    )
    assert tuple(space_b.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (0.0, 0.0, 0.0)
    )


def test_transform_space_does_not_move_boundary_wall() -> None:
    bundle = _make_model()
    create_handler = get("create_element")
    transform_handler = get("transform_elements")
    space = create_handler.execute(
        bundle["model"],
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": bundle["storey"].GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"width": 3000, "height": 4000},
            "properties": {"name": "Bathroom", "space_type": "bathroom"},
        },
    )
    wall = _make_wall(bundle["model"], bundle["storey"], start=(0.0, 0.0), end=(3000.0, 0.0))
    assert space is not None
    bundle["model"].create_entity(
        "IfcRelSpaceBoundary",
        GlobalId=ifcopenshell.guid.new(),
        Name="Bathroom boundary",
        RelatingSpace=space,
        RelatedBuildingElement=wall,
        PhysicalOrVirtualBoundary="PHYSICAL",
        InternalOrExternalBoundary="INTERNAL",
    )

    moved = transform_handler.execute(
        bundle["model"],
        None,
        {"translate_mm": {"x": 1000.0, "y": 2000.0, "z": 0.0}},
        {"global_ids": [space.GlobalId]},
    )

    assert moved == [space.GlobalId]
    assert tuple(space.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (1000.0, 2000.0, 0.0)
    )
    assert tuple(wall.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        (0.0, 0.0, 0.0)
    )


def test_update_element_properties_supports_wall_segment() -> None:
    bundle = _make_model()
    update_handler = get("update_element_properties")
    wall = _make_wall(bundle["model"], bundle["storey"], start=(0.0, 10.0), end=(12.0, 10.0))

    updated = update_handler.execute(
        bundle["model"],
        None,
        {
            "segment_mm": {
                "start": {"x": 1000.0, "y": 10000.0},
                "end": {"x": 12000.0, "y": 10000.0},
            }
        },
        {"global_ids": [wall.GlobalId]},
    )

    assert updated == [wall.GlobalId]
    placement = wall.ObjectPlacement.RelativePlacement
    assert tuple(placement.Location.Coordinates) == pytest.approx((1.0, 10.0, 0.0))
    axis = next(
        rep for rep in wall.Representation.Representations if rep.RepresentationIdentifier == "Axis"
    )
    axis_points = [tuple(point.Coordinates) for point in axis.Items[0].Points]
    assert axis_points == pytest.approx([(0.0, 0.0), (11.0, 0.0)])


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
