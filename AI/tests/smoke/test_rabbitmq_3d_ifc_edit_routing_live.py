from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_LIVE_RABBITMQ_ROUTING_SMOKE") != "1",
    reason="set RUN_LIVE_RABBITMQ_ROUTING_SMOKE=1 to enable live RabbitMQ routing smoke",
)

AI_ROOT = Path(__file__).resolve().parents[2]
LOCAL_RABBITMQ_HOSTS = {"localhost", "127.0.0.1", "::1"}


def test_three_d_llm_and_ifc_edit_queues_consume_live_commands() -> None:
    from ai_common.worker_sdk.event_factory import CompletedResult

    consumed_3d = _publish_and_consume_once(
        worker_type="THREE_D_LLM",
        sample_name="command_3d_llm.json",
        routing_key="command.3d-llm.generate",
        handler_result=CompletedResult(output={"storage_url": "s3://smoke/3d-plan.json"}),
    )
    consumed_ifc_edit = _publish_and_consume_once(
        worker_type="IFC_EDIT_APPLY",
        sample_name="command_ifc_edit.json",
        routing_key="command.ifc-edit.apply",
        handler_result=CompletedResult(output={"storage_url": "s3://smoke/model.ifc"}),
    )

    assert consumed_3d["command_type"] == "THREE_D_LLM_GENERATE"
    assert consumed_ifc_edit["command_type"] == "IFC_EDIT_APPLY"


def test_three_d_llm_failed_result_moves_command_to_dlq() -> None:
    from ai_common.errors import NonRetryableWorkerError
    from ai_common.worker_sdk.event_factory import FailedResult

    consumed = _publish_and_consume_once(
        worker_type="THREE_D_LLM",
        sample_name="command_3d_llm.json",
        routing_key="command.3d-llm.generate",
        handler_result=FailedResult(
            error=NonRetryableWorkerError(
                code="SMOKE_FAILED",
                message="live smoke failure",
            )
        ),
        expect_dlq=True,
    )

    assert consumed["command_type"] == "THREE_D_LLM_GENERATE"


def _publish_and_consume_once(
    *,
    worker_type: str,
    sample_name: str,
    routing_key: str,
    handler_result: object,
    expect_dlq: bool = False,
) -> dict[str, Any]:
    import kombu

    from ai_common.adapters.rabbitmq.consumer import RabbitMQConsumer
    from ai_common.adapters.rabbitmq.kombu_client import (
        COMMANDS_EXCHANGE,
        THREE_D_LLM_DLQ,
        build_connection,
        declare_supporting_topology,
        get_command_queue,
    )
    from ai_common.config import RabbitMQSettings

    rabbitmq = RabbitMQSettings()
    _require_local_rabbitmq(rabbitmq.host)
    command = _build_command(sample_name)
    command["routingKey"] = routing_key
    queue = get_command_queue(worker_type)
    consumed: list[dict[str, Any]] = []

    with build_connection(rabbitmq) as connection:
        connection.connect()
        with connection.channel() as channel:
            COMMANDS_EXCHANGE.declare(channel=channel)
            declare_supporting_topology(channel)
            bound_queue = queue(channel)
            _delete_queue_if_exists(bound_queue)
            bound_queue.declare()
            bound_queue.purge()
            if expect_dlq:
                bound_dlq = THREE_D_LLM_DLQ(channel)
                bound_dlq.declare()
                bound_dlq.purge()

    def _handler(command_message: Any) -> object:
        consumed.append(command_message.model_dump(by_alias=True, exclude_none=True))
        return handler_result

    consumer = RabbitMQConsumer(
        settings=rabbitmq,
        worker_type=worker_type,
        handler=_handler,
        stop_after=1,
    )
    thread = threading.Thread(target=consumer.run, daemon=True)
    thread.start()
    time.sleep(0.5)

    with build_connection(rabbitmq) as connection:
        connection.connect()
        with connection.channel() as channel:
            producer = kombu.Producer(channel)
            producer.publish(
                json.dumps(command, ensure_ascii=False),
                exchange=COMMANDS_EXCHANGE,
                routing_key=routing_key,
                content_type="application/json",
                delivery_mode=2,
            )

    thread.join(timeout=15)
    assert not thread.is_alive(), f"consumer did not stop for worker_type={worker_type}"
    assert len(consumed) == 1

    if expect_dlq:
        _assert_dead_lettered(command["messageId"])

    return consumed[0]


def _build_command(sample_name: str) -> dict[str, Any]:
    command = json.loads((AI_ROOT / "sample_messages" / sample_name).read_text(encoding="utf-8"))
    run_id = str(uuid4())
    command.update(
        {
            "messageId": f"msg-smoke-{run_id}",
            "jobId": f"job-smoke-{run_id}",
            "jobStepId": f"step-smoke-{run_id}",
            "correlationId": f"corr-smoke-{run_id}",
            "idempotencyKey": f"job-smoke-{run_id}:step-1",
        }
    )
    return command


def _delete_queue_if_exists(bound_queue: Any) -> None:
    try:
        bound_queue.delete(if_unused=False, if_empty=False)
    except Exception as exc:
        if exc.__class__.__name__ not in {"NotFound", "ChannelError"}:
            raise


def _require_local_rabbitmq(host: str) -> None:
    if host not in LOCAL_RABBITMQ_HOSTS:
        pytest.skip(
            "live RabbitMQ smoke deletes and recreates queues; "
            f"refusing to run against non-local host {host!r}"
        )


def _assert_dead_lettered(message_id: str) -> None:
    from ai_common.adapters.rabbitmq.kombu_client import THREE_D_LLM_DLQ, build_connection
    from ai_common.config import RabbitMQSettings

    deadline = time.monotonic() + 10
    rabbitmq = RabbitMQSettings()
    _require_local_rabbitmq(rabbitmq.host)
    with build_connection(rabbitmq) as connection:
        connection.connect()
        with connection.channel() as channel:
            bound_dlq = THREE_D_LLM_DLQ(channel)
            while time.monotonic() < deadline:
                message = bound_dlq.get(no_ack=False, accept=["application/json", "text/plain"])
                if message is None:
                    time.sleep(0.25)
                    continue
                payload = _decode_message_payload(message)
                message.ack()
                if payload.get("messageId") == message_id:
                    return
    raise AssertionError(f"Timed out waiting for messageId={message_id!r} in 3D LLM DLQ")


def _decode_message_payload(message: Any) -> dict[str, Any]:
    payload = getattr(message, "payload", message)
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, str):
        return json.loads(payload)
    if isinstance(payload, bytes):
        return json.loads(payload.decode("utf-8"))
    raise TypeError(f"Unsupported RabbitMQ payload type: {type(payload)!r}")
