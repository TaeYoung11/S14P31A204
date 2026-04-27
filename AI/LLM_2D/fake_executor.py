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

try:
    from .models import ActionType
except ImportError:
    from models import ActionType  # type: ignore[no-redef]

_CREATE_SPACE = ActionType.CREATE_SPACE.value
_UPDATE_SPACE = ActionType.UPDATE_SPACE.value
_DELETE_SPACE = ActionType.DELETE_SPACE.value
_CREATE_WALL = ActionType.CREATE_WALL.value
_UPDATE_WALL = ActionType.UPDATE_WALL.value
_DELETE_WALL = ActionType.DELETE_WALL.value


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


def _get_storey(ifc: ifcopenshell.file, storey_id: Optional[str]) -> ifcopenshell.entity_instance:
    """storey_id(GlobalId)로 IfcBuildingStorey를 조회한다. 실패하면 RuntimeError를 발생시킨다."""
    if not storey_id:
        raise RuntimeError("metadata.storey_id가 누락되었습니다. 모든 IFCCommand에 storey_id가 필요합니다.")
    try:
        storey = ifc.by_guid(storey_id)
    except Exception:
        raise RuntimeError(f"storey_id '{storey_id}'를 IFC 파일에서 찾을 수 없습니다.")
    if not storey.is_a("IfcBuildingStorey"):
        raise RuntimeError(f"storey_id '{storey_id}'는 IfcBuildingStorey가 아닙니다: {storey.is_a()}")
    return storey


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

    if ifc.schema != "IFC4":
        return ExecutionResult(
            success=False,
            errors={-1: f"지원하지 않는 IFC 스키마: '{ifc.schema}'. IFC4만 지원합니다."},
        )

    commands: list[dict] = command_batch.get("commands", [])
    failed_indices: list[int] = []
    errors: dict[int, str] = {}

    for idx, command in enumerate(commands):
        try:
            _apply_command(ifc, command)
        except Exception as e:
            failed_indices.append(idx)
            errors[idx] = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"

    # all-or-nothing: 하나라도 실패하면 IFC 저장 안 함
    if failed_indices:
        return ExecutionResult(
            success=False,
            failed_command_indices=failed_indices,
            output_ifc_path=None,
            errors=errors,
        )

    try:
        ifc.write(output_ifc_path)
    except Exception as e:
        return ExecutionResult(
            success=False,
            errors={-1: f"IFC 저장 실패: {e}"},
        )

    return ExecutionResult(
        success=True,
        output_ifc_path=output_ifc_path,
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
