"""
3D Engine Module (Low-level)
===========================
IFC 부재의 기하 정보 및 속성을 수정하거나 신규 부재를 생성하는 저수준 연산 엔진입니다.
생성(CREATE) 기능 및 색상/재질 적용 로직 포함.
"""

import logging
import math
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.guid
import ifcopenshell.util.element
import ifcopenshell.util.placement
from typing import Any

logger = logging.getLogger("ai_authoring.engine_3d")

# ──────────────────────────────────────────────────────────────────────────────
# 1. 수정 및 삭제 (MODIFY / DELETE)
# ──────────────────────────────────────────────────────────────────────────────


def _opening_location(opening) -> tuple[float, float, float] | None:
    placement = getattr(opening, "ObjectPlacement", None)
    relative = getattr(placement, "RelativePlacement", None) if placement else None
    location = getattr(relative, "Location", None) if relative else None
    coords = tuple(getattr(location, "Coordinates", ()) or ())
    if not coords or len(coords) < 3:
        return None
    return (float(coords[0]), float(coords[1]), float(coords[2]))


def _solid_signature(solid) -> tuple[float, float, float] | None:
    if not solid or not solid.is_a("IfcExtrudedAreaSolid"):
        return None
    profile = getattr(solid, "SweptArea", None)
    dims = _profile_xy_dims(profile)
    if dims is None:
        return None
    return (float(dims[0]), float(dims[1]), float(solid.Depth))


def _profile_xy_dims(profile) -> tuple[float, float] | None:
    if profile is None:
        return None
    if profile.is_a("IfcRectangleProfileDef"):
        return (float(profile.XDim), float(profile.YDim))
    if profile.is_a("IfcArbitraryClosedProfileDef"):
        curve = getattr(profile, "OuterCurve", None)
        points = (
            getattr(curve, "Points", None)
            if curve is not None and curve.is_a("IfcPolyline")
            else None
        )
        if not points:
            return None
        coords: list[tuple[Any, ...]] = [
            tuple(getattr(point, "Coordinates", ()) or ()) for point in points
        ]
        xy_coords = [point for point in coords if len(point) >= 2]
        if not xy_coords:
            return None
        xs = [float(point[0]) for point in xy_coords]
        ys = [float(point[1]) for point in xy_coords]
        return (max(xs) - min(xs), max(ys) - min(ys))
    return None


def _profile_xy_center(profile) -> tuple[float, float] | None:
    if profile is None:
        return None
    if profile.is_a("IfcRectangleProfileDef"):
        position = getattr(profile, "Position", None)
        location = getattr(position, "Location", None) if position else None
        coords = tuple(getattr(location, "Coordinates", ()) or ())
        if len(coords) >= 2:
            return (float(coords[0]), float(coords[1]))
        return (float(profile.XDim) / 2.0, 0.0)
    if profile.is_a("IfcArbitraryClosedProfileDef"):
        curve = getattr(profile, "OuterCurve", None)
        points = (
            getattr(curve, "Points", None)
            if curve is not None and curve.is_a("IfcPolyline")
            else None
        )
        if not points:
            return None
        point_coords: list[tuple[Any, ...]] = [
            tuple(getattr(point, "Coordinates", ()) or ()) for point in points
        ]
        xy_coords = [point for point in point_coords if len(point) >= 2]
        if not xy_coords:
            return None
        xs = [float(point[0]) for point in xy_coords]
        ys = [float(point[1]) for point in xy_coords]
        return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0)
    return None


def _solid_profile_xy_center(solid) -> tuple[float, float] | None:
    profile = getattr(solid, "SweptArea", None)
    if profile is None:
        return None

    position = getattr(solid, "Position", None)
    location = getattr(position, "Location", None) if position else None
    coords = tuple(getattr(location, "Coordinates", ()) or ())
    solid_x = float(coords[0]) if len(coords) >= 1 else 0.0
    solid_y = float(coords[1]) if len(coords) >= 2 else 0.0

    if profile.is_a("IfcRectangleProfileDef"):
        profile_position = getattr(profile, "Position", None)
        profile_location = (
            getattr(profile_position, "Location", None) if profile_position else None
        )
        profile_coords = tuple(getattr(profile_location, "Coordinates", ()) or ())
        if len(profile_coords) >= 2:
            return (solid_x + float(profile_coords[0]), solid_y + float(profile_coords[1]))
        return (solid_x, solid_y)

    profile_center = _profile_xy_center(profile)
    if profile_center is None:
        return None
    return (solid_x + profile_center[0], solid_y + profile_center[1])


def _profile_xy_bbox(profile) -> tuple[float, float, float, float] | None:
    if profile is None:
        return None
    if profile.is_a("IfcRectangleProfileDef"):
        position = getattr(profile, "Position", None)
        location = getattr(position, "Location", None) if position else None
        coords = tuple(getattr(location, "Coordinates", ()) or ())
        center_x = float(coords[0]) if len(coords) >= 1 else 0.0
        center_y = float(coords[1]) if len(coords) >= 2 else 0.0
        half_x = float(profile.XDim) / 2.0
        half_y = float(profile.YDim) / 2.0
        return (center_x - half_x, center_x + half_x, center_y - half_y, center_y + half_y)
    if profile.is_a("IfcArbitraryClosedProfileDef"):
        curve = getattr(profile, "OuterCurve", None)
        points = (
            getattr(curve, "Points", None)
            if curve is not None and curve.is_a("IfcPolyline")
            else None
        )
        if not points:
            return None
        point_coords = [tuple(getattr(point, "Coordinates", ()) or ()) for point in points]
        xy_coords = [point for point in point_coords if len(point) >= 2]
        if not xy_coords:
            return None
        xs = [float(point[0]) for point in xy_coords]
        ys = [float(point[1]) for point in xy_coords]
        return (min(xs), max(xs), min(ys), max(ys))
    return None


def _element_body_bbox_world(
    element: ifcopenshell.entity_instance | None,
) -> tuple[float, float, float, float, float, float] | None:
    if element is None:
        return None
    items = _body_representation_items(element)
    if not items:
        return None
    item = items[0]
    while item is not None and (
        item.is_a("IfcBooleanResult") or item.is_a("IfcBooleanClippingResult")
    ):
        item = item.FirstOperand
    if item is None or not item.is_a("IfcExtrudedAreaSolid"):
        return None

    profile_bbox = _profile_xy_bbox(getattr(item, "SweptArea", None))
    if profile_bbox is None:
        return None
    position = getattr(item, "Position", None)
    location = getattr(position, "Location", None) if position else None
    coords = tuple(getattr(location, "Coordinates", ()) or ())
    ix = float(coords[0]) if len(coords) >= 1 else 0.0
    iy = float(coords[1]) if len(coords) >= 2 else 0.0
    iz = float(coords[2]) if len(coords) >= 3 else 0.0

    min_x, max_x, min_y, max_y = profile_bbox
    min_x += ix
    max_x += ix
    min_y += iy
    max_y += iy
    min_z = iz
    max_z = iz + float(item.Depth)

    try:
        matrix = ifcopenshell.util.placement.get_local_placement(element.ObjectPlacement)
    except Exception:
        matrix = None

    world_xs: list[float] = []
    world_ys: list[float] = []
    world_zs: list[float] = []
    for x in (min_x, max_x):
        for y in (min_y, max_y):
            for z in (min_z, max_z):
                if matrix is None:
                    world_xs.append(x)
                    world_ys.append(y)
                    world_zs.append(z)
                else:
                    world_xs.append(
                        float(matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3])
                    )
                    world_ys.append(
                        float(matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3])
                    )
                    world_zs.append(
                        float(matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3])
                    )
    return (
        min(world_xs),
        max(world_xs),
        min(world_ys),
        max(world_ys),
        min(world_zs),
        max(world_zs),
    )


def _local_box_bbox_world(
    placement: ifcopenshell.entity_instance | None,
    *,
    min_x: float,
    max_x: float,
    min_y: float,
    max_y: float,
    min_z: float,
    max_z: float,
) -> tuple[float, float, float, float, float, float] | None:
    try:
        matrix = ifcopenshell.util.placement.get_local_placement(placement)
    except Exception:
        matrix = None

    world_xs: list[float] = []
    world_ys: list[float] = []
    world_zs: list[float] = []
    for x in (min_x, max_x):
        for y in (min_y, max_y):
            for z in (min_z, max_z):
                if matrix is None:
                    world_xs.append(x)
                    world_ys.append(y)
                    world_zs.append(z)
                else:
                    world_xs.append(
                        float(matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3])
                    )
                    world_ys.append(
                        float(matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3])
                    )
                    world_zs.append(
                        float(matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3])
                    )
    return (
        min(world_xs),
        max(world_xs),
        min(world_ys),
        max(world_ys),
        min(world_zs),
        max(world_zs),
    )


def _container_storey_id(product) -> str | None:
    try:
        container = ifcopenshell.util.element.get_container(product)
    except Exception:
        return None
    if container is None or not container.is_a("IfcBuildingStorey"):
        return None
    return getattr(container, "GlobalId", None)


def _copy_product_type_relation(
    model: ifcopenshell.file,
    *,
    template_product,
    product,
) -> None:
    typed_by = list(getattr(template_product, "IsTypedBy", []) or [])
    if not typed_by:
        return
    relating_type = getattr(typed_by[0], "RelatingType", None)
    if relating_type is None:
        return
    model.create_entity(
        "IfcRelDefinesByType",
        GlobalId=ifcopenshell.guid.new(),
        RelatedObjects=[product],
        RelatingType=relating_type,
    )


