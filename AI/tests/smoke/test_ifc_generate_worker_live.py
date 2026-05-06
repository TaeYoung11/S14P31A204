from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_LIVE_IFC_GENERATE_SMOKE") != "1",
    reason="set RUN_LIVE_IFC_GENERATE_SMOKE=1 to enable live RabbitMQ/MinIO smoke",
)

ROOT = Path(__file__).resolve().parents[3]
AI_ROOT = ROOT / "AI"
SAMPLE_PATH = AI_ROOT / "sample_messages" / "command_ifc_generate.json"


def test_ifc_generate_worker_live_smoke() -> None:
    import kombu

    from ai_common.adapters.rabbitmq.kombu_client import (
        COMMANDS_EXCHANGE,
        EVENTS_EXCHANGE,
        build_connection,
    )
    from ai_common.adapters.storage import S3Client, resolve_s3_write_target
    from ai_common.config import RabbitMQSettings, S3Settings

    run_id = str(uuid4())
    rabbitmq = RabbitMQSettings()
    s3_settings = S3Settings()
    storage = S3Client(s3_settings)
    command = _build_smoke_command(run_id)
    event_queue = kombu.Queue(
        name=f"batang.ifc-generate.smoke.{run_id}",
        exchange=EVENTS_EXCHANGE,
        routing_key="event.ifc-generate.#",
        durable=False,
        auto_delete=True,
        exclusive=False,
    )

    with build_connection(rabbitmq) as connection:
        connection.connect()
        with connection.channel() as channel:
            COMMANDS_EXCHANGE.declare(channel=channel)
            EVENTS_EXCHANGE.declare(channel=channel)
            bound_queue = event_queue(channel)
            bound_queue.declare()
            bound_queue.purge()

            producer = kombu.Producer(channel)
            producer.publish(
                json.dumps(command, ensure_ascii=False),
                exchange=COMMANDS_EXCHANGE,
                routing_key="command.ifc-generate.from-bubble",
                content_type="application/json",
                delivery_mode=2,
            )

            result = _run_worker_once()
            assert result.returncode == 0, result.stderr or result.stdout

            events = _collect_matching_events(
                bound_queue=bound_queue,
                correlation_id=command["correlationId"],
                timeout_seconds=30.0,
            )

            statuses = [event["status"] for event in events]
            assert "started" in statuses, events
            assert "completed" in statuses, events
            assert "failed" not in statuses, events

            completed = next(event for event in events if event["status"] == "completed")
            assert (
                completed["output"]["storage_url"]
                == command["expectedOutput"]["ifc_storage_url"]
            )
            assert (
                completed["output"]["validation_report_storage_url"]
                == command["expectedOutput"]["validation_report_storage_url"]
            )

            ifc_target = resolve_s3_write_target(
                command["expectedOutput"]["ifc_storage_url"],
                s3_settings.bucket,
            )
            report_target = resolve_s3_write_target(
                command["expectedOutput"]["validation_report_storage_url"],
                s3_settings.bucket,
            )
            assert storage.object_exists(ifc_target.canonical_url) is True
            assert storage.object_exists(report_target.canonical_url) is True

            bound_queue.delete()


def _build_smoke_command(run_id: str) -> dict[str, Any]:
    template = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    project_id = str(uuid4())
    job_id = str(uuid4())
    job_step_id = str(uuid4())
    source_revision_id = str(uuid4())
    source_scene_state_id = str(uuid4())
    target_revision_id = str(uuid4())
    artifact_id = str(uuid4())
    requested_by = str(uuid4())
    correlation_id = str(uuid4())
    message_id = str(uuid4())
    base_prefix = f"smoke/{run_id}"

    template.update(
        {
            "messageId": message_id,
            "jobId": job_id,
            "jobStepId": job_step_id,
            "projectId": project_id,
            "requestedBy": requested_by,
            "sourceRevisionId": source_revision_id,
            "sourceSceneStateId": source_scene_state_id,
            "targetRevisionId": target_revision_id,
            "expectedOutputArtifactId": artifact_id,
            "correlationId": correlation_id,
            "idempotencyKey": f"{job_id}:1",
            "expectedOutput": {
                "ifc_storage_url": (
                    f"{base_prefix}/projects/{project_id}/revisions/"
                    f"{target_revision_id}/model.ifc"
                ),
                "validation_report_storage_url": (
                    f"{base_prefix}/jobs/{job_id}/steps/1/validation-report.json"
                ),
            },
            "payload": {
                "layout_import": template["payload"]["layoutImport"],
            },
        }
    )
    return template


def _run_worker_once() -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.setdefault("WORKER_TYPE", "IFC_GENERATE_FROM_BUBBLE")
    env.setdefault("WORKER_ID", f"ifc-generate-smoke-{uuid4()}")
    env.setdefault("ENVIRONMENT", "smoke")
    env.setdefault("LOG_LEVEL", "INFO")
    env.setdefault("LOG_JSON", "false")
    env.setdefault("HEALTH_HOST", "127.0.0.1")
    env.setdefault("HEALTH_PORT", "0")
    env.setdefault("AI_WORKER_TEMP_DIR", str(AI_ROOT / ".tmp" / "smoke"))

    pythonpath_entries = [
        str(AI_ROOT),
        str(AI_ROOT / "packages" / "ai-common" / "src"),
        str(AI_ROOT / "packages" / "ai-domain" / "src"),
        str(AI_ROOT / "packages" / "ai-layout-import" / "src"),
    ]
    existing_pythonpath = env.get("PYTHONPATH")
    if existing_pythonpath:
        pythonpath_entries.append(existing_pythonpath)
    env["PYTHONPATH"] = os.pathsep.join(pythonpath_entries)

    return subprocess.run(
        [sys.executable, "main.py", "--once"],
        cwd=AI_ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=120,
        check=False,
    )


def _collect_matching_events(
    *,
    bound_queue: Any,
    correlation_id: str,
    timeout_seconds: float,
) -> list[dict[str, Any]]:
    deadline = time.monotonic() + timeout_seconds
    events: list[dict[str, Any]] = []
    statuses: set[str] = set()

    while time.monotonic() < deadline:
        try:
            message = bound_queue.get(no_ack=False, accept=["application/json", "text/plain"])
        except Exception as exc:
            if exc.__class__.__name__ != "Empty":
                raise
            time.sleep(0.25)
            continue
        if message is None:
            time.sleep(0.25)
            continue

        payload = _decode_message_payload(message)
        message.ack()

        if payload.get("correlation_id") != correlation_id:
            continue

        events.append(payload)
        statuses.add(str(payload.get("status")))
        if "started" in statuses and any(status in statuses for status in {"completed", "failed"}):
            return events

    raise AssertionError(
        "Timed out waiting for started/completed IFC events for "
        f"correlation_id={correlation_id!r}. "
        f"Collected events: {events!r}"
    )


def _decode_message_payload(message: Any) -> dict[str, Any]:
    payload = getattr(message, "payload", message)
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, str):
        return json.loads(payload)
    if isinstance(payload, bytes):
        return json.loads(payload.decode("utf-8"))
    raise TypeError(f"Unsupported RabbitMQ payload type: {type(payload)!r}")
