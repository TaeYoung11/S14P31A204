from __future__ import annotations

import argparse
import json
import re
import shutil
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, cast

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.geometry
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.unit
import ifcopenshell.geom
import ifcopenshell.guid
import ifcopenshell.util.element
import ifcopenshell.util.placement
import ifcopenshell.util.unit
import numpy as np


ASSET_TYPES = (
    "IfcDoor",
    "IfcWindow",
    "IfcWallStandardCase",
    "IfcStair",
    "IfcRoof",
    "IfcRailing",
)
SINGLE_ASSET_CATEGORIES = {"door", "window", "wall"}
WALL_REPRESENTATIVE_GLOBAL_ID = "2znubWhPDD4wn7Fg4E20CS"
TERRACE_ASSET_ID = "terrace"
TERRACE_WALL_GLOBAL_IDS = (
    "2znubWhPDD4wn7Fg4E24GR",
    "2znubWhPDD4wn7Fg4E24k8",
    "2znubWhPDD4wn7Fg4E24Nq",
)
TERRACE_FLOOR_THICKNESS_M = 0.12
DEFAULT_OUTPUT_ROOT = Path.home() / "Downloads" / "batang_history"


@dataclass(frozen=True)
class AssetGroup:
    id: str
    label: str
    category: str
    source_element_names: tuple[str, ...]
    source_global_ids: tuple[str, ...]


def _slugify(value: str) -> str:
    lowered = re.sub(r"[^a-z0-9]+", "-", value.lower())
    return lowered.strip("-") or "asset"


def _clean_text(value: object) -> str:
    text = str(value or "")
    return "".join(char for char in text if unicodedata.category(char) != "Cc")


def _element_suffix(element: ifcopenshell.entity_instance) -> str:
    name = _clean_text(getattr(element, "Name", ""))
    match = re.search(r"(\d+(?:\.\d+)?)$", name)
    if match:
        return match.group(1).replace(".", "-")
    return str(getattr(element, "GlobalId", "asset"))[-6:]


def _asset_category(element: ifcopenshell.entity_instance) -> str:
    if element.is_a("IfcDoor"):
        return "door"
    if element.is_a("IfcWindow"):
        return "window"
    if element.is_a("IfcWall") or element.is_a("IfcWallStandardCase"):
        return "wall"
    if element.is_a("IfcStair"):
        return "stair"
    if element.is_a("IfcRoof"):
        return "roof"
    if element.is_a("IfcRailing"):
        return "railing"
    return _slugify(element.is_a())


def _asset_id(element: ifcopenshell.entity_instance) -> str:
    return f"{_asset_category(element)}-{_element_suffix(element)}"


def _terrace_walls(
    model: ifcopenshell.file,
) -> list[ifcopenshell.entity_instance]:
    walls: list[ifcopenshell.entity_instance] = []
    for global_id in TERRACE_WALL_GLOBAL_IDS:
        wall = model.by_guid(global_id)
        if wall is None:
            continue
        if not (wall.is_a("IfcWall") or wall.is_a("IfcWallStandardCase")):
            continue
        walls.append(wall)
    return walls


def _is_non_representative_wall(element: ifcopenshell.entity_instance) -> bool:
    if not (element.is_a("IfcWall") or element.is_a("IfcWallStandardCase")):
        return False
    return _clean_text(getattr(element, "GlobalId", "")) != WALL_REPRESENTATIVE_GLOBAL_ID


def _composite_asset_groups(
    model: ifcopenshell.file,
) -> tuple[list[AssetGroup], set[int]]:
    groups: list[AssetGroup] = []
    consumed_ids: set[int] = set()
    terrace_products = _terrace_walls(model)
    if len(terrace_products) == len(TERRACE_WALL_GLOBAL_IDS):
        if _bbox_for_products(terrace_products) is not None:
            consumed_ids.update(product.id() for product in terrace_products)
            groups.append(
                AssetGroup(
                    id=TERRACE_ASSET_ID,
                    label="Terrace",
                    category="terrace",
                    source_element_names=tuple(
                        _clean_text(getattr(product, "Name", "") or product.is_a())
                        for product in terrace_products
                    ),
                    source_global_ids=tuple(
                        _clean_text(getattr(product, "GlobalId", ""))
                        for product in terrace_products
                    ),
                )
            )
    return groups, consumed_ids