def _find_template_product(
    model: ifcopenshell.file,
    *,
    ifc_class: str,
    storey_id: str | None,
    target_width_m: float,
    target_height_m: float,
) -> ifcopenshell.entity_instance | None:
    exact_storey: list[tuple[float, ifcopenshell.entity_instance]] = []
    fallback: list[tuple[float, ifcopenshell.entity_instance]] = []
    for product in model.by_type(ifc_class):
        representation = getattr(product, "Representation", None)
        if representation is None:
            continue
        width = float(getattr(product, "OverallWidth", 0.0) or 0.0)
        height = float(getattr(product, "OverallHeight", 0.0) or 0.0)
        score = abs(width - target_width_m) + abs(height - target_height_m)
        item = (score, product)
        if storey_id and _container_storey_id(product) == storey_id:
            exact_storey.append(item)
        fallback.append(item)
    candidates = exact_storey or fallback
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def _template_opening_for_product(
    product: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance | None:
    if product is None:
        return None
    fills_voids = list(getattr(product, "FillsVoids", []) or [])
    if not fills_voids:
        return None
    return fills_voids[0].RelatingOpeningElement


def _template_host_wall_for_opening(
    opening: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance | None:
    if opening is None:
        return None
    voids = list(getattr(opening, "VoidsElements", []) or [])
    if not voids:
        return None
    return getattr(voids[0], "RelatingBuildingElement", None)


def _wall_body_item(
    wall: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance | None:
    representation = getattr(wall, "Representation", None) if wall is not None else None
    if representation is None:
        return None
    for rep in getattr(representation, "Representations", []) or []:
        if getattr(rep, "RepresentationIdentifier", None) != "Body":
            continue
        for item in getattr(rep, "Items", []) or []:
            if item.is_a("IfcExtrudedAreaSolid"):
                return item
            while item is not None and (
                item.is_a("IfcBooleanResult") or item.is_a("IfcBooleanClippingResult")
            ):
                item = getattr(item, "FirstOperand", None)
                if item is not None and item.is_a("IfcExtrudedAreaSolid"):
                    return item
    return None


def _is_supported_wall_for_template_door(
    wall: ifcopenshell.entity_instance | None,
) -> bool:
    return bool(
        wall is not None
        and wall.is_a() in {"IfcWall", "IfcWallStandardCase"}
        and _wall_body_item(wall) is not None
    )


def _wall_profile_dims(
    wall: ifcopenshell.entity_instance | None,
) -> tuple[float, float] | None:
    body_item = _wall_body_item(wall)
    if body_item is None:
        return None
    return _profile_xy_dims(getattr(body_item, "SweptArea", None))


def _wall_thickness(
    wall: ifcopenshell.entity_instance | None,
) -> float | None:
    dims = _wall_profile_dims(wall)
    if dims is None:
        return None
    return min(float(dims[0]), float(dims[1]))


def _wall_usable_length(
    wall: ifcopenshell.entity_instance | None,
) -> float | None:
    dims = _wall_profile_dims(wall)
    if dims is None:
        return None
    return max(float(dims[0]), float(dims[1]))


def _wall_y_bounds(
    wall: ifcopenshell.entity_instance | None,
) -> tuple[float, float] | None:
    body_item = _wall_body_item(wall)
    if body_item is None:
        return None
    profile = getattr(body_item, "SweptArea", None)
    center = _profile_xy_center(profile)
    dims = _profile_xy_dims(profile)
    if center is None or dims is None:
        return None
    center_y = float(center[1])
    size_y = float(dims[1])
    return (center_y - (size_y / 2.0), center_y + (size_y / 2.0))


def _wall_ref_direction(
    wall: ifcopenshell.entity_instance | None,
) -> tuple[float, float, float]:
    relative = (
        getattr(getattr(wall, "ObjectPlacement", None), "RelativePlacement", None)
        if wall is not None
        else None
    )
    return _axis_direction_ratios(relative, "RefDirection")


def _clone_representation_or_box(
    model: ifcopenshell.file,
    *,
    template_product: ifcopenshell.entity_instance | None,
    fallback_length_m: float,
    fallback_width_m: float,
    fallback_height_m: float,
):
    if (
        template_product is not None
        and getattr(template_product, "Representation", None) is not None
    ):
        cloned = ifcopenshell.util.element.copy_deep(model, template_product.Representation)
        _clone_representation_styles(
            model,
            template_representation=template_product.Representation,
            cloned_representation=cloned,
        )
        return cloned
    representation, _ = _box_representation(
        model,
        fallback_length_m,
        fallback_width_m,
        fallback_height_m,
        center_origin=False,
    )
    return representation


def _resize_box_like_representation(
    representation: ifcopenshell.entity_instance | None,
    *,
    length: float,
    width: float,
    height: float,
) -> bool:
    if representation is None or not getattr(representation, "Representations", None):
        return False
    changed = False
    for rep in getattr(representation, "Representations", []) or []:
        changed |= _resize_box_like_items(
            getattr(rep, "Items", []) or [],
            length,
            width,
            height,
        )
    return changed


def _resize_box_like_items(
    items: Any,
    length: float,
    width: float,
    height: float,
) -> bool:
    changed = False
    for item in items:
        changed |= _resize_box_like_item(item, length, width, height)
    return changed


def _resize_box_like_item(
    item: ifcopenshell.entity_instance,
    length: float,
    width: float,
    height: float,
) -> bool:
    if item.is_a("IfcExtrudedAreaSolid"):
        profile = getattr(item, "SweptArea", None)
        if profile is not None and profile.is_a("IfcRectangleProfileDef"):
            profile.XDim = float(length)
            profile.YDim = float(width)
            item.Depth = float(height)
            return True
    if item.is_a("IfcBoundingBox"):
        item.XDim = float(length)
        item.YDim = float(width)
        item.ZDim = float(height)
        return True
    return False


def _dimension_axis_mapping(
    current_values: tuple[float, float, float],
    source_values: tuple[float, float, float],
) -> dict[int, int]:
    remaining = {0, 1, 2}
    mapping: dict[int, int] = {}
    for source_index, source_value in enumerate(source_values):
        axis = min(
            remaining,
            key=lambda candidate: abs(current_values[candidate] - source_value),
        )
        mapping[axis] = source_index
        remaining.remove(axis)
    return mapping


def _resize_opening_box_like_item(
    item: ifcopenshell.entity_instance,
    *,
    source_signature: tuple[float, float, float],
    target_signature: tuple[float, float, float],
) -> bool:
    if item.is_a("IfcExtrudedAreaSolid"):
        profile = getattr(item, "SweptArea", None)
        if profile is None or not profile.is_a("IfcRectangleProfileDef"):
            return False
        current_values = (float(profile.XDim), float(profile.YDim), float(item.Depth))
        mapped_targets = {
            axis: target_signature[source_index]
            for axis, source_index in _dimension_axis_mapping(
                current_values,
                source_signature,
            ).items()
        }
        profile.XDim = float(mapped_targets[0])
        profile.YDim = float(mapped_targets[1])
        item.Depth = float(mapped_targets[2])
        return True
    if item.is_a("IfcBoundingBox"):
        current_values = (
            float(getattr(item, "XDim", 0.0) or 0.0),
            float(getattr(item, "YDim", 0.0) or 0.0),
            float(getattr(item, "ZDim", 0.0) or 0.0),
        )
        mapped_targets = {
            axis: target_signature[source_index]
            for axis, source_index in _dimension_axis_mapping(
                current_values,
                source_signature,
            ).items()
        }
        item.XDim = float(mapped_targets[0])
        item.YDim = float(mapped_targets[1])
        item.ZDim = float(mapped_targets[2])
        return True
    return False


def _clone_item_styles(
    model: ifcopenshell.file,
    *,
    template_item: ifcopenshell.entity_instance,
    cloned_item: ifcopenshell.entity_instance,
) -> None:
    for styled in getattr(template_item, "StyledByItem", None) or []:
        cloned_styles = [
            ifcopenshell.util.element.copy_deep(model, style)
            for style in getattr(styled, "Styles", None) or []
        ]
        if not cloned_styles:
            continue
        existing = _styled_item_for(model, cloned_item)
        if existing is not None:
            existing.Styles = cloned_styles
        else:
            model.create_entity("IfcStyledItem", Item=cloned_item, Styles=cloned_styles)


def _clone_representation_styles(
    model: ifcopenshell.file,
    *,
    template_representation: ifcopenshell.entity_instance,
    cloned_representation: ifcopenshell.entity_instance,
) -> None:
    template_reps = list(getattr(template_representation, "Representations", []) or [])
    cloned_reps = list(getattr(cloned_representation, "Representations", []) or [])
    for template_rep, cloned_rep in zip(template_reps, cloned_reps):
        template_items = list(getattr(template_rep, "Items", []) or [])
        cloned_items = list(getattr(cloned_rep, "Items", []) or [])
        for template_item, cloned_item in zip(template_items, cloned_items):
            _clone_item_styles(model, template_item=template_item, cloned_item=cloned_item)
            template_mapping = getattr(template_item, "MappingSource", None)
            cloned_mapping = getattr(cloned_item, "MappingSource", None)
            template_mapped = (
                getattr(template_mapping, "MappedRepresentation", None)
                if template_mapping is not None
                else None
            )
            cloned_mapped = (
                getattr(cloned_mapping, "MappedRepresentation", None)
                if cloned_mapping is not None
                else None
            )
            if template_mapped is None or cloned_mapped is None:
                continue
            for template_mapped_item, cloned_mapped_item in zip(
                list(getattr(template_mapped, "Items", []) or []),
                list(getattr(cloned_mapped, "Items", []) or []),
            ):
                _clone_item_styles(
                    model,
                    template_item=template_mapped_item,
                    cloned_item=cloned_mapped_item,
                )


def _refresh_wall_body_representation(
    model: ifcopenshell.file,
    wall: ifcopenshell.entity_instance | None,
) -> bool:
    representation = getattr(wall, "Representation", None) if wall is not None else None
    if representation is None:
        return False
    for rep in getattr(representation, "Representations", []) or []:
        if getattr(rep, "RepresentationIdentifier", None) != "Body":
            continue
        items = list(getattr(rep, "Items", []) or [])
        if len(items) != 1 or not items[0].is_a("IfcExtrudedAreaSolid"):
            return False
        cloned_item = ifcopenshell.util.element.copy_deep(model, items[0])
        _clone_item_styles(model, template_item=items[0], cloned_item=cloned_item)
        rep.Items = [cloned_item]
        rep.RepresentationType = "SweptSolid"
        return True
    return False




def _clone_opening_representation_with_depth(
    model: ifcopenshell.file,
    *,
    template_opening: ifcopenshell.entity_instance,
    new_depth: float,
    new_width: float | None = None,
    new_height: float | None = None,
):
    representation = getattr(template_opening, "Representation", None)
    if representation is None:
        return None
    source_signature = _opening_signature(template_opening)
    if source_signature is None:
        return None
    target_signature = (
        float(new_width if new_width is not None else source_signature[0]),
        float(new_depth),
        float(new_height if new_height is not None else source_signature[2]),
    )
    cloned = ifcopenshell.util.element.copy_deep(model, representation)
    for rep in getattr(cloned, "Representations", []) or []:
        for item in getattr(rep, "Items", []) or []:
            _resize_opening_box_like_item(
                item,
                source_signature=source_signature,
                target_signature=target_signature,
            )
    return cloned


def _template_door_relative_location(
    template_door: ifcopenshell.entity_instance,
    template_opening: ifcopenshell.entity_instance | None,
) -> tuple[float, float, float]:
    template_opening_placement = (
        getattr(template_opening, "ObjectPlacement", None)
        if template_opening is not None
        else None
    )
    template_door_placement = getattr(template_door, "ObjectPlacement", None)
    if (
        template_door_placement is None
        or getattr(template_door_placement, "PlacementRelTo", None) != template_opening_placement
    ):
        return (0.0, 0.0, 0.0)
    relative_placement = getattr(template_door_placement, "RelativePlacement", None)
    template_location = (
        getattr(relative_placement, "Location", None) if relative_placement else None
    )
    template_coords = tuple(getattr(template_location, "Coordinates", ()) or ())
    if len(template_coords) < 3:
        return (0.0, 0.0, 0.0)
    return (
        float(template_coords[0]),
        float(template_coords[1]),
        float(template_coords[2]),
    )


def _template_window_relative_location(
    template_window: ifcopenshell.entity_instance,
    template_opening: ifcopenshell.entity_instance | None,
) -> tuple[float, float, float]:
    template_opening_placement = (
        getattr(template_opening, "ObjectPlacement", None)
        if template_opening is not None
        else None
    )
    template_window_placement = getattr(template_window, "ObjectPlacement", None)
    if (
        template_window_placement is None
        or getattr(template_window_placement, "PlacementRelTo", None) != template_opening_placement
    ):
        return (0.0, 0.0, 0.0)
    relative_placement = getattr(template_window_placement, "RelativePlacement", None)
    template_location = (
        getattr(relative_placement, "Location", None) if relative_placement else None
    )
    template_coords = tuple(getattr(template_location, "Coordinates", ()) or ())
    if len(template_coords) < 3:
        return (0.0, 0.0, 0.0)
    return (
        float(template_coords[0]),
        float(template_coords[1]),
        float(template_coords[2]),
    )


def _axis_direction_ratios(placement_3d, attr_name: str) -> tuple[float, float, float]:
    direction = getattr(placement_3d, attr_name, None) if placement_3d is not None else None
    coords = tuple(getattr(direction, "DirectionRatios", ()) or ())
    if len(coords) < 3:
        return (0.0, 0.0, 1.0) if attr_name == "Axis" else (1.0, 0.0, 0.0)
    return (float(coords[0]), float(coords[1]), float(coords[2]))


def _dot3(
    left: tuple[float, float, float],
    right: tuple[float, float, float],
) -> float:
    return (
        (float(left[0]) * float(right[0]))
        + (float(left[1]) * float(right[1]))
        + (float(left[2]) * float(right[2]))
    )


def _axis_placement_like(
    model: ifcopenshell.file,
    template_placement,
    *,
    location: tuple[float, float, float],
):
    return _axis_placement_3d(
        model,
        location=location,
        axis=_axis_direction_ratios(template_placement, "Axis"),
        ref_direction=_axis_direction_ratios(template_placement, "RefDirection"),
    )


def _find_eligible_template_door_pair(
    model: ifcopenshell.file,
    *,
    storey_id: str | None,
    target_width_m: float,
    target_height_m: float,
    host_wall,
    target_u: float,
) -> tuple[ifcopenshell.entity_instance, ifcopenshell.entity_instance] | None:
    if not _is_supported_wall_for_template_door(host_wall):
        return None
    host_thickness = _wall_thickness(host_wall)
    host_length = _wall_usable_length(host_wall)
    if host_thickness is None or host_length is None:
        return None
    host_ref = _wall_ref_direction(host_wall)

    edge_margin = _mm_to_model_units(model, 100.0, 100.0)
    overlap_margin = _mm_to_model_units(model, 100.0, 100.0)
    best: (
        tuple[
            float,
            float,
            float,
            ifcopenshell.entity_instance,
            ifcopenshell.entity_instance,
        ]
        | None
    ) = None

    for template_door in model.by_type("IfcDoor"):
        template_opening = _template_opening_for_product(template_door)
        template_wall = _template_host_wall_for_opening(template_opening)
        if (
            template_opening is None
            or template_wall is None
            or not _is_supported_wall_for_template_door(template_wall)
        ):
            continue
        if storey_id and _container_storey_id(template_door) != storey_id:
            continue
        template_door_relto = getattr(
            getattr(template_door, "ObjectPlacement", None),
            "PlacementRelTo",
            None,
        )
        if template_door_relto != getattr(template_opening, "ObjectPlacement", None):
            continue

        opening_signature = _opening_signature(template_opening)
        if opening_signature is None:
            continue
        opening_width, opening_height, _ = opening_signature
        template_thickness = _wall_thickness(template_wall)
        if template_thickness is None:
            continue
        thickness_delta = abs(host_thickness - template_thickness)
        template_ref = _wall_ref_direction(template_wall)
        orientation_penalty = 1.0 - _dot3(host_ref, template_ref)
        if host_length < opening_width + (edge_margin * 2.0):
            continue
        if target_u - (opening_width / 2.0) < edge_margin:
            continue
        if target_u + (opening_width / 2.0) > host_length - edge_margin:
            continue

        blocked = False
        for rel in list(getattr(host_wall, "HasOpenings", []) or []):
            existing_opening = getattr(rel, "RelatedOpeningElement", None)
            if existing_opening is None:
                continue
            existing_signature = _opening_signature(existing_opening)
            existing_location = _opening_location(existing_opening)
            if existing_signature is None or existing_location is None:
                continue
            existing_width = float(existing_signature[0])
            existing_center = float(existing_location[0]) + (existing_width / 2.0)
            min_clearance = ((existing_width + opening_width) / 2.0) + overlap_margin
            if abs(existing_center - target_u) < min_clearance:
                blocked = True
                break
        if blocked:
            continue

        width = float(getattr(template_door, "OverallWidth", 0.0) or 0.0)
        height = float(getattr(template_door, "OverallHeight", 0.0) or 0.0)
        score = abs(width - target_width_m) + abs(height - target_height_m)
        candidate = (
            orientation_penalty,
            thickness_delta,
            score,
            template_door,
            template_opening,
        )
        if best is None or candidate[:3] < best[:3]:
            best = candidate

    if best is None:
        return None
    return (best[3], best[4])


def _find_eligible_template_window_pair(
    model: ifcopenshell.file,
    *,
    storey_id: str | None,
    target_width_m: float,
    target_height_m: float,
    host_wall,
    target_u: float,
) -> tuple[ifcopenshell.entity_instance, ifcopenshell.entity_instance] | None:
    if not _is_supported_wall_for_template_door(host_wall):
        return None
    host_thickness = _wall_thickness(host_wall)
    host_length = _wall_usable_length(host_wall)
    if host_thickness is None or host_length is None:
        return None
    host_ref = _wall_ref_direction(host_wall)

    edge_margin = _mm_to_model_units(model, 100.0, 100.0)
    overlap_margin = _mm_to_model_units(model, 100.0, 100.0)
    best: (
        tuple[
            float,
            float,
            float,
            ifcopenshell.entity_instance,
            ifcopenshell.entity_instance,
        ]
        | None
    ) = None

    for template_window in model.by_type("IfcWindow"):
        template_opening = _template_opening_for_product(template_window)
        template_wall = _template_host_wall_for_opening(template_opening)
        if (
            template_opening is None
            or template_wall is None
            or not _is_supported_wall_for_template_door(template_wall)
        ):
            continue
        if storey_id and _container_storey_id(template_window) != storey_id:
            continue
        template_window_relto = getattr(
            getattr(template_window, "ObjectPlacement", None),
            "PlacementRelTo",
            None,
        )
        if template_window_relto != getattr(template_opening, "ObjectPlacement", None):
            continue

        opening_signature = _opening_signature(template_opening)
        if opening_signature is None:
            continue
        opening_width, opening_height, _ = opening_signature
        template_thickness = _wall_thickness(template_wall)
        if template_thickness is None:
            continue
        thickness_delta = abs(host_thickness - template_thickness)
        template_ref = _wall_ref_direction(template_wall)
        orientation_penalty = 1.0 - _dot3(host_ref, template_ref)
        if host_length < opening_width + (edge_margin * 2.0):
            continue
        if target_u - (opening_width / 2.0) < edge_margin:
            continue
        if target_u + (opening_width / 2.0) > host_length - edge_margin:
            continue

        blocked = False
        for rel in list(getattr(host_wall, "HasOpenings", []) or []):
            existing_opening = getattr(rel, "RelatedOpeningElement", None)
            if existing_opening is None:
                continue
            existing_signature = _opening_signature(existing_opening)
            existing_location = _opening_location(existing_opening)
            if existing_signature is None or existing_location is None:
                continue
            existing_width = float(existing_signature[0])
            existing_center = float(existing_location[0]) + (existing_width / 2.0)
            min_clearance = ((existing_width + opening_width) / 2.0) + overlap_margin
            if abs(existing_center - target_u) < min_clearance:
                blocked = True
                break
        if blocked:
            continue

        width = float(getattr(template_window, "OverallWidth", 0.0) or 0.0)
        height = float(getattr(template_window, "OverallHeight", 0.0) or 0.0)
        score = abs(width - target_width_m) + abs(height - target_height_m)
        candidate = (
            orientation_penalty,
            thickness_delta,
            score,
            template_window,
            template_opening,
        )
        if best is None or candidate[:3] < best[:3]:
            best = candidate

    if best is None:
        return None
    return (best[3], best[4])


def _copy_material_associations_from_template(
    model: ifcopenshell.file,
    *,
    template_product,
    product,
) -> None:
    for rel in getattr(template_product, "HasAssociations", []) or []:
        if not rel.is_a("IfcRelAssociatesMaterial"):
            continue
        model.create_entity(
            "IfcRelAssociatesMaterial",
            GlobalId=ifcopenshell.guid.new(),
            RelatingMaterial=rel.RelatingMaterial,
            RelatedObjects=[product],
        )


def _opening_signature(opening) -> tuple[float, float, float] | None:
    representation = getattr(opening, "Representation", None)
    if not representation:
        return None
    for rep in getattr(representation, "Representations", []) or []:
        for item in getattr(rep, "Items", []) or []:
            signature = _solid_signature(item)
            if signature:
                return signature
    return None


def _solid_location(solid) -> tuple[float, float, float] | None:
    position = getattr(solid, "Position", None)
    location = getattr(position, "Location", None) if position else None
    coords = tuple(getattr(location, "Coordinates", ()) or ())
    if len(coords) < 3:
        return None
    return (float(coords[0]), float(coords[1]), float(coords[2]))


def _almost_same_tuple(left, right, tolerance: float = 1e-6) -> bool:
    if left is None or right is None:
        return False
    return all(abs(float(a) - float(b)) <= tolerance for a, b in zip(left, right, strict=True))


def _remove_opening_boolean(shape, opening):
    if not shape or not shape.is_a("IfcBooleanResult"):
        return shape, False

    first_operand = getattr(shape, "FirstOperand", None)
    second_operand = getattr(shape, "SecondOperand", None)
    if _almost_same_tuple(_solid_location(second_operand), _opening_location(opening)) and (
        _almost_same_tuple(_solid_signature(second_operand), _opening_signature(opening))
    ):
        return (first_operand, True) if first_operand is not None else (shape, False)

    next_operand, removed = _remove_opening_boolean(first_operand, opening)
    if removed:
        shape.FirstOperand = next_operand
    return shape, removed


def delete_element(
    model: ifcopenshell.file, element: ifcopenshell.entity_instance, etype_str: str = "IfcProduct"
) -> bool:
    """IFC 요소를 관계 엔티티까지 깔끔하게 정리하여 삭제한다."""
    gid_short = element.GlobalId[:8] if element.GlobalId else "?"
    try:
        walls_to_refresh: list[ifcopenshell.entity_instance] = []
        if element.is_a("IfcDoor") or element.is_a("IfcWindow"):
            for rel_fill in list(getattr(element, "FillsVoids", []) or []):
                opening = getattr(rel_fill, "RelatingOpeningElement", None)
                if opening:
                    for rel_void in list(getattr(opening, "VoidsElements", []) or []):
                        host = getattr(rel_void, "RelatingBuildingElement", None)
                        if host and getattr(host, "Representation", None):
                            for rep in getattr(host.Representation, "Representations", []) or []:
                                if getattr(rep, "RepresentationIdentifier", None) != "Body":
                                    continue
                                if rep.Items and rep.Items[0].is_a("IfcBooleanResult"):
                                    next_shape, removed = _remove_opening_boolean(
                                        rep.Items[0],
                                        opening,
                                    )
                                    if removed:
                                        rep.Items = [next_shape]
                                        if not next_shape.is_a("IfcBooleanResult"):
                                            rep.RepresentationType = "SweptSolid"
                                        break
                            if host not in walls_to_refresh:
                                walls_to_refresh.append(host)
                        model.remove(rel_void)
                    model.remove(opening)
                model.remove(rel_fill)

        if element.is_a("IfcOpeningElement"):
            for rel_void in list(getattr(element, "VoidsElements", []) or []):
                host = getattr(rel_void, "RelatingBuildingElement", None)
                if host is not None and host not in walls_to_refresh:
                    walls_to_refresh.append(host)

        for host in walls_to_refresh:
            _refresh_wall_body_representation(model, host)

        # 공간 포함 관계 제거
        for rel in list(getattr(element, "ContainedInStructure", [])):
            if rel.is_a("IfcRelContainedInSpatialStructure"):
                remaining = [e for e in rel.RelatedElements if e != element]
                if remaining:
                    rel.RelatedElements = remaining
                else:
                    model.remove(rel)

        # 재질 관계 제거
        for rel in list(getattr(element, "HasAssociations", [])):
            if not rel.is_a("IfcRelAssociatesMaterial"):
                continue
            remaining = [o for o in rel.RelatedObjects if o != element]
            if remaining:
                rel.RelatedObjects = remaining
            else:
                model.remove(rel)

        # 속성 정의 제거
        for rel in list(getattr(element, "IsDefinedBy", [])):
            if rel.is_a("IfcRelDefinesByProperties") or rel.is_a("IfcRelDefinesByType"):
                remaining = [o for o in rel.RelatedObjects if o != element]
                if remaining:
                    rel.RelatedObjects = remaining
                else:
                    model.remove(rel)

        # 개구부 및 채우기 요소(문/창문) 동반 삭제
        if element.is_a("IfcElement"):
            for rel_void in list(getattr(element, "HasOpenings", [])):
                opening = rel_void.RelatedOpeningElement
                if opening:
                    for rel_fill in list(getattr(opening, "HasFillings", [])):
                        filling_el = rel_fill.RelatedFillingElement
                        if filling_el:
                            model.remove(filling_el)
                        model.remove(rel_fill)
                    model.remove(opening)
                model.remove(rel_void)

        model.remove(element)
        logger.info(f"[{gid_short}] 요소 삭제 완료 ({etype_str})")
        return True
    except Exception as exc:
        logger.error(f"[{gid_short}] 요소 삭제 실패: {exc}", exc_info=True)
        return False


def _containing_storey(
    element: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance | None:
    for rel in getattr(element, "ContainedInStructure", []) or []:
        if rel.is_a("IfcRelContainedInSpatialStructure"):
            structure = getattr(rel, "RelatingStructure", None)
            if structure and structure.is_a("IfcBuildingStorey"):
                return structure
    return None


def _storey_elevation_native(storey: ifcopenshell.entity_instance) -> float | None:
    elevation = getattr(storey, "Elevation", None)
    if elevation is not None:
        return float(elevation)
    placement = getattr(storey, "ObjectPlacement", None)
    if placement and placement.is_a("IfcLocalPlacement"):
        try:
            matrix = ifcopenshell.util.placement.get_local_placement(placement)
            return float(matrix[2][3])
        except Exception:
            return None
    return None


def _next_storey_elevation_native(storey: ifcopenshell.entity_instance) -> float | None:
    current = _storey_elevation_native(storey)
    if current is None:
        return None
    candidates: list[float] = []
    for rel in getattr(storey, "Decomposes", []) or []:
        if not rel.is_a("IfcRelAggregates"):
            continue
        parent = getattr(rel, "RelatingObject", None)
        for aggregate in getattr(parent, "IsDecomposedBy", []) or []:
            if not aggregate.is_a("IfcRelAggregates"):
                continue
            for related in getattr(aggregate, "RelatedObjects", []) or []:
                if not related.is_a("IfcBuildingStorey") or related == storey:
                    continue
                elevation = _storey_elevation_native(related)
                if elevation is not None and elevation > current:
                    candidates.append(elevation)
    return min(candidates) if candidates else None


def _element_global_z_native(element: ifcopenshell.entity_instance) -> float:
    placement = getattr(element, "ObjectPlacement", None)
    if placement and placement.is_a("IfcLocalPlacement"):
        try:
            matrix = ifcopenshell.util.placement.get_local_placement(placement)
            return float(matrix[2][3])
        except Exception:
            pass
    return 0.0


def _height_fits_storey(
    element: ifcopenshell.entity_instance,
    next_height_native: float,
) -> bool:
    storey = _containing_storey(element)
    if storey is None:
        return True
    next_storey_z = _next_storey_elevation_native(storey)
    if next_storey_z is None:
        return True
    element_z = _element_global_z_native(element)
    return element_z + next_height_native <= next_storey_z + 1e-6


def _dimension_change_to_native(
    current_native: float,
    change: dict[str, Any],
    scale: float,
) -> float:
    mode = str(change.get("mode") or "ABSOLUTE").upper()
    if "value" not in change or change.get("value") is None:
        raise ValueError("dimension change requires an explicit value")
    value = float(change["value"])
    current_mm = current_native * scale
    if mode == "SCALE":
        next_mm = current_mm * value
    elif mode == "RELATIVE":
        next_mm = current_mm + value
    else:
        next_mm = value
    if not math.isfinite(next_mm) or next_mm <= 0.0:
        raise ValueError(f"dimension must be positive millimeters: {next_mm}")
    return next_mm / scale


def _body_extruded_solids(
    element: ifcopenshell.entity_instance,
) -> list[ifcopenshell.entity_instance]:
    representation = getattr(element, "Representation", None)
    if not representation:
        return []
    solids: list[ifcopenshell.entity_instance] = []
    for rep in getattr(representation, "Representations", []) or []:
        if getattr(rep, "RepresentationIdentifier", None) != "Body":
            continue
        for item in getattr(rep, "Items", []) or []:
            if item.is_a("IfcExtrudedAreaSolid"):
                solids.append(item)
    return solids


def _body_faceted_breps(
    element: ifcopenshell.entity_instance,
) -> list[ifcopenshell.entity_instance]:
    representation = getattr(element, "Representation", None)
    if not representation:
        return []
    breps: list[ifcopenshell.entity_instance] = []
    for rep in getattr(representation, "Representations", []) or []:
        if getattr(rep, "RepresentationIdentifier", None) != "Body":
            continue
        for item in getattr(rep, "Items", []) or []:
            if item.is_a("IfcFacetedBrep"):
                breps.append(item)
    return breps


def _brep_cartesian_points(
    brep: ifcopenshell.entity_instance,
) -> list[ifcopenshell.entity_instance]:
    points: list[ifcopenshell.entity_instance] = []
    seen: set[int] = set()
    outer = getattr(brep, "Outer", None)
    for face in getattr(outer, "CfsFaces", []) or []:
        for bound in getattr(face, "Bounds", []) or []:
            loop = getattr(bound, "Bound", None)
            if not loop or not loop.is_a("IfcPolyLoop"):
                continue
            for point in getattr(loop, "Polygon", []) or []:
                point_key = int(point.id()) if point.id() else id(point)
                if point_key in seen:
                    continue
                seen.add(point_key)
                points.append(point)
    return points


def _point_bounds(
    points: list[ifcopenshell.entity_instance],
) -> tuple[float, float, float, float, float, float] | None:
    coords = [tuple(getattr(point, "Coordinates", ()) or ()) for point in points]
    coords = [coord for coord in coords if len(coord) >= 2]
    if not coords:
        return None
    xs = [float(coord[0]) for coord in coords]
    ys = [float(coord[1]) for coord in coords]
    zs = [float(coord[2]) if len(coord) >= 3 else 0.0 for coord in coords]
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def _set_length_property_value(
    element: ifcopenshell.entity_instance,
    property_name: str,
    change: dict[str, Any],
    scale: float,
    fallback_mm: float | None = None,
) -> None:
    mode = str(change.get("mode") or "ABSOLUTE").upper()
    if "value" not in change or change.get("value") is None:
        raise ValueError("dimension property update requires an explicit value")
    value = float(change["value"])
    next_mm: float | None = None
    target_pset = None
    for rel in getattr(element, "IsDefinedBy", []) or []:
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        pset = getattr(rel, "RelatingPropertyDefinition", None)
        if target_pset is None and pset and pset.is_a("IfcPropertySet"):
            target_pset = pset
        for prop in getattr(pset, "HasProperties", []) or []:
            if not prop.is_a("IfcPropertySingleValue") or prop.Name != property_name:
                continue
            current = getattr(getattr(prop, "NominalValue", None), "wrappedValue", None)
            current_mm = float(current) if current is not None else fallback_mm
            if current_mm is None:
                current_mm = 0.0
            if mode == "SCALE":
                next_mm = current_mm * value
            elif mode == "RELATIVE":
                next_mm = current_mm + value
            else:
                next_mm = value
            prop.NominalValue.wrappedValue = float(next_mm)
            return
    if next_mm is None:
        next_mm = fallback_mm if fallback_mm is not None else value
    model = element.file
    prop = model.create_entity(
        "IfcPropertySingleValue",
        Name=property_name,
        NominalValue=model.create_entity("IfcLengthMeasure", float(next_mm)),
    )
    if target_pset is not None:
        target_pset.HasProperties = tuple(list(target_pset.HasProperties or []) + [prop])
        return
    pset = model.create_entity(
        "IfcPropertySet",
        GlobalId=ifcopenshell.guid.new(),
        Name="Pset_BATANG_Dimensions",
        HasProperties=[prop],
    )
    model.create_entity(
        "IfcRelDefinesByProperties",
        GlobalId=ifcopenshell.guid.new(),
        RelatedObjects=[element],
        RelatingPropertyDefinition=pset,
    )


def modify_thickness(
    element: ifcopenshell.entity_instance, width_mm: dict[str, Any], scale: float = 1.0
) -> bool:
    try:
        changed = False
        last_width_native: float | None = None
        for rel in getattr(element, "HasAssociations", []):
            if rel.is_a("IfcRelAssociatesMaterial"):
                mat = rel.RelatingMaterial
                if mat and mat.is_a("IfcMaterialLayerSetUsage"):
                    layer_set = mat.ForLayerSet
                    if layer_set and layer_set.MaterialLayers:
                        layer = layer_set.MaterialLayers[0]
                        last_width_native = _dimension_change_to_native(
                            layer.LayerThickness, width_mm, scale
                        )
                        layer.LayerThickness = float(last_width_native)
                        changed = True
        for solid in _body_extruded_solids(element):
            profile = getattr(solid, "SweptArea", None)
            if profile and profile.is_a("IfcRectangleProfileDef"):
                next_value = _dimension_change_to_native(float(profile.YDim), width_mm, scale)
                profile.YDim = float(next_value)
                last_width_native = next_value
                changed = True
            elif profile and profile.is_a("IfcArbitraryClosedProfileDef"):
                outer_curve = getattr(profile, "OuterCurve", None)
                if not outer_curve or not outer_curve.is_a("IfcPolyline"):
                    continue
                points = list(getattr(outer_curve, "Points", []) or [])
                bounds = _point_bounds(points)
                if not bounds:
                    continue
                _min_x, _max_x, min_y, max_y, _min_z, _max_z = bounds
                current_width = max_y - min_y
                if current_width <= 0:
                    continue
                next_width = _dimension_change_to_native(current_width, width_mm, scale)
                factor = next_width / current_width
                last_width_native = next_width
                center_y = (min_y + max_y) / 2.0
                for point in points:
                    coords = list(point.Coordinates)
                    coords[1] = center_y + (float(coords[1]) - center_y) * factor
                    point.Coordinates = tuple(coords)
                changed = True
        if changed:
            fallback_mm = last_width_native * scale if last_width_native is not None else None
            _set_length_property_value(element, "Width", width_mm, scale, fallback_mm)
        return changed
    except Exception as e:
        logger.error(f"Width update failed: {e}")
        return False


def modify_length(
    element: ifcopenshell.entity_instance, length_mm: dict[str, Any], scale: float = 1.0
) -> bool:
    try:
        changed = False
        last_length_native: float | None = None
        for solid in _body_extruded_solids(element):
            profile = getattr(solid, "SweptArea", None)
            if profile and profile.is_a("IfcRectangleProfileDef"):
                next_value = _dimension_change_to_native(float(profile.XDim), length_mm, scale)
                profile.XDim = float(next_value)
                last_length_native = next_value
                changed = True
            elif profile and profile.is_a("IfcArbitraryClosedProfileDef"):
                outer_curve = getattr(profile, "OuterCurve", None)
                if not outer_curve or not outer_curve.is_a("IfcPolyline"):
                    continue
                points = list(getattr(outer_curve, "Points", []) or [])
                bounds = _point_bounds(points)
                if not bounds:
                    continue
                min_x, max_x, _min_y, _max_y, _min_z, _max_z = bounds
                current_length = max_x - min_x
                if current_length <= 0:
                    continue
                next_length = _dimension_change_to_native(current_length, length_mm, scale)
                factor = next_length / current_length
                last_length_native = next_length
                center_x = (min_x + max_x) / 2.0
                for point in points:
                    coords = list(point.Coordinates)
                    coords[0] = center_x + (float(coords[0]) - center_x) * factor
                    point.Coordinates = tuple(coords)
                changed = True
        for brep in _body_faceted_breps(element):
            points = _brep_cartesian_points(brep)
            bounds = _point_bounds(points)
            if not bounds:
                continue
            min_x, max_x, _min_y, _max_y, _min_z, _max_z = bounds
            current_length = max_x - min_x
            if current_length <= 0:
                continue
            next_length = _dimension_change_to_native(current_length, length_mm, scale)
            factor = next_length / current_length
            last_length_native = next_length
            center_x = (min_x + max_x) / 2.0
            for point in points:
                coords = list(point.Coordinates)
                coords[0] = center_x + (float(coords[0]) - center_x) * factor
                point.Coordinates = tuple(coords)
            changed = True
        if changed:
            fallback_mm = last_length_native * scale if last_length_native is not None else None
            _set_length_property_value(element, "Length", length_mm, scale, fallback_mm)
        return changed
    except Exception as e:
        logger.error(f"Length update failed: {e}")
        return False


def modify_height(
    element: ifcopenshell.entity_instance, height_mm: dict[str, Any], scale: float = 1.0
) -> bool:
    try:
        changed = False
        last_height_native: float | None = None
        for solid in _body_extruded_solids(element):
            next_value = _dimension_change_to_native(float(solid.Depth), height_mm, scale)
            if not _height_fits_storey(element, next_value):
                return False
            solid.Depth = float(next_value)
            last_height_native = next_value
            changed = True
        if changed:
            fallback_mm = last_height_native * scale if last_height_native is not None else None
            _set_length_property_value(element, "Height", height_mm, scale, fallback_mm)
        return changed
    except Exception as e:
        logger.error(f"Height update failed: {e}")
        return False

def modify_position(
    element: ifcopenshell.entity_instance, pos_mm: dict[str, Any], scale: float = 1.0
) -> bool:
    try:
        placement = element.ObjectPlacement
        if not (placement and placement.is_a("IfcLocalPlacement")):
            return False
        rel_placement = placement.RelativePlacement
        if not (rel_placement and rel_placement.is_a("IfcAxis2Placement3D")):
            return False
        location = rel_placement.Location
        if not (location and location.is_a("IfcCartesianPoint")):
            return False

        mode_relative = pos_mm.get("mode") == "RELATIVE"
        dx, dy, dz = (
            float(pos_mm["x"]) / scale if pos_mm.get("x") is not None else 0.0,
            float(pos_mm["y"]) / scale if pos_mm.get("y") is not None else 0.0,
            float(pos_mm["z"]) / scale if pos_mm.get("z") is not None else 0.0,
        )
        coords = list(location.Coordinates)
        while len(coords) < 3:
            coords.append(0.0)
        before = tuple(float(value) for value in coords[:3])
        if mode_relative:
            coords[0] += dx
            coords[1] += dy
            coords[2] += dz
        else:
            if "x" in pos_mm:
                coords[0] = dx
            if "y" in pos_mm:
                coords[1] = dy
            if "z" in pos_mm:
                coords[2] = dz
        after = tuple(float(value) for value in coords[:3])
        if after == before:
            return False
        rel_placement.Location = element.file.create_entity(
            "IfcCartesianPoint",
            Coordinates=tuple(coords),
        )
        return True
    except Exception as e:
        logger.error(f"위치 수정 오류: {e}")
        return False


def _mat4_from_ifc(value: Any) -> list[list[float]]:
    return [[float(value[row][col]) for col in range(4)] for row in range(4)]


def _mat4_identity() -> list[list[float]]:
    return [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _mat4_mul(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    return [
        [sum(a[row][k] * b[k][col] for k in range(4)) for col in range(4)]
        for row in range(4)
    ]


def _mat4_transform_point(
    matrix: list[list[float]],
    point: tuple[float, float, float],
) -> tuple[float, float, float]:
    x, y, z = point
    return (
        matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3],
        matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3],
        matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3],
    )


def _mat4_transform_vector(
    matrix: list[list[float]],
    vector: tuple[float, float, float],
) -> tuple[float, float, float]:
    x, y, z = vector
    return (
        matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z,
        matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z,
        matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z,
    )


def _mat4_rigid_inverse(matrix: list[list[float]]) -> list[list[float]]:
    inverse = _mat4_identity()
    for row in range(3):
        for col in range(3):
            inverse[row][col] = matrix[col][row]
    tx, ty, tz = matrix[0][3], matrix[1][3], matrix[2][3]
    inverse[0][3] = -(inverse[0][0] * tx + inverse[0][1] * ty + inverse[0][2] * tz)
    inverse[1][3] = -(inverse[1][0] * tx + inverse[1][1] * ty + inverse[1][2] * tz)
    inverse[2][3] = -(inverse[2][0] * tx + inverse[2][1] * ty + inverse[2][2] * tz)
    return inverse


def _normalize_vec3(vector: tuple[float, float, float]) -> tuple[float, float, float] | None:
    length = math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2])
    if not math.isfinite(length) or length <= 1.0e-8:
        return None
    return (vector[0] / length, vector[1] / length, vector[2] / length)


def _rotation_matrix_axis_angle(
    axis: tuple[float, float, float],
    angle_rad: float,
) -> list[list[float]]:
    x, y, z = axis
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    one_c = 1.0 - cos_a
    return [
        [cos_a + x * x * one_c, x * y * one_c - z * sin_a, x * z * one_c + y * sin_a, 0.0],
        [y * x * one_c + z * sin_a, cos_a + y * y * one_c, y * z * one_c - x * sin_a, 0.0],
        [z * x * one_c - y * sin_a, z * y * one_c + x * sin_a, cos_a + z * z * one_c, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _translation_matrix(offset: tuple[float, float, float]) -> list[list[float]]:
    matrix = _mat4_identity()
    matrix[0][3], matrix[1][3], matrix[2][3] = offset
    return matrix


def _local_placement_matrix(placement: ifcopenshell.entity_instance | None) -> list[list[float]]:
    if placement is None:
        return _mat4_identity()
    return _mat4_from_ifc(ifcopenshell.util.placement.get_local_placement(placement))


def _unwrap_boolean_item(
    item: ifcopenshell.entity_instance | None,
) -> ifcopenshell.entity_instance | None:
    while item is not None and (
        item.is_a("IfcBooleanResult") or item.is_a("IfcBooleanClippingResult")
    ):
        item = item.FirstOperand
    return item


def _element_has_extruded_body(element: ifcopenshell.entity_instance) -> bool:
    for item in _body_representation_items(element):
        item = _unwrap_boolean_item(item)
        if item is not None and item.is_a("IfcExtrudedAreaSolid"):
            return True
    return False


def _remove_box_representations(element: ifcopenshell.entity_instance) -> bool:
    representation = getattr(element, "Representation", None)
    if not representation:
        return False
    reps = list(getattr(representation, "Representations", []) or [])
    kept_reps = [
        rep for rep in reps if getattr(rep, "RepresentationIdentifier", None) != "Box"
    ]
    if len(kept_reps) == len(reps):
        return False
    representation.Representations = kept_reps
    return True


def _solid_local_bbox_points(
    item: ifcopenshell.entity_instance,
) -> list[tuple[float, float, float]]:
    profile_bbox = _profile_xy_bbox(getattr(item, "SweptArea", None))
    if profile_bbox is None:
        return []
    position = getattr(item, "Position", None)
    location = getattr(position, "Location", None) if position else None
    coords = tuple(getattr(location, "Coordinates", ()) or ())
    ix = float(coords[0]) if len(coords) >= 1 else 0.0
    iy = float(coords[1]) if len(coords) >= 2 else 0.0
    iz = float(coords[2]) if len(coords) >= 3 else 0.0
    min_x, max_x, min_y, max_y = profile_bbox
    min_z = iz
    max_z = iz + float(item.Depth)
    return [
        (x + ix, y + iy, z)
        for x in (min_x, max_x)
        for y in (min_y, max_y)
        for z in (min_z, max_z)
    ]


def _element_body_world_points(
    element: ifcopenshell.entity_instance,
) -> list[tuple[float, float, float]]:
    placement_matrix = _local_placement_matrix(getattr(element, "ObjectPlacement", None))
    world_points: list[tuple[float, float, float]] = []
    for item in _body_representation_items(element):
        item = _unwrap_boolean_item(item)
        if item is None:
            continue
        if item.is_a("IfcExtrudedAreaSolid"):
            world_points.extend(
                _mat4_transform_point(placement_matrix, point)
                for point in _solid_local_bbox_points(item)
            )
        elif item.is_a("IfcFacetedBrep"):
            for point in _brep_cartesian_points(item):
                coords = tuple(getattr(point, "Coordinates", ()) or ())
                if len(coords) >= 3:
                    world_points.append(
                        _mat4_transform_point(
                            placement_matrix,
                            (float(coords[0]), float(coords[1]), float(coords[2])),
                        )
                    )
        elif item.is_a("IfcPolyline"):
            for point in getattr(item, "Points", []) or []:
                coords = tuple(getattr(point, "Coordinates", ()) or ())
                if len(coords) >= 2:
                    world_points.append(
                        _mat4_transform_point(
                            placement_matrix,
                            (
                                float(coords[0]),
                                float(coords[1]),
                                float(coords[2]) if len(coords) >= 3 else 0.0,
                            ),
                        )
                    )
    return world_points


def _element_world_bbox_center(
    element: ifcopenshell.entity_instance,
) -> tuple[float, float, float] | None:
    world_points = _element_body_world_points(element)
    if not world_points:
        bbox = _element_body_bbox_world(element)
        if bbox is None:
            return None
        min_x, max_x, min_y, max_y, min_z, max_z = bbox
        return ((min_x + max_x) / 2.0, (min_y + max_y) / 2.0, (min_z + max_z) / 2.0)
    xs = [point[0] for point in world_points]
    ys = [point[1] for point in world_points]
    zs = [point[2] for point in world_points]
    return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0, (min(zs) + max(zs)) / 2.0)


def _set_axis_placement_from_matrix(
    model: ifcopenshell.file,
    relative_placement: ifcopenshell.entity_instance,
    matrix: list[list[float]],
) -> None:
    location = (float(matrix[0][3]), float(matrix[1][3]), float(matrix[2][3]))
    ref_direction = _normalize_vec3((float(matrix[0][0]), float(matrix[1][0]), float(matrix[2][0])))
    axis = _normalize_vec3((float(matrix[0][2]), float(matrix[1][2]), float(matrix[2][2])))
    if ref_direction is None or axis is None:
        raise ValueError("cannot decompose rotation matrix into placement axes")
    relative_placement.Location = model.create_entity("IfcCartesianPoint", Coordinates=location)
    relative_placement.RefDirection = model.create_entity(
        "IfcDirection",
        DirectionRatios=ref_direction,
    )
    relative_placement.Axis = model.create_entity("IfcDirection", DirectionRatios=axis)


def _apply_axis_angle_to_placement(
    model: ifcopenshell.file,
    element: ifcopenshell.entity_instance,
    transform: list[list[float]],
) -> bool:
    placement = getattr(element, "ObjectPlacement", None)
    if placement is None or not placement.is_a("IfcLocalPlacement"):
        return False
    relative_placement = getattr(placement, "RelativePlacement", None)
    if relative_placement is None or not relative_placement.is_a("IfcAxis2Placement3D"):
        return False
    current_world = _local_placement_matrix(placement)
    parent_world = _local_placement_matrix(getattr(placement, "PlacementRelTo", None))
    next_world = _mat4_mul(transform, current_world)
    next_relative = _mat4_mul(_mat4_rigid_inverse(parent_world), next_world)
    _set_axis_placement_from_matrix(model, relative_placement, next_relative)
    return True


def _apply_axis_angle_to_geometry_points(
    element: ifcopenshell.entity_instance,
    transform: list[list[float]],
) -> bool:
    placement_matrix = _local_placement_matrix(getattr(element, "ObjectPlacement", None))
    world_to_local = _mat4_rigid_inverse(placement_matrix)
    changed = False
    for item in _body_representation_items(element):
        item = _unwrap_boolean_item(item)
        points: list[ifcopenshell.entity_instance] = []
        if item is None:
            continue
        if item.is_a("IfcFacetedBrep"):
            points.extend(_brep_cartesian_points(item))
        elif item.is_a("IfcPolyline"):
            points.extend(list(getattr(item, "Points", []) or []))
        for point in points:
            coords = list(getattr(point, "Coordinates", ()) or ())
            if len(coords) < 2:
                continue
            local = (
                float(coords[0]),
                float(coords[1]),
                float(coords[2]) if len(coords) >= 3 else 0.0,
            )
            world = _mat4_transform_point(placement_matrix, local)
            rotated_world = _mat4_transform_point(transform, world)
            next_local = _mat4_transform_point(world_to_local, rotated_world)
            coords[0], coords[1] = next_local[0], next_local[1]
            if len(coords) >= 3:
                coords[2] = next_local[2]
            point.Coordinates = tuple(coords)
            changed = True
    return changed


def _translate_axis_angle_placement_world(
    element: ifcopenshell.entity_instance,
    delta_world: tuple[float, float, float],
) -> bool:
    placement = getattr(element, "ObjectPlacement", None)
    if placement is None or not placement.is_a("IfcLocalPlacement"):
        return False
    relative_placement = getattr(placement, "RelativePlacement", None)
    location = getattr(relative_placement, "Location", None) if relative_placement else None
    if location is None:
        return False
    parent_world = _local_placement_matrix(getattr(placement, "PlacementRelTo", None))
    delta_local = _mat4_transform_vector(_mat4_rigid_inverse(parent_world), delta_world)
    coords = list(getattr(location, "Coordinates", ()) or ())
    while len(coords) < 3:
        coords.append(0.0)
    coords[0] = float(coords[0]) + delta_local[0]
    coords[1] = float(coords[1]) + delta_local[1]
    coords[2] = float(coords[2]) + delta_local[2]
    location.Coordinates = tuple(coords)
    return True


def _translate_axis_angle_geometry_world(
    element: ifcopenshell.entity_instance,
    delta_world: tuple[float, float, float],
) -> bool:
    placement_matrix = _local_placement_matrix(getattr(element, "ObjectPlacement", None))
    delta_local = _mat4_transform_vector(_mat4_rigid_inverse(placement_matrix), delta_world)
    changed = False
    for item in _body_representation_items(element):
        item = _unwrap_boolean_item(item)
        points: list[ifcopenshell.entity_instance] = []
        if item is None:
            continue
        if item.is_a("IfcFacetedBrep"):
            points.extend(_brep_cartesian_points(item))
        elif item.is_a("IfcPolyline"):
            points.extend(list(getattr(item, "Points", []) or []))
        for point in points:
            coords = list(getattr(point, "Coordinates", ()) or ())
            if len(coords) < 2:
                continue
            coords[0] = float(coords[0]) + delta_local[0]
            coords[1] = float(coords[1]) + delta_local[1]
            if len(coords) >= 3:
                coords[2] = float(coords[2]) + delta_local[2]
            point.Coordinates = tuple(coords)
            changed = True
    return changed


def _recenter_axis_angle_result(
    element: ifcopenshell.entity_instance,
    pivot_point: tuple[float, float, float],
) -> bool:
    next_center = _element_world_bbox_center(element)
    if next_center is None:
        return False
    delta = (
        pivot_point[0] - next_center[0],
        pivot_point[1] - next_center[1],
        pivot_point[2] - next_center[2],
    )
    if math.sqrt(delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2]) <= 1.0e-7:
        return False
    if _element_has_extruded_body(element):
        return _translate_axis_angle_placement_world(element, delta)
    return _translate_axis_angle_geometry_world(element, delta)


def modify_rotation_axis_angle(
    model: ifcopenshell.file,
    element: ifcopenshell.entity_instance,
    axis: dict[str, Any] | tuple[float, float, float],
    angle_deg: float,
    pivot: str = "BBOX_CENTER",
) -> bool:
    try:
        if isinstance(axis, dict):
            axis_tuple = (
                float(axis.get("x", 0.0)),
                float(axis.get("y", 0.0)),
                float(axis.get("z", 0.0)),
            )
        else:
            axis_tuple = (float(axis[0]), float(axis[1]), float(axis[2]))
        normalized_axis = _normalize_vec3(axis_tuple)
        if normalized_axis is None or not math.isfinite(float(angle_deg)):
            return False
        if abs(float(angle_deg)) <= 1.0e-6:
            return False
        if str(pivot or "BBOX_CENTER").upper() != "BBOX_CENTER":
            return False
        pivot_point = _element_world_bbox_center(element)
        if pivot_point is None:
            return False
        rotation = _rotation_matrix_axis_angle(normalized_axis, math.radians(float(angle_deg)))
        transform = _mat4_mul(
            _mat4_mul(_translation_matrix(pivot_point), rotation),
            _translation_matrix((-pivot_point[0], -pivot_point[1], -pivot_point[2])),
        )

        if _element_has_extruded_body(element):
            changed = _apply_axis_angle_to_placement(model, element, transform)
        else:
            changed = _apply_axis_angle_to_geometry_points(element, transform)
        if changed:
            _recenter_axis_angle_result(element, pivot_point)
            _remove_box_representations(element)
        return changed
    except Exception as e:
        logger.error(f"Axis-angle rotation update failed: {e}")
        return False


def modify_rotation(
    model: ifcopenshell.file, element: ifcopenshell.entity_instance, rotation_deg: float
) -> bool:
    try:
        rad = math.radians(rotation_deg)
        cos_a, sin_a = math.cos(rad), math.sin(rad)

        def rotate_xy(x: float, y: float) -> tuple[float, float]:
            return (x * cos_a - y * sin_a, x * sin_a + y * cos_a)

        def rotate_about(x: float, y: float, cx: float, cy: float) -> tuple[float, float]:
            rx, ry = rotate_xy(x - cx, y - cy)
            return (rx + cx, ry + cy)

        def rotate_polyline_points(points: Any) -> bool:
            point_list = list(points or [])
            coords_by_point: list[tuple[ifcopenshell.entity_instance, list[float]]] = []
            for point in point_list:
                coords = list(point.Coordinates)
                if len(coords) >= 2:
                    coords_by_point.append((point, coords))
            if not coords_by_point:
                return False

            xs = [float(coords[0]) for _, coords in coords_by_point]
            ys = [float(coords[1]) for _, coords in coords_by_point]
            center_x = (min(xs) + max(xs)) / 2.0
            center_y = (min(ys) + max(ys)) / 2.0
            for point, coords in coords_by_point:
                coords[0], coords[1] = rotate_about(
                    float(coords[0]), float(coords[1]), center_x, center_y
                )
                point.Coordinates = tuple(coords)
            return True

        def rotate_direction(direction: ifcopenshell.entity_instance, size: int) -> None:
            ratios = list(direction.DirectionRatios)
            while len(ratios) < 2:
                ratios.append(0.0)
            ratios[0], ratios[1] = rotate_xy(float(ratios[0]), float(ratios[1]))
            direction.DirectionRatios = tuple(ratios[:size])

        def is_arbitrary_closed_profile_extrusion(
            item: ifcopenshell.entity_instance,
        ) -> bool:
            if not item.is_a("IfcExtrudedAreaSolid"):
                return False
            profile = getattr(item, "SweptArea", None)
            if not profile or not profile.is_a("IfcArbitraryClosedProfileDef"):
                return False
            outer_curve = getattr(profile, "OuterCurve", None)
            return bool(outer_curve and outer_curve.is_a("IfcPolyline"))

        def uses_center_geometry_rotation(
            representation: ifcopenshell.entity_instance | None,
        ) -> bool:
            if not representation:
                return False
            has_center_rotated_geometry = False
            has_placement_rotated_solid = False
            for rep in list(getattr(representation, "Representations", []) or []):
                if getattr(rep, "RepresentationIdentifier", None) == "Box":
                    continue
                for item in getattr(rep, "Items", []) or []:
                    if item.is_a("IfcFacetedBrep") or is_arbitrary_closed_profile_extrusion(
                        item
                    ):
                        has_center_rotated_geometry = True
                    elif item.is_a("IfcExtrudedAreaSolid"):
                        has_placement_rotated_solid = True
            return has_center_rotated_geometry and not has_placement_rotated_solid

        changed = False
        placement_changed = False
        representation = getattr(element, "Representation", None)
        center_geometry_rotation = uses_center_geometry_rotation(representation)
        object_placement = getattr(element, "ObjectPlacement", None)
        relative_placement = getattr(object_placement, "RelativePlacement", None)
        if (
            not center_geometry_rotation
            and relative_placement
            and relative_placement.is_a("IfcAxis2Placement3D")
        ):
            ref_dir = relative_placement.RefDirection
            if not ref_dir:
                ref_dir = model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0))
                relative_placement.RefDirection = ref_dir
            rotate_direction(ref_dir, 3)
            changed = True
            placement_changed = True

        if not representation:
            return changed

        kept_reps = []
        for rep in list(getattr(representation, "Representations", []) or []):
            if getattr(rep, "RepresentationIdentifier", None) == "Box":
                changed = True
                continue
            kept_reps.append(rep)
            for item in getattr(rep, "Items", []) or []:
                if item.is_a("IfcPolyline"):
                    changed = rotate_polyline_points(item.Points) or changed
                if item.is_a("IfcGeometricCurveSet"):
                    for curve in getattr(item, "Elements", []) or []:
                        if curve.is_a("IfcPolyline"):
                            changed = rotate_polyline_points(curve.Points) or changed
                if item.is_a("IfcExtrudedAreaSolid"):
                    position = getattr(item, "Position", None)
                    profile = getattr(item, "SweptArea", None)
                    if profile and profile.is_a("IfcRectangleProfileDef"):
                        if (
                            not placement_changed
                            and position
                            and position.is_a("IfcAxis2Placement3D")
                        ):
                            ref_dir = position.RefDirection
                            if not ref_dir:
                                ref_dir = model.create_entity(
                                    "IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)
                                )
                                position.RefDirection = ref_dir
                            rotate_direction(ref_dir, 3)
                            changed = True
                        changed = True
                        continue
                    elif profile and profile.is_a("IfcArbitraryClosedProfileDef"):
                        outer_curve = getattr(profile, "OuterCurve", None)
                        if outer_curve and outer_curve.is_a("IfcPolyline"):
                            changed = rotate_polyline_points(outer_curve.Points) or changed
                            continue
                    location = getattr(position, "Location", None)
                    if location:
                        coords = list(location.Coordinates)
                        if len(coords) >= 2:
                            coords[0], coords[1] = rotate_xy(float(coords[0]), float(coords[1]))
                            location.Coordinates = tuple(coords)
                            changed = True
                    if position and position.is_a("IfcAxis2Placement3D"):
                        ref_dir = position.RefDirection
                        if not ref_dir:
                            ref_dir = model.create_entity(
                                "IfcDirection", DirectionRatios=(1.0, 0.0, 0.0)
                            )
                            position.RefDirection = ref_dir
                        rotate_direction(ref_dir, 3)
                        changed = True
                    profile_position = getattr(profile, "Position", None)
                    profile_location = getattr(profile_position, "Location", None)
                    if profile_location:
                        coords = list(profile_location.Coordinates)
                        if len(coords) >= 2:
                            coords[0], coords[1] = rotate_xy(float(coords[0]), float(coords[1]))
                            profile_location.Coordinates = tuple(coords)
                            changed = True
                    if profile_position and profile_position.is_a("IfcAxis2Placement2D"):
                        ref_dir = profile_position.RefDirection
                        if not ref_dir:
                            ref_dir = model.create_entity(
                                "IfcDirection", DirectionRatios=(1.0, 0.0)
                            )
                            profile_position.RefDirection = ref_dir
                        rotate_direction(ref_dir, 2)
                        changed = True
                if item.is_a("IfcFacetedBrep"):
                    points = _brep_cartesian_points(item)
                    bounds = _point_bounds(points)
                    if not bounds:
                        continue
                    min_x, max_x, min_y, max_y, _min_z, _max_z = bounds
                    center_x = (min_x + max_x) / 2.0
                    center_y = (min_y + max_y) / 2.0
                    for point in points:
                        coords = list(point.Coordinates)
                        coords[0], coords[1] = rotate_about(
                            float(coords[0]), float(coords[1]), center_x, center_y
                        )
                        point.Coordinates = tuple(coords)
                    changed = True
        representation.Representations = kept_reps
        return changed
    except Exception as e:
        logger.error(f"Rotation update failed: {e}")
        return False


