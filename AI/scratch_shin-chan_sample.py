from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

import ifcopenshell
import ifcopenshell.guid


OUT_PATH = Path(__file__).resolve().parent / "tests" / "sample_shinchan.ifc"

MM = 1.0
WALL_T = 200 * MM
FLOOR_T = 200 * MM
STOREY_H = 3000 * MM


@dataclass(frozen=True)
class BoxSpec:
    ifc_class: str
    name: str
    x: float
    y: float
    z: float
    w: float
    d: float
    h: float
    color: tuple[float, float, float]


@dataclass(frozen=True)
class RoofSpec:
    name: str
    x: float
    y: float
    z: float
    w: float
    d: float
    h: float
    ridge_x1: float
    ridge_x2: float
    ridge_y: float
    color: tuple[float, float, float]


@dataclass(frozen=True)
class SpaceSpec:
    name: str
    x: float
    y: float
    z: float


def guid() -> str:
    return ifcopenshell.guid.new()


def point(model: ifcopenshell.file, x: float, y: float, z: float = 0.0):
    return model.create_entity("IfcCartesianPoint", Coordinates=(float(x), float(y), float(z)))


def direction(model: ifcopenshell.file, x: float, y: float, z: float):
    return model.create_entity("IfcDirection", DirectionRatios=(float(x), float(y), float(z)))


def axis2(model: ifcopenshell.file, x: float, y: float, z: float):
    return model.create_entity(
        "IfcAxis2Placement3D",
        Location=point(model, x, y, z),
        Axis=direction(model, 0, 0, 1),
        RefDirection=direction(model, 1, 0, 0),
    )


def local_placement(
    model: ifcopenshell.file,
    x: float,
    y: float,
    z: float,
    relative_to=None,
):
    kwargs = {"RelativePlacement": axis2(model, x, y, z)}
    if relative_to is not None:
        kwargs["PlacementRelTo"] = relative_to
    return model.create_entity("IfcLocalPlacement", **kwargs)


def aggregate(model: ifcopenshell.file, owner_history, parent, children) -> None:
    model.create_entity(
        "IfcRelAggregates",
        GlobalId=guid(),
        OwnerHistory=owner_history,
        RelatingObject=parent,
        RelatedObjects=list(children),
    )


def contain(model: ifcopenshell.file, owner_history, storey, elements) -> None:
    model.create_entity(
        "IfcRelContainedInSpatialStructure",
        GlobalId=guid(),
        OwnerHistory=owner_history,
        RelatingStructure=storey,
        RelatedElements=list(elements),
    )


def make_owner_history(model: ifcopenshell.file):
    person = model.create_entity("IfcPerson", Identification="codex", FamilyName="Codex")
    org = model.create_entity("IfcOrganization", Identification="BATANG", Name="BATANG AI")
    user = model.create_entity("IfcPersonAndOrganization", ThePerson=person, TheOrganization=org)
    app = model.create_entity(
        "IfcApplication",
        ApplicationDeveloper=org,
        Version="1.0",
        ApplicationFullName="Scratch Shin-chan IFC Generator",
        ApplicationIdentifier="scratch_shinchan_house",
    )
    return model.create_entity(
        "IfcOwnerHistory",
        OwningUser=user,
        OwningApplication=app,
        ChangeAction="ADDED",
        CreationDate=int(time.time()),
    )


def make_contexts(model: ifcopenshell.file):
    world = model.create_entity("IfcAxis2Placement3D", Location=point(model, 0, 0, 0))
    model_context = model.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Model",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=world,
    )
    body_context = model.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="Body",
        ContextType="Model",
        ParentContext=model_context,
        TargetView="MODEL_VIEW",
    )
    box_context = model.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="Box",
        ContextType="Plan",
        ParentContext=model_context,
        TargetView="MODEL_VIEW",
    )
    return model_context, body_context, box_context


