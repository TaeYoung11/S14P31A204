from __future__ import annotations

import math
from uuid import UUID

from ai_domain import LayoutImportV1, LayoutImportV2, LayoutImportV3, parse_layout_import
from ai_layout_import.layout_optimizer import (
    _center_distance,
    _polygons_overlap_with_area,
    _room_polygon,
    optimize_room_layout_from_adjacency,
)


def _room(
    room_id: str,
    *,
    x: float,
    y: float,
    width: int = 2000,
    height: int = 2000,
    locked: bool = False,
    angle: float = 0.0,
    zone_id: str | None = None,
) -> dict[str, object]:
    room: dict[str, object] = {
        "id": room_id,
        "name": room_id,
        "type": "other",
        "width": width,
        "height": height,
        "floor": 1,
        "x": x,
        "y": y,
        "angle": angle,
        "locked": locked,
    }
    if zone_id is not None:
        room["zoneId"] = zone_id
    return room


def _request(
    *,
    schema_version: str = "v2",
    rooms: list[dict[str, object]],
    adjacency: list[dict[str, object]] | None = None,
    boundaries: list[dict[str, object]] | None = None,
    zones: list[dict[str, object]] | None = None,
) -> LayoutImportV1 | LayoutImportV2 | LayoutImportV3:
    payload: dict[str, object] = {
        "schema_version": schema_version,
        "id": str(UUID("550e8400-e29b-41d4-a716-446655440000")),
        "name": "optimizer-test",
        "rooms": rooms,
    }
    if adjacency is not None:
        payload["adjacency"] = adjacency
    if boundaries is not None:
        payload["boundaries"] = boundaries
    if zones is not None:
        payload["zones"] = zones
    return parse_layout_import(payload)


def _rect_boundary(size: float = 10000.0) -> list[dict[str, object]]:
    return [
        {
            "floor": 1,
            "polygon": [
                [0.0, 0.0],
                [size, 0.0],
                [size, size],
                [0.0, size],
            ],
        }
    ]


def _adjacency(room_a: str, room_b: str, strength: float) -> list[dict[str, object]]:
    return [{"from_room_id": room_a, "to_room_id": room_b, "strength": strength}]


def test_optimizer_noops_for_v1_without_mutating_original_request() -> None:
    request = _request(schema_version="v1", rooms=[_room("room-a", x=1000.0, y=1000.0)])
    original_x = request.rooms[0].x

    optimized, summary = optimize_room_layout_from_adjacency(request)

    assert optimized is request
    assert request.rooms[0].x == original_x
    assert summary.to_report_warnings() is None


def test_optimizer_preserves_contract_fields_and_original_request() -> None:
    request = _request(
        rooms=[
            _room("room-a", x=1500.0, y=1500.0, locked=True, zone_id="zone-private"),
            _room("room-b", x=6000.0, y=1500.0, zone_id="zone-private"),
        ],
        adjacency=_adjacency("room-a", "room-b", 1.0),
        boundaries=_rect_boundary(),
        zones=[{"id": "zone-private", "name": "Private", "color": "#335CFF"}],
    )
    original_room_dump = [room.model_dump(mode="json", by_alias=True) for room in request.rooms]

    optimized, summary = optimize_room_layout_from_adjacency(request)

    assert optimized is not request
    assert [
        room.model_dump(mode="json", by_alias=True)
        for room in request.rooms
    ] == original_room_dump
    assert optimized.rooms[0].id == "room-a"
    assert optimized.rooms[0].locked is True
    assert optimized.rooms[0].zone_id == "zone-private"
    assert optimized.zones is not None
    assert optimized.zones[0].name == "Private"
    assert optimized.zones[0].color == "#335CFF"
    assert optimized.adjacency is not None
    assert optimized.adjacency[0].strength == 1.0
    assert summary.layoutOptimizationApplied is True


