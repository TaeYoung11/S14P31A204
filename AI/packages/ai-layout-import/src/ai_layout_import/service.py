"""Layout import service entrypoint."""

from __future__ import annotations

import json
import math
from collections.abc import Iterable
from pathlib import Path

import ifcopenshell
import ifcopenshell.guid
from ai_domain import (
    AdjacencyInput,
    BoundaryInput,
    BoundaryWallMode,
    LayoutImportV1,
    LayoutImportV2,
    LayoutImportV3,
    OpeningInput,
    RoomInput,
    RoofShape,
    ZoneInput,
)

Point2DMm = tuple[float, float]
RoomEdgeMm = tuple[Point2DMm, Point2DMm]
SharedWallCandidate = tuple[int, str, str, tuple[RoomEdgeMm, ...], tuple[RoomEdgeMm, ...]]
SharedWallSegment = tuple[int, RoomEdgeMm]
StyleAssignmentCache = dict[str, ifcopenshell.entity_instance]
LayoutImportRequestModel = LayoutImportV1 | LayoutImportV2 | LayoutImportV3
LayoutImportGenerationRequest = LayoutImportV2 | LayoutImportV3


def convert_layout_to_ifc(
    request: LayoutImportRequestModel,
    output_path: str | Path,
) -> None:
    """Write a space-only IFC file from the validated layout import request."""

    output = Path(output_path)
    shared_wall_segments = _validate_request(request)
    model = _create_ifc_file()
    style_cache: StyleAssignmentCache = {}
    owner_history, context, project, storeys = _create_project_tree(model, request)
    zones = _create_zones(model, owner_history, request)
    _attach_project_metadata_property_set(model, owner_history, project, request)
    _attach_storey_metadata_property_sets(model, owner_history, storeys, request)
    _create_v2_walls(model, owner_history, context, request, storeys, style_cache)
    _create_v2_shared_walls(
        model,
        owner_history,
        context,
        request,
        storeys,
        shared_wall_segments,
        style_cache,
    )
    _create_v2_slabs(model, owner_history, context, request, storeys, style_cache)
    _create_v2_roof(model, owner_history, context, request, storeys, style_cache)
    _create_spaces(model, owner_history, context, request, storeys, zones)
    output.parent.mkdir(parents=True, exist_ok=True)
    model.write(str(output))


def _validate_request(request: LayoutImportRequestModel) -> list[SharedWallSegment]:
    if isinstance(request, (LayoutImportV2, LayoutImportV3)):
        _validate_v2_generation_prerequisites(request)
        shared_wall_segments = _validated_shared_wall_segments(request)
        if isinstance(request, LayoutImportV3):
            _validate_explicit_openings(request)
        return shared_wall_segments
    return []


def _validate_v2_generation_prerequisites(request: LayoutImportGenerationRequest) -> None:
    boundaries_by_floor = {boundary.floor: boundary for boundary in request.boundaries or []}
    room_floors = sorted({room.floor for room in request.rooms})

    if request.generation_options.generate_walls:
        _require_modeling_default(request, "wall_thickness_mm")
        _require_boundaries_for_floors(boundaries_by_floor, room_floors, "walls")

    if request.generation_options.generate_slabs:
        _require_modeling_default(request, "slab_thickness_mm")
        _require_boundaries_for_floors(boundaries_by_floor, room_floors, "slabs")

    if request.generation_options.generate_roof:
        _require_modeling_default(request, "roof_height_mm")
        top_floor = max(room_floors)
        if top_floor not in boundaries_by_floor:
            raise ValueError(f"missing boundary for roof generation on floor {top_floor}")


def _require_modeling_default(request: LayoutImportGenerationRequest, field_name: str) -> None:
    if request.modeling_defaults is None or getattr(request.modeling_defaults, field_name) is None:
        raise ValueError(f"{field_name} is required when its generation option is enabled")


def _require_boundaries_for_floors(
    boundaries_by_floor: dict[int, BoundaryInput],
    floors: list[int],
    feature_name: str,
) -> None:
    missing_floors = [floor for floor in floors if floor not in boundaries_by_floor]
    if missing_floors:
        missing_text = ", ".join(str(floor) for floor in missing_floors)
        raise ValueError(f"missing boundaries for {feature_name} on floors: {missing_text}")


def _derive_shared_wall_candidates(
    request: LayoutImportGenerationRequest,
) -> list[SharedWallCandidate]:
    if not request.generation_options.generate_walls:
        return []
    if request.generation_policy.shared_wall_policy.value != "from_adjacency":
        return []
    if not request.adjacency:
        return []

    rooms_by_id = _rooms_by_id(request.rooms)
    candidates: list[SharedWallCandidate] = []
    for adjacency in request.adjacency:
        from_room, to_room = _resolve_adjacency_pair(adjacency, rooms_by_id)
        if from_room.floor != to_room.floor:
            raise ValueError(
                f"shared wall adjacency rooms must be on the same floor: "
                f"{from_room.id} ({from_room.floor}F) and {to_room.id} ({to_room.floor}F)"
            )
        if not math.isclose(from_room.angle, 0.0, abs_tol=1.0e-9):
            raise ValueError(f"shared wall adjacency does not support rotated room: {from_room.id}")
        if not math.isclose(to_room.angle, 0.0, abs_tol=1.0e-9):
            raise ValueError(f"shared wall adjacency does not support rotated room: {to_room.id}")

        candidates.append(
            (
                from_room.floor,
                from_room.id,
                to_room.id,
                _room_rectangle_edges_mm(from_room),
                _room_rectangle_edges_mm(to_room),
            )
        )
    return candidates


