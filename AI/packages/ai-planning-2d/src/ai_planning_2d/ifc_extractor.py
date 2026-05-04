import json
import math
from collections import defaultdict
from typing import Any

import ifcopenshell
import ifcopenshell.util.element
import ifcopenshell.util.placement

from .command import (
    AdjacencyContext,
    BoundaryContext,
    DoorContext,
    IFCContext,
    SpaceContext,
    StoreyContext,
    WallContext,
    WindowContext,
)

try:
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
except ImportError:  # pragma: no cover
    Polygon = None
    unary_union = None


_SPACE_TYPE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "living": ("거실", "living", "wohnen", "living room"),
    "bedroom": ("침실", "안방", "bedroom", "schlafzimmer"),
    "kitchen": ("주방", "부엌", "kitchen", "küche"),
    "bathroom": ("욕실", "화장실", "bathroom", "bad", "wc"),
    "office": ("서재", "사무실", "office", "buero", "büro"),
    "corridor": ("복도", "corridor", "hall", "flur"),
}


def extract_ifc_context(ifc_path: str) -> IFCContext:
    """Open an IFC4 file and extract IFCContext."""
    ifc = ifcopenshell.open(ifc_path)
    if ifc.schema != "IFC4":
        raise ValueError(f"Unsupported IFC schema: {ifc.schema}")

    storeys = _extract_storeys(ifc)
    storey_floors = {storey["id"]: storey["floor"] for storey in storeys}

    wall_to_spaces = _collect_wall_space_ids(ifc)
    spaces = _extract_spaces(ifc, storey_floors)
    walls = _extract_walls(ifc, storey_floors, wall_to_spaces)
    wall_map = {wall["id"]: wall for wall in walls}
    doors = _extract_doors(ifc, storey_floors, wall_map)
    windows = _extract_windows(ifc, storey_floors, wall_map)
    adjacency = _extract_adjacency(wall_to_spaces)
    boundaries = _extract_boundaries(spaces)

    return {
        "spaces": spaces,
        "adjacency": adjacency,
        "walls": walls,
        "doors": doors,
        "windows": windows,
        "boundaries": boundaries,
        "storeys": storeys,
    }


def _extract_storeys(ifc: ifcopenshell.file) -> list[StoreyContext]:
    storey_entities = ifc.by_type("IfcBuildingStorey")
    storey_entities.sort(
        key=lambda storey: (
            getattr(storey, "Elevation", None) is None,
            getattr(storey, "Elevation", None) or 0.0,
        )
    )
    storeys: list[StoreyContext] = []
    for floor, storey in enumerate(storey_entities, start=1):
        elevation = getattr(storey, "Elevation", None)
        storeys.append(
            {
                "id": storey.GlobalId,
                "floor": floor,
                "elevation": None if elevation is None else elevation * 1000.0,
            }
        )
    return storeys


def _extract_spaces(
    ifc: ifcopenshell.file, storey_floors: dict[str, int]
) -> list[SpaceContext]:
    spaces: list[SpaceContext] = []
    for space in ifc.by_type("IfcSpace"):
        floor = _get_floor(space, storey_floors)
        if floor is None:
            continue

        placement = _get_placement_matrix(space)
        psets = ifcopenshell.util.element.get_psets(space)
        dims = psets.get("Batang_SpaceDimensions", {})
        base_quantities = psets.get("BaseQuantities", {})

        width = _mm_from_custom_value(dims.get("Width"), min_value=2)
        height = _mm_from_custom_value(dims.get("Height"), min_value=2)
        rects = _parse_rects_json(dims.get("Rects"))
        space_name = _extract_space_name(space, psets)
        space_type = _extract_space_type(space, psets, dims)

        polygon = None
        if rects:
            polygon = _rects_to_polygon(rects)
        if not polygon:
            polygon = _extract_space_footprint_polygon(space)
        if not polygon:
            polygon = _extract_space_body_polygon(space)
        if not polygon and width is not None and height is not None:
            polygon = [
                (0.0, 0.0),
                (float(width), 0.0),
                (float(width), float(height)),
                (0.0, float(height)),
            ]
        if not polygon:
            continue

        world_polygon = [_apply_placement_mm(point, placement) for point in polygon]
        world_polygon = _normalize_polygon(world_polygon)
        if width is None or height is None:
            min_x, min_y, max_x, max_y = _bbox(world_polygon)
            if width is None:
                width = _mm_from_custom_value(base_quantities.get("Width"), min_value=2)
                if width is None:
                    width = int(round(max_x - min_x))
            if height is None:
                height = _mm_from_custom_value(base_quantities.get("Depth"), min_value=2)
                if height is None:
                    height = int(round(max_y - min_y))

        spaces.append(
            {
                "id": space.GlobalId,
                "name": space_name,
                "type": space_type,
                "floor": floor,
                "polygon": world_polygon,
                "width": width,
                "height": height,
                "x": placement[0][3] * 1000.0 if placement is not None else None,
                "y": placement[1][3] * 1000.0 if placement is not None else None,
                "angle": _placement_angle_deg(placement),
                "locked": bool(dims.get("Locked", False)),
                "zone_id": None,
            }
        )
    return spaces


