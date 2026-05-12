"""transform_elements operation handler."""

from __future__ import annotations

from typing import Any

import ifcopenshell

from ai_authoring.engine_3d import modify_position, modify_rotation
from ai_authoring.operations.registry import register


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


@register("transform_elements")
class TransformElementsHandler:
    def execute(
        self,
        model: ifcopenshell.file,
        storey: ifcopenshell.entity_instance | None,
        parameters: dict[str, Any],
        selector: dict[str, Any] | None = None,
    ) -> list[str]:
        del storey
        translation = parameters.get("translation_mm")
        if translation is None:
            translation = parameters.get("translate_mm")
        translation = translation or {}
        rotation = parameters.get("rotation_deg") or {}
        transformed_ids: list[str] = []
        for product in _selected_products(model, selector):
            changed = False
            if translation:
                pos_dict: dict[str, Any] = {"mode": "RELATIVE", **translation}
                changed |= modify_position(product, pos_dict, scale=1000.0)
            if rotation.get("z") is not None:
                changed |= modify_rotation(model, product, float(rotation["z"]))
            if changed:
                transformed_ids.append(product.GlobalId)
        return transformed_ids
