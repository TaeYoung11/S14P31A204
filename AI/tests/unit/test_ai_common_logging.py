from __future__ import annotations

from ai_common.config import WorkerSettings
from ai_common.context import RequestContext
from ai_common.logging import (
    bind_request_logger,
    bind_worker_logger,
    build_log_context,
    configure_logging,
    get_logger,
)


def _settings(*, log_json: bool) -> WorkerSettings:
    return WorkerSettings(
        worker_type="TWO_D_LLM",
        worker_id="2d-llm-worker-1",
        log_json=log_json,
    )


def test_build_log_context_uses_canonical_camel_case_keys() -> None:
    context = RequestContext(
        request_id="req-001",
        correlation_id="corr-001",
        project_id="project-001",
        job_id="job-001",
        message_id="msg-001",
    )

    fields = build_log_context(
        context=context,
        idempotency_key="idem-001",
        worker_type="TWO_D_LLM",
        worker_id="2d-llm-worker-1",
        environment="local",
        job_id="job-override",
        extra_flag=True,
    )

    assert fields["jobId"] == "job-override"
    assert fields["correlationId"] == "corr-001"
    assert fields["idempotencyKey"] == "idem-001"
    assert fields["workerType"] == "TWO_D_LLM"
    assert fields["workerId"] == "2d-llm-worker-1"
    assert fields["environment"] == "local"
    assert fields["extra_flag"] is True


def test_bind_worker_logger_adds_worker_fields() -> None:
    configure_logging(_settings(log_json=True))
    logger = bind_worker_logger(
        get_logger("worker"),
        _settings(log_json=True),
        run_id="run-001",
    )

    assert logger._context["workerType"] == "TWO_D_LLM"
    assert logger._context["workerId"] == "2d-llm-worker-1"
    assert logger._context["environment"] == "local"
    assert logger._context["run_id"] == "run-001"


def test_bind_request_logger_adds_request_lineage_fields() -> None:
    configure_logging(_settings(log_json=False))
    context = RequestContext(
        request_id="req-002",
        correlation_id="corr-002",
        project_id="project-002",
        job_id="job-002",
        message_id="msg-002",
    )

    logger = bind_request_logger(
        get_logger("request"),
        context=context,
        idempotency_key="idem-002",
        worker_type="THREE_D_LLM",
        worker_id="3d-llm-worker-1",
    )

    assert logger._context["requestId"] == "req-002"
    assert logger._context["jobId"] == "job-002"
    assert logger._context["correlationId"] == "corr-002"
    assert logger._context["idempotencyKey"] == "idem-002"
    assert logger._context["workerType"] == "THREE_D_LLM"
    assert logger._context["workerId"] == "3d-llm-worker-1"


def test_configure_logging_supports_json_and_console_modes() -> None:
    configure_logging(_settings(log_json=True))
    configure_logging(_settings(log_json=False))

    logger = get_logger("configured")
    assert logger is not None