def _extract_walls(
    ifc: ifcopenshell.file,
    storey_floors: dict[str, int],
    wall_to_spaces: dict[str, list[str]],
) -> list[WallContext]:
    walls: list[WallContext] = []
    for wall in ifc.by_type("IfcWall"):
        floor = _get_floor(wall, storey_floors)
        if floor is None:
            continue

        start_end = _extract_wall_start_end(wall)
        if start_end is None:
            continue
        start, end = start_end
        start, end = _normalize_segment(start, end)

        psets = ifcopenshell.util.element.get_psets(wall)
        thickness = (
            _mm_from_custom_value(
                psets.get("Batang_WallDimensions", {}).get("Thickness"), min_value=2
            )
            or _mm_from_custom_value(
                psets.get("Pset_WallCommon", {}).get("Thickness"), min_value=2
            )
            or 200
        )
        space_ids = wall_to_spaces.get(wall.GlobalId, [])
        kind = None
        if len(space_ids) == 0:
            kind = "PARTITION"
        elif len(space_ids) == 1:
            kind = "EXTERIOR"
        elif len(space_ids) == 2:
            kind = "INTERIOR"

        walls.append(
            {
                "id": wall.GlobalId,
                "floor": floor,
                "start": start,
                "end": end,
                "thickness": thickness,
                "space_ids": space_ids,
                "kind": kind,
            }
        )
    return walls


def _extract_doors(
    ifc: ifcopenshell.file,
    storey_floors: dict[str, int],
    wall_map: dict[str, WallContext],
) -> list[DoorContext]:
    doors: list[DoorContext] = []
    for door in ifc.by_type("IfcDoor"):
        host_wall_id = _get_host_wall_id(door)
        if not host_wall_id or host_wall_id not in wall_map:
            continue

        wall = wall_map[host_wall_id]
        floor = _get_floor(door, storey_floors) or wall["floor"]
        width = _mm_from_ifc_length(getattr(door, "OverallWidth", None), default=900)
        height = _mm_from_ifc_length(getattr(door, "OverallHeight", None), default=2100)
        position = _project_position_on_wall(door, wall, width)
        if position is None:
            continue

        space_ids = wall["space_ids"]
        doors.append(
            {
                "id": door.GlobalId,
                "floor": floor,
                "host_wall_id": host_wall_id,
                "from_space_id": space_ids[0] if len(space_ids) >= 1 else None,
                "to_space_id": space_ids[1] if len(space_ids) >= 2 else None,
                "width": width,
                "height": height,
                "position": position,
                "opening_type": "swing",
                "swing_into_id": None,
                "hinge_side": None,
            }
        )
    return doors


def _extract_windows(
    ifc: ifcopenshell.file,
    storey_floors: dict[str, int],
    wall_map: dict[str, WallContext],
) -> list[WindowContext]:
    windows: list[WindowContext] = []
    for window in ifc.by_type("IfcWindow"):
        host_wall_id = _get_host_wall_id(window)
        if not host_wall_id or host_wall_id not in wall_map:
            continue

        wall = wall_map[host_wall_id]
        if len(wall["space_ids"]) != 1:
            continue

        floor = _get_floor(window, storey_floors) or wall["floor"]
        width = _mm_from_ifc_length(getattr(window, "OverallWidth", None), default=900)
        height = _mm_from_ifc_length(getattr(window, "OverallHeight", None), default=2100)
        position = _project_position_on_wall(window, wall, width)
        if position is None:
            continue

        placement = _get_placement_matrix(window)
        sill_height = 900
        if placement is not None:
            sill_height = int(round(placement[2][3] * 1000.0))

        windows.append(
            {
                "id": window.GlobalId,
                "floor": floor,
                "host_wall_id": host_wall_id,
                "adjacent_space_id": wall["space_ids"][0],
                "width": width,
                "height": height,
                "sill_height": sill_height,
                "position": position,
            }
        )
    return windows


