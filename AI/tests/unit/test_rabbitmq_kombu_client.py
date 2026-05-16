from __future__ import annotations

from unittest.mock import MagicMock, patch

from ai_common.adapters.rabbitmq.kombu_client import (
    DLX_EXCHANGE,
    IFC_EDIT_DLQ,
    THREE_D_LLM_DLQ,
    build_connection,
    declare_supporting_topology,
    get_command_queue,
)
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


def test_three_d_llm_command_queue_has_dlq_contract() -> None:
    queue = get_command_queue("THREE_D_LLM")

    assert queue.name == "batang.three-d-llm.command.queue"
    assert queue.routing_key == "command.three-d-llm.*"
    assert queue.queue_arguments == {
        "x-dead-letter-exchange": "batang.dlx.exchange",
        "x-dead-letter-routing-key": "dead.three-d-llm",
    }


def test_ifc_edit_command_queue_has_dlq_contract() -> None:
    queue = get_command_queue("IFC_EDIT_APPLY")

    assert queue.name == "batang.ifc-edit.command.queue"
    assert queue.routing_key == "command.ifc-edit.apply"
    assert queue.queue_arguments == {
        "x-dead-letter-exchange": "batang.dlx.exchange",
        "x-dead-letter-routing-key": "dead.ifc-edit",
    }


def test_supporting_topology_declares_dlx_and_dlqs() -> None:
    channel = MagicMock()

    with (
        patch.object(DLX_EXCHANGE, "declare") as declare_dlx,
        patch.object(THREE_D_LLM_DLQ, "declare") as declare_3d_dlq,
        patch.object(IFC_EDIT_DLQ, "declare") as declare_ifc_edit_dlq,
    ):
        declare_supporting_topology(channel)

    declare_dlx.assert_called_once_with(channel=channel)
    declare_3d_dlq.assert_called_once_with(channel=channel)
    declare_ifc_edit_dlq.assert_called_once_with(channel=channel)
