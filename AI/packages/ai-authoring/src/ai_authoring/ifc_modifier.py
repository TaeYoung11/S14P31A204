"""
IFC Modifier Module
===================
IFC 부재의 기하 정보(두께, 높이, 위치, 회전 등)를 직접 수정하는 저수준 연산 함수들을 모아둔 공용 모듈입니다.
이 모듈은 LLM 의존성 없이 ifcopenshell만으로 작동하므로 2D/3D 파트 모두에서 재사용 가능합니다.
"""
import logging
import math
import ifcopenshell
import ifcopenshell.api
from typing import Dict, Any, List, Optional

logger = logging.getLogger("ai_authoring.ifc_modifier")

def delete_element(model: ifcopenshell.file, element: ifcopenshell.entity_instance, etype_str: str = "IfcProduct") -> bool:
    """IFC 요소를 관계 엔티티까지 깔끔하게 정리하여 삭제한다."""
    gid_short = element.GlobalId[:8] if element.GlobalId else "?"
    
    try:
        # 1. 공간 포함 관계 정리 (ContainedInStructure)
        for rel in list(getattr(element, "ContainedInStructure", [])):
            if rel.is_a("IfcRelContainedInSpatialStructure"):
                remaining = [e for e in rel.RelatedElements if e != element]
                if remaining:
                    rel.RelatedElements = remaining
                else:
                    model.remove(rel)
        
        # 2. 재질 연결 정리 (HasAssociations)
        for rel in list(getattr(element, "HasAssociations", [])):
            if not rel.is_a("IfcRelAssociatesMaterial"):
                continue
            remaining = [o for o in rel.RelatedObjects if o != element]
            if remaining:
                rel.RelatedObjects = remaining
            else:
                model.remove(rel)

        # 3. 속성 세트 및 타입 연결 정리 (IsDefinedBy)
        for rel in list(getattr(element, "IsDefinedBy", [])):
            if rel.is_a("IfcRelDefinesByProperties") or rel.is_a("IfcRelDefinesByType"):
                remaining = [o for o in rel.RelatedObjects if o != element]
                if remaining:
                    rel.RelatedObjects = remaining
                else:
                    model.remove(rel)

        # 4. 요소 본체 삭제
        model.remove(element)
        logger.info(f"[{gid_short}] 요소 삭제 완료 ({etype_str})")
        return True
    except Exception as exc:
        logger.error(f"[{gid_short}] 요소 본체 삭제 실패: {exc}", exc_info=True)
        return False