def make_units(model: ifcopenshell.file):
    return model.create_entity(
        "IfcUnitAssignment",
        Units=[
            model.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Prefix="MILLI", Name="METRE"),
            model.create_entity("IfcSIUnit", UnitType="AREAUNIT", Name="SQUARE_METRE"),
            model.create_entity("IfcSIUnit", UnitType="VOLUMEUNIT", Name="CUBIC_METRE"),
            model.create_entity("IfcSIUnit", UnitType="PLANEANGLEUNIT", Name="RADIAN"),
        ],
    )


def make_box_shape(
    model: ifcopenshell.file,
    body_context,
    box_context,
    width: float,
    depth: float,
    height: float,
):
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=float(width),
        YDim=float(depth),
    )
    solid_position = model.create_entity(
        "IfcAxis2Placement3D",
        Location=point(model, width / 2.0, depth / 2.0, 0),
    )
    solid = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=solid_position,
        ExtrudedDirection=direction(model, 0, 0, 1),
        Depth=float(height),
    )
    body = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=body_context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[solid],
    )
    bbox = model.create_entity(
        "IfcBoundingBox",
        Corner=point(model, 0, 0, 0),
        XDim=float(width),
        YDim=float(depth),
        ZDim=float(height),
    )
    box = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=box_context,
        RepresentationIdentifier="Box",
        RepresentationType="BoundingBox",
        Items=[bbox],
    )
    return model.create_entity("IfcProductDefinitionShape", Representations=[body, box])


def make_hip_roof_shape(
    model: ifcopenshell.file,
    body_context,
    box_context,
    spec: RoofSpec,
):
    p0 = point(model, 0, 0, 0)
    p1 = point(model, spec.w, 0, 0)
    p2 = point(model, spec.w, spec.d, 0)
    p3 = point(model, 0, spec.d, 0)

    if spec.ridge_x1 == spec.ridge_x2:
        # Pyramid Roof
        p_apex = point(model, spec.ridge_x1, spec.ridge_y, spec.h)
        loops = [
            model.create_entity("IfcPolyLoop", Polygon=[p0, p1, p_apex]),
            model.create_entity("IfcPolyLoop", Polygon=[p1, p2, p_apex]),
            model.create_entity("IfcPolyLoop", Polygon=[p2, p3, p_apex]),
            model.create_entity("IfcPolyLoop", Polygon=[p3, p0, p_apex]),
            model.create_entity("IfcPolyLoop", Polygon=[p3, p2, p1, p0]),
        ]
    else:
        # Hip Roof
        p_r1 = point(model, spec.ridge_x1, spec.ridge_y, spec.h)
        p_r2 = point(model, spec.ridge_x2, spec.ridge_y, spec.h)
        loops = [
            model.create_entity("IfcPolyLoop", Polygon=[p0, p1, p_r2, p_r1]),
            model.create_entity("IfcPolyLoop", Polygon=[p1, p2, p_r2]),
            model.create_entity("IfcPolyLoop", Polygon=[p2, p3, p_r1, p_r2]),
            model.create_entity("IfcPolyLoop", Polygon=[p3, p0, p_r1]),
            model.create_entity("IfcPolyLoop", Polygon=[p3, p2, p1, p0]),
        ]

    faces = [
        model.create_entity(
            "IfcFace",
            Bounds=[
                model.create_entity("IfcFaceOuterBound", Bound=poly_loop, Orientation=True)
            ],
        )
        for poly_loop in loops
    ]
    shell = model.create_entity("IfcClosedShell", CfsFaces=faces)
    brep = model.create_entity("IfcFacetedBrep", Outer=shell)

    body = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=body_context,
        RepresentationIdentifier="Body",
        RepresentationType="Brep",
        Items=[brep],
    )

    bbox = model.create_entity(
        "IfcBoundingBox",
        Corner=point(model, 0, 0, 0),
        XDim=float(spec.w),
        YDim=float(spec.d),
        ZDim=float(spec.h),
    )
    box = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=box_context,
        RepresentationIdentifier="Box",
        RepresentationType="BoundingBox",
        Items=[bbox],
    )

    return model.create_entity("IfcProductDefinitionShape", Representations=[body, box])


