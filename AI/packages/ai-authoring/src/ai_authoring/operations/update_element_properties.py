"""update_element_properties operation handler."""

from __future__ import annotations

from typing import Any

import ifcopenshell

from ai_authoring.engine_3d import modify_color, modify_height, modify_material, modify_thickness
from ai_authoring.operations.registry import register
from ai_authoring.operations.space_support import update_space


def _selected_products(
    model: ifcopenshell.file,
    selector: dict[str, Any] | None,
) -> list[ifcopenshell.entity_instance]:
    global_ids = list((selector or {}).get("global_ids") or [])
    products: list[ifcopenshell.entity_instance] = []
    for global_id in global_ids:
        try:
            product = model.by_guid(global_id)
        except RuntimeError:
            product = None
        if product is not None:
            products.append(product)
    return products


@register("update_element_properties")
class UpdateElementPropertiesHandler:
    def execute(
        self,
        model: ifcopenshell.file,
        storey: ifcopenshell.entity_instance | None,
        parameters: dict[str, Any],
        selector: dict[str, Any] | None = None,
    ) -> list[str]:
        del storey
        updated_ids: list[str] = []
        dimensions_mm = parameters.get("dimensions_mm") or {}
        properties = parameters.get("properties") or {}
        pset_updates = parameters.get("pset_updates") or {}
        pset_name = str(parameters.get("pset_name") or "Batang_SpaceDimensions")

        for product in _selected_products(model, selector):
            if product.is_a("IfcSpace"):
                update_space(
                    model=model,
                    space=product,
                    dimensions_mm=dimensions_mm,
                    properties=properties,
                    pset_updates=pset_updates,
                    pset_name=pset_name,
                )
                updated_ids.append(product.GlobalId)
                continue

            if product.is_a("IfcWall") and dimensions_mm.get("width") is not None:
                modify_thickness(
                    product,
                    {"mode": "ABSOLUTE", "value": float(dimensions_mm["width"])},
                    scale=1000.0,
                )
            if dimensions_mm.get("height") is not None:
                modify_height(
                    product,
                    {"mode": "ABSOLUTE", "value": float(dimensions_mm["height"])},
                    scale=1000.0,
                )
            if properties.get("name") is not None:
                product.Name = str(properties["name"])
            if parameters.get("material") is not None:
                modify_material(model, product, {"name": str(parameters["material"])})
            if parameters.get("color") is not None:
                modify_color(model, product, str(parameters["color"]))
            updated_ids.append(product.GlobalId)
        return updated_ids
