"""
Highkick Sample IFC Generator  (v7.7 최종 안정화)
=================================================
"""
import ifcopenshell
import ifcopenshell.guid
import time
import os

UP = os.environ.get("USERPROFILE") or os.environ.get("HOME", "")
OUT_PATH = os.path.normpath(os.path.join(UP, "Downloads", "sample_highkick.ifc"))

T = 200   # 벽 두께
H1 = 3000  # 1F 층고
H2 = 3000  # 2F 층고
H3 = 1200  # 난간 높이
HO = 3000  # 옥탑방 높이

TOTAL_X = 15000
TOTAL_Y = 10000
CUT_X = 11000
CUT_Y = 4000


# ══════════════════════════════════════════════════════════════════════════════
# 헬퍼 함수
# ══════════════════════════════════════════════════════════════════════════════
def pt3(m, x, y, z=0.):
    return m.create_entity("IfcCartesianPoint", Coordinates=(float(x), float(y), float(z)))


def pt2(m, x, y):
    return m.create_entity("IfcCartesianPoint", Coordinates=(float(x), float(y)))


def d3(m, x, y, z):
    return m.create_entity("IfcDirection", DirectionRatios=(float(x), float(y), float(z)))


def plc(m, x, y, z, rel=None):
    a2p = m.create_entity(
        "IfcAxis2Placement3D",
        Location=pt3(m, x, y, z),
        Axis=d3(m, 0, 0, 1),
        RefDirection=d3(m, 1, 0, 0)
    )
    kw = {"RelativePlacement": a2p}
    if rel:
        kw["PlacementRelTo"] = rel
    return m.create_entity("IfcLocalPlacement", **kw)


def contain(m, oh, s, *e):
    m.create_entity(
        "IfcRelContainedInSpatialStructure",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingStructure=s,
        RelatedElements=list(e)
    )


def agg(m, oh, p, *c):
    m.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingObject=p,
        RelatedObjects=list(c)
    )


def assoc(m, oh, mat, *e):
    m.create_entity(
        "IfcRelAssociatesMaterial",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatedObjects=list(e),
        RelatingMaterial=mat
    )


def ps(m, oh, name, props, *e):
    items = []
    for k, v in props.items():
        if isinstance(v, bool):
            val = m.create_entity("IfcBoolean", wrappedValue=v)
        elif isinstance(v, float):
            val = m.create_entity("IfcReal", wrappedValue=v)
        else:
            val = m.create_entity("IfcLabel", wrappedValue=str(v))
        items.append(m.create_entity("IfcPropertySingleValue", Name=k, NominalValue=val))

    pset = m.create_entity(
        "IfcPropertySet",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name=name,
        HasProperties=items
    )
    m.create_entity(
        "IfcRelDefinesByProperties",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatedObjects=list(e),
        RelatingPropertyDefinition=pset
    )


def rb(m, ctx, xd, yd, h):
    pr = m.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=float(xd),
        YDim=float(yd)
    )
    s = m.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=pr,
        Position=m.create_entity("IfcAxis2Placement3D", Location=pt3(m, xd / 2, yd / 2, 0)),
        ExtrudedDirection=d3(m, 0, 0, 1),
        Depth=float(h)
    )
    return m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[s]
    )


def ra(m, ctx, length, orient):
    if orient == "X":
        pts = [pt2(m, 0, 0), pt2(m, length, 0)]
    else:
        pts = [pt2(m, 0, 0), pt2(m, 0, length)]

    return m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="Axis",
        RepresentationType="Curve2D",
        Items=[m.create_entity("IfcPolyline", Points=pts)]
    )


def rfp(m, ctx, w, d):
    pts = [pt2(m, 0, 0), pt2(m, w, 0), pt2(m, w, d), pt2(m, 0, d), pt2(m, 0, 0)]
    polyline = m.create_entity("IfcPolyline", Points=pts)
    cs = m.create_entity("IfcGeometricCurveSet", Elements=[polyline])
    return m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="FootPrint",
        RepresentationType="GeometricCurveSet",
        Items=[cs]
    )


def rbox(m, ctx, xd, yd, zd):
    bb = m.create_entity(
        "IfcBoundingBox",
        Corner=pt3(m, 0, 0, 0),
        XDim=float(xd),
        YDim=float(yd),
        ZDim=float(zd)
    )
    return m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="Box",
        RepresentationType="BoundingBox",
        Items=[bb]
    )