def decomposed_products(
    element: ifcopenshell.entity_instance,
) -> list[ifcopenshell.entity_instance]:
    """Return product descendants from IfcRelAggregates without including the parent."""
    products: list[ifcopenshell.entity_instance] = []
    seen: set[int] = set()

    def visit(current: ifcopenshell.entity_instance) -> None:
        for rel in getattr(current, "IsDecomposedBy", []) or []:
            if not rel.is_a("IfcRelAggregates"):
                continue
            for child in getattr(rel, "RelatedObjects", []) or []:
                child_id = child.id()
                if child_id in seen:
                    continue
                seen.add(child_id)
                if child.is_a("IfcProduct"):
                    products.append(child)
                visit(child)

    visit(element)
    return products


def rotation_targets(
    element: ifcopenshell.entity_instance,
) -> list[ifcopenshell.entity_instance]:
    """Rotate aggregate children when the selected parent has no direct geometry."""
    targets = [element]
    if getattr(element, "Representation", None):
        return targets
    return targets + decomposed_products(element)

def modify_material(
    model: ifcopenshell.file, element: ifcopenshell.entity_instance, mat_change: dict[str, Any]
) -> bool:
    try:
        new_name = _canonical_material_name(str(mat_change.get("name") or "Unknown"))
        # Snapshot associations before removing relations from the IFC graph.
        for rel in list(getattr(element, "HasAssociations", [])):
            if rel.is_a("IfcRelAssociatesMaterial"):
                remaining = [o for o in rel.RelatedObjects if o != element]
                if remaining:
                    rel.RelatedObjects = remaining
                else:
                    model.remove(rel)
        new_mat = _find_or_create_material(model, new_name)
        model.create_entity(
            "IfcRelAssociatesMaterial",
            GlobalId=ifcopenshell.guid.new(),
            RelatingMaterial=new_mat,
            RelatedObjects=[element],
        )
        _set_label_property_value(model, element, "Material", new_name)
        material_color = _material_default_color(new_name)
        if material_color is not None:
            modify_color(model, element, material_color)
        return True
    except Exception as e:
        logger.error(f"재질 수정 오류: {e}")
        return False


