"""
BATANG Sample IFC Generator  (v6 - ㄴ자 2F 레이아웃)
=====================================================
설계 의도:
  1F : Living Room 8000×6000  (꽉 찬 직사각형)
  2F : Bathroom 3000×3000 (좌하단) + Bedroom 5000×5000 (우하단)
       → 합치면 ㄴ자 형태, 1F보다 작은 발자국

       y=5000  ┌────────────────────┐
               │     Bedroom        │
       y=3000  ├──────┐             │
               │Bath  │  Partition  │
       y=0     └──────┴─────────────┘
               x=0  x=3000       x=8000

  RF : 지붕 슬래브 8000×6000

벽 설계 (이중벽 없음):
  1F : South/North 전체폭 + West/East 코너 포함 전체 높이
  2F : 각 방의 외벽 + 단일 칸막이벽(Partition, x=2800~3000)
  칸막이는 Bathroom 동쪽 = Bedroom 서쪽 → 요소 하나로 통합

테스트 코드 호환:
  04 "화장실 북쪽 벽" → 2F_Bathroom_North_Wall
  03 "안방 ㄴ자 꺾인 서쪽 벽면" → 2F_Partition_Wall (파이프라인 판단)
"""
import ifcopenshell
import ifcopenshell.guid
import time
import os

UP = os.environ.get("USERPROFILE") or os.environ.get("HOME", "")
OUT_PATH = os.path.normpath(os.path.join(UP, "Downloads", "batang_sample.ifc"))


# ══════════════════════════════════════════════════════════════════════════════
# 헬퍼
# ══════════════════════════════════════════════════════════════════════════════
def pt3(m, x, y, z=0.):
    return m.create_entity("IfcCartesianPoint", Coordinates=(float(x), float(y), float(z)))


def pt2(m, x, y):
    return m.create_entity("IfcCartesianPoint", Coordinates=(float(x), float(y)))


def d3(m, x, y, z):
    return m.create_entity("IfcDirection", DirectionRatios=(float(x), float(y), float(z)))


def pl(m, x, y, z, rel=None):
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


def contain(m, oh, struc, *elems):
    m.create_entity(
        "IfcRelContainedInSpatialStructure",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingStructure=struc,
        RelatedElements=list(elems)
    )


def agg(m, oh, parent, *children):
    m.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatingObject=parent,
        RelatedObjects=list(children)
    )


def mat(m, oh, material, *elems):
    m.create_entity(
        "IfcRelAssociatesMaterial",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        RelatedObjects=list(elems),
        RelatingMaterial=material
    )


def pset(m, oh, name, props, *elems):
    items = []
    for k, v in props.items():
        if isinstance(v, bool):
            val = m.create_entity("IfcBoolean", wrappedValue=v)
        elif isinstance(v, float):
            val = m.create_entity("IfcReal", wrappedValue=v)
        else:
            val = m.create_entity("IfcLabel", wrappedValue=str(v))
        items.append(m.create_entity("IfcPropertySingleValue", Name=k, NominalValue=val))

    ps = m.create_entity(
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
        RelatedObjects=list(elems),
        RelatingPropertyDefinition=ps
    )


# ── Representation ────────────────────────────────────────────────────────────
def r_body(m, ctx, xd, yd, h):
    prof = m.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=float(xd),
        YDim=float(yd)
    )
    solid = m.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=prof,
        Position=m.create_entity(
            "IfcAxis2Placement3D",
            Location=pt3(m, xd / 2, yd / 2, 0)
        ),
        ExtrudedDirection=d3(m, 0, 0, 1),
        Depth=float(h)
    )
    return m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[solid]
    )


def r_axis(m, ctx, length, orient):
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


def r_fp(m, ctx, w, d):
    pts = [pt2(m, 0, 0), pt2(m, w, 0), pt2(m, w, d), pt2(m, 0, d), pt2(m, 0, 0)]
    cs = m.create_entity(
        "IfcGeometricCurveSet",
        Elements=[m.create_entity("IfcPolyline", Points=pts)]
    )
    return m.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=ctx,
        RepresentationIdentifier="FootPrint",
        RepresentationType="GeometricCurveSet",
        Items=[cs]
    )


