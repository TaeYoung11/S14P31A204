"""
3D Engine Module (Low-level)
===========================
IFC 부재의 기하 정보(두께, 높이, 위치, 회전 등)를 직접 수정하거나 
신규 부재를 생성하는 저수준 연산 엔진입니다.
"""
import logging
import math
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.guid
from typing import Dict, Any, List, Optional

logger = logging.getLogger("ai_authoring.engine_3d")

def delete_element(model: ifcopenshell.file, element: ifcopenshell.entity_instance, etype_str: str = "IfcProduct") -> bool:
    """IFC 요소를 관계 엔티티까지 깔끔하게 정리하여 삭제한다."""
    gid_short = element.GlobalId[:8] if element.GlobalId else "?"
    try:
        for rel in list(getattr(element, "ContainedInStructure", [])):
            if rel.is_a("IfcRelContainedInSpatialStructure"):
                remaining = [e for e in rel.RelatedElements if e != element]
                if remaining: rel.RelatedElements = remaining
                else: model.remove(rel)
        
        for rel in list(getattr(element, "HasAssociations", [])):
            if not rel.is_a("IfcRelAssociatesMaterial"): continue
            remaining = [o for o in rel.RelatedObjects if o != element]
            if remaining: rel.RelatedObjects = remaining
            else: model.remove(rel)

        for rel in list(getattr(element, "IsDefinedBy", [])):
            if rel.is_a("IfcRelDefinesByProperties") or rel.is_a("IfcRelDefinesByType"):
                remaining = [o for o in rel.RelatedObjects if o != element]
                if remaining: rel.RelatedObjects = remaining
                else: model.remove(rel)

        # 3-1. 벽일 경우 포함된 문/창문/개구부 동반 삭제
        if element.is_a("IfcElement"):
            for rel_void in list(getattr(element, "HasOpenings", [])):
                opening = rel_void.RelatedOpeningElement
                if opening:
                    # 개구부를 채우고 있는 문/창문 찾기
                    for rel_fill in list(getattr(opening, "HasFillings", [])):
                        filling_el = rel_fill.RelatedFillingElement
                        if filling_el:
                            logger.info(f"[{filling_el.GlobalId[:8]}] 종속 요소 삭제 (Door/Window)")
                            model.remove(filling_el)
                        model.remove(rel_fill)
                    
                    logger.info(f"[{opening.GlobalId[:8]}] 개구부 삭제")
                    model.remove(opening)
                model.remove(rel_void)

        # 4. 요소 본체 삭제
        model.remove(element)
        logger.info(f"[{gid_short}] 요소 삭제 완료 ({etype_str})")
        return True
    except Exception as exc:
        logger.error(f"[{gid_short}] 요소 삭제 실패: {exc}", exc_info=True)
        return False

def modify_thickness(element: ifcopenshell.entity_instance, width_mm: Dict[str, Any], scale: float = 1.0) -> bool:
    mode_relative = (width_mm.get("mode") == "RELATIVE")
    val_mm = width_mm.get("value", 0.0)
    def calc_new_val(current_native):
        current_mm = current_native * scale
        new_mm = current_mm + val_mm if mode_relative else val_mm
        return new_mm / scale

    try:
        # 1. 재질 레이어 세트 (IfcMaterialLayerSetUsage)
        for rel in getattr(element, "HasAssociations", []):
            if rel.is_a("IfcRelAssociatesMaterial"):
                mat = rel.RelatingMaterial
                if mat and mat.is_a("IfcMaterialLayerSetUsage"):
                    layer_set = mat.ForLayerSet
                    if layer_set and layer_set.MaterialLayers:
                        layer = layer_set.MaterialLayers[0]
                        layer.LayerThickness = float(calc_new_val(layer.LayerThickness))
                        return True

        # 2. 속성 세트 (Pset_WallCommon 등)
        for rel in getattr(element, "IsDefinedBy", []):
            if rel.is_a("IfcRelDefinesByProperties"):
                pset = rel.RelatingPropertyDefinition
                if pset.is_a("IfcPropertySet"):
                    for prop in getattr(pset, "HasProperties", []):
                        if prop.Name in ("Width", "Thickness", "WallThickness"):
                            prop.NominalValue.wrappedValue = float(calc_new_val(prop.NominalValue.wrappedValue))
                            return True

        # 3. 기하 형상 직접 수정 (IfcRectangleProfileDef) — fallback
        if element.Representation:
            for rep in element.Representation.Representations:
                if rep.RepresentationIdentifier == "Body":
                    for item in rep.Items:
                        if item.is_a("IfcExtrudedAreaSolid"):
                            prof = item.SweptArea
                            if prof.is_a("IfcRectangleProfileDef"):
                                # 짧은 쪽을 두께로 판단
                                if prof.XDim <= prof.YDim:
                                    prof.XDim = float(calc_new_val(prof.XDim))
                                else:
                                    prof.YDim = float(calc_new_val(prof.YDim))
                                return True
        return False
    except Exception as e:
        logger.error(f"두께 수정 중 오류: {e}")
        return False

