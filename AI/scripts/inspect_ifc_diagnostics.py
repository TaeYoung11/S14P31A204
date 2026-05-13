"""Print compact diagnostics for an IFC file.

Usage:
    python AI/scripts/inspect_ifc_diagnostics.py path/to/model.ifc
"""

from __future__ import annotations

import math
import sys
from collections import Counter
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom


IMPORTANT_TYPES = [
    "IfcProject",
    "IfcSite",
    "IfcBuilding",
    "IfcBuildingStorey",
    "IfcProduct",
    "IfcElement",
    "IfcWall",
    "IfcWallStandardCase",
    "IfcSlab",
    "IfcSpace",
    "IfcDoor",
    "IfcWindow",
    "IfcColumn",
    "IfcBeam",
    "IfcRoof",
    "IfcStair",
    "IfcOpeningElement",
]


def log_section(title: str) -> None:
    print()
    print("=" * 80)
    print(title)
    print("=" * 80)


def safe_len(model: ifcopenshell.file, entity_name: str) -> int:
    try:
        return len(model.by_type(entity_name))
    except RuntimeError:
        return -1


def read_file_schema_line(path: Path) -> str | None:
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as file:
            for line in file:
                if "FILE_SCHEMA" in line.upper():
                    return line.strip()
    except OSError:
        return None
    return None


def finite_bbox(vertices: list[float]) -> tuple[tuple[float, float, float], tuple[float, float, float]] | None:
    if len(vertices) < 3:
        return None

    xs = vertices[0::3]
    ys = vertices[1::3]
    zs = vertices[2::3]
    all_values = xs + ys + zs
    if any(not math.isfinite(value) for value in all_values):
        return None

    return (
        (min(xs), min(ys), min(zs)),
        (max(xs), max(ys), max(zs)),
    )


def update_global_bbox(
    current: tuple[list[float], list[float]] | None,
    bbox: tuple[tuple[float, float, float], tuple[float, float, float]],
) -> tuple[list[float], list[float]]:
    low, high = bbox
    if current is None:
        return [low[0], low[1], low[2]], [high[0], high[1], high[2]]

    current_low, current_high = current
    for index in range(3):
        current_low[index] = min(current_low[index], low[index])
        current_high[index] = max(current_high[index], high[index])
    return current_low, current_high


def inspect_geometry(model: ifcopenshell.file) -> None:
    settings = ifcopenshell.geom.settings()
    products = [
        product
        for product in model.by_type("IfcProduct")
        if getattr(product, "Representation", None) is not None
    ]

    ok = 0
    failed = 0
    empty = 0
    total_vertices = 0
    total_triangles = 0
    global_bbox: tuple[list[float], list[float]] | None = None
    failures: list[str] = []

    for product in products:
        label = f"#{product.id()} {product.is_a()} {getattr(product, 'Name', None)!r}"
        try:
            shape = ifcopenshell.geom.create_shape(settings, product)
            geometry = shape.geometry
            vertices = list(geometry.verts)
            faces = list(geometry.faces)

            if not vertices or not faces:
                empty += 1
                failures.append(f"EMPTY {label}")
                continue

            bbox = finite_bbox(vertices)
            if bbox is None:
                failed += 1
                failures.append(f"NON_FINITE_BBOX {label}")
                continue

            ok += 1
            total_vertices += len(vertices) // 3
            total_triangles += len(faces) // 3
            global_bbox = update_global_bbox(global_bbox, bbox)
        except Exception as exc:  # noqa: BLE001 - diagnostic script should keep scanning
            failed += 1
            failures.append(f"FAIL {label}: {type(exc).__name__}: {exc}")

    print(f"products_with_representation: {len(products)}")
    print(f"geometry_ok: {ok}")
    print(f"geometry_empty: {empty}")
    print(f"geometry_failed: {failed}")
    print(f"total_vertices: {total_vertices}")
    print(f"total_triangles: {total_triangles}")

    if global_bbox is not None:
        low, high = global_bbox
        extent = [high[index] - low[index] for index in range(3)]
        print(f"global_bbox_min: {tuple(round(value, 4) for value in low)}")
        print(f"global_bbox_max: {tuple(round(value, 4) for value in high)}")
        print(f"global_bbox_extent: {tuple(round(value, 4) for value in extent)}")

    if failures:
        print()
        print("first_failures:")
        for item in failures[:30]:
            print(f"- {item}")
        if len(failures) > 30:
            print(f"- ... {len(failures) - 30} more")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python AI/scripts/inspect_ifc_diagnostics.py path/to/model.ifc")
        return 2

    path = Path(sys.argv[1]).expanduser().resolve()
    if not path.exists():
        print(f"IFC file not found: {path}")
        return 2

    log_section("IFC FILE")
    print(f"path: {path}")
    print(f"size_bytes: {path.stat().st_size}")
    print(f"file_schema_line: {read_file_schema_line(path)}")

    log_section("IFCOPENSHELL PARSE")
    try:
        model = ifcopenshell.open(str(path))
    except Exception as exc:  # noqa: BLE001 - diagnostic script should print parse failure clearly
        print(f"parse_ok: false")
        print(f"parse_error_type: {type(exc).__name__}")
        print(f"parse_error: {exc}")
        return 1

    print("parse_ok: true")
    print(f"model_schema: {model.schema}")
    print(f"total_entities: {len(list(model))}")

    log_section("IMPORTANT COUNTS")
    for entity_name in IMPORTANT_TYPES:
        count = safe_len(model, entity_name)
        if count >= 0:
            print(f"{entity_name}: {count}")

    log_section("TOP ENTITY TYPES")
    counter = Counter(entity.is_a() for entity in model)
    for entity_name, count in counter.most_common(40):
        print(f"{entity_name}: {count}")

    log_section("GEOMETRY")
    inspect_geometry(model)

    log_section("DIAGNOSIS HINTS")
    print("- If parse_ok is false, schema/entity syntax is the first issue.")
    print("- If geometry_failed is high, the IFC parses but cannot produce renderable mesh.")
    print("- If bbox extent is extremely large or non-finite, placement/unit conversion is suspicious.")
    print("- If total_triangles is huge, Open3D/GLEW may fail on local headless rendering.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