def r_box(m, ctx, xd, yd, zd):
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


# ── 요소 팩토리 ───────────────────────────────────────────────────────────────
def wall(m, b, a, bx, name, x, y, z, length, height, thick, orient="X"):
    """
    orient=X: XDim=length, YDim=thick  (남/북벽)
    orient=Y: XDim=thick,  YDim=length (동/서벽)
    배치 좌표 (x,y,z)가 벽의 좌하단 모서리
    """
    if orient == "X":
        xd, yd = float(length), float(thick)
    else:
        xd, yd = float(thick), float(length)

    shape = m.create_entity(
        "IfcProductDefinitionShape",
        Representations=[
            r_axis(m, a, length, orient),
            r_body(m, b, xd, yd, height),
            r_box(m, bx, xd, yd, height),
        ]
    )
    return m.create_entity(
        "IfcWallStandardCase",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        ObjectPlacement=pl(m, x, y, z),
        Representation=shape
    )


def slab(m, b, f, bx, name, x, y, z, w, d, h=200):
    shape = m.create_entity(
        "IfcProductDefinitionShape",
        Representations=[
            r_fp(m, f, w, d),
            r_body(m, b, w, d, h),
            r_box(m, bx, w, d, h)
        ]
    )
    return m.create_entity(
        "IfcSlab",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        PredefinedType="FLOOR",
        ObjectPlacement=pl(m, x, y, z),
        Representation=shape
    )


def roof(m, b, f, bx, name, x, y, z, w, d, h=300):
    shape = m.create_entity(
        "IfcProductDefinitionShape",
        Representations=[
            r_fp(m, f, w, d),
            r_body(m, b, w, d, h),
            r_box(m, bx, w, d, h)
        ]
    )
    return m.create_entity(
        "IfcRoof",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        ObjectPlacement=pl(m, x, y, z),
        Representation=shape
    )


def space(m, f, bx, name, x, y, z, w, d, h):
    shape = m.create_entity(
        "IfcProductDefinitionShape",
        Representations=[
            r_fp(m, f, w, d),
            r_box(m, bx, w, d, h)
        ]
    )
    return m.create_entity(
        "IfcSpace",
        GlobalId=ifcopenshell.guid.new(),
        Name=name,
        LongName=name,
        CompositionType="ELEMENT",
        ObjectPlacement=pl(m, x, y, z),
        Representation=shape
    )


def storey(m, oh, bldg_pl, name, elev):
    p = pl(m, 0, 0, elev, rel=bldg_pl)
    return m.create_entity(
        "IfcBuildingStorey",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name=name,
        Elevation=float(elev),
        CompositionType="ELEMENT",
        ObjectPlacement=p
    )