def _validated_shared_wall_segments(
    request: LayoutImportGenerationRequest,
) -> list[SharedWallSegment]:
    candidates = _derive_shared_wall_candidates(request)
    if not candidates:
        return []

    boundary_edges = _boundary_edge_set_mm(request.boundaries or [])
    deduped_segments: dict[tuple[int, Point2DMm, Point2DMm], SharedWallSegment] = {}

    for candidate in candidates:
        candidate_segments = [
            segment
            for segment in _shared_segments_for_candidate(candidate)
            if not _is_segment_on_any_boundary_edge_mm(segment[1], boundary_edges)
        ]
        if not candidate_segments:
            floor, from_room_id, to_room_id, _, _ = candidate
            raise ValueError(
                "shared wall adjacency must resolve to an interior shared segment: "
                f"{from_room_id}->{to_room_id} on floor {floor}"
            )

        for segment in candidate_segments:
            deduped_segments[_shared_segment_key(segment)] = segment

    return list(deduped_segments.values())


def _validate_explicit_openings(request: LayoutImportV3) -> None:
    openings = request.openings or []
    if not openings:
        return
    if not request.generation_options.generate_walls:
        raise ValueError("explicit openings require generate_walls=true")

    boundary_segments_by_ref = _boundary_segments_by_ref(request)
    shared_segments_by_ref = _shared_segments_by_ref(request)
    for opening in openings:
        floor, host_segment = _resolve_host_wall_segment(
            opening,
            boundary_segments_by_ref,
            shared_segments_by_ref,
        )
        if floor != opening.floor:
            raise ValueError(
                "opening.floor must match the referenced host wall floor: "
                f"{opening.id} ({opening.floor}F) -> {opening.host_wall_ref}"
            )
        if not _point_on_segment_mm((opening.x, opening.y), host_segment):
            raise ValueError(f"opening center must lie on the host wall segment: {opening.id}")
        if not _opening_width_fits_segment_mm(host_segment, (opening.x, opening.y), opening.width):
            raise ValueError(f"opening width must fit within the host wall segment: {opening.id}")


def _boundary_segments_by_ref(
    request: LayoutImportGenerationRequest,
) -> dict[str, SharedWallSegment]:
    refs: dict[str, SharedWallSegment] = {}
    for boundary in request.boundaries or []:
        for segment_index, edge in enumerate(_boundary_segments_mm(boundary), start=1):
            refs[f"wall-boundary-{boundary.floor}-seg-{segment_index}"] = (boundary.floor, edge)
    return refs


def _shared_segments_by_ref(request: LayoutImportGenerationRequest) -> dict[str, SharedWallSegment]:
    boundary_edges = _boundary_edge_set_mm(request.boundaries or [])
    refs: dict[str, SharedWallSegment] = {}
    for candidate in _derive_shared_wall_candidates(request):
        floor, room_a_id, room_b_id, _, _ = candidate
        candidate_segments = [
            segment
            for segment in _shared_segments_for_candidate(candidate)
            if not _is_segment_on_any_boundary_edge_mm(segment[1], boundary_edges)
        ]
        if not candidate_segments:
            continue
        if len(candidate_segments) != 1:
            raise ValueError(
                "shared wall adjacency must resolve to exactly one interior shared segment: "
                f"{room_a_id}<->{room_b_id} on floor {floor}"
            )
        refs[f"wall-room-{room_a_id}-{room_b_id}"] = candidate_segments[0]
        refs[f"wall-room-{room_b_id}-{room_a_id}"] = candidate_segments[0]
    return refs


def _resolve_host_wall_segment(
    opening: OpeningInput,
    boundary_segments_by_ref: dict[str, SharedWallSegment],
    shared_segments_by_ref: dict[str, SharedWallSegment],
) -> SharedWallSegment:
    boundary_match = boundary_segments_by_ref.get(opening.host_wall_ref)
    if boundary_match is not None:
        return boundary_match

    shared_match = shared_segments_by_ref.get(opening.host_wall_ref)
    if shared_match is not None:
        return shared_match

    raise ValueError(f"opening.host_wall_ref must reference a generated host wall: {opening.id}")


def _point_on_segment_mm(
    point: Point2DMm,
    edge: RoomEdgeMm,
    *,
    abs_tol: float = 1.0e-3,
) -> bool:
    (x, y) = point
    (start_x, start_y), (end_x, end_y) = edge
    if math.isclose(start_y, end_y, abs_tol=abs_tol):
        return (
            math.isclose(y, start_y, abs_tol=abs_tol)
            and start_x - abs_tol <= x <= end_x + abs_tol
        )
    return (
        math.isclose(x, start_x, abs_tol=abs_tol)
        and start_y - abs_tol <= y <= end_y + abs_tol
    )


def _opening_width_fits_segment_mm(
    edge: RoomEdgeMm,
    center: Point2DMm,
    width_mm: float,
    *,
    abs_tol: float = 1.0e-3,
) -> bool:
    half_width = width_mm / 2.0
    (center_x, center_y) = center
    (start_x, start_y), (end_x, end_y) = edge
    if math.isclose(start_y, end_y, abs_tol=abs_tol):
        return (
            start_x - abs_tol <= center_x - half_width
            and center_x + half_width <= end_x + abs_tol
        )
    return (
        start_y - abs_tol <= center_y - half_width
        and center_y + half_width <= end_y + abs_tol
    )


def _shared_segments_for_candidate(
    candidate: SharedWallCandidate,
) -> list[SharedWallSegment]:
    floor, _, _, from_edges, to_edges = candidate
    shared_segments: list[SharedWallSegment] = []
    for from_edge in from_edges:
        for to_edge in to_edges:
            shared_edge = _overlapping_collinear_segment_mm(from_edge, to_edge)
            if shared_edge is not None:
                shared_segments.append((floor, shared_edge))
    return shared_segments


