"""ai_rendering.worker_app 부트스트랩 연결 테스트."""

from __future__ import annotations

from dataclasses import dataclass

from ai_common.config import RabbitMQSettings, S3Settings, WorkerSettings

from ai_rendering.worker_app import WORKER_TYPE, main, run_rendering_worker


@dataclass
class DummyHealthServer:
    """worker_app이 종료 시 health server를 정리하는지 확인하기 위한 더미."""

    stop_called: bool = False

    def stop(self) -> None:
        self.stop_called = True


class DummyPublisher:
    """KombuEventPublisher 대신 context manager 동작만 흉내 낸다."""

    def __enter__(self) -> DummyPublisher:
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def publish(self, event: object) -> None:
        return None


class DummyConsumer:
    """RabbitMQConsumer 생성 인자와 run 호출 여부를 기록한다."""

    instances: list[DummyConsumer] = []

    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs
        self.run_called = False
        type(self).instances.append(self)

    def run(self) -> None:
        self.run_called = True


def _settings() -> WorkerSettings:
    return WorkerSettings(
        worker_type=WORKER_TYPE,
        worker_id="rendering-worker-1",
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


def test_run_rendering_worker_wires_publisher_worker_and_consumer() -> None:
    """RenderingWorker.handle이 RabbitMQConsumer handler로 연결되는지 확인한다."""

    health_server = DummyHealthServer()
    DummyConsumer.instances.clear()

    exit_code = run_rendering_worker(
        _settings(),
        once=True,
        work_root="outputs/test-rendering-worker",
        health_server_factory=lambda settings: health_server,
        publisher_factory=lambda settings: DummyPublisher(),
        consumer_factory=DummyConsumer,
    )

    assert exit_code == 0
    assert health_server.stop_called is True
    assert len(DummyConsumer.instances) == 1
    consumer = DummyConsumer.instances[0]
    assert consumer.kwargs["worker_type"] == WORKER_TYPE
    assert consumer.kwargs["stop_after"] == 1
    assert callable(consumer.kwargs["handler"])
    assert consumer.run_called is True


def test_run_rendering_worker_rejects_wrong_worker_type() -> None:
    """잘못된 WORKER_TYPE으로 실행되면 RabbitMQ 연결 전에 실패한다."""

    settings = _settings()
    settings.worker_type = "THREE_D_LLM_GENERATE"

    try:
        run_rendering_worker(
            settings,
            health_server_factory=lambda worker_settings: DummyHealthServer(),
            publisher_factory=lambda rabbitmq_settings: DummyPublisher(),
            consumer_factory=DummyConsumer,
        )
    except ValueError as exc:
        assert "SD_RENDER_GENERATE" in str(exc)
    else:
        raise AssertionError("wrong worker_type should raise ValueError")


def test_main_parses_once_and_work_root_flags(monkeypatch) -> None:
    """CLI flag가 run_rendering_worker 인자로 전달되는지 확인한다."""

    calls: list[tuple[bool, str]] = []

    def fake_run_rendering_worker(
        settings: WorkerSettings | None = None,
        *,
        once: bool = False,
        work_root: str = "",
        health_server_factory: object = None,
        publisher_factory: object = None,
        consumer_factory: object = None,
    ) -> int:
        calls.append((once, work_root))
        return 7

    monkeypatch.setattr(
        "ai_rendering.worker_app.run_rendering_worker",
        fake_run_rendering_worker,
    )

    assert main(["--once", "--work-root", "outputs/custom"]) == 7
    assert calls == [(True, "outputs/custom")]
