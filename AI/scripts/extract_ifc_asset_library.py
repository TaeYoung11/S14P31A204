from __future__ import annotations

import argparse
import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.geometry
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.unit
import ifcopenshell.geom
import ifcopenshell.guid
import ifcopenshell.util.element
import ifcopenshell.util.placement
import numpy as np


ASSET_TYPES = (
    "IfcDoor",
    "IfcWindow",
    "IfcStair",
    "IfcRoof",
    "IfcRailing",
    "IfcSlab",
)
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


def _element_suffix(element: ifcopenshell.entity_instance) -> str:
    name = str(getattr(element, "Name", "") or "")
    match = re.search(r"(\d+(?:\.\d+)?)$", name)
    if match:
        return match.group(1).replace(".", "-")
    return str(getattr(element, "GlobalId", "asset"))[-6:]


def _asset_category(element: ifcopenshell.entity_instance) -> str:
    if element.is_a("IfcDoor"):
        return "door"
    if element.is_a("IfcWindow"):
        return "window"
    if element.is_a("IfcStair"):
        return "stair"
    if element.is_a("IfcRoof"):
        return "roof"
    if element.is_a("IfcSlab"):
        predefined = str(getattr(element, "PredefinedType", "") or "").upper()
        return "roof-slab" if predefined == "ROOF" else "slab"
    if element.is_a("IfcRailing"):
        return "railing"
    return _slugify(element.is_a())


def _asset_id(element: ifcopenshell.entity_instance) -> str:
    return f"{_asset_category(element)}-{_element_suffix(element)}"


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


def _is_aggregated_by_asset(element: ifcopenshell.entity_instance) -> bool:
    for inverse in element.wrapped_data.file.get_inverse(element):
        if not inverse.is_a("IfcRelAggregates"):
            continue
        parent = getattr(inverse, "RelatingObject", None)
        if parent is not None and parent != element and parent.is_a() in ASSET_TYPES:
            return True
    return False


def build_asset_groups(model: ifcopenshell.file) -> list[AssetGroup]:
    groups: list[AssetGroup] = []
    seen_ids: set[str] = set()
    for ifc_type in ASSET_TYPES:
        for element in model.by_type(ifc_type):
            predefined = str(getattr(element, "PredefinedType", "") or "").upper()
            if _is_aggregated_by_asset(element):
                continue
            if ifc_type == "IfcSlab" and predefined == "ROOF":
                continue
            members = [element, *_children_recursive(element)]
            if _bbox_for_products(members) is None:
                continue
            names = tuple(
                str(getattr(member, "Name", "") or member.is_a())
                for member in members
            )
            global_ids = tuple(str(getattr(member, "GlobalId", "")) for member in members)
            asset_id = _asset_id(element)
            root_global_id = str(getattr(element, "GlobalId", ""))
            if asset_id in seen_ids:
                asset_id = f"{asset_id}-{root_global_id[-6:]}"
            seen_ids.add(asset_id)
            groups.append(
                AssetGroup(
                    id=asset_id,
                    label=str(getattr(element, "Name", "") or asset_id),
                    category=_asset_category(element),
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
            shape = ifcopenshell.geom.create_shape(settings, product)
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
        str(getattr(material, "Name", "") or "").strip()
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
        name = str(getattr(color, "Name", "") or "") or None
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


def _copy_products(
    source_products: list[ifcopenshell.entity_instance],
    target_model: ifcopenshell.file,
) -> tuple[list[ifcopenshell.entity_instance], dict[int, ifcopenshell.entity_instance]]:
    copied_entities: dict[int, ifcopenshell.entity_instance] = {}
    copied_products: list[ifcopenshell.entity_instance] = []
    for source_product in source_products:
        copied = ifcopenshell.util.element.copy_deep(
            target_model,
            source_product,
            copied_entities=copied_entities,
        )
        source_global_id = str(getattr(source_product, "GlobalId", "") or "")
        if source_global_id:
            copied.GlobalId = source_global_id
        copied_products.append(copied)
    return copied_products, copied_entities


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
        target_model.create_entity(
            "IfcRelAssociatesMaterial",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name=getattr(rel, "Name", None),
            Description=getattr(rel, "Description", None),
            RelatedObjects=[copied_by_source_id[product.id()] for product in related],
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
        target_model.create_entity(
            "IfcRelDefinesByProperties",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name=getattr(rel, "Name", None),
            Description=getattr(rel, "Description", None),
            RelatedObjects=[copied_by_source_id[product.id()] for product in related],
            RelatingPropertyDefinition=copied_property,
        )

    for styled_item in source_model.by_type("IfcStyledItem"):
        item = getattr(styled_item, "Item", None)
        if item is None or item.id() not in copied_entities:
            continue
        ifcopenshell.util.element.copy_deep(
            target_model,
            styled_item,
            copied_entities=copied_entities,
        )


def _normalize_to_origin(
    products: list[ifcopenshell.entity_instance],
    origin_m: list[float],
) -> None:
    offset = np.array(origin_m, dtype=float) * 1000.0
    for product in products:
        placement = getattr(product, "ObjectPlacement", None)
        if placement is None:
            continue
        matrix = np.array(
            ifcopenshell.util.placement.get_local_placement(placement),
            dtype=float,
        )
        matrix[0:3, 3] = matrix[0:3, 3] - offset
        ifcopenshell.api.geometry.edit_object_placement(
            product.wrapped_data.file,
            product=product,
            matrix=matrix,
            is_si=False,
            should_transform_children=False,
        )


def _add_library_pset(
    model: ifcopenshell.file,
    products: list[ifcopenshell.entity_instance],
    group: AssetGroup,
    bbox: dict[str, list[float]] | None,
) -> None:
    for index, product in enumerate(products):
        properties: dict[str, str | bool | float] = {
            "AssetId": group.id,
            "AssetGroup": group.id,
            "AssetRole": f"member-{index}",
            "Category": group.category,
            "SourceElementName": str(getattr(product, "Name", "") or product.is_a()),
            "SourceGlobalId": str(getattr(product, "GlobalId", "")),
            "Reusable": True,
        }
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
    copied_products, copied_entities = _copy_products(kept_source_products, asset_model)
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
    if bbox_before is not None:
        _normalize_to_origin(copied_products, bbox_before["min"])
    bbox_after = _bbox_for_products(copied_products)
    _add_library_pset(asset_model, copied_products, group, bbox_after or bbox_before)
    material_names = _asset_material_names(asset_model)
    colors = _asset_colors(asset_model)
    asset_model.write(str(output_ifc))
    return {
        "bboxBefore": bbox_before,
        "bboxAfter": bbox_after,
        "productCount": len(copied_products),
        "materials": material_names,
        "colors": colors,
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
        extraction = extract_asset_ifc(source_ifc, group, asset_ifc)
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
            }
        )

    manifest = {
        "schemaVersion": "batang.ifcAssetLibrary.v1",
        "sourceFile": str(source_ifc),
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
        default=Path.home() / "Downloads" / "sample_final.ifc",
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
