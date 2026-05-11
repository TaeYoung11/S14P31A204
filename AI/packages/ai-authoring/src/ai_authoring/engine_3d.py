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
        coords = [tuple(getattr(point, "Coordinates", ()) or ()) for point in points]
        coords = [point for point in coords if len(point) >= 2]
        if not coords:
            return None
        xs = [float(point[0]) for point in coords]
        ys = [float(point[1]) for point in coords]
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
        coords = [tuple(getattr(point, "Coordinates", ()) or ()) for point in points]
        coords = [point for point in coords if len(point) >= 2]
        if not coords:
            return None
        xs = [float(point[0]) for point in coords]
        ys = [float(point[1]) for point in coords]
        return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0)
    return None


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
            if item.is_a("IfcBooleanClippingResult"):
                first_operand = getattr(item, "FirstOperand", None)
                if first_operand is not None and first_operand.is_a("IfcExtrudedAreaSolid"):
                    return first_operand
    return None


def _is_supported_wall_for_template_door(
    wall: ifcopenshell.entity_instance | None,
) -> bool:
    return bool(
        wall is not None
        and wall.is_a("IfcWallStandardCase")
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
        return ifcopenshell.util.element.copy_deep(model, template_product.Representation)
    representation, _ = _box_representation(
        model,
        fallback_length_m,
        fallback_width_m,
        fallback_height_m,
        center_origin=False,
    )
    return representation




def _clone_opening_representation_with_depth(
    model: ifcopenshell.file,
    *,
    template_opening: ifcopenshell.entity_instance,
    new_depth: float,
):
    representation = getattr(template_opening, "Representation", None)
    if representation is None:
        return None
    cloned = ifcopenshell.util.element.copy_deep(model, representation)
    for rep in getattr(cloned, "Representations", []) or []:
        for item in getattr(rep, "Items", []) or []:
            if item.is_a("IfcExtrudedAreaSolid"):
                item.Depth = new_depth
            elif item.is_a("IfcBoundingBox"):
                dims = {
                    "XDim": float(getattr(item, "XDim", 0.0) or 0.0),
                    "YDim": float(getattr(item, "YDim", 0.0) or 0.0),
                }
                depth_axis = min(dims, key=dims.get)
                setattr(item, depth_axis, new_depth)
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
        if abs(host_thickness - template_thickness) > _mm_to_model_units(model, 30.0, 30.0):
            continue
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
        candidate = (orientation_penalty, score, template_door, template_opening)
        if best is None or candidate[:2] < best[:2]:
            best = candidate

    if best is None:
        return None
    return (best[2], best[3])


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
                        model.remove(rel_void)
                    model.remove(opening)
                model.remove(rel_fill)

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


def modify_thickness(
    element: ifcopenshell.entity_instance, width_mm: dict[str, Any], scale: float = 1.0
) -> bool:
    mode_relative = width_mm.get("mode") == "RELATIVE"
    val_mm = width_mm.get("value", 0.0)

    def calc_new_val(current_native):
        current_mm = current_native * scale
        new_mm = current_mm + val_mm if mode_relative else val_mm
        return new_mm / scale

    try:
        for rel in getattr(element, "HasAssociations", []):
            if rel.is_a("IfcRelAssociatesMaterial"):
                mat = rel.RelatingMaterial
                if mat and mat.is_a("IfcMaterialLayerSetUsage"):
                    layer_set = mat.ForLayerSet
                    if layer_set and layer_set.MaterialLayers:
                        layer = layer_set.MaterialLayers[0]
                        layer.LayerThickness = float(calc_new_val(layer.LayerThickness))
                        return True
        return False
    except Exception as e:
        logger.error(f"두께 수정 오류: {e}")
        return False


def modify_height(
    element: ifcopenshell.entity_instance, height_mm: dict[str, Any], scale: float = 1.0
) -> bool:
    try:
        mode_relative = height_mm.get("mode") == "RELATIVE"
        val_mm = height_mm.get("value", 0.0)
        if element.Representation:
            for rep in element.Representation.Representations:
                if rep.RepresentationIdentifier == "Body":
                    for item in rep.Items:
                        if item.is_a("IfcExtrudedAreaSolid"):
                            old_h = float(item.Depth)
                            new_h = (old_h * scale + val_mm) if mode_relative else val_mm
                            item.Depth = float(new_h / scale)
                            return True
        return False
    except Exception as e:
        logger.error(f"높이 수정 오류: {e}")
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
            (pos_mm.get("x") or 0.0) / scale,
            (pos_mm.get("y") or 0.0) / scale,
            (pos_mm.get("z") or 0.0) / scale,
        )
        coords = list(location.Coordinates)
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
        location.Coordinates = tuple(coords)
        return True
    except Exception as e:
        logger.error(f"위치 수정 오류: {e}")
        return False


