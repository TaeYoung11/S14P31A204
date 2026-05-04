"""Lightweight stdlib health server for AI workers."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from typing import TypedDict
from collections.abc import Callable, Mapping

from ai_common.config import WorkerSettings


class HealthPayload(TypedDict, total=False):
    """JSON payload returned by the shared health endpoint."""

    status: str
    service: str
    workerType: str
    workerId: str
    environment: str
    timestamp: str
    checks: dict[str, object]


HealthProvider = Callable[[], Mapping[str, object]]


@dataclass(slots=True)
class HealthServer:
    """Manage a background stdlib health server thread."""

    server: ThreadingHTTPServer
    thread: Thread

    @property
    def server_address(self) -> tuple[str, int]:
        address = self.server.server_address
        return str(address[0]), address[1]

    def start(self) -> None:
        """Start the background health server if it is not already running."""

        if not self.thread.is_alive():
            self.thread.start()

    def stop(self) -> None:
        """Shutdown the background health server and close its socket."""

        self.server.shutdown()
        self.server.server_close()
        if self.thread.is_alive():
            self.thread.join(timeout=5)


def build_health_payload(
    settings: WorkerSettings,
    provider: HealthProvider | None = None,
) -> HealthPayload:
    """Build the JSON body returned by the shared health endpoint."""

    payload: HealthPayload = {
        "status": "ok",
        "service": "ai-worker",
        "workerType": settings.worker_type,
        "workerId": settings.worker_id,
        "environment": settings.environment,
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }

    if provider is None:
        return payload

    try:
        checks = dict(provider())
        payload["checks"] = checks
        if any(v == "error" for v in checks.values()):
            payload["status"] = "error"
    except Exception:
        payload["status"] = "error"
        payload["checks"] = {"providerStatus": "error"}
    return payload


def start_health_server(
    settings: WorkerSettings,
    provider: HealthProvider | None = None,
) -> HealthServer:
    """Create and start a background stdlib health server."""

    handler_class = _build_handler(settings, provider)
    server = ThreadingHTTPServer((settings.health_host, settings.health_port), handler_class)
    thread = Thread(target=server.serve_forever, name="ai-common-health", daemon=True)
    health_server = HealthServer(server=server, thread=thread)
    health_server.start()
    return health_server


def _build_handler(
    settings: WorkerSettings,
    provider: HealthProvider | None,
) -> type[BaseHTTPRequestHandler]:
    class HealthRequestHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path != "/health":
                self.send_error(404)
                return

            payload = build_health_payload(settings, provider)
            status_code = 200 if payload["status"] == "ok" else 503
            response = json.dumps(payload).encode("utf-8")

            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

        def log_message(self, format: str, *args: object) -> None:
            return

    return HealthRequestHandler


__all__ = [
    "HealthPayload",
    "HealthProvider",
    "HealthServer",
    "build_health_payload",
    "start_health_server",
]