def modify_color(
    model: ifcopenshell.file, element: ifcopenshell.entity_instance, color_value: str
) -> bool:
    try:
        label_changed = _set_label_property_value(model, element, "Color", color_value)
        items = _body_representation_items(element)
        if not items:
            return label_changed
        assignment = _create_surface_style_assignment(model, color_value)
        for item in items:
            styled = _styled_item_for(model, item)
            if styled:
                styled.Styles = [assignment]
            else:
                model.create_entity("IfcStyledItem", Item=item, Styles=[assignment])
        return True
    except Exception as e:
        logger.error(f"색상 수정 오류: {e}")
        return False


def modify_face_offset(
    element: ifcopenshell.entity_instance,
    offset_mm: float,
    direction: str,
    scale: float = 1.0,
) -> bool:
    """특정 면(Face)을 법선 방향으로 offset_mm만큼 밀거나 당긴다.

    - IfcRectangleProfileDef: direction에 따라 XDim/YDim을 증감한다.
    - IfcArbitraryClosedProfileDef: 해당 방향을 향하는 꼭짓점을 offset만큼 이동한다.
    offset_mm > 0 이면 외부 방향(push), < 0 이면 내부 방향(pull).
    """
    try:
        if not element.Representation:
            return False
        offset = offset_mm / scale
        dir_key = direction.lower()

        for rep in element.Representation.Representations:
            if rep.RepresentationIdentifier != "Body":
                continue
            for item in rep.Items:
                if not item.is_a("IfcExtrudedAreaSolid"):
                    continue
                profile = item.SweptArea

                # ── 직사각형 프로파일 ──────────────────────────────────────────
                if profile.is_a("IfcRectangleProfileDef"):
                    if dir_key in ("north", "south"):
                        profile.YDim = float(max(1.0, profile.YDim + offset))
                    elif dir_key in ("east", "west"):
                        profile.XDim = float(max(1.0, profile.XDim + offset))
                    return True

                # ── 임의 폴리라인 프로파일 (ㄴ자 벽 등) ──────────────────────
                if profile.is_a("IfcArbitraryClosedProfileDef"):
                    dir_normal: dict[str, tuple[float, float]] = {
                        "north": (0.0, 1.0),
                        "south": (0.0, -1.0),
                        "east": (1.0, 0.0),
                        "west": (-1.0, 0.0),
                    }
                    nx, ny = dir_normal.get(dir_key, (0.0, 1.0))
                    curve = profile.OuterCurve
                    if curve.is_a("IfcPolyline"):
                        for pt in curve.Points:
                            coords = list(pt.Coordinates)
                            # 법선 방향과 같은 쪽 꼭짓점만 이동
                            dot = coords[0] * nx + coords[1] * ny
                            if dot > 0:
                                coords[0] = coords[0] + nx * offset
                                coords[1] = coords[1] + ny * offset
                                pt.Coordinates = tuple(coords)
                    return True

        return False
    except Exception as e:
        logger.error(f"면 오프셋 오류: {e}")
        return False