def _overlapping_collinear_segment_mm(
    edge_a: RoomEdgeMm,
    edge_b: RoomEdgeMm,
) -> RoomEdgeMm | None:
    (ax1, ay1), (ax2, ay2) = edge_a
    (bx1, by1), (bx2, by2) = edge_b

    edge_a_is_horizontal = math.isclose(ay1, ay2, abs_tol=1.0e-9)
    edge_b_is_horizontal = math.isclose(by1, by2, abs_tol=1.0e-9)
    if edge_a_is_horizontal and edge_b_is_horizontal:
        if not math.isclose(ay1, by1, abs_tol=1.0e-9):
            return None
        start_x = max(ax1, bx1)
        end_x = min(ax2, bx2)
        if end_x - start_x <= 0:
            return None
        return _canonical_edge_mm((start_x, ay1), (end_x, ay1))

    edge_a_is_vertical = math.isclose(ax1, ax2, abs_tol=1.0e-9)
    edge_b_is_vertical = math.isclose(bx1, bx2, abs_tol=1.0e-9)
    if edge_a_is_vertical and edge_b_is_vertical:
        if not math.isclose(ax1, bx1, abs_tol=1.0e-9):
            return None
        start_y = max(ay1, by1)
        end_y = min(ay2, by2)
        if end_y - start_y <= 0:
            return None
        return _canonical_edge_mm((ax1, start_y), (ax1, end_y))

    return None


def _boundary_edge_set_mm(boundaries: list[BoundaryInput]) -> set[RoomEdgeMm]:
    boundary_edges: set[RoomEdgeMm] = set()
    for boundary in boundaries:
        polygon = boundary.polygon_mm or boundary.outer_polygon_mm
        assert polygon is not None
        for index, start_point in enumerate(polygon):
            end_point = polygon[(index + 1) % len(polygon)]
            boundary_edges.add(_canonical_edge_mm(start_point, end_point))
    return boundary_edges


def _shared_segment_key(
    segment: SharedWallSegment,
) -> tuple[int, Point2DMm, Point2DMm]:
    floor, edge = segment
    start_point, end_point = edge
    return floor, start_point, end_point


def _is_segment_on_any_boundary_edge_mm(
    shared_edge: RoomEdgeMm,
    boundary_edges: set[RoomEdgeMm],
) -> bool:
    return any(
        _is_segment_on_boundary_edge_mm(shared_edge, boundary_edge)
        for boundary_edge in boundary_edges
    )


def _is_segment_on_boundary_edge_mm(
    shared_edge: RoomEdgeMm,
    boundary_edge: RoomEdgeMm,
) -> bool:
    (sx1, sy1), (sx2, sy2) = shared_edge
    (bx1, by1), (bx2, by2) = boundary_edge

    shared_is_horizontal = math.isclose(sy1, sy2, abs_tol=1.0e-9)
    boundary_is_horizontal = math.isclose(by1, by2, abs_tol=1.0e-9)
    if shared_is_horizontal and boundary_is_horizontal:
        return (
            math.isclose(sy1, by1, abs_tol=1.0e-9)
            and bx1 <= sx1 <= bx2
            and bx1 <= sx2 <= bx2
        )

    shared_is_vertical = math.isclose(sx1, sx2, abs_tol=1.0e-9)
    boundary_is_vertical = math.isclose(bx1, bx2, abs_tol=1.0e-9)
    if shared_is_vertical and boundary_is_vertical:
        return (
            math.isclose(sx1, bx1, abs_tol=1.0e-9)
            and by1 <= sy1 <= by2
            and by1 <= sy2 <= by2
        )

    return False


def _rooms_by_id(rooms: list[RoomInput]) -> dict[str, RoomInput]:
    return {room.id: room for room in rooms}


def _rooms_by_floor(rooms: list[RoomInput]) -> dict[int, list[RoomInput]]:
    rooms_by_floor: dict[int, list[RoomInput]] = {}
    for room in rooms:
        rooms_by_floor.setdefault(room.floor, []).append(room)
    return rooms_by_floor


def _room_zone_ids_by_room_id(rooms: list[RoomInput]) -> dict[str, str | None]:
    return {room.id: room.zone_id for room in rooms}


def _zone_colors_by_zone_id(request: LayoutImportRequestModel) -> dict[str, str]:
    return {zone.id: zone.color for zone in request.zones or []}


def _resolve_adjacency_pair(
    adjacency: AdjacencyInput,
    rooms_by_id: dict[str, RoomInput],
) -> tuple[RoomInput, RoomInput]:
    from_id = adjacency.room_a_id or adjacency.from_room_id
    to_id = adjacency.room_b_id or adjacency.to_room_id
    if from_id is None or to_id is None:
        raise ValueError("adjacency must provide at least one pair of room IDs")
    return rooms_by_id[from_id], rooms_by_id[to_id]


def _room_rectangle_edges_mm(room: RoomInput) -> tuple[RoomEdgeMm, ...]:
    half_w = room.width / 2.0
    half_h = room.height / 2.0
    cos_a = math.cos(room.angle)
    sin_a = math.sin(room.angle)

    def rotate_point(dx: float, dy: float) -> tuple[float, float]:
        return (
            room.x + dx * cos_a - dy * sin_a,
            room.y + dx * sin_a + dy * cos_a
        )

    p1 = rotate_point(-half_w, -half_h)
    p2 = rotate_point(half_w, -half_h)
    p3 = rotate_point(half_w, half_h)
    p4 = rotate_point(-half_w, half_h)

    return (
        _canonical_edge_mm(p1, p2),
        _canonical_edge_mm(p2, p3),
        _canonical_edge_mm(p3, p4),
        _canonical_edge_mm(p4, p1),
    )