def modify_thickness(element: ifcopenshell.entity_instance, width_mm: Dict[str, Any], scale: float = 1.0) -> bool:
    """
    부재의 두께(Width/Thickness)를 수정한다.
    우선순위: 재질 레이어 세트 -> 속성 세트 -> 기하 형상(Profile)
    """
    mode_relative = (width_mm.get("mode") == "RELATIVE")
    val_mm = width_mm.get("value", 0.0)

    def calc_new_val(current_native):
        current_mm = current_native * scale
        new_mm = current_mm + val_mm if mode_relative else val_mm
        return new_mm / scale

    try:
        # 1. 재질 레이어 세트 (IfcMaterialLayerSetUsage) 확인
        for rel in getattr(element, "HasAssociations", []):
            if rel.is_a("IfcRelAssociatesMaterial"):
                mat = rel.RelatingMaterial
                if mat and mat.is_a("IfcMaterialLayerSetUsage"):
                    layer_set = mat.ForLayerSet
                    if layer_set and layer_set.MaterialLayers:
                        layer = layer_set.MaterialLayers[0]
                        layer.LayerThickness = float(calc_new_val(layer.LayerThickness))
                        return True

        # 2. 속성 세트 (Pset_WallCommon 등) 확인
        for rel in getattr(element, "IsDefinedBy", []):
            if rel.is_a("IfcRelDefinesByProperties"):
                pset = rel.RelatingPropertyDefinition
                if pset.is_a("IfcPropertySet"):
                    for prop in getattr(pset, "HasProperties", []):
                        if prop.Name in ["Width", "Thickness", "WallThickness"]:
                            val = prop.NominalValue.wrappedValue
                            prop.NominalValue.wrappedValue = float(calc_new_val(val))
                            return True

        # 3. 기하 형상 (IfcRectangleProfileDef) 직접 수정
        if element.Representation:
            for rep in element.Representation.Representations:
                if rep.RepresentationIdentifier == "Body":
                    for item in rep.Items:
                        if item.is_a("IfcExtrudedAreaSolid"):
                            prof = item.SweptArea
                            if prof.is_a("IfcRectangleProfileDef"):
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
    """부재의 높이(Height) 수정 - IfcExtrudedAreaSolid.Depth 기준"""
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
    """부재의 좌표(Position) 수정"""
    try:
        placement = element.ObjectPlacement
        if not placement or not placement.is_a("IfcLocalPlacement"):
            return False
            
        rel_placement = placement.RelativePlacement
        if not rel_placement or not rel_placement.is_a("IfcAxis2Placement3D"):
            return False
            
        location = rel_placement.Location
        if not location or not location.is_a("IfcCartesianPoint"):
            return False

        mode_relative = (pos_mm.get("mode") == "RELATIVE")
        dx = (pos_mm.get("x") or 0.0) / scale
        dy = (pos_mm.get("y") or 0.0) / scale
        dz = (pos_mm.get("z") or 0.0) / scale

        coords = list(location.Coordinates)
        if mode_relative:
            coords[0] += dx
            coords[1] += dy
            coords[2] += dz
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
    """
    부재의 회전(Rotation) 수정. 
    Z축 기준으로 기존 방향 벡터(RefDirection)에 delta 각도를 누적한다.
    """
    try:
        placement = element.ObjectPlacement
        if not (placement and placement.is_a("IfcLocalPlacement")): return False
        rel_placement = placement.RelativePlacement
        if not (rel_placement and rel_placement.is_a("IfcAxis2Placement3D")): return False

        rad = math.radians(rotation_deg)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)

        # RefDirection (X축 방향 벡터) 수정
        ref_dir = rel_placement.RefDirection
        if not ref_dir:
            # 존재하지 않으면 (1,0,0) 기준으로 새로 생성 후 회전 적용
            dr = [1.0, 0.0, 0.0]
            ref_dir = model.create_entity("IfcDirection", DirectionRatios=tuple(dr))
            rel_placement.RefDirection = ref_dir
        
        dr = list(ref_dir.DirectionRatios)
        while len(dr) < 2: dr.append(0.0)
        
        # 기존 벡터 기준 회전 행렬 적용 (누적 회전)
        new_x = dr[0] * cos_a - dr[1] * sin_a
        new_y = dr[0] * sin_a + dr[1] * cos_a
        new_z = dr[2] if len(dr) > 2 else 0.0
        
        ref_dir.DirectionRatios = (new_x, new_y, new_z)
        return True
    except Exception as e:
        logger.error(f"회전 수정 오류: {e}")
        return False

def modify_material(model: ifcopenshell.file, element: ifcopenshell.entity_instance, mat_change: Dict[str, Any]) -> bool:
    """재질(Material) 수정"""
    try:
        new_name = mat_change.get("name", "Unknown")
        
        # 1. 기존 재질 관계 찾기
        for rel in getattr(element, "HasAssociations", []):
            if rel.is_a("IfcRelAssociatesMaterial"):
                mat = rel.RelatingMaterial
                if mat.is_a("IfcMaterial"):
                    mat.Name = new_name
                    return True
                elif mat.is_a("IfcMaterialLayerSetUsage"):
                    ls = mat.ForLayerSet
                    if ls and ls.MaterialLayers:
                        ls.MaterialLayers[0].Material.Name = new_name
                        return True
        
        # 2. 없으면 새로 생성 (단순화된 방식)
        new_mat = model.create_entity("IfcMaterial", Name=new_name)
        model.create_entity("IfcRelAssociatesMaterial", 
                           GlobalId=ifcopenshell.guid.new(),
                           RelatingMaterial=new_mat,
                           RelatedObjects=[element])
        return True
    except Exception as e:
        logger.error(f"재질 수정 오류: {e}")
        return False

def modify_face_offset(element: ifcopenshell.entity_instance, offset_mm: float, direction: str, scale: float = 1.0) -> bool:
    """
    특정 면(face)을 밀거나 당긴다. (현재는 Position 이동으로 단순화하여 처리)
    방향(direction)을 직접 전달받아 처리한다.
    """
    if not direction:
        return False

    dir_upper = direction.upper()
    pos_change = {"mode": "RELATIVE", "x": 0.0, "y": 0.0, "z": 0.0}
    
    if dir_upper == "NORTH": pos_change["y"] = offset_mm
    elif dir_upper == "SOUTH": pos_change["y"] = -offset_mm
    elif dir_upper == "EAST": pos_change["x"] = offset_mm
    elif dir_upper == "WEST": pos_change["x"] = -offset_mm
    else: return False

    return modify_position(element, pos_change, scale)
