from __future__ import annotations

import json
from typing import Any

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.pset
import ifcopenshell.api.root

DEFAULT_SPACE_HEIGHT_M = 2.7
DEFAULT_PSET_NAME = "Batang_SpaceDimensions"


def resolve_storey(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance | None,
    *,
    storey_id: str | None,
) -> ifcopenshell.entity_instance | None:
    if storey_id:
        try:
            resolved = model.by_guid(storey_id)
        except RuntimeError:
            resolved = None
        if resolved is not None and resolved.is_a("IfcBuildingStorey"):
            return resolved
    if storey is not None and storey.is_a("IfcBuildingStorey"):
        return storey
    storeys = model.by_type("IfcBuildingStorey")
    return storeys[0] if storeys else None


def owner_history(model: ifcopenshell.file) -> ifcopenshell.entity_instance | None:
    histories = model.by_type("IfcOwnerHistory")
    return histories[0] if histories else None


def ensure_body_context(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    projects = model.by_type("IfcProject")
    if projects:
        project = projects[0]
        for context in getattr(project, "RepresentationContexts", []) or []:
            if getattr(context, "ContextIdentifier", None) == "Body":
                return context

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
    if projects:
        project = projects[0]
        contexts = list(getattr(project, "RepresentationContexts", []) or [])
        contexts.append(context)
        project.RepresentationContexts = contexts
    return context


def create_local_placement(
    *,
    model: ifcopenshell.file,
    relative_to: ifcopenshell.entity_instance | None,
    location: tuple[float, float, float],
    ref_direction: tuple[float, float, float] = (1.0, 0.0, 0.0),
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
    depth_m: float = DEFAULT_SPACE_HEIGHT_M,
    context: ifcopenshell.entity_instance | None = None,
) -> ifcopenshell.entity_instance:
    body_context = context or ensure_body_context(model)
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
        ContextOfItems=body_context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[shape])


def create_space_representation_from_polygon(
    *,
    model: ifcopenshell.file,
    polygon_m: list[tuple[float, float]],
    depth_m: float = DEFAULT_SPACE_HEIGHT_M,
    context: ifcopenshell.entity_instance | None = None,
) -> ifcopenshell.entity_instance:
    body_context = context or ensure_body_context(model)
    local_points = [
        model.create_entity("IfcCartesianPoint", Coordinates=(float(x), float(y)))
        for x, y in polygon_m
    ]
    polyline = model.create_entity("IfcPolyline", Points=local_points)
    profile = model.create_entity(
        "IfcArbitraryClosedProfileDef",
        ProfileType="AREA",
        OuterCurve=polyline,
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
        ContextOfItems=body_context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    footprint = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=body_context,
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
                                "IfcCartesianPoint", Coordinates=(float(x), float(y))
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
        ContextOfItems=body_context,
        RepresentationIdentifier="Box",
        RepresentationType="BoundingBox",
        Items=[
            model.create_entity(
                "IfcBoundingBox",
                Corner=model.create_entity(
                    "IfcCartesianPoint",
                    Coordinates=(float(min(xs)), float(min(ys)), 0.0),
                ),
                XDim=float(max(xs) - min(xs)),
                YDim=float(max(ys) - min(ys)),
                ZDim=float(depth_m),
            )
        ],
    )
    return model.create_entity(
        "IfcProductDefinitionShape", Representations=[shape, box, footprint]
    )


def space_dimensions_m(
    space: ifcopenshell.entity_instance,
) -> tuple[float, float, float]:
    representation = getattr(space, "Representation", None)
    if representation:
        for rep in getattr(representation, "Representations", []) or []:
            if getattr(rep, "RepresentationIdentifier", None) != "Body":
                continue
            for item in getattr(rep, "Items", []) or []:
                if item.is_a("IfcExtrudedAreaSolid"):
                    profile = getattr(item, "SweptArea", None)
                    if profile and profile.is_a("IfcRectangleProfileDef"):
                        return float(profile.XDim), float(profile.YDim), float(item.Depth)
    return (0.0, 0.0, DEFAULT_SPACE_HEIGHT_M)