def _canonical_edge_mm(start: Point2DMm, end: Point2DMm) -> RoomEdgeMm:
    x1, y1 = start
    x2, y2 = end
    if math.isclose(y1, y2, abs_tol=1.0e-9):
        return ((min(x1, x2), y1), (max(x1, x2), y1))
    return ((x1, min(y1, y2)), (x1, max(y1, y2)))


def _zone_color_for_boundary_wall(
    request: LayoutImportGenerationRequest,
    floor: int,
    boundary_edge: RoomEdgeMm,
) -> str | None:
    room_zone_ids = _room_zone_ids_for_boundary_edge(request.rooms, floor, boundary_edge)
    return _resolved_zone_color(request, room_zone_ids.values())


def _zone_color_for_shared_wall(
    request: LayoutImportGenerationRequest,
    floor: int,
    shared_edge: RoomEdgeMm,
) -> str | None:
    matching_rooms = _rooms_matching_edge_on_floor(request.rooms, floor, shared_edge)
    if len(matching_rooms) != 2:
        return None
    left_room, right_room = matching_rooms
    if left_room.zone_id is None or right_room.zone_id is None:
        return None
    if left_room.zone_id != right_room.zone_id:
        return None
    return _zone_colors_by_zone_id(request).get(left_room.zone_id)


def _zone_color_for_floor_plate(
    request: LayoutImportGenerationRequest,
    floor: int,
) -> str | None:
    room_zone_ids = _room_zone_ids_by_room_id(_rooms_by_floor(request.rooms).get(floor, []))
    return _resolved_zone_color(request, room_zone_ids.values())


def _room_zone_ids_for_boundary_edge(
    rooms: list[RoomInput],
    floor: int,
    boundary_edge: RoomEdgeMm,
) -> dict[str, str | None]:
    return _room_zone_ids_by_room_id(_rooms_matching_edge_on_floor(rooms, floor, boundary_edge))


def _rooms_matching_edge_on_floor(
    rooms: list[RoomInput],
    floor: int,
    edge: RoomEdgeMm,
) -> list[RoomInput]:
    matching_rooms: list[RoomInput] = []
    for room in rooms:
        if room.floor != floor:
            continue
        if _room_matches_edge(room, edge):
            matching_rooms.append(room)
    return matching_rooms


def _room_matches_edge(room: RoomInput, edge: RoomEdgeMm) -> bool:
    for room_edge in _room_rectangle_edges_mm(room):
        overlapping_edge = _overlapping_collinear_segment_mm(room_edge, edge)
        if overlapping_edge == edge:
            return True
    return False


def _resolved_zone_color(
    request: LayoutImportRequestModel,
    zone_ids: Iterable[str | None],
) -> str | None:
    resolved_zone_ids: set[str] = set()
    for zone_id in zone_ids:
        if zone_id is None:
            return None
        resolved_zone_ids.add(zone_id)

    if len(resolved_zone_ids) != 1:
        return None

    zone_id = next(iter(resolved_zone_ids))
    return _zone_colors_by_zone_id(request).get(zone_id)


def _create_ifc_file() -> ifcopenshell.file:
    return ifcopenshell.file(schema="IFC4")


def _create_project_tree(
    model: ifcopenshell.file,
    request: LayoutImportRequestModel,
) -> tuple[
    ifcopenshell.entity_instance,
    ifcopenshell.entity_instance,
    ifcopenshell.entity_instance,
    dict[int, ifcopenshell.entity_instance],
]:
    owner_history = _create_owner_history(model)
    context = _create_geometric_context(model)
    site_placement = _create_local_placement(model)
    building_placement = _create_local_placement(model, relative_to=site_placement)
    project = model.create_entity(
        "IfcProject",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=request.name,
        UnitsInContext=_create_unit_assignment(model),
        RepresentationContexts=[context],
    )
    site = model.create_entity(
        "IfcSite",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"{request.name} Site",
        CompositionType="ELEMENT",
        ObjectPlacement=site_placement,
    )
    building = model.create_entity(
        "IfcBuilding",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"{request.name} Building",
        CompositionType="ELEMENT",
        ObjectPlacement=building_placement,
    )
    space_height_m = _effective_space_height_m(request)
    storeys = _create_storeys(
        model,
        owner_history,
        building_placement,
        sorted({room.floor for room in request.rooms}),
        space_height_m,
    )
    _create_aggregate(model, owner_history, project, [site], "Project-Site")
    _create_aggregate(model, owner_history, site, [building], "Site-Building")
    _create_aggregate(
        model,
        owner_history,
        building,
        list(storeys.values()),
        "Building-Storeys",
    )
    return owner_history, context, project, storeys


