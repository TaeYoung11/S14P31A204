from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import ifcopenshell


ROOT = Path(__file__).resolve().parents[1]
HOUSE_KR = ROOT / "scripts" / "House_KR.ifc"
OUTPUT = ROOT / "artifacts" / "delete-wall-void" / "house_kr_delete_wall_void_inspection.json"


def _body_item(product) -> Any | None:
    representation = getattr(product, "Representation", None)
    if not representation:
        return None
    for rep in getattr(representation, "Representations", []) or []:
        if getattr(rep, "RepresentationIdentifier", None) != "Body":
            continue
        items = list(getattr(rep, "Items", []) or [])
        if items:
            return items[0]
    return None


def _wall_body_class(wall) -> str:
    item = _body_item(wall)
    if item is None:
        return "missing"
    if item.is_a("IfcExtrudedAreaSolid"):
        return "parametric"
    if item.is_a("IfcBooleanClippingResult"):
        return "bcr"
    if item.is_a("IfcBooleanResult"):
        return "boolean_other"
    return item.is_a()


def _host_wall_from_filler(product) -> Any | None:
    for rel_fill in getattr(product, "FillsVoids", []) or []:
        opening = getattr(rel_fill, "RelatingOpeningElement", None)
        if opening is None:
            continue
        for rel_void in getattr(opening, "VoidsElements", []) or []:
            wall = getattr(rel_void, "RelatingBuildingElement", None)
            if wall is not None and wall.is_a("IfcWall"):
                return wall
    return None


def _host_wall_from_opening(opening) -> Any | None:
    for rel_void in getattr(opening, "VoidsElements", []) or []:
        wall = getattr(rel_void, "RelatingBuildingElement", None)
        if wall is not None and wall.is_a("IfcWall"):
            return wall
    return None


def _storey_name(product) -> str | None:
    for rel in getattr(product, "ContainedInStructure", []) or []:
        storey = getattr(rel, "RelatingStructure", None)
        if storey is not None and storey.is_a("IfcBuildingStorey"):
            return getattr(storey, "Name", None)
    return None


def _opening_from_filler(product) -> Any | None:
    fills = list(getattr(product, "FillsVoids", []) or [])
    if not fills:
        return None
    return getattr(fills[0], "RelatingOpeningElement", None)


def _candidate_entry(*, kind: str, product, wall, opening) -> dict[str, Any]:
    wall_body_class = _wall_body_class(wall) if wall is not None else "missing"
    return {
        "kind": kind,
        "global_id": product.GlobalId,
        "name": getattr(product, "Name", None),
        "storey": _storey_name(product),
        "host_wall_global_id": wall.GlobalId if wall is not None else None,
        "host_wall_name": getattr(wall, "Name", None) if wall is not None else None,
        "host_wall_body_class": wall_body_class,
        "opening_global_id": opening.GlobalId if opening is not None else None,
        "valid_for_this_branch": wall_body_class == "parametric",
    }


def main() -> None:
    model = ifcopenshell.open(str(HOUSE_KR))

    doors: list[dict[str, Any]] = []
    windows: list[dict[str, Any]] = []
    bare_openings: list[dict[str, Any]] = []

    for door in model.by_type("IfcDoor"):
        wall = _host_wall_from_filler(door)
        opening = _opening_from_filler(door)
        doors.append(_candidate_entry(kind="door", product=door, wall=wall, opening=opening))

    for window in model.by_type("IfcWindow"):
        wall = _host_wall_from_filler(window)
        opening = _opening_from_filler(window)
        windows.append(_candidate_entry(kind="window", product=window, wall=wall, opening=opening))

    for opening in model.by_type("IfcOpeningElement"):
        if list(getattr(opening, "HasFillings", []) or []):
            continue
        wall = _host_wall_from_opening(opening)
        bare_openings.append(
            _candidate_entry(kind="opening", product=opening, wall=wall, opening=opening)
        )

    summary = {
        "doors": {
            "total": len(doors),
            "parametric": sum(1 for item in doors if item["host_wall_body_class"] == "parametric"),
            "bcr": sum(1 for item in doors if item["host_wall_body_class"] == "bcr"),
        },
        "windows": {
            "total": len(windows),
            "parametric": sum(
                1 for item in windows if item["host_wall_body_class"] == "parametric"
            ),
            "bcr": sum(1 for item in windows if item["host_wall_body_class"] == "bcr"),
        },
        "openings": {
            "total": len(bare_openings),
            "parametric": sum(
                1 for item in bare_openings if item["host_wall_body_class"] == "parametric"
            ),
            "bcr": sum(1 for item in bare_openings if item["host_wall_body_class"] == "bcr"),
        },
    }

    preferred_candidates = {
        "door": next((item for item in doors if item["valid_for_this_branch"]), None),
        "window": next((item for item in windows if item["valid_for_this_branch"]), None),
        "opening": next((item for item in bare_openings if item["valid_for_this_branch"]), None),
    }

    result = {
        "fixture": str(HOUSE_KR),
        "summary": summary,
        "preferred_candidates": preferred_candidates,
        "doors": doors,
        "windows": windows,
        "bare_openings": bare_openings,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(str(OUTPUT))


if __name__ == "__main__":
    main()
