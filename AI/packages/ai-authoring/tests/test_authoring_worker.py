import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.root
import pytest

from ai_authoring.worker import AuthoringWorker
from ai_authoring.engine_3d import create_wall, create_window_with_opening
from ai_authoring.operations.registry import get as get_op_handler
from ai_common.errors import NonRetryableWorkerError
from ai_common.worker_sdk.event_factory import CompletedResult
from ai_domain.worker_messages.command import CommandMessage

# 테스트용 engine request — IfcWall 전체 삭제
_ENGINE_REQUEST = {
    "schema_version": "v1",
    "request_id": "req-test-001",
    "mode": "apply",
    "project_id": "project-layout-001",
    "base_revision_id": None,
    "operations": [
        {
            "id": "op-delete-walls",
            "type": "delete_elements",
            "selector": {"element_type": "IfcWall", "select_all": True},
            "parameters": {"reason": "test-delete"},
        }
    ],
}

# _run_operations 가 applied 를 반환할 때의 mock 결과
_APPLIED_OP_RESULTS = [
    {
        "operation_id": "op-delete-walls",
        "operation_type": "delete_elements",
        "status": "applied",
        "target_count": 1,
        "matched_elements": [
            {"global_id": "testGlobalId123456789012", "element_type": "IfcWall"}
        ],
        "issues": [],
    }
]


def _make_worker(ifc_bytes: bytes) -> tuple[AuthoringWorker, MagicMock]:
    """테스트용 워커와 mock S3 클라이언트를 생성한다."""
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = ifc_bytes
    mock_s3.read_text.return_value = json.dumps(_ENGINE_REQUEST)
    mock_s3.write_bytes.return_value = (
        "s3://batang-artifacts/projects/project-layout-001"
        "/revisions/rev-layout-edit-001/ifc/model.v1.ifc"
    )
    mock_s3.write_text.return_value = (
        "s3://batang-artifacts/projects/project-layout-001"
        "/revisions/rev-layout-edit-001/manifest.v1.json"
    )

    mock_publisher = MagicMock()
    worker = AuthoringWorker(
        worker_id="test-authoring-worker",
        event_publisher=mock_publisher,
        s3=mock_s3,
    )
    return worker, mock_s3


def _property_labels(element: ifcopenshell.entity_instance) -> dict[str, str]:
    labels: dict[str, str] = {}
    for rel in getattr(element, "IsDefinedBy", []) or []:
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        pset = getattr(rel, "RelatingPropertyDefinition", None)
        for prop in getattr(pset, "HasProperties", []) or []:
            if not prop.is_a("IfcPropertySingleValue"):
                continue
            value = getattr(getattr(prop, "NominalValue", None), "wrappedValue", None)
            if value is not None:
                labels[str(prop.Name)] = str(value)
    return labels


def _wall_by_name(
    model: ifcopenshell.file,
    name: str,
) -> ifcopenshell.entity_instance:
    walls = list(model.by_type("IfcWall")) + list(model.by_type("IfcWallStandardCase"))
    return next(element for element in walls if getattr(element, "Name", None) == name)


