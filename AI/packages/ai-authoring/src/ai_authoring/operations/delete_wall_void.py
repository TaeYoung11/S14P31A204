"""delete_wall_void operation handler.

This branch only validates atomic delete for door/window fillers hosted by
parametric wall bodies. BCR-hosted cases and direct opening-only deletes are
soft-rejected here and must remain out of scope for this branch.
"""

from __future__ import annotations

from typing import Any

import ifcopenshell

from ai_authoring.engine_3d import delete_element
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


def _host_wall_for_product(
    product: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance | None:
    if product.is_a("IfcDoor") or product.is_a("IfcWindow"):
        for rel_fill in getattr(product, "FillsVoids", []) or []:
            opening = getattr(rel_fill, "RelatingOpeningElement", None)
            if opening is None:
                continue
            for rel_void in getattr(opening, "VoidsElements", []) or []:
                wall = getattr(rel_void, "RelatingBuildingElement", None)
                if wall is not None and wall.is_a("IfcWall"):
                    return wall
        return None
    if product.is_a("IfcOpeningElement"):
        for rel_void in getattr(product, "VoidsElements", []) or []:
            wall = getattr(rel_void, "RelatingBuildingElement", None)
            if wall is not None and wall.is_a("IfcWall"):
                return wall
    return None


def _classify_shape_item(item: ifcopenshell.entity_instance | None) -> str | None:
    if item is None:
        return None
    if item.is_a("IfcExtrudedAreaSolid"):
        return "parametric"
    if item.is_a("IfcBooleanClippingResult"):
        return "bcr"
    if item.is_a("IfcBooleanResult"):
        return _classify_shape_item(getattr(item, "FirstOperand", None))
    return item.is_a()


def _host_wall_body_class(wall: ifcopenshell.entity_instance | None) -> str | None:
    if wall is None:
        return None
    representation = getattr(wall, "Representation", None)
    if representation is None:
        return None
    for rep in getattr(representation, "Representations", []) or []:
        if getattr(rep, "RepresentationIdentifier", None) != "Body":
            continue
        items = list(getattr(rep, "Items", []) or [])
        if items:
            return _classify_shape_item(items[0])
    return None


@register("delete_wall_void")
class DeleteWallVoidHandler:
    def execute(
        self,
        model: ifcopenshell.file,
        storey: ifcopenshell.entity_instance | None,
        parameters: dict[str, Any],
        selector: dict[str, Any] | None = None,
    ) -> list[str]:
        del storey
        products = _selected_products(model, selector)
        if not products:
            return []
        if len(products) != 1:
            raise ValueError("delete_wall_void only supports one target per operation")
        deleted_ids: list[str] = []
        expected_kind = parameters.get("expected_kind")
        allowed_host_body_class = parameters.get("allowed_host_body_class", "parametric")
        for product in products:
            if expected_kind == "door" and not product.is_a("IfcDoor"):
                raise ValueError("delete_wall_void expected an IfcDoor target")
            if expected_kind == "window" and not product.is_a("IfcWindow"):
                raise ValueError("delete_wall_void expected an IfcWindow target")
            if product.is_a("IfcOpeningElement"):
                raise ValueError(
                    "delete_wall_void does not support direct IfcOpeningElement delete "
                    "in this branch"
                )
            if not (product.is_a("IfcDoor") or product.is_a("IfcWindow")):
                raise ValueError("delete_wall_void only supports IfcDoor/IfcWindow targets")

            host_wall = _host_wall_for_product(product)
            body_class = _host_wall_body_class(host_wall)
            if body_class != allowed_host_body_class:
                raise ValueError(
                    "delete_wall_void only supports parametric host walls in this branch"
                )
            global_id = product.GlobalId
            if not delete_element(model, product, product.is_a()):
                raise ValueError(f"delete_wall_void failed for {global_id}")
            deleted_ids.append(global_id)
        return deleted_ids
