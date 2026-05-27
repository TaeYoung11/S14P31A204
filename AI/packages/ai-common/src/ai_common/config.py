"""Typed worker settings shared across runtime packages."""

from __future__ import annotations

from typing import Annotated, Any, Literal, TypeAlias
from urllib.parse import quote

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName: TypeAlias = Literal["local", "dev", "staging", "prod", "test"]
LogLevelName: TypeAlias = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class RabbitMQSettings(BaseSettings):
    """RabbitMQ connection settings — reads RABBITMQ_* env vars."""

    model_config = SettingsConfigDict(
        env_prefix="RABBITMQ_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    host: str = Field(default="localhost")
    port: int = Field(default=5672, ge=1, le=65535)
    username: str = Field(default="guest", min_length=1)
    password: str = Field(default="guest", min_length=1)
    vhost: str = Field(default="/")
    heartbeat: int = Field(default=60, ge=0)

    @computed_field
    @property
    def url(self) -> str:
        user = quote(self.username, safe="")
        pw = quote(self.password, safe="")
        return f"amqp://{user}:{pw}@{self.host}:{self.port}/{quote(self.vhost, safe='/')}"


class S3Settings(BaseSettings):
    """S3 / MinIO connection settings — reads S3_* env vars."""

    model_config = SettingsConfigDict(
        env_prefix="S3_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    bucket: str = Field(min_length=1)
    endpoint_url: str | None = Field(default=None)
    access_key_id: str | None = Field(default=None)
    secret_access_key: str | None = Field(default=None)
    region: str = Field(default="us-east-1")


WorkerTypeField = Annotated[str, Field(min_length=1, alias="WORKER_TYPE")]
WorkerIdField = Annotated[str, Field(min_length=1, alias="WORKER_ID")]
EnvironmentField = Annotated[EnvironmentName, Field(alias="ENVIRONMENT")]
LogLevelField = Annotated[LogLevelName, Field(alias="LOG_LEVEL")]
LogJsonField = Annotated[bool, Field(alias="LOG_JSON")]
HealthHostField = Annotated[str, Field(alias="HEALTH_HOST", min_length=1)]
HealthPortField = Annotated[int, Field(alias="HEALTH_PORT", ge=0, le=65535)]


class WorkerSettings(BaseSettings):
    """Core runtime settings shared by every worker."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    worker_type: WorkerTypeField
    worker_id: WorkerIdField
    environment: EnvironmentField = "local"
    log_level: LogLevelField = "INFO"
    log_json: LogJsonField = True
    health_host: HealthHostField = "0.0.0.0"
    health_port: HealthPortField = 8080
    rabbitmq: RabbitMQSettings = Field(default_factory=RabbitMQSettings)
    s3: S3Settings = Field(default_factory=S3Settings)


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
    "RabbitMQSettings",
    "S3Settings",
    "WorkerSettings",
    "load_worker_settings",
    "settings_to_env_dict",
]