def _children_recursive(
    element: ifcopenshell.entity_instance,
) -> list[ifcopenshell.entity_instance]:
    children: list[ifcopenshell.entity_instance] = []
    for rel in getattr(element, "IsDecomposedBy", []) or []:
        if not rel.is_a("IfcRelAggregates"):
            continue
        for child in getattr(rel, "RelatedObjects", []) or []:
            if child == element:
                continue
            children.append(child)
            children.extend(_children_recursive(child))
    return children


def _filled_opening_context(
    element: ifcopenshell.entity_instance,
) -> list[ifcopenshell.entity_instance]:
    opening_context: list[ifcopenshell.entity_instance] = []
    for rel in getattr(element, "FillsVoids", []) or []:
        if not rel.is_a("IfcRelFillsElement"):
            continue
        opening = getattr(rel, "RelatingOpeningElement", None)
        if opening is not None:
            opening_context.append(opening)
    return opening_context


def _unique_entities(
    entities: list[ifcopenshell.entity_instance],
) -> list[ifcopenshell.entity_instance]:
    seen: set[int] = set()
    unique: list[ifcopenshell.entity_instance] = []
    for entity in entities:
        entity_id = entity.id()
        if entity_id in seen:
            continue
        seen.add(entity_id)
        unique.append(entity)
    return unique


def _is_aggregated_by_asset(element: ifcopenshell.entity_instance) -> bool:
    for inverse in element.wrapped_data.file.get_inverse(element):
        if not inverse.is_a("IfcRelAggregates"):
            continue
        parent = getattr(inverse, "RelatingObject", None)
        if parent is not None and parent != element and parent.is_a() in ASSET_TYPES:
            return True
    return False


def build_asset_groups(model: ifcopenshell.file) -> list[AssetGroup]:
    groups, consumed_source_ids = _composite_asset_groups(model)
    seen_ids: set[str] = set()
    seen_ids.update(group.id for group in groups)
    selected_single_categories: set[str] = set()
    for ifc_type in ASSET_TYPES:
        elements = list(model.by_type(ifc_type))
        for element in elements:
            if element.id() in consumed_source_ids:
                continue
            if _is_non_representative_wall(element):
                continue
            if _is_aggregated_by_asset(element):
                continue
            category = _asset_category(element)
            if category in selected_single_categories:
                continue
            members = _unique_entities(
                [element, *_children_recursive(element), *_filled_opening_context(element)]
            )
            members = [
                member for member in members if member.id() not in consumed_source_ids
            ]
            if _bbox_for_products(members) is None:
                continue
            names = tuple(
                _clean_text(getattr(member, "Name", "") or member.is_a())
                for member in members
            )
            global_ids = tuple(_clean_text(getattr(member, "GlobalId", "")) for member in members)
            asset_id = _asset_id(element)
            root_global_id = str(getattr(element, "GlobalId", ""))
            if asset_id in seen_ids:
                asset_id = f"{asset_id}-{root_global_id[-6:]}"
            seen_ids.add(asset_id)
            if category in SINGLE_ASSET_CATEGORIES:
                selected_single_categories.add(category)
            groups.append(
                AssetGroup(
                    id=asset_id,
                    label=_clean_text(getattr(element, "Name", "") or asset_id),
                    category=category,
                    source_element_names=names,
                    source_global_ids=global_ids,
                )
            )
    return groups


def _bbox_for_products(
    products: list[ifcopenshell.entity_instance],
) -> dict[str, list[float]] | None:
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []
    for product in products:
        try:
            shape = cast(Any, ifcopenshell.geom.create_shape(settings, product))
        except Exception:
            continue
        verts = shape.geometry.verts
        xs.extend(float(value) for value in verts[0::3])
        ys.extend(float(value) for value in verts[1::3])
        zs.extend(float(value) for value in verts[2::3])
    if not xs or not ys or not zs:
        return None
    minimum = [min(xs), min(ys), min(zs)]
    maximum = [max(xs), max(ys), max(zs)]
    return {
        "min": minimum,
        "max": maximum,
        "sizeMm": [
            round((maximum[0] - minimum[0]) * 1000.0, 3),
            round((maximum[1] - minimum[1]) * 1000.0, 3),
            round((maximum[2] - minimum[2]) * 1000.0, 3),
        ],
        "originMm": [round(value * 1000.0, 3) for value in minimum],
    }


