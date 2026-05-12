from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

import ifcopenshell

from ai_planning_3d.command import LLM3DElementType, LLM3DSizeMode
from ai_planning_3d.engine import LLM3DEngine
from ai_planning_3d.pipeline import LLM3DPipeline

_AI_ROOT = Path(__file__).resolve().parents[3]
_SAMPLE_IFC = _AI_ROOT / "tests" / "sample_batang.ifc"
# 직접 실행할 때 채팅 문장은 여기만 수정하면 됩니다.
_CHAT_COMMAND = "지붕 길이를 2배로 늘려주고, 오른쪽으로 120도 회전해줘."
_OUT_DIR = Path.home() / "Downloads" / "batang_history"


def _chat_commands() -> list[str]:
    return LLM3DPipeline.split_chat_commands(_CHAT_COMMAND)


def _number_before_unit(text: str, unit: str) -> float:
    import re

    match = re.search(rf"(\d+(?:\.\d+)?)\s*{re.escape(unit)}", text)
    if not match:
        raise AssertionError(f"{unit} value not found in chat command: {text}")
    return float(match.group(1))


def _use_heuristic_chat_parser(pipeline: LLM3DPipeline) -> None:
    async def parse(user_text: str, ifc_context: str | None = None):  # noqa: ARG001
        return pipeline.engine.parse_command_heuristic(user_text)

    pipeline.engine.parse_command = parse  # type: ignore[method-assign]


def _first_body_solid(element):
    representation = getattr(element, "Representation", None)
    for rep in getattr(representation, "Representations", []) or []:
        if getattr(rep, "RepresentationIdentifier", None) != "Body":
            continue
        for item in getattr(rep, "Items", []) or []:
            if item.is_a("IfcExtrudedAreaSolid"):
                return item
    return None


def _first_body_brep(element):
    representation = getattr(element, "Representation", None)
    for rep in getattr(representation, "Representations", []) or []:
        if getattr(rep, "RepresentationIdentifier", None) != "Body":
            continue
        for item in getattr(rep, "Items", []) or []:
            if item.is_a("IfcFacetedBrep"):
                return item
    return None


def _brep_points(brep):
    points = []
    seen = set()
    outer = getattr(brep, "Outer", None)
    for face in getattr(outer, "CfsFaces", []) or []:
        for bound in getattr(face, "Bounds", []) or []:
            loop = getattr(bound, "Bound", None)
            if not loop or not loop.is_a("IfcPolyLoop"):
                continue
            for point in getattr(loop, "Polygon", []) or []:
                key = point.id() if point.id() else id(point)
                if key in seen:
                    continue
                seen.add(key)
                points.append(point)
    return points


def _placement_rotation_z_deg(element) -> float:
    placement = getattr(element, "ObjectPlacement", None)
    relative = getattr(placement, "RelativePlacement", None)
    ref_direction = getattr(relative, "RefDirection", None)
    ratios = getattr(ref_direction, "DirectionRatios", None) or (1.0, 0.0, 0.0)
    import math

    return round(math.degrees(math.atan2(float(ratios[1]), float(ratios[0]))), 3)


def _direction_rotation_z_deg(direction) -> float | None:
    if not direction:
        return None
    ratios = getattr(direction, "DirectionRatios", None) or ()
    if len(ratios) < 2:
        return None
    import math

    return round(math.degrees(math.atan2(float(ratios[1]), float(ratios[0]))), 3)


def _target_snapshots(ifc_path: Path, matched_elements: list[dict[str, object]]):
    if not ifc_path.exists():
        return []
    model = ifcopenshell.open(str(ifc_path))
    snapshots: list[dict[str, object]] = []
    for matched in matched_elements:
        global_id = matched.get("global_id")
        if not global_id:
            continue
        try:
            element = model.by_guid(str(global_id))
        except RuntimeError:
            continue
        snapshot: dict[str, object] = {
            "global_id": element.GlobalId,
            "type": element.is_a(),
            "name": getattr(element, "Name", None),
            "rotation_z_deg": _placement_rotation_z_deg(element),
        }
        solid = _first_body_solid(element)
        brep = _first_body_brep(element)
        profile = getattr(solid, "SweptArea", None)
        if solid and profile and profile.is_a("IfcRectangleProfileDef"):
            snapshot["body_rotation_z_deg"] = _direction_rotation_z_deg(
                getattr(getattr(solid, "Position", None), "RefDirection", None)
            )
            snapshot["body_dimensions_native"] = {
                "x_length": float(profile.XDim),
                "y_width": float(profile.YDim),
                "z_depth": float(solid.Depth),
            }
        elif solid and profile and profile.is_a("IfcArbitraryClosedProfileDef"):
            points = getattr(getattr(profile, "OuterCurve", None), "Points", []) or []
            coords = [point.Coordinates for point in points if len(point.Coordinates) >= 2]
            if coords:
                xs = [float(coord[0]) for coord in coords]
                ys = [float(coord[1]) for coord in coords]
                snapshot["body_profile_bounds_native"] = {
                    "min_x": min(xs),
                    "max_x": max(xs),
                    "min_y": min(ys),
                    "max_y": max(ys),
                    "z_depth": float(solid.Depth),
                }
        elif brep:
            points = _brep_points(brep)
            coords = [point.Coordinates for point in points if len(point.Coordinates) >= 3]
            if coords:
                xs = [float(coord[0]) for coord in coords]
                ys = [float(coord[1]) for coord in coords]
                zs = [float(coord[2]) for coord in coords]
                snapshot["body_brep_bounds_native"] = {
                    "min_x": min(xs),
                    "max_x": max(xs),
                    "min_y": min(ys),
                    "max_y": max(ys),
                    "min_z": min(zs),
                    "max_z": max(zs),
                }
        snapshots.append(snapshot)
    return snapshots