def _create_owner_history(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    person = model.create_entity("IfcPerson", GivenName="AI")
    organization = model.create_entity("IfcOrganization", Name="Batang")
    person_and_org = model.create_entity(
        "IfcPersonAndOrganization",
        ThePerson=person,
        TheOrganization=organization,
    )
    application = model.create_entity(
        "IfcApplication",
        ApplicationDeveloper=organization,
        Version="0.1.0",
        ApplicationFullName="ai-layout-import",
        ApplicationIdentifier="ai-layout-import",
    )
    return model.create_entity(
        "IfcOwnerHistory",
        OwningUser=person_and_org,
        OwningApplication=application,
        ChangeAction="ADDED",
        CreationDate=0,
    )


def _create_unit_assignment(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    length_unit = model.create_entity(
        "IfcSIUnit",
        UnitType="LENGTHUNIT",
        Name="METRE",
    )
    return model.create_entity("IfcUnitAssignment", Units=[length_unit])


def _create_geometric_context(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Model",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1.0e-5,
        WorldCoordinateSystem=_create_axis_placement_3d(model),
    )


def _create_storeys(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    building_placement: ifcopenshell.entity_instance,
    floors: list[int],
    space_height_m: float,
) -> dict[int, ifcopenshell.entity_instance]:
    return {
        floor: model.create_entity(
            "IfcBuildingStorey",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=owner_history,
            Name=f"{floor}F",
            CompositionType="ELEMENT",
            ObjectPlacement=_create_local_placement(
                model,
                relative_to=building_placement,
                location=(0.0, 0.0, (floor - 1) * space_height_m),
            ),
            Elevation=(floor - 1) * space_height_m,
        )
        for floor in floors
    }


def _create_aggregate(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    parent: ifcopenshell.entity_instance,
    children: list[ifcopenshell.entity_instance],
    name: str,
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcRelAggregates",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=name,
        RelatingObject=parent,
        RelatedObjects=children,
    )


def _create_spaces(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    context: ifcopenshell.entity_instance,
    request: LayoutImportRequestModel,
    storeys: dict[int, ifcopenshell.entity_instance],
    zones: dict[str, ifcopenshell.entity_instance],
) -> None:
    space_height_m = _effective_space_height_m(request)
    for room in request.rooms:
        storey = storeys[room.floor]
        space = model.create_entity(
            "IfcSpace",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=owner_history,
            Name=room.name,
            CompositionType="ELEMENT",
            ObjectPlacement=_create_space_placement(
                model,
                relative_to=storey.ObjectPlacement,
                x_mm=room.x,
                y_mm=room.y,
                angle_radians=room.angle,
            ),
            Representation=_create_space_representation(
                model,
                context,
                room.width,
                room.height,
                space_height_m,
            ),
        )
        _attach_room_metadata_property_set(model, owner_history, space, room)
        _contain_in_storey(model, owner_history, space, storey, f"{room.id}-StoreyContainment")
        if room.zone_id is not None:
            _assign_space_to_zone(model, owner_history, space, zones[room.zone_id], room.id)


def _create_zones(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    request: LayoutImportRequestModel,
) -> dict[str, ifcopenshell.entity_instance]:
    zones: dict[str, ifcopenshell.entity_instance] = {}
    for zone in request.zones or []:
        zone_entity = model.create_entity(
            "IfcZone",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=owner_history,
            Name=zone.name,
            ObjectType="Zone",
        )
        _attach_zone_metadata_property_set(model, owner_history, zone_entity, zone)
        zones[zone.id] = zone_entity
    return zones


def _create_v2_walls(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    context: ifcopenshell.entity_instance,
    request: LayoutImportRequestModel,
    storeys: dict[int, ifcopenshell.entity_instance],
    style_cache: StyleAssignmentCache,
) -> None:
    if (
        not isinstance(request, (LayoutImportV2, LayoutImportV3))
        or not request.generation_options.generate_walls
    ):
        return

    if request.generation_policy.boundary_wall_mode is not BoundaryWallMode.OUTER_BOUNDARY:
        raise ValueError("wall generation requires boundary_wall_mode=outer_boundary")

    if request.boundaries is None or request.modeling_defaults is None:
        return

    wall_thickness_m = _mm_to_m(request.modeling_defaults.wall_thickness_mm or 0)
    wall_height_m = _effective_space_height_m(request)

    for boundary in request.boundaries:
        storey = storeys.get(boundary.floor)
        if storey is None:
            continue
        for segment_index, (boundary_edge_mm, boundary_segment_m) in enumerate(
            zip(_boundary_segments_mm(boundary), _boundary_segments_m(boundary), strict=True),
            start=1,
        ):
            zone_color = _zone_color_for_boundary_wall(request, boundary.floor, boundary_edge_mm)
            start_point, end_point = boundary_segment_m
            wall = _create_wall_from_segment(
                model,
                owner_history,
                context,
                storey,
                f"Boundary Wall {boundary.floor}-{segment_index}",
                start_point,
                end_point,
                wall_thickness_m,
                wall_height_m,
            )
            _apply_zone_style(model, wall, zone_color, style_cache)
            _contain_in_storey(
                model,
                owner_history,
                wall,
                storey,
                f"wall-boundary-{boundary.floor}-seg-{segment_index}-StoreyContainment",
            )


def _create_v2_slabs(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    context: ifcopenshell.entity_instance,
    request: LayoutImportRequestModel,
    storeys: dict[int, ifcopenshell.entity_instance],
    style_cache: StyleAssignmentCache,
) -> None:
    if (
        not isinstance(request, (LayoutImportV2, LayoutImportV3))
        or not request.generation_options.generate_slabs
    ):
        return

    if request.boundaries is None or request.modeling_defaults is None:
        return

    slab_thickness_m = _mm_to_m(request.modeling_defaults.slab_thickness_mm or 0)

    for boundary in request.boundaries:
        storey = storeys.get(boundary.floor)
        if storey is None:
            continue
        zone_color = _zone_color_for_floor_plate(request, boundary.floor)
        slab = _create_slab_from_boundary(
            model,
            owner_history,
            context,
            storey,
            boundary,
            slab_thickness_m,
        )
        _apply_zone_style(model, slab, zone_color, style_cache)
        _contain_in_storey(
            model,
            owner_history,
            slab,
            storey,
            f"slab-boundary-{boundary.floor}-StoreyContainment",
        )


def _create_v2_shared_walls(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    context: ifcopenshell.entity_instance,
    request: LayoutImportRequestModel,
    storeys: dict[int, ifcopenshell.entity_instance],
    shared_wall_segments: list[SharedWallSegment],
    style_cache: StyleAssignmentCache,
) -> None:
    if not shared_wall_segments:
        return

    if not isinstance(request, (LayoutImportV2, LayoutImportV3)):
        raise TypeError("shared walls generation requires a V2 or V3 request")
    if request.modeling_defaults is None:
        raise RuntimeError("modeling_defaults must be validated before shared wall generation")
    wall_thickness_m = _mm_to_m(request.modeling_defaults.wall_thickness_mm or 0)
    wall_height_m = _effective_space_height_m(request)
    shared_segments = sorted(
        shared_wall_segments,
        key=lambda segment: (
            segment[0],
            segment[1][0][0],
            segment[1][0][1],
            segment[1][1][0],
            segment[1][1][1],
        ),
    )
    floor_indices: dict[int, int] = {}

    for floor, edge in shared_segments:
        storey = storeys.get(floor)
        if storey is None:
            continue

        zone_color = _zone_color_for_shared_wall(request, floor, edge)
        floor_indices[floor] = floor_indices.get(floor, 0) + 1
        segment_index = floor_indices[floor]
        wall = _create_shared_wall_from_segment(
            model,
            owner_history,
            context,
            storey,
            floor,
            segment_index,
            edge,
            wall_thickness_m,
            wall_height_m,
        )
        _apply_zone_style(model, wall, zone_color, style_cache)
        _contain_in_storey(
            model,
            owner_history,
            wall,
            storey,
            f"shared-wall-{floor}-{segment_index}-StoreyContainment",
        )


def _create_v2_roof(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    context: ifcopenshell.entity_instance,
    request: LayoutImportRequestModel,
    storeys: dict[int, ifcopenshell.entity_instance],
    style_cache: StyleAssignmentCache,
) -> None:
    if (
        not isinstance(request, (LayoutImportV2, LayoutImportV3))
        or not request.generation_options.generate_roof
    ):
        return

    if request.generation_policy.roof_shape is not RoofShape.FLAT:
        raise ValueError("roof generation requires roof_shape=flat")

    if request.boundaries is None or request.modeling_defaults is None:
        return

    boundary = _top_floor_boundary(request)
    if boundary is None:
        return

    storey = storeys.get(boundary.floor)
    if storey is None:
        return

    zone_color = _zone_color_for_floor_plate(request, boundary.floor)
    roof = _create_roof_from_boundary(
        model,
        owner_history,
        context,
        storey,
        boundary,
        _mm_to_m(request.modeling_defaults.roof_height_mm or 0),
        _effective_space_height_m(request),
    )
    _apply_zone_style(model, roof, zone_color, style_cache)
    _contain_in_storey(
        model,
        owner_history,
        roof,
        storey,
        f"roof-boundary-{boundary.floor}-StoreyContainment",
    )


def _boundary_segments_m(
    boundary: BoundaryInput,
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    points = _boundary_polygon_points_m(boundary)
    return [
        (points[index], points[(index + 1) % len(points)])
        for index in range(len(points))
    ]


def _boundary_segments_mm(boundary: BoundaryInput) -> list[RoomEdgeMm]:
    polygon = boundary.polygon_mm or boundary.outer_polygon_mm
    assert polygon is not None
    return [
        _canonical_edge_mm(start_point, polygon[(index + 1) % len(polygon)])
        for index, start_point in enumerate(polygon)
    ]


def _boundary_polygon_points_m(boundary: BoundaryInput) -> list[tuple[float, float]]:
    polygon = boundary.polygon_mm or boundary.outer_polygon_mm
    assert polygon is not None
    return [(_mm_to_m(x), _mm_to_m(y)) for x, y in polygon]


def _top_floor_boundary(request: LayoutImportGenerationRequest) -> BoundaryInput | None:
    if not request.boundaries:
        return None
    top_floor = max(room.floor for room in request.rooms)
    return next((boundary for boundary in request.boundaries if boundary.floor == top_floor), None)


def _create_wall_from_segment(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    context: ifcopenshell.entity_instance,
    storey: ifcopenshell.entity_instance,
    name: str,
    start_point: tuple[float, float],
    end_point: tuple[float, float],
    thickness_m: float,
    height_m: float,
) -> ifcopenshell.entity_instance:
    dx = end_point[0] - start_point[0]
    dy = end_point[1] - start_point[1]
    length_m = math.hypot(dx, dy)
    ref_direction = _unit_direction(dx, dy)

    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=length_m,
        YDim=thickness_m,
        Position=model.create_entity(
            "IfcAxis2Placement2D",
            Location=model.create_entity(
                "IfcCartesianPoint",
                Coordinates=(length_m / 2.0, 0.0),
            ),
            RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0)),
        ),
    )
    body = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=_create_axis_placement_3d(model),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=height_m,
    )
    representation = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    return model.create_entity(
        "IfcWall",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=name,
        ObjectPlacement=_create_local_placement(
            model,
            relative_to=storey.ObjectPlacement,
            location=(start_point[0], start_point[1], 0.0),
            ref_direction=(ref_direction[0], ref_direction[1], 0.0),
        ),
        Representation=model.create_entity(
            "IfcProductDefinitionShape",
            Representations=[representation],
        ),
    )


