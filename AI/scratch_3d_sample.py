# -*- coding: utf-8 -*-
"""
BATANG Sample IFC Generator  (v2 - geometry fix)
==================================================
수정 내역:
  - orient="Y" 벽의 RefDir 버그 수정 → 항상 (1,0,0) 고정, XDim/YDim 스왑으로 처리
  - IfcSlab(바닥) 추가 — 1F / 2F
  - OUT_PATH → llm_3d/batang_sample.ifc (test_3d.py 경로에 맞춤)

생성 구조:
  1F  → Living Room (거실): 4개 벽 + 바닥 슬래브
  2F  → Bathroom (화장실): 4개 벽
        Bedroom  (안방)  : 4개 벽  ← 2F 공유 슬래브 1개
  RF  → Roof 1개

좌표계 (모두 mm):
  1F 방 : 8000(X) × 6000(Y), 층고 3000, 벽 두께 200
  2F 화장실: 3000(X) × 3000(Y), 층고 2800  x=0~3000
  2F 안방  : 5000(X) × 5000(Y), 층고 2800  x=3000~8000
"""
import ifcopenshell
import ifcopenshell.guid
import os

# ── 출력 경로: Downloads 폴더 ──────────────────────────
OUT_PATH = os.path.normpath(os.path.join(os.environ["USERPROFILE"], "Downloads", "batang_sample.ifc"))


# ══════════════════════════════════════════════════════════════════════════════
# 저수준 헬퍼
# ══════════════════════════════════════════════════════════════════════════════
def _pt(m, x, y, z=0.0):
    return m.create_entity("IfcCartesianPoint", Coordinates=(float(x), float(y), float(z)))

def _dir(m, x, y, z=0.0):
    return m.create_entity("IfcDirection", DirectionRatios=(float(x), float(y), float(z)))

def _a2p(m, origin, axis=None, ref=None):
    kw = {"Location": origin}
    if axis: kw["Axis"] = axis
    if ref:  kw["RefDirection"] = ref
    return m.create_entity("IfcAxis2Placement3D", **kw)

def _local_placement(m, x=0.0, y=0.0, z=0.0, relative_to=None):
    """RefDir=(1,0,0), Axis=(0,0,1) 고정 배치"""
    a2p = _a2p(m, _pt(m, x, y, z), axis=_dir(m, 0, 0, 1), ref=_dir(m, 1, 0, 0))
    kw = {"RelativePlacement": a2p}
    if relative_to:
        kw["PlacementRelTo"] = relative_to
    return m.create_entity("IfcLocalPlacement", **kw)

def _contain(m, spatial, *elements):
    m.create_entity(
        "IfcRelContainedInSpatialStructure",
        GlobalId=ifcopenshell.guid.new(),
        RelatingStructure=spatial,
        RelatedElements=list(elements),
    )

def _aggregate(m, parent, *children):
    m.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        RelatingObject=parent,
        RelatedObjects=list(children),
    )


# ══════════════════════════════════════════════════════════════════════════════
# 벽 생성
# ══════════════════════════════════════════════════════════════════════════════
def _create_wall(m, ctx, name, x, y, z, length_mm, height_mm, thickness_mm, orient="X"):
    """
    IfcRectangleProfileDef는 로컬 원점에서 중심 정렬됨.
    → Position.Location을 (xdim/2, ydim/2, 0)으로 설정해 좌하단이 (0,0)이 되게 함.
    → RefDir는 항상 (1,0,0) 고정.
      orient="X" : XDim=length, YDim=thickness  (벽이 X축 방향으로 뻗음)
      orient="Y" : XDim=thickness, YDim=length   (벽이 Y축 방향으로 뻗음)
    이렇게 하면 placement(x,y)가 벽의 좌하단 모서리가 되어 코너에서 정확히 만남.
    """
    if orient == "X":
        xdim, ydim = float(length_mm), float(thickness_mm)
    else:  # "Y"
        xdim, ydim = float(thickness_mm), float(length_mm)

    profile = m.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=xdim,
        YDim=ydim,
    )
    # 프로파일 로컬 중심 → (xdim/2, ydim/2) 으로 이동해 좌하단을 (0,0)에 맞춤
    solid_pos = _a2p(m, _pt(m, xdim / 2, ydim / 2, 0))
    solid = m.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=solid_pos,
        ExtrudedDirection=_dir(m, 0, 0, 1),
        Depth=float(height_mm),
    )
    body  = m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[solid],
    )
    shape = m.create_entity("IfcProductDefinitionShape", Representations=[body])
    placement = _local_placement(m, x, y, z)

    return m.create_entity(
        "IfcWall",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        ObjectPlacement=placement,
        Representation=shape,
    )


