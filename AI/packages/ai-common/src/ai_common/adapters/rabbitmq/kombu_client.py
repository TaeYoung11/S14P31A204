"""RabbitMQ topology constants and connection factory.

All exchange/queue declarations live here so they stay in sync with the
BE Spring config (RabbitMqConfig.java). Any new worker type requires a
single entry in _WORKER_TYPE_TO_QUEUE.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

try:
    import kombu
    import kombu.mixins
except Exception:  # pragma: no cover - exercised in local fallback only
    class _MissingKombuChannel:
        def __enter__(self) -> _MissingKombuChannel:
            return self

        def __exit__(self, *_: object) -> None:
            return None

    class _MissingKombuConnection:
        def __init__(self, *_: object, **__: object) -> None:
            self._error = ModuleNotFoundError("kombu is required for RabbitMQ runtime")

        def __enter__(self) -> _MissingKombuConnection:
            return self

        def __exit__(self, *_: object) -> None:
            self.close()

        def connect(self) -> None:
            raise self._error

        def channel(self) -> Any:
            return _MissingKombuChannel()

        def close(self) -> None:
            return None

    @dataclass(slots=True)
    class _FallbackExchange:
        name: str
        type: str
        durable: bool

        def declare(self, *_: object, **__: object) -> None:
            return None

    @dataclass(slots=True)
    class _FallbackQueue:
        name: str
        exchange: object
        routing_key: str
        durable: bool
        queue_arguments: dict[str, Any] | None = None

    class _FallbackConsumer:
        pass

    class _FallbackConsumerMixin:
        should_stop: bool = False

        def run(self) -> None:
            raise ModuleNotFoundError("kombu is required for RabbitMQ runtime")

    class _FallbackProducers(dict[Any, Any]):
        pass

    class _FallbackKombuModule:
        Exchange = _FallbackExchange
        Queue = _FallbackQueue
        Connection = _MissingKombuConnection
        Consumer = _FallbackConsumer
        producers: dict[Any, Any] = _FallbackProducers()

        class mixins:
            ConsumerMixin = _FallbackConsumerMixin

    kombu = _FallbackKombuModule()  # type: ignore[assignment]

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
    queue_arguments={
        "x-dead-letter-exchange": "batang.dlx.exchange",
        "x-dead-letter-routing-key": "dead.sd-render",
    },
)
IFC_GENERATE_COMMAND_QUEUE = kombu.Queue(
    "batang.ifc-generate.command.queue",
    exchange=COMMANDS_EXCHANGE,
    routing_key="command.ifc-generate.#",
    durable=True,
    queue_arguments={
        "x-dead-letter-exchange": "batang.dlx.exchange",
        "x-dead-letter-routing-key": "dead.ifc-generate",
    },
)
THREE_D_LLM_COMMAND_QUEUE = kombu.Queue(
    "batang.3d-llm.command.queue",
    exchange=COMMANDS_EXCHANGE,
    routing_key="command.3d-llm.*",
    durable=True,
)
TWO_D_LLM_COMMAND_QUEUE = kombu.Queue(
    "batang.2d-llm.command.queue",
    exchange=COMMANDS_EXCHANGE,
    routing_key="command.2d-llm.*",
    durable=True,
    queue_arguments={
        "x-dead-letter-exchange": "batang.dlx.exchange",
        "x-dead-letter-routing-key": "dead.2d-llm",
    },
)

_WORKER_TYPE_TO_QUEUE: dict[str, kombu.Queue] = {
    "SD_RENDER_GENERATE": SD_RENDER_COMMAND_QUEUE,
    "IFC_GENERATE_FROM_BUBBLE": IFC_GENERATE_COMMAND_QUEUE,
    "THREE_D_LLM": THREE_D_LLM_COMMAND_QUEUE,
    "TWO_D_LLM": TWO_D_LLM_COMMAND_QUEUE,
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
