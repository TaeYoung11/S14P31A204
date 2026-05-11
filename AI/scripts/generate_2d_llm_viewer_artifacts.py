from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from ai_planning_2d.command import FloorNLPCommand
from ai_planning_2d.ifc_extractor import extract_ifc_context
from ai_planning_2d.session_pipeline import LLM2DPipeline


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = ROOT / "artifacts" / "2d-llm-viewer"
HOUSE_KR = ROOT / "scripts" / "House_KR.ifc"
HOUSE_KR_NO_BATHROOM = ROOT / "scripts" / "House_KR_nobathroom.ifc"


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


async def _generate_insert_toilet_house_kr(out_dir: Path) -> dict[str, str]:
    scenario_dir = out_dir / "insert_toilet_house_kr"
    source_path = str(HOUSE_KR)
    preview_json = scenario_dir / "preview.json"

    pipeline = LLM2DPipeline(
        ifc_path=source_path,
        ifc_context=extract_ifc_context(source_path),
    )
    command = FloorNLPCommand(
        action="insert_toilet",
        target_room_name="욕실",
        target_floor=1,
        confidence=0.95,
    )
    preview = await pipeline.execute_command_preview(command)

    _write_json(preview_json, preview)
    return {
        "scenario": "insert_toilet_house_kr",
        "preview_json": str(preview_json),
    }


async def _generate_create_door_house_kr(out_dir: Path) -> dict[str, str]:
    scenario_dir = out_dir / "create_door_house_kr"
    source_path = str(HOUSE_KR)
    preview_json = scenario_dir / "preview.json"

    ctx = extract_ifc_context(source_path)
    wall = next(wall for wall in ctx["walls"] if wall.get("floor") == 1)
    pipeline = LLM2DPipeline(
        ifc_path=source_path,
        ifc_context=ctx,
    )
    command = FloorNLPCommand(
        action="create_door",
        target_wall_id=wall["id"],
        target_floor=wall["floor"],
        element_width_mm=900,
        element_height_mm=2100,
        confidence=0.95,
    )
    preview = await pipeline.execute_command_preview(command)

    _write_json(preview_json, preview)
    return {
        "scenario": "create_door_house_kr",
        "target_wall_id": wall["id"],
        "preview_json": str(preview_json),
        "preview_status": str(preview.get("status")),
    }


async def _generate_create_wall_house_kr(out_dir: Path) -> dict[str, str]:
    scenario_dir = out_dir / "create_wall_house_kr"
    source_path = str(HOUSE_KR)
    preview_json = scenario_dir / "preview.json"

    ifc_context = extract_ifc_context(source_path)
    pipeline = LLM2DPipeline(
        ifc_path=source_path,
        ifc_context=ifc_context,
    )
    living_room_name = next(
        space["name"]
        for space in ifc_context["spaces"]
        if space["id"] == "0Lt8gR_E9ESeGH5uY_g9e9"
    )
    command = FloorNLPCommand(
        action="create_wall",
        target_room_name=living_room_name,
        target_floor=1,
        confidence=0.95,
    )
    preview = await pipeline.execute_command_preview(command)

    _write_json(preview_json, preview)
    return {
        "scenario": "create_wall_house_kr",
        "target_room_name": living_room_name,
        "preview_json": str(preview_json),
        "preview_status": str(preview.get("status")),
    }


async def _generate_insert_toilet_house_kr_nobathroom_big_room(out_dir: Path) -> dict[str, str]:
    scenario_dir = out_dir / "insert_toilet_house_kr_nobathroom_big_room"
    source_path = str(HOUSE_KR_NO_BATHROOM)
    preview_json = scenario_dir / "preview.json"

    pipeline = LLM2DPipeline(
        ifc_path=source_path,
        ifc_context=extract_ifc_context(source_path),
    )
    command = FloorNLPCommand(
        action="insert_toilet",
        target_floor=1,
        user_intent="shared_toilet_split_big_room",
        confidence=0.95,
    )
    preview = await pipeline.execute_command_preview(command)

    _write_json(preview_json, preview)
    return {
        "scenario": "insert_toilet_house_kr_nobathroom_big_room",
        "preview_json": str(preview_json),
    }


async def _generate_room_remove_preview(out_dir: Path) -> dict[str, str]:
    scenario_dir = out_dir / "room_remove_preview"
    preview_json = scenario_dir / "preview.json"
    source_path = str(HOUSE_KR)
    pipeline = LLM2DPipeline(
        ifc_path=source_path,
        ifc_context=extract_ifc_context(source_path),
    )
    preview = await pipeline.execute_preview("침실을 없애고 거실과 합쳐줘")
    _write_json(preview_json, preview)
    return {
        "scenario": "room_remove_preview",
        "preview_json": str(preview_json),
    }


async def _generate_room_resize_preview(out_dir: Path) -> dict[str, str]:
    scenario_dir = out_dir / "room_resize_preview"
    preview_json = scenario_dir / "preview.json"
    source_path = str(HOUSE_KR)
    pipeline = LLM2DPipeline(
        ifc_path=source_path,
        ifc_context=extract_ifc_context(source_path),
    )
    preview = await pipeline.execute_preview("침실을 서쪽으로 넓혀줘")
    _write_json(preview_json, preview)
    return {
        "scenario": "room_resize_preview",
        "preview_json": str(preview_json),
    }


async def _generate_room_add_preview(out_dir: Path) -> dict[str, str]:
    scenario_dir = out_dir / "room_add_preview"
    preview_json = scenario_dir / "preview.json"
    source_path = str(HOUSE_KR)
    pipeline = LLM2DPipeline(
        ifc_path=source_path,
        ifc_context=extract_ifc_context(source_path),
    )
    preview = await pipeline.execute_preview("2층에 방 하나 더 추가해줘")
    _write_json(preview_json, preview)
    return {
        "scenario": "room_add_preview",
        "preview_json": str(preview_json),
    }


SCENARIOS = {
    "create_door_house_kr": _generate_create_door_house_kr,
    "create_wall_house_kr": _generate_create_wall_house_kr,
    "insert_toilet_house_kr": _generate_insert_toilet_house_kr,
    "insert_toilet_house_kr_nobathroom_big_room":
        _generate_insert_toilet_house_kr_nobathroom_big_room,
    "room_remove_preview": _generate_room_remove_preview,
    "room_resize_preview": _generate_room_resize_preview,
    "room_add_preview": _generate_room_add_preview,
}


async def _main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate IFC/preview artifacts for current 2D LLM branch scenarios."
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help="Directory where artifacts will be written.",
    )
    parser.add_argument(
        "--scenario",
        choices=[*SCENARIOS.keys(), "all"],
        default="all",
        help="Single scenario or all scenarios.",
    )
    args = parser.parse_args()

    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    names = list(SCENARIOS.keys()) if args.scenario == "all" else [args.scenario]
    results = []
    for name in names:
        results.append(await SCENARIOS[name](out_dir))

    manifest = out_dir / "manifest.json"
    _write_json(manifest, {"artifacts": results})
    print(manifest)


if __name__ == "__main__":
    asyncio.run(_main())