# ──────────────────────────────────────────────────────────────────────────────
# 2. 생성 (CREATE) 및 시각화 (Color/Material)
# ──────────────────────────────────────────────────────────────────────────────

_DIRECTION_REF_DIRECTIONS = {
    "north": (0.0, 1.0, 0.0),
    "south": (0.0, -1.0, 0.0),
    "east": (1.0, 0.0, 0.0),
    "west": (-1.0, 0.0, 0.0),
}

_COLOR_RGB = {
    "white": (1.0, 1.0, 1.0),
    "black": (0.0, 0.0, 0.0),
    "red": (1.0, 0.0, 0.0),
    "yellow": (1.0, 0.8, 0.0),
    "blue": (0.0, 0.0, 1.0),
    "green": (0.0, 0.6, 0.0),
    "orange": (1.0, 0.45, 0.0),
    "purple": (0.6, 0.25, 0.9),
    "pink": (0.9, 0.25, 0.55),
    "brown": (0.55, 0.25, 0.05),
    "gray": (0.8, 0.8, 0.8),
    "grey": (0.8, 0.8, 0.8),
}

_MATERIAL_DEFAULT_COLOR = {
    "Concrete": "#A8A29E",
    "Brick": "#A3472C",
    "Steel": "#8A94A3",
    "Wood": "#9A6232",
    "Glass": "#8FD3FF",
    "Stone": "#8D8D86",
    "Tile": "#C56F45",
}


def _mm_to_model_units(
    model: ifcopenshell.file,
    value_mm: int | float | None,
    default_mm: float,
) -> float:
    """mm 입력값을 현재 IFC LENGTHUNIT의 native unit으로 변환한다."""
    value = float(value_mm if value_mm is not None else default_mm)
    for unit in model.by_type("IfcSIUnit"):
        if getattr(unit, "UnitType", None) != "LENGTHUNIT":
            continue
        prefix = getattr(unit, "Prefix", None)
        if prefix == "MILLI":
            return value
        if prefix == "CENTI":
            return value / 10.0
        if prefix == "DECI":
            return value / 100.0
        if prefix is None:
            return value / 1000.0
    return value


def _get_model_unit_scale(model: ifcopenshell.file) -> float:
    """native unit -> mm 변환 배율을 반환한다."""
    for unit in model.by_type("IfcSIUnit"):
        if getattr(unit, "UnitType", None) != "LENGTHUNIT":
            continue
        prefix = getattr(unit, "Prefix", None)
        if prefix == "MILLI":
            return 1.0
        if prefix == "CENTI":
            return 10.0
        if prefix == "DECI":
            return 100.0
        if prefix is None:
            return 1000.0
    return 1.0


def _placement_origin_and_x_axis(
    placement: ifcopenshell.entity_instance,
) -> tuple[tuple[float, float, float], tuple[float, float]]:
    try:
        matrix = ifcopenshell.util.placement.get_local_placement(placement)
        return (
            (float(matrix[0][3]), float(matrix[1][3]), float(matrix[2][3])),
            (float(matrix[0][0]), float(matrix[1][0])),
        )
    except Exception:
        rel = placement.RelativePlacement
        loc = rel.Location.Coordinates
        ref = getattr(rel, "RefDirection", None)
        if ref:
            x_axis = (float(ref.DirectionRatios[0]), float(ref.DirectionRatios[1]))
        else:
            x_axis = (1.0, 0.0)
        z = float(loc[2]) if len(loc) > 2 else 0.0
        return (float(loc[0]), float(loc[1]), z), x_axis


def find_host_wall(
    model: ifcopenshell.file, host_wall_global_id: str | None, x_mm: float, y_mm: float, z_mm: float
) -> ifcopenshell.entity_instance | None:
    """좌표 근처의 벽체를 찾거나 ID로 특정하여 호스트 벽체 반환"""
    # 1. ID로 찾기 (가장 정확)
    if host_wall_global_id:
        try:
            wall = model.by_guid(host_wall_global_id)
            if wall and wall.is_a("IfcWall"):
                return wall
        except Exception:
            pass
        return None

    # 2. 근접 벽체 탐색 (좌표 기반)
    scale = _get_model_unit_scale(model)
    best_wall, best_dist = None, 3000.0 / scale  # 검색 반경을 3m로 확대

    for wall in model.by_type("IfcWall"):
        pl = getattr(wall, "ObjectPlacement", None)
        if not (pl and pl.is_a("IfcLocalPlacement")):
            continue

        # 벽체 원점(시작점) 좌표
        loc, (rdx, rdy) = _placement_origin_and_x_axis(pl)

        # 전역 좌표를 벽체 로컬 좌표로 변환 (U: 길이 방향, V: 두께 방향)
        dx, dy = (x_mm / scale) - loc[0], (y_mm / scale) - loc[1]
        u = dx * rdx + dy * rdy
        v = dx * (-rdy) + dy * rdx

        # 벽체의 길이(L) 확인
        l_m = 0.0
        if wall.Representation:
            for rep in wall.Representation.Representations:
                if rep.RepresentationIdentifier == "Body":
                    item = rep.Items[0]
                    while item.is_a("IfcBooleanResult"):
                        item = item.FirstOperand
                    if item.is_a("IfcExtrudedAreaSolid"):
                        l_m = max(item.SweptArea.XDim, item.SweptArea.YDim)
                        break

        # 좌표가 벽체의 길이 범위(0~L) 내에 있고 두께 방향으로 가깝다면 선정
        if -500/scale <= u <= l_m + 500/scale:
            dist_v = abs(v)
            if dist_v < best_dist:
                best_dist = dist_v
                best_wall = wall

    return best_wall


def _body_context(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    contexts = model.by_type("IfcGeometricRepresentationSubContext")
    for context in contexts:
        if getattr(context, "ContextIdentifier", None) == "Body":
            return context
    contexts = model.by_type("IfcGeometricRepresentationContext")
    if not contexts:
        raise ValueError("IFC 모델에 GeometricRepresentationContext가 없습니다.")
    return contexts[0]


def _axis_placement_2d(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcAxis2Placement2D",
        Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0)),
        RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0)),
    )


