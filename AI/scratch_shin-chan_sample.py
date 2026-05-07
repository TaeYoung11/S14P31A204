"""짱구집 샘플 IFC 생성기.

실행:
    python scratch_shin-chan_sample.py

출력:
    AI\\tests\\sample_shinchan.ifc

설계 의도:
  Yard : 15000x12000 마당 슬래브와 사방 담장.
         담장은 200mm 두께, 1000mm 높이의 낮은 벽으로 표현.

       y=12000  +--------------------------------+
                |                                |
                |            Yard                |
                |                                |
       y=0      +--------------------------------+
                x=0                          x=15000

  1F : 안방, 거실, 현관/복도 영역이 지그재그로 붙은 평면.
       하나의 큰 직사각형이 아니라 3개 슬래브가 이어진 형태.
       내부에는 이불장, 거실/부엌 분리벽, 현관, 화장실/욕조,
       계단 주변 구획벽을 둔다.

       y=10000  +---- Anbang ----+---- Living ----+-- Hall --+
                |                |                |          |
       y=7000   | closet         | living/kitchen | toilet   |
       y=6000   +----------------+----------------+ entrance |
                |                |                | stair    |
       y=3000                    +----------------+----------+
                x=2000        x=6000          x=10000   x=13000

  2F : 1F보다 작은 6000x5000 메인 매스와 남쪽 발코니.
       방 구획, 복도 구획, 장롱/수납 구획, 발코니 난간을 배치.

       y=10000  +----------------------+
                | room / closet / hall |
       y=7000   |----------+-----------|
                | room div | hall div  |
       y=5000   +----------------------+
       y=4000   +---- balcony rail ----+
                x=7000              x=13000

  RF : 1F 일부와 2F 본체 위에 분리된 지붕 블록 3개를 배치.
       Roof_1F_Anbang, Roof_1F_Living, Roof_2F_Main.

벽 설계:
  - 모든 벽/담장/난간은 200mm 두께의 직육면체 압출 형상.
  - 문/창 개구부는 만들지 않고, 방 구획을 읽기 쉬운 벽 요소로 표현.
  - `AI/tests/sample_shinchan.ifc`와 같은 요소 이름/배치를 재생성하는 것이 목적.

테스트/프론트 확인 포인트:
  - 층 구조: IfcProject > IfcSite > IfcBuilding > Yard/1F/2F/RF
  - 주요 요소: IfcWall, IfcSlab, IfcRoof
  - 형상 표현: Body, Box
  - 색상: IfcStyledItem, IfcColourRgb 포함
"""

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
    for representation in element.Representation.Representations:
        if representation.RepresentationIdentifier == "Body":
            for item in representation.Items:
                model.create_entity("IfcStyledItem", Item=item, Styles=[style])


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


def first_floor_specs() -> list[BoxSpec]:
    wall = (0.94, 0.92, 0.84)
    floor = (0.86, 0.80, 0.68)
    z0 = 200
    wz = z0 + FLOOR_T
    return [
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


def second_floor_specs() -> list[BoxSpec]:
    wall = (0.94, 0.92, 0.84)
    floor = (0.84, 0.78, 0.66)
    rail = (0.45, 0.45, 0.45)
    z0 = 3400
    wz = z0 + FLOOR_T
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
        BoxSpec("IfcWall", "2F_Ext_W", 7000, 5000, wz, WALL_T, 5000, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_Ext_S", 7000, 5000, wz, 6000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_Ext_E", 12800, 5000, wz, WALL_T, 5000, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_Ext_N", 7000, 9800, wz, 6000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_In_Room_Div", 7000, 7000, wz, 3000, WALL_T, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_In_Hall_Div", 9800, 5000, wz, WALL_T, 5000, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_In_Closet_1", 11300, 5000, wz, WALL_T, 2000, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_In_Closet_2", 11300, 8000, wz, WALL_T, 2000, STOREY_H, wall),
        BoxSpec("IfcWall", "2F_Rail_W", 7000, 4000, wz, WALL_T, 1000, 1000, rail),
        BoxSpec("IfcWall", "2F_Rail_S", 7000, 4000, wz, 3000, WALL_T, 1000, rail),
        BoxSpec("IfcWall", "2F_Rail_E", 9800, 4000, wz, WALL_T, 1000, 1000, rail),
    ]


def roof_specs() -> list[BoxSpec]:
    red = (0.70, 0.18, 0.14)
    return [
        BoxSpec("IfcRoof", "Roof_1F_Anbang", 1500, 5500, 3400, 5000, 5000, 800, red),
        BoxSpec("IfcRoof", "Roof_1F_Living", 5500, 2500, 3400, 5000, 3000, 800, red),
        BoxSpec("IfcRoof", "Roof_2F_Main", 6500, 4500, 6600, 7000, 6000, 1200, red),
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
        (yard_storey, yard_specs()),
        (first_storey, first_floor_specs()),
        (second_storey, second_floor_specs()),
        (roof_storey, roof_specs()),
    ]
    for storey, specs in grouped_specs:
        elements = [
            make_box(model, owner_history, body_context, box_context, spec)
            for spec in specs
        ]
        contain(model, owner_history, storey, elements)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    model.write(str(output_path))
    return output_path


if __name__ == "__main__":
    path = generate()
    print(f"[OK] IFC file created: {path}")