def _create_slab_from_boundary(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    context: ifcopenshell.entity_instance,
    storey: ifcopenshell.entity_instance,
    boundary: BoundaryInput,
    thickness_m: float,
) -> ifcopenshell.entity_instance:
    profile = model.create_entity(
        "IfcArbitraryClosedProfileDef",
        ProfileType="AREA",
        OuterCurve=_create_closed_polyline(
            model,
            _boundary_polygon_points_m(boundary),
        ),
    )
    body = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=_create_axis_placement_3d(model),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=thickness_m,
    )
    representation = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    return model.create_entity(
        "IfcSlab",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"Boundary Slab {boundary.floor}",
        PredefinedType="FLOOR",
        ObjectPlacement=_create_local_placement(
            model,
            relative_to=storey.ObjectPlacement,
        ),
        Representation=model.create_entity(
            "IfcProductDefinitionShape",
            Representations=[representation],
        ),
    )


def _create_roof_from_boundary(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    context: ifcopenshell.entity_instance,
    storey: ifcopenshell.entity_instance,
    boundary: BoundaryInput,
    thickness_m: float,
    roof_base_z_m: float,
) -> ifcopenshell.entity_instance:
    profile = model.create_entity(
        "IfcArbitraryClosedProfileDef",
        ProfileType="AREA",
        OuterCurve=_create_closed_polyline(
            model,
            _boundary_polygon_points_m(boundary),
        ),
    )
    body = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=_create_axis_placement_3d(model),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=thickness_m,
    )
    representation = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    return model.create_entity(
        "IfcRoof",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"Boundary Roof {boundary.floor}",
        ObjectPlacement=_create_local_placement(
            model,
            relative_to=storey.ObjectPlacement,
            location=(0.0, 0.0, roof_base_z_m),
        ),
        Representation=model.create_entity(
            "IfcProductDefinitionShape",
            Representations=[representation],
        ),
    )