def _asset_material_names(model: ifcopenshell.file) -> list[str]:
    names = {
        _clean_text(getattr(material, "Name", "")).strip()
        for material in model.by_type("IfcMaterial")
    }
    return sorted(name for name in names if name)


def _asset_colors(model: ifcopenshell.file) -> list[dict[str, float | str | None]]:
    colors: list[dict[str, float | str | None]] = []
    seen: set[tuple[str | None, float, float, float]] = set()
    for color in model.by_type("IfcColourRgb"):
        red = round(float(color.Red), 6)
        green = round(float(color.Green), 6)
        blue = round(float(color.Blue), 6)
        name_text = _clean_text(getattr(color, "Name", ""))
        name = name_text or None
        key = (name, red, green, blue)
        if key in seen:
            continue
        seen.add(key)
        colors.append({"name": name, "r": red, "g": green, "b": blue})
    return colors


def _create_spatial_tree(
    model: ifcopenshell.file,
    group: AssetGroup,
) -> ifcopenshell.entity_instance:
    project = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcProject",
        name=f"{group.id} Asset Library",
    )
    ifcopenshell.api.unit.assign_unit(model)
    site = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcSite",
        name="Asset Site",
    )
    building = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcBuilding",
        name="Asset Building",
    )
    storey = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcBuildingStorey",
        name="Asset Storey",
    )
    ifcopenshell.api.aggregate.assign_object(
        model,
        products=[site],
        relating_object=project,
    )
    ifcopenshell.api.aggregate.assign_object(
        model,
        products=[building],
        relating_object=site,
    )
    ifcopenshell.api.aggregate.assign_object(
        model,
        products=[storey],
        relating_object=building,
    )
    return storey


