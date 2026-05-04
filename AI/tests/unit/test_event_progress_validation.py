from __future__ import annotations
from datetime import datetime, UTC
import pytest
from pydantic import ValidationError
from ai_domain.worker_messages.event import EventMessage

def _base_event(status: str, progress: float | None = None) -> dict:
    return {
        "event_id": "evt-1",
        "schema_version": "v1",
        "message_type": "EVENT",
        "event_type": "TWO_D_LLM_PROGRESS",
        "routing_key": "rk",
        "job_id": "job-1",
        "job_step_id": "step-1",
        "step_no": 1,
        "total_steps": 1,
        "project_id": "proj-1",
        "worker_type": "TWO_D_LLM",
        "worker_id": "worker-1",
        "status": status,
        "progress": progress,
        "idempotency_key": "idem",
        "correlation_id": "corr",
        "occurred_at": datetime.now(UTC).isoformat().replace("+00:00", "Z")
    }

def test_completed_event_requires_progress_1_0():
    data = _base_event("completed", progress=0.5)
    data["output"] = {"storage_url": "http://test"}
    
    with pytest.raises(ValidationError, match="progress must be 1.0 when status is completed"):
        EventMessage.model_validate(data)
        
    data["progress"] = 1.0
    EventMessage.model_validate(data)

def test_started_event_requires_progress_0_0_or_none():
    # Progress 0.5 should fail for started
    data = _base_event("started", progress=0.5)
    expected_error = "progress must be 0.0 or None when status is started"
    with pytest.raises(ValidationError, match=expected_error):
        EventMessage.model_validate(data)
        
    # Progress 0.0 should pass
    data["progress"] = 0.0
    EventMessage.model_validate(data)
    
    # Progress None should pass
    data["progress"] = None
    EventMessage.model_validate(data)

def test_progress_event_requires_any_progress():
    data = _base_event("progress", progress=None)
    with pytest.raises(ValidationError, match="progress is required when status is progress"):
        EventMessage.model_validate(data)
        
    data["progress"] = 0.5
    EventMessage.model_validate(data)

if __name__ == "__main__":
    pytest.main([__file__])
