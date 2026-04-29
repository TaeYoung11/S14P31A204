"""Typed worker settings shared across runtime packages."""

from __future__ import annotations

from typing import Annotated, Any, Literal, TypeAlias

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName: TypeAlias = Literal["local", "dev", "staging", "prod", "test"]
LogLevelName: TypeAlias = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]

WorkerTypeField = Annotated[str, Field(min_length=1, alias="WORKER_TYPE")]
WorkerIdField = Annotated[str, Field(min_length=1, alias="WORKER_ID")]
EnvironmentField = Annotated[EnvironmentName, Field(alias="ENVIRONMENT")]
LogLevelField = Annotated[LogLevelName, Field(alias="LOG_LEVEL")]
LogJsonField = Annotated[bool, Field(alias="LOG_JSON")]
HealthHostField = Annotated[str, Field(alias="HEALTH_HOST", min_length=1)]
HealthPortField = Annotated[int, Field(alias="HEALTH_PORT", ge=1, le=65535)]


class WorkerSettings(BaseSettings):
    """Core runtime settings shared by every worker."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    worker_type: WorkerTypeField
    worker_id: WorkerIdField
    environment: EnvironmentField = "local"
    log_level: LogLevelField = "INFO"
    log_json: LogJsonField = True
    health_host: HealthHostField = "0.0.0.0"
    health_port: HealthPortField = 8080


def load_worker_settings(**overrides: Any) -> WorkerSettings:
    """Load worker settings from the environment plus optional overrides."""

    return WorkerSettings(**overrides)


def settings_to_env_dict(settings: WorkerSettings) -> dict[str, str]:
    """Serialize settings back into environment-style key/value pairs."""

    data = settings.model_dump()
    return {
        "WORKER_TYPE": data["worker_type"],
        "WORKER_ID": data["worker_id"],
        "ENVIRONMENT": data["environment"],
        "LOG_LEVEL": data["log_level"],
        "LOG_JSON": str(data["log_json"]).lower(),
        "HEALTH_HOST": data["health_host"],
        "HEALTH_PORT": str(data["health_port"]),
    }


__all__ = [
    "EnvironmentName",
    "LogLevelName",
    "WorkerSettings",
    "load_worker_settings",
    "settings_to_env_dict",
]
