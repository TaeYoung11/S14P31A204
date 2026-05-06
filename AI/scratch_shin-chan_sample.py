"""
Crayon Shin-chan House IFC Generator (Detailed Interior Edition)
=================================================
특징:
  1. 원작 평면도 내부의 세밀한 방 구획 완벽 반영.
  2. 1층: 이불장, 거실/부엌 분리, 화장실(변기), 세면대, 욕조, 계단실 개별 구획.
  3. 2층: 이모방, 아빠 사무실, 장롱, 2층 계단실 개별 구획.
"""
import time
import os

import ifcopenshell
import ifcopenshell.guid

UP = os.environ.get("USERPROFILE") or os.environ.get("HOME", "")
OUT_PATH = os.path.normpath(os.path.join(UP, "Downloads", "shinchan_house.ifc"))

# ══════════════════════════════════════════════════════════════════════════════
# 전역 설정 변수
# ══════════════════════════════════════════════════════════════════════════════
T  = 200   # 벽 두께
H1 = 3000  # 1F 층고
H2 = 3000  # 2F 층고
H3 = 1000  # 난간 및 담장 높이

# ══════════════════════════════════════════════════════════════════════════════
# 핵심 형상 생성 헬퍼 함수
# ══════════════════════════════════════════════════════════════════════════════
def pt3(m, x, y, z=0.):
    return m.create_entity(
        "IfcCartesianPoint",
        Coordinates=(float(x), float(y), float(z)),
    )


def d3(m, x, y, z):
    return m.create_entity(
        "IfcDirection",
        DirectionRatios=(float(x), float(y), float(z)),
    )


def plc(m, x, y, z):
    a2p = m.create_entity(
        "IfcAxis2Placement3D",
        Location=pt3(m, x, y, z),
        Axis=d3(m, 0, 0, 1),
        RefDirection=d3(m, 1, 0, 0),
    )
    return m.create_entity("IfcLocalPlacement", RelativePlacement=a2p)


def BLOCK(m, ctx, BX_ctx, ifc_class, name, x, y, z, w, d, h):  # noqa: N802
    pr = m.create_entity(
        "IfcRectangleProfileDef", ProfileType="AREA", XDim=float(w), YDim=float(d)
    )
    pos = m.create_entity("IfcAxis2Placement3D", Location=pt3(m, w / 2, d / 2, 0))
    solid = m.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=pr,
        Position=pos,
        ExtrudedDirection=d3(m, 0, 0, 1),
        Depth=float(h),
    )
    rep = m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[solid],
    )
    bb = m.create_entity(
        "IfcBoundingBox",
        Corner=pt3(m, 0, 0, 0),
        XDim=float(w),
        YDim=float(d),
        ZDim=float(h),
    )
    rep_bb = m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="Box",
        RepresentationType="BoundingBox",
        Items=[bb],
    )
    shape = m.create_entity("IfcProductDefinitionShape", Representations=[rep, rep_bb])
    return m.create_entity(
        ifc_class,
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        ObjectPlacement=plc(m, x, y, z),
        Representation=shape,
    )


def set_color(m, element, r, g, b):
    color = m.create_entity("IfcColourRgb", Red=float(r), Green=float(g), Blue=float(b))
    surf_style = m.create_entity("IfcSurfaceStyleRendering", SurfaceColour=color)
    style = m.create_entity(
        "IfcSurfaceStyle",
        Name=f"{element.Name}_Color",
        Side="BOTH",
        Styles=[surf_style],
    )
    if element.Representation:
        for rep in element.Representation.Representations:
            if rep.RepresentationIdentifier == "Body":
                for item in rep.Items:
                    m.create_entity("IfcStyledItem", Item=item, Styles=[style])


