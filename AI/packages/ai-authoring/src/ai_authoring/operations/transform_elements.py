"""transform_elements operation handler."""

from __future__ import annotations

from typing import Any

import ifcopenshell

from ai_authoring.operations.registry import register
from ai_authoring.operations.space_support import translate_product


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
        translation = parameters.get("translate_mm") or {}
        x_m = float(translation.get("x", 0.0)) / 1000.0
        y_m = float(translation.get("y", 0.0)) / 1000.0
        z_m = float(translation.get("z", 0.0)) / 1000.0
        moved_ids: list[str] = []
        for product in _selected_products(model, selector):
            if translate_product(product, x_m=x_m, y_m=y_m, z_m=z_m):
                moved_ids.append(product.GlobalId)
        return moved_ids