def modify_height(element: ifcopenshell.entity_instance, height_mm: Dict[str, Any], scale: float = 1.0) -> bool:
    try:
        mode_relative = (height_mm.get("mode") == "RELATIVE")
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

def modify_position(element: ifcopenshell.entity_instance, pos_mm: Dict[str, Any], scale: float = 1.0) -> bool:
    try:
        placement = element.ObjectPlacement
        if not (placement and placement.is_a("IfcLocalPlacement")): return False
        rel_placement = placement.RelativePlacement
        if not (rel_placement and rel_placement.is_a("IfcAxis2Placement3D")): return False
        location = rel_placement.Location
        if not (location and location.is_a("IfcCartesianPoint")): return False

        mode_relative = (pos_mm.get("mode") == "RELATIVE")
        dx, dy, dz = (pos_mm.get("x") or 0.0)/scale, (pos_mm.get("y") or 0.0)/scale, (pos_mm.get("z") or 0.0)/scale
        coords = list(location.Coordinates)
        if mode_relative:
            coords[0] += dx; coords[1] += dy; coords[2] += dz
        else:
            if "x" in pos_mm: coords[0] = dx
            if "y" in pos_mm: coords[1] = dy
            if "z" in pos_mm: coords[2] = dz
        location.Coordinates = tuple(coords)
        return True
    except Exception as e:
        logger.error(f"위치 수정 오류: {e}")
        return False

def modify_rotation(model: ifcopenshell.file, element: ifcopenshell.entity_instance, rotation_deg: float) -> bool:
    try:
        placement = element.ObjectPlacement
        # placement 또는 RelativePlacement가 없으면 NoneType AttributeError 발생 방지
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
        while len(dr) < 2: dr.append(0.0)
        new_x = dr[0] * cos_a - dr[1] * sin_a
        new_y = dr[0] * sin_a + dr[1] * cos_a
        ref_dir.DirectionRatios = (new_x, new_y, dr[2] if len(dr)>2 else 0.0)
        return True
    except Exception as e:
        logger.error(f"회전 수정 오류: {e}")
        return False

def modify_material(model: ifcopenshell.file, element: ifcopenshell.entity_instance, mat_change: Dict[str, Any]) -> bool:
    """재질(Material) 수정 — 공유 재질 변경 방지: 기존 연결을 끊고 이 요소에만 새 재질을 연결한다.
    기존처럼 mat.Name을 직접 수정하면 같은 재질을 공유하는 모든 요소가 일괄 변경되는 부작용이 생긴다."""
    try:
        new_name = mat_change.get("name", "Unknown")

        # 기존 재질 관계에서 이 요소만 분리 (공유 엔티티 직접 수정 금지)
        for rel in list(getattr(element, "HasAssociations", [])):
            if rel.is_a("IfcRelAssociatesMaterial"):
                remaining = [o for o in rel.RelatedObjects if o != element]
                if remaining:
                    rel.RelatedObjects = remaining
                else:
                    model.remove(rel)
                break

        # 이 요소 전용 새 재질 엔티티 생성 및 연결
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

