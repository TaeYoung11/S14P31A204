from __future__ import annotations

import json
from typing import Any

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.pset
import ifcopenshell.api.root

from .command import CommandBatch, FloorNLPCommand

_DEFAULT_SPACE_HEIGHT_M = 2.7


def apply_space_plan(
    *,
    ifc_path: str,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None = None,
    policy_plan: dict[str, Any] | None,
) -> dict[str, Any]:
    model = ifcopenshell.open(ifc_path)
    if command.action == "add_room":
        return _apply_add_room(
            model=model,
            output_path=output_path,
            command=command,
            command_batch=command_batch,
        )

    if policy_plan is None or policy_plan.get("status") != "planned":
        return {
            "status": "not_applied",
            "summary": "planned 상태의 2D policy plan이 없어 IFC를 수정하지 않았습니다.",
        }

    if command.action == "remove_room":
        return _apply_remove_room(model=model, output_path=output_path, policy_plan=policy_plan)
    if command.action == "resize_room":
        return _apply_resize_room(
            model=model,
            output_path=output_path,
            command=command,
            policy_plan=policy_plan,
        )

    return {
        "status": "not_applied",
        "summary": f"{command.action}은 아직 2D executor가 지원하지 않습니다.",
    }


def _apply_add_room(
    *,
    model: ifcopenshell.file,
    output_path: str,
    command: FloorNLPCommand,
    command_batch: CommandBatch | None,
) -> dict[str, Any]:
    if command.new_room is None or command_batch is None or not command_batch.commands:
        return {"status": "not_applied", "summary": "add_room 실행에 필요한 명령 정보가 없습니다."}

    metadata = command_batch.commands[0].params.get("metadata", {})
    storey_id = metadata.get("storey_id")
    if storey_id is None:
        return {
            "status": "not_applied",
            "summary": "대상 storey_id가 없어 방을 추가하지 않았습니다.",
        }

    storey = model.by_guid(storey_id)
    if storey is None:
        return {"status": "not_applied", "summary": "대상 IfcBuildingStorey를 찾지 못했습니다."}

    owner_history = _owner_history(model)
    context = _ensure_body_context(model)
    x_m, y_m = _suggest_space_origin_m(model)

    space = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcSpace",
        name=command.new_room.name,
    )
    space.OwnerHistory = owner_history
    space.CompositionType = "ELEMENT"
    space.ObjectPlacement = _create_local_placement(
        model=model,
        relative_to=getattr(storey, "ObjectPlacement", None),
        location=(x_m, y_m, 0.0),
        ref_direction=(1.0, 0.0, 0.0),
    )
    space.Representation = _create_space_representation(
        model=model,
        width_m=command.new_room.width / 1000.0,
        height_m=command.new_room.height / 1000.0,
        depth_m=_DEFAULT_SPACE_HEIGHT_M,
        context=context,
    )
    ifcopenshell.api.aggregate.assign_object(model, products=[space], relating_object=storey)
    _update_space_pset(
        model=model,
        space=space,
        width_mm=command.new_room.width,
        height_mm=command.new_room.height,
        rects=command.new_room.rects,
        room_type=command.new_room.type,
        shape=command.new_room.shape,
        locked=False,
    )

    model.write(output_path)
    return {
        "status": "applied",
        "summary": "IfcSpace 추가가 적용되었습니다.",
        "created_space_id": space.GlobalId,
    }


def _apply_remove_room(
    *,
    model: ifcopenshell.file,
    output_path: str,
    policy_plan: dict[str, Any],
) -> dict[str, Any]:
    _remove_related_products(model, policy_plan.get("remove_opening_ids", []))
    _remove_related_products(model, policy_plan.get("remove_wall_ids", []))
    space = model.by_guid(policy_plan["target_space_id"])
    if space is None:
        return {"status": "not_applied", "summary": "삭제 대상 IfcSpace를 찾지 못했습니다."}

    ifcopenshell.api.root.remove_product(model, product=space)
    model.write(output_path)
    return {
        "status": "applied",
        "summary": "IfcSpace 삭제가 적용되었습니다.",
        "removed_space_id": policy_plan["target_space_id"],
    }


