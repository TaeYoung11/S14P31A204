from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_common.config import S3Settings, WorkerSettings, load_worker_settings, settings_to_env_dict


def _clear_worker_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in [
        "WORKER_TYPE",
        "WORKER_ID",
        "ENVIRONMENT",
        "LOG_LEVEL",
        "LOG_JSON",
        "HEALTH_HOST",
        "HEALTH_PORT",
        "RABBITMQ_URL",
        "S3_BUCKET_NAME",
        "S3_BUCKET",
    ]:
        monkeypatch.delenv(key, raising=False)


def test_worker_settings_requires_worker_type_and_worker_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clear_worker_env(monkeypatch)

    with pytest.raises(ValidationError):
        WorkerSettings()


def test_worker_settings_applies_defaults_and_ignores_unrelated_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clear_worker_env(monkeypatch)
    monkeypatch.setenv("WORKER_TYPE", "TWO_D_LLM")
    monkeypatch.setenv("WORKER_ID", "2d-llm-worker-1")
    monkeypatch.setenv("RABBITMQ_URL", "amqp://example")
    monkeypatch.setenv("S3_BUCKET", "test-bucket")

    settings = WorkerSettings()

    assert settings.worker_type == "TWO_D_LLM"
    assert settings.worker_id == "2d-llm-worker-1"
    assert settings.environment == "local"
    assert settings.log_level == "INFO"
    assert settings.log_json is True
    assert settings.health_host == "0.0.0.0"
    assert settings.health_port == 8080


def test_load_worker_settings_and_settings_to_env_dict_round_trip() -> None:
    settings = load_worker_settings(
        worker_type="IFC_EDIT_APPLY",
        worker_id="ifc-edit-worker-1",
        environment="dev",
        log_level="DEBUG",
        log_json=False,
        health_host="127.0.0.1",
        health_port=9090,
        s3=S3Settings(bucket="test-bucket"),
    )

    assert settings_to_env_dict(settings) == {
        "WORKER_TYPE": "IFC_EDIT_APPLY",
        "WORKER_ID": "ifc-edit-worker-1",
        "ENVIRONMENT": "dev",
        "LOG_LEVEL": "DEBUG",
        "LOG_JSON": "false",
        "HEALTH_HOST": "127.0.0.1",
        "HEALTH_PORT": "9090",
    }
