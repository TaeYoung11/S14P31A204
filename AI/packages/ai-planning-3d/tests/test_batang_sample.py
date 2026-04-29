import asyncio
import os
from datetime import datetime

import ifcopenshell.api

from ai_planning_3d.command import (
    LLM3DCommand,
    LLM3DCommandType,
    LLM3DCreateInfo,
    LLM3DElementType,
)
from ai_planning_3d.pipeline import LLM3DPipeline


TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M")
LOG_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "batang_history")
os.makedirs(LOG_DIR, exist_ok=True)

UP = os.environ["USERPROFILE"]
ifc_path = os.path.normpath(os.path.join(UP, "Downloads", "batang_sample.ifc"))
log_path = os.path.join(LOG_DIR, f"batang_sample_test_{TIMESTAMP}.log")


def log_result(msg: str) -> None:
    print(msg)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


async def run_sample_test() -> None:
    if not os.path.exists(ifc_path):
        log_result(f"Sample IFC file not found: {ifc_path}")
        log_result("Run AI/scratch_3d_sample.py first to generate batang_sample.ifc.")
        return

    log_result(f"\n{'=' * 50}")
    log_result(f"Test time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log_result(f"Loaded file: {ifc_path}")

    pipeline = LLM3DPipeline(ifc_path=ifc_path)
    model = pipeline.query_engine.get_model()
    if not model:
        log_result("IFC model could not be loaded.")
        return

    log_result("\n--- [Scenario 1: adjacency search] ---")
    target_wall_name = "2F_Bathroom_East_Wall"
    matched_walls = [
        wall for wall in model.by_type("IfcWall") if target_wall_name in (wall.Name or "")
    ]

    if matched_walls:
        ref_wall = matched_walls[0]
        ref_info = {"global_id": ref_wall.GlobalId, "name": ref_wall.Name}
        adj_res = pipeline.find_adjacent_elements(
            ref_info,
            direction="east",
            threshold_mm=1000,
        )
        log_result(f"Reference: {target_wall_name}")
        log_result(f"Result: {adj_res.message}")
        for item in adj_res.elements:
            log_result(f"  - Found: {item.get('name')} (ID: {item.get('global_id')})")
    else:
        log_result(f"Target wall not found: {target_wall_name}")

    log_result("\n--- [Scenario 2: physical collision detection] ---")
    cmd_create = LLM3DCommand(
        command_type=LLM3DCommandType.CREATE,
        create_info=LLM3DCreateInfo(
            element_type=LLM3DElementType.WALL,
            storey="1F",
            start_point={"x": 1500.0, "y": 100.0, "z": 0.0},
            length_mm=3000,
            width_mm=200,
            height_mm=3000,
        ),
    )
    res_create = await pipeline._execute_create_preview(cmd_create)
    if res_create.get("collision_warnings"):
        log_result("Detected: collision with an existing 1F wall.")
        for warn in res_create["collision_warnings"]:
            log_result(f"  - Warning: {warn}")
    else:
        log_result("Not detected: expected collision was not reported.")

    log_result("\n--- [Scenario 3: structural safety check] ---")
    target_delete_name = "1F_LivingRoom_South_Wall"
    load_bearing_walls = [
        wall
        for wall in model.by_type("IfcWall")
        if target_delete_name in (wall.Name or "")
    ]
    if not load_bearing_walls:
        log_result(f"Target wall not found: {target_delete_name}")
        return

    target_wall = load_bearing_walls[0]
    pset = ifcopenshell.api.run(
        "pset.add_pset",
        model,
        product=target_wall,
        name="Pset_WallCommon",
    )
    ifcopenshell.api.run(
        "pset.edit_pset",
        model,
        pset=pset,
        properties={"LoadBearing": True},
    )

    cmd_del = LLM3DCommand(
        command_type=LLM3DCommandType.DELETE,
        targets=[{"global_id": target_wall.GlobalId, "name": target_wall.Name}],
    )
    res_del = await pipeline._execute_delete_preview(cmd_del)
    log_result(f"Result: {res_del.get('status')}")
    if res_del.get("structural_warnings"):
        log_result("Detected: load-bearing wall deletion was blocked.")
        for warn in res_del["structural_warnings"]:
            log_result(f"  - Warning: {warn}")
    else:
        log_result("Not detected: expected structural warning was not reported.")


if __name__ == "__main__":
    asyncio.run(run_sample_test())