def modify_face_offset(element: ifcopenshell.entity_instance, offset_mm: float, direction: str, scale: float = 1.0) -> bool:
    """특정 면 오프셋 (위치 이동으로 단순화)"""
    if not direction: return False
    dir_upper = direction.upper()
    pos_change = {"mode": "RELATIVE", "x": 0.0, "y": 0.0, "z": 0.0}
    if dir_upper == "NORTH": pos_change["y"] = offset_mm
    elif dir_upper == "SOUTH": pos_change["y"] = -offset_mm
    elif dir_upper == "EAST": pos_change["x"] = offset_mm
    elif dir_upper == "WEST": pos_change["x"] = -offset_mm
    else: return False
    return modify_position(element, pos_change, scale)

# ──────────────────────────────────────────────────────────────────────────────
# 생성(CREATE) 기능
# ──────────────────────────────────────────────────────────────────────────────

_DIRECTION_VECTORS: dict = {
    "EAST":  ((0.0, 0.0, 1.0), (0.0, 1.0, 0.0)),
    "WEST":  ((0.0, 0.0, 1.0), (0.0, 1.0, 0.0)),
    "NORTH": ((0.0, 0.0, 1.0), (1.0, 0.0, 0.0)),
    "SOUTH": ((0.0, 0.0, 1.0), (1.0, 0.0, 0.0)),
}

def create_wall(model: ifcopenshell.file, storey_entity, create_info: dict) -> Optional[ifcopenshell.entity_instance]:
    dir_key = (create_info.get("direction") or "").upper()
    if dir_key not in _DIRECTION_VECTORS: return None
    axis, ref_dir = _DIRECTION_VECTORS[dir_key]
    
    l, h, w = float(create_info.get("length_mm") or 3000), float(create_info.get("height_mm") or 2400), float(create_info.get("width_mm") or 200)
    sp = create_info.get("start_point") or {}
    origin = (float(sp.get("x", 0)), float(sp.get("y", 0)), float(sp.get("z", 0)))
    
    try:
        hist_list = model.by_type("IfcOwnerHistory")
        if hist_list: 
            hist = hist_list[0]
        else:
            person = model.create_entity("IfcPerson", FamilyName="AI")
            org = model.create_entity("IfcOrganization", Name="S14P31A204")
            p_and_o = model.create_entity("IfcPersonAndOrganization", ThePerson=person, TheOrganization=org)
            app = model.create_entity("IfcApplication", ApplicationDeveloper=org, Version="1.0", ApplicationFullName="AI_BIM", ApplicationIdentifier="AI_BIM")
            hist = model.create_entity("IfcOwnerHistory", OwningUser=p_and_o, OwningApplication=app, ChangeAction="ADDED", CreationDate=123456789)
        guid = ifcopenshell.guid.new()
        
        # Placement
        ifc_origin = model.create_entity("IfcCartesianPoint", Coordinates=origin)
        ifc_axis = model.create_entity("IfcDirection", DirectionRatios=axis)
        ifc_ref = model.create_entity("IfcDirection", DirectionRatios=ref_dir)
        axis2 = model.create_entity("IfcAxis2Placement3D", Location=ifc_origin, Axis=ifc_axis, RefDirection=ifc_ref)
        placement = model.create_entity("IfcLocalPlacement", PlacementRelTo=storey_entity.ObjectPlacement, RelativePlacement=axis2)
        
        # Geometry
        prof = model.create_entity("IfcRectangleProfileDef", ProfileType="AREA", XDim=float(l), YDim=float(w), 
                                   Position=model.create_entity("IfcAxis2Placement2D", Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0,0.0))))
        solid = model.create_entity("IfcExtrudedAreaSolid", SweptArea=prof, Depth=float(h), ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0,0.0,1.0)))
        
        ctx_list = model.by_type("IfcGeometricRepresentationContext")
        ctx = ctx_list[0] if ctx_list else model.create_entity("IfcGeometricRepresentationContext", ContextType="Model", CoordinateSpaceDimension=3, Precision=0.00001, WorldCoordinateSystem=axis2)

        rep = model.create_entity("IfcShapeRepresentation", ContextOfItems=ctx, 
                                  RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[solid])
        wall = model.create_entity("IfcWall", GlobalId=guid, OwnerHistory=hist, Name=f"AI_Wall_{guid[:8]}", ObjectPlacement=placement, Representation=model.create_entity("IfcProductDefinitionShape", Representations=[rep]))
        
        _attach_to_storey(model, wall, storey_entity, hist)
        return wall
    except Exception as e:
        logger.error(f"벽 생성 오류: {e}")
        return None