def update_space(
    *,
    model: ifcopenshell.file,
    space: ifcopenshell.entity_instance,
    dimensions_mm: dict[str, Any] | None,
    properties: dict[str, Any] | None,
    pset_updates: dict[str, Any] | None,
    pset_name: str = DEFAULT_PSET_NAME,
) -> None:
    if properties and properties.get("name"):
        space.Name = str(properties["name"])

    width_mm = _int_or_none((dimensions_mm or {}).get("width"))
    height_mm = _int_or_none((dimensions_mm or {}).get("height"))
    polygon_mm = properties.get("polygon_mm") if properties else None
    if polygon_mm:
        current_width_m, current_height_m, current_depth_m = space_dimensions_m(space)
        polygon_m = [
            (float(point["x"]) / 1000.0, float(point["y"]) / 1000.0)
            for point in polygon_mm
        ]
        space.Representation = create_space_representation_from_polygon(
            model=model,
            polygon_m=polygon_m,
            depth_m=current_depth_m,
            context=body_context(model, space),
        )
    elif width_mm is not None or height_mm is not None:
        current_width_m, current_height_m, current_depth_m = space_dimensions_m(space)
        new_width_m = width_mm / 1000.0 if width_mm is not None else current_width_m
        new_height_m = height_mm / 1000.0 if height_mm is not None else current_height_m
        space.Representation = create_space_representation(
            model=model,
            width_m=new_width_m,
            height_m=new_height_m,
            depth_m=current_depth_m,
            context=body_context(model, space),
        )

    explicit_updates = dict((pset_updates or {}).get(pset_name, {}))
    if width_mm is not None:
        explicit_updates.setdefault("Width", width_mm)
    if height_mm is not None:
        explicit_updates.setdefault("Height", height_mm)
    if properties:
        if properties.get("space_type") is not None:
            explicit_updates.setdefault("SpaceType", properties["space_type"])
        if properties.get("shape") is not None:
            explicit_updates.setdefault("Shape", properties["shape"])
        if properties.get("rects") is not None:
            explicit_updates.setdefault("Rects", properties["rects"])
        if properties.get("polygon_mm") is not None:
            explicit_updates.setdefault(
                "Rects",
                [
                    {
                        "x": int(round(min(point["x"] for point in properties["polygon_mm"]))),
                        "y": int(round(min(point["y"] for point in properties["polygon_mm"]))),
                        "width": int(
                            round(
                                max(point["x"] for point in properties["polygon_mm"])
                                - min(point["x"] for point in properties["polygon_mm"])
                            )
                        ),
                        "height": int(
                            round(
                                max(point["y"] for point in properties["polygon_mm"])
                                - min(point["y"] for point in properties["polygon_mm"])
                            )
                        ),
                    }
                ],
            )
        if properties.get("locked") is not None:
            explicit_updates.setdefault("Locked", properties["locked"])
    if explicit_updates:
        update_space_pset(
            model=model,
            space=space,
            pset_name=pset_name,
            updates=explicit_updates,
        )


def update_space_pset(
    *,
    model: ifcopenshell.file,
    space: ifcopenshell.entity_instance,
    updates: dict[str, Any],
    pset_name: str = DEFAULT_PSET_NAME,
) -> None:
    pset = None
    for rel in getattr(space, "IsDefinedBy", []) or []:
        definition = getattr(rel, "RelatingPropertyDefinition", None)
        if definition and getattr(definition, "Name", None) == pset_name:
            pset = definition
            break
    if pset is None:
        pset = ifcopenshell.api.pset.add_pset(model, product=space, name=pset_name)

    serialized: dict[str, Any] = {}
    for key, value in updates.items():
        if key == "Rects" and value is not None and not isinstance(value, str):
            serialized[key] = json.dumps(value, ensure_ascii=False)
        else:
            serialized[key] = value
    if serialized:
        ifcopenshell.api.pset.edit_pset(model, pset=pset, properties=serialized)


def body_context(
    model: ifcopenshell.file,
    product: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance | None:
    representation = getattr(product, "Representation", None)
    if representation:
        for rep in getattr(representation, "Representations", []) or []:
            if getattr(rep, "ContextOfItems", None) is not None:
                return rep.ContextOfItems
    return ensure_body_context(model)


def translate_product(
    model: ifcopenshell.file,
    product: ifcopenshell.entity_instance,
    *,
    x_m: float = 0.0,
    y_m: float = 0.0,
    z_m: float = 0.0,
) -> bool:
    if x_m == 0.0 and y_m == 0.0 and z_m == 0.0:
        return False
    placement = getattr(product, "ObjectPlacement", None)
    relative = getattr(placement, "RelativePlacement", None) if placement else None
    location = getattr(relative, "Location", None) if relative else None
    if location is None:
        return False
    coords = list(tuple(getattr(location, "Coordinates", ()) or ()))
    while len(coords) < 3:
        coords.append(0.0)
    coords[0] += x_m
    coords[1] += y_m
    coords[2] += z_m
    relative.Location = model.create_entity("IfcCartesianPoint", Coordinates=tuple(coords[:3]))
    return True


def is_product_host_relative(product: ifcopenshell.entity_instance) -> bool:
    placement = getattr(product, "ObjectPlacement", None)
    parent_placement = getattr(placement, "PlacementRelTo", None) if placement else None
    if parent_placement is None:
        return False
    for parent in list(getattr(parent_placement, "PlacesObject", []) or []):
        if parent.is_a("IfcWall") or parent.is_a("IfcOpeningElement"):
            return True
    return False


def assign_space_to_storey(
    model: ifcopenshell.file,
    *,
    space: ifcopenshell.entity_instance,
    storey: ifcopenshell.entity_instance,
) -> None:
    ifcopenshell.api.aggregate.assign_object(model, products=[space], relating_object=storey)


def _int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    return int(round(float(value)))
