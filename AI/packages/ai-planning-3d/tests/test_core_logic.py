import asyncio
import os
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.guid
from ai_planning_3d.pipeline import LLM3DPipeline
from ai_planning_3d.command import LLM3DCommand, LLM3DCommandType, LLM3DElementType, LLM3DCreateInfo

# 로그 설정 (Downloads/batang_history 저장)
from datetime import datetime
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M")
LOG_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "batang_history")
os.makedirs(LOG_DIR, exist_ok=True)
log_path = os.path.join(LOG_DIR, f"로직점검_{TIMESTAMP}.log")

def log_result(msg: str):
    print(msg)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(msg + "\n")

async def run_test():
    log_result(f"\n{'='*50}")
    log_result(f"🚀 테스트 일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log_result("📂 대상: 가상 데이터 기반 신규 기능(Validators) 통합 테스트")
    
    # 1. 테스트용 임시 IFC 파일 생성 (누락된 코드 복구)
    model = ifcopenshell.file(schema="IFC4")
    
    project = ifcopenshell.api.run(
        "root.create_entity", model, ifc_class="IfcProject", name="Test Project"
    )
    ifcopenshell.api.run("unit.assign_unit", model)
    model_context = ifcopenshell.api.run("context.add_context", model, context_type="Model")
    body_context = ifcopenshell.api.run(
        "context.add_context",
        model,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=model_context,
    )
    site = ifcopenshell.api.run(
        "root.create_entity", model, ifc_class="IfcSite", name="Test Site"
    )
    building = ifcopenshell.api.run(
        "root.create_entity", model, ifc_class="IfcBuilding", name="Test Building"
    )
    storey = ifcopenshell.api.run(
        "root.create_entity", model, ifc_class="IfcBuildingStorey", name="1F"
    )
    
    model.create_entity(
        "IfcRelAggregates", GlobalId=ifcopenshell.guid.new(),
        RelatingObject=project, RelatedObjects=[site]
    )
    model.create_entity(
        "IfcRelAggregates", GlobalId=ifcopenshell.guid.new(),
        RelatingObject=site, RelatedObjects=[building]
    )
    model.create_entity(
        "IfcRelAggregates", GlobalId=ifcopenshell.guid.new(),
        RelatingObject=building, RelatedObjects=[storey]
    )

    # 기존 벽 생성 (내력벽으로 설정)
    wall1 = ifcopenshell.api.run(
        "root.create_entity", model, ifc_class="IfcWall",
        name="Existing Wall (Load-Bearing)"
    )
    ifcopenshell.api.run(
        "spatial.assign_container", model, products=[wall1], relating_structure=storey
    )
    
    # 3D 형상 및 위치 부여 (충돌/인접 테스트용)
    # 위치: (0, 0, 0), 크기: 3000x200x2400
    ifcopenshell.api.run("geometry.edit_object_placement", model, product=wall1)
    wall1_rep = ifcopenshell.api.run(
        "geometry.add_wall_representation", model,
        context=body_context, length=3.0, thickness=0.2, height=2.4
    )
    ifcopenshell.api.run(
        "geometry.assign_representation", model,
        product=wall1, representation=wall1_rep
    )
    
    # 내력벽 속성 추가 (#209 테스트용)
    pset = ifcopenshell.api.run("pset.add_pset", model, product=wall1, name="Pset_WallCommon")
    ifcopenshell.api.run("pset.edit_pset", model, pset=pset, properties={"LoadBearing": True})

    # 인접성 테스트를 위한 두 번째 벽 (wall1의 동쪽)
    wall2 = ifcopenshell.api.run(
        "root.create_entity", model, ifc_class="IfcWall", name="Adjacent Wall (East)"
    )
    ifcopenshell.api.run(
        "spatial.assign_container", model, products=[wall2], relating_structure=storey
    )
    # 위치: X=4000 (wall1에서 1000mm 정도 떨어짐)
    # 단위행렬 + X 방향 이동 (numpy 의존성 제거)
    wall2_matrix = [
        [1.0, 0.0, 0.0, 4.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
    ifcopenshell.api.run(
        "geometry.edit_object_placement", model,
        product=wall2, matrix=wall2_matrix
    )
    wall2_rep = ifcopenshell.api.run(
        "geometry.add_wall_representation", model,
        context=body_context, length=3.0, thickness=0.2, height=2.4
    )
    ifcopenshell.api.run(
        "geometry.assign_representation", model,
        product=wall2, representation=wall2_rep
    )

    test_ifc = "test_features.ifc"
    model.write(test_ifc)
    log_result(f"✅ 테스트용 IFC 파일 생성 완료: {test_ifc}\n")

    # 2. 파이프라인 로드
    pipeline = LLM3DPipeline(ifc_path=test_ifc)

    log_result("\n--- [테스트 1: 내력벽 삭제 차단] ---")
    # AI 해석 없이 삭제 명령 객체 직접 생성 (wall1의 ID 지정)
    cmd_del = LLM3DCommand(
        command_type=LLM3DCommandType.DELETE,
        targets=[{"global_id": wall1.GlobalId, "name": wall1.Name}]
    )
    res_del = await pipeline._execute_delete_preview(cmd_del)
    log_result(f"명령 결과: {res_del.get('status')}")
    if res_del.get("structural_warnings"):
        log_result("✅ 차단 성공: 내력벽 삭제 시도를 감지하고 차단했습니다.")
        for warn in res_del["structural_warnings"]:
            log_result(f"  - 경고: {warn}")

    log_result("\n--- [테스트 2: 신규 부재 간섭 감지] ---")
    # 기존 벽과 같은 위치에 벽 생성 명령 시뮬레이션
    # (실제 LLM 없이 내부 create_preview 로직 직접 호출)
    
    cmd_create = LLM3DCommand(
        command_type=LLM3DCommandType.CREATE,
        create_info=LLM3DCreateInfo(
            element_type=LLM3DElementType.WALL,
            storey="1F",
            start_point={"x": 0.0, "y": 0.0, "z": 0.0}, # 기존 벽과 겹치는 위치
            length_mm=3000, width_mm=200, height_mm=2400
        )
    )
    # AI 해석 단계를 건너뛰고 생성 로직만 직접 테스트
    res_create = await pipeline._execute_create_preview(cmd_create)
    log_result(f"명령 결과: {res_create.get('status')}")
    if res_create.get("collision_warnings"):
        log_result("✅ 감지 성공: 기존 벽과의 물리적 충돌을 찾아냈습니다.")
        for warn in res_create["collision_warnings"]:
            log_result(f"  - 경고: {warn}")

    log_result("\n--- [테스트 3: 인접 부재 탐색] ---")
    # 기준 정보 설정
    ref_info = {"global_id": wall1.GlobalId, "name": wall1.Name}
    adj_res = pipeline.find_adjacent_elements(ref_info, direction="east", threshold_mm=5000)
    log_result(f"결과: {adj_res.message}")
    if adj_res.elements:
        log_result("✅ 탐색 성공: 인접한 부재를 리스트업했습니다.")

    # 파일 정리
    if os.path.exists(test_ifc):
        os.remove(test_ifc)

if __name__ == "__main__":
    asyncio.run(run_test())