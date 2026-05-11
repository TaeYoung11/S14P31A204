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
from pathlib import Path

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


if __name__ == "__main__":
    main()
