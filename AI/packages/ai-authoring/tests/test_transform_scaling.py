from __future__ import annotations

import pytest

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.root
import ifcopenshell.guid
from ai_authoring.engine_3d import (
    create_wall,
    modify_height,
    modify_length,
    modify_position,
    modify_rotation,
    modify_thickness,
)
from ai_authoring.operations.space_support import transform_scope_for_product


def _make_model():
    model = ifcopenshell.file(schema="IFC4")
    project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="Project")
    site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="1F")
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
    return model, storey


def _add_storey(
    model: ifcopenshell.file,
    base_storey,
    name: str,
    elevation: float,
):
    building = base_storey.Decomposes[0].RelatingObject
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name=name)
    storey.Elevation = elevation
    ifcopenshell.api.aggregate.assign_object(model, products=[storey], relating_object=building)
    return storey


def _wall_solid(wall):
    body = next(
        rep
        for rep in wall.Representation.Representations
        if rep.RepresentationIdentifier == "Body"
    )
    return body.Items[0]


def _brep_points(brep):
    points = []
    seen = set()
    for face in brep.Outer.CfsFaces:
        for bound in face.Bounds:
            for point in bound.Bound.Polygon:
                key = point.id() if point.id() else id(point)
                if key in seen:
                    continue
                seen.add(key)
                points.append(point)
    return points


def _point_bounds(points):
    xs = [float(point.Coordinates[0]) for point in points]
    ys = [float(point.Coordinates[1]) for point in points]
    zs = [float(point.Coordinates[2]) if len(point.Coordinates) >= 3 else 0.0 for point in points]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


def _make_brep_roof(model):
    points = [
        model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        model.create_entity("IfcCartesianPoint", Coordinates=(4000.0, 0.0, 0.0)),
        model.create_entity("IfcCartesianPoint", Coordinates=(4000.0, 3000.0, 0.0)),
        model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 3000.0, 0.0)),
        model.create_entity("IfcCartesianPoint", Coordinates=(2000.0, 1500.0, 1000.0)),
    ]
    faces = []
    for indexes in ((0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)):
        loop = model.create_entity("IfcPolyLoop", Polygon=[points[index] for index in indexes])
        bound = model.create_entity("IfcFaceOuterBound", Bound=loop, Orientation=True)
        faces.append(model.create_entity("IfcFace", Bounds=[bound]))
    brep = model.create_entity(
        "IfcFacetedBrep",
        Outer=model.create_entity("IfcClosedShell", CfsFaces=faces),
    )
    context = model.by_type("IfcGeometricRepresentationContext")[0]
    body = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="Brep",
        Items=[brep],
    )
    shape = model.create_entity("IfcProductDefinitionShape", Representations=[body])
    placement = model.create_entity(
        "IfcLocalPlacement",
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        ),
    )
    roof = model.create_entity(
        "IfcRoof",
        GlobalId=ifcopenshell.guid.new(),
        Name="BrepRoof",
        ObjectPlacement=placement,
        Representation=shape,
    )
    return roof, brep


def test_wall_length_scale_updates_rectangle_profile():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_length(wall, {"mode": "SCALE", "value": 2.0})

    assert solid.SweptArea.XDim == pytest.approx(6000.0)


def test_wall_length_rejects_non_positive_result():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_length(wall, {"mode": "ABSOLUTE", "value": 0.0}) is False

    assert solid.SweptArea.XDim == pytest.approx(3000.0)


def test_wall_length_rejects_missing_value():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_length(wall, {"mode": "ABSOLUTE"}) is False

    assert solid.SweptArea.XDim == pytest.approx(3000.0)


def test_wall_width_and_height_use_mm_scale():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_thickness(wall, {"mode": "RELATIVE", "value": 100.0})
    assert modify_height(wall, {"mode": "ABSOLUTE", "value": 3000.0})

    assert solid.SweptArea.YDim == pytest.approx(300.0)
    assert solid.Depth == pytest.approx(3000.0)


def test_wall_position_noop_returns_false():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)

    assert modify_position(wall, {"mode": "RELATIVE", "x": 0.0, "y": 0.0, "z": 0.0}) is False


