"""Layout import service entrypoint."""

from __future__ import annotations

import math
from pathlib import Path

import ifcopenshell
import ifcopenshell.guid
from ai_domain import LayoutImportV1, RoomInput, ZoneInput


def convert_layout_to_ifc(request: LayoutImportV1, output_path: str | Path) -> None:
    """Write a v1 space-only IFC file from the validated layout import request."""

    output = Path(output_path)
    _validate_zone_references(request)
    model = _create_ifc_file()
    owner_history, context, storeys = _create_project_tree(model, request)
    zones = _create_zones(model, owner_history, request)
    _create_spaces(model, owner_history, context, request, storeys, zones)
    output.parent.mkdir(parents=True, exist_ok=True)
    model.write(str(output))


def _validate_zone_references(request: LayoutImportV1) -> None:
    zone_ids = {zone.id for zone in request.zones or []}
    for room in request.rooms:
        if room.zone_id is None:
            continue
        if room.zone_id not in zone_ids:
            raise ValueError(f"알 수 없는 zone 참조입니다: {room.zone_id}")


def _create_ifc_file() -> ifcopenshell.file:
    return ifcopenshell.file(schema="IFC4")


def _create_project_tree(
    model: ifcopenshell.file, request: LayoutImportV1
) -> tuple[
    ifcopenshell.entity_instance,
    ifcopenshell.entity_instance,
    dict[int, ifcopenshell.entity_instance],
]:
    owner_history = _create_owner_history(model)
    context = _create_geometric_context(model)
    site_placement = _create_local_placement(model)
    building_placement = _create_local_placement(model, relative_to=site_placement)
    project = model.create_entity(
        "IfcProject",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=request.name,
        UnitsInContext=_create_unit_assignment(model),
        RepresentationContexts=[context],
    )
    site = model.create_entity(
        "IfcSite",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"{request.name} Site",
        CompositionType="ELEMENT",
        ObjectPlacement=site_placement,
    )
    building = model.create_entity(
        "IfcBuilding",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"{request.name} Building",
        CompositionType="ELEMENT",
        ObjectPlacement=building_placement,
    )
    space_height_m = _effective_space_height_m(request)
    storeys = _create_storeys(
        model,
        owner_history,
        building_placement,
        sorted({room.floor for room in request.rooms}),
        space_height_m,
    )
    _create_aggregate(model, owner_history, project, [site], "Project-Site")
    _create_aggregate(model, owner_history, site, [building], "Site-Building")
    _create_aggregate(
        model,
        owner_history,
        building,
        list(storeys.values()),
        "Building-Storeys",
    )
    return owner_history, context, storeys


