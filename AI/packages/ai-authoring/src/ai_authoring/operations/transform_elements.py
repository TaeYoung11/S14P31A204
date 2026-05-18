"""transform_elements operation handler."""

from __future__ import annotations

from typing import Any

import ifcopenshell

from ai_authoring.engine_3d import modify_rotation
from ai_authoring.operations.registry import register
from ai_authoring.operations.space_support import (
    is_product_host_relative,
    mm_to_model_units,
    translate_product,
    transform_scope_for_product,
)


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
        skip_if_host_relative = bool(parameters.get("skip_if_host_relative"))
        transformed_ids: list[str] = []
        for product in _selected_products(model, selector):
            for scoped_product in transform_scope_for_product(model, product):
                if skip_if_host_relative and is_product_host_relative(scoped_product):
                    continue
                changed = False
                if translation:
                    changed |= translate_product(
                        model,
                        scoped_product,
                        x_m=mm_to_model_units(model, translation.get("x"), 0.0),
                        y_m=mm_to_model_units(model, translation.get("y"), 0.0),
                        z_m=mm_to_model_units(model, translation.get("z"), 0.0),
                    )
                if rotation.get("z") is not None:
                    changed |= modify_rotation(model, scoped_product, float(rotation["z"]))
                if changed and scoped_product.GlobalId not in transformed_ids:
                    transformed_ids.append(scoped_product.GlobalId)
        return transformed_ids