def W(m, B, A, BX, name, x, y, z, length, height, thick, orient="X"):
    if orient == "X":
        xd, yd = float(length), float(thick)
    else:
        xd, yd = float(thick), float(length)

    shape = m.create_entity(
        "IfcProductDefinitionShape",
        Representations=[
            ra(m, A, length, orient),
            rb(m, B, xd, yd, height),
            rbox(m, BX, xd, yd, height)
        ]
    )
    return m.create_entity(
        "IfcWallStandardCase",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        ObjectPlacement=plc(m, x, y, z),
        Representation=shape
    )


def COL(m, B, BX, name, x, y, z, w, d, h):
    shape = m.create_entity(
        "IfcProductDefinitionShape",
        Representations=[rb(m, B, w, d, h), rbox(m, BX, w, d, h)]
    )
    return m.create_entity(
        "IfcColumn",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        ObjectPlacement=plc(m, x, y, z),
        Representation=shape
    )


def SL(m, B, BX, name, x, y, z, w, d, h=200):
    shape = m.create_entity(
        "IfcProductDefinitionShape",
        Representations=[rb(m, B, w, d, h), rbox(m, BX, w, d, h)]
    )
    return m.create_entity(
        "IfcSlab",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        PredefinedType="FLOOR",
        ObjectPlacement=plc(m, x, y, z),
        Representation=shape
    )


def RF(m, B, BX, name, x, y, z, w, d, h=300):
    shape = m.create_entity(
        "IfcProductDefinitionShape",
        Representations=[rb(m, B, w, d, h), rbox(m, BX, w, d, h)]
    )
    return m.create_entity(
        "IfcRoof",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        ObjectPlacement=plc(m, x, y, z),
        Representation=shape
    )


def SP(m, FP, BX, name, x, y, z, w, d, h):
    shape = m.create_entity(
        "IfcProductDefinitionShape",
        Representations=[rfp(m, FP, w, d), rbox(m, BX, w, d, h)]
    )
    return m.create_entity(
        "IfcSpace",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        LongName=name,
        CompositionType="ELEMENT",
        ObjectPlacement=plc(m, x, y, z),
        Representation=shape
    )


def STAIR(m, ctx, name, x, y, z, w, d, h):
    # 10개의 단(Step)을 생성하여 실제 계단처럼 쌓아 올리는 안전한 방식
    steps = 10
    step_d = d / steps
    step_h = h / steps
    items = []
    for i in range(steps):
        pr = m.create_entity(
            "IfcRectangleProfileDef",
            ProfileType="AREA",
            XDim=float(w),
            YDim=float(step_d)
        )
        pos = m.create_entity(
            "IfcAxis2Placement3D",
            Location=pt3(m, w / 2, i * step_d + step_d / 2, 0)
        )
        s = m.create_entity(
            "IfcExtrudedAreaSolid",
            SweptArea=pr,
            Position=pos,
            ExtrudedDirection=d3(m, 0, 0, 1),
            Depth=float(step_h * (i + 1))
        )
        items.append(s)

    rep = m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=items
    )
    shape = m.create_entity(
        "IfcProductDefinitionShape",
        Representations=[rep, rbox(m, ctx, w, d, h)]
    )
    return m.create_entity(
        "IfcStair",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        ObjectPlacement=plc(m, x, y, z),
        Representation=shape
    )


def storey(m, oh, bpl, name, elev):
    return m.create_entity(
        "IfcBuildingStorey",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name=name,
        Elevation=float(elev),
        CompositionType="ELEMENT",
        ObjectPlacement=plc(m, 0, 0, elev, rel=bpl)
    )


def mat_usage(m, name, thick):
    mt = m.create_entity("IfcMaterial", Name=name)
    layer = m.create_entity(
        "IfcMaterialLayer",
        Material=mt,
        LayerThickness=float(thick),
        IsVentilated=False
    )
    ls = m.create_entity(
        "IfcMaterialLayerSet",
        MaterialLayers=[layer],
        LayerSetName=name
    )
    return m.create_entity(
        "IfcMaterialLayerSetUsage",
        ForLayerSet=ls,
        LayerSetDirection="AXIS2",
        DirectionSense="POSITIVE",
        OffsetFromReferenceLine=0.
    )


