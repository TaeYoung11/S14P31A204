from __future__ import annotations

import math

import ifcopenshell


def update_wall_segment(
    *,
    model: ifcopenshell.file,
    wall: ifcopenshell.entity_instance,
    start_m: tuple[float, float],
    end_m: tuple[float, float],
) -> bool:
    placement = getattr(wall, "ObjectPlacement", None)
    relative = getattr(placement, "RelativePlacement", None) if placement else None
    if relative is None:
        return False

    dx = end_m[0] - start_m[0]
    dy = end_m[1] - start_m[1]
    length_m = math.hypot(dx, dy)
    if length_m <= 0.0:
        return False

    relative.Location = model.create_entity(
        "IfcCartesianPoint",
        Coordinates=(start_m[0], start_m[1], 0.0),
    )
    relative.RefDirection = model.create_entity(
        "IfcDirection",
        DirectionRatios=(dx / length_m, dy / length_m, 0.0),
    )

    representation = getattr(wall, "Representation", None)
    if representation is None:
        return True

    for rep in getattr(representation, "Representations", []) or []:
        identifier = getattr(rep, "RepresentationIdentifier", None)
        if identifier == "Axis":
            for item in getattr(rep, "Items", []) or []:
                if item.is_a("IfcPolyline") and len(item.Points) >= 2:
                    item.Points[0].Coordinates = (0.0, 0.0)
                    item.Points[1].Coordinates = (length_m, 0.0)
        elif identifier == "Box":
            for item in getattr(rep, "Items", []) or []:
                if item.is_a("IfcBoundingBox"):
                    item.XDim = length_m
        elif identifier == "Body":
            for item in getattr(rep, "Items", []) or []:
                _update_wall_body_length(item=item, length_m=length_m)

    return True


def _update_wall_body_length(
    *,
    item: ifcopenshell.entity_instance,
    length_m: float,
) -> None:
    current = item
    while hasattr(current, "FirstOperand"):
        current = current.FirstOperand
    if not current.is_a("IfcExtrudedAreaSolid"):
        return

    profile = getattr(current, "SweptArea", None)
    if profile is None:
        return

    if profile.is_a("IfcRectangleProfileDef"):
        profile.XDim = length_m
        return

    if not profile.is_a("IfcArbitraryClosedProfileDef"):
        return
    curve = getattr(profile, "OuterCurve", None)
    if curve is None or not curve.is_a("IfcPolyline") or len(curve.Points) < 4:
        return

    thickness_m = _wall_profile_thickness_m(curve)
    if thickness_m <= 0.0 or length_m <= thickness_m:
        return

    updated = [
        (thickness_m, -thickness_m),
        (length_m - thickness_m, -thickness_m),
        (length_m, 0.0),
        (0.0, 0.0),
    ]
    if len(curve.Points) >= 5:
        updated.append(updated[0])
    for point, coords in zip(curve.Points, updated, strict=False):
        point.Coordinates = coords


def _wall_profile_thickness_m(curve: ifcopenshell.entity_instance) -> float:
    coords = [tuple(point.Coordinates) for point in curve.Points]
    ys = [point[1] for point in coords if len(point) >= 2]
    if not ys:
        return 0.0
    return abs(min(ys))