def set_color(model: ifcopenshell.file, element, rgb: tuple[float, float, float]) -> None:
    color = model.create_entity(
        "IfcColourRgb",
        Name=f"{element.Name}_rgb",
        Red=float(rgb[0]),
        Green=float(rgb[1]),
        Blue=float(rgb[2]),
    )
    rendering = model.create_entity(
        "IfcSurfaceStyleRendering",
        SurfaceColour=color,
        Transparency=0.0,
    )
    style = model.create_entity(
        "IfcSurfaceStyle",
        Name=f"{element.Name}_style",
        Side="BOTH",
        Styles=[rendering],
    )
    assignment = model.create_entity("IfcPresentationStyleAssignment", Styles=[style])
    for representation in element.Representation.Representations:
        if representation.RepresentationIdentifier == "Body":
            for item in representation.Items:
                model.create_entity("IfcStyledItem", Item=item, Styles=[assignment])


def make_box(model: ifcopenshell.file, owner_history, body_context, box_context, spec: BoxSpec):
    shape = make_box_shape(model, body_context, box_context, spec.w, spec.d, spec.h)
    element = model.create_entity(
        spec.ifc_class,
        GlobalId=guid(),
        OwnerHistory=owner_history,
        Name=spec.name,
        ObjectPlacement=local_placement(model, spec.x, spec.y, spec.z),
        Representation=shape,
    )
    set_color(model, element, spec.color)
    return element


def make_roof(model: ifcopenshell.file, owner_history, body_context, box_context, spec: RoofSpec):
    shape = make_hip_roof_shape(model, body_context, box_context, spec)
    element = model.create_entity(
        "IfcRoof",
        GlobalId=guid(),
        OwnerHistory=owner_history,
        Name=spec.name,
        ObjectPlacement=local_placement(model, spec.x, spec.y, spec.z),
        Representation=shape,
    )
    set_color(model, element, spec.color)
    return element


def make_space(model: ifcopenshell.file, owner_history, spec: SpaceSpec):
    return model.create_entity(
        "IfcSpace",
        GlobalId=guid(),
        OwnerHistory=owner_history,
        Name=spec.name,
        CompositionType="ELEMENT",
        ObjectPlacement=local_placement(model, spec.x, spec.y, spec.z),
    )


def create_project(model: ifcopenshell.file, owner_history, model_context):
    project = model.create_entity(
        "IfcProject",
        GlobalId=guid(),
        OwnerHistory=owner_history,
        Name="ShinchanHouse",
        RepresentationContexts=[model_context],
        UnitsInContext=make_units(model),
    )
    site = model.create_entity(
        "IfcSite",
        GlobalId=guid(),
        OwnerHistory=owner_history,
        Name="Site",
        CompositionType="ELEMENT",
        ObjectPlacement=local_placement(model, 0, 0, 0),
    )
    building = model.create_entity(
        "IfcBuilding",
        GlobalId=guid(),
        OwnerHistory=owner_history,
        Name="House",
        CompositionType="ELEMENT",
        ObjectPlacement=local_placement(model, 0, 0, 0),
    )

    storeys = [
        model.create_entity(
            "IfcBuildingStorey",
            GlobalId=guid(),
            OwnerHistory=owner_history,
            Name="Yard",
            CompositionType="ELEMENT",
            Elevation=0.0,
            ObjectPlacement=local_placement(model, 0, 0, 0),
        ),
        model.create_entity(
            "IfcBuildingStorey",
            GlobalId=guid(),
            OwnerHistory=owner_history,
            Name="1F",
            CompositionType="ELEMENT",
            Elevation=200.0,
            ObjectPlacement=local_placement(model, 0, 0, 200),
        ),
        model.create_entity(
            "IfcBuildingStorey",
            GlobalId=guid(),
            OwnerHistory=owner_history,
            Name="2F",
            CompositionType="ELEMENT",
            Elevation=3200.0,
            ObjectPlacement=local_placement(model, 0, 0, 3200),
        ),
        model.create_entity(
            "IfcBuildingStorey",
            GlobalId=guid(),
            OwnerHistory=owner_history,
            Name="RF",
            CompositionType="ELEMENT",
            Elevation=6200.0,
            ObjectPlacement=local_placement(model, 0, 0, 6200),
        ),
    ]

    aggregate(model, owner_history, project, [site])
    aggregate(model, owner_history, site, [building])
    aggregate(model, owner_history, building, storeys)
    return storeys


