from __future__ import annotations

import math

from ..schemas.ifc_context import IFCContext
from ..schemas.validation import ValidationIssue, ValidationSeverity
from .geometry import polygon_perimeter_mm


def validate_ifc_output_context(ifc_context: IFCContext) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    wall_by_id = {wall["id"]: wall for wall in ifc_context.get("walls", [])}

    issues.extend(_validate_duplicate_wall_segments(ifc_context))
    issues.extend(_validate_orphan_fillers(ifc_context, wall_by_id))
    issues.extend(_validate_opening_positions_within_host_walls(ifc_context, wall_by_id))
    issues.extend(_validate_space_perimeter_coverage(ifc_context))
    return issues


def _validate_duplicate_wall_segments(ifc_context: IFCContext) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    seen_segments: dict[tuple[int, tuple[float, float], tuple[float, float]], str] = {}
    for wall in ifc_context.get("walls", []):
        start = tuple(wall["start"])
        end = tuple(wall["end"])
        normalized = tuple(sorted((start, end)))
        segment_key = (wall["floor"], normalized[0], normalized[1])
        previous_wall_id = seen_segments.get(segment_key)
        if previous_wall_id is not None:
            issues.append(
                ValidationIssue(
                    code="duplicate_wall_segment",
                    severity=ValidationSeverity.ERROR,
                    message=f"Wall {wall['id']} duplicates wall segment {previous_wall_id}.",
                    context={
                        "wall_id": wall["id"],
                        "other_wall_id": previous_wall_id,
                        "floor": wall["floor"],
                    },
                )
            )
        else:
            seen_segments[segment_key] = wall["id"]
    return issues


def _validate_orphan_fillers(
    ifc_context: IFCContext,
    wall_by_id: dict[str, dict],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for entity_kind in ("doors", "windows"):
        for filler in ifc_context.get(entity_kind, []):
            host_wall_id = filler["host_wall_id"]
            if host_wall_id not in wall_by_id:
                issues.append(
                    ValidationIssue(
                        code="orphan_filler_missing_host_wall",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"{entity_kind[:-1].capitalize()} {filler['id']} references "
                            f"missing host wall {host_wall_id}."
                        ),
                        context={
                            "entity_kind": entity_kind[:-1],
                            "entity_id": filler["id"],
                            "host_wall_id": host_wall_id,
                        },
                    )
                )
    return issues


def _validate_opening_positions_within_host_walls(
    ifc_context: IFCContext,
    wall_by_id: dict[str, dict],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for entity_kind in ("doors", "windows"):
        for opening_like in ifc_context.get(entity_kind, []):
            wall = wall_by_id.get(opening_like["host_wall_id"])
            if wall is None:
                continue
            wall_length = math.dist(tuple(wall["start"]), tuple(wall["end"]))
            if opening_like["position"] < 0 or opening_like["position"] > wall_length:
                issues.append(
                    ValidationIssue(
                        code="opening_position_outside_host_wall",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"{entity_kind[:-1].capitalize()} {opening_like['id']} lies "
                            f"outside host wall {opening_like['host_wall_id']}."
                        ),
                        context={
                            "entity_kind": entity_kind[:-1],
                            "entity_id": opening_like["id"],
                            "position": opening_like["position"],
                            "wall_length_mm": wall_length,
                        },
                    )
                )
    return issues


def _validate_space_perimeter_coverage(ifc_context: IFCContext) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for space in ifc_context.get("spaces", []):
        space_id = space["id"]
        perimeter = polygon_perimeter_mm(space["polygon"])
        wall_coverage = 0.0
        for wall in ifc_context.get("walls", []):
            if space_id in wall["space_ids"]:
                wall_coverage += math.dist(tuple(wall["start"]), tuple(wall["end"]))
        if perimeter > 0 and wall_coverage + 1.0 < perimeter:
            issues.append(
                ValidationIssue(
                    code="ifc_space_perimeter_not_fully_covered",
                    severity=ValidationSeverity.ERROR,
                    message=f"IFC space {space_id} perimeter is not fully covered by walls.",
                    context={
                        "space_id": space_id,
                        "perimeter_mm": perimeter,
                        "wall_coverage_mm": wall_coverage,
                    },
                )
            )
    return issues


__all__ = ["validate_ifc_output_context"]
