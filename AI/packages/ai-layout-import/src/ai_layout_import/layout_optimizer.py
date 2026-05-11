"""Adjacency-aware room placement optimizer for layout import requests."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

from ai_domain import (
    AdjacencyInput,
    BoundaryInput,
    LayoutImportV1,
    LayoutImportV2,
    LayoutImportV3,
    RoomInput,
)

Point2DMm = tuple[float, float]
PolygonMm = tuple[Point2DMm, ...]
LayoutImportRequestModel = LayoutImportV1 | LayoutImportV2 | LayoutImportV3
LayoutImportGenerationRequest = LayoutImportV2 | LayoutImportV3

_EPSILON = 1.0e-6
_STRONG_THRESHOLD = 0.75
_MEDIUM_THRESHOLD = 0.45
_MEDIUM_GAP_MM = 600.0
_WEAK_STEP_RATIO = 0.35


@dataclass(frozen=True)
class LayoutOptimizationSummary:
    layoutOptimizationApplied: bool = False
    movedRoomCount: int = 0
    satisfiedAdjacencyCount: int = 0
    unsatisfiedAdjacencyCount: int = 0
    unsatisfiedAdjacencyRefs: list[str] = field(default_factory=list)
    skippedAdjacencyReasons: list[dict[str, str]] = field(default_factory=list)

    @property
    def hasWarnings(self) -> bool:
        return self.layoutOptimizationApplied and (
            self.unsatisfiedAdjacencyCount > 0 or bool(self.skippedAdjacencyReasons)
        )

    def to_report_warnings(self) -> dict[str, object] | None:
        if not self.layoutOptimizationApplied:
            return None
        return {
            "layoutOptimizationApplied": self.layoutOptimizationApplied,
            "movedRoomCount": self.movedRoomCount,
            "satisfiedAdjacencyCount": self.satisfiedAdjacencyCount,
            "unsatisfiedAdjacencyCount": self.unsatisfiedAdjacencyCount,
            "unsatisfiedAdjacencyRefs": self.unsatisfiedAdjacencyRefs,
            "skippedAdjacencyReasons": self.skippedAdjacencyReasons,
        }


@dataclass(frozen=True)
class _Candidate:
    x: float
    y: float
    kind: str
    index: int


@dataclass(frozen=True)
class _OptimizationStats:
    moved_room_ids: frozenset[str]
    satisfied_refs: tuple[str, ...]
    unsatisfied_refs: tuple[str, ...]
    skipped_reasons: tuple[dict[str, str], ...]


def optimize_room_layout_from_adjacency(
    request: LayoutImportRequestModel,
) -> tuple[LayoutImportRequestModel, LayoutOptimizationSummary]:
    """Return a request copy with unlocked room x/y adjusted by adjacency strength."""

    if not isinstance(request, (LayoutImportV2, LayoutImportV3)):
        return request, LayoutOptimizationSummary()
    if not request.adjacency:
        return request.model_copy(deep=True), LayoutOptimizationSummary()

    optimized_request = request.model_copy(deep=True)
    stats = _optimize_generation_request(optimized_request)
    summary = LayoutOptimizationSummary(
        layoutOptimizationApplied=True,
        movedRoomCount=len(stats.moved_room_ids),
        satisfiedAdjacencyCount=len(stats.satisfied_refs),
        unsatisfiedAdjacencyCount=len(stats.unsatisfied_refs),
        unsatisfiedAdjacencyRefs=list(stats.unsatisfied_refs),
        skippedAdjacencyReasons=list(stats.skipped_reasons),
    )
    return optimized_request, summary


def _optimize_generation_request(request: LayoutImportGenerationRequest) -> _OptimizationStats:
    rooms_by_id = {room.id: room for room in request.rooms}
    original_positions = {room.id: (room.x, room.y) for room in request.rooms}
    boundaries_by_floor = {boundary.floor: boundary for boundary in request.boundaries or []}
    moved_room_ids: set[str] = set()
    satisfied_refs: set[str] = set()
    unsatisfied_refs: set[str] = set()
    skipped_reasons: list[dict[str, str]] = []

    for adjacency in _sorted_adjacencies(request.adjacency or []):
        room_a, room_b = _resolve_adjacency_pair(adjacency, rooms_by_id)
        ref = _adjacency_ref(room_a.id, room_b.id)

        if room_a.floor != room_b.floor:
            unsatisfied_refs.add(ref)
            skipped_reasons.append(_skip_reason(ref, "cross_floor"))
            continue

        moving_room, anchor_room = _select_moving_room(room_a, room_b)
        if moving_room is None or anchor_room is None:
            if _adjacency_satisfied(room_a, room_b, adjacency.strength):
                satisfied_refs.add(ref)
            else:
                unsatisfied_refs.add(ref)
                skipped_reasons.append(_skip_reason(ref, "both_rooms_locked"))
            continue

        boundary = boundaries_by_floor.get(moving_room.floor)
        current_rooms = list(rooms_by_id.values())
        candidates = _candidate_positions(moving_room, anchor_room, adjacency.strength)
        best_candidate = _best_candidate(
            moving_room=moving_room,
            anchor_room=anchor_room,
            rooms=current_rooms,
            boundary=boundary,
            candidates=candidates,
            strength=adjacency.strength,
            original_position=original_positions[moving_room.id],
        )

        if best_candidate is None:
            if _adjacency_satisfied(room_a, room_b, adjacency.strength):
                satisfied_refs.add(ref)
            else:
                unsatisfied_refs.add(ref)
                skipped_reasons.append(_skip_reason(ref, "no_feasible_candidate"))
            continue

        moving_room.x = best_candidate.x
        moving_room.y = best_candidate.y
        if not _points_close((moving_room.x, moving_room.y), original_positions[moving_room.id]):
            moved_room_ids.add(moving_room.id)

        if _adjacency_satisfied(room_a, room_b, adjacency.strength):
            satisfied_refs.add(ref)
            unsatisfied_refs.discard(ref)
        else:
            unsatisfied_refs.add(ref)
            skipped_reasons.append(_skip_reason(ref, "not_satisfied_after_optimization"))

    return _OptimizationStats(
        moved_room_ids=frozenset(sorted(moved_room_ids)),
        satisfied_refs=tuple(sorted(satisfied_refs)),
        unsatisfied_refs=tuple(sorted(unsatisfied_refs)),
        skipped_reasons=tuple(
            sorted(skipped_reasons, key=lambda item: (item["adjacencyRef"], item["reason"]))
        ),
    )


def _sorted_adjacencies(adjacencies: list[AdjacencyInput]) -> list[AdjacencyInput]:
    return sorted(
        adjacencies,
        key=lambda adjacency: (
            -adjacency.strength,
            _adjacency_ref(*_adjacency_ids(adjacency)),
        ),
    )


def _adjacency_ids(adjacency: AdjacencyInput) -> tuple[str, str]:
    from_id = adjacency.room_a_id or adjacency.from_room_id
    to_id = adjacency.room_b_id or adjacency.to_room_id
    if from_id is None or to_id is None:
        raise ValueError("adjacency must provide at least one pair of room IDs")
    return from_id, to_id


def _resolve_adjacency_pair(
    adjacency: AdjacencyInput,
    rooms_by_id: dict[str, RoomInput],
) -> tuple[RoomInput, RoomInput]:
    from_id, to_id = _adjacency_ids(adjacency)
    try:
        return rooms_by_id[from_id], rooms_by_id[to_id]
    except KeyError as exc:
        missing_room_id = str(exc.args[0])
        raise ValueError(
            f"adjacency references unknown room id: {missing_room_id}"
        ) from exc


def _adjacency_ref(room_a_id: str, room_b_id: str) -> str:
    left, right = sorted((room_a_id, room_b_id))
    return f"{left}<->{right}"


def _skip_reason(adjacency_ref: str, reason: str) -> dict[str, str]:
    return {"adjacencyRef": adjacency_ref, "reason": reason}


def _select_moving_room(
    room_a: RoomInput,
    room_b: RoomInput,
) -> tuple[RoomInput | None, RoomInput | None]:
    if room_a.locked and room_b.locked:
        return None, None
    if room_a.locked:
        return room_b, room_a
    if room_b.locked:
        return room_a, room_b
    if room_a.id <= room_b.id:
        return room_b, room_a
    return room_a, room_b


def _candidate_positions(
    moving_room: RoomInput,
    anchor_room: RoomInput,
    strength: float,
) -> list[_Candidate]:
    candidates: list[tuple[float, float, str]] = [(moving_room.x, moving_room.y, "current")]
    edge_candidates = _edge_touch_positions(moving_room, anchor_room, gap_mm=0.0)
    if strength >= _STRONG_THRESHOLD:
        candidates.extend((*point, "edge_touch") for point in edge_candidates)
        candidates.extend(
            (*point, "short_gap")
            for point in _edge_touch_positions(moving_room, anchor_room, gap_mm=_MEDIUM_GAP_MM)
        )
    elif strength >= _MEDIUM_THRESHOLD:
        candidates.extend(
            (*point, "short_gap")
            for point in _edge_touch_positions(moving_room, anchor_room, gap_mm=_MEDIUM_GAP_MM)
        )
    else:
        candidates.append((*_weak_position(moving_room, anchor_room), "weak_pull"))
        candidates.extend(
            (*point, "loose_gap")
            for point in _edge_touch_positions(moving_room, anchor_room, gap_mm=_MEDIUM_GAP_MM * 2)
        )

    seen: set[tuple[float, float, str]] = set()
    unique_candidates: list[_Candidate] = []
    for index, (x, y, kind) in enumerate(candidates):
        key = (round(x, 6), round(y, 6), kind)
        if key in seen:
            continue
        seen.add(key)
        unique_candidates.append(_Candidate(x=x, y=y, kind=kind, index=index))
    return unique_candidates


def _edge_touch_positions(
    moving_room: RoomInput,
    anchor_room: RoomInput,
    *,
    gap_mm: float,
) -> list[Point2DMm]:
    half_anchor_w = anchor_room.width / 2.0
    half_anchor_h = anchor_room.height / 2.0
    half_moving_w = moving_room.width / 2.0
    half_moving_h = moving_room.height / 2.0
    return [
        (anchor_room.x + half_anchor_w + half_moving_w + gap_mm, anchor_room.y),
        (anchor_room.x - half_anchor_w - half_moving_w - gap_mm, anchor_room.y),
        (anchor_room.x, anchor_room.y + half_anchor_h + half_moving_h + gap_mm),
        (anchor_room.x, anchor_room.y - half_anchor_h - half_moving_h - gap_mm),
    ]


def _weak_position(moving_room: RoomInput, anchor_room: RoomInput) -> Point2DMm:
    return (
        moving_room.x + (anchor_room.x - moving_room.x) * _WEAK_STEP_RATIO,
        moving_room.y + (anchor_room.y - moving_room.y) * _WEAK_STEP_RATIO,
    )


def _best_candidate(
    *,
    moving_room: RoomInput,
    anchor_room: RoomInput,
    rooms: list[RoomInput],
    boundary: BoundaryInput | None,
    candidates: list[_Candidate],
    strength: float,
    original_position: Point2DMm,
) -> _Candidate | None:
    scored_candidates: list[tuple[float, float, str, int, _Candidate]] = []
    for candidate in candidates:
        if not _candidate_is_feasible(moving_room, rooms, boundary, candidate):
            continue
        distance = _candidate_center_distance(candidate, anchor_room)
        movement = _distance((candidate.x, candidate.y), original_position)
        edge_touch_bonus = -5000.0 if (
            strength >= _STRONG_THRESHOLD
            and _rooms_touch_at_position(moving_room, anchor_room, candidate)
        ) else 0.0
        movement_penalty = movement * (0.03 if strength >= _STRONG_THRESHOLD else 0.18)
        score = distance * max(strength, 0.1) + movement_penalty + edge_touch_bonus
        scored_candidates.append((score, movement, moving_room.id, candidate.index, candidate))

    if not scored_candidates:
        return None
    return min(scored_candidates, key=lambda item: item[:4])[4]


def _candidate_is_feasible(
    moving_room: RoomInput,
    rooms: list[RoomInput],
    boundary: BoundaryInput | None,
    candidate: _Candidate,
) -> bool:
    candidate_polygon = _room_polygon_at(moving_room, candidate.x, candidate.y)
    if boundary is not None and not _room_polygon_inside_boundary(candidate_polygon, boundary):
        return False
    for room in rooms:
        if room.id == moving_room.id or room.floor != moving_room.floor:
            continue
        if _polygons_overlap_with_area(candidate_polygon, _room_polygon(room)):
            return False
    return True


def _candidate_center_distance(candidate: _Candidate, anchor_room: RoomInput) -> float:
    return _distance((candidate.x, candidate.y), (anchor_room.x, anchor_room.y))


def _adjacency_satisfied(room_a: RoomInput, room_b: RoomInput, strength: float) -> bool:
    if strength >= _STRONG_THRESHOLD:
        return _rooms_touch(room_a, room_b)
    target_distance = _target_center_distance(room_a, room_b, strength)
    return _center_distance(room_a, room_b) <= target_distance + _EPSILON


def _target_center_distance(room_a: RoomInput, room_b: RoomInput, strength: float) -> float:
    max_extent = max(room_a.width, room_a.height, room_b.width, room_b.height)
    if strength >= _MEDIUM_THRESHOLD:
        return max_extent + _MEDIUM_GAP_MM
    return max_extent * 2.25


def _rooms_touch(room_a: RoomInput, room_b: RoomInput) -> bool:
    return _polygons_touch(_room_polygon(room_a), _room_polygon(room_b))


def _rooms_touch_at_position(
    moving_room: RoomInput,
    anchor_room: RoomInput,
    candidate: _Candidate,
) -> bool:
    return _polygons_touch(
        _room_polygon_at(moving_room, candidate.x, candidate.y),
        _room_polygon(anchor_room),
    )


def _center_distance(room_a: RoomInput, room_b: RoomInput) -> float:
    return _distance((room_a.x, room_a.y), (room_b.x, room_b.y))


def _distance(first: Point2DMm, second: Point2DMm) -> float:
    return math.hypot(first[0] - second[0], first[1] - second[1])


def _points_close(first: Point2DMm, second: Point2DMm) -> bool:
    return math.isclose(first[0], second[0], abs_tol=_EPSILON) and math.isclose(
        first[1], second[1], abs_tol=_EPSILON
    )


def _room_bounds(room: RoomInput) -> tuple[float, float, float, float]:
    polygon = _room_polygon(room)
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def _room_polygon(room: RoomInput) -> PolygonMm:
    return _room_polygon_at(room, room.x, room.y)


def _room_polygon_at(room: RoomInput, x: float, y: float) -> PolygonMm:
    half_w = room.width / 2.0
    half_h = room.height / 2.0
    cos_a = math.cos(room.angle)
    sin_a = math.sin(room.angle)
    corners = ((-half_w, -half_h), (half_w, -half_h), (half_w, half_h), (-half_w, half_h))
    return tuple((x + dx * cos_a - dy * sin_a, y + dx * sin_a + dy * cos_a) for dx, dy in corners)


def _polygons_overlap_with_area(polygon_a: PolygonMm, polygon_b: PolygonMm) -> bool:
    for axis in (*_polygon_axes(polygon_a), *_polygon_axes(polygon_b)):
        min_a, max_a = _project_polygon(polygon_a, axis)
        min_b, max_b = _project_polygon(polygon_b, axis)
        if min(max_a, max_b) - max(min_a, min_b) <= _EPSILON:
            return False
    return True


def _polygons_touch(polygon_a: PolygonMm, polygon_b: PolygonMm) -> bool:
    if _polygons_overlap_with_area(polygon_a, polygon_b):
        return False
    for point_a in polygon_a:
        for point_b in polygon_b:
            if _distance(point_a, point_b) <= _EPSILON:
                return True
    for index, start in enumerate(polygon_a):
        end = polygon_a[(index + 1) % len(polygon_a)]
        for point in polygon_b:
            if _point_on_segment(point, start, end):
                return True
    for index, start in enumerate(polygon_b):
        end = polygon_b[(index + 1) % len(polygon_b)]
        for point in polygon_a:
            if _point_on_segment(point, start, end):
                return True
    return False


def _polygon_axes(polygon: PolygonMm) -> tuple[Point2DMm, ...]:
    axes: list[Point2DMm] = []
    for index, start in enumerate(polygon):
        end = polygon[(index + 1) % len(polygon)]
        edge_x = end[0] - start[0]
        edge_y = end[1] - start[1]
        length = math.hypot(edge_x, edge_y)
        if length <= _EPSILON:
            continue
        axes.append((-edge_y / length, edge_x / length))
    return tuple(axes)


def _project_polygon(polygon: PolygonMm, axis: Point2DMm) -> tuple[float, float]:
    projected = [point[0] * axis[0] + point[1] * axis[1] for point in polygon]
    return min(projected), max(projected)


def _room_polygon_inside_boundary(polygon: PolygonMm, boundary: BoundaryInput) -> bool:
    boundary_polygon = tuple(boundary.polygon_mm or boundary.outer_polygon_mm or ())
    if len(boundary_polygon) < 3:
        return True
    return all(_point_inside_or_on_polygon(point, boundary_polygon) for point in polygon)


def _point_inside_or_on_polygon(point: Point2DMm, polygon: PolygonMm) -> bool:
    for index, start in enumerate(polygon):
        end = polygon[(index + 1) % len(polygon)]
        if _point_on_segment(point, start, end):
            return True

    x, y = point
    inside = False
    previous = polygon[-1]
    for current in polygon:
        xi, yi = current
        xj, yj = previous
        intersects = (yi > y) != (yj > y) and (
            x < (xj - xi) * (y - yi) / ((yj - yi) or _EPSILON) + xi
        )
        if intersects:
            inside = not inside
        previous = current
    return inside


def _point_on_segment(point: Point2DMm, start: Point2DMm, end: Point2DMm) -> bool:
    px, py = point
    sx, sy = start
    ex, ey = end
    cross = (px - sx) * (ey - sy) - (py - sy) * (ex - sx)
    if not math.isclose(cross, 0.0, abs_tol=_EPSILON):
        return False
    return (
        min(sx, ex) - _EPSILON <= px <= max(sx, ex) + _EPSILON
        and min(sy, ey) - _EPSILON <= py <= max(sy, ey) + _EPSILON
    )


def _relationship_kind(strength: float) -> Literal["strong", "medium", "weak"]:
    if strength >= _STRONG_THRESHOLD:
        return "strong"
    if strength >= _MEDIUM_THRESHOLD:
        return "medium"
    return "weak"