def test_wall_height_absolute_with_meter_model_scale():
    model, storey = _make_model()
    unit = model.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Prefix=None, Name="METRE")
    model.create_entity("IfcUnitAssignment", Units=[unit])
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_height(wall, {"mode": "ABSOLUTE", "value": 3000.0}, scale=1000.0)

    assert solid.Depth == pytest.approx(3.0)


def test_wall_height_rejects_value_above_next_storey():
    model, storey = _make_model()
    _add_storey(model, storey, "2F", 3000.0)
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_height(wall, {"mode": "ABSOLUTE", "value": 3200.0}) is False

    assert solid.Depth == pytest.approx(2400.0)


def test_wall_rotation_updates_placement_and_shape_coordinates():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_rotation(model, wall, 90.0)

    assert solid.SweptArea.is_a("IfcArbitraryClosedProfileDef")
    points = solid.SweptArea.OuterCurve.Points
    assert points[1].Coordinates[0] == pytest.approx(100.0)
    assert points[1].Coordinates[1] == pytest.approx(1500.0)
    assert solid.Position.Location.Coordinates[0] == pytest.approx(0.0)
    assert solid.Position.Location.Coordinates[1] == pytest.approx(0.0)
    assert all(
        rep.RepresentationIdentifier != "Box"
        for rep in wall.Representation.Representations
    )


def test_wall_rotation_can_be_applied_twice_after_polygon_profile_conversion():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_rotation(model, wall, 90.0)
    first_points = [tuple(point.Coordinates) for point in solid.SweptArea.OuterCurve.Points]
    assert modify_rotation(model, wall, 90.0)
    second_points = [tuple(point.Coordinates) for point in solid.SweptArea.OuterCurve.Points]

    assert second_points != first_points


def test_wall_length_scale_after_rotation_updates_polygon_profile():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_rotation(model, wall, 90.0)
    assert modify_length(wall, {"mode": "SCALE", "value": 2.0})

    min_x, max_x, *_ = _point_bounds(solid.SweptArea.OuterCurve.Points)
    assert max_x - min_x == pytest.approx(400.0)


def test_wall_width_scale_after_rotation_updates_polygon_profile():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_rotation(model, wall, 90.0)
    assert modify_thickness(wall, {"mode": "SCALE", "value": 2.0})

    _min_x, _max_x, min_y, max_y, *_ = _point_bounds(solid.SweptArea.OuterCurve.Points)
    assert max_y - min_y == pytest.approx(6000.0)


def test_brep_roof_length_scale_updates_vertices_about_center():
    model, _storey = _make_model()
    roof, brep = _make_brep_roof(model)

    assert modify_length(roof, {"mode": "SCALE", "value": 2.0})

    min_x, max_x, *_ = _point_bounds(_brep_points(brep))
    assert min_x == pytest.approx(-2000.0)
    assert max_x == pytest.approx(6000.0)


def test_brep_roof_rotation_updates_vertices_about_center():
    model, _storey = _make_model()
    roof, brep = _make_brep_roof(model)

    assert modify_rotation(model, roof, 180.0)

    min_x, max_x, min_y, max_y, *_ = _point_bounds(_brep_points(brep))
    assert min_x == pytest.approx(0.0)
    assert max_x == pytest.approx(4000.0)
    assert min_y == pytest.approx(0.0)
    assert max_y == pytest.approx(3000.0)
    assert brep.Outer.CfsFaces[0].Bounds[0].Bound.Polygon[0].Coordinates[0] == pytest.approx(
        4000.0
    )


def test_aggregate_roof_child_transform_rotates_parent_placement():
    model, _storey = _make_model()
    parent_placement = model.create_entity(
        "IfcLocalPlacement",
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        ),
    )
    roof = ifcopenshell.api.root.create_entity(model, ifc_class="IfcRoof", name="GroupedRoof")
    roof.ObjectPlacement = parent_placement
    slab = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSlab", name="RoofPart")
    slab.ObjectPlacement = model.create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=parent_placement,
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(10.0, 0.0, 0.0)),
        ),
    )
    ifcopenshell.api.aggregate.assign_object(model, products=[slab], relating_object=roof)

    assert transform_scope_for_product(model, slab) == [roof]
    assert modify_rotation(model, roof, 90.0)

    ref_dir = roof.ObjectPlacement.RelativePlacement.RefDirection
    assert tuple(ref_dir.DirectionRatios) == pytest.approx((0.0, 1.0, 0.0))
