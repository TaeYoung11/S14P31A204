"""RabbitMQ topology constants and connection factory.

All exchange/queue declarations live here so they stay in sync with the
BE Spring config (RabbitMqConfig.java). Any new worker type requires a
single entry in _WORKER_TYPE_TO_QUEUE.
"""

from __future__ import annotations

import kombu

from ai_common.config import RabbitMQSettings

COMMANDS_EXCHANGE = kombu.Exchange(
    "batang.commands.exchange",
    type="topic",
    durable=True,
)
EVENTS_EXCHANGE = kombu.Exchange(
    "batang.events.exchange",
    type="topic",
    durable=True,
)

SD_RENDER_COMMAND_QUEUE = kombu.Queue(
    "batang.sd-render.command.queue",
    exchange=COMMANDS_EXCHANGE,
    routing_key="command.sd-render.*",
    durable=True,
)
IFC_GENERATE_COMMAND_QUEUE = kombu.Queue(
    "batang.ifc-generate.command.queue",
    exchange=COMMANDS_EXCHANGE,
    routing_key="command.ifc-generate.#",
    durable=True,
)

_WORKER_TYPE_TO_QUEUE: dict[str, kombu.Queue] = {
    "SD_RENDER_GENERATE": SD_RENDER_COMMAND_QUEUE,
    "IFC_GENERATE_FROM_BUBBLE": IFC_GENERATE_COMMAND_QUEUE,
}


def build_connection(settings: RabbitMQSettings) -> kombu.Connection:
    """Return a lazy kombu Connection — does not connect until first use."""
    return kombu.Connection(settings.url, heartbeat=60)


def get_command_queue(worker_type: str) -> kombu.Queue:
    """Return the command queue for a given worker type string.

    Raises ValueError for unregistered worker types so startup fails fast
    rather than silently missing messages at runtime.
    """
    try:
        return _WORKER_TYPE_TO_QUEUE[worker_type]
    except KeyError as exc:
        raise ValueError(
            f"No command queue registered for worker_type: {worker_type!r}. "
            f"Registered types: {list(_WORKER_TYPE_TO_QUEUE)}"
        ) from exc
