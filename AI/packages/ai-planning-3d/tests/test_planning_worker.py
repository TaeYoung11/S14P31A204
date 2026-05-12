from pathlib import Path
import json
from unittest.mock import AsyncMock, MagicMock, patch

from ai_common.adapters.rabbitmq.kombu_client import get_command_queue
from ai_common.worker_sdk.event_factory import ClarificationResult
from ai_domain.worker_messages.command import CommandMessage
from ai_planning_3d.worker import PlanningWorker
from ai_planning_3d.worker_app import WORKER_TYPE


def test_three_d_worker_queue_is_registered() -> None:
    queue = get_command_queue(WORKER_TYPE)

    assert queue.name == "batang.three-d-llm.command.queue"
    assert queue.routing_key == "command.three-d-llm.*"
    assert queue.queue_arguments == {
        "x-dead-letter-exchange": "batang.dlx.exchange",
        "x-dead-letter-routing-key": "dead.three-d-llm",
    }


class InMemoryCommandPublisher:
    def __init__(self) -> None:
        self.commands: list[CommandMessage] = []

    def publish_command(self, command: CommandMessage) -> None:
        self.commands.append(command)


def _load_sample_command() -> CommandMessage:
    root_dir = Path(__file__).resolve().parents[3]
    message_path = root_dir / "sample_messages" / "command_3d_llm.json"
    with open(message_path, encoding="utf-8") as f:
        return CommandMessage.model_validate(json.load(f))


def _sample_ifc_bytes() -> bytes:
    root_dir = Path(__file__).resolve().parents[3]
    return (root_dir / "tests" / "sample_batang.ifc").read_bytes()


def test_planning_worker_publishes_ifc_edit_command_for_preview_ready_chat() -> None:
    command = _load_sample_command()
    command_publisher = InMemoryCommandPublisher()
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = _sample_ifc_bytes()
    mock_s3.write_text.return_value = "s3://mock-bucket/output.json"

    worker = PlanningWorker(
        worker_id="test-worker-1",
        event_publisher=MagicMock(),
        s3=mock_s3,
        command_publisher=command_publisher,
    )

    with patch(
        "ai_planning_3d.worker.LLM3DPipeline.execute_preview",
        new_callable=AsyncMock,
    ) as mock_execute:
        mock_execute.return_value = {
            "status": "preview_ready",
            "session_id": "session-create-wall-001",
            "summary": "1F wall ready",
            "command": {
                "command_type": "CREATE",
                "target": {"element_type": "IfcWall"},
                "changes": None,
                "confidence": 0.91,
                "raw_instruction": "1층 북쪽에 벽 만들어줘",
                "ambiguity_question": None,
                "create_info": {
                    "element_type": "IfcWall",
                    "storey": "1F",
                    "direction": "North",
                    "start_point": {"x": 0.0, "y": 6000.0, "z": 0.0},
                    "length_mm": 3000.0,
                    "width_mm": 200.0,
                    "height_mm": 2800.0,
                    "material": {"name": "Concrete"},
                    "color": "#CCCCCC",
                },
            },
        }

        worker.process(command)

    mock_execute.assert_awaited_once_with(command.payload.userInstruction)
    [published] = command_publisher.commands
    assert published.commandType == "IFC_EDIT_APPLY"
    assert published.routingKey == "command.ifc-edit.apply"
    assert published.input is not None
    assert published.input.sourceIfcStorageUrl == command.payload.sourceSceneStorageUrl
    assert published.payload.engineRequest is not None
    engine_request = published.payload.engineRequest
    assert engine_request.mode == "apply"
    assert engine_request.project_id == command.projectId
    [operation] = engine_request.operations
    assert operation.type == "create_element"
    assert operation.parameters["element_type"] == "IfcWall"
    assert operation.parameters["storey"] == "1F"
    assert operation.parameters["start_mm"] == {"x": 0.0, "y": 6000.0, "z": 0.0}
    assert operation.parameters["dimensions_mm"] == {
        "length": 3000.0,
        "width": 200.0,
        "height": 2800.0,
    }


def test_planning_worker_does_not_publish_ifc_edit_command_for_clarification() -> None:
    command = _load_sample_command()
    command_publisher = InMemoryCommandPublisher()
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = _sample_ifc_bytes()
    mock_s3.write_text.return_value = "s3://mock-bucket/output.json"

    worker = PlanningWorker(
        worker_id="test-worker-1",
        event_publisher=MagicMock(),
        s3=mock_s3,
        command_publisher=command_publisher,
    )

    with patch(
        "ai_planning_3d.worker.LLM3DPipeline.execute_preview",
        new_callable=AsyncMock,
    ) as mock_execute:
        mock_execute.return_value = {
            "status": "needs_clarification",
            "session_id": "mock-session-123",
            "summary": "Conflict detected",
            "clarification_questions": [{"id": "q1", "label": "Confirm", "options": []}],
        }

        result = worker.process(command)

    assert isinstance(result, ClarificationResult)
    assert command_publisher.commands == []


def test_planning_worker_logic():
    # 테스트 환경 및 샘플 데이터 로드
    root_dir = Path(__file__).resolve().parents[3]
    message_path = root_dir / "sample_messages" / "command_3d_llm.json"
    ifc_path = root_dir / "tests" / "sample_batang.ifc"

    with open(message_path, encoding="utf-8") as f:
        command = CommandMessage.model_validate(json.load(f))

    # 외부 의존성(S3, Publisher) Mock 설정
    mock_s3 = MagicMock()
    mock_s3.read_bytes.return_value = ifc_path.read_bytes()
    mock_s3.write_text.return_value = "s3://mock-bucket/output.json"
    mock_publisher = MagicMock()

    worker = PlanningWorker(
        worker_id="test-worker-1",
        event_publisher=mock_publisher,
        s3=mock_s3
    )

    # 파이프라인 실행 시뮬레이션 (AsyncMock을 사용하여 비동기 경고 해결)
    with patch(
        "ai_planning_3d.worker.LLM3DPipeline.execute_preview",
        new_callable=AsyncMock,
    ) as mock_execute:
        mock_execute.return_value = {
            "status": "needs_clarification",
            "session_id": "mock-session-123",
            "summary": "Conflict detected",
            "clarification_questions": [{"id": "q1", "label": "Confirm", "options": []}]
        }

        result = worker.process(command)

        assert isinstance(result, ClarificationResult)
        assert result.error.code == "NEEDS_CLARIFICATION"
        assert result.error.clarification_request_id == "mock-session-123"
        print("[OK] result mapping (needs_clarification)")

if __name__ == "__main__":
    test_planning_worker_logic()