def _axis_placement_3d(
    model: ifcopenshell.file,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    axis: tuple[float, float, float] = (0.0, 0.0, 1.0),
    ref_direction: tuple[float, float, float] = (1.0, 0.0, 0.0),
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcAxis2Placement3D",
        Location=model.create_entity("IfcCartesianPoint", Coordinates=location),
        Axis=model.create_entity("IfcDirection", DirectionRatios=axis),
        RefDirection=model.create_entity("IfcDirection", DirectionRatios=ref_direction),
    )


def _box_representation(
    model: ifcopenshell.file,
    length_m: float,
    width_m: float,
    height_m: float,
    loc: tuple[float, float, float] = (0.0, 0.0, 0.0),
    center_origin: bool = False,
) -> tuple[ifcopenshell.entity_instance, ifcopenshell.entity_instance]:
    """박스 형상 생성 (center_origin=False면 모서리가 (0,0,0) 기준)"""
    if center_origin:
        pos_2d = _axis_placement_2d(model)
    else:
        # 모서리 기준일 경우 중심점으로 2D 프로파일 이동
        pos_2d = model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity(
                "IfcCartesianPoint", Coordinates=(float(length_m / 2.0), float(width_m / 2.0))
            ),
        )

    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=float(length_m),
        YDim=float(width_m),
        Position=pos_2d,
    )
    solid = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=_axis_placement_3d(model, location=loc),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=float(height_m),
    )
    shape = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=_body_context(model),
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[solid],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[shape]), solid


def _box_solid(
    model: ifcopenshell.file,
    length_m: float,
    width_m: float,
    height_m: float,
    loc: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> ifcopenshell.entity_instance:
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=float(length_m),
        YDim=float(width_m),
        Position=model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity(
                "IfcCartesianPoint",
                Coordinates=(float(length_m / 2.0), float(width_m / 2.0)),
            ),
        ),
    )
    return model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=_axis_placement_3d(model, location=loc),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=float(height_m),
    )


def _style_item(
    model: ifcopenshell.file,
    item: ifcopenshell.entity_instance,
    color_value: str,
    *,
    transparency: float | None = None,
) -> None:
    model.create_entity(
        "IfcStyledItem",
        Item=item,
        Styles=[_create_surface_style_assignment(model, color_value, transparency=transparency)],
    )


def _window_frame_representation(
    model: ifcopenshell.file,
    length_m: float,
    width_m: float,
    height_m: float,
    *,
    include_mullion: bool = True,
) -> ifcopenshell.entity_instance:
    frame = max(min(length_m, height_m) * 0.055, _mm_to_model_units(model, 55.0, 55.0))
    frame = min(frame, max(min(length_m, height_m) * 0.18, _mm_to_model_units(model, 90.0, 90.0)))
    mullion = max(frame * 0.72, _mm_to_model_units(model, 40.0, 40.0))
    glass_depth = min(width_m * 0.35, _mm_to_model_units(model, 45.0, 45.0))
    glass_depth = max(glass_depth, _mm_to_model_units(model, 20.0, 20.0))
    inner_length = max(length_m - (frame * 2.0), frame)
    inner_height = max(height_m - (frame * 2.0), frame)

    frame_items = [
        _box_solid(model, length_m, width_m, frame, (0.0, 0.0, 0.0)),
        _box_solid(model, length_m, width_m, frame, (0.0, 0.0, max(height_m - frame, 0.0))),
        _box_solid(model, frame, width_m, height_m, (0.0, 0.0, 0.0)),
        _box_solid(model, frame, width_m, height_m, (max(length_m - frame, 0.0), 0.0, 0.0)),
    ]
    if include_mullion:
        center_x = max((length_m - mullion) / 2.0, frame)
        frame_items.append(_box_solid(model, mullion, width_m, height_m, (center_x, 0.0, 0.0)))
    glass = _box_solid(
        model,
        inner_length,
        glass_depth,
        inner_height,
        (frame, max((width_m - glass_depth) / 2.0, 0.0), frame),
    )

    for item in frame_items:
        _style_item(model, item, "#B77A3D")
    _style_item(model, glass, "#8FD3FF", transparency=0.55)

    shape = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=_body_context(model),
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[*frame_items, glass],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[shape])


def _stair_preset_representation(
    model: ifcopenshell.file,
    length_m: float,
    width_m: float,
    height_m: float,
    step_count: int,
) -> ifcopenshell.entity_instance:
    tread_depth = length_m / step_count
    riser_height = height_m / step_count
    solids = []
    for index in range(step_count):
        step_height = riser_height * (index + 1)
        pos_2d = model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity(
                "IfcCartesianPoint",
                Coordinates=(float(tread_depth / 2.0), float(width_m / 2.0)),
            ),
        )
        profile = model.create_entity(
            "IfcRectangleProfileDef",
            ProfileType="AREA",
            XDim=float(tread_depth),
            YDim=float(width_m),
            Position=pos_2d,
        )
        solid = model.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=profile,
            Position=_axis_placement_3d(
                model,
                location=(float(tread_depth * index), 0.0, 0.0),
            ),
            ExtrudedDirection=model.create_entity(
                "IfcDirection",
                DirectionRatios=(0.0, 0.0, 1.0),
            ),
            Depth=float(step_height),
        )
        solids.append(solid)

    shape = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=_body_context(model),
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=solids,
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[shape])


def _resolve_stair_step_count(
    *,
    length_mm: float,
    height_mm: float,
    step_count: int | None = None,
    riser_height_mm: float | None = None,
    tread_depth_mm: float | None = None,
) -> int:
    if step_count is not None:
        resolved = step_count
    elif riser_height_mm and riser_height_mm > 0:
        resolved = round(height_mm / riser_height_mm)
    elif tread_depth_mm and tread_depth_mm > 0:
        resolved = round(length_mm / tread_depth_mm)
    else:
        resolved = round(height_mm / 170.0)
    return max(2, min(64, int(resolved)))


def _assign_stair_quantities(
    model: ifcopenshell.file,
    stair: ifcopenshell.entity_instance,
    *,
    step_count: int,
    riser_height_mm: float,
    tread_depth_mm: float,
) -> None:
    properties = [
        model.create_entity(
            "IfcPropertySingleValue",
            Name="StepCount",
            NominalValue=model.create_entity("IfcInteger", int(step_count)),
        ),
        model.create_entity(
            "IfcPropertySingleValue",
            Name="RiserHeight",
            NominalValue=model.create_entity("IfcLengthMeasure", float(riser_height_mm)),
        ),
        model.create_entity(
            "IfcPropertySingleValue",
            Name="TreadDepth",
            NominalValue=model.create_entity("IfcLengthMeasure", float(tread_depth_mm)),
        ),
    ]
    pset = model.create_entity(
        "IfcPropertySet",
        GlobalId=ifcopenshell.guid.new(),
        Name="Batang_StairPreset",
        HasProperties=properties,
    )
    model.create_entity(
        "IfcRelDefinesByProperties",
        GlobalId=ifcopenshell.guid.new(),
        RelatedObjects=[stair],
        RelatingPropertyDefinition=pset,
    )


def _face(
    model: ifcopenshell.file,
    points: list[tuple[float, float, float]],
) -> ifcopenshell.entity_instance:
    loop = model.create_entity(
        "IfcPolyLoop",
        Polygon=[model.create_entity("IfcCartesianPoint", Coordinates=p) for p in points],
    )
    bound = model.create_entity("IfcFaceOuterBound", Bound=loop, Orientation=True)
    return model.create_entity("IfcFace", Bounds=[bound])


def _gabled_roof_representation(
    model: ifcopenshell.file,
    length_m: float,
    width_m: float,
    ridge_height_m: float,
) -> ifcopenshell.entity_instance:
    half_l = length_m / 2.0
    half_w = width_m / 2.0
    points = {
        "a": (-half_l, -half_w, 0.0),
        "b": (half_l, -half_w, 0.0),
        "c": (half_l, half_w, 0.0),
        "d": (-half_l, half_w, 0.0),
        "e": (-half_l, 0.0, ridge_height_m),
        "f": (half_l, 0.0, ridge_height_m),
    }
    faces = [
        _face(model, [points["a"], points["b"], points["c"], points["d"]]),
        _face(model, [points["a"], points["e"], points["f"], points["b"]]),
        _face(model, [points["d"], points["c"], points["f"], points["e"]]),
        _face(model, [points["a"], points["d"], points["e"]]),
        _face(model, [points["b"], points["f"], points["c"]]),
    ]
    brep = model.create_entity(
        "IfcFacetedBrep",
        Outer=model.create_entity("IfcClosedShell", CfsFaces=faces),
    )
    shape = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=_body_context(model),
        RepresentationIdentifier="Body",
        RepresentationType="Brep",
        Items=[brep],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[shape])


def _color_to_rgb(color_value: str) -> tuple[float, float, float]:
    raw = color_value.strip()
    hex_val = raw.lstrip("#")
    if len(hex_val) == 6:
        return (
            int(hex_val[0:2], 16) / 255.0,
            int(hex_val[2:4], 16) / 255.0,
            int(hex_val[4:6], 16) / 255.0,
        )
    return _COLOR_RGB.get(raw.lower(), _COLOR_RGB["gray"])


def _find_or_create_material(model: ifcopenshell.file, name: str):
    for material in model.by_type("IfcMaterial"):
        if str(getattr(material, "Name", "") or "").lower() == name.lower():
            return material
    return model.create_entity("IfcMaterial", Name=name)


def _canonical_material_name(name: str) -> str:
    normalized = name.strip()
    for material_name in _MATERIAL_DEFAULT_COLOR:
        if material_name.lower() == normalized.lower():
            return material_name
    return normalized or "Unknown"


def _material_default_color(name: str) -> str | None:
    for material_name, color in _MATERIAL_DEFAULT_COLOR.items():
        if material_name.lower() == name.lower():
            return color
    return None


def _set_label_property_value(
    model: ifcopenshell.file,
    element: ifcopenshell.entity_instance,
    property_name: str,
    value: str,
) -> bool:
    changed = False
    fallback_pset = None
    for rel in getattr(element, "IsDefinedBy", []) or []:
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        pset = getattr(rel, "RelatingPropertyDefinition", None)
        if pset is None or not pset.is_a("IfcPropertySet"):
            continue
        if fallback_pset is None:
            fallback_pset = pset
        for prop in getattr(pset, "HasProperties", []) or []:
            if (
                prop.is_a("IfcPropertySingleValue")
                and getattr(prop, "Name", None) == property_name
            ):
                prop.NominalValue = model.create_entity("IfcLabel", value)
                changed = True
        if not changed and getattr(pset, "Name", None) == "Pset_Batang_Dimensions":
            fallback_pset = pset
    if changed:
        return True

    new_prop = model.create_entity(
        "IfcPropertySingleValue",
        Name=property_name,
        NominalValue=model.create_entity("IfcLabel", value),
    )
    if fallback_pset is not None:
        fallback_pset.HasProperties = list(getattr(fallback_pset, "HasProperties", []) or []) + [
            new_prop
        ]
    else:
        fallback_pset = model.create_entity(
            "IfcPropertySet",
            GlobalId=ifcopenshell.guid.new(),
            Name="Pset_Batang_Dimensions",
            HasProperties=[new_prop],
        )
        model.create_entity(
            "IfcRelDefinesByProperties",
            GlobalId=ifcopenshell.guid.new(),
            RelatedObjects=[element],
            RelatingPropertyDefinition=fallback_pset,
        )
    return True


def _body_representation_items(element: ifcopenshell.entity_instance) -> list[Any]:
    representation = getattr(element, "Representation", None)
    if not representation:
        return []
    items: list[Any] = []
    for rep in getattr(representation, "Representations", []) or []:
        if getattr(rep, "RepresentationIdentifier", None) == "Body":
            items.extend(list(getattr(rep, "Items", []) or []))
    return items


def _create_surface_style_assignment(
    model: ifcopenshell.file,
    color_value: str,
    *,
    transparency: float | None = None,
):
    r, g, b = _color_to_rgb(color_value)
    color = model.create_entity("IfcColourRgb", Name=color_value, Red=r, Green=g, Blue=b)
    rendering_kwargs: dict[str, Any] = {"SurfaceColour": color}
    if transparency is not None:
        rendering_kwargs["Transparency"] = float(max(0.0, min(1.0, transparency)))
    rendering = model.create_entity("IfcSurfaceStyleRendering", **rendering_kwargs)
    style = model.create_entity(
        "IfcSurfaceStyle", Name=f"Style_{color_value}", Side="BOTH", Styles=[rendering]
    )
    return model.create_entity("IfcPresentationStyleAssignment", Styles=[style])


def _styled_item_for(model: ifcopenshell.file, item: ifcopenshell.entity_instance):
    for inverse in model.get_inverse(item):
        if inverse.is_a("IfcStyledItem") and getattr(inverse, "Item", None) == item:
            return inverse
    return None


def _apply_color_and_material(
    model: ifcopenshell.file,
    element: ifcopenshell.entity_instance,
    color_hex: str | None = None,
    mat_name: str | None = None,
):
    """부재에 색상(RGB) 및 재질 정보를 부여한다."""
    try:
        if mat_name:
            modify_material(model, element, {"name": mat_name})
        if color_hex:
            modify_color(model, element, color_hex)
    except Exception as e:
        logger.warning(f"색상/재질 적용 중 오류 (무시 가능): {e}")


def _assign_to_storey(
    model: ifcopenshell.file,
    element: ifcopenshell.entity_instance,
    storey: ifcopenshell.entity_instance,
) -> None:
    """IfcOpenShell 0.8.x API에 맞춰 생성 부재를 층에 배치한다."""
    ifcopenshell.api.run(
        "spatial.assign_container",
        model,
        products=[element],
        relating_structure=storey,
    )


def _make_placement(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    x_mm: float,
    y_mm: float,
    z_mm: float,
    direction: str,
    ref_direction: tuple[float, float, float] | None = None,
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=storey.ObjectPlacement,
        RelativePlacement=_axis_placement_3d(
            model,
            location=(
                _mm_to_model_units(model, x_mm, 0.0),
                _mm_to_model_units(model, y_mm, 0.0),
                _mm_to_model_units(model, z_mm, 0.0),
            ),
            axis=(0.0, 0.0, 1.0),
            ref_direction=ref_direction or _DIRECTION_REF_DIRECTIONS.get(
                direction.lower(),
                _DIRECTION_REF_DIRECTIONS["north"],
            ),
        ),
    )


def _wall_z_range(
    wall: ifcopenshell.entity_instance | None,
) -> tuple[float, float] | None:
    body = _wall_body_item(wall)
    if body is None:
        return None
    position = getattr(body, "Position", None)
    location = getattr(position, "Location", None) if position is not None else None
    coords = tuple(getattr(location, "Coordinates", ()) or ())
    z0 = float(coords[2]) if len(coords) >= 3 else 0.0
    return (z0, z0 + float(body.Depth))


def _clamp_opening_z_to_wall(
    host_wall: ifcopenshell.entity_instance,
    z: float,
    height: float,
) -> float:
    z_range = _wall_z_range(host_wall)
    if z_range is None:
        return z
    min_z, max_z = z_range
    max_bottom = max(min_z, max_z - height)
    return min(max(z, min_z), max_bottom)


def _clamp_window_z_below_overhead_slabs(
    model: ifcopenshell.file,
    host_wall: ifcopenshell.entity_instance,
    z: float,
    height: float,
    *,
    opening_u: float,
    opening_v: float,
    opening_length: float,
    opening_thickness: float,
    ew_wall: bool,
) -> float:
    wall_bbox = _element_body_bbox_world(host_wall)
    if wall_bbox is None:
        return z
    _, _, _, _, wall_min_z, wall_max_z = wall_bbox

    if ew_wall:
        min_x = opening_u - (opening_length / 2.0)
        max_x = opening_u + (opening_length / 2.0)
        min_y = opening_v - (opening_thickness / 2.0)
        max_y = opening_v + (opening_thickness / 2.0)
    else:
        min_x = opening_u - (opening_thickness / 2.0)
        max_x = opening_u + (opening_thickness / 2.0)
        min_y = opening_v - (opening_length / 2.0)
        max_y = opening_v + (opening_length / 2.0)

    opening_bbox = _local_box_bbox_world(
        host_wall.ObjectPlacement,
        min_x=min_x,
        max_x=max_x,
        min_y=min_y,
        max_y=max_y,
        min_z=z,
        max_z=z + height,
    )
    if opening_bbox is None:
        return z
    opening_min_x, opening_max_x, opening_min_y, opening_max_y, _, _ = opening_bbox

    clear_top = wall_max_z
    for slab in model.by_type("IfcSlab"):
        slab_bbox = _element_body_bbox_world(slab)
        if slab_bbox is None:
            continue
        slab_min_x, slab_max_x, slab_min_y, slab_max_y, slab_min_z, _ = slab_bbox
        overlaps_xy = (
            opening_min_x < slab_max_x
            and opening_max_x > slab_min_x
            and opening_min_y < slab_max_y
            and opening_max_y > slab_min_y
        )
        if not overlaps_xy:
            continue
        if wall_min_z < slab_min_z < clear_top:
            clear_top = slab_min_z

    host_origin, _ = _placement_origin_and_x_axis(host_wall.ObjectPlacement)
    clear_top_local = clear_top - host_origin[2]
    max_bottom = max(0.0, clear_top_local - height)
    return min(z, max_bottom)


