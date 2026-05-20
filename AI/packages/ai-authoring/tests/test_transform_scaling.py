from __future__ import annotations

import pytest

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.root
import ifcopenshell.guid
import ifcopenshell.util.placement
from ai_authoring.engine_3d import (
    create_wall,
    modify_height,
    modify_length,
    modify_position,
    modify_rotation,
    modify_rotation_axis_angle,
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
    zs = [
        float(point.Coordinates[2]) if len(point.Coordinates) >= 3 else 0.0
        for point in points
    ]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


def _world_point_bounds(product, points):
    matrix = ifcopenshell.util.placement.get_local_placement(product.ObjectPlacement)
    world_points = []
    for point in points:
        coords = list(point.Coordinates)
        while len(coords) < 3:
            coords.append(0.0)
        x, y, z = (float(coords[0]), float(coords[1]), float(coords[2]))
        world_points.append(
            (
                float(
                    matrix[0][0] * x
                    + matrix[0][1] * y
                    + matrix[0][2] * z
                    + matrix[0][3]
                ),
                float(
                    matrix[1][0] * x
                    + matrix[1][1] * y
                    + matrix[1][2] * z
                    + matrix[1][3]
                ),
                float(
                    matrix[2][0] * x
                    + matrix[2][1] * y
                    + matrix[2][2] * z
                    + matrix[2][3]
                ),
            )
        )
    xs = [point[0] for point in world_points]
    ys = [point[1] for point in world_points]
    zs = [point[2] for point in world_points]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


def _bbox_center(bounds):
    min_x, max_x, min_y, max_y, min_z, max_z = bounds
    return (
        (min_x + max_x) / 2.0,
        (min_y + max_y) / 2.0,
        (min_z + max_z) / 2.0,
    )


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


def _make_arbitrary_profile_roof(model):
    points = [
        model.create_entity(
            "IfcCartesianPoint",
            Coordinates=(17.54331970654479, -2.3879739328374994),
        ),
        model.create_entity(
            "IfcCartesianPoint",
            Coordinates=(11.382737731139747, 3.040473240264042),
        ),
        model.create_entity(
            "IfcCartesianPoint",
            Coordinates=(4.461941909046897, -4.813730482728729),
        ),
        model.create_entity(
            "IfcCartesianPoint",
            Coordinates=(10.622523884451935, -10.242177655830272),
        ),
    ]
    points.append(points[0])
    profile = model.create_entity(
        "IfcArbitraryClosedProfileDef",
        ProfileType="AREA",
        OuterCurve=model.create_entity("IfcPolyline", Points=points),
    )
    solid = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=1.0,
    )
    context = model.by_type("IfcGeometricRepresentationContext")[0]
    body = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[solid],
    )
    shape = model.create_entity("IfcProductDefinitionShape", Representations=[body])
    placement = model.create_entity(
        "IfcLocalPlacement",
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity(
                "IfcCartesianPoint",
                Coordinates=(3.421820929351968, -9.390074189363983, 11.223620209820986),
            ),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity(
                "IfcDirection",
                DirectionRatios=(-0.7502824038461079, 0.6611174740383932, 0.0),
            ),
        ),
    )
    roof = model.create_entity(
        "IfcRoof",
        GlobalId=ifcopenshell.guid.new(),
        Name="ArbitraryProfileRoof",
        ObjectPlacement=placement,
        Representation=shape,
    )
    return roof, solid, profile


def _profile_points(profile):
    return list(profile.OuterCurve.Points)


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

    assert solid.SweptArea.is_a("IfcRectangleProfileDef")
    ref_direction = wall.ObjectPlacement.RelativePlacement.RefDirection.DirectionRatios
    assert tuple(ref_direction) == pytest.approx((-1.0, 0.0, 0.0))
    assert solid.SweptArea.XDim == pytest.approx(3000.0)
    assert solid.SweptArea.YDim == pytest.approx(200.0)
    assert solid.Position.Location.Coordinates[0] == pytest.approx(0.0)
    assert solid.Position.Location.Coordinates[1] == pytest.approx(0.0)
    assert all(
        rep.RepresentationIdentifier != "Box"
        for rep in wall.Representation.Representations
    )


def test_wall_rotation_can_be_applied_twice_without_profile_conversion():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_rotation(model, wall, 90.0)
    first_ref_direction = tuple(wall.ObjectPlacement.RelativePlacement.RefDirection.DirectionRatios)
    assert modify_rotation(model, wall, 90.0)
    second_ref_direction = tuple(
        wall.ObjectPlacement.RelativePlacement.RefDirection.DirectionRatios
    )

    assert solid.SweptArea.is_a("IfcRectangleProfileDef")
    assert second_ref_direction != first_ref_direction
    assert second_ref_direction == pytest.approx((0.0, -1.0, 0.0))


def test_wall_length_scale_after_rotation_updates_polygon_profile():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_rotation(model, wall, 90.0)
    assert modify_length(wall, {"mode": "SCALE", "value": 2.0})

    assert solid.SweptArea.XDim == pytest.approx(6000.0)
    assert solid.SweptArea.YDim == pytest.approx(200.0)