def _apply_resize_room(
    *,
    model: ifcopenshell.file,
    output_path: str,
    command: FloorNLPCommand,
    policy_plan: dict[str, Any],
) -> dict[str, Any]:
    space = model.by_guid(policy_plan["target_space_id"])
    if space is None:
        return {"status": "not_applied", "summary": "크기 변경 대상 IfcSpace를 찾지 못했습니다."}

    placement = getattr(space, "ObjectPlacement", None)
    relative = getattr(placement, "RelativePlacement", None) if placement else None
    location = getattr(relative, "Location", None) if relative else None
    if relative is None or location is None:
        return {"status": "not_applied", "summary": "IfcSpace placement를 읽지 못했습니다."}

    current_width_m, current_height_m, current_depth_m = _space_dimensions_m(space)
    new_width_m = (command.resize_width or 0) / 1000.0
    new_height_m = (command.resize_height or 0) / 1000.0
    direction = policy_plan.get("direction")

    coords = list(tuple(location.Coordinates))
    while len(coords) < 3:
        coords.append(0.0)
    if direction == "west":
        coords[0] += current_width_m - new_width_m
    elif direction == "south":
        coords[1] += current_height_m - new_height_m
    location.Coordinates = tuple(coords[:3])
    offset_x_m = 0.0
    offset_y_m = 0.0
    if direction == "west":
        offset_x_m = current_width_m - new_width_m
    elif direction == "east":
        offset_x_m = new_width_m - current_width_m
    elif direction == "south":
        offset_y_m = current_height_m - new_height_m
    elif direction == "north":
        offset_y_m = new_height_m - current_height_m

    space.Representation = _create_space_representation(
        model=model,
        width_m=new_width_m,
        height_m=new_height_m,
        depth_m=current_depth_m,
        context=_body_context(model, space),
    )
    _translate_products(
        model,
        policy_plan.get("affected_wall_ids", []),
        offset_x_m,
        offset_y_m,
    )
    _translate_products(
        model,
        policy_plan.get("affected_opening_ids", []),
        offset_x_m,
        offset_y_m,
    )
    _update_space_pset(
        model=model,
        space=space,
        width_mm=command.resize_width,
        height_mm=command.resize_height,
        rects=command.resize_rects,
    )

    model.write(output_path)
    return {
        "status": "applied",
        "summary": "IfcSpace 크기 변경이 적용되었습니다.",
        "resized_space_id": policy_plan["target_space_id"],
    }


def _remove_related_products(model: ifcopenshell.file, global_ids: list[str]) -> None:
    for global_id in global_ids:
        try:
            product = model.by_guid(global_id)
        except RuntimeError:
            continue
        if product is None:
            continue
        if product.is_a("IfcDoor") or product.is_a("IfcWindow"):
            for rel in getattr(product, "FillsVoids", []) or []:
                opening = getattr(rel, "RelatingOpeningElement", None)
                if opening is not None:
                    ifcopenshell.api.root.remove_product(model, product=opening)
        ifcopenshell.api.root.remove_product(model, product=product)


def _translate_products(
    model: ifcopenshell.file,
    global_ids: list[str],
    offset_x_m: float,
    offset_y_m: float,
) -> None:
    if offset_x_m == 0.0 and offset_y_m == 0.0:
        return
    for global_id in global_ids:
        try:
            product = model.by_guid(global_id)
        except RuntimeError:
            continue
        if product is None:
            continue
        placement = getattr(product, "ObjectPlacement", None)
        relative = getattr(placement, "RelativePlacement", None) if placement else None
        location = getattr(relative, "Location", None) if relative else None
        if location is None:
            continue
        coords = list(tuple(getattr(location, "Coordinates", ()) or ()))
        while len(coords) < 3:
            coords.append(0.0)
        coords[0] += offset_x_m
        coords[1] += offset_y_m
        location.Coordinates = tuple(coords[:3])


def _space_dimensions_m(space: ifcopenshell.entity_instance) -> tuple[float, float, float]:
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

    width_mm = None
    height_mm = None
    for rel in getattr(space, "IsDefinedBy", []) or []:
        definition = getattr(rel, "RelatingPropertyDefinition", None)
        if definition and getattr(definition, "Name", None) == "Batang_SpaceDimensions":
            for prop in getattr(definition, "HasProperties", []) or []:
                nominal = getattr(prop, "NominalValue", None)
                wrapped = getattr(nominal, "wrappedValue", None)
                if prop.Name == "Width" and isinstance(wrapped, (int, float)):
                    width_mm = wrapped
                elif prop.Name == "Height" and isinstance(wrapped, (int, float)):
                    height_mm = wrapped
            break

    return (
        (float(width_mm) / 1000.0) if width_mm is not None else 0.0,
        (float(height_mm) / 1000.0) if height_mm is not None else 0.0,
        _DEFAULT_SPACE_HEIGHT_M,
    )


def _body_context(
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
    return _ensure_body_context(model)


def _ensure_body_context(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
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


def _owner_history(model: ifcopenshell.file) -> ifcopenshell.entity_instance | None:
    histories = model.by_type("IfcOwnerHistory")
    return histories[0] if histories else None


def _create_local_placement(
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


def _suggest_space_origin_m(model: ifcopenshell.file) -> tuple[float, float]:
    max_x_mm = 0.0
    for space in model.by_type("IfcSpace"):
        placement = getattr(space, "ObjectPlacement", None)
        relative = getattr(placement, "RelativePlacement", None) if placement else None
        location = getattr(relative, "Location", None) if relative else None
        coords = tuple(getattr(location, "Coordinates", ()) or ())
        if len(coords) < 2:
            continue
        width_m, _, _ = _space_dimensions_m(space)
        max_x_mm = max(max_x_mm, float(coords[0]) * 1000.0 + width_m * 1000.0)
    return ((max_x_mm + 1000.0) / 1000.0, 0.0)


def _create_space_representation(
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


def _update_space_pset(
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