def _extract_adjacency(wall_to_spaces: dict[str, list[str]]) -> list[AdjacencyContext]:
    seen: set[tuple[str, str]] = set()
    adjacency: list[AdjacencyContext] = []
    for space_ids in wall_to_spaces.values():
        if len(space_ids) < 2:
            continue
        ordered = sorted(space_ids)
        pair = (ordered[0], ordered[1])
        if pair in seen:
            continue
        seen.add(pair)
        adjacency.append(
            {
                "space_a_id": pair[0],
                "space_b_id": pair[1],
                "strength": 0.5,
            }
        )
    return adjacency


def _extract_boundaries(spaces: list[SpaceContext]) -> list[BoundaryContext]:
    by_floor: dict[int, list[list[tuple[float, float]]]] = defaultdict(list)
    for space in spaces:
        if space["polygon"]:
            by_floor[space["floor"]].append(space["polygon"])

    boundaries: list[BoundaryContext] = []
    for floor in sorted(by_floor):
        polygons = by_floor[floor]
        outer_polygon = _union_outer_polygon(polygons)
        boundaries.append({"floor": floor, "outer_polygon": outer_polygon, "holes": []})
    return boundaries


def _collect_wall_space_ids(ifc: ifcopenshell.file) -> dict[str, list[str]]:
    wall_to_spaces: dict[str, set[str]] = defaultdict(set)
    for rel in ifc.by_type("IfcRelSpaceBoundary"):
        wall = getattr(rel, "RelatedBuildingElement", None)
        space = getattr(rel, "RelatingSpace", None)
        if wall is None or space is None or not wall.is_a("IfcWall"):
            continue
        wall_to_spaces[wall.GlobalId].add(space.GlobalId)
    return {wall_id: sorted(space_ids) for wall_id, space_ids in wall_to_spaces.items()}


def _get_floor(element: Any, storey_floors: dict[str, int]) -> int | None:
    container = ifcopenshell.util.element.get_container(element)
    if container is not None and container.is_a("IfcBuildingStorey"):
        return storey_floors.get(container.GlobalId)

    for rel in getattr(element, "Decomposes", []) or []:
        relating = getattr(rel, "RelatingObject", None)
        if relating is not None and relating.is_a("IfcBuildingStorey"):
            return storey_floors.get(relating.GlobalId)
    return None


def _get_placement_matrix(element: Any) -> Any | None:
    placement = getattr(element, "ObjectPlacement", None)
    if placement is None:
        return None
    try:
        return ifcopenshell.util.placement.get_local_placement(placement)
    except Exception:
        return None


def _parse_rects_json(value: Any) -> list[dict[str, Any]] | None:
    if not value:
        return None
    if isinstance(value, str):
        try:
            data = json.loads(value)
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, list) else None
    if isinstance(value, list):
        return value
    return None


def _rects_to_polygon(rects: list[dict[str, Any]]) -> list[tuple[float, float]] | None:
    polygons = []
    for rect in rects:
        x = float(rect["x"])
        y = float(rect["y"])
        width = float(rect["width"])
        height = float(rect["height"])
        polygons.append([(x, y), (x + width, y), (x + width, y + height), (x, y + height)])
    return _union_outer_polygon(polygons)


def _extract_space_body_polygon(space: Any) -> list[tuple[float, float]] | None:
    representation = getattr(space, "Representation", None)
    if representation is None:
        return None
    for shape in representation.Representations or []:
        if getattr(shape, "RepresentationIdentifier", None) != "Body":
            continue
        for item in shape.Items or []:
            if item.is_a("IfcExtrudedAreaSolid"):
                swept_area = getattr(item, "SweptArea", None)
                if swept_area is not None and swept_area.is_a("IfcRectangleProfileDef"):
                    width = float(swept_area.XDim) * 1000.0
                    height = float(swept_area.YDim) * 1000.0
                    return [(0.0, 0.0), (width, 0.0), (width, height), (0.0, height)]
            if item.is_a("IfcFacetedBrep"):
                polygon = _brep_to_footprint_polygon(item)
                if polygon:
                    return polygon
    return None