def yard_specs() -> list[BoxSpec]:
    grass = (0.45, 0.68, 0.38)
    fence = (0.66, 0.52, 0.36)
    return [
        BoxSpec("IfcSlab", "Yard_Grass", 0, 0, 0, 15000, 12000, 200, grass),
        BoxSpec("IfcWall", "Fence_South", 0, 0, 200, 15000, WALL_T, 1000, fence),
        BoxSpec("IfcWall", "Fence_North", 0, 11800, 200, 15000, WALL_T, 1000, fence),
        BoxSpec("IfcWall", "Fence_West", 0, 200, 200, WALL_T, 11600, 1000, fence),
        BoxSpec("IfcWall", "Fence_East", 14800, 200, 200, WALL_T, 11600, 1000, fence),
    ]


def space_specs_1f() -> list[SpaceSpec]:
    return [
        SpaceSpec("Anbang_Room", 2000, 6000, 200),
        SpaceSpec("Living_and_Kitchen", 6000, 3000, 200),
        SpaceSpec("Hall_and_Entrance", 10000, 4000, 200),
        SpaceSpec("Bathroom", 11500, 7500, 200),
    ]


def first_floor_specs() -> list[BoxSpec]:
    wall = (0.94, 0.92, 0.84)
    floor = (0.86, 0.80, 0.68)
    stair_c = (0.70, 0.60, 0.50)
    z0 = 200
    wz = z0 + FLOOR_T

    specs = [
        BoxSpec("IfcSlab", "1F_Slab_Anbang", 2000, 6000, z0, 4000, 4000, FLOOR_T, floor),
        BoxSpec("IfcSlab", "1F_Slab_Living", 6000, 3000, z0, 4000, 7000, FLOOR_T, floor),
        BoxSpec("IfcSlab", "1F_Slab_Hall", 10000, 4000, z0, 3000, 6000, FLOOR_T, floor),
        BoxSpec("IfcWall", "1F_Anbang_West", 2000, 6000, wz, WALL_T, 4000, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_Anbang_South", 2000, 6000, wz, 4000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_Living_West", 6000, 3000, wz, WALL_T, 3000, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_Living_South", 6000, 3000, wz, 4000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_Living_East", 9800, 3000, wz, WALL_T, 1000, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_Hall_South", 10000, 4000, wz, 3000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_Hall_East", 12800, 4000, wz, WALL_T, 6000, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_North_All", 2000, 9800, wz, 11000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_In_Closet", 2000, 9000, wz, 4000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_In_Liv_Kit", 6000, 7000, wz, 2500, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_Div_Left", 6000, 6000, wz, WALL_T, 4000, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_Div_Right", 9800, 4000, wz, WALL_T, 6000, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_In_Entrance", 10000, 6000, wz, 3000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_In_Toilet_B", 11500, 7500, wz, 1500, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_In_Stair_W", 10000, 8000, wz, 1500, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "1F_In_Vert_Mid", 11300, 6000, wz, WALL_T, 4000, STOREY_H, wall),
    ]

    for i in range(10):
        specs.append(
            BoxSpec(
                "IfcStair",
                f"Stair_Step_{i+1}",
                11500,
                4500 + i * 250,
                z0 + i * 300,
                1000,
                250,
                300,
                stair_c,
            )
        )

    return specs


def space_specs_2f() -> list[SpaceSpec]:
    return [
        SpaceSpec("Aunt_Room", 7000, 7000, 3400),
        SpaceSpec("Dad_Office", 7000, 5000, 3400),
        SpaceSpec("Hallway", 9800, 5000, 3400),
    ]


