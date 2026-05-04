from __future__ import annotations

from ai_common.worker_sdk.base_worker import BaseWorker
from ai_common.worker_sdk.event_factory import ProgressResult, WorkerResult
from ai_domain.worker_messages.event import EventMessage

class MockPublisher:
    def __init__(self):
        self.events = []
    def publish(self, event: EventMessage):
        self.events.append(event)

class ProgressWorker(BaseWorker):
    def process(self, command: object) -> WorkerResult:
        # Simulate returning progress directly
        return ProgressResult(progress=0.75)

def test_worker_can_return_progress_result():
    publisher = MockPublisher()
    worker = ProgressWorker(worker_id="test-worker", event_publisher=publisher)
    
    class MockCommand:
        messageId = "msg-1"
        commandType = "TWO_D_LLM_GENERATE"
        routingKey = "rk"
        jobId = "job-1"
        jobStepId = "step-1"
        stepNo = 1
        totalSteps = 1
        projectId = "proj-1"
        requestedBy = "user-1"
        expectedOutputArtifactId = "art-1"
        attemptNo = 0
        maxAttempts = 3
        idempotencyKey = "idem"
        correlationId = "corr"
        sourceRevisionId = None
        sourceSceneStateId = None
        sourceSceneType = None
        targetRevisionId = None

    result = worker.handle(MockCommand())
    
    assert isinstance(result, ProgressResult)
    assert result.progress == 0.75
    
    # Events: started, terminal (which is now progress)
    assert len(publisher.events) == 2
    assert publisher.events[0].status == "started"
    assert publisher.events[1].status == "progress"
    assert publisher.events[1].progress == 0.75

if __name__ == "__main__":
    import pytest
    pytest.main([__file__])