async def run_transform_chat_commands(
    ifc_path: Path,
    commands: list[str],
    output_path: Path,
    log_path: Path | None = None,
) -> list[dict[str, object]]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []
    current_ifc = ifc_path
    temp_inputs: list[Path] = []

    try:
        for index, command in enumerate(commands, start=1):
            command_output_path = output_path
            input_for_command = current_ifc
            snapshot_input = current_ifc
            pipeline_input = current_ifc
            if current_ifc == output_path and output_path.exists():
                with tempfile.NamedTemporaryFile(delete=False, suffix=".ifc") as temp_file:
                    temp_input = Path(temp_file.name)
                shutil.copyfile(output_path, temp_input)
                temp_inputs.append(temp_input)
                snapshot_input = temp_input
                pipeline_input = temp_input

            pipeline = LLM3DPipeline(ifc_path=str(pipeline_input))
            _use_heuristic_chat_parser(pipeline)
            command_records = await pipeline.execute_chat_to_ifc(command, str(command_output_path))
            if not command_records:
                raise RuntimeError(f"chat command produced no records: {command}")
            if command_output_path.exists() and any(
                record.get("ifc_written") for record in command_records
            ):
                current_ifc = command_output_path
            for record in command_records:
                record["batch_index"] = index
                record["input_ifc"] = str(input_for_command)
                matched = record.get("matched_elements") or []
                if isinstance(matched, list):
                    record["before_targets"] = _target_snapshots(snapshot_input, matched)
                if record.get("ifc_written"):
                    record["final_output_ifc"] = str(command_output_path)
                    if isinstance(matched, list):
                        record["after_targets"] = _target_snapshots(command_output_path, matched)
                records.append(record)
    finally:
        for temp_input in temp_inputs:
            temp_input.unlink(missing_ok=True)

    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    return records


def test_heuristic_parser_maps_multiplier_to_length_scale():
    parsed = LLM3DEngine().parse_command_heuristic(_chat_commands()[0])

    assert parsed.target.element_type == LLM3DElementType.ROOF
    assert parsed.target.select_all is True
    assert parsed.changes is not None
    assert parsed.changes.length_mm is not None
    assert parsed.changes.length_mm.mode == LLM3DSizeMode.SCALE
    assert parsed.changes.length_mm.value == _number_before_unit(_chat_commands()[0], "배")


def test_heuristic_parser_maps_rotation_degrees():
    parsed = LLM3DEngine().parse_command_heuristic(_chat_commands()[1])

    assert parsed.target.element_type == LLM3DElementType.ROOF
    assert parsed.target.direction is None
    assert parsed.target.select_all is True
    assert parsed.changes is not None
    assert parsed.changes.rotation_deg == _number_before_unit(_chat_commands()[1], "도")


def test_heuristic_parser_selects_all_for_unqualified_element_type():
    parsed = LLM3DEngine().parse_command_heuristic("벽 높이를 2배로 늘려줘")

    assert parsed.target.element_type == LLM3DElementType.WALL
    assert parsed.target.storey is None
    assert parsed.target.space_name is None
    assert parsed.target.direction is None
    assert parsed.target.select_all is True


def test_heuristic_parser_keeps_directional_element_type_specific():
    parsed = LLM3DEngine().parse_command_heuristic("동쪽 벽 높이를 2배로 늘려줘")

    assert parsed.target.element_type == LLM3DElementType.WALL
    assert parsed.target.direction == "East"
    assert parsed.target.select_all is False


if __name__ == "__main__":
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=_SAMPLE_IFC)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--log", type=Path)
    parser.add_argument(
        "--command",
        action="append",
        dest="commands",
        help="Chat command to run. Can be passed more than once.",
    )
    args = parser.parse_args()

    output = args.output or _OUT_DIR / f"{args.input.stem}_transform_chat_{timestamp}.ifc"
    log = args.log or _OUT_DIR / f"{args.input.stem}_transform_chat_{timestamp}.json"
    raw_commands = args.commands or [_CHAT_COMMAND]
    commands = [
        split_command
        for raw_command in raw_commands
        for split_command in LLM3DPipeline.split_chat_commands(raw_command)
    ]
    result = asyncio.run(run_transform_chat_commands(args.input, commands, output, log))
    print(json.dumps(result, ensure_ascii=False, indent=2))