def _create_shared_wall_from_segment(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    context: ifcopenshell.entity_instance,
    storey: ifcopenshell.entity_instance,
    floor: int,
    segment_index: int,
    edge: RoomEdgeMm,
    thickness_m: float,
    height_m: float,
) -> ifcopenshell.entity_instance:
    start_point_mm, end_point_mm = edge
    wall = _create_wall_from_segment(
        model,
        owner_history,
        context,
        storey,
        f"Shared Wall {floor}-{segment_index}",
        (_mm_to_m(start_point_mm[0]), _mm_to_m(start_point_mm[1])),
        (_mm_to_m(end_point_mm[0]), _mm_to_m(end_point_mm[1])),
        thickness_m,
        height_m,
    )
    return wall


def _apply_zone_style(
    model: ifcopenshell.file,
    entity: ifcopenshell.entity_instance,
    color_hex: str | None,
    style_cache: StyleAssignmentCache,
) -> None:
    if color_hex is None:
        return
    representation = getattr(entity, "Representation", None)
    if representation is None:
        return

    representations = list(getattr(representation, "Representations", []) or [])
    if not representations:
        return

    items = list(getattr(representations[0], "Items", []) or [])
    if not items:
        return

    body_item = items[0]
    style_assignment = _style_assignment_for_color(model, color_hex, style_cache)
    model.create_entity("IfcStyledItem", Item=body_item, Styles=[style_assignment])


def _style_assignment_for_color(
    model: ifcopenshell.file,
    color_hex: str,
    style_cache: StyleAssignmentCache,
) -> ifcopenshell.entity_instance:
    cached_assignment = style_cache.get(color_hex)
    if cached_assignment is not None:
        return cached_assignment

    surface_color = _create_ifc_colour_rgb(model, color_hex)
    shading = model.create_entity("IfcSurfaceStyleShading", SurfaceColour=surface_color)
    surface_style = model.create_entity(
        "IfcSurfaceStyle",
        Name=f"ZoneStyle_{color_hex}",
        Side="BOTH",
        Styles=[shading],
    )
    assignment = model.create_entity("IfcPresentationStyleAssignment", Styles=[surface_style])
    style_cache[color_hex] = assignment
    return assignment


def _create_ifc_colour_rgb(
    model: ifcopenshell.file,
    color_hex: str,
) -> ifcopenshell.entity_instance:
    red, green, blue = _hex_to_rgb(color_hex)
    return model.create_entity(
        "IfcColourRgb",
        Name=color_hex,
        Red=red,
        Green=green,
        Blue=blue,
    )


def _hex_to_rgb(color_hex: str) -> tuple[float, float, float]:
    if not color_hex.startswith("#") or len(color_hex) != 7:
        raise ValueError(f"Invalid color hex format: {color_hex!r}. Expected '#RRGGBB'.")
    try:
        return (
            int(color_hex[1:3], 16) / 255.0,
            int(color_hex[3:5], 16) / 255.0,
            int(color_hex[5:7], 16) / 255.0,
        )
    except ValueError as exc:
        raise ValueError(f"Invalid hex character in color: {color_hex!r}") from exc


def _create_closed_polyline(
    model: ifcopenshell.file,
    points: list[tuple[float, float]],
) -> ifcopenshell.entity_instance:
    closed_points = points + [points[0]]
    return model.create_entity(
        "IfcPolyline",
        Points=[
            model.create_entity("IfcCartesianPoint", Coordinates=(x, y))
            for x, y in closed_points
        ],
    )


def _unit_direction(dx: float, dy: float) -> tuple[float, float]:
    length = math.hypot(dx, dy)
    if length == 0:
        raise ValueError("boundary segments must have non-zero length")
    return dx / length, dy / length


def _assign_space_to_zone(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    space: ifcopenshell.entity_instance,
    zone: ifcopenshell.entity_instance,
    room_id: str,
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcRelAssignsToGroup",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"{room_id}-ZoneAssignment",
        RelatedObjects=[space],
        RelatingGroup=zone,
    )


def _contain_in_storey(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    element: ifcopenshell.entity_instance,
    storey: ifcopenshell.entity_instance,
    name: str,
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcRelContainedInSpatialStructure",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=name,
        RelatedElements=[element],
        RelatingStructure=storey,
    )


