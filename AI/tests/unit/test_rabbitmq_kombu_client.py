from __future__ import annotations

from unittest.mock import patch

from ai_common.adapters.rabbitmq.kombu_client import build_connection
from ai_common.config import RabbitMQSettings


def test_build_connection_passes_configured_heartbeat() -> None:
    settings = RabbitMQSettings(
        host="rabbitmq.local",
        port=5673,
        username="worker",
        password="secret",
        vhost="/batang",
        heartbeat=0,
    )

    with patch("ai_common.adapters.rabbitmq.kombu_client.kombu.Connection") as connection:
        build_connection(settings)

    connection.assert_called_once_with(settings.url, heartbeat=0)