def test_wall_width_scale_after_rotation_updates_polygon_profile():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)

    assert modify_rotation(model, wall, 90.0)
    assert modify_thickness(wall, {"mode": "SCALE", "value": 2.0})

    assert solid.SweptArea.XDim == pytest.approx(3000.0)
    assert solid.SweptArea.YDim == pytest.approx(400.0)


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
    relative_placement = roof.ObjectPlacement.RelativePlacement
    before_location = tuple(relative_placement.Location.Coordinates)
    before_ref_direction = relative_placement.RefDirection
    before_world_center = _bbox_center(_world_point_bounds(roof, _brep_points(brep)))
    before_first_point = tuple(brep.Outer.CfsFaces[0].Bounds[0].Bound.Polygon[0].Coordinates)

    assert modify_rotation(model, roof, 180.0)

    min_x, max_x, min_y, max_y, *_ = _point_bounds(_brep_points(brep))
    assert min_x == pytest.approx(0.0)
    assert max_x == pytest.approx(4000.0)
    assert min_y == pytest.approx(0.0)
    assert max_y == pytest.approx(3000.0)
    assert brep.Outer.CfsFaces[0].Bounds[0].Bound.Polygon[0].Coordinates[0] == pytest.approx(
        4000.0
    )
    assert tuple(relative_placement.Location.Coordinates) == before_location
    assert relative_placement.RefDirection is before_ref_direction
    assert _bbox_center(_world_point_bounds(roof, _brep_points(brep))) == pytest.approx(
        before_world_center
    )
    assert (
        tuple(brep.Outer.CfsFaces[0].Bounds[0].Bound.Polygon[0].Coordinates)
        != before_first_point
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


def test_arbitrary_profile_roof_rotation_updates_profile_about_center():
    model, _storey = _make_model()
    roof, solid, profile = _make_arbitrary_profile_roof(model)
    relative_placement = roof.ObjectPlacement.RelativePlacement
    profile_points = _profile_points(profile)
    before_location = tuple(relative_placement.Location.Coordinates)
    before_ref_direction = tuple(relative_placement.RefDirection.DirectionRatios)
    before_solid_ref_direction = tuple(solid.Position.RefDirection.DirectionRatios)
    before_world_center = _bbox_center(_world_point_bounds(roof, profile_points))
    before_profile_points = [tuple(point.Coordinates) for point in profile_points]

    assert modify_rotation(model, roof, 90.0)

    assert tuple(relative_placement.Location.Coordinates) == pytest.approx(before_location)
    assert tuple(relative_placement.RefDirection.DirectionRatios) == pytest.approx(
        before_ref_direction
    )
    assert tuple(solid.Position.RefDirection.DirectionRatios) == pytest.approx(
        before_solid_ref_direction
    )
    assert _bbox_center(_world_point_bounds(roof, profile_points)) == pytest.approx(
        before_world_center
    )
    assert [tuple(point.Coordinates) for point in profile_points] != before_profile_points


@pytest.mark.parametrize(
    "axis",
    [
        {"x": 1.0, "y": 0.0, "z": 0.0},
        {"x": 0.0, "y": 1.0, "z": 0.0},
        {"x": 0.0, "y": 0.0, "z": 1.0},
    ],
)
def test_brep_roof_axis_angle_rotation_preserves_world_center(axis):
    model, _storey = _make_model()
    roof, brep = _make_brep_roof(model)
    points = _brep_points(brep)
    before_world_center = _bbox_center(_world_point_bounds(roof, points))
    before_points = [tuple(point.Coordinates) for point in points]
    before_location = tuple(roof.ObjectPlacement.RelativePlacement.Location.Coordinates)

    assert modify_rotation_axis_angle(model, roof, axis, 35.0)

    assert _bbox_center(_world_point_bounds(roof, points)) == pytest.approx(before_world_center)
    assert [tuple(point.Coordinates) for point in points] != before_points
    assert tuple(roof.ObjectPlacement.RelativePlacement.Location.Coordinates) == pytest.approx(
        before_location
    )


def test_arbitrary_profile_roof_axis_angle_rotation_uses_placement_and_preserves_center():
    model, _storey = _make_model()
    roof, _solid, profile = _make_arbitrary_profile_roof(model)
    relative_placement = roof.ObjectPlacement.RelativePlacement
    profile_points = _profile_points(profile)
    before_world_center = _bbox_center(_world_point_bounds(roof, profile_points))
    before_profile_points = [tuple(point.Coordinates) for point in profile_points]
    before_ref_direction = tuple(relative_placement.RefDirection.DirectionRatios)

    assert modify_rotation_axis_angle(model, roof, {"x": 0.0, "y": 0.0, "z": 1.0}, 45.0)

    assert _bbox_center(_world_point_bounds(roof, profile_points)) == pytest.approx(
        before_world_center
    )
    assert [tuple(point.Coordinates) for point in profile_points] == before_profile_points
    assert tuple(relative_placement.RefDirection.DirectionRatios) != pytest.approx(
        before_ref_direction
    )


def test_wall_axis_angle_rotation_preserves_rectangle_dimensions_and_updates_placement():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    solid = _wall_solid(wall)
    before_ref_direction = tuple(
        wall.ObjectPlacement.RelativePlacement.RefDirection.DirectionRatios
    )

    assert modify_rotation_axis_angle(model, wall, {"x": 0.0, "y": 0.0, "z": 1.0}, 90.0)

    assert solid.SweptArea.XDim == pytest.approx(3000.0)
    assert solid.SweptArea.YDim == pytest.approx(200.0)
    next_ref_direction = tuple(
        wall.ObjectPlacement.RelativePlacement.RefDirection.DirectionRatios
    )
    assert next_ref_direction != pytest.approx(before_ref_direction)
