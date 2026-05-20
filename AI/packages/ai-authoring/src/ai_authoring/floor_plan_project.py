from __future__ import annotations

import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ai_planning_2d import extract_ifc_context


def _point(point: tuple[float, float] | list[float]) -> dict[str, float]:
    return {
        "x": round(float(point[0]), 3),
        "y": round(float(point[1]), 3),
    }


def _polygon_area_m2(points: list[tuple[float, float]] | list[list[float]]) -> float:
    if len(points) < 3:
        return 0.0
    area = 0.0
    for index, current in enumerate(points):
        nxt = points[(index + 1) % len(points)]
        area += float(current[0]) * float(nxt[1]) - float(nxt[0]) * float(current[1])
    return round(abs(area) / 2.0 / 1_000_000.0, 4)


def _bbox(
    points: list[tuple[float, float]] | list[list[float]],
) -> tuple[float, float, float, float]:
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def _wall_type(kind: str | None) -> str:
    normalized = (kind or "").upper()
    if normalized == "EXTERIOR":
        return "exterior"
    if normalized == "INTERIOR":
        return "interior"
    if normalized == "LOAD_BEARING":
        return "loadBearing"
    return "partition"


def _wall_length(wall: dict[str, Any]) -> float:
    start = wall["start"]
    end = wall["end"]
    return math.hypot(float(end[0]) - float(start[0]), float(end[1]) - float(start[1]))


def floor_project_from_ifc_path(ifc_path: str | Path, project_id: str) -> dict[str, Any]:
    context = extract_ifc_context(str(ifc_path))
    now = datetime.now(UTC).isoformat().replace("+00:00", "Z")

    storeys = sorted(context.get("storeys", []), key=lambda item: int(item.get("floor") or 0))
    storey_id_by_floor: dict[int, str] = {
        int(storey["floor"]): str(storey["id"])
        for storey in storeys
        if storey.get("id") is not None and storey.get("floor") is not None
    }

    seen_floor_numbers = {
        int(item.get("floor") or 0)
        for key in ("spaces", "walls", "doors", "windows")
        for item in context.get(key, [])
        if item.get("floor") is not None
    }
    for floor in sorted(floor for floor in seen_floor_numbers if floor > 0):
        storey_id_by_floor.setdefault(floor, f"floor-{floor}")

    floors = []
    for floor in sorted(storey_id_by_floor):
        storey = next((item for item in storeys if int(item.get("floor") or 0) == floor), None)
        floors.append(
            {
                "id": storey_id_by_floor[floor],
                "number": floor,
                "name": f"{floor}F",
                "elevation": round(float(storey.get("elevation") or 0.0), 3) if storey else 0.0,
                "ceiling_height": 2700,
            }
        )

    rooms = []
    for space in context.get("spaces", []):
        floor = int(space.get("floor") or 0)
        floor_id = storey_id_by_floor.get(floor)
        polygon_raw = space.get("polygon") or []
        if not floor_id or len(polygon_raw) < 3:
            continue
        min_x, min_y, max_x, max_y = _bbox(polygon_raw)
        width = space.get("width")
        height = space.get("height")
        rooms.append(
            {
                "id": str(space["id"]),
                "name": str(space.get("name") or "Space"),
                "type": str(space.get("type") or "other"),
                "areaM2": _polygon_area_m2(polygon_raw),
                "floor": floor_id,
                "polygon": [_point(point) for point in polygon_raw],
                "metadata": {"globalId": str(space["id"])},
                "width": round(float(width if width is not None else max_x - min_x), 3),
                "height": round(float(height if height is not None else max_y - min_y), 3),
            }
        )

    adjacency = []
    for index, item in enumerate(context.get("adjacency", []), start=1):
        adjacency.append(
            {
                "id": f"adjacency-{index}",
                "from_room_id": str(item["space_a_id"]),
                "to_room_id": str(item["space_b_id"]),
                "strength": float(item.get("strength") or 0.5),
            }
        )

    walls = []
    wall_by_id: dict[str, dict[str, Any]] = {}
    for wall in context.get("walls", []):
        floor = int(wall.get("floor") or 0)
        floor_id = storey_id_by_floor.get(floor)
        if not floor_id:
            continue
        wall_id = str(wall["id"])
        item = {
            "id": wall_id,
            "floor": floor_id,
            "ifc_class": "IfcWall",
            "start": _point(wall["start"]),
            "end": _point(wall["end"]),
            "thickness": int(round(float(wall.get("thickness") or 200))),
            "type": _wall_type(wall.get("kind")),
            "metadata": {"bodyClass": wall.get("body_class")},
        }
        walls.append(item)
        wall_by_id[wall_id] = wall

    openings = []
    for item in context.get("doors", []):
        wall = wall_by_id.get(str(item.get("host_wall_id")))
        length = _wall_length(wall) if wall else 0.0
        if length <= 0.0:
            continue
        floor_id = storey_id_by_floor.get(int(item.get("floor") or 0))
        if not floor_id:
            continue
        openings.append(
            {
                "id": str(item["id"]),
                "floor": floor_id,
                "ifc_class": "IfcDoor",
                "type": "door",
                "wall_id": str(item["host_wall_id"]),
                "wall_position": max(0.0, min(1.0, float(item.get("position") or 0.0) / length)),
                "width": int(round(float(item.get("width") or 900))),
                "height": int(round(float(item.get("height") or 2100))),
            }
        )

    for item in context.get("windows", []):
        wall = wall_by_id.get(str(item.get("host_wall_id")))
        length = _wall_length(wall) if wall else 0.0
        if length <= 0.0:
            continue
        floor_id = storey_id_by_floor.get(int(item.get("floor") or 0))
        if not floor_id:
            continue
        openings.append(
            {
                "id": str(item["id"]),
                "floor": floor_id,
                "ifc_class": "IfcWindow",
                "type": "window",
                "wall_id": str(item["host_wall_id"]),
                "wall_position": max(0.0, min(1.0, float(item.get("position") or 0.0) / length)),
                "width": int(round(float(item.get("width") or 900))),
                "height": int(round(float(item.get("height") or 1200))),
                "sill_height": int(round(float(item.get("sill_height") or 900))),
            }
        )

    return {
        "id": project_id,
        "name": "Latest IFC Floor Plan",
        "created_at": now,
        "updated_at": now,
        "unit": "mm",
        "metadata": {"source": "ifc_edit_worker"},
        "floors": floors,
        "rooms": rooms,
        "adjacency": adjacency,
        "walls": walls,
        "openings": openings,
    }