# ══════════════════════════════════════════════════════════════════════════════
# 메인 생성 로직
# ══════════════════════════════════════════════════════════════════════════════
def generate():
    m = ifcopenshell.file(schema="IFC4")
    oh = m.create_entity(
        "IfcOwnerHistory",
        OwningUser=m.create_entity(
            "IfcPersonAndOrganization",
            ThePerson=m.create_entity("IfcPerson", FamilyName="BATANG"),
            TheOrganization=m.create_entity("IfcOrganization", Name="BATANG")
        ),
        OwningApplication=m.create_entity(
            "IfcApplication",
            ApplicationDeveloper=m.create_entity("IfcOrganization", Name="BATANG AI"),
            Version="7.7",
            ApplicationFullName="BATANG LLM-3D",
            ApplicationIdentifier="BATANG_LLM3D"
        ),
        ChangeAction="ADDED",
        CreationDate=int(time.time())
    )

    units = m.create_entity(
        "IfcUnitAssignment",
        Units=[
            m.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Prefix="MILLI", Name="METRE"),
            m.create_entity("IfcSIUnit", UnitType="AREAUNIT", Name="SQUARE_METRE"),
            m.create_entity("IfcSIUnit", UnitType="VOLUMEUNIT", Name="CUBIC_METRE"),
            m.create_entity("IfcSIUnit", UnitType="PLANEANGLEUNIT", Name="RADIAN")
        ]
    )

    ctx = m.create_entity(
        "IfcGeometricRepresentationContext",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=m.create_entity(
            "IfcAxis2Placement3D",
            Location=pt3(m, 0, 0, 0)
        )
    )
    B = m.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="Body",
        ContextType="Model",
        ParentContext=ctx,
        TargetView="MODEL_VIEW"
    )
    A = m.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="Axis",
        ContextType="Model",
        ParentContext=ctx,
        TargetView="GRAPH_VIEW"
    )
    FP = m.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="FootPrint",
        ContextType="Model",
        ParentContext=ctx,
        TargetView="MODEL_VIEW"
    )
    BX = m.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="Box",
        ContextType="Plan",
        ParentContext=ctx,
        TargetView="MODEL_VIEW"
    )

    project = m.create_entity(
        "IfcProject",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name="BATANG_HaikickHouse",
        UnitsInContext=units,
        RepresentationContexts=[ctx]
    )
    spl = plc(m, 0, 0, 0)
    site = m.create_entity(
        "IfcSite",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name="Site",
        ObjectPlacement=spl
    )
    bpl = plc(m, 0, 0, 0, rel=spl)
    bldg = m.create_entity(
        "IfcBuilding",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name="HaikickHouse",
        ObjectPlacement=bpl
    )
    agg(m, oh, project, site)
    agg(m, oh, site, bldg)

    s1f = storey(m, oh, bpl, "1F", 0)
    s2f = storey(m, oh, bpl, "2F", H1)
    srf = storey(m, oh, bpl, "RF", H1 + H2)
    agg(m, oh, bldg, s1f, s2f, srf)

    u_ext = mat_usage(m, "Concrete", T)
    u_int = mat_usage(m, "Concrete", T)
    m_sl = m.create_entity("IfcMaterial", Name="Concrete")
    m_rf = m.create_entity("IfcMaterial", Name="Membrane")

    # ═══════════════════════════════════════════════════════════════
    # 1F
    # ═══════════════════════════════════════════════════════════════
    sl1 = SL(m, B, BX, "1F_Floor", 0, 0, -T, TOTAL_X, TOTAL_Y)

    w1_west = W(m, B, A, BX, "1F_West_Wall", 0, 0, 0, TOTAL_Y, H1, T, "Y")
    w1_north = W(m, B, A, BX, "1F_North_Wall", 0, TOTAL_Y - T, 0, TOTAL_X, H1, T, "X")
    w1_south = W(m, B, A, BX, "1F_South_Wall", 0, 0, 0, CUT_X, H1, T, "X")
    w1_east = W(m, B, A, BX, "1F_East_Wall", TOTAL_X - T, CUT_Y, 0, TOTAL_Y - CUT_Y, H1, T, "Y")

    w1_porch_w = W(
        m, B, A, BX, "1F_Piloti_InnerWest_Wall",
        CUT_X - T, 0, 0, CUT_Y, H1, T, "Y"
    )
    w1_porch_n = W(
        m, B, A, BX, "1F_Piloti_InnerNorth_Wall",
        CUT_X, CUT_Y - T, 0, TOTAL_X - CUT_X, H1, T, "X"
    )

    col_1f = COL(m, B, BX, "1F_Piloti_Column", TOTAL_X - T, 0, 0, T, T, H1)

    w1_int_L_vert = W(m, B, A, BX, "1F_Left_Vertical_Divider", 5000, 0, 0, TOTAL_Y, H1, T, "Y")
    w1_int_L_horz = W(m, B, A, BX, "1F_Left_Horizontal_Divider", 0, 5000, 0, 5000, H1, T, "X")
    w1_int_R_vert = W(
        m, B, A, BX, "1F_Right_Vertical_Divider",
        CUT_X, CUT_Y, 0, TOTAL_Y - CUT_Y, H1, T, "Y"
    )
    w1_int_C_horz = W(m, B, A, BX, "1F_Center_Horizontal_Divider", 5000, 4000, 0, 4000, H1, T, "X")

    stair_1f = STAIR(m, ctx, "Stair_1Fto2F", T, 5200, 0, 1500, 4000, H1)

    ext1 = [w1_west, w1_north, w1_south, w1_east, w1_porch_w, w1_porch_n]
    int1 = [w1_int_L_vert, w1_int_L_horz, w1_int_R_vert, w1_int_C_horz]

    sp1 = SP(m, FP, BX, "1F_Indoor_Space", 0, 0, 0, TOTAL_X, TOTAL_Y, H1)
    contain(m, oh, s1f, sp1, sl1, col_1f, stair_1f, *ext1, *int1)
    assoc(m, oh, u_ext, *ext1)
    assoc(m, oh, u_int, *int1)
    assoc(m, oh, m_sl, sl1)
    for w in ext1:
        ps(
            m, oh, "Pset_WallCommon",
            {"IsExternal": True, "LoadBearing": True, "ThermalTransmittance": 1.5},
            w
        )
    for w in int1:
        ps(
            m, oh, "Pset_WallCommon",
            {"IsExternal": False, "LoadBearing": False, "ThermalTransmittance": 2.0},
            w
        )

    # ═══════════════════════════════════════════════════════════════
    # 2F
    # ═══════════════════════════════════════════════════════════════
    sl2 = SL(m, B, BX, "2F_Floor", 0, 0, H1 - T, TOTAL_X, TOTAL_Y)

    w2_west = W(m, B, A, BX, "2F_West_Wall", 0, 0, H1, TOTAL_Y, H2, T, "Y")
    w2_north = W(m, B, A, BX, "2F_North_Wall", 0, TOTAL_Y - T, H1, TOTAL_X, H2, T, "X")
    w2_south = W(m, B, A, BX, "2F_South_Wall", 0, 0, H1, CUT_X, H2, T, "X")
    w2_east = W(m, B, A, BX, "2F_East_Wall", TOTAL_X - T, CUT_Y, H1, TOTAL_Y - CUT_Y, H2, T, "Y")

    w2_terr_w = W(
        m, B, A, BX, "2F_MasterBedroom_InnerWest_Wall",
        CUT_X - T, 0, H1, CUT_Y, H2, T, "Y"
    )
    w2_terr_n = W(
        m, B, A, BX, "2F_Terrace_InnerNorth_Wall",
        CUT_X, CUT_Y - T, H1, TOTAL_X - CUT_X, H2, T, "X"
    )

    w2_rl_s = W(m, B, A, BX, "2F_Terrace_Railing_South", CUT_X, 0, H1, TOTAL_X - CUT_X, H3, T, "X")
    w2_rl_e = W(m, B, A, BX, "2F_Terrace_Railing_East", TOTAL_X - T, 0, H1, CUT_Y, H3, T, "Y")

    w2_int_L_vert = W(m, B, A, BX, "2F_Left_Bedrooms_Divider", 5000, 0, H1, TOTAL_Y, H2, T, "Y")
    w2_int_L_horz = W(m, B, A, BX, "2F_Left_Bedrooms_Split", 0, 5000, H1, 5000, H2, T, "X")
    w2_int_R_vert = W(
        m, B, A, BX, "2F_Right_MasterBed_Divider",
        CUT_X, CUT_Y, H1, TOTAL_Y - CUT_Y, H2, T, "Y"
    )
    w2_bath_n = W(m, B, A, BX, "2F_Bathroom_North_Wall", 5000, 7000 - T, H1, 3000, H2, T, "X")

    stair_2f = STAIR(m, ctx, "Stair_2FtoRF", T, 5200, H1, 1500, 4000, H2)

    ext2 = [w2_west, w2_north, w2_south, w2_east, w2_terr_w, w2_terr_n]
    int2 = [w2_int_L_vert, w2_int_L_horz, w2_int_R_vert, w2_bath_n]
    rl2 = [w2_rl_s, w2_rl_e]

    sp2 = SP(m, FP, BX, "2F_Indoor_Space", 0, 0, H1, TOTAL_X, TOTAL_Y, H2)
    contain(m, oh, s2f, sp2, sl2, stair_2f, *ext2, *int2, *rl2)
    assoc(m, oh, u_ext, *(ext2 + rl2))
    assoc(m, oh, u_int, *int2)
    assoc(m, oh, m_sl, sl2)
    for w in ext2:
        ps(
            m, oh, "Pset_WallCommon",
            {"IsExternal": True, "LoadBearing": True, "ThermalTransmittance": 1.5},
            w
        )
    for w in rl2:
        ps(
            m, oh, "Pset_WallCommon",
            {"IsExternal": True, "LoadBearing": False, "ThermalTransmittance": 1.5},
            w
        )
    for w in int2:
        ps(
            m, oh, "Pset_WallCommon",
            {"IsExternal": False, "LoadBearing": False, "ThermalTransmittance": 2.0},
            w
        )

    # ═══════════════════════════════════════════════════════════════
    # RF
    # ═══════════════════════════════════════════════════════════════
    z2_base = H1 + H2

    sl3_left = SL(m, B, BX, "RF_Slab_Left", 0, 0, z2_base - T, CUT_X, TOTAL_Y)
    sl3_top = SL(
        m, B, BX, "RF_Slab_Top",
        CUT_X, CUT_Y, z2_base - T, TOTAL_X - CUT_X, TOTAL_Y - CUT_Y
    )

    w3_rl_w = W(m, B, A, BX, "RF_Railing_West", 0, 0, z2_base, TOTAL_Y, H3, T, "Y")
    w3_rl_n = W(m, B, A, BX, "RF_Railing_North", 0, TOTAL_Y - T, z2_base, TOTAL_X, H3, T, "X")
    w3_rl_s = W(m, B, A, BX, "RF_Railing_South", 0, 0, z2_base, CUT_X, H3, T, "X")
    w3_rl_e = W(
        m, B, A, BX, "RF_Railing_East",
        TOTAL_X - T, CUT_Y, z2_base, TOTAL_Y - CUT_Y, H3, T, "Y"
    )
    w3_rl_tw = W(m, B, A, BX, "RF_Railing_InnerWest", CUT_X - T, 0, z2_base, CUT_Y, H3, T, "Y")
    w3_rl_tn = W(
        m, B, A, BX, "RF_Railing_InnerNorth",
        CUT_X, CUT_Y - T, z2_base, TOTAL_X - CUT_X, H3, T, "X"
    )

    w3_st_w = W(m, B, A, BX, "RF_Stairwell_West", 0, 5000, z2_base, 5000, HO, T, "Y")
    w3_st_s = W(m, B, A, BX, "RF_Stairwell_South", 0, 5000, z2_base, 3000, HO, T, "X")
    w3_st_e = W(m, B, A, BX, "RF_Stairwell_East", 3000 - T, 5000, z2_base, 5000, HO, T, "Y")
    w3_st_n = W(m, B, A, BX, "RF_Stairwell_North", 0, 10000 - T, z2_base, 3000, HO, T, "X")

    w3_mr_w = W(m, B, A, BX, "RF_MinyongRoom_West", 8000, 6000, z2_base, 4000, HO, T, "Y")
    w3_mr_s = W(m, B, A, BX, "RF_MinyongRoom_South", 8000, 6000, z2_base, 4000, HO, T, "X")
    w3_mr_e = W(m, B, A, BX, "RF_MinyongRoom_East", 12000 - T, 6000, z2_base, 4000, HO, T, "Y")
    w3_mr_n = W(m, B, A, BX, "RF_MinyongRoom_North", 8000, 10000 - T, z2_base, 4000, HO, T, "X")

    rf_st = RF(m, B, BX, "RF_Stairwell_Roof", 0, 5000, z2_base + HO, 3000, 5000)
    rf_mr = RF(m, B, BX, "RF_Roof", 8000, 6000, z2_base + HO, 4000, 4000)

    ext3 = [
        w3_rl_w, w3_rl_n, w3_rl_s, w3_rl_e, w3_rl_tw, w3_rl_tn,
        w3_st_w, w3_st_s, w3_st_e, w3_st_n, w3_mr_w, w3_mr_s, w3_mr_e, w3_mr_n
    ]

    sp3 = SP(m, FP, BX, "RF_Space", 0, 0, z2_base, TOTAL_X, TOTAL_Y, HO)
    contain(m, oh, srf, sp3, sl3_left, sl3_top, rf_st, rf_mr, *ext3)
    assoc(m, oh, u_ext, *ext3)
    assoc(m, oh, m_sl, sl3_left, sl3_top)
    assoc(m, oh, m_rf, rf_st, rf_mr)
    for w in ext3:
        ps(
            m, oh, "Pset_WallCommon",
            {"IsExternal": True, "LoadBearing": True, "ThermalTransmittance": 1.5},
            w
        )

    m.write(OUT_PATH)
    print("[OK] v7.7 - 누락된 SP 함수 복구 및 최종 안정화 완료:", OUT_PATH)


if __name__ == "__main__":
    generate()