def _axis_representation_present(
    wall: ifcopenshell.entity_instance | None,
) -> bool:
    representation = getattr(wall, "Representation", None) if wall is not None else None
    if representation is None:
        return False
    for rep in getattr(representation, "Representations", []) or []:
        if getattr(rep, "RepresentationIdentifier", None) == "Axis":
            return True
    return False


def _copy_material_association(
    model: ifcopenshell.file,
    *,
    template_product,
    product,
) -> None:
    for rel in getattr(template_product, "HasAssociations", []) or []:
        if not rel.is_a("IfcRelAssociatesMaterial"):
            continue
        material = getattr(rel, "RelatingMaterial", None)
        if material is None:
            continue
        model.create_entity(
            "IfcRelAssociatesMaterial",
            GlobalId=ifcopenshell.guid.new(),
            RelatedObjects=[product],
            RelatingMaterial=material,
        )
        return


def _create_wall_product_shape(
    model: ifcopenshell.file,
    *,
    length_m: float,
    thickness_m: float,
    height_m: float,
    y_min_m: float,
    include_axis: bool,
) -> ifcopenshell.entity_instance:
    representations: list[ifcopenshell.entity_instance] = []
    body_context = _body_context(model)
    if include_axis:
        axis_polyline = model.create_entity(
            "IfcPolyline",
            Points=(
                model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0)),
                model.create_entity("IfcCartesianPoint", Coordinates=(length_m, 0.0)),
            ),
        )
        representations.append(
            model.create_entity(
                "IfcShapeRepresentation",
                ContextOfItems=body_context,
                RepresentationIdentifier="Axis",
                RepresentationType="Curve2D",
                Items=(axis_polyline,),
            )
        )

    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=float(length_m),
        YDim=float(thickness_m),
        Position=model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity(
                "IfcCartesianPoint",
                Coordinates=(float(length_m / 2.0), float(y_min_m + (thickness_m / 2.0))),
            ),
        ),
    )
    solid = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=_axis_placement_3d(model, location=(0.0, 0.0, 0.0)),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=float(height_m),
    )
    representations.append(
        model.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=body_context,
            RepresentationIdentifier="Body",
            RepresentationType="SweptSolid",
            Items=[solid],
        )
    )
    representations.append(
        model.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=body_context,
            RepresentationIdentifier="Box",
            RepresentationType="BoundingBox",
            Items=[
                model.create_entity(
                    "IfcBoundingBox",
                    Corner=model.create_entity(
                        "IfcCartesianPoint",
                        Coordinates=(0.0, float(y_min_m), 0.0),
                    ),
                    XDim=float(length_m),
                    YDim=float(thickness_m),
                    ZDim=float(height_m),
                )
            ],
        )
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=representations)


def _create_path_connection(
    model: ifcopenshell.file,
    *,
    relating_element,
    related_element,
    relating_connection_type: str,
    related_connection_type: str,
) -> None:
    model.create_entity(
        "IfcRelConnectsPathElements",
        GlobalId=ifcopenshell.guid.new(),
        RelatingElement=relating_element,
        RelatedElement=related_element,
        RelatingConnectionType=relating_connection_type,
        RelatedConnectionType=related_connection_type,
    )


def create_wall_with_template_reuse(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    *,
    template_wall: ifcopenshell.entity_instance,
    name: str,
    start_mm: dict[str, float],
    end_mm: dict[str, float],
    width_mm: float,
    height_mm: float,
    endpoint_connections: list[dict[str, str]] | None = None,
) -> ifcopenshell.entity_instance | None:
    try:
        if not template_wall.is_a("IfcWallStandardCase"):
            logger.error("Template wall for create_wall is not IfcWallStandardCase")
            return None
        template_body = _wall_body_item(template_wall)
        template_y_bounds = _wall_y_bounds(template_wall)
        template_z_range = _wall_z_range(template_wall)
        if template_body is None or template_y_bounds is None or template_z_range is None:
            logger.error("Template wall for create_wall is missing supported body data")
            return None

        start_x_mm = float(start_mm.get("x", 0.0))
        start_y_mm = float(start_mm.get("y", 0.0))
        start_z_mm = float(start_mm.get("z", 0.0))
        end_x_mm = float(end_mm.get("x", 0.0))
        end_y_mm = float(end_mm.get("y", 0.0))
        dx_mm = end_x_mm - start_x_mm
        dy_mm = end_y_mm - start_y_mm
        length_mm = math.hypot(dx_mm, dy_mm)
        if length_mm <= 0.0:
            raise ValueError("wall segment length must be positive")
        ref_direction = (dx_mm / length_mm, dy_mm / length_mm, 0.0)
        direction = "north"
        azimuth = math.degrees(math.atan2(dx_mm, dy_mm)) % 360.0
        if azimuth < 45.0 or azimuth >= 315.0:
            direction = "north"
        elif azimuth < 135.0:
            direction = "east"
        elif azimuth < 225.0:
            direction = "south"
        else:
            direction = "west"

        wall = ifcopenshell.api.run(
            "root.create_entity",
            model,
            ifc_class="IfcWallStandardCase",
            name=name,
        )
        wall.ObjectPlacement = _make_placement(
            model,
            storey,
            start_x_mm,
            start_y_mm,
            start_z_mm,
            direction,
            ref_direction=ref_direction,
        )
        wall.Representation = _create_wall_product_shape(
            model,
            length_m=_mm_to_model_units(model, length_mm, 3000.0),
            thickness_m=_mm_to_model_units(model, width_mm, 240.0),
            height_m=_mm_to_model_units(model, height_mm, 2500.0),
            y_min_m=float(template_y_bounds[0]),
            include_axis=_axis_representation_present(template_wall),
        )
        _copy_product_type_relation(model, template_product=template_wall, product=wall)
        _copy_material_association(model, template_product=template_wall, product=wall)
        _assign_to_storey(model, wall, storey)

        for connection in endpoint_connections or []:
            existing_wall = model.by_guid(connection["existing_wall_id"])
            if existing_wall is None:
                continue
            if connection.get("mode") == "existing_to_new":
                _create_path_connection(
                    model,
                    relating_element=existing_wall,
                    related_element=wall,
                    relating_connection_type=connection["existing_connection_type"],
                    related_connection_type=connection["new_connection_type"],
                )
            else:
                _create_path_connection(
                    model,
                    relating_element=wall,
                    related_element=existing_wall,
                    relating_connection_type=connection["new_connection_type"],
                    related_connection_type=connection["existing_connection_type"],
                )
        return wall
    except Exception as exc:
        logger.error(f"Template wall creation failed: {exc}")
        return None


def create_wall(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    *,
    length_mm: float = 3000.0,
    width_mm: float = 200.0,
    height_mm: float = 2400.0,
    x_mm: float = 0.0,
    y_mm: float = 0.0,
    z_mm: float = 0.0,
    direction: str = "north",
    ref_direction: tuple[float, float, float] | None = None,
    color: str | None = None,
    material_name: str | None = None,
) -> ifcopenshell.entity_instance | None:
    """신규 벽체 생성"""
    try:
        wall = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWall")
        wall.ObjectPlacement = _make_placement(
            model,
            storey,
            x_mm,
            y_mm,
            z_mm,
            direction,
            ref_direction=ref_direction,
        )
        wall.Representation, _ = _box_representation(
            model,
            _mm_to_model_units(model, length_mm, 3000.0),
            _mm_to_model_units(model, width_mm, 200.0),
            _mm_to_model_units(model, height_mm, 2400.0),
        )
        _apply_color_and_material(model, wall, color, material_name)
        _assign_to_storey(model, wall, storey)
        return wall
    except Exception as e:
        logger.error(f"Wall 생성 오류: {e}")
        return None


def create_slab(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    *,
    length_mm: float = 3000.0,
    width_mm: float = 3000.0,
    height_mm: float = 200.0,
    x_mm: float = 0.0,
    y_mm: float = 0.0,
    z_mm: float = 0.0,
    direction: str = "north",
    color: str | None = None,
    material_name: str | None = None,
) -> ifcopenshell.entity_instance | None:
    """신규 슬래브 생성"""
    try:
        slab = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcSlab")
        slab.ObjectPlacement = _make_placement(model, storey, x_mm, y_mm, z_mm, direction)
        slab.Representation, _ = _box_representation(
            model,
            _mm_to_model_units(model, length_mm, 3000.0),
            _mm_to_model_units(model, width_mm, 3000.0),
            _mm_to_model_units(model, height_mm, 200.0),
        )
        _apply_color_and_material(model, slab, color, material_name)
        _assign_to_storey(model, slab, storey)
        return slab
    except Exception as e:
        logger.error(f"Slab 생성 오류: {e}")
        return None


def create_roof(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    *,
    length_mm: float = 4000.0,
    width_mm: float = 3000.0,
    height_mm: float = 300.0,
    ridge_height_mm: float = 1200.0,
    x_mm: float = 0.0,
    y_mm: float = 0.0,
    z_mm: float = 0.0,
    direction: str = "north",
    shape_preset: str = "FLAT",
    color: str | None = None,
    material_name: str | None = None,
) -> ifcopenshell.entity_instance | None:
    """신규 지붕 생성 (평지붕/박공지붕)"""
    try:
        roof = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcRoof")
        roof.ObjectPlacement = _make_placement(model, storey, x_mm, y_mm, z_mm, direction)
        length = _mm_to_model_units(model, length_mm, 4000.0)
        width = _mm_to_model_units(model, width_mm, 3000.0)
        if shape_preset == "GABLED":
            roof.Representation = _gabled_roof_representation(
                model,
                length,
                width,
                _mm_to_model_units(model, ridge_height_mm, 1200.0),
            )
        else:
            roof.Representation, _ = _box_representation(
                model,
                length,
                width,
                _mm_to_model_units(model, height_mm, 300.0),
            )
        _apply_color_and_material(model, roof, color, material_name)
        _assign_to_storey(model, roof, storey)
        return roof
    except Exception as e:
        logger.error(f"Roof 생성 오류: {e}")
        return None


def create_stair_preset(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    *,
    length_mm: float = 3000.0,
    width_mm: float = 1000.0,
    height_mm: float = 1800.0,
    x_mm: float = 0.0,
    y_mm: float = 0.0,
    z_mm: float = 0.0,
    direction: str = "north",
    color: str | None = None,
    material_name: str | None = None,
    step_count: int | None = None,
    riser_height_mm: float | None = None,
    tread_depth_mm: float | None = None,
) -> ifcopenshell.entity_instance | None:
    """Create a straight stair preset with visible tread/riser geometry."""
    try:
        resolved_steps = _resolve_stair_step_count(
            length_mm=length_mm,
            height_mm=height_mm,
            step_count=step_count,
            riser_height_mm=riser_height_mm,
            tread_depth_mm=tread_depth_mm,
        )
        stair = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcStair")
        stair.ObjectPlacement = _make_placement(model, storey, x_mm, y_mm, z_mm, direction)
        length_m = _mm_to_model_units(model, length_mm, 3000.0)
        width_m = _mm_to_model_units(model, width_mm, 1000.0)
        height_m = _mm_to_model_units(model, height_mm, 1800.0)
        stair.Representation = _stair_preset_representation(
            model,
            length_m,
            width_m,
            height_m,
            resolved_steps,
        )

        flight = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcStairFlight")
        flight.Name = "Straight Stair Flight"
        flight.ObjectPlacement = model.create_entity(
            "IfcLocalPlacement",
            PlacementRelTo=stair.ObjectPlacement,
            RelativePlacement=_axis_placement_3d(model),
        )
        model.create_entity(
            "IfcRelAggregates",
            GlobalId=ifcopenshell.guid.new(),
            RelatingObject=stair,
            RelatedObjects=[flight],
        )

        _assign_stair_quantities(
            model,
            stair,
            step_count=resolved_steps,
            riser_height_mm=height_mm / resolved_steps,
            tread_depth_mm=length_mm / resolved_steps,
        )
        _apply_color_and_material(model, stair, color, material_name)
        _assign_to_storey(model, stair, storey)
        return stair
    except Exception as e:
        logger.error(f"Stair preset creation failed: {e}")
        return None


def create_generic_element(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    element_type: str,
    *,
    length_mm: float = 500.0,
    width_mm: float = 500.0,
    height_mm: float = 2400.0,
    x_mm: float = 0.0,
    y_mm: float = 0.0,
    z_mm: float = 0.0,
    direction: str = "north",
    color: str | None = None,
    material_name: str | None = None,
) -> ifcopenshell.entity_instance | None:
    """기타 부재 (Column, Beam, Door, Window) 생성"""
    try:
        element = ifcopenshell.api.run("root.create_entity", model, ifc_class=element_type)
        element.ObjectPlacement = _make_placement(model, storey, x_mm, y_mm, z_mm, direction)
        element.Representation, _ = _box_representation(
            model,
            _mm_to_model_units(model, length_mm, 500.0),
            _mm_to_model_units(model, width_mm, 500.0),
            _mm_to_model_units(model, height_mm, 2400.0),
        )
        _apply_color_and_material(model, element, color, material_name)
        _assign_to_storey(model, element, storey)
        return element
    except Exception as e:
        logger.error(f"{element_type} 생성 오류: {e}")
        return None


# ──────────────────────────────────────────────────────────────────────────────
# 3. 개구부 및 창호 로직 (Ticket 288 고도화 버전)
# ──────────────────────────────────────────────────────────────────────────────


def _get_wall_local_coords(model, host_wall, x_mm, y_mm, z_mm):
    """전역(또는 층) 좌표를 벽체의 로컬 좌표계로 변환"""
    scale = _get_model_unit_scale(model)
    w_loc, (rdx, rdy) = _placement_origin_and_x_axis(host_wall.ObjectPlacement)

    # 벽체 원점 기준 변위
    dx, dy = (x_mm / scale) - w_loc[0], (y_mm / scale) - w_loc[1]

    # 회전 행렬 적용 (벽체 로컬 U, V 좌표)
    u = dx * rdx + dy * rdy
    v = dx * (-rdy) + dy * rdx
    z = (z_mm / scale) - w_loc[2]

    # 벽체의 기하 중심점(cx, cy) 확인하여 오프셋 조정 (중심 기준 벽체 대응)
    ew_wall = True
    if host_wall.Representation:
        body = next(
            (
                r
                for r in host_wall.Representation.Representations
                if r.RepresentationIdentifier == "Body"
            ),
            None,
        )
        if body and body.Items:
            item = body.Items[0]
            while item.is_a("IfcBooleanResult"):
                item = item.FirstOperand
            if item.is_a("IfcExtrudedAreaSolid"):
                dims = _profile_xy_dims(item.SweptArea)
                center = _solid_profile_xy_center(item)
                if dims is not None:
                    ew_wall = dims[0] >= dims[1]
                if center is not None:
                    cx, cy = center
                    if ew_wall:
                        v = cy
                    else:
                        u = cx
    return u, v, z, ew_wall


def _apply_opening(model, host_wall, u, v, z, length, thickness, height, ew_wall):
    """IfcOpeningElement/IfcRelVoidsElement 관계로 벽체 개구부를 생성한다."""
    if not host_wall.Representation:
        return None
    body = next(
        (
            r
            for r in host_wall.Representation.Representations
            if r.RepresentationIdentifier == "Body"
        ),
        None,
    )
    if not body or not body.Items:
        return None

    opening = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcOpeningElement")
    margin = _mm_to_model_units(model, 20.0, 20.0)

    if ew_wall:
        box_l, box_t = length, thickness + margin
        loc_u, loc_v = u - length/2, v - box_t/2
    else:
        box_l, box_t = thickness + margin, length
        loc_u, loc_v = u - box_l/2, v - length/2

    opening.ObjectPlacement = model.create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=host_wall.ObjectPlacement,
        RelativePlacement=_axis_placement_3d(model, location=(loc_u, loc_v, z)),
    )

    opening.Representation, _ = _box_representation(
        model, box_l, box_t, height, center_origin=False
    )
    ifcopenshell.api.run("feature.add_feature", model, feature=opening, element=host_wall)
    return opening