def _body_context(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    fallback_body_context: ifcopenshell.entity_instance | None = None
    for context in model.by_type("IfcGeometricRepresentationSubContext"):
        identifier = _clean_text(getattr(context, "ContextIdentifier", "")).casefold()
        target_view = _clean_text(getattr(context, "TargetView", "")).casefold()
        if (
            identifier == "body"
            and target_view in {"model_view", "modelview", ""}
        ):
            return context
        if identifier == "body" and fallback_body_context is None:
            fallback_body_context = context
    if fallback_body_context is not None:
        return fallback_body_context
    for context in model.by_type("IfcGeometricRepresentationContext"):
        context_type = _clean_text(getattr(context, "ContextType", "")).casefold()
        if context_type == "model":
            return ifcopenshell.api.context.add_context(
                model,
                context_identifier="Body",
                target_view="MODEL_VIEW",
                parent=context,
            )
    model_context = ifcopenshell.api.context.add_context(model, context_type="Model")
    return ifcopenshell.api.context.add_context(
        model,
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=model_context,
    )


def _add_terrace_floor(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    wall_bbox: dict[str, list[float]] | None,
) -> ifcopenshell.entity_instance:
    if wall_bbox is None:
        raise ValueError("Terrace wall bbox is required to generate a terrace floor.")
    min_x, min_y, min_z = wall_bbox["min"]
    max_x, max_y, _ = wall_bbox["max"]
    width = max_x - min_x
    depth = max_y - min_y
    if width <= 0.0 or depth <= 0.0:
        raise ValueError(
            f"Terrace floor footprint must be positive, got width={width}, depth={depth}."
        )
    slab = ifcopenshell.api.root.create_entity(
        model,
        ifc_class="IfcSlab",
        name="Terrace floor",
    )
    slab.PredefinedType = "FLOOR"
    representation = ifcopenshell.api.geometry.add_slab_representation(
        model,
        context=_body_context(model),
        depth=TERRACE_FLOOR_THICKNESS_M,
        direction_sense="NEGATIVE",
        polyline=[
            (0.0, 0.0),
            (width, 0.0),
            (width, depth),
            (0.0, depth),
            (0.0, 0.0),
        ],
    )
    ifcopenshell.api.geometry.assign_representation(
        model,
        product=slab,
        representation=representation,
    )
    matrix = np.eye(4)
    matrix[0:3, 3] = np.array([min_x, min_y, min_z], dtype=float)
    ifcopenshell.api.geometry.edit_object_placement(
        model,
        product=slab,
        matrix=matrix,
        is_si=True,
        should_transform_children=False,
    )
    ifcopenshell.api.spatial.assign_container(
        model,
        products=[slab],
        relating_structure=storey,
    )
    return slab


def _copy_products(
    source_products: list[ifcopenshell.entity_instance],
    target_model: ifcopenshell.file,
) -> tuple[
    list[ifcopenshell.entity_instance],
    dict[int, ifcopenshell.entity_instance],
    dict[int, str],
]:
    copied_entities: dict[int, ifcopenshell.entity_instance] = {}
    copied_products: list[ifcopenshell.entity_instance] = []
    source_global_ids_by_copy_id: dict[int, str] = {}
    for source_product in source_products:
        copied = ifcopenshell.util.element.copy_deep(
            target_model,
            source_product,
            copied_entities=copied_entities,
        )
        source_global_id = _clean_text(getattr(source_product, "GlobalId", ""))
        copied.GlobalId = ifcopenshell.guid.new()
        source_global_ids_by_copy_id[copied.id()] = source_global_id
        copied_products.append(copied)
    return copied_products, copied_entities, source_global_ids_by_copy_id


def _has_material_relation(
    product: ifcopenshell.entity_instance,
    material: ifcopenshell.entity_instance,
) -> bool:
    for rel in getattr(product, "HasAssociations", []) or []:
        if rel.is_a("IfcRelAssociatesMaterial") and rel.RelatingMaterial == material:
            return True
    return False


def _has_property_relation(
    product: ifcopenshell.entity_instance,
    property_definition: ifcopenshell.entity_instance,
) -> bool:
    for rel in getattr(product, "IsDefinedBy", []) or []:
        if (
            rel.is_a("IfcRelDefinesByProperties")
            and rel.RelatingPropertyDefinition == property_definition
        ):
            return True
    return False


def _copy_inverse_asset_metadata(
    source_model: ifcopenshell.file,
    target_model: ifcopenshell.file,
    source_products: list[ifcopenshell.entity_instance],
    copied_products: list[ifcopenshell.entity_instance],
    copied_entities: dict[int, ifcopenshell.entity_instance],
) -> None:
    source_ids = {product.id() for product in source_products}
    copied_by_source_id = {
        source_product.id(): copied_product
        for source_product, copied_product in zip(
            source_products,
            copied_products,
            strict=True,
        )
    }
    for rel in source_model.by_type("IfcRelAssociatesMaterial"):
        related = [product for product in rel.RelatedObjects if product.id() in source_ids]
        if not related:
            continue
        copied_material = ifcopenshell.util.element.copy_deep(
            target_model,
            rel.RelatingMaterial,
            copied_entities=copied_entities,
        )
        target_products = [copied_by_source_id[product.id()] for product in related]
        target_products = [
            product
            for product in target_products
            if not _has_material_relation(product, copied_material)
        ]
        if not target_products:
            continue
        target_model.create_entity(
            "IfcRelAssociatesMaterial",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name=getattr(rel, "Name", None),
            Description=getattr(rel, "Description", None),
            RelatedObjects=target_products,
            RelatingMaterial=copied_material,
        )

    for rel in source_model.by_type("IfcRelDefinesByProperties"):
        related = [product for product in rel.RelatedObjects if product.id() in source_ids]
        if not related:
            continue
        copied_property = ifcopenshell.util.element.copy_deep(
            target_model,
            rel.RelatingPropertyDefinition,
            copied_entities=copied_entities,
        )
        target_products = [copied_by_source_id[product.id()] for product in related]
        target_products = [
            product
            for product in target_products
            if not _has_property_relation(product, copied_property)
        ]
        if not target_products:
            continue
        target_model.create_entity(
            "IfcRelDefinesByProperties",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name=getattr(rel, "Name", None),
            Description=getattr(rel, "Description", None),
            RelatedObjects=target_products,
            RelatingPropertyDefinition=copied_property,
        )

    for styled_item in source_model.by_type("IfcStyledItem"):
        item = getattr(styled_item, "Item", None)
        if item is None or item.id() not in copied_entities:
            continue
        if styled_item.id() in copied_entities:
            continue
        ifcopenshell.util.element.copy_deep(
            target_model,
            styled_item,
            copied_entities=copied_entities,
        )

    for rel in source_model.by_type("IfcRelFillsElement"):
        opening = getattr(rel, "RelatingOpeningElement", None)
        filling = getattr(rel, "RelatedBuildingElement", None)
        if opening is None or filling is None:
            continue
        copied_opening = copied_entities.get(opening.id())
        copied_filling = copied_entities.get(filling.id())
        if copied_opening is None or copied_filling is None:
            continue
        if getattr(copied_filling, "FillsVoids", None):
            continue
        target_model.create_entity(
            "IfcRelFillsElement",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name=getattr(rel, "Name", None),
            Description=getattr(rel, "Description", None),
            RelatingOpeningElement=copied_opening,
            RelatedBuildingElement=copied_filling,
        )


def _normalize_to_origin(
    products: list[ifcopenshell.entity_instance],
    origin_m: list[float],
) -> None:
    if not products:
        return
    model = products[0].wrapped_data.file
    unit_scale = ifcopenshell.util.unit.calculate_unit_scale(model)
    offset = np.array(origin_m, dtype=float)
    for product in products:
        placement = getattr(product, "ObjectPlacement", None)
        if placement is None:
            continue
        matrix = np.array(
            ifcopenshell.util.placement.get_local_placement(placement),
            dtype=float,
        )
        matrix[0:3, 3] = matrix[0:3, 3] * unit_scale
        matrix[0:3, 3] = matrix[0:3, 3] - offset
        ifcopenshell.api.geometry.edit_object_placement(
            product.wrapped_data.file,
            product=product,
            matrix=matrix,
            is_si=True,
            should_transform_children=False,
        )


def _asset_integrity_report(model: ifcopenshell.file) -> dict[str, int]:
    material_keys: set[tuple[int, int]] = set()
    duplicate_material_relations = 0
    for rel in model.by_type("IfcRelAssociatesMaterial"):
        material_id = rel.RelatingMaterial.id()
        for product in rel.RelatedObjects:
            key = (product.id(), material_id)
            if key in material_keys:
                duplicate_material_relations += 1
            material_keys.add(key)

    property_keys: set[tuple[int, int]] = set()
    duplicate_property_relations = 0
    for rel in model.by_type("IfcRelDefinesByProperties"):
        property_id = rel.RelatingPropertyDefinition.id()
        for product in rel.RelatedObjects:
            key = (product.id(), property_id)
            if key in property_keys:
                duplicate_property_relations += 1
            property_keys.add(key)

    orphan_styled_items = sum(
        1
        for styled_item in model.by_type("IfcStyledItem")
        if getattr(styled_item, "Item", None) is None
    )
    return {
        "duplicateMaterialRelations": duplicate_material_relations,
        "duplicatePropertyRelations": duplicate_property_relations,
        "orphanStyledItems": orphan_styled_items,
    }


def _add_library_pset(
    model: ifcopenshell.file,
    products: list[ifcopenshell.entity_instance],
    group: AssetGroup,
    bbox: dict[str, list[float]] | None,
    source_global_ids_by_copy_id: dict[int, str],
) -> None:
    for index, product in enumerate(products):
        properties: dict[str, str | bool | float] = {
            "AssetId": group.id,
            "AssetGroup": group.id,
            "AssetRole": f"member-{index}",
            "Category": group.category,
            "SourceElementName": _clean_text(getattr(product, "Name", "") or product.is_a()),
            "SourceGlobalId": source_global_ids_by_copy_id.get(product.id(), ""),
            "Reusable": True,
        }
        if product.is_a("IfcOpeningElement"):
            properties["OpeningImportPolicy"] = "recreate_host_void_on_import"
        if bbox is not None:
            properties.update(
                {
                    "WidthMm": bbox["sizeMm"][0],
                    "DepthMm": bbox["sizeMm"][1],
                    "HeightMm": bbox["sizeMm"][2],
                }
            )
        pset = ifcopenshell.api.pset.add_pset(
            model,
            product=product,
            name="Pset_LibraryAsset",
        )
        ifcopenshell.api.pset.edit_pset(model, pset=pset, properties=properties)


def extract_asset_ifc(
    source_ifc: Path,
    group: AssetGroup,
    output_ifc: Path,
) -> dict[str, Any]:
    source_model = ifcopenshell.open(str(source_ifc))
    source_products = [
        source_model.by_guid(global_id) for global_id in group.source_global_ids
    ]
    kept_source_products = [product for product in source_products if product is not None]
    bbox_before = _bbox_for_products(kept_source_products)

    asset_model = ifcopenshell.file(schema=source_model.schema)
    storey = _create_spatial_tree(asset_model, group)
    copied_products, copied_entities, source_global_ids_by_copy_id = _copy_products(
        kept_source_products,
        asset_model,
    )
    _copy_inverse_asset_metadata(
        source_model,
        asset_model,
        kept_source_products,
        copied_products,
        copied_entities,
    )
    if copied_products:
        ifcopenshell.api.spatial.assign_container(
            asset_model,
            products=copied_products,
            relating_structure=storey,
        )
    if group.category == "terrace":
        terrace_floor = _add_terrace_floor(asset_model, storey, bbox_before)
        copied_products.append(terrace_floor)
        source_global_ids_by_copy_id[terrace_floor.id()] = ""
    if bbox_before is not None:
        _normalize_to_origin(copied_products, bbox_before["min"])
    bbox_after = _bbox_for_products(copied_products)
    _add_library_pset(
        asset_model,
        copied_products,
        group,
        bbox_after or bbox_before,
        source_global_ids_by_copy_id,
    )
    material_names = _asset_material_names(asset_model)
    colors = _asset_colors(asset_model)
    integrity = _asset_integrity_report(asset_model)
    asset_model.write(str(output_ifc))
    return {
        "bboxBefore": bbox_before,
        "bboxAfter": bbox_after,
        "productCount": len(copied_products),
        "materials": material_names,
        "colors": colors,
        "integrity": integrity,
    }


def write_asset_library(
    source_ifc: Path,
    output_dir: Path,
    limit: int | None = None,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    assets_dir = output_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    source_model = ifcopenshell.open(str(source_ifc))
    groups = build_asset_groups(source_model)
    if limit is not None:
        groups = groups[:limit]

    manifest_assets: list[dict[str, Any]] = []
    for group in groups:
        asset_ifc = assets_dir / f"{group.id}.ifc"
        try:
            extraction = extract_asset_ifc(source_ifc, group, asset_ifc)
        except Exception as exc:
            manifest_assets.append(
                {
                    "id": group.id,
                    "label": group.label,
                    "category": group.category,
                    "sourceFile": source_ifc.name,
                    "assetIfc": f"assets/{asset_ifc.name}",
                    "assetFrag": None,
                    "fragStatus": "failed",
                    "sourceElementNames": list(group.source_element_names),
                    "sourceGlobalIds": list(group.source_global_ids),
                    "unit": "mm",
                    "placementMode": "fragment-model",
                    "editable": False,
                    "bbox": None,
                    "originalPlacement": None,
                    "productCount": 0,
                    "materials": [],
                    "colors": [],
                    "integrity": None,
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
            continue
        manifest_assets.append(
            {
                "id": group.id,
                "label": group.label,
                "category": group.category,
                "sourceFile": source_ifc.name,
                "assetIfc": f"assets/{asset_ifc.name}",
                "assetFrag": None,
                "fragStatus": "pending_converter",
                "sourceElementNames": list(group.source_element_names),
                "sourceGlobalIds": list(group.source_global_ids),
                "unit": "mm",
                "placementMode": "fragment-model",
                "editable": True,
                "bbox": extraction["bboxAfter"] or extraction["bboxBefore"],
                "originalPlacement": extraction["bboxBefore"],
                "productCount": extraction["productCount"],
                "materials": extraction["materials"],
                "colors": extraction["colors"],
                "integrity": extraction["integrity"],
            }
        )

    manifest = {
        "schemaVersion": "batang.ifcAssetLibrary.v1",
        "sourceFile": source_ifc.name,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "unit": "mm",
        "assetRuntime": "ifc-first-frag-pending",
        "assets": manifest_assets,
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        f"{json.dumps(manifest, ensure_ascii=False, indent=2)}\n",
        encoding="utf-8",
    )
    return manifest_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract reusable IFC assets into an asset library."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path.home() / "Downloads" / "sample_final_semantic.ifc",
    )
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_ifc: Path = args.input
    if not source_ifc.exists():
        raise FileNotFoundError(source_ifc)
    if args.output is None:
        if not DEFAULT_OUTPUT_ROOT.exists():
            raise FileNotFoundError(
                f"Output root directory does not exist: {DEFAULT_OUTPUT_ROOT}"
            )
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = DEFAULT_OUTPUT_ROOT / f"{source_ifc.stem}_ifc_library_{timestamp}"
    else:
        output_dir = args.output
    if output_dir.exists():
        shutil.rmtree(output_dir)
    manifest_path = write_asset_library(source_ifc, output_dir, args.limit)
    print(manifest_path)


if __name__ == "__main__":
    main()