# ══════════════════════════════════════════════════════════════════════════════
# 메인 빌드 로직
# ══════════════════════════════════════════════════════════════════════════════
def generate():
    m = ifcopenshell.file(schema="IFC4")
    oh = m.create_entity(
        "IfcOwnerHistory",
        OwningUser=m.create_entity(
            "IfcPersonAndOrganization",
            ThePerson=m.create_entity("IfcPerson", FamilyName="BATANG"),
            TheOrganization=m.create_entity("IfcOrganization", Name="BATANG"),
        ),
        OwningApplication=m.create_entity(
            "IfcApplication",
            ApplicationDeveloper=m.create_entity("IfcOrganization", Name="BATANG AI"),
            Version="8.4",
            ApplicationFullName="Shinchan_House",
            ApplicationIdentifier="BATANG_LLM3D",
        ),
        ChangeAction="ADDED",
        CreationDate=int(time.time()),
    )

    units = m.create_entity(
        "IfcUnitAssignment",
        Units=[
            m.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Prefix="MILLI", Name="METRE"),
            m.create_entity("IfcSIUnit", UnitType="AREAUNIT", Name="SQUARE_METRE"),
            m.create_entity("IfcSIUnit", UnitType="VOLUMEUNIT", Name="CUBIC_METRE"),
        ],
    )

    ctx = m.create_entity(
        "IfcGeometricRepresentationContext",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=m.create_entity(
            "IfcAxis2Placement3D", Location=pt3(m, 0, 0, 0)
        ),
    )
    m.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="Body",
        ContextType="Model",
        ParentContext=ctx,
        TargetView="MODEL_VIEW",
    )
    BX = m.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="Box",
        ContextType="Plan",
        ParentContext=ctx,
        TargetView="MODEL_VIEW",
    )

    project = m.create_entity(
        "IfcProject",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name="ShinchanHouse",
        UnitsInContext=units,
        RepresentationContexts=[ctx],
    )

    spl = plc(m, 0, 0, 0)
    site = m.create_entity(
        "IfcSite",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name="Site",
        ObjectPlacement=spl,
    )
    bpl = plc(m, 0, 0, 0)
    bldg = m.create_entity(
        "IfcBuilding",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name="House",
        ObjectPlacement=bpl,
    )
    m.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingObject=project,
        RelatedObjects=[site],
    )
    m.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingObject=site,
        RelatedObjects=[bldg],
    )

    def storey(name, elev):
        return m.create_entity(
            "IfcBuildingStorey",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=oh,
            Name=name,
            Elevation=float(elev),
            CompositionType="ELEMENT",
            ObjectPlacement=plc(m, 0, 0, elev),
        )

    s0f = storey("Yard", 0)
    s1f = storey("1F", 200)
    s2f = storey("2F", 3200)
    srf = storey("RF", 6200)
    m.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingObject=bldg,
        RelatedObjects=[s0f, s1f, s2f, srf],
    )

    # 색상 프리셋
    C_WHITE = (0.95, 0.95, 0.90)
    C_RED   = (0.80, 0.25, 0.20)
    C_GREEN = (0.55, 0.75, 0.55)
    C_BROWN = (0.75, 0.60, 0.45)

    # ═══════════════════════════════════════════════════════════════
    # 1. 마당 및 담장
    # ═══════════════════════════════════════════════════════════════
    yard = BLOCK(m, ctx, BX, "IfcSlab", "Yard_Grass", 0, 0, 0, 15000, 12000, 200)
    set_color(m, yard, *C_GREEN)

    f_s = BLOCK(m, ctx, BX, "IfcWall", "Fence_South", 0, 0, 200, 15000, T, H3)
    f_n = BLOCK(m, ctx, BX, "IfcWall", "Fence_North", 0, 11800, 200, 15000, T, H3)
    f_w = BLOCK(m, ctx, BX, "IfcWall", "Fence_West",  0, 200, 200, T, 11600, H3)
    f_e = BLOCK(m, ctx, BX, "IfcWall", "Fence_East",  14800, 200, 200, T, 11600, H3)

    fences = [f_s, f_n, f_w, f_e]
    for f in fences:
        set_color(m, f, *C_BROWN)
    m.create_entity(
        "IfcRelContainedInSpatialStructure",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingStructure=s0f,
        RelatedElements=[yard] + fences,
    )

    # ═══════════════════════════════════════════════════════════════
    # 2. 1F 외벽 및 상세 내부 파티션
    # ═══════════════════════════════════════════════════════════════
    sl1_ab = BLOCK(m, ctx, BX, "IfcSlab", "1F_Slab_Anbang", 2000, 6000, 200, 4000, 4000, 200)
    sl1_lv = BLOCK(m, ctx, BX, "IfcSlab", "1F_Slab_Living", 6000, 3000, 200, 4000, 7000, 200)
    sl1_hl = BLOCK(m, ctx, BX, "IfcSlab", "1F_Slab_Hall",  10000, 4000, 200, 3000, 6000, 200)
    for s in [sl1_ab, sl1_lv, sl1_hl]:
        set_color(m, s, *C_WHITE)

    # 지그재그 외벽
    w1_ab_w  = BLOCK(m, ctx, BX, "IfcWall", "1F_Anbang_West",  2000, 6000, 400, T, 4000, H1)
    w1_ab_s  = BLOCK(m, ctx, BX, "IfcWall", "1F_Anbang_South", 2000, 6000, 400, 4000, T, H1)
    w1_lv_w  = BLOCK(m, ctx, BX, "IfcWall", "1F_Living_West",  6000, 3000, 400, T, 3000, H1)
    w1_lv_s  = BLOCK(m, ctx, BX, "IfcWall", "1F_Living_South", 6000, 3000, 400, 4000, T, H1)
    w1_lv_e  = BLOCK(m, ctx, BX, "IfcWall", "1F_Living_East",  10000 - T, 3000, 400, T, 1000, H1)
    w1_hl_s  = BLOCK(m, ctx, BX, "IfcWall", "1F_Hall_South",   10000, 4000, 400, 3000, T, H1)
    w1_hl_e  = BLOCK(m, ctx, BX, "IfcWall", "1F_Hall_East",    13000 - T, 4000, 400, T, 6000, H1)
    w1_n_all = BLOCK(m, ctx, BX, "IfcWall", "1F_North_All",    2000, 10000 - T, 400, 11000, T, H1)

    # ★ 1F 상세 내부 방 구획 ★
    # (1) 안방 내부 (이불장 분리)
    w1_closet = BLOCK(m, ctx, BX, "IfcWall", "1F_In_Closet",   2000, 9000, 400, 4000, T, H1)
    # (2) 중앙 (거실 / 부엌 분리 가벽) — 통로를 위해 2500만 막음
    w1_livkit = BLOCK(m, ctx, BX, "IfcWall", "1F_In_Liv_Kit",  6000, 7000, 400, 2500, T, H1)
    # (3) 구역 대분할 (안방-부엌 / 거실-현관복도)
    w1_div_L  = BLOCK(m, ctx, BX, "IfcWall", "1F_Div_Left",    6000, 6000, 400, T, 4000, H1)
    w1_div_R  = BLOCK(m, ctx, BX, "IfcWall", "1F_Div_Right",   10000 - T, 4000, 400, T, 6000, H1)
    # (4) 우측 복도 4분할 (현관, 화장실, 세면대, 욕조)
    # 현관 / 계단&화장실 분리
    w1_hall_1 = BLOCK(m, ctx, BX, "IfcWall", "1F_In_Entrance", 10000, 6000, 400, 3000, T, H1)
    # 변기 / 욕조 분리
    w1_hall_2 = BLOCK(m, ctx, BX, "IfcWall", "1F_In_Toilet_B", 11500, 7500, 400, 1500, T, H1)
    # 계단 / 세면대 분리
    w1_hall_3 = BLOCK(m, ctx, BX, "IfcWall", "1F_In_Stair_W",  10000, 8000, 400, 1500, T, H1)
    # 계단&세면대 / 화장실&욕조 수직분리
    w1_hall_v = BLOCK(
        m, ctx, BX, "IfcWall", "1F_In_Vert_Mid", 11500 - T, 6000, 400, T, 4000, H1
    )

    walls_1f = [
        w1_ab_w, w1_ab_s, w1_lv_w, w1_lv_s, w1_lv_e, w1_hl_s, w1_hl_e, w1_n_all,
        w1_closet, w1_livkit, w1_div_L, w1_div_R, w1_hall_1, w1_hall_2, w1_hall_3, w1_hall_v,
    ]
    for w in walls_1f:
        set_color(m, w, *C_WHITE)
    m.create_entity(
        "IfcRelContainedInSpatialStructure",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingStructure=s1f,
        RelatedElements=[sl1_ab, sl1_lv, sl1_hl] + walls_1f,
    )

    # ═══════════════════════════════════════════════════════════════
    # 3. 2F 외벽 및 상세 내부 파티션
    # ═══════════════════════════════════════════════════════════════
    sl2_main = BLOCK(m, ctx, BX, "IfcSlab", "2F_Slab_Main",    7000, 5000, 3400, 6000, 5000, 200)
    sl2_balc = BLOCK(m, ctx, BX, "IfcSlab", "2F_Slab_Balcony", 7000, 4000, 3400, 3000, 1000, 200)
    set_color(m, sl2_main, *C_WHITE)
    set_color(m, sl2_balc, 0.85, 0.85, 0.85)

    w2_w = BLOCK(m, ctx, BX, "IfcWall", "2F_Ext_W", 7000, 5000, 3600, T, 5000, H2)
    w2_s = BLOCK(m, ctx, BX, "IfcWall", "2F_Ext_S", 7000, 5000, 3600, 6000, T, H2)
    w2_e = BLOCK(m, ctx, BX, "IfcWall", "2F_Ext_E", 13000 - T, 5000, 3600, T, 5000, H2)
    w2_n = BLOCK(m, ctx, BX, "IfcWall", "2F_Ext_N", 7000, 10000 - T, 3600, 6000, T, H2)

    # ★ 2F 상세 내부 방 구획 ★
    # 아빠사무실 / 이모방 분리
    w2_in_room = BLOCK(
        m, ctx, BX, "IfcWall", "2F_In_Room_Div", 7000, 7000, 3600, 3000, T, H2
    )
    # 방 / 계단복도 분리
    w2_in_hall = BLOCK(
        m, ctx, BX, "IfcWall", "2F_In_Hall_Div", 10000 - T, 5000, 3600, T, 5000, H2
    )
    # 사무실 장롱
    w2_in_cl1 = BLOCK(
        m, ctx, BX, "IfcWall", "2F_In_Closet_1", 11500 - T, 5000, 3600, T, 2000, H2
    )
    # 이모방 장롱
    w2_in_cl2 = BLOCK(
        m, ctx, BX, "IfcWall", "2F_In_Closet_2", 11500 - T, 8000, 3600, T, 2000, H2
    )

    rl_w = BLOCK(m, ctx, BX, "IfcWall", "2F_Rail_W", 7000, 4000, 3600, T, 1000, H3)
    rl_s = BLOCK(m, ctx, BX, "IfcWall", "2F_Rail_S", 7000, 4000, 3600, 3000, T, H3)
    rl_e = BLOCK(m, ctx, BX, "IfcWall", "2F_Rail_E", 10000 - T, 4000, 3600, T, 1000, H3)

    walls_2f = [w2_w, w2_s, w2_e, w2_n, w2_in_room, w2_in_hall, w2_in_cl1, w2_in_cl2,
                rl_w, rl_s, rl_e]
    for w in walls_2f:
        set_color(m, w, *C_WHITE)
    m.create_entity(
        "IfcRelContainedInSpatialStructure",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingStructure=s2f,
        RelatedElements=[sl2_main, sl2_balc] + walls_2f,
    )

    # ═══════════════════════════════════════════════════════════════
    # 4. 분리된 지붕 (Roofs)
    # ═══════════════════════════════════════════════════════════════
    rf_ab = BLOCK(m, ctx, BX, "IfcRoof", "Roof_1F_Anbang", 1500, 5500, 3400, 5000, 5000, 800)
    rf_lv = BLOCK(m, ctx, BX, "IfcRoof", "Roof_1F_Living", 5500, 2500, 3400, 5000, 3000, 800)
    rf_mn = BLOCK(m, ctx, BX, "IfcRoof", "Roof_2F_Main",   6500, 4500, 6600, 7000, 6000, 1200)

    roofs = [rf_ab, rf_lv, rf_mn]
    for r in roofs:
        set_color(m, r, *C_RED)
    m.create_entity(
        "IfcRelContainedInSpatialStructure",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingStructure=srf,
        RelatedElements=roofs,
    )

    m.write(OUT_PATH)
    print(f"[OK] 평면도 정밀 인테리어 분할 짱구 집 생성 완료: {OUT_PATH}")


if __name__ == "__main__":
    generate()
