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
    "red": (1.0, 0.0, 0.0),
    "gray": (0.8, 0.8, 0.8),
    "grey": (0.8, 0.8, 0.8),
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
        loc = pl.RelativePlacement.Location.Coordinates
        rdx, rdy = 1.0, 0.0
        ref = getattr(pl.RelativePlacement, "RefDirection", None)
        if ref:
            rdx, rdy = ref.DirectionRatios[0], ref.DirectionRatios[1]

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


def _apply_color_and_material(
    model: ifcopenshell.file,
    element: ifcopenshell.entity_instance,
    color_hex: str | None = None,
    mat_name: str | None = None,
):
    """부재에 색상(RGB) 및 재질 정보를 부여한다."""
    try:
        if color_hex:
            r, g, b = _color_to_rgb(color_hex)
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
                    model.create_entity("IfcStyledItem", Item=rep.Items[0], Styles=[assignment])

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
    w_pl = host_wall.ObjectPlacement.RelativePlacement
    w_loc = w_pl.Location.Coordinates
    w_ref = getattr(w_pl, "RefDirection", None)
    rdx, rdy = (w_ref.DirectionRatios[0], w_ref.DirectionRatios[1]) if w_ref else (1.0, 0.0)

    # 벽체 원점 기준 변위
    dx, dy = (x_mm / scale) - w_loc[0], (y_mm / scale) - w_loc[1]

    # 회전 행렬 적용 (벽체 로컬 U, V 좌표)
    u = dx * rdx + dy * rdy
    v = dx * (-rdy) + dy * rdx
    z = (z_mm / scale) - (w_loc[2] if len(w_loc) > 2 else 0.0)

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
                ew_wall = item.SweptArea.XDim >= item.SweptArea.YDim
                if item.Position and item.Position.Location:
                    cx, cy = (
                        item.Position.Location.Coordinates[0],
                        item.Position.Location.Coordinates[1],
                    )
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