def _extract_space_footprint_polygon(space: Any) -> list[tuple[float, float]] | None:
    representation = getattr(space, "Representation", None)
    if representation is None:
        return None
    for shape in representation.Representations or []:
        if getattr(shape, "RepresentationIdentifier", None) != "FootPrint":
            continue
        for item in shape.Items or []:
            if not item.is_a("IfcGeometricCurveSet"):
                continue
            for element in item.Elements or []:
                if element.is_a("IfcPolyline") and len(element.Points) >= 3:
                    return [
                        (
                            float(point.Coordinates[0]) * 1000.0,
                            float(point.Coordinates[1]) * 1000.0,
                        )
                        for point in element.Points
                    ]
    return None


def _brep_to_footprint_polygon(brep: Any) -> list[tuple[float, float]] | None:
    shell = getattr(brep, "Outer", None)
    if shell is None:
        return None

    candidates: list[list[tuple[float, float]]] = []
    for face in shell.CfsFaces or []:
        for bound in face.Bounds or []:
            loop = getattr(bound, "Bound", None)
            polygon = []
            for point in getattr(loop, "Polygon", []) or []:
                coords = tuple(getattr(point, "Coordinates", ()) or ())
                if len(coords) < 2:
                    continue
                polygon.append((float(coords[0]) * 1000.0, float(coords[1]) * 1000.0))
            if len(polygon) >= 3:
                normalized = _normalize_polygon(polygon)
                area = abs(_signed_area(normalized))
                if area > 0:
                    candidates.append(normalized)
    if not candidates:
        return None
    return max(candidates, key=lambda polygon: abs(_signed_area(polygon)))


def _extract_space_name(space: Any, psets: dict[str, Any]) -> str:
    candidates = [
        getattr(space, "LongName", None),
        psets.get("Batang_SpaceDimensions", {}).get("Name"),
        psets.get("ArchiCADProperties", {}).get("Raumname"),
        getattr(space, "Name", None),
        space.GlobalId,
    ]
    for candidate in candidates:
        if isinstance(candidate, str):
            normalized = candidate.strip()
            if normalized:
                return normalized
    return space.GlobalId


def _extract_space_type(space: Any, psets: dict[str, Any], dims: dict[str, Any]) -> str:
    explicit = dims.get("SpaceType")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()

    candidates = [
        getattr(space, "LongName", None),
        psets.get("ArchiCADProperties", {}).get("Raumname"),
        getattr(space, "Name", None),
    ]
    for candidate in candidates:
        if not isinstance(candidate, str):
            continue
        lowered = candidate.strip().lower()
        if not lowered:
            continue
        for space_type, keywords in _SPACE_TYPE_KEYWORDS.items():
            if any(keyword in lowered for keyword in keywords):
                return space_type
    return "other"


def _extract_wall_start_end(wall: Any) -> tuple[tuple[float, float], tuple[float, float]] | None:
    placement = _get_placement_matrix(wall)
    axis_points = _extract_wall_axis_points_mm(wall, placement)
    if axis_points is not None:
        return axis_points

    if placement is None:
        return None

    length_mm = _get_wall_length_mm(wall)
    if length_mm is None:
        return None

    start = (placement[0][3] * 1000.0, placement[1][3] * 1000.0)
    end = (
        start[0] + placement[0][0] * length_mm,
        start[1] + placement[1][0] * length_mm,
    )
    return start, end


