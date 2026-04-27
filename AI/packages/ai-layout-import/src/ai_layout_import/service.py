"""layout import 서비스 진입점."""

from __future__ import annotations

from pathlib import Path

import ifcopenshell
import ifcopenshell.guid
from ai_domain import LayoutImportV1


def convert_layout_to_ifc(request: LayoutImportV1, output_path: str | Path) -> None:
    """신규 IFC import 서비스의 공식 진입점.

    이번 단계에서는 IFC4 spatial bootstrap과 zone 참조 validation만 구현한다.
    """

    output = Path(output_path)
    _validate_zone_references(request)
    model = _create_ifc_file()
    _create_project_tree(model, request)
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
) -> tuple[ifcopenshell.entity_instance, list[ifcopenshell.entity_instance]]:
    owner_history = _create_owner_history(model)
    context = _create_geometric_context(model)
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
    )
    building = model.create_entity(
        "IfcBuilding",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"{request.name} Building",
        CompositionType="ELEMENT",
    )
    storeys = _create_storeys(model, owner_history, sorted({room.floor for room in request.rooms}))
    _create_aggregate(model, owner_history, project, [site], "Project-Site")
    _create_aggregate(model, owner_history, site, [building], "Site-Building")
    _create_aggregate(model, owner_history, building, storeys, "Building-Storeys")
    return project, storeys


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
    origin = model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0))
    z_axis = model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0))
    x_axis = model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0))
    world_coordinate_system = model.create_entity(
        "IfcAxis2Placement3D",
        Location=origin,
        Axis=z_axis,
        RefDirection=x_axis,
    )
    return model.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Model",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1.0e-5,
        WorldCoordinateSystem=world_coordinate_system,
    )


def _create_storeys(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    floors: list[int],
) -> list[ifcopenshell.entity_instance]:
    return [
        model.create_entity(
            "IfcBuildingStorey",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=owner_history,
            Name=f"{floor}F",
            CompositionType="ELEMENT",
        )
        for floor in floors
    ]


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