def create_slab(model: ifcopenshell.file, storey_entity, create_info: dict) -> Optional[ifcopenshell.entity_instance]:
    l, w, h = float(create_info.get("length_mm") or 4000), float(create_info.get("width_mm") or 4000), float(create_info.get("height_mm") or 200)
    sp = create_info.get("start_point") or {}
    origin = (float(sp.get("x", 0)), float(sp.get("y", 0)), float(sp.get("z", 0)))

    try:
        hist_list = model.by_type("IfcOwnerHistory")
        if hist_list: 
            hist = hist_list[0]
        else:
            person = model.create_entity("IfcPerson", FamilyName="AI")
            org = model.create_entity("IfcOrganization", Name="S14P31A204")
            p_and_o = model.create_entity("IfcPersonAndOrganization", ThePerson=person, TheOrganization=org)
            app = model.create_entity("IfcApplication", ApplicationDeveloper=org, Version="1.0", ApplicationFullName="AI_BIM", ApplicationIdentifier="AI_BIM")
            hist = model.create_entity("IfcOwnerHistory", OwningUser=p_and_o, OwningApplication=app, ChangeAction="ADDED", CreationDate=123456789)
        guid = ifcopenshell.guid.new()
        
        ifc_origin = model.create_entity("IfcCartesianPoint", Coordinates=origin)
        axis2 = model.create_entity("IfcAxis2Placement3D", Location=ifc_origin, Axis=model.create_entity("IfcDirection", DirectionRatios=(0.0,0.0,1.0)), 
                                   RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0,0.0,0.0)))
        placement = model.create_entity("IfcLocalPlacement", PlacementRelTo=storey_entity.ObjectPlacement, RelativePlacement=axis2)
        
        prof = model.create_entity("IfcRectangleProfileDef", ProfileType="AREA", XDim=float(l), YDim=float(w), 
                                   Position=model.create_entity("IfcAxis2Placement2D", Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0,0.0))))
        solid = model.create_entity("IfcExtrudedAreaSolid", SweptArea=prof, Depth=float(h), ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0,0.0,1.0)))
        
        ctx_list = model.by_type("IfcGeometricRepresentationContext")
        ctx = ctx_list[0] if ctx_list else model.create_entity("IfcGeometricRepresentationContext", ContextType="Model", CoordinateSpaceDimension=3, Precision=0.00001, WorldCoordinateSystem=axis2)

        rep = model.create_entity("IfcShapeRepresentation", ContextOfItems=ctx, 
                                  RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[solid])
        slab = model.create_entity("IfcSlab", GlobalId=guid, OwnerHistory=hist, Name=f"AI_Slab_{guid[:8]}", PredefinedType="FLOOR", ObjectPlacement=placement, Representation=model.create_entity("IfcProductDefinitionShape", Representations=[rep]))
        
        _attach_to_storey(model, slab, storey_entity, hist)
        return slab
    except Exception as e:
        logger.error(f"슬래브 생성 오류: {e}")
        return None

def _attach_to_storey(model, element, storey, hist):
    for rel in model.by_type("IfcRelContainedInSpatialStructure"):
        if rel.RelatingStructure == storey:
            rel.RelatedElements = list(rel.RelatedElements) + [element]
            return
    model.create_entity("IfcRelContainedInSpatialStructure", GlobalId=ifcopenshell.guid.new(), OwnerHistory=hist, RelatingStructure=storey, RelatedElements=[element])