def modify_rotation(
    model: ifcopenshell.file, element: ifcopenshell.entity_instance, rotation_deg: float
) -> bool:
    try:
        placement = element.ObjectPlacement
        if not placement or not placement.is_a("IfcLocalPlacement"):
            return False
        rel_p = placement.RelativePlacement
        if not rel_p:
            return False
        rad = math.radians(rotation_deg)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        ref_dir = rel_p.RefDirection
        if not ref_dir:
            ref_dir = model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0))
            rel_p.RefDirection = ref_dir
        dr = list(ref_dir.DirectionRatios)
        while len(dr) < 2:
            dr.append(0.0)
        new_x = dr[0] * cos_a - dr[1] * sin_a
        new_y = dr[0] * sin_a + dr[1] * cos_a
        ref_dir.DirectionRatios = (new_x, new_y, dr[2] if len(dr) > 2 else 0.0)
        return True
    except Exception as e:
        logger.error(f"회전 수정 오류: {e}")
        return False


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
        return tuple(int(hex_val[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
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


def _create_surface_style_assignment(model: ifcopenshell.file, color_value: str):
    r, g, b = _color_to_rgb(color_value)
    color = model.create_entity("IfcColourRgb", Name=color_value, Red=r, Green=g, Blue=b)
    rendering = model.create_entity("IfcSurfaceStyleRendering", SurfaceColour=color)
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
            ref_direction=_DIRECTION_REF_DIRECTIONS.get(
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
    color: str | None = None,
    material_name: str | None = None,
) -> ifcopenshell.entity_instance | None:
    """신규 벽체 생성"""
    try:
        wall = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWall")
        wall.ObjectPlacement = _make_placement(model, storey, x_mm, y_mm, z_mm, direction)
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
                center = _profile_xy_center(item.SweptArea)
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
    """벽체에 개구부를 생성하고 차집합 연산(Boolean) 수행 (잔상 방지 로직 포함)"""
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
    _, tool_solid = _box_representation(
        model, box_l, box_t, height, loc=(loc_u, loc_v, z), center_origin=False
    )
    ifcopenshell.api.run("feature.add_feature", model, feature=opening, element=host_wall)

    current_shape = body.Items[0]
    boolean_res = model.create_entity(
        "IfcBooleanResult",
        Operator="DIFFERENCE",
        FirstOperand=current_shape,
        SecondOperand=tool_solid,
    )
    body.Items = [boolean_res]
    body.RepresentationType = "CSG"
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
        opening = _apply_opening(
            model, host_wall, u, v, z,
            _mm_to_model_units(model, length_mm, 900),
            _mm_to_model_units(model, width_mm, 200),
            _mm_to_model_units(model, height_mm, 2100),
            ew_wall,
        )
        if opening is None:
            logger.error("Door 생성 실패: opening을 생성할 수 없습니다.")
            return None
        dt = _mm_to_model_units(model, 40.0, 40.0)
        margin = _mm_to_model_units(model, 20.0, 20.0)
        off_t = (margin + (_mm_to_model_units(model, width_mm, 200) - dt)) / 2.0
        door_loc = (0.0, off_t, 0.0) if ew_wall else (off_t, 0.0, 0.0)
        placement = model.create_entity(
            "IfcLocalPlacement",
            PlacementRelTo=opening.ObjectPlacement,
            RelativePlacement=_axis_placement_3d(model, location=door_loc),
        )

        door = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcDoor")
        # assign_container can normalize placement, so set opening-relative placement last.
        _assign_to_storey(model, door, storey)
        door.ObjectPlacement = placement
        dt = _mm_to_model_units(model, 40, 40)
        bx, by = (
            (_mm_to_model_units(model, length_mm, 900), dt)
            if ew_wall
            else (dt, _mm_to_model_units(model, length_mm, 900))
        )
        door.Representation, _ = _box_representation(
            model, bx, by, _mm_to_model_units(model, height_mm, 2100), center_origin=False
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
        opening_width, opening_height, _ = opening_signature

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
        door.OverallWidth = float(getattr(template_door, "OverallWidth", 0.0) or opening_width)
        door.OverallHeight = float(
            getattr(template_door, "OverallHeight", 0.0) or opening_height
        )
        door.Representation = _clone_representation_or_box(
            model,
            template_product=template_door,
            fallback_length_m=door.OverallWidth,
            fallback_width_m=host_thickness,
            fallback_height_m=door.OverallHeight,
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
    host_wall=None, sill_height_mm=900,
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
        opening = _apply_opening(
            model, host_wall, u, v, z,
            _mm_to_model_units(model, length_mm, 1200),
            _mm_to_model_units(model, width_mm, 200),
            _mm_to_model_units(model, height_mm, 1200),
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
        bx, by = (
            (_mm_to_model_units(model, length_mm, 1200), wt)
            if ew_wall
            else (wt, _mm_to_model_units(model, length_mm, 1200))
        )
        window.Representation, _ = _box_representation(
            model, bx, by, _mm_to_model_units(model, height_mm, 1200), center_origin=False
        )
        _apply_color_and_material(model, window, color or "#AADDFF", material_name)
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