def create_door_with_opening(
    model, storey, *, length_mm=900, width_mm=200, height_mm=2100,
    x_mm=0, y_mm=0, z_mm=0, direction="north", color=None, material_name=None,
    host_wall=None, sill_height_mm=0,
):
    try:
        if not host_wall:
            host_wall = find_host_wall(model, None, x_mm, y_mm, z_mm)
        if not host_wall:
            logger.error("Door 생성 실패: host wall을 찾을 수 없습니다.")
            return None

        u, v, z, ew_wall = _get_wall_local_coords(
            model, host_wall, x_mm, y_mm, z_mm + sill_height_mm
        )
        opening_height = _mm_to_model_units(model, height_mm, 2100)
        z = _clamp_opening_z_to_wall(host_wall, z, opening_height)
        opening = _apply_opening(
            model, host_wall, u, v, z,
            _mm_to_model_units(model, length_mm, 900),
            _mm_to_model_units(model, width_mm, 200),
            opening_height,
            ew_wall,
        )
        if opening is None:
            logger.error("Door 생성 실패: opening을 생성할 수 없습니다.")
            return None
        placement = model.create_entity(
            "IfcLocalPlacement",
            PlacementRelTo=opening.ObjectPlacement,
            RelativePlacement=_axis_placement_3d(model, location=(0.0, 0.0, 0.0)),
        )

        door = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcDoor")
        # assign_container can normalize placement, so set opening-relative placement last.
        _assign_to_storey(model, door, storey)
        door.ObjectPlacement = placement
        dt = _mm_to_model_units(model, 40, 40)
        door.OverallWidth = _mm_to_model_units(model, length_mm, 900)
        door.OverallHeight = _mm_to_model_units(model, height_mm, 2100)
        bx, by = (
            (door.OverallWidth, dt)
            if ew_wall
            else (dt, door.OverallWidth)
        )
        door.Representation, _ = _box_representation(
            model, bx, by, door.OverallHeight, center_origin=False
        )
        _apply_color_and_material(model, door, color or "#8B4513", material_name)
        if opening:
            model.create_entity(
                "IfcRelFillsElement",
                GlobalId=ifcopenshell.guid.new(),
                RelatingOpeningElement=opening,
                RelatedBuildingElement=door,
            )
        set_element_properties(model, door, length_mm, 40, height_mm)
        return door
    except Exception as e:
        logger.error(f"Door 생성 실패: {e}")
        return None


def create_door_with_template_reuse(
    model,
    storey,
    *,
    length_mm=900,
    width_mm=200,
    height_mm=2100,
    x_mm=0,
    y_mm=0,
    z_mm=0,
    direction="north",
    color=None,
    material_name=None,
    host_wall=None,
    sill_height_mm=0,
):
    del direction, color, material_name
    created_entities: list[ifcopenshell.entity_instance] = []
    try:
        if not host_wall:
            host_wall = find_host_wall(model, None, x_mm, y_mm, z_mm)
        if not host_wall:
            logger.error("Door creation failed: host wall was not found.")
            return None

        u, v, z, ew_wall = _get_wall_local_coords(
            model, host_wall, x_mm, y_mm, z_mm + sill_height_mm
        )
        del ew_wall

        template_pair = _find_eligible_template_door_pair(
            model,
            storey_id=getattr(storey, "GlobalId", None),
            target_width_m=_mm_to_model_units(model, length_mm, 900),
            target_height_m=_mm_to_model_units(model, height_mm, 2100),
            host_wall=host_wall,
            target_u=u,
        )
        if template_pair is None:
            logger.error("Door creation failed: reusable door-opening template pair was not found.")
            return None
        template_door, template_opening = template_pair

        opening_signature = _opening_signature(template_opening)
        if opening_signature is None:
            logger.error("Door creation failed: template opening signature was missing.")
            return None
        target_width = _mm_to_model_units(model, length_mm, 900)
        target_height = _mm_to_model_units(model, height_mm, 2100)

        host_thickness = _wall_thickness(host_wall)
        if host_thickness is None:
            logger.error("Door creation failed: host wall thickness was unavailable.")
            return None
        host_y_bounds = _wall_y_bounds(host_wall)
        if host_y_bounds is None:
            logger.error("Door creation failed: host wall local Y bounds were unavailable.")
            return None

        door_loc = _template_door_relative_location(template_door, template_opening)
        template_opening_location = _opening_location(template_opening) or (0.0, 0.0, 0.0)
        template_opening_relative = getattr(
            getattr(template_opening, "ObjectPlacement", None),
            "RelativePlacement",
            None,
        )
        template_door_relative = getattr(
            getattr(template_door, "ObjectPlacement", None),
            "RelativePlacement",
            None,
        )

        opening = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcOpeningElement")
        created_entities.append(opening)
        opening.Name = f"Generated Opening {opening.GlobalId[:8]}"
        opening.ObjectPlacement = model.create_entity(
            "IfcLocalPlacement",
            PlacementRelTo=host_wall.ObjectPlacement,
            RelativePlacement=_axis_placement_like(
                model,
                template_opening_relative,
                location=(
                    u,
                    float(host_y_bounds[0]),
                    float(template_opening_location[2]),
                ),
            ),
        )
        created_entities.append(opening.ObjectPlacement)
        opening.Representation = _clone_opening_representation_with_depth(
            model,
            template_opening=template_opening,
            new_depth=host_thickness,
            new_width=target_width,
            new_height=target_height,
        )
        if opening.Representation is None:
            logger.error("Door creation failed: template opening representation was missing.")
            return None
        ifcopenshell.api.run("feature.add_feature", model, feature=opening, element=host_wall)

        placement = model.create_entity(
            "IfcLocalPlacement",
            PlacementRelTo=opening.ObjectPlacement,
            RelativePlacement=_axis_placement_like(
                model,
                template_door_relative,
                location=door_loc,
            ),
        )
        created_entities.append(placement)

        door = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcDoor")
        created_entities.append(door)
        _assign_to_storey(model, door, storey)
        door.ObjectPlacement = placement
        door.Name = f"Generated Door {door.GlobalId[:8]}"
        door.OverallWidth = target_width
        door.OverallHeight = target_height
        door.Representation = _clone_representation_or_box(
            model,
            template_product=template_door,
            fallback_length_m=door.OverallWidth,
            fallback_width_m=host_thickness,
            fallback_height_m=door.OverallHeight,
        )
        _resize_box_like_representation(
            door.Representation,
            length=door.OverallWidth,
            width=host_thickness,
            height=door.OverallHeight,
        )
        _copy_product_type_relation(
            model,
            template_product=template_door,
            product=door,
        )
        _copy_material_associations_from_template(
            model,
            template_product=template_door,
            product=door,
        )
        fill_rel = model.create_entity(
            "IfcRelFillsElement",
            GlobalId=ifcopenshell.guid.new(),
            RelatingOpeningElement=opening,
            RelatedBuildingElement=door,
        )
        created_entities.append(fill_rel)
        set_element_properties(
            model,
            door,
            door.OverallWidth * 1000.0,
            width_mm,
            door.OverallHeight * 1000.0,
        )
        return door
    except Exception as e:
        for entity in reversed(created_entities):
            try:
                model.remove(entity)
            except Exception:
                pass
        logger.error(f"Door creation failed: {e}")
        return None


def create_window_with_opening(
    model, storey, *, length_mm=1200, width_mm=200, height_mm=1200,
    x_mm=0, y_mm=0, z_mm=0, direction="north", color=None, material_name=None,
    host_wall=None, sill_height_mm=900, window_style=None,
):
    try:
        if not host_wall:
            host_wall = find_host_wall(model, None, x_mm, y_mm, z_mm)
        if not host_wall:
            logger.error("Window 생성 실패: host wall을 찾을 수 없습니다.")
            return None

        u, v, z, ew_wall = _get_wall_local_coords(
            model, host_wall, x_mm, y_mm, z_mm + sill_height_mm
        )
        opening_height = _mm_to_model_units(model, height_mm, 1200)
        opening_length = _mm_to_model_units(model, length_mm, 1200)
        opening_thickness = _mm_to_model_units(model, width_mm, 200)
        z = _clamp_opening_z_to_wall(host_wall, z, opening_height)
        z = _clamp_window_z_below_overhead_slabs(
            model,
            host_wall,
            z,
            opening_height,
            opening_u=u,
            opening_v=v,
            opening_length=opening_length,
            opening_thickness=opening_thickness,
            ew_wall=ew_wall,
        )
        opening = _apply_opening(
            model, host_wall, u, v, z,
            opening_length,
            opening_thickness,
            opening_height,
            ew_wall,
        )
        if opening is None:
            logger.error("Window 생성 실패: opening을 생성할 수 없습니다.")
            return None
        wt = _mm_to_model_units(model, 100.0, 100.0)
        margin = _mm_to_model_units(model, 20.0, 20.0)
        off_v = (margin + (_mm_to_model_units(model, width_mm, 200) - wt)) / 2.0
        window_loc = (0.0, off_v, 0.0) if ew_wall else (off_v, 0.0, 0.0)
        placement = model.create_entity(
            "IfcLocalPlacement",
            PlacementRelTo=opening.ObjectPlacement,
            RelativePlacement=_axis_placement_3d(model, location=window_loc),
        )

        window = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWindow")
        # assign_container can normalize placement, so set opening-relative placement last.
        _assign_to_storey(model, window, storey)
        window.ObjectPlacement = placement
        wt = _mm_to_model_units(model, 100, 100)
        window_length = _mm_to_model_units(model, length_mm, 1200)
        window_height = _mm_to_model_units(model, height_mm, 1200)
        window.OverallWidth = window_length
        window.OverallHeight = window_height
        bx, by = (
            (window_length, wt)
            if ew_wall
            else (wt, window_length)
        )
        if color or material_name:
            window.Representation, _ = _box_representation(
                model, bx, by, window_height, center_origin=False
            )
            _apply_color_and_material(model, window, color, material_name)
        else:
            window.Representation = _window_frame_representation(
                model,
                bx,
                by,
                window_height,
                include_mullion=window_style != "picture",
            )
        if opening:
            model.create_entity(
                "IfcRelFillsElement",
                GlobalId=ifcopenshell.guid.new(),
                RelatingOpeningElement=opening,
                RelatedBuildingElement=window,
            )
        set_element_properties(model, window, length_mm, 100, height_mm)
        return window
    except Exception as e:
        logger.error(f"Window 생성 실패: {e}")
        return None


def create_window_with_template_reuse(
    model,
    storey,
    *,
    length_mm=1200,
    width_mm=200,
    height_mm=1200,
    x_mm=0,
    y_mm=0,
    z_mm=0,
    direction="north",
    color=None,
    material_name=None,
    host_wall=None,
    sill_height_mm=900,
    window_style=None,
):
    del direction, color, material_name
    created_entities: list[ifcopenshell.entity_instance] = []
    try:
        if not host_wall:
            host_wall = find_host_wall(model, None, x_mm, y_mm, z_mm)
        if not host_wall:
            logger.error("Window creation failed: host wall was not found.")
            return None

        u, v, z, ew_wall = _get_wall_local_coords(
            model, host_wall, x_mm, y_mm, z_mm + sill_height_mm
        )
        del v, ew_wall

        template_pair = _find_eligible_template_window_pair(
            model,
            storey_id=getattr(storey, "GlobalId", None),
            target_width_m=_mm_to_model_units(model, length_mm, 1200),
            target_height_m=_mm_to_model_units(model, height_mm, 1200),
            host_wall=host_wall,
            target_u=u,
        )
        if template_pair is None:
            logger.error(
                "Window creation failed: reusable window-opening template pair was not found."
            )
            return None
        template_window, template_opening = template_pair

        opening_signature = _opening_signature(template_opening)
        if opening_signature is None:
            logger.error("Window creation failed: template opening signature was missing.")
            return None
        target_width = _mm_to_model_units(model, length_mm, 1200)
        target_height = _mm_to_model_units(model, height_mm, 1200)

        host_thickness = _wall_thickness(host_wall)
        if host_thickness is None:
            logger.error("Window creation failed: host wall thickness was unavailable.")
            return None

        window_loc = _template_window_relative_location(template_window, template_opening)
        template_opening_location = _opening_location(template_opening) or (0.0, 0.0, 0.0)
        template_opening_relative = getattr(
            getattr(template_opening, "ObjectPlacement", None),
            "RelativePlacement",
            None,
        )
        template_window_relative = getattr(
            getattr(template_window, "ObjectPlacement", None),
            "RelativePlacement",
            None,
        )

        opening = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcOpeningElement")
        created_entities.append(opening)
        opening.Name = f"Generated Opening {opening.GlobalId[:8]}"
        opening.ObjectPlacement = model.create_entity(
            "IfcLocalPlacement",
            PlacementRelTo=host_wall.ObjectPlacement,
            RelativePlacement=_axis_placement_like(
                model,
                template_opening_relative,
                location=(
                    u,
                    float(template_opening_location[1]),
                    z,
                ),
            ),
        )
        created_entities.append(opening.ObjectPlacement)
        opening.Representation = _clone_opening_representation_with_depth(
            model,
            template_opening=template_opening,
            new_depth=host_thickness,
            new_width=target_width,
            new_height=target_height,
        )
        if opening.Representation is None:
            logger.error("Window creation failed: template opening representation was missing.")
            return None
        ifcopenshell.api.run("feature.add_feature", model, feature=opening, element=host_wall)

        placement = model.create_entity(
            "IfcLocalPlacement",
            PlacementRelTo=opening.ObjectPlacement,
            RelativePlacement=_axis_placement_like(
                model,
                template_window_relative,
                location=window_loc,
            ),
        )
        created_entities.append(placement)

        window = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWindow")
        created_entities.append(window)
        _assign_to_storey(model, window, storey)
        window.ObjectPlacement = placement
        window.Name = f"Generated Window {window.GlobalId[:8]}"
        window.OverallWidth = target_width
        window.OverallHeight = target_height
        window.Representation = _clone_representation_or_box(
            model,
            template_product=template_window,
            fallback_length_m=window.OverallWidth,
            fallback_width_m=host_thickness,
            fallback_height_m=window.OverallHeight,
        )
        did_resize_representation = _resize_box_like_representation(
            window.Representation,
            length=window.OverallWidth,
            width=host_thickness,
            height=window.OverallHeight,
        )
        if not did_resize_representation:
            window.Representation = _window_frame_representation(
                model,
                window.OverallWidth,
                host_thickness,
                window.OverallHeight,
                include_mullion=window_style != "picture",
            )
        _copy_product_type_relation(
            model,
            template_product=template_window,
            product=window,
        )
        if did_resize_representation:
            _copy_material_associations_from_template(
                model,
                template_product=template_window,
                product=window,
            )
        fill_rel = model.create_entity(
            "IfcRelFillsElement",
            GlobalId=ifcopenshell.guid.new(),
            RelatingOpeningElement=opening,
            RelatedBuildingElement=window,
        )
        created_entities.append(fill_rel)
        set_element_properties(
            model,
            window,
            window.OverallWidth * 1000.0,
            width_mm,
            window.OverallHeight * 1000.0,
        )
        return window
    except Exception as e:
        for entity in reversed(created_entities):
            try:
                model.remove(entity)
            except Exception:
                pass
        logger.error(f"Window creation failed: {e}")
        return None


def set_element_properties(model, element, length_mm=None, width_mm=None, height_mm=None):
    props = []
    for n, v in [("Length", length_mm), ("Width", width_mm), ("Height", height_mm)]:
        if v is not None:
            props.append(
                model.create_entity(
                    "IfcPropertySingleValue",
                    Name=n,
                    NominalValue=model.create_entity("IfcLengthMeasure", float(v)),
                )
            )
    if props:
        pset = model.create_entity(
            "IfcPropertySet",
            GlobalId=ifcopenshell.guid.new(),
            Name="Pset_Dimensions",
            HasProperties=props,
        )
        model.create_entity(
            "IfcRelDefinesByProperties",
            GlobalId=ifcopenshell.guid.new(),
            RelatingPropertyDefinition=pset,
            RelatedObjects=[element],
        )
