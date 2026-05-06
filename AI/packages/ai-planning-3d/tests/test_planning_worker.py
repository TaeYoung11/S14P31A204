import json
from unittest.mock import MagicMock, patch, AsyncMock
from pathlib import Path

from ai_common.worker_sdk.event_factory import ClarificationResult
from ai_domain.worker_messages.command import CommandMessage
from ai_planning_3d.worker import PlanningWorker

def test_planning_worker_logic():
    # 테스트 환경 및 샘플 데이터 로드
    root_dir = Path(__file__).resolve().parents[3]
    message_path = root_dir / "sample_messages" / "command_3d_llm.json"
    ifc_path = Path("C:/Users/SSAFY/Downloads/batang_sample.ifc")

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