# ══════════════════════════════════════════════════════════════════════════════
# 슬래브(바닥) 생성
# ══════════════════════════════════════════════════════════════════════════════
def _create_slab(m, ctx, name, x, y, z, length_mm, width_mm, thickness_mm=200):
    """단순 직사각형 바닥 슬래브 (IfcSlab)"""
    xdim, ydim = float(length_mm), float(width_mm)
    profile = m.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=xdim,
        YDim=ydim,
    )
    solid_pos = _a2p(m, _pt(m, xdim / 2, ydim / 2, 0))
    solid = m.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=solid_pos,
        ExtrudedDirection=_dir(m, 0, 0, 1),
        Depth=float(thickness_mm),
    )
    body  = m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[solid],
    )
    shape = m.create_entity("IfcProductDefinitionShape", Representations=[body])
    placement = _local_placement(m, x, y, z)

    return m.create_entity(
        "IfcSlab",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        PredefinedType="FLOOR",
        ObjectPlacement=placement,
        Representation=shape,
    )


# ══════════════════════════════════════════════════════════════════════════════
# 지붕 생성
# ══════════════════════════════════════════════════════════════════════════════
def _create_roof(m, ctx, name, x, y, z, length_mm, width_mm, thickness_mm=300):
    xdim, ydim = float(length_mm), float(width_mm)
    profile = m.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=xdim,
        YDim=ydim,
    )
    solid_pos = _a2p(m, _pt(m, xdim / 2, ydim / 2, 0))
    solid = m.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=solid_pos,
        ExtrudedDirection=_dir(m, 0, 0, 1),
        Depth=float(thickness_mm),
    )
    body  = m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[solid],
    )
    shape = m.create_entity("IfcProductDefinitionShape", Representations=[body])
    placement = _local_placement(m, x, y, z)

    return m.create_entity(
        "IfcRoof",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        ObjectPlacement=placement,
        Representation=shape,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Space / Storey 팩토리
# ══════════════════════════════════════════════════════════════════════════════
def _create_space(m, name):
    return m.create_entity(
        "IfcSpace",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        LongName=name,
        CompositionType="ELEMENT",
    )

def _create_storey(m, name, elevation):
    return m.create_entity(
        "IfcBuildingStorey",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        Elevation=float(elevation),
        CompositionType="ELEMENT",
    )


# ══════════════════════════════════════════════════════════════════════════════
# 메인 생성 함수
# ══════════════════════════════════════════════════════════════════════════════
def generate():
    m = ifcopenshell.file(schema="IFC4")

    # ── 단위 (mm) ─────────────────────────────────────────────────────────────
    u_len   = m.create_entity("IfcSIUnit", UnitType="LENGTHUNIT",    Prefix="MILLI", Name="METRE")
    u_area  = m.create_entity("IfcSIUnit", UnitType="AREAUNIT",      Name="SQUARE_METRE")
    u_vol   = m.create_entity("IfcSIUnit", UnitType="VOLUMEUNIT",    Name="CUBIC_METRE")
    u_ang   = m.create_entity("IfcSIUnit", UnitType="PLANEANGLEUNIT",Name="RADIAN")
    units   = m.create_entity("IfcUnitAssignment", Units=[u_len, u_area, u_vol, u_ang])

    # ── 기하 컨텍스트 ──────────────────────────────────────────────────────────
    ctx = m.create_entity(
        "IfcGeometricRepresentationContext",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=_a2p(m, _pt(m, 0, 0, 0)),
    )

    # ── 프로젝트 계층 ─────────────────────────────────────────────────────────
    project  = m.create_entity("IfcProject",  GlobalId=ifcopenshell.guid.new(),
                                Name="BATANG_Sample", UnitsInContext=units,
                                RepresentationContexts=[ctx])
    site     = m.create_entity("IfcSite",     GlobalId=ifcopenshell.guid.new(), Name="Site")
    building = m.create_entity("IfcBuilding", GlobalId=ifcopenshell.guid.new(), Name="Building")
    _aggregate(m, project, site)
    _aggregate(m, site, building)

    # ── 층 ────────────────────────────────────────────────────────────────────
    s1f = _create_storey(m, "1F", 0)
    s2f = _create_storey(m, "2F", 3000)
    srf = _create_storey(m, "RF", 5800)   # 1F(3000) + 2F(2800)
    _aggregate(m, building, s1f, s2f, srf)

    W  = 200   # 공통 벽 두께

    # ══════════════════════════════════════════════════════════════════════════
    # 1F — Living Room  8000(X) × 6000(Y), 층고 3000
    #
    #  Y▲  ┌──────────────────┐  y=6000
    #   │  │   Living Room    │
    #   │  └──────────────────┘  y=0
    #   └──────────────────────► X
    #      x=0              x=8000
    # ══════════════════════════════════════════════════════════════════════════
    LX, LY, H1 = 8000, 6000, 3000

    lr_walls = [
        # South: y=0,      X방향, 전체 폭
        _create_wall(m, ctx, "1F_LivingRoom_South_Wall",
                     0,        0,       0,  LX, H1, W, "X"),
        # North: y=LY-W,   X방향
        _create_wall(m, ctx, "1F_LivingRoom_North_Wall",
                     0,        LY - W,  0,  LX, H1, W, "X"),
        # West:  x=0,      Y방향 (XDim=W, YDim=LY)
        _create_wall(m, ctx, "1F_LivingRoom_West_Wall",
                     0,        0,       0,  LY, H1, W, "Y"),
        # East:  x=LX-W,   Y방향
        _create_wall(m, ctx, "1F_LivingRoom_East_Wall",
                     LX - W,   0,       0,  LY, H1, W, "Y"),
    ]

    # 1F 바닥 슬래브 (z=-200 에 배치해 바닥이 z=0 위에 오도록)
    lr_slab = _create_slab(m, ctx, "1F_LivingRoom_Floor",
                           0, 0, -200, LX, LY, 200)

    sp_lr = _create_space(m, "Living Room")
    _aggregate(m, s1f, sp_lr)
    _contain(m, sp_lr, *lr_walls)
    _contain(m, s1f, lr_slab)

    # ══════════════════════════════════════════════════════════════════════════
    # 2F — Bathroom  3000(X) × 3000(Y), 층고 2800   x=0~3000
    # ══════════════════════════════════════════════════════════════════════════
    BX, BY, BW, BD, H2 = 0, 0, 3000, 3000, 2800

    bath_walls = [
        _create_wall(m, ctx, "2F_Bathroom_South_Wall",
                     BX,        BY,       H1,  BW, H2, W, "X"),
        _create_wall(m, ctx, "2F_Bathroom_North_Wall",
                     BX,        BY+BD-W,  H1,  BW, H2, W, "X"),
        _create_wall(m, ctx, "2F_Bathroom_West_Wall",
                     BX,        BY,       H1,  BD, H2, W, "Y"),
        _create_wall(m, ctx, "2F_Bathroom_East_Wall",
                     BX+BW-W,   BY,       H1,  BD, H2, W, "Y"),
    ]

    sp_bath = _create_space(m, "Bathroom")
    _aggregate(m, s2f, sp_bath)
    _contain(m, sp_bath, *bath_walls)

    # ══════════════════════════════════════════════════════════════════════════
    # 2F — Bedroom   5000(X) × 5000(Y), 층고 2800   x=3000~8000
    # ══════════════════════════════════════════════════════════════════════════
    RX, RY, RW, RD = 3000, 0, 5000, 5000

    bed_walls = [
        _create_wall(m, ctx, "2F_Bedroom_South_Wall",
                     RX,        RY,       H1,  RW, H2, W, "X"),
        _create_wall(m, ctx, "2F_Bedroom_North_Wall",
                     RX,        RY+RD-W,  H1,  RW, H2, W, "X"),
        _create_wall(m, ctx, "2F_Bedroom_West_Wall",
                     RX,        RY,       H1,  RD, H2, W, "Y"),
        _create_wall(m, ctx, "2F_Bedroom_East_Wall",
                     RX+RW-W,   RY,       H1,  RD, H2, W, "Y"),
    ]

    sp_bed = _create_space(m, "Bedroom")
    _aggregate(m, s2f, sp_bed)
    _contain(m, sp_bed, *bed_walls)

    # 2F 바닥 슬래브 (전체 2F 바닥, z=H1-200)
    f2_slab = _create_slab(m, ctx, "2F_Floor", 0, 0, H1 - 200, LX, LY, 200)
    _contain(m, s2f, f2_slab)

    # ══════════════════════════════════════════════════════════════════════════
    # RF — 지붕  (2F 층고까지: H1+H2 = 5800)
    # ══════════════════════════════════════════════════════════════════════════
    roof = _create_roof(m, ctx, "RF_Roof",
                        0, 0, H1 + H2, LX, LY, 300)
    _contain(m, srf, roof)

    # ── 저장 ─────────────────────────────────────────────────────────────────
    m.write(OUT_PATH)
    print("[OK] IFC generated:", OUT_PATH)

    # -- 검증
    v = ifcopenshell.open(OUT_PATH)
    walls   = v.by_type("IfcWall")
    slabs   = v.by_type("IfcSlab")
    roofs   = v.by_type("IfcRoof")
    storeys = [s.Name for s in v.by_type("IfcBuildingStorey")]
    spaces  = [s.Name for s in v.by_type("IfcSpace")]
    print(f"  Walls  : {len(walls)}")
    print(f"  Slabs  : {len(slabs)}")
    print(f"  Roofs  : {len(roofs)}")
    print(f"  Storeys: {storeys}")
    print(f"  Spaces : {spaces}")

    # 벽 좌표 간단 검증
    print("\n  [벽 위치 검증]")
    for w in walls:
        loc = w.ObjectPlacement.RelativePlacement.Location.Coordinates
        for rep in w.Representation.Representations:
            if rep.RepresentationIdentifier == "Body":
                for item in rep.Items:
                    if item.is_a("IfcExtrudedAreaSolid"):
                        p = item.SweptArea
                        # 실제 글로벌 시작점 = placement + (0,0) → 좌하단
                        # 끝점 = placement + (XDim, YDim)
                        x0, y0, z0 = loc[0], loc[1], loc[2] if len(loc) > 2 else 0
                        print(f"    {w.Name:40s}  "
                              f"({x0:5.0f},{y0:5.0f},{z0:5.0f}) "
                              f"XDim={p.XDim:.0f} YDim={p.YDim:.0f} H={item.Depth:.0f}")


if __name__ == "__main__":
    generate()