def layer_usage(m, name, thick):
    mat_e = m.create_entity("IfcMaterial", Name=name)
    layer = m.create_entity(
        "IfcMaterialLayer",
        Material=mat_e,
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
# 메인
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
            Version="6.0",
            ApplicationFullName="BATANG LLM-3D Generator",
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
            m.create_entity("IfcSIUnit", UnitType="PLANEANGLEUNIT", Name="RADIAN"),
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

    def sub(ident, ctype, view):
        return m.create_entity(
            "IfcGeometricRepresentationSubContext",
            ContextIdentifier=ident,
            ContextType=ctype,
            ParentContext=ctx,
            TargetView=view
        )

    B = sub("Body", "Model", "MODEL_VIEW")
    A = sub("Axis", "Model", "GRAPH_VIEW")
    FP = sub("FootPrint", "Model", "MODEL_VIEW")
    BX = sub("Box", "Plan", "MODEL_VIEW")

    project = m.create_entity(
        "IfcProject",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name="BATANG_Sample",
        UnitsInContext=units,
        RepresentationContexts=[ctx]
    )
    site_pl = pl(m, 0, 0, 0)
    site = m.create_entity(
        "IfcSite",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name="Site",
        ObjectPlacement=site_pl
    )
    bldg_pl = pl(m, 0, 0, 0, rel=site_pl)
    bldg = m.create_entity(
        "IfcBuilding",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=oh,
        Name="Building",
        ObjectPlacement=bldg_pl
    )
    agg(m, oh, project, site)
    agg(m, oh, site, bldg)

    s1f = storey(m, oh, bldg_pl, "1F", 0)
    s2f = storey(m, oh, bldg_pl, "2F", 3000)
    srf = storey(m, oh, bldg_pl, "RF", 5800)
    agg(m, oh, bldg, s1f, s2f, srf)

    u_ext = layer_usage(m, "Concrete", 200)
    u_int = layer_usage(m, "Concrete", 200)
    m_slab = m.create_entity("IfcMaterial", Name="Concrete")
    m_roof = m.create_entity("IfcMaterial", Name="Membrane")

    T = 200          # 벽 두께
    H1 = 3000         # 1F 층고
    H2 = 2800         # 2F 층고
    BX_1F, BY_1F = 8000, 6000   # 1F 발자국
    BW, BD = 3000, 3000   # Bathroom 폭, 깊이
    RW, RD = 5000, 5000   # Bedroom 폭, 깊이

    # ══════════════════════════════════════════════════════════════════════════
    # 1F — Living Room  8000 × 6000
    # 남/북벽: 전체 폭 8000 담당 (y=0, y=5800)
    # 동/서벽: 남/북벽 포함 전체 높이 6000 (x=0, x=7800)
    # ══════════════════════════════════════════════════════════════════════════
    w1s = wall(m, B, A, BX, "1F_LivingRoom_South_Wall", 0, 0, 0, BX_1F, H1, T, "X")
    w1n = wall(m, B, A, BX, "1F_LivingRoom_North_Wall", 0, BY_1F - T, 0, BX_1F, H1, T, "X")
    w1w = wall(m, B, A, BX, "1F_LivingRoom_West_Wall", 0, 0, 0, BY_1F, H1, T, "Y")
    w1e = wall(m, B, A, BX, "1F_LivingRoom_East_Wall", BX_1F - T, 0, 0, BY_1F, H1, T, "Y")

    sl1 = slab(m, B, FP, BX, "1F_LivingRoom_Floor", 0, 0, -T, BX_1F, BY_1F)
    sp1 = space(m, FP, BX, "Living Room", 0, 0, 0, BX_1F, BY_1F, H1)

    agg(m, oh, s1f, sp1)
    contain(m, oh, sp1, w1s, w1n, w1w, w1e)
    contain(m, oh, s1f, sl1)
    mat(m, oh, u_ext, w1s, w1n, w1w, w1e)
    mat(m, oh, m_slab, sl1)
    for w in [w1s, w1n, w1w, w1e]:
        pset(m, oh, "Pset_WallCommon",
             {"IsExternal": True, "LoadBearing": True, "ThermalTransmittance": 1.5}, w)
    pset(m, oh, "Pset_SlabCommon", {"IsExternal": False, "LoadBearing": True}, sl1)

    # ══════════════════════════════════════════════════════════════════════════
    # 2F — ㄴ자 레이아웃
    # Bathroom walls
    # ══════════════════════════════════════════════════════════════════════════
    w_bath_s = wall(m, B, A, BX, "2F_Bathroom_South_Wall", 0, 0, H1, BW, H2, T, "X")
    w_bath_n = wall(m, B, A, BX, "2F_Bathroom_North_Wall", 0, BD - T, H1, BW, H2, T, "X")
    w_bath_w = wall(m, B, A, BX, "2F_Bathroom_West_Wall", 0, 0, H1, BD, H2, T, "Y")

    # 단일 칸막이 (Bathroom 동쪽 = Bedroom 서쪽)
    w_part = wall(m, B, A, BX, "2F_Partition_Wall", BW - T, 0, H1, RD, H2, T, "Y")

    # Bedroom walls
    w_bed_s = wall(m, B, A, BX, "2F_Bedroom_South_Wall", BW, 0, H1, RW, H2, T, "X")
    w_bed_n = wall(m, B, A, BX, "2F_Bedroom_North_Wall", BW, RD - T, H1, RW, H2, T, "X")
    w_bed_e = wall(m, B, A, BX, "2F_Bedroom_East_Wall", BW + RW - T, 0, H1, RD, H2, T, "Y")

    # 2F 슬래브 (전체 1F 발자국 위에 걸침)
    sl2 = slab(m, B, FP, BX, "2F_Floor", 0, 0, H1 - T, BX_1F, BY_1F)

    # 공간 (FootPrint는 각 방의 실제 면적)
    sp_bath = space(m, FP, BX, "Bathroom", 0, 0, H1, BW, BD, H2)
    sp_bed = space(m, FP, BX, "Bedroom", BW, 0, H1, RW, RD, H2)

    agg(m, oh, s2f, sp_bath, sp_bed)
    contain(m, oh, sp_bath, w_bath_s, w_bath_n, w_bath_w, w_part)
    contain(m, oh, sp_bed, w_bed_s, w_bed_n, w_bed_e, w_part)
    contain(m, oh, s2f, sl2)

    ext_2f = [w_bath_s, w_bath_n, w_bath_w, w_bed_s, w_bed_n, w_bed_e]
    mat(m, oh, u_ext, *ext_2f)
    mat(m, oh, u_int, w_part)
    mat(m, oh, m_slab, sl2)
    for w in ext_2f:
        pset(m, oh, "Pset_WallCommon",
             {"IsExternal": True, "LoadBearing": True, "ThermalTransmittance": 1.5}, w)
    pset(m, oh, "Pset_WallCommon",
         {"IsExternal": False, "LoadBearing": False, "ThermalTransmittance": 2.0}, w_part)
    pset(m, oh, "Pset_SlabCommon", {"IsExternal": False, "LoadBearing": True}, sl2)

    # ══════════════════════════════════════════════════════════════════════════
    # RF — 지붕
    # ══════════════════════════════════════════════════════════════════════════
    rf = roof(m, B, FP, BX, "RF_Roof", 0, 0, H1 + H2, BX_1F, BY_1F)
    contain(m, oh, srf, rf)
    mat(m, oh, m_roof, rf)
    pset(m, oh, "Pset_RoofCommon", {"IsExternal": True, "ThermalTransmittance": 0.25}, rf)

    m.write(OUT_PATH)
    print("[OK] IFC generated:", OUT_PATH)

    # 검증
    v = ifcopenshell.open(OUT_PATH)
    print(f"\n  벽: {len(v.by_type('IfcWallStandardCase'))}  "
          f"슬래브: {len(v.by_type('IfcSlab'))}  "
          f"지붕: {len(v.by_type('IfcRoof'))}  "
          f"공간: {len(v.by_type('IfcSpace'))}")

    print("\n  [Plans: Storey ObjectPlacement]")
    for s in v.by_type("IfcBuildingStorey"):
        z = s.ObjectPlacement.RelativePlacement.Location.Coordinates[2]
        print(f"  ✅ {s.Name}  z={z:.0f}mm")

    print("\n  [벽 점유 영역]")
    for w in v.by_type("IfcWallStandardCase"):
        loc = w.ObjectPlacement.RelativePlacement.Location.Coordinates
        for rep in w.Representation.Representations:
            if rep.RepresentationIdentifier == "Body":
                for item in rep.Items:
                    if item.is_a("IfcExtrudedAreaSolid"):
                        p = item.SweptArea
                        x0, y0, z0 = loc
                        print(f"  {w.Name:35s}  "
                              f"X:{x0:.0f}~{x0 + p.XDim:.0f}  "
                              f"Y:{y0:.0f}~{y0 + p.YDim:.0f}  "
                              f"Z:{z0:.0f}~{z0 + item.Depth:.0f}")


if __name__ == "__main__":
    generate()