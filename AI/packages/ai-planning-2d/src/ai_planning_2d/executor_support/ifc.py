from __future__ import annotations

import json
from typing import Any

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.pset
import ifcopenshell.api.root

DEFAULT_SPACE_HEIGHT_M = 2.7


def create_linear_wall(
    *,
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    start_mm: tuple[float, float],
    end_mm: tuple[float, float],
    name: str,
    thickness_mm: int,
) -> ifcopenshell.entity_instance:
    start_m = (start_mm[0] / 1000.0, start_mm[1] / 1000.0)
    end_m = (end_mm[0] / 1000.0, end_mm[1] / 1000.0)
    dx = end_m[0] - start_m[0]
    dy = end_m[1] - start_m[1]
    length_m = (dx**2 + dy**2) ** 0.5
    if length_m <= 0.0:
        raise ValueError("wall segment length must be positive")
    ref_direction = (dx / length_m, dy / length_m, 0.0)
    wall = ifcopenshell.api.root.create_entity(model, ifc_class="IfcWall", name=name)
    wall.ObjectPlacement = create_local_placement(
        model=model,
        relative_to=getattr(storey, "ObjectPlacement", None),
        location=(start_m[0], start_m[1], 0.0),
        ref_direction=ref_direction,
    )
    wall.Representation = create_wall_representation(
        model=model,
        length_m=length_m,
        thickness_m=thickness_mm / 1000.0,
        height_m=DEFAULT_SPACE_HEIGHT_M,
        context=ensure_body_context(model),
    )
    ifcopenshell.api.aggregate.assign_object(model, products=[wall], relating_object=storey)
    wall_pset = ifcopenshell.api.pset.add_pset(model, product=wall, name="Batang_WallDimensions")
    ifcopenshell.api.pset.edit_pset(model, pset=wall_pset, properties={"Thickness": thickness_mm})
    return wall


def create_wall_representation(
    *,
    model: ifcopenshell.file,
    length_m: float,
    thickness_m: float,
    height_m: float,
    context: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance:
    polyline = model.create_entity(
        "IfcPolyline",
        Points=(
            model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0)),
            model.create_entity("IfcCartesianPoint", Coordinates=(length_m, 0.0)),
        ),
    )
    axis = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Axis",
        RepresentationType="Curve2D",
        Items=(polyline,),
    )
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=length_m,
        YDim=thickness_m,
        Position=model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(length_m / 2.0, 0.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0)),
        ),
    )
    body_item = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=height_m,
    )
    body = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=(body_item,),
    )
    box = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Box",
        RepresentationType="BoundingBox",
        Items=[
            model.create_entity(
                "IfcBoundingBox",
                Corner=model.create_entity(
                    "IfcCartesianPoint",
                    Coordinates=(0.0, -(thickness_m / 2.0), 0.0),
                ),
                XDim=length_m,
                YDim=thickness_m,
                ZDim=height_m,
            )
        ],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=(axis, body, box))


def attach_space_boundary(
    *,
    model: ifcopenshell.file,
    wall: ifcopenshell.entity_instance,
    space: ifcopenshell.entity_instance,
) -> None:
    model.create_entity(
        "IfcRelSpaceBoundary",
        GlobalId=ifcopenshell.guid.new(),
        RelatingSpace=space,
        RelatedBuildingElement=wall,
    )


def attach_wall_boundaries_from_plan(
    *,
    model: ifcopenshell.file,
    wall: ifcopenshell.entity_instance,
    space_by_id: dict[str, ifcopenshell.entity_instance],
    bounded_room_ids: list[str],
) -> None:
    for room_id in bounded_room_ids:
        space = space_by_id.get(room_id)
        if space is not None:
            attach_space_boundary(model=model, wall=wall, space=space)


def create_box_representation(
    *,
    model: ifcopenshell.file,
    length_m: float,
    width_m: float,
    height_m: float,
) -> ifcopenshell.entity_instance:
    context = ensure_body_context(model)
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=length_m,
        YDim=width_m,
        Position=model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(length_m / 2.0, 0.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0)),
        ),
    )
    body_item = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=height_m,
    )
    body = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=(body_item,),
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=(body,))