def _attach_room_metadata_property_set(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    space: ifcopenshell.entity_instance,
    room: RoomInput,
) -> None:
    properties = [
        _create_property_single_value(model, "RoomId", room.id),
        _create_property_single_value(model, "RoomType", room.type.value),
        _create_property_single_value(model, "Locked", room.locked),
    ]
    if room.zone_id is not None:
        properties.append(_create_property_single_value(model, "ZoneId", room.zone_id))
    _attach_property_set(
        model,
        owner_history,
        space,
        "Pset_BatangLayoutImportRoom",
        properties,
    )


def _attach_zone_metadata_property_set(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    zone_entity: ifcopenshell.entity_instance,
    zone: ZoneInput,
) -> None:
    _attach_property_set(
        model,
        owner_history,
        zone_entity,
        "Pset_BatangLayoutImportZone",
        [
            _create_property_single_value(model, "ZoneId", zone.id),
            _create_property_single_value(model, "ZoneColor", zone.color),
        ],
    )


def _attach_project_metadata_property_set(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    project: ifcopenshell.entity_instance,
    request: LayoutImportRequestModel,
) -> None:
    if not request.adjacency:
        return
    _attach_property_set(
        model,
        owner_history,
        project,
        "Pset_BatangLayoutImportProject",
        [
            _create_property_single_value(
                model,
                "AdjacencyJson",
                json.dumps(
                    [
                        adjacency.model_dump(mode="json", exclude_none=True, by_alias=True)
                        for adjacency in request.adjacency
                    ],
                    ensure_ascii=False,
                ),
            )
        ],
    )


def _attach_storey_metadata_property_sets(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    storeys: dict[int, ifcopenshell.entity_instance],
    request: LayoutImportRequestModel,
) -> None:
    if not request.boundaries:
        return

    boundaries_by_floor = {boundary.floor: boundary for boundary in request.boundaries}
    for floor, storey in storeys.items():
        boundary = boundaries_by_floor.get(floor)
        if boundary is None:
            continue
        _attach_property_set(
            model,
            owner_history,
            storey,
            "Pset_BatangLayoutImportStorey",
            [
                _create_property_single_value(
                    model,
                    "BoundaryJson",
                    json.dumps(
                        boundary.model_dump(mode="json", exclude_none=True, by_alias=True),
                        ensure_ascii=False,
                    ),
                )
            ],
        )


def _attach_property_set(
    model: ifcopenshell.file,
    owner_history: ifcopenshell.entity_instance,
    target: ifcopenshell.entity_instance,
    pset_name: str,
    properties: list[ifcopenshell.entity_instance],
) -> ifcopenshell.entity_instance:
    property_set = model.create_entity(
        "IfcPropertySet",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=pset_name,
        HasProperties=properties,
    )
    return model.create_entity(
        "IfcRelDefinesByProperties",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=owner_history,
        Name=f"{pset_name}-Assignment",
        RelatedObjects=[target],
        RelatingPropertyDefinition=property_set,
    )


def _create_property_single_value(
    model: ifcopenshell.file,
    name: str,
    value: str | bool,
) -> ifcopenshell.entity_instance:
    if isinstance(value, bool):
        nominal_value = model.create_entity("IfcBoolean", value)
    elif name.endswith("Json"):
        nominal_value = model.create_entity("IfcText", value)
    else:
        nominal_value = model.create_entity("IfcLabel", value)
    return model.create_entity(
        "IfcPropertySingleValue",
        Name=name,
        NominalValue=nominal_value,
    )


def _create_space_representation(
    model: ifcopenshell.file,
    context: ifcopenshell.entity_instance,
    width_mm: int,
    height_mm: int,
    space_height_m: float,
) -> ifcopenshell.entity_instance:
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=_mm_to_m(width_mm),
        YDim=_mm_to_m(height_mm),
        Position=_create_axis_placement_2d(model),
    )
    body = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        Position=_create_axis_placement_3d(model),
        ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=space_height_m,
    )
    shape_representation = model.create_entity(
        "IfcShapeRepresentation",
        ContextOfItems=context,
        RepresentationIdentifier="Body",
        RepresentationType="SweptSolid",
        Items=[body],
    )
    return model.create_entity(
        "IfcProductDefinitionShape",
        Representations=[shape_representation],
    )


def _create_space_placement(
    model: ifcopenshell.file,
    relative_to: ifcopenshell.entity_instance,
    x_mm: float,
    y_mm: float,
    angle_radians: float,
) -> ifcopenshell.entity_instance:
    return _create_local_placement(
        model,
        relative_to=relative_to,
        location=(_mm_to_m(x_mm), _mm_to_m(y_mm), 0.0),
        ref_direction=(math.cos(angle_radians), math.sin(angle_radians), 0.0),
    )


def _create_local_placement(
    model: ifcopenshell.file,
    relative_to: ifcopenshell.entity_instance | None = None,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    axis: tuple[float, float, float] = (0.0, 0.0, 1.0),
    ref_direction: tuple[float, float, float] = (1.0, 0.0, 0.0),
) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcLocalPlacement",
        PlacementRelTo=relative_to,
        RelativePlacement=_create_axis_placement_3d(
            model,
            location=location,
            axis=axis,
            ref_direction=ref_direction,
        ),
    )


def _create_axis_placement_3d(
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


def _create_axis_placement_2d(model: ifcopenshell.file) -> ifcopenshell.entity_instance:
    return model.create_entity(
        "IfcAxis2Placement2D",
        Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0)),
        RefDirection=model.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0)),
    )


def _effective_space_height_m(request: LayoutImportRequestModel) -> float:
    effective_space_height_mm = 2700
    if (
        request.modeling_defaults is not None
        and request.modeling_defaults.space_height_mm is not None
    ):
        effective_space_height_mm = request.modeling_defaults.space_height_mm
    return _mm_to_m(effective_space_height_mm)


def _mm_to_m(length_mm: int | float) -> float:
    return length_mm / 1000.0
