#!/usr/bin/env python3
"""Publish a sample command to RabbitMQ for local development and smoke testing.

Reads WORKER_TYPE and RabbitMQ connection settings from environment variables.
Sample message files live in AI/sample_messages/.

Usage:
    WORKER_TYPE=SD_RENDER_GENERATE \\
    RABBITMQ_HOST=localhost RABBITMQ_USERNAME=guest RABBITMQ_PASSWORD=guest \\
    python scripts/publish_sample_command.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

try:
    import kombu
except Exception:  # pragma: no cover - exercised in local fallback only
    kombu = None  # type: ignore[assignment]

from ai_common.adapters.rabbitmq.kombu_client import COMMANDS_EXCHANGE, build_connection
from ai_common.config import RabbitMQSettings

_WORKER_TYPE_TO_SAMPLE: dict[str, str] = {
    "SD_RENDER_GENERATE": "command_ifc2img_render.json",
    "IFC_GENERATE_FROM_BUBBLE": "command_ifc_generate.json",
    "TWO_D_LLM_GENERATE": "command_2d_llm.json",
    "THREE_D_LLM_GENERATE": "command_3d_llm.json",
    "IFC_EDIT_APPLY": "command_ifc_edit.json",
}

_WORKER_TYPE_TO_ROUTING_KEY: dict[str, str] = {
    "SD_RENDER_GENERATE": "command.sd-render.generate",
    "IFC_GENERATE_FROM_BUBBLE": "command.ifc-generate.from-bubble",
    "TWO_D_LLM_GENERATE": "command.2d-llm.generate",
    "THREE_D_LLM_GENERATE": "command.3d-llm.generate",
    "IFC_EDIT_APPLY": "command.ifc-edit.apply",
}

_SAMPLES_DIR = Path(__file__).resolve().parents[1] / "sample_messages"
_SMOKE_OUTPUT_PREFIX_ENV = "SMOKE_OUTPUT_PREFIX"


def get_sample_file(worker_type: str) -> str:
    try:
        return _WORKER_TYPE_TO_SAMPLE[worker_type]
    except KeyError as exc:
        raise KeyError(f"No sample message defined for worker type: {worker_type!r}") from exc


def get_routing_key(worker_type: str) -> str:
    try:
        return _WORKER_TYPE_TO_ROUTING_KEY[worker_type]
    except KeyError as exc:
        raise KeyError(f"No routing key defined for worker type: {worker_type!r}") from exc


def get_worker_type_from_env() -> str:
    worker_type = os.getenv("WORKER_TYPE")
    if not worker_type:
        raise RuntimeError("WORKER_TYPE environment variable is required")
    return worker_type


def build_smoke_run_id(
    now: datetime | None = None,
    *,
    unique_suffix: str | None = None,
) -> str:
    timestamp = now or datetime.now(UTC)
    suffix = unique_suffix or uuid4().hex[:8]
    return f"{timestamp.strftime('%Y%m%dT%H%M%SZ')}-{suffix}"


def uniquify_smoke_output_prefix(
    payload: dict[str, object],
    *,
    worker_type: str,
    run_id: str | None = None,
) -> dict[str, object]:
    if worker_type != "SD_RENDER_GENERATE":
        return payload

    expected_output = payload.get("expectedOutput")
    if not isinstance(expected_output, dict):
        return payload

    output_url = expected_output.get("renderImageStorageUrl")
    if not isinstance(output_url, str) or not output_url:
        return payload

    unique_run_id = run_id or build_smoke_run_id()
    output_prefix_base = os.getenv(_SMOKE_OUTPUT_PREFIX_ENV, output_url).rstrip("/")
    expected_output["renderImageStorageUrl"] = f"{output_prefix_base}/{unique_run_id}"
    return payload


def main() -> None:
    if kombu is None:
        raise ModuleNotFoundError("kombu is required to publish sample commands")

    worker_type = get_worker_type_from_env()

    try:
        sample_file = get_sample_file(worker_type)
        routing_key = get_routing_key(worker_type)
    except KeyError:
        print(
            f"No sample message defined for WORKER_TYPE={worker_type!r}.\n"
            f"Supported types: {list(_WORKER_TYPE_TO_SAMPLE)}",
            file=sys.stderr,
        )
        sys.exit(1)

    sample_path = _SAMPLES_DIR / sample_file
    payload = json.loads(sample_path.read_text(encoding="utf-8"))
    payload = uniquify_smoke_output_prefix(payload, worker_type=worker_type)

    rmq = RabbitMQSettings()
    with build_connection(rmq) as conn:
        with conn.channel() as channel:
            COMMANDS_EXCHANGE.declare(channel=channel)
            producer = kombu.Producer(channel)
            producer.publish(
                json.dumps(payload, ensure_ascii=False),
                exchange=COMMANDS_EXCHANGE,
                routing_key=routing_key,
                content_type="application/json",
                delivery_mode=2,
            )

    print(f"Published '{sample_file}' → routing key '{routing_key}'")
    expected_output = payload.get("expectedOutput")
    if isinstance(expected_output, dict):
        output_url = expected_output.get("renderImageStorageUrl")
        if isinstance(output_url, str):
            print(f"renderImageStorageUrl={output_url}")


if __name__ == "__main__":
    main()
