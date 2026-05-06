from __future__ import annotations

from dataclasses import dataclass

from ai_common.config import RabbitMQSettings, S3Settings, WorkerSettings
from ai_layout_import.worker_app import WORKER_TYPE, main, run_ifc_generate_worker


@dataclass
class DummyHealthServer:
    stop_called: bool = False

    def stop(self) -> None:
        self.stop_called = True


class DummyPublisher:
    def __enter__(self) -> DummyPublisher:
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def publish(self, event: object) -> None:
        return None


class DummyConsumer:
    instances: list[DummyConsumer] = []

    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs
        self.run_called = False
        type(self).instances.append(self)

    def run(self) -> None:
        self.run_called = True


class DummyStorageClient:
    def write_bytes_to_ref(self, *args: object, **kwargs: object) -> object:
        raise AssertionError("write_bytes_to_ref should not be called during bootstrap wiring test")

    def write_text_to_ref(self, *args: object, **kwargs: object) -> object:
        raise AssertionError("write_text_to_ref should not be called during bootstrap wiring test")


def _settings() -> WorkerSettings:
    return WorkerSettings(
        worker_type=WORKER_TYPE,
        worker_id="ifc-generate-worker-1",
        environment="test",
        log_json=False,
        health_host="127.0.0.1",
        health_port=0,
        rabbitmq=RabbitMQSettings(),
        s3=S3Settings(
            bucket="batang-artifacts",
            endpoint_url="http://localhost:9000",
            access_key_id="minio",
            secret_access_key="minio123",
        ),
    )


def test_run_ifc_generate_worker_wires_health_publisher_and_one_shot_consumer() -> None:
    health_server = DummyHealthServer()
    DummyConsumer.instances.clear()

    exit_code = run_ifc_generate_worker(
        _settings(),
        once=True,
        health_server_factory=lambda settings: health_server,
        publisher_factory=lambda settings: DummyPublisher(),
        storage_factory=lambda settings: DummyStorageClient(),
        consumer_factory=DummyConsumer,
    )

    assert exit_code == 0
    assert health_server.stop_called is True
    assert len(DummyConsumer.instances) == 1
    assert DummyConsumer.instances[0].kwargs["worker_type"] == WORKER_TYPE
    assert DummyConsumer.instances[0].kwargs["stop_after"] == 1
    assert callable(DummyConsumer.instances[0].kwargs["handler"])
    assert DummyConsumer.instances[0].run_called is True


def test_main_parses_once_flag_and_calls_runtime(monkeypatch) -> None:
    calls: list[bool] = []

    def fake_run_ifc_generate_worker(
        settings: WorkerSettings | None = None,
        *,
        once: bool = False,
        health_server_factory: object = None,
        publisher_factory: object = None,
        storage_factory: object = None,
        consumer_factory: object = None,
    ) -> int:
        calls.append(once)
        return 7

    monkeypatch.setattr(
        "ai_layout_import.worker_app.run_ifc_generate_worker",
        fake_run_ifc_generate_worker,
    )

    assert main(["--once"]) == 7
    assert calls == [True]
