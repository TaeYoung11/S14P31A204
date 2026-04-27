"""
fake_executor.py — BE의 IFC Edit Engine Worker를 AI 서버 측에서 시뮬레이션하는 독립 스크립트.

실제 ifcopenshell을 사용해 CommandBatch를 .ifc 파일에 적용한다.
BE 환경(RabbitMQ, Java 등)을 거치지 않고 단독 실행 가능.

사용법:
    python fake_executor.py <input.ifc> <output.ifc> '<CommandBatch JSON>'

결과:
    stdout에 ExecutionResult JSON을 출력한다.
"""

import json
import sys
import traceback
from dataclasses import dataclass, field
from typing import Optional

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.util.element

# CommandBatch에서 사용하는 ActionType 값 (models.py 참고)
_CREATE_SPACE = "create_space"
_UPDATE_SPACE = "update_space"
_DELETE_SPACE = "delete_space"
_CREATE_WALL = "create_wall"
_UPDATE_WALL = "update_wall"
_DELETE_WALL = "delete_wall"


@dataclass
class ExecutionResult:
    success: bool
    failed_command_indices: list[int] = field(default_factory=list)
    output_ifc_path: Optional[str] = None
    errors: dict[int, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "failed_command_indices": self.failed_command_indices,
            "output_ifc_path": self.output_ifc_path,
            "errors": {str(k): v for k, v in self.errors.items()},
        }


def _get_storey(ifc: ifcopenshell.file, storey_id: Optional[str]) -> Optional[ifcopenshell.entity_instance]:
    """storey_id(GlobalId)로 IfcBuildingStorey를 조회한다. None이면 첫 번째 층 반환."""
    if storey_id:
        try:
            return ifc.by_guid(storey_id)
        except Exception:
            pass
    storeys = ifc.by_type("IfcBuildingStorey")
    return storeys[0] if storeys else None


def _apply_create_space(ifc: ifcopenshell.file, params: dict) -> ifcopenshell.entity_instance:
    """CREATE_SPACE: 새 IfcSpace를 생성하고 storey에 집어 넣는다."""
    metadata = params.get("metadata", {})
    geometry = params.get("geometry", {})
    properties = params.get("properties", {})
    dimensions = geometry.get("dimensions", {})

    storey = _get_storey(ifc, metadata.get("storey_id"))
    if storey is None:
        raise RuntimeError("IFC 파일에 IfcBuildingStorey가 없습니다.")

    space = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcSpace")
    name = properties.get("name", "UnnamedSpace")
    space.Name = name
    space.LongName = name

    # 공간을 층에 집계(aggregate)
    ifcopenshell.api.aggregate.assign_object(ifc, products=[space], relating_object=storey)

    # Batang 전용 Pset에 치수와 메타데이터 저장
    pset = ifcopenshell.api.pset.add_pset(ifc, product=space, name="Batang_SpaceDimensions")
    props: dict = {}
    if "width" in dimensions:
        props["Width"] = int(dimensions["width"])
    if "height" in dimensions:
        props["Height"] = int(dimensions["height"])
    if "type" in properties:
        props["SpaceType"] = properties["type"]
    if "shape" in properties:
        props["Shape"] = properties["shape"]
    if "rects" in properties and properties["rects"] is not None:
        props["Rects"] = json.dumps(properties["rects"], ensure_ascii=False)
    if props:
        ifcopenshell.api.pset.edit_pset(ifc, pset=pset, properties=props)

    return space


def _apply_update_space(ifc: ifcopenshell.file, target_id: str, params: dict) -> ifcopenshell.entity_instance:
    """UPDATE_SPACE: 기존 IfcSpace의 치수와 속성을 갱신한다."""
    try:
        space = ifc.by_guid(target_id)
    except Exception:
        raise RuntimeError(f"target_id '{target_id}'에 해당하는 Space를 찾을 수 없습니다.")

    geometry = params.get("geometry", {})
    properties = params.get("properties", {})
    dimensions = geometry.get("dimensions", {})

    # 기존 Pset 가져오거나 새로 생성
    existing_psets = ifcopenshell.util.element.get_psets(space)
    if "Batang_SpaceDimensions" in existing_psets:
        pset_id = existing_psets["Batang_SpaceDimensions"]["id"]
        pset = ifc.by_id(pset_id)
    else:
        pset = ifcopenshell.api.pset.add_pset(ifc, product=space, name="Batang_SpaceDimensions")

    props: dict = {}
    if "width" in dimensions:
        props["Width"] = int(dimensions["width"])
    if "height" in dimensions:
        props["Height"] = int(dimensions["height"])
    if "shape" in properties:
        props["Shape"] = properties["shape"]
    if "rects" in properties and properties["rects"] is not None:
        props["Rects"] = json.dumps(properties["rects"], ensure_ascii=False)
    if props:
        ifcopenshell.api.pset.edit_pset(ifc, pset=pset, properties=props)

    return space


def _apply_delete_space(ifc: ifcopenshell.file, target_id: str) -> None:
    """DELETE_SPACE: IfcSpace를 IFC 파일에서 제거한다."""
    try:
        space = ifc.by_guid(target_id)
    except Exception:
        raise RuntimeError(f"target_id '{target_id}'에 해당하는 Space를 찾을 수 없습니다.")
    ifcopenshell.api.root.remove_product(ifc, product=space)


