from __future__ import annotations

import math

from ..schemas.plan_v14 import OpeningPlan, PlanV14, SpacePlan, WallPlan
from ..schemas.validation import ValidationIssue, ValidationSeverity
from .geometry import polygon_perimeter_mm


def validate_plan_v14(plan: PlanV14) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    wall_by_id = {wall.local_id: wall for wall in plan.final_walls}
    opening_by_id = {opening.local_id: opening for opening in plan.final_openings}
    space_by_id = {space.local_id: space for space in plan.space_plans}

    issues.extend(_validate_unique_ids(plan))
    issues.extend(_validate_space_references(plan.space_plans, wall_by_id, opening_by_id))
    issues.extend(_validate_wall_references(plan.final_walls, space_by_id, opening_by_id))
    issues.extend(_validate_opening_references(plan.final_openings, wall_by_id, space_by_id))
    issues.extend(_validate_required_openings(plan.space_plans, opening_by_id))
    issues.extend(_validate_openings_within_walls(plan.final_openings, wall_by_id))
    issues.extend(_validate_perimeter_coverage(plan.space_plans, wall_by_id))
    issues.extend(
        _validate_circulation_reachability(
            plan.space_plans,
            opening_by_id,
            floor_entrance_space_id=plan.floor_entrance_space_id,
        )
    )
    return issues


def _validate_unique_ids(plan: PlanV14) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for label, ids in (
        ("space", [space.local_id for space in plan.space_plans]),
        ("wall", [wall.local_id for wall in plan.final_walls]),
        ("opening", [opening.local_id for opening in plan.final_openings]),
    ):
        duplicates = sorted({local_id for local_id in ids if ids.count(local_id) > 1})
        for duplicate in duplicates:
            issues.append(
                ValidationIssue(
                    code=f"duplicate_{label}_local_id",
                    severity=ValidationSeverity.ERROR,
                    message=f"Duplicate {label} local_id detected: {duplicate}",
                    context={"local_id": duplicate},
                )
            )
    return issues


def _validate_space_references(
    spaces: list[SpacePlan],
    wall_by_id: dict[str, WallPlan],
    opening_by_id: dict[str, OpeningPlan],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for space in spaces:
        for wall_id in space.walls_bounding_local_ids:
            if wall_id not in wall_by_id:
                issues.append(
                    ValidationIssue(
                        code="space_missing_wall_reference",
                        severity=ValidationSeverity.ERROR,
                        message=f"Space {space.local_id} references missing wall {wall_id}.",
                        context={"space_local_id": space.local_id, "wall_local_id": wall_id},
                    )
                )
        for opening_id in space.openings_local_ids:
            if opening_id not in opening_by_id:
                issues.append(
                    ValidationIssue(
                        code="space_missing_opening_reference",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"Space {space.local_id} references missing opening {opening_id}."
                        ),
                        context={
                            "space_local_id": space.local_id,
                            "opening_local_id": opening_id,
                        },
                    )
                )
    return issues


def _validate_wall_references(
    walls: list[WallPlan],
    space_by_id: dict[str, SpacePlan],
    opening_by_id: dict[str, OpeningPlan],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for wall in walls:
        for space_id in wall.bounded_space_local_ids:
            if space_id not in space_by_id:
                issues.append(
                    ValidationIssue(
                        code="wall_missing_space_reference",
                        severity=ValidationSeverity.ERROR,
                        message=f"Wall {wall.local_id} references missing space {space_id}.",
                        context={"wall_local_id": wall.local_id, "space_local_id": space_id},
                    )
                )
        for opening_id in wall.hosts_opening_local_ids:
            if opening_id not in opening_by_id:
                issues.append(
                    ValidationIssue(
                        code="wall_missing_opening_reference",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"Wall {wall.local_id} references missing opening {opening_id}."
                        ),
                        context={
                            "wall_local_id": wall.local_id,
                            "opening_local_id": opening_id,
                        },
                    )
                )
    return issues


def _validate_opening_references(
    openings: list[OpeningPlan],
    wall_by_id: dict[str, WallPlan],
    space_by_id: dict[str, SpacePlan],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for opening in openings:
        if opening.host_wall_local_id not in wall_by_id:
            issues.append(
                ValidationIssue(
                    code="opening_missing_host_wall",
                    severity=ValidationSeverity.ERROR,
                    message=(
                        f"Opening {opening.local_id} references missing wall "
                        f"{opening.host_wall_local_id}."
                    ),
                    context={
                        "opening_local_id": opening.local_id,
                        "wall_local_id": opening.host_wall_local_id,
                    },
                )
            )
        for space_id in (
            opening.swing_in_space_local_id,
            opening.opens_toward_space_local_id,
            opening.serves_door_requirement_of_space_local_id,
            opening.serves_window_requirement_of_space_local_id,
        ):
            if space_id is not None and space_id not in space_by_id:
                issues.append(
                    ValidationIssue(
                        code="opening_missing_space_reference",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"Opening {opening.local_id} references missing space {space_id}."
                        ),
                        context={
                            "opening_local_id": opening.local_id,
                            "space_local_id": space_id,
                        },
                    )
                )
    return issues


