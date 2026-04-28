"""
3D Engine Module (Low-level)
===========================
IFC 부재의 기하 정보 및 속성을 수정하거나 신규 부재를 생성하는 저수준 연산 엔진입니다.
Phase 3: 생성(CREATE) 기능 및 색상/재질 적용 로직 포함.
"""

import logging
import math
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.guid
from typing import Any

logger = logging.getLogger("ai_authoring.engine_3d")

# ──────────────────────────────────────────────────────────────────────────────
# 1. 수정 및 삭제 (MODIFY / DELETE)
# ──────────────────────────────────────────────────────────────────────────────


def delete_element(
    model: ifcopenshell.file, element: ifcopenshell.entity_instance, etype_str: str = "IfcProduct"
) -> bool:
    """IFC 요소를 관계 엔티티까지 깔끔하게 정리하여 삭제한다."""
    gid_short = element.GlobalId[:8] if element.GlobalId else "?"
    try:
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
        logger.error(f"[{gid_short}] 요소 삭제 실패: {exc}")
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
        new_name = mat_change.get("name", "Unknown")
        for rel in list(getattr(element, "HasAssociations", [])):
            if rel.is_a("IfcRelAssociatesMaterial"):
                remaining = [o for o in rel.RelatedObjects if o != element]
                if remaining:
                    rel.RelatedObjects = remaining
                else:
                    model.remove(rel)
                break
        new_mat = model.create_entity("IfcMaterial", Name=new_name)
        model.create_entity(
            "IfcRelAssociatesMaterial",
            GlobalId=ifcopenshell.guid.new(),
            RelatingMaterial=new_mat,
            RelatedObjects=[element],
        )
        return True
    except Exception as e:
        logger.error(f"재질 수정 오류: {e}")
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
                        "north": (0.0, 1.0), "south": (0.0, -1.0),
                        "east": (1.0, 0.0), "west": (-1.0, 0.0),
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

_DIRECTION_VECTORS = {
    "north": ((0.0, 1.0, 0.0), (1.0, 0.0, 0.0)),
    "south": ((0.0, -1.0, 0.0), (-1.0, 0.0, 0.0)),
    "east": ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
    "west": ((-1.0, 0.0, 0.0), (0.0, -1.0, 0.0)),
}


def _apply_color_and_material(
    model: ifcopenshell.file,
    element: ifcopenshell.entity_instance,
    color_hex: str | None = None,
    mat_name: str | None = None,
):
    """부재에 색상(RGB) 및 재질 정보를 부여한다."""
    try:
        if color_hex:
            hex_val = color_hex.lstrip("#")
            if len(hex_val) == 6:
                r, g, b = [int(hex_val[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
            else:
                r, g, b = (0.8, 0.8, 0.8)

            color = model.create_entity("IfcColourRgb", Name=color_hex, Red=r, Green=g, Blue=b)
            rendering = model.create_entity("IfcSurfaceStyleRendering", SurfaceColour=color)
            style = model.create_entity(
                "IfcSurfaceStyle", Name=f"Style_{color_hex}", Side="BOTH", Styles=[rendering]
            )
            assignment = model.create_entity("IfcPresentationStyleAssignment", Styles=[style])

            # Representation의 첫 번째 아이템에 스타일 할당
            if element.Representation and element.Representation.Representations:
                rep = element.Representation.Representations[0]
                if rep.Items:
                    model.create_entity(
                        "IfcStyledItem", Item=rep.Items[0], Styles=[assignment]
                    )

        if mat_name:
            material = model.create_entity("IfcMaterial", Name=mat_name)
            model.create_entity(
                "IfcRelAssociatesMaterial",
                GlobalId=ifcopenshell.guid.new(),
                RelatingMaterial=material,
                RelatedObjects=[element],
            )
    except Exception as e:
        logger.warning(f"색상/재질 적용 중 오류 (무시 가능): {e}")


def create_wall(
    model: ifcopenshell.file, storey: ifcopenshell.entity_instance, ci: dict[str, Any]
) -> ifcopenshell.entity_instance | None:
    """신규 벽체 생성"""
    try:
        wall = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWall")

        # 위치 설정
        sp = ci.get("start_point") or {"x": 0.0, "y": 0.0, "z": 0.0}
        ifc_origin = model.create_entity(
            "IfcCartesianPoint",
            Coordinates=(
                float(sp.get("x", 0)) / 1000.0,
                float(sp.get("y", 0)) / 1000.0,
                float(sp.get("z", 0)) / 1000.0,
            ),
        )
        dir_key = ci.get("direction", "north").lower()
        axis, ref_dir = _DIRECTION_VECTORS.get(dir_key, _DIRECTION_VECTORS["north"])

        ifc_axis = model.create_entity("IfcDirection", DirectionRatios=axis)
        ifc_ref = model.create_entity("IfcDirection", DirectionRatios=ref_dir)
        axis2 = model.create_entity(
            "IfcAxis2Placement3D", Location=ifc_origin, Axis=ifc_axis, RefDirection=ifc_ref
        )
        wall.ObjectPlacement = model.create_entity(
            "IfcLocalPlacement", PlacementRelTo=storey.ObjectPlacement, RelativePlacement=axis2
        )

        # 색상/재질
        _apply_color_and_material(
            model,
            wall,
            ci.get("color"),
            ci.get("material", {}).get("name") if ci.get("material") else None,
        )

        ifcopenshell.api.run(
            "spatial.assign_container", model, product=wall, relating_structure=storey
        )
        return wall
    except Exception as e:
        logger.error(f"Wall 생성 오류: {e}")
        return None


def create_slab(
    model: ifcopenshell.file, storey: ifcopenshell.entity_instance, ci: dict[str, Any]
) -> ifcopenshell.entity_instance | None:
    """신규 슬래브 생성"""
    try:
        slab = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcSlab")
        _apply_color_and_material(
            model,
            slab,
            ci.get("color"),
            ci.get("material", {}).get("name") if ci.get("material") else None,
        )
        ifcopenshell.api.run(
            "spatial.assign_container", model, product=slab, relating_structure=storey
        )
        return slab
    except Exception as e:
        logger.error(f"Slab 생성 오류: {e}")
        return None


def create_roof(
    model: ifcopenshell.file, storey: ifcopenshell.entity_instance, ci: dict[str, Any]
) -> ifcopenshell.entity_instance | None:
    """신규 지붕 생성 (평지붕/박공지붕)"""
    try:
        roof = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcRoof")
        # shape_preset 로직은 향후 상세 지오메트리 구현 시 확장
        _apply_color_and_material(
            model,
            roof,
            ci.get("color"),
            ci.get("material", {}).get("name") if ci.get("material") else None,
        )
        ifcopenshell.api.run(
            "spatial.assign_container", model, product=roof, relating_structure=storey
        )
        return roof
    except Exception as e:
        logger.error(f"Roof 생성 오류: {e}")
        return None


def create_generic_element(
    model: ifcopenshell.file,
    storey: ifcopenshell.entity_instance,
    element_type: str,
    ci: dict[str, Any],
) -> ifcopenshell.entity_instance | None:
    """기타 부재 (Column, Beam, Door, Window) 생성"""
    try:
        element = ifcopenshell.api.run("root.create_entity", model, ifc_class=element_type)
        _apply_color_and_material(
            model,
            element,
            ci.get("color"),
            ci.get("material", {}).get("name") if ci.get("material") else None,
        )
        ifcopenshell.api.run(
            "spatial.assign_container", model, product=element, relating_structure=storey
        )
        return element
    except Exception as e:
        logger.error(f"{element_type} 생성 오류: {e}")
        return None