def _apply_create_wall(ifc: ifcopenshell.file, params: dict) -> ifcopenshell.entity_instance:
    """CREATE_WALL: 새 IfcWall을 생성한다. (기본 구현 — 형상 없이 메타데이터만 저장)"""
    metadata = params.get("metadata", {})
    geometry = params.get("geometry", {})
    dimensions = geometry.get("dimensions", {})
    properties = params.get("properties", {})

    storey = _get_storey(ifc, metadata.get("storey_id"))
    if storey is None:
        raise RuntimeError("IFC 파일에 IfcBuildingStorey가 없습니다.")

    wall = ifcopenshell.api.root.create_entity(ifc, ifc_class="IfcWall")
    wall.Name = properties.get("name", "Wall")

    ifcopenshell.api.aggregate.assign_object(ifc, products=[wall], relating_object=storey)

    pset = ifcopenshell.api.pset.add_pset(ifc, product=wall, name="Batang_WallDimensions")
    props: dict = {}
    if "length" in dimensions:
        props["Length"] = int(dimensions["length"])
    if "height" in dimensions:
        props["Height"] = int(dimensions["height"])
    if "thickness" in dimensions:
        props["Thickness"] = int(dimensions["thickness"])
    if props:
        ifcopenshell.api.pset.edit_pset(ifc, pset=pset, properties=props)

    return wall


def _apply_command(ifc: ifcopenshell.file, command: dict) -> None:
    """IFCCommand 하나를 처리한다."""
    action = command.get("action", "")
    target_id: Optional[str] = command.get("target_id")
    params: dict = command.get("params", {})

    if action == _CREATE_SPACE:
        _apply_create_space(ifc, params)
    elif action == _UPDATE_SPACE:
        if not target_id:
            raise RuntimeError("UPDATE_SPACE requires target_id.")
        _apply_update_space(ifc, target_id, params)
    elif action == _DELETE_SPACE:
        if not target_id:
            raise RuntimeError("DELETE_SPACE requires target_id.")
        _apply_delete_space(ifc, target_id)
    elif action == _CREATE_WALL:
        _apply_create_wall(ifc, params)
    elif action in (_UPDATE_WALL, _DELETE_WALL):
        # Wall 수정/삭제는 Space와 동일한 패턴 — 기본 구현
        if not target_id:
            raise RuntimeError(f"{action} requires target_id.")
        try:
            element = ifc.by_guid(target_id)
        except Exception:
            raise RuntimeError(f"target_id '{target_id}'를 찾을 수 없습니다.")
        if action == _DELETE_WALL:
            ifcopenshell.api.root.remove_product(ifc, product=element)
    else:
        raise RuntimeError(f"지원하지 않는 action: '{action}'")


def execute_batch(
    input_ifc_path: str,
    output_ifc_path: str,
    command_batch: dict,
) -> ExecutionResult:
    """
    CommandBatch를 실제 IFC 파일에 적용한다.

    Args:
        input_ifc_path: 원본 IFC 파일 경로
        output_ifc_path: 결과를 저장할 IFC 파일 경로
        command_batch: CommandBatch dict (models.CommandBatch.model_dump() 결과)

    Returns:
        ExecutionResult
    """
    # clarification 필요하면 즉시 반환
    if command_batch.get("requires_clarification"):
        return ExecutionResult(
            success=False,
            errors={-1: command_batch.get("clarification_question", "명령 해석 실패")},
        )

    try:
        ifc = ifcopenshell.open(input_ifc_path)
    except Exception as e:
        return ExecutionResult(success=False, errors={-1: f"IFC 파일 로드 실패: {e}"})

    commands: list[dict] = command_batch.get("commands", [])
    failed_indices: list[int] = []
    errors: dict[int, str] = {}

    for idx, command in enumerate(commands):
        try:
            _apply_command(ifc, command)
        except Exception as e:
            failed_indices.append(idx)
            errors[idx] = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"

    # 하나라도 성공한 command가 있으면 저장
    if len(failed_indices) < len(commands):
        try:
            ifc.write(output_ifc_path)
        except Exception as e:
            return ExecutionResult(
                success=False,
                failed_command_indices=failed_indices,
                errors={**errors, -1: f"IFC 저장 실패: {e}"},
            )

    success = len(failed_indices) == 0
    return ExecutionResult(
        success=success,
        failed_command_indices=failed_indices,
        output_ifc_path=output_ifc_path if success or failed_indices else None,
        errors=errors,
    )


def main() -> None:
    if len(sys.argv) < 4:
        print(
            "사용법: python fake_executor.py <input.ifc> <output.ifc> '<CommandBatch JSON>'",
            file=sys.stderr,
        )
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    try:
        batch_json = json.loads(sys.argv[3])
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "errors": {"-1": f"JSON 파싱 실패: {e}"}}))
        sys.exit(1)

    result = execute_batch(input_path, output_path, batch_json)
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))

    if not result.success:
        sys.exit(1)


if __name__ == "__main__":
    main()
