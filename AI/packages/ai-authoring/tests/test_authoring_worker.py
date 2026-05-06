import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from ai_authoring.worker import AuthoringWorker
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


def test_authoring_worker_returns_completed_result():
    """오퍼레이션이 적용되면 CompletedResult 와 S3 업로드 호출을 확인한다."""
    root_dir = Path(__file__).resolve().parents[3]
    message_path = root_dir / "sample_messages" / "command_ifc_edit.json"
    ifc_path = root_dir / "tests" / "sample_batang.ifc"

    with open(message_path, encoding="utf-8") as f:
        command = CommandMessage.model_validate(json.load(f))

    worker, mock_s3 = _make_worker(ifc_path.read_bytes())

    # _run_operations 패치 — 실제 IFC 조작 없이 applied 결과를 반환
    with patch.object(worker, "_run_operations", return_value=_APPLIED_OP_RESULTS):
        result = worker.process(command)

    assert isinstance(result, CompletedResult), f"기대: CompletedResult, 실제: {type(result)}"
    output = result.output
    assert "storage_url" in output
    assert "manifest" in output["validation_report_storage_url"]
    assert mock_s3.write_bytes.called, "IFC 업로드(write_bytes)가 호출되지 않음"
    assert mock_s3.write_text.called, "manifest 업로드(write_text)가 호출되지 않음"
    print("[OK] CompletedResult 반환 및 S3 업로드 확인")


def test_authoring_worker_fails_when_no_operations_applied():
    """오퍼레이션이 하나도 적용되지 않으면 NonRetryableWorkerError 를 raise 한다.

    BaseWorker.handle() 이 이 예외를 잡아 FailedResult 로 변환한다.
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

    try:
        with patch.object(worker, "_run_operations", return_value=rejected_results):
            worker.process(command)
        assert False, "NonRetryableWorkerError 가 발생해야 합니다"
    except NonRetryableWorkerError as exc:
        assert exc.code == "NO_OPERATIONS_APPLIED"
        print("[OK] NO_OPERATIONS_APPLIED 예외 확인")


if __name__ == "__main__":
    test_authoring_worker_returns_completed_result()
    test_authoring_worker_fails_when_no_operations_applied()
    print("\n모든 테스트 통과")
