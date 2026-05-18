"""transform_elements operation handler."""

from __future__ import annotations

from typing import Any

import ifcopenshell

from ai_authoring.engine_3d import modify_rotation, modify_rotation_axis_angle, rotation_targets
from ai_authoring.operations.registry import register
from ai_authoring.operations.space_support import (
    is_product_host_relative,
    mm_to_model_units,
    translate_product,
)

LEGACY_ROTATION_XY_ERROR = (
    "legacy rotation_deg only supports z; use axis-angle for x/y rotation"
)


def has_unsupported_legacy_rotation_xy(rotation: Any) -> bool:
    if not isinstance(rotation, dict) or "axis" in rotation:
        return False
    for key in ("x", "y"):
        value = rotation.get(key)
        if value is None:
            continue
        try:
            if abs(float(value)) > 1.0e-6:
                return True
        except (TypeError, ValueError):
            continue
    return False


def _rotation_axis_angle(rotation: Any) -> tuple[dict[str, Any], float, str] | None:
    if not isinstance(rotation, dict):
        return None
    axis = rotation.get("axis")
    angle = rotation.get("angle")
    if angle is None:
        angle = rotation.get("angle_degrees")
    if angle is None or not isinstance(axis, dict):
        return None
    try:
        return (axis, float(angle), str(rotation.get("pivot") or "BBOX_CENTER"))
    except (TypeError, ValueError):
        return None


def _legacy_rotation_z(rotation: Any) -> float | None:
    if isinstance(rotation, (int, float)):
        return float(rotation)
    if isinstance(rotation, dict) and rotation.get("z") is not None:
        try:
            return float(rotation["z"])
        except (TypeError, ValueError):
            return None
    return None


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
        rotation = parameters.get("rotation_deg")
        skip_if_host_relative = bool(parameters.get("skip_if_host_relative"))
        transformed_ids: list[str] = []
        for product in _selected_products(model, selector):
            if skip_if_host_relative and is_product_host_relative(product):
                continue
            changed = False
            if translation:
                changed |= translate_product(
                    model,
                    product,
                    x_m=mm_to_model_units(model, translation.get("x"), 0.0),
                    y_m=mm_to_model_units(model, translation.get("y"), 0.0),
                    z_m=mm_to_model_units(model, translation.get("z"), 0.0),
                )
            axis_angle = _rotation_axis_angle(rotation)
            if axis_angle is not None:
                axis, angle, pivot = axis_angle
                for target in rotation_targets(product):
                    changed |= modify_rotation_axis_angle(model, target, axis, angle, pivot)
            else:
                if has_unsupported_legacy_rotation_xy(rotation):
                    raise ValueError(LEGACY_ROTATION_XY_ERROR)
                legacy_z = _legacy_rotation_z(rotation)
                if legacy_z is not None:
                    for target in rotation_targets(product):
                        changed |= modify_rotation(model, target, legacy_z)
            if changed:
                transformed_ids.append(product.GlobalId)
        return transformed_ids