def test_overlap_helper_allows_edge_and_corner_touch_only() -> None:
    base = _room("base", x=1000.0, y=1000.0)
    edge_touch = _room("edge", x=3000.0, y=1000.0)
    corner_touch = _room("corner", x=3000.0, y=3000.0)
    separated = _room("far", x=6000.0, y=1000.0)
    overlap = _room("overlap", x=2500.0, y=1000.0)
    request = _request(rooms=[base, edge_touch, corner_touch, separated, overlap])
    rooms = {room.id: room for room in request.rooms}

    assert not _polygons_overlap_with_area(
        _room_polygon(rooms["base"]),
        _room_polygon(rooms["edge"]),
    )
    assert not _polygons_overlap_with_area(
        _room_polygon(rooms["base"]),
        _room_polygon(rooms["corner"]),
    )
    assert not _polygons_overlap_with_area(
        _room_polygon(rooms["base"]),
        _room_polygon(rooms["far"]),
    )
    assert _polygons_overlap_with_area(
        _room_polygon(rooms["base"]),
        _room_polygon(rooms["overlap"]),
    )


def test_strong_adjacency_moves_unlocked_room_to_edge_touch() -> None:
    request = _request(
        rooms=[
            _room("room-a", x=1500.0, y=1500.0, locked=True),
            _room("room-b", x=7000.0, y=1500.0),
        ],
        adjacency=_adjacency("room-a", "room-b", 1.0),
        boundaries=_rect_boundary(),
    )

    optimized, summary = optimize_room_layout_from_adjacency(request)

    rooms = {room.id: room for room in optimized.rooms}
    assert rooms["room-a"].x == 1500.0
    assert rooms["room-b"].x == 3500.0
    assert rooms["room-b"].y == 1500.0
    assert summary.movedRoomCount == 1
    assert summary.satisfiedAdjacencyCount == 1
    assert summary.unsatisfiedAdjacencyCount == 0


def test_medium_adjacency_reduces_distance_without_requiring_edge_touch() -> None:
    request = _request(
        rooms=[
            _room("room-a", x=1500.0, y=1500.0, locked=True),
            _room("room-b", x=8000.0, y=1500.0),
        ],
        adjacency=_adjacency("room-a", "room-b", 0.6),
        boundaries=_rect_boundary(),
    )
    before_distance = _center_distance(request.rooms[0], request.rooms[1])

    optimized, summary = optimize_room_layout_from_adjacency(request)
    rooms = {room.id: room for room in optimized.rooms}

    assert _center_distance(rooms["room-a"], rooms["room-b"]) < before_distance
    assert rooms["room-b"].x == 4100.0
    assert summary.satisfiedAdjacencyCount == 1


def test_weak_adjacency_prefers_loose_pull_over_forced_edge_touch() -> None:
    request = _request(
        rooms=[
            _room("room-a", x=1500.0, y=1500.0, locked=True),
            _room("room-b", x=8000.0, y=1500.0),
        ],
        adjacency=_adjacency("room-a", "room-b", 0.3),
        boundaries=_rect_boundary(),
    )

    optimized, summary = optimize_room_layout_from_adjacency(request)
    rooms = {room.id: room for room in optimized.rooms}

    assert rooms["room-b"].x > 3500.0
    assert rooms["room-b"].x < 8000.0
    assert summary.satisfiedAdjacencyCount == 1


def test_optimizer_preserves_locked_room_and_non_position_fields() -> None:
    request = _request(
        rooms=[
            _room("room-a", x=1500.0, y=1500.0, locked=True, zone_id="zone-a"),
            _room("room-b", x=7000.0, y=1500.0, angle=math.pi / 6, zone_id="zone-a"),
        ],
        adjacency=_adjacency("room-a", "room-b", 1.0),
        boundaries=_rect_boundary(12000.0),
        zones=[{"id": "zone-a", "name": "Zone A", "color": "#FF5733"}],
    )

    optimized, _ = optimize_room_layout_from_adjacency(request)
    rooms = {room.id: room for room in optimized.rooms}

    assert rooms["room-a"].x == 1500.0
    assert rooms["room-a"].y == 1500.0
    assert rooms["room-b"].angle == math.pi / 6
    assert rooms["room-b"].width == 2000
    assert rooms["room-b"].height == 2000
    assert rooms["room-b"].floor == 1
    assert rooms["room-b"].zone_id == "zone-a"