def _make_space_model() -> tuple[ifcopenshell.file, ifcopenshell.entity_instance]:
    model = ifcopenshell.file(schema="IFC4")
    project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="Project")
    site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="L1")
    storey.Elevation = 0.0

    ifcopenshell.api.aggregate.assign_object(model, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(model, products=[building], relating_object=site)
    ifcopenshell.api.aggregate.assign_object(model, products=[storey], relating_object=building)

    create_handler = get_op_handler("create_element")
    space = create_handler.execute(
        model,
        None,
        {
            "element_type": "IfcSpace",
            "storey_id": storey.GlobalId,
            "start_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"width": 3000, "height": 4000},
            "properties": {"name": "Worker Space"},
        },
    )
    assert space is not None
    return model, space


def _command_with_inline_engine_request(engine_request: dict[str, Any]) -> CommandMessage:
    root_dir = Path(__file__).resolve().parents[3]
    message_path = root_dir / "sample_messages" / "command_ifc_edit.json"
    with open(message_path, encoding="utf-8") as f:
        raw = json.load(f)
    raw["payload"] = {"engineRequest": engine_request}
    return CommandMessage.model_validate(raw)


def test_authoring_worker_returns_completed_result():
    """오퍼레이션이 적용되면 CompletedResult 와 S3 업로드 호출을 확인한다."""
    root_dir = Path(__file__).resolve().parents[3]
    message_path = root_dir / "sample_messages" / "command_ifc_edit.json"
    ifc_path = root_dir / "tests" / "sample_batang.ifc"

    with open(message_path, encoding="utf-8") as f:
        command = CommandMessage.model_validate(json.load(f))

    worker, mock_s3 = _make_worker(ifc_path.read_bytes())

    # _run_operations 패치 — 실제 IFC 조작 없이 applied 결과를 반환
    with patch.object(worker, "_run_operations", return_value=_APPLIED_OP_RESULTS) as mock_run_ops:
        result = worker.process(command)

    assert isinstance(result, CompletedResult), f"기대: CompletedResult, 실제: {type(result)}"
    output = result.output
    assert "storage_url" in output
    assert "manifest" in output["validation_report_storage_url"]
    assert mock_s3.write_bytes.called, "IFC 업로드(write_bytes)가 호출되지 않음"
    assert mock_s3.write_text.called, "manifest 업로드(write_text)가 호출되지 않음"
    # command의 commandJsonStorageUrl로 engine request를 읽었는지 확인
    mock_s3.read_text.assert_called_once_with(command.payload.commandJsonStorageUrl)
    # 파싱된 engine request가 _run_operations에 전달됐는지 확인
    assert mock_run_ops.call_args[0][1] == _ENGINE_REQUEST
    manifest = json.loads(mock_s3.write_text.call_args.args[1])
    assert manifest["validation_report"]["passed"] is True
    assert manifest["validation_report"]["checked_element_count"] == 1
    print("[OK] CompletedResult 반환 및 S3 업로드 확인")


def test_authoring_worker_accepts_inline_engine_request_v1():
    root_dir = Path(__file__).resolve().parents[3]
    message_path = root_dir / "sample_messages" / "command_ifc_edit.json"
    ifc_path = root_dir / "tests" / "sample_batang.ifc"

    with open(message_path, encoding="utf-8") as f:
        raw = json.load(f)
    raw["payload"] = {"engineRequest": _ENGINE_REQUEST}
    command = CommandMessage.model_validate(raw)

    worker, mock_s3 = _make_worker(ifc_path.read_bytes())

    with patch.object(worker, "_run_operations", return_value=_APPLIED_OP_RESULTS) as mock_run_ops:
        result = worker.process(command)

    assert isinstance(result, CompletedResult)
    mock_s3.read_text.assert_not_called()
    assert mock_run_ops.call_args[0][1] == _ENGINE_REQUEST


def test_authoring_worker_applies_space_and_direction_selector(tmp_path: Path):
    root_dir = Path(__file__).resolve().parents[3]
    ifc_path = root_dir / "tests" / "sample_batang.ifc"
    target_color = "#3B82F6"
    engine_request = {
        "schema_version": "v1",
        "request_id": "req-selector-001",
        "mode": "apply",
        "project_id": "project-layout-001",
        "base_revision_id": None,
        "operations": [
            {
                "id": "op-update-bedroom-east-wall",
                "type": "update_element_properties",
                "selector": {
                    "element_type": "IfcWall",
                    "storey": "2F",
                    "space_name": "Bedroom",
                    "direction": "East",
                    "select_all": False,
                },
                "parameters": {"color": target_color},
            }
        ],
    }
    command = _command_with_inline_engine_request(engine_request)
    worker, mock_s3 = _make_worker(ifc_path.read_bytes())

    result = worker.process(command)

    assert isinstance(result, CompletedResult)
    output_ifc = tmp_path / "selector_output.ifc"
    output_ifc.write_bytes(mock_s3.write_bytes.call_args.args[1])
    model = ifcopenshell.open(str(output_ifc))
    target = _wall_by_name(model, "2F_Bedroom_East_Wall")
    same_space_other_direction = _wall_by_name(model, "2F_Bedroom_North_Wall")
    same_direction_other_space = _wall_by_name(model, "1F_LivingRoom_East_Wall")

    assert _property_labels(target).get("Color") == target_color
    assert _property_labels(same_space_other_direction).get("Color") != target_color
    assert _property_labels(same_direction_other_space).get("Color") != target_color


def test_authoring_worker_keeps_candidates_when_optional_selector_has_no_ifc_match():
    root_dir = Path(__file__).resolve().parents[3]
    ifc_path = root_dir / "tests" / "sample_batang.ifc"
    model = ifcopenshell.open(str(ifc_path))

    for index, wall in enumerate(model.by_type("IfcWall")):
        wall.Name = f"Wall {index}"

    worker, _ = _make_worker(ifc_path.read_bytes())

    elements = worker._resolve_selector(
        model,
        {
            "element_type": "IfcWall",
            "storey": "2F",
            "space_name": "Bedroom",
            "direction": "East",
            "select_all": True,
        },
    )

    assert elements


def test_authoring_worker_fails_when_no_operations_applied():
    """오퍼레이션이 하나도 적용되지 않으면 NonRetryableWorkerError 를 raise 한다.

    process() 가 직접 raise 하며, BaseWorker.handle() 이 이를 잡아 FailedResult 로 변환한다.
    """
    root_dir = Path(__file__).resolve().parents[3]
    message_path = root_dir / "sample_messages" / "command_ifc_edit.json"
    ifc_path = root_dir / "tests" / "sample_batang.ifc"

    with open(message_path, encoding="utf-8") as f:
        command = CommandMessage.model_validate(json.load(f))

    worker, _ = _make_worker(ifc_path.read_bytes())

    rejected_results = [
        {
            "operation_id": "op-delete-walls",
            "operation_type": "delete_elements",
            "status": "rejected",
            "target_count": 0,
            "matched_elements": [],
            "issues": [{"code": "NOT_FOUND", "severity": "error", "message": "No elements"}],
        }
    ]

    with pytest.raises(NonRetryableWorkerError) as exc_info:
        with patch.object(worker, "_run_operations", return_value=rejected_results):
            worker.process(command)

    assert exc_info.value.code == "NO_OPERATIONS_APPLIED"
    print("[OK] NO_OPERATIONS_APPLIED 예외 확인")


def test_apply_delete_preserves_name_for_post_validation():
    """삭제 후에도 post validator가 구조 위험 키워드를 볼 수 있도록 name을 보존한다."""
    root_dir = Path(__file__).resolve().parents[3]
    ifc_path = root_dir / "tests" / "sample_batang.ifc"
    model = ifcopenshell.open(str(ifc_path))
    wall = next(iter(model.by_type("IfcWall")))
    wall.Name = "structural wall"

    worker, _ = _make_worker(ifc_path.read_bytes())
    result = worker._apply_delete(model, "op-delete", "delete_elements", [wall])

    assert result["status"] == "applied"
    assert result["matched_elements"][0]["name"] == "structural wall"
    assert result["matched_elements"][0]["is_load_bearing"] is True


def test_apply_operation_dispatches_delete_wall_void_handler():
    model = ifcopenshell.file(schema="IFC4")
    project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="Project")
    site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="1F")
    storey.Elevation = 0.0
    model_ctx = model.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Model",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        ),
    )
    model.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="Body",
        ContextType="Model",
        ParentContext=model_ctx,
        TargetView="MODEL_VIEW",
    )
    project.RepresentationContexts = [model_ctx]
    ifcopenshell.api.aggregate.assign_object(model, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(model, products=[building], relating_object=site)
    ifcopenshell.api.aggregate.assign_object(model, products=[storey], relating_object=building)

    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    window = create_window_with_opening(model, storey, host_wall=wall)
    assert window is not None
    window_id = window.GlobalId

    worker, _ = _make_worker(b"")
    result = worker._apply_operation(
        model,
        "op-delete-wall-void",
        "delete_wall_void",
        {"global_ids": [window_id]},
        {"expected_kind": "window", "allowed_host_body_class": "parametric"},
    )

    assert result["status"] == "applied"
    assert result["matched_elements"][0]["global_id"] == window_id
    assert len(model.by_type("IfcWindow")) == 0
    assert len(model.by_type("IfcOpeningElement")) == 0
    assert len(model.by_type("IfcRelVoidsElement")) == 0
    assert len(model.by_type("IfcRelFillsElement")) == 0


def test_authoring_worker_rejects_zero_scale_dimension_before_mutation():
    root_dir = Path(__file__).resolve().parents[3]
    ifc_path = root_dir / "tests" / "sample_batang.ifc"
    worker, _ = _make_worker(ifc_path.read_bytes())
    engine_req = {
        "operations": [
            {
                "id": "op-invalid-scale",
                "type": "update_element_properties",
                "selector": {"element_type": "IfcWall", "select_all": True},
                "parameters": {"dimensions_mm": {"length": {"mode": "SCALE", "value": 0}}},
            }
        ]
    }

    with pytest.raises(NonRetryableWorkerError) as exc_info:
        worker._validate_operations_before_mutation(engine_req)

    assert exc_info.value.code == "INVALID_OPERATION_PARAMETERS"
    assert "op-invalid-scale.length" in str(exc_info.value)


def test_authoring_worker_updates_space_with_wrapped_dimensions():
    model, space = _make_space_model()
    worker, _ = _make_worker(b"")

    result = worker._apply_operation(
        model,
        "op-update-space-dimensions",
        "update_element_properties",
        {"global_ids": [space.GlobalId]},
        {
            "dimensions_mm": {
                "width": {"mode": "ABSOLUTE", "value": 5000},
                "height": {"mode": "ABSOLUTE", "value": 4200},
            }
        },
    )

    assert result["status"] == "applied"
    assert result["matched_elements"][0]["global_id"] == space.GlobalId
    body = space.Representation.Representations[0].Items[0]
    assert body.SweptArea.XDim == pytest.approx(5000.0)
    assert body.SweptArea.YDim == pytest.approx(4200.0)


def test_authoring_worker_skips_space_pset_name_only_update():
    model, space = _make_space_model()
    worker, _ = _make_worker(b"")

    result = worker._apply_operation(
        model,
        "op-update-space-noop",
        "update_element_properties",
        {"global_ids": [space.GlobalId]},
        {"pset_name": "Batang_SpaceDimensions"},
    )

    assert result["status"] == "skipped"
    assert result["matched_elements"] == []
    assert result["issues"][0]["code"] == "NO_CHANGE"


if __name__ == "__main__":
    test_authoring_worker_returns_completed_result()
    test_authoring_worker_fails_when_no_operations_applied()
    print("\n모든 테스트 통과")