def body_context(
    model: ifcopenshell.file,
    space: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance | None:
    representation = getattr(space, "Representation", None)
    if representation:
        for rep in getattr(representation, "Representations", []) or []:
            if getattr(rep, "ContextOfItems", None) is not None:
                return rep.ContextOfItems
    contexts = model.by_type("IfcGeometricRepresentationContext")
    if contexts:
        return contexts[0]
    return ensure_body_context(model)


def ensure_body_context(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    context = model.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Body",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
    )
    projects = model.by_type("IfcProject")
    if projects:
        project = projects[0]
        contexts = list(getattr(project, "RepresentationContexts", []) or [])
        contexts.append(context)
        project.RepresentationContexts = contexts
    return context


def owner_history(model: ifcopenshell.file) -> ifcopenshell.entity_instance | None:
    histories = model.by_type("IfcOwnerHistory")
    return histories[0] if histories else None


def create_local_placement(
    *,
    model: ifcopenshell.file,
    relative_to: ifcopenshell.entity_instance | None,
    location: tuple[float, float, float],
    ref_direction: tuple[float, float, float],
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=relative_to,
        RelativePlacement=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=location),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=ref_direction),
        ),
    )


def create_space_representation(
    *,
    model: ifcopenshell.file,
    width_m: float,
    height_m: float,
    depth_m: float,
    context: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance:
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=width_m,
        YDim=height_m,
        Position=model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0)),
        ),
    )
    body = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=depth_m,
    )
    shape = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[shape])


def create_space_representation_from_polygon(
    *,
    model: ifcopenshell.file,
    polygon_mm: list[tuple[float, float]],
    depth_m: float,
    context: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance:
    polygon_m = [(x / 1000.0, y / 1000.0) for x, y in polygon_mm]
    points = [
        model.create_entity("IfcCartesianPoint", Coordinates=(x, y))
        for x, y in polygon_m
    ]
    profile = model.create_entity(
        "IfcArbitraryClosedProfileDef",
        ProfileType="AREA",
        OuterCurve=model.create_entity("IfcPolyline", Points=points),
    )
    body = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)),
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=depth_m,
    )
    shape = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    footprint = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="FootPrint",
        RepresentationType="GeometricCurveSet",
        Items=[
            model.create_entity(
                "IfcGeometricCurveSet",
                Elements=[
                    model.create_entity(
                        "IfcPolyline",
                        Points=[
                            model.create_entity(
                                "IfcCartesianPoint", Coordinates=(x, y)
                            )
                            for x, y in [*polygon_m, polygon_m[0]]
                        ],
                    )
                ],
            )
        ],
    )
    xs = [point[0] for point in polygon_m]
    ys = [point[1] for point in polygon_m]
    box = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Box",
        RepresentationType="BoundingBox",
        Items=[
            model.create_entity(
                "IfcBoundingBox",
                Corner=model.create_entity(
                    "IfcCartesianPoint",
                    Coordinates=(min(xs), min(ys), 0.0),
                ),
                XDim=max(xs) - min(xs),
                YDim=max(ys) - min(ys),
                ZDim=depth_m,
            )
        ],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[shape, box, footprint])


def update_space_pset(
    *,
    model: ifcopenshell.file,
    space: ifcopenshell.entity_instance,
    width_mm: int | None,
    height_mm: int | None,
    rects: list[dict[str, Any]] | None,
    room_type: str | None = None,
    shape: str | None = None,
    locked: bool | None = None,
) -> None:
    pset = None
    for rel in getattr(space, "IsDefinedBy", []) or []:
        definition = getattr(rel, "RelatingPropertyDefinition", None)
        if definition and getattr(definition, "Name", None) == "Batang_SpaceDimensions":
            pset = definition
            break

    if pset is None:
        pset = ifcopenshell.api.pset.add_pset(
            model,
            product=space,
            name="Batang_SpaceDimensions",
        )

    properties: dict[str, Any] = {}
    if width_mm is not None:
        properties["Width"] = width_mm
    if height_mm is not None:
        properties["Height"] = height_mm
    if room_type is not None:
        properties["SpaceType"] = room_type
    if shape is not None:
        properties["Shape"] = shape
    if locked is not None:
        properties["Locked"] = locked
    if rects is not None:
        properties["Rects"] = json.dumps(rects, ensure_ascii=False)

    if properties:
        ifcopenshell.api.pset.edit_pset(model, pset=pset, properties=properties)


def wall_thickness_m(wall: ifcopenshell.entity_instance) -> float:
    for rel in getattr(wall, "IsDefinedBy", []) or []:
        definition = getattr(rel, "RelatingPropertyDefinition", None)
        if definition and getattr(definition, "Name", None) == "Batang_WallDimensions":
            for prop in getattr(definition, "HasProperties", []) or []:
                nominal = getattr(prop, "NominalValue", None)
                wrapped = getattr(nominal, "wrappedValue", None)
                if prop.Name == "Thickness" and isinstance(wrapped, int | float):
                    return float(wrapped) / 1000.0
    return 0.2