def _create_owner_history(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    person = model.create_entity("IfcPerson", GivenName="AI")
    organization = model.create_entity("IfcOrganization", Name="Batang")
    person_and_org = model.create_entity(
        "IfcPersonAndOrganization",
        ThePerson=person,
        TheOrganization=organization,
    )
    application = model.create_entity(
        "IfcApplication",
        ApplicationDeveloper=organization,
        Version="0.1.0",
        ApplicationFullName="ai-layout-import",
        ApplicationIdentifier="ai-layout-import",
    )
    return model.create_entity(
        "IfcOwnerHistory",
        OwningUser=person_and_org,
        OwningApplication=application,
        ChangeAction="ADDED",
        CreationDate=0,
    )


def _create_unit_assignment(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    length_unit = model.create_entity(
        "IfcSIUnit",
        UnitType="LENGTHUNIT",
        Name="METRE",
    )
    return model.create_entity("IfcUnitAssignment", Units=[length_unit])


def _create_geometric_context(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Model",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1.0e-5,
        WorldCoordinateSystem=_create_axis_placement_3d(model),
    )


def _create_storeys(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    building_placement: ifcopenshell.entity_instance,
    floors: list[int],
    space_height_m: float,
) -> dict[int, ifcopenshell.entity_instance]:
    return {
        floor: model.create_entity(
            "IfcBuildingStorey",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=owner_history,
            Name=f"{floor}F",
            CompositionType="ELEMENT",
            ObjectPlacement=_create_local_placement(
                model,
                relative_to=building_placement,
                location=(0.0, 0.0, (floor - 1) * space_height_m),
            ),
            Elevation=(floor - 1) * space_height_m,
        )
        for floor in floors
    }


def _create_aggregate(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    parent: ifcopenshell.entity_instance,
    children: list[ifcopenshell.entity_instance],
    name: str,
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=name,
        RelatingObject=parent,
        RelatedObjects=children,
    )


def _create_spaces(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    context: ifcopenshell.entity_instance,
    request: LayoutImportV1,
    storeys: dict[int, ifcopenshell.entity_instance],
    zones: dict[str, ifcopenshell.entity_instance],
) -> None:
    space_height_m = _effective_space_height_m(request)
    for room in request.rooms:
        storey = storeys[room.floor]
        space = model.create_entity(
            "IfcSpace",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=owner_history,
            Name=room.name,
            CompositionType="ELEMENT",
            ObjectPlacement=_create_space_placement(
                model,
                relative_to=storey.ObjectPlacement,
                x_mm=room.x,
                y_mm=room.y,
                angle_radians=room.angle,
            ),
            Representation=_create_space_representation(
                model,
                context,
                room.width,
                room.height,
                space_height_m,
            ),
        )
        _attach_room_metadata_property_set(model, owner_history, space, room)
        model.create_entity(
            "IfcRelContainedInSpatialStructure",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=owner_history,
            Name=f"{room.id}-StoreyContainment",
            RelatedElements=[space],
            RelatingStructure=storey,
        )
        if room.zone_id is not None:
            _assign_space_to_zone(model, owner_history, space, zones[room.zone_id], room.id)


def _create_zones(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    request: LayoutImportV1,
) -> dict[str, ifcopenshell.entity_instance]:
    zones: dict[str, ifcopenshell.entity_instance] = {}
    for zone in request.zones or []:
        zone_entity = model.create_entity(
            "IfcZone",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=owner_history,
            Name=zone.name,
            ObjectType="Zone",
        )
        _attach_zone_metadata_property_set(model, owner_history, zone_entity, zone)
        zones[zone.id] = zone_entity
    return zones


def _assign_space_to_zone(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    space: ifcopenshell.entity_instance,
    zone: ifcopenshell.entity_instance,
    room_id: str,
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcRelAssignsToGroup",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"{room_id}-ZoneAssignment",
        RelatedObjects=[space],
        RelatingGroup=zone,
    )


def _attach_room_metadata_property_set(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    space: ifcopenshell.entity_instance,
    room: RoomInput,
) -> None:
    properties = [
        _create_property_single_value(model, "RoomId", room.id),
        _create_property_single_value(model, "RoomType", room.type.value),
        _create_property_single_value(model, "Locked", room.locked),
    ]
    if room.zone_id is not None:
        properties.append(_create_property_single_value(model, "ZoneId", room.zone_id))
    _attach_property_set(
        model,
        owner_history,
        space,
        "Pset_BatangLayoutImportRoom",
        properties,
    )


def _attach_zone_metadata_property_set(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    zone_entity: ifcopenshell.entity_instance,
    zone: ZoneInput,
) -> None:
    _attach_property_set(
        model,
        owner_history,
        zone_entity,
        "Pset_BatangLayoutImportZone",
        [
            _create_property_single_value(model, "ZoneId", zone.id),
            _create_property_single_value(model, "ZoneColor", zone.color),
        ],
    )


def _attach_property_set(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    target: ifcopenshell.entity_instance,
    pset_name: str,
    properties: list[ifcopenshell.entity_instance],
) -> ifcopenshell.entity_instance:
    property_set = model.create_entity(
        "IfcPropertySet",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=pset_name,
        HasProperties=properties,
    )
    return model.create_entity(
        "IfcRelDefinesByProperties",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"{pset_name}-Assignment",
        RelatedObjects=[target],
        RelatingPropertyDefinition=property_set,
    )


def _create_property_single_value(
    model: ifcopenshell.file,
    name: str,
    value: str | bool,
) -> ifcopenshell.entity_instance:
    if isinstance(value, bool):
        nominal_value = model.create_entity("IfcBoolean", value)
    else:
        nominal_value = model.create_entity("IfcLabel", value)
    return model.create_entity(
        "IfcPropertySingleValue",
        Name=name,
        NominalValue=nominal_value,
    )


def _create_space_representation(
    model: ifcopenshell.file,
    context: ifcopenshell.entity_instance,
    width_mm: int,
    height_mm: int,
    space_height_m: float,
) -> ifcopenshell.entity_instance:
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=_mm_to_m(width_mm),
        YDim=_mm_to_m(height_mm),
        Position=_create_axis_placement_2d(model),
    )
    body = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=_create_axis_placement_3d(model),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=space_height_m,
    )
    shape_representation = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    return model.create_entity(
        "IfcProductDefinitionShape",
        Representations=[shape_representation],
    )


def _create_space_placement(
    model: ifcopenshell.file,
    relative_to: ifcopenshell.entity_instance,
    x_mm: float,
    y_mm: float,
    angle_radians: float,
) -> ifcopenshell.entity_instance:
    return _create_local_placement(
        model,
        relative_to=relative_to,
        location=(_mm_to_m(x_mm), _mm_to_m(y_mm), 0.0),
        ref_direction=(math.cos(angle_radians), math.sin(angle_radians), 0.0),
    )


def _create_local_placement(
    model: ifcopenshell.file,
    relative_to: ifcopenshell.entity_instance | None = None,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    axis: tuple[float, float, float] = (0.0, 0.0, 1.0),
    ref_direction: tuple[float, float, float] = (1.0, 0.0, 0.0),
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=relative_to,
        RelativePlacement=_create_axis_placement_3d(
            model,
            location=location,
            axis=axis,
            ref_direction=ref_direction,
        ),
    )


def _create_axis_placement_3d(
    model: ifcopenshell.file,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    axis: tuple[float, float, float] = (0.0, 0.0, 1.0),
    ref_direction: tuple[float, float, float] = (1.0, 0.0, 0.0),
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcAxis2Placement3D",
        Location=model.create_entity("IfcCartesianPoint", Coordinates=location),
        Axis=model.create_entity("IfcDirection", DirectionRatios=axis),
        RefDirection=model.create_entity("IfcDirection", DirectionRatios=ref_direction),
    )


def _create_axis_placement_2d(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcAxis2Placement2D",
        Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0)),
        RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0)),
    )


def _effective_space_height_m(request: LayoutImportV1) -> float:
    effective_space_height_mm = 2700
    if (
        request.modeling_defaults is not None
        and request.modeling_defaults.space_height_mm is not None
    ):
        effective_space_height_mm = request.modeling_defaults.space_height_mm
    return _mm_to_m(effective_space_height_mm)


def _mm_to_m(length_mm: int | float) -> float:
    return length_mm / 1000.0
