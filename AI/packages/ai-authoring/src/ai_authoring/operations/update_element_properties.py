"""update_element_properties operation handler."""

from __future__ import annotations

from typing import Any

import ifcopenshell

from ai_authoring.engine_3d import (
    modify_color,
    modify_height,
    modify_length,
    modify_material,
    modify_thickness,
)
from ai_authoring.operations.registry import register
from ai_authoring.operations.space_support import update_space
from ai_authoring.operations.wall_support import update_wall_segment


def _dimension_change(value: Any) -> dict[str, float | str]:
    if isinstance(value, dict):
        return value
    return {"mode": "ABSOLUTE", "value": float(value)}


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
        segment_mm = parameters.get("segment_mm") or {}

        for product in _selected_products(model, selector):
            if product.is_a("IfcSpace"):
                if update_space(
                    model=model,
                    space=product,
                    dimensions_mm=dimensions_mm,
                    properties=properties,
                    pset_updates=pset_updates,
                    pset_name=pset_name,
                ):
                    updated_ids.append(product.GlobalId)
                continue

            if product.is_a("IfcWall") and segment_mm:
                start = segment_mm.get("start") or {}
                end = segment_mm.get("end") or {}
                if update_wall_segment(
                    model=model,
                    wall=product,
                    start_m=(
                        float(start.get("x", 0.0)) / 1000.0,
                        float(start.get("y", 0.0)) / 1000.0,
                    ),
                    end_m=(
                        float(end.get("x", 0.0)) / 1000.0,
                        float(end.get("y", 0.0)) / 1000.0,
                    ),
                ):
                    updated_ids.append(product.GlobalId)
                    continue

            if product.is_a("IfcWall") and dimensions_mm.get("width") is not None:
                modify_thickness(
                    product,
                    _dimension_change(dimensions_mm["width"]),
                    scale=1000.0,
                )
            if dimensions_mm.get("length") is not None:
                modify_length(
                    product,
                    _dimension_change(dimensions_mm["length"]),
                    scale=1000.0,
                )
            if dimensions_mm.get("height") is not None:
                modify_height(
                    product,
                    _dimension_change(dimensions_mm["height"]),
                    scale=1000.0,
                )
            if properties.get("name") is not None:
                product.Name = str(properties["name"])
            propagate_roof_appearance = bool(
                parameters.get("propagate_roof_appearance")
            ) and product.is_a("IfcRoof")
            if parameters.get("material") is not None:
                modify_material(
                    model,
                    product,
                    {"name": str(parameters["material"])},
                    propagate_mapped_sources=propagate_roof_appearance,
                    propagate_roof_descendants=propagate_roof_appearance,
                )
            if parameters.get("color") is not None:
                modify_color(
                    model,
                    product,
                    str(parameters["color"]),
                    propagate_mapped_sources=propagate_roof_appearance,
                    propagate_roof_descendants=propagate_roof_appearance,
                )
            updated_ids.append(product.GlobalId)
        return updated_ids