def _validate_required_openings(
    spaces: list[SpacePlan],
    opening_by_id: dict[str, OpeningPlan],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for space in spaces:
        door_ids = space.required_openings.door_satisfied_by_opening_local_ids
        window_ids = space.required_openings.window_satisfied_by_opening_local_ids

        if len(door_ids) < space.required_openings.needs_door_count:
            issues.append(
                ValidationIssue(
                    code="space_missing_required_door",
                    severity=ValidationSeverity.ERROR,
                    message=f"Space {space.local_id} does not satisfy required door count.",
                    context={
                        "space_local_id": space.local_id,
                        "required": space.required_openings.needs_door_count,
                        "actual": len(door_ids),
                    },
                )
            )
        if len(window_ids) < space.required_openings.needs_window_count:
            issues.append(
                ValidationIssue(
                    code="space_missing_required_window",
                    severity=ValidationSeverity.ERROR,
                    message=f"Space {space.local_id} does not satisfy required window count.",
                    context={
                        "space_local_id": space.local_id,
                        "required": space.required_openings.needs_window_count,
                        "actual": len(window_ids),
                    },
                )
            )

        for opening_id in [*door_ids, *window_ids]:
            if opening_id not in opening_by_id:
                issues.append(
                    ValidationIssue(
                        code="space_required_opening_missing",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"Space {space.local_id} requires missing opening {opening_id}."
                        ),
                        context={
                            "space_local_id": space.local_id,
                            "opening_local_id": opening_id,
                        },
                    )
                )
    return issues


def _validate_openings_within_walls(
    openings: list[OpeningPlan],
    wall_by_id: dict[str, WallPlan],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for opening in openings:
        wall = wall_by_id.get(opening.host_wall_local_id)
        if wall is None:
            continue
        wall_length = _segment_length_mm(wall.start_mm, wall.end_mm)
        start_mm, end_mm = opening.segment_along_wall_mm
        if start_mm < 0 or end_mm > wall_length:
            issues.append(
                ValidationIssue(
                    code="opening_outside_host_wall_length",
                    severity=ValidationSeverity.ERROR,
                    message=(
                        f"Opening {opening.local_id} lies outside host wall "
                        f"{opening.host_wall_local_id}."
                    ),
                    context={
                        "opening_local_id": opening.local_id,
                        "wall_local_id": opening.host_wall_local_id,
                        "wall_length_mm": wall_length,
                        "segment_along_wall_mm": opening.segment_along_wall_mm,
                    },
                )
            )
    return issues


def _validate_perimeter_coverage(
    spaces: list[SpacePlan],
    wall_by_id: dict[str, WallPlan],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for space in spaces:
        perimeter = polygon_perimeter_mm(space.polygon_world_mm)
        wall_coverage = sum(
            _segment_length_mm(wall_by_id[wall_id].start_mm, wall_by_id[wall_id].end_mm)
            for wall_id in space.walls_bounding_local_ids
            if wall_id in wall_by_id
        )
        if perimeter > 0 and wall_coverage + 1.0 < perimeter:
            issues.append(
                ValidationIssue(
                    code="space_perimeter_not_fully_covered",
                    severity=ValidationSeverity.ERROR,
                    message=f"Space {space.local_id} perimeter is not fully covered by walls.",
                    context={
                        "space_local_id": space.local_id,
                        "perimeter_mm": perimeter,
                        "wall_coverage_mm": wall_coverage,
                    },
                )
            )
    return issues


def _validate_circulation_reachability(
    spaces: list[SpacePlan],
    opening_by_id: dict[str, OpeningPlan],
    *,
    floor_entrance_space_id: str | None,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if not spaces or floor_entrance_space_id is None:
        return issues

    for space in spaces:
        if space.local_id == floor_entrance_space_id:
            continue
        source_space = space.access_circulation.reachable_from_space_local_id
        via_opening = space.access_circulation.via_opening_local_id
        if source_space is None or via_opening is None:
            issues.append(
                ValidationIssue(
                    code="space_unreachable_from_entrance",
                    severity=ValidationSeverity.ERROR,
                    message=f"Space {space.local_id} is not linked to circulation.",
                    context={"space_local_id": space.local_id},
                )
            )
            continue
        if via_opening not in opening_by_id:
            issues.append(
                ValidationIssue(
                    code="circulation_opening_missing",
                    severity=ValidationSeverity.ERROR,
                    message=(
                        f"Space {space.local_id} references missing circulation opening "
                        f"{via_opening}."
                    ),
                    context={
                        "space_local_id": space.local_id,
                        "opening_local_id": via_opening,
                    },
                )
            )
        if source_space == space.local_id:
            issues.append(
                ValidationIssue(
                    code="circulation_self_reference",
                    severity=ValidationSeverity.ERROR,
                    message=f"Space {space.local_id} points to itself for circulation.",
                    context={"space_local_id": space.local_id},
                )
            )
    return issues


def _segment_length_mm(start: tuple[float, float], end: tuple[float, float]) -> float:
    return math.dist(start, end)


__all__ = ["validate_plan_v14"]
