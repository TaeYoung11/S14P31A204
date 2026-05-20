from __future__ import annotations

import ifcopenshell
import ifcopenshell.guid

from ai_authoring.engine_3d import modify_color, modify_material


def _make_model() -> ifcopenshell.file:
    model = ifcopenshell.file(schema="IFC4")
    context = model.create_entity(
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
    project = model.create_entity("IfcProject", GlobalId=ifcopenshell.guid.new(), Name="Project")
    project.RepresentationContexts = [context]
    return model


def _solid(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=1.0,
        YDim=1.0,
    )
    return model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        ),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=1.0,
    )


def _body_shape(
    model: ifcopenshell.file,
    items: list[ifcopenshell.entity_instance],
    *,
    representation_type: str = "SweptSolid",
) -> ifcopenshell.entity_instance:
    context = model.by_type("IfcGeometricRepresentationContext")[0]
    body = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType=representation_type,
        Items=items,
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[body])


def _roof(
    model: ifcopenshell.file,
    name: str,
    shape: ifcopenshell.entity_instance | None = None,
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcRoof",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        Representation=shape,
    )


def _slab(
    model: ifcopenshell.file,
    name: str,
    shape: ifcopenshell.entity_instance | None = None,
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcSlab",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        Representation=shape,
    )


def _rgb_values(
    model: ifcopenshell.file,
    item: ifcopenshell.entity_instance,
) -> list[tuple[float, float, float]]:
    values: list[tuple[float, float, float]] = []
    for inverse in model.get_inverse(item):
        if not inverse.is_a("IfcStyledItem"):
            continue
        for assignment in getattr(inverse, "Styles", []) or []:
            for surface_style in getattr(assignment, "Styles", []) or []:
                for rendering in getattr(surface_style, "Styles", []) or []:
                    color = getattr(rendering, "SurfaceColour", None)
                    if color is None:
                        continue
                    values.append((float(color.Red), float(color.Green), float(color.Blue)))
    return values


def _has_blue_style(model: ifcopenshell.file, item: ifcopenshell.entity_instance) -> bool:
    expected = (0x3B / 255, 0x82 / 255, 0xF6 / 255)
    return any(
        all(abs(actual - target) < 0.01 for actual, target in zip(rgb, expected, strict=True))
        for rgb in _rgb_values(model, item)
    )


def _property_labels(element: ifcopenshell.entity_instance) -> dict[str, str]:
    labels: dict[str, str] = {}
    for rel in getattr(element, "IsDefinedBy", []) or []:
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        pset = getattr(rel, "RelatingPropertyDefinition", None)
        if pset is None or not pset.is_a("IfcPropertySet"):
            continue
        for prop in getattr(pset, "HasProperties", []) or []:
            if not prop.is_a("IfcPropertySingleValue"):
                continue
            nominal = getattr(prop, "NominalValue", None)
            if nominal is not None:
                labels[str(prop.Name)] = str(nominal.wrappedValue)
    return labels


def _associated_material_names(element: ifcopenshell.entity_instance) -> set[str]:
    names: set[str] = set()
    for rel in getattr(element, "HasAssociations", []) or []:
        if not rel.is_a("IfcRelAssociatesMaterial"):
            continue
        material = getattr(rel, "RelatingMaterial", None)
        name = getattr(material, "Name", None)
        if name:
            names.add(str(name))
    return names


def test_modify_color_propagates_to_aggregate_roof_descendants() -> None:
    model = _make_model()
    child_solid = _solid(model)
    parent = _roof(model, "ParentRoof")
    child = _roof(model, "ChildRoof", _body_shape(model, [child_solid]))
    model.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        RelatingObject=parent,
        RelatedObjects=[child],
    )

    assert modify_color(model, parent, "#3B82F6", propagate_roof_descendants=True)

    assert _has_blue_style(model, child_solid)


def test_modify_color_propagates_to_aggregate_roof_slab_descendants() -> None:
    model = _make_model()
    child_solid = _solid(model)
    parent = _roof(model, "ParentRoof")
    child = _slab(model, "RoofSlab", _body_shape(model, [child_solid]))
    model.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        RelatingObject=parent,
        RelatedObjects=[child],
    )

    assert modify_color(model, parent, "#3B82F6", propagate_roof_descendants=True)

    assert _has_blue_style(model, child_solid)


def test_modify_material_propagates_to_aggregate_roof_descendants() -> None:
    model = _make_model()
    parent = _roof(model, "ParentRoof")
    child = _slab(model, "RoofSlab", _body_shape(model, [_solid(model)]))
    model.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        RelatingObject=parent,
        RelatedObjects=[child],
    )

    assert modify_material(
        model,
        parent,
        {"name": "Concrete"},
        propagate_roof_descendants=True,
    )

    assert _property_labels(child)["Material"] == "Concrete"
    assert "Concrete" in _associated_material_names(child)


def test_modify_color_propagates_to_mapped_source_items() -> None:
    model = _make_model()
    source_solid = _solid(model)
    context = model.by_type("IfcGeometricRepresentationContext")[0]
    source_representation = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[source_solid],
    )
    representation_map = model.create_entity(
        "IfcRepresentationMap",
        MappingOrigin=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        ),
        MappedRepresentation=source_representation,
    )
    mapped_item = model.create_entity(
        "IfcMappedItem",
        MappingSource=representation_map,
        MappingTarget=model.create_entity(
            "IfcCartesianTransformationOperator3D",
            LocalOrigin=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Scale=1.0,
        ),
    )
    roof = _roof(
        model,
        "MappedRoof",
        _body_shape(model, [mapped_item], representation_type="MappedRepresentation"),
    )

    assert modify_color(model, roof, "#3B82F6", propagate_mapped_sources=True)

    assert _has_blue_style(model, mapped_item)
    assert _has_blue_style(model, source_solid)


def test_modify_color_does_not_style_shared_mapped_source_items() -> None:
    model = _make_model()
    source_solid = _solid(model)
    context = model.by_type("IfcGeometricRepresentationContext")[0]
    source_representation = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[source_solid],
    )
    representation_map = model.create_entity(
        "IfcRepresentationMap",
        MappingOrigin=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        ),
        MappedRepresentation=source_representation,
    )
    mapped_item_a = model.create_entity(
        "IfcMappedItem",
        MappingSource=representation_map,
        MappingTarget=model.create_entity(
            "IfcCartesianTransformationOperator3D",
            LocalOrigin=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
            Scale=1.0,
        ),
    )
    mapped_item_b = model.create_entity(
        "IfcMappedItem",
        MappingSource=representation_map,
        MappingTarget=model.create_entity(
            "IfcCartesianTransformationOperator3D",
            LocalOrigin=model.create_entity("IfcCartesianPoint", Coordinates=(1.0, 0.0, 0.0)),
            Scale=1.0,
        ),
    )
    roof_a = _roof(
        model,
        "MappedRoofA",
        _body_shape(model, [mapped_item_a], representation_type="MappedRepresentation"),
    )
    _roof(
        model,
        "MappedRoofB",
        _body_shape(model, [mapped_item_b], representation_type="MappedRepresentation"),
    )

    assert modify_color(model, roof_a, "#3B82F6", propagate_mapped_sources=True)

    assert _has_blue_style(model, mapped_item_a)
    assert not _has_blue_style(model, mapped_item_b)
    assert not _has_blue_style(model, source_solid)