def second_floor_specs() -> list[BoxSpec]:
    wall = (0.94, 0.92, 0.84)
    floor = (0.84, 0.78, 0.66)
    rail = (0.45, 0.45, 0.45)
    terrace_floor = (0.62, 0.60, 0.56)
    z0 = 3400
    wz = z0 + FLOOR_T
    terrace_floor_t = 50
    rail_z = wz + terrace_floor_t
    return [
        BoxSpec("IfcSlab", "2F_Slab_Main", 7000, 5000, z0, 6000, 5000, FLOOR_T, floor),
        BoxSpec(
            "IfcSlab",
            "2F_Slab_Balcony",
            7000,
            4000,
            z0,
            3000,
            1000,
            FLOOR_T,
            (0.72, 0.72, 0.72),
        ),
        BoxSpec(
            "IfcSlab",
            "2F_Terrace_Floor",
            7000,
            4000,
            wz,
            3000,
            1000,
            terrace_floor_t,
            terrace_floor,
        ),
        BoxSpec("IfcWall", "2F_Ext_W", 7000, 5000, wz, WALL_T, 5000, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_Ext_S", 7000, 5000, wz, 6000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_Ext_E", 12800, 5000, wz, WALL_T, 5000, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_Ext_N", 7000, 9800, wz, 6000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_In_Room_Div", 7000, 7000, wz, 3000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_In_Hall_Div", 9800, 5000, wz, WALL_T, 5000, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_In_Closet_1", 11300, 5000, wz, WALL_T, 2000, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_In_Closet_2", 11300, 8000, wz, WALL_T, 2000, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_Rail_W", 7000, 4000, rail_z, WALL_T, 1000, 1000, rail),
        BoxSpec("IfcWall", "2F_Rail_S", 7000, 4000, rail_z, 3000, WALL_T, 1000, rail),
        BoxSpec("IfcWall", "2F_Rail_E", 9800, 4000, rail_z, WALL_T, 1000, 1000, rail),
    ]


def roof_specs() -> list[RoofSpec]:
    red = (0.70, 0.18, 0.14)
    return [
        RoofSpec("Roof_1F_Anbang", 1500, 4000, 3400, 5500, 6500, 1200, 2750, 2750, 4000, red),

        RoofSpec("Roof_1F_Living", 5500, 2500, 3400, 4500, 1500, 800, 1000, 3500, 750, red),

        RoofSpec("Roof_1F_Entrance", 9800, 3500, 3400, 3400, 1500, 800, 500, 2900, 750, red),
        RoofSpec("Roof_2F_Main", 6500, 4500, 6600, 7000, 6000, 1500, 3000, 4000, 3000, red),
    ]


def generate(output_path: Path = OUT_PATH) -> Path:
    model = ifcopenshell.file(schema="IFC4")
    owner_history = make_owner_history(model)
    model_context, body_context, box_context = make_contexts(model)
    yard_storey, first_storey, second_storey, roof_storey = create_project(
        model,
        owner_history,
        model_context,
    )

    grouped_specs = [
        (yard_storey, yard_specs(), []),
        (first_storey, first_floor_specs(), space_specs_1f()),
        (second_storey, second_floor_specs(), space_specs_2f()),
        (roof_storey, roof_specs(), []),
    ]

    for storey, specs, spaces in grouped_specs:
        elements = []
        for spec in specs:
            if isinstance(spec, BoxSpec):
                elements.append(make_box(model, owner_history, body_context, box_context, spec))
            elif isinstance(spec, RoofSpec):
                elements.append(make_roof(model, owner_history, body_context, box_context, spec))
        contain(model, owner_history, storey, elements)

        space_elements = []
        for sp in spaces:
            space_elements.append(make_space(model, owner_history, sp))
        if space_elements:
            aggregate(model, owner_history, storey, space_elements)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    model.write(str(output_path))
    return output_path


if __name__ == "__main__":
    path = generate()
    print(f"[OK] IFC file created: {path}")