def _extract_wall_axis_points_mm(
    wall: Any, placement: Any | None
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    representation = getattr(wall, "Representation", None)
    if representation is None:
        return None
    for shape in representation.Representations or []:
        if getattr(shape, "RepresentationIdentifier", None) != "Axis":
            continue
        for item in shape.Items or []:
            if not item.is_a("IfcPolyline") or len(item.Points) < 2:
                continue
            first = item.Points[0].Coordinates
            last = item.Points[-1].Coordinates
            start = _point_to_mm(first, placement)
            end = _point_to_mm(last, placement)
            return start, end
    return None


def _get_wall_length_mm(wall: Any) -> float | None:
    axis_points = _extract_wall_axis_points_mm(wall, _get_placement_matrix(wall))
    if axis_points is not None:
        start, end = axis_points
        return math.dist(start, end)

    psets = ifcopenshell.util.element.get_psets(wall)
    length = psets.get("Qto_WallBaseQuantities", {}).get("Length")
    if isinstance(length, (int, float)):
        return float(length) * 1000.0

    representation = getattr(wall, "Representation", None)
    if representation is None:
        return None
    for shape in representation.Representations or []:
        if getattr(shape, "RepresentationIdentifier", None) != "Body":
            continue
        for item in shape.Items or []:
            if item.is_a("IfcExtrudedAreaSolid"):
                depth = getattr(item, "Depth", None)
                if isinstance(depth, (int, float)):
                    return float(depth) * 1000.0
    return None


def _get_host_wall_id(element: Any) -> str | None:
    for fills in getattr(element, "FillsVoids", []) or []:
        opening = getattr(fills, "RelatingOpeningElement", None)
        if opening is None:
            continue
        for rel in getattr(opening, "VoidsElements", []) or []:
            host = getattr(rel, "RelatingBuildingElement", None)
            if host is not None and host.is_a("IfcWall"):
                return host.GlobalId
    return None


def _project_position_on_wall(element: Any, wall: WallContext, width: int) -> int | None:
    placement = _get_placement_matrix(element)
    if placement is None:
        return None

    point = (placement[0][3] * 1000.0, placement[1][3] * 1000.0)
    start = wall["start"]
    end = wall["end"]
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return None

    ux = dx / length
    uy = dy / length
    offset = (point[0] - start[0]) * ux + (point[1] - start[1]) * uy
    return int(round(offset + width / 2))


def _apply_placement_mm(point: tuple[float, float], placement: Any | None) -> tuple[float, float]:
    lx, ly = point
    if placement is None:
        return (lx, ly)
    wx = placement[0][0] * lx + placement[0][1] * ly + placement[0][3] * 1000.0
    wy = placement[1][0] * lx + placement[1][1] * ly + placement[1][3] * 1000.0
    return (float(wx), float(wy))


def _point_to_mm(coords: Any, placement: Any | None) -> tuple[float, float]:
    x = float(coords[0]) * 1000.0
    y = float(coords[1]) * 1000.0
    return _apply_placement_mm((x, y), placement)


def _placement_angle_deg(placement: Any | None) -> float | None:
    if placement is None:
        return None
    return math.degrees(math.atan2(placement[1][0], placement[0][0]))


def _normalize_polygon(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(points) >= 2 and points[0] == points[-1]:
        points = points[:-1]
    if _signed_area(points) < 0:
        points = list(reversed(points))
    return points


def _normalize_segment(
    start: tuple[float, float], end: tuple[float, float]
) -> tuple[tuple[float, float], tuple[float, float]]:
    if start[0] > end[0] or (math.isclose(start[0], end[0]) and start[1] > end[1]):
        return end, start
    return start, end


def _signed_area(points: list[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0
    area = 0.0
    for index, (x1, y1) in enumerate(points):
        x2, y2 = points[(index + 1) % len(points)]
        area += x1 * y2 - x2 * y1
    return area / 2.0


def _bbox(points: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def _union_outer_polygon(polygons: list[list[tuple[float, float]]]) -> list[tuple[float, float]]:
    if Polygon is not None and unary_union is not None:
        shape_polygons = [Polygon(polygon) for polygon in polygons if len(polygon) >= 3]
        if shape_polygons:
            merged = unary_union(shape_polygons)
            if merged.geom_type == "MultiPolygon":
                merged = max(merged.geoms, key=lambda geom: geom.area)
            return _normalize_polygon(
                [(float(x), float(y)) for x, y in merged.exterior.coords[:-1]]
            )

    all_points = [point for polygon in polygons for point in polygon]
    min_x, min_y, max_x, max_y = _bbox(all_points)
    return _normalize_polygon(
        [(min_x, min_y), (max_x, min_y), (max_x, max_y), (min_x, max_y)]
    )


def _mm_from_custom_value(value: Any, min_value: int | None = None) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        mm_value = int(round(float(value)))
        if min_value is not None and mm_value < min_value:
            return None
        return mm_value
    return None


def _mm_from_ifc_length(value: Any, default: int) -> int:
    if isinstance(value, (int, float)):
        return int(round(float(value) * 1000.0))
    return default