def test_optimizer_keeps_current_position_when_both_rooms_locked() -> None:
    request = _request(
        rooms=[
            _room("room-a", x=1500.0, y=1500.0, locked=True),
            _room("room-b", x=7000.0, y=1500.0, locked=True),
        ],
        adjacency=_adjacency("room-a", "room-b", 1.0),
        boundaries=_rect_boundary(),
    )

    optimized, summary = optimize_room_layout_from_adjacency(request)

    assert [(room.x, room.y) for room in optimized.rooms] == [(1500.0, 1500.0), (7000.0, 1500.0)]
    assert summary.movedRoomCount == 0
    assert summary.unsatisfiedAdjacencyRefs == ["room-a<->room-b"]
    assert summary.skippedAdjacencyReasons == [
        {"adjacencyRef": "room-a<->room-b", "reason": "both_rooms_locked"}
    ]


def test_optimizer_rejects_boundary_and_overlap_violating_candidates() -> None:
    request = _request(
        rooms=[
            _room("room-a", x=1000.0, y=1000.0, locked=True),
            _room("room-b", x=4500.0, y=1000.0),
            _room("room-c", x=3000.0, y=1000.0, locked=True),
            _room("room-d", x=1000.0, y=3000.0, locked=True),
        ],
        adjacency=_adjacency("room-a", "room-b", 1.0),
        boundaries=_rect_boundary(5000.0),
    )

    optimized, summary = optimize_room_layout_from_adjacency(request)
    rooms = {room.id: room for room in optimized.rooms}

    assert (rooms["room-b"].x, rooms["room-b"].y) == (4500.0, 1000.0)
    assert summary.unsatisfiedAdjacencyRefs == ["room-a<->room-b"]


def test_optimizer_skips_cross_floor_adjacency_with_reason() -> None:
    room_a = _room("room-a", x=1000.0, y=1000.0)
    room_b = _room("room-b", x=7000.0, y=1000.0)
    room_b["floor"] = 2
    request = _request(
        rooms=[room_a, room_b],
        adjacency=_adjacency("room-a", "room-b", 1.0),
        boundaries=[
            *_rect_boundary(),
            {
                "floor": 2,
                "polygon": [[0.0, 0.0], [10000.0, 0.0], [10000.0, 10000.0], [0.0, 10000.0]],
            },
        ],
    )

    optimized, summary = optimize_room_layout_from_adjacency(request)

    assert [(room.x, room.y) for room in optimized.rooms] == [(1000.0, 1000.0), (7000.0, 1000.0)]
    assert summary.skippedAdjacencyReasons == [
        {"adjacencyRef": "room-a<->room-b", "reason": "cross_floor"}
    ]


def test_optimizer_is_deterministic_for_repeated_and_reversed_adjacency_order() -> None:
    rooms = [
        _room("room-a", x=1500.0, y=1500.0, locked=True),
        _room("room-b", x=7500.0, y=1500.0),
        _room("room-c", x=7500.0, y=5500.0),
    ]
    adjacency: list[dict[str, object]] = [
        {"from_room_id": "room-a", "to_room_id": "room-b", "strength": 1.0},
        {"from_room_id": "room-a", "to_room_id": "room-c", "strength": 0.6},
    ]
    request = _request(rooms=rooms, adjacency=adjacency, boundaries=_rect_boundary(12000.0))
    reversed_request = _request(
        rooms=rooms,
        adjacency=list(reversed(adjacency)),
        boundaries=_rect_boundary(12000.0),
    )

    outputs = [optimize_room_layout_from_adjacency(request)[0] for _ in range(3)]
    reversed_output = optimize_room_layout_from_adjacency(reversed_request)[0]
    coordinates = [[(room.id, room.x, room.y) for room in output.rooms] for output in outputs]

    assert coordinates[0] == coordinates[1] == coordinates[2]
    assert coordinates[0] == [(room.id, room.x, room.y) for room in reversed_output.rooms]
