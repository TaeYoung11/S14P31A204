"""IfcBuildingStorey operation handlers."""

from __future__ import annotations

from typing import Any

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.util.element

from ai_authoring.engine_3d import delete_element
from ai_authoring.operations.registry import register
from ai_authoring.operations.space_support import create_local_placement, mm_to_model_units


def _first_building(model: ifcopenshell.file) -> ifcopenshell.entity_instance | None:
    buildings = model.by_type("IfcBuilding")
    return buildings[0] if buildings else None


def _selected_storeys(
    model: ifcopenshell.file,
    selector: dict[str, Any] | None,
) -> list[ifcopenshell.entity_instance]:
    selector = selector or {}
    storeys: list[ifcopenshell.entity_instance] = []
    for global_id in list(selector.get("global_ids") or []):
        try:
            storey = model.by_guid(str(global_id))
        except RuntimeError:
            storey = None
        if storey is not None and storey.is_a("IfcBuildingStorey"):
            storeys.append(storey)
    if storeys:
        return storeys

    name = selector.get("storey") or selector.get("name")
    if isinstance(name, str) and name.strip():
        target = name.strip().lower()
        return [
            storey
            for storey in model.by_type("IfcBuildingStorey")
            if str(getattr(storey, "Name", "") or "").strip().lower() == target
        ]
    local_id = selector.get("tag") or selector.get("local_id")
    if isinstance(local_id, str) and local_id.strip():
        target = local_id.strip()
        matched: list[ifcopenshell.entity_instance] = []
        for storey in model.by_type("IfcBuildingStorey"):
            psets = ifcopenshell.util.element.get_psets(storey)
            floor_layer_pset = psets.get("Batang_FloorLayer") or {}
            if str(floor_layer_pset.get("LocalFloorLayerId") or "") == target:
                matched.append(storey)
        return matched
    return []


def _contained_products(storey: ifcopenshell.entity_instance) -> list[ifcopenshell.entity_instance]:
    products: list[ifcopenshell.entity_instance] = []
    for rel in list(getattr(storey, "ContainsElements", []) or []):
        if rel.is_a("IfcRelContainedInSpatialStructure"):
            products.extend(list(getattr(rel, "RelatedElements", []) or []))
    return products


def _set_floor_layer_pset(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    *,
    ceiling_height_mm: Any | None,
    local_id: Any | None = None,
) -> None:
    properties: dict[str, Any] = {}
    if ceiling_height_mm is not None:
        properties["CeilingHeightMm"] = float(ceiling_height_mm)
    if local_id is not None:
        properties["LocalFloorLayerId"] = str(local_id)
    if not properties:
        return
    pset = ifcopenshell.api.pset.add_pset(model, product=storey, name="Batang_FloorLayer")
    ifcopenshell.api.pset.edit_pset(model, pset=pset, properties=properties)


@register("create_storey")
class CreateStoreyHandler:
    def execute(
        self,
        model: ifcopenshell.file,
        storey: ifcopenshell.entity_instance | None,
        parameters: dict[str, Any],
    ) -> ifcopenshell.entity_instance | None:
        del storey
        name = str(parameters.get("name") or "").strip()
        if not name:
            return None
        building = _first_building(model)
        if building is None:
            return None

        elevation = mm_to_model_units(model, parameters.get("elevation_mm"), 0.0)
        created = ifcopenshell.api.root.create_entity(
            model,
            ifc_class="IfcBuildingStorey",
            name=name,
        )
        created.Elevation = elevation
        created.ObjectPlacement = create_local_placement(
            model=model,
            relative_to=getattr(building, "ObjectPlacement", None),
            location=(0.0, 0.0, elevation),
        )
        ifcopenshell.api.aggregate.assign_object(model, products=[created], relating_object=building)
        _set_floor_layer_pset(
            model,
            created,
            ceiling_height_mm=parameters.get("ceiling_height_mm"),
            local_id=parameters.get("local_id"),
        )
        return created


@register("update_storey")
class UpdateStoreyHandler:
    def execute(
        self,
        model: ifcopenshell.file,
        storey: ifcopenshell.entity_instance | None,
        parameters: dict[str, Any],
        selector: dict[str, Any] | None = None,
    ) -> list[str]:
        del storey
        updated_ids: list[str] = []
        for target in _selected_storeys(model, selector):
            if parameters.get("name") is not None:
                target.Name = str(parameters["name"]).strip()
            if parameters.get("elevation_mm") is not None:
                target.Elevation = mm_to_model_units(model, parameters["elevation_mm"], 0.0)
            _set_floor_layer_pset(
                model,
                target,
                ceiling_height_mm=parameters.get("ceiling_height_mm"),
            )
            updated_ids.append(target.GlobalId)
        return updated_ids


@register("delete_storey")
class DeleteStoreyHandler:
    def execute(
        self,
        model: ifcopenshell.file,
        storey: ifcopenshell.entity_instance | None,
        parameters: dict[str, Any],
        selector: dict[str, Any] | None = None,
    ) -> list[str]:
        del storey, parameters
        deleted_ids: list[str] = []
        for target in _selected_storeys(model, selector):
            global_id = target.GlobalId
            for product in _contained_products(target):
                delete_element(model, product, product.is_a())
            for rel in list(getattr(target, "Decomposes", []) or []):
                if not rel.is_a("IfcRelAggregates"):
                    continue
                remaining = [item for item in rel.RelatedObjects if item != target]
                if remaining:
                    rel.RelatedObjects = remaining
                else:
                    model.remove(rel)
            model.remove(target)
            deleted_ids.append(global_id)
        return deleted_ids
