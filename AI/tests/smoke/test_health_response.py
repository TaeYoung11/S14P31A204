from __future__ import annotations

import json
from urllib.error import HTTPError
from urllib.request import urlopen

from ai_common.config import WorkerSettings
from ai_common.health import start_health_server


def test_health_endpoint_returns_200_and_json_payload() -> None:
    server = start_health_server(
        WorkerSettings(
            worker_type="TWO_D_LLM",
            worker_id="2d-llm-worker-1",
            health_host="127.0.0.1",
            health_port=0,
        )
    )

    try:
        host, port = server.server_address
        with urlopen(f"http://{host}:{port}/health") as response:
            payload = json.loads(response.read().decode("utf-8"))

        assert response.status == 200
        assert payload["status"] == "ok"
        assert payload["service"] == "ai-worker"
        assert payload["workerType"] == "TWO_D_LLM"
        assert payload["workerId"] == "2d-llm-worker-1"
        assert payload["environment"] == "local"
    finally:
        server.stop()


def test_health_endpoint_returns_404_for_unknown_path() -> None:
    server = start_health_server(
        WorkerSettings(
            worker_type="TWO_D_LLM",
            worker_id="2d-llm-worker-1",
            health_host="127.0.0.1",
            health_port=0,
        )
    )

    try:
        host, port = server.server_address
        try:
            urlopen(f"http://{host}:{port}/missing")
        except HTTPError as error:
            assert error.code == 404
        else:
            raise AssertionError("unknown health path must return 404")
    finally:
        server.stop()


def test_health_endpoint_includes_provider_checks_and_provider_errors() -> None:
    def ok_provider() -> dict[str, object]:
        return {"storage": "ok"}

    ok_server = start_health_server(
        WorkerSettings(
            worker_type="TWO_D_LLM",
            worker_id="2d-llm-worker-1",
            health_host="127.0.0.1",
            health_port=0,
        ),
        provider=ok_provider,
    )

    try:
        host, port = ok_server.server_address
        with urlopen(f"http://{host}:{port}/health") as response:
            payload = json.loads(response.read().decode("utf-8"))
        assert payload["checks"] == {"storage": "ok"}
    finally:
        ok_server.stop()

    def failing_provider() -> dict[str, object]:
        raise RuntimeError("provider failed")

    failing_server = start_health_server(
        WorkerSettings(
            worker_type="TWO_D_LLM",
            worker_id="2d-llm-worker-1",
            health_host="127.0.0.1",
            health_port=0,
        ),
        provider=failing_provider,
    )

    try:
        host, port = failing_server.server_address
        with urlopen(f"http://{host}:{port}/health") as response:
            payload = json.loads(response.read().decode("utf-8"))
        assert payload["checks"] == {"providerStatus": "error"}
    finally:
        failing_server.stop()
