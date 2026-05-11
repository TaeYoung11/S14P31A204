from __future__ import annotations

import json
from datetime import UTC, datetime
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from unittest.mock import MagicMock

from ai_domain import CommandMessage


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "publish_sample_command.py"
SAMPLE_ROOT = SCRIPT_PATH.parents[1] / "sample_messages"


def _load_module():
    spec = spec_from_file_location("publish_sample_command", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_ifc_generate_routing_key_matches_contract() -> None:
    module = _load_module()

    assert module.get_routing_key("IFC_GENERATE_FROM_BUBBLE") == "command.ifc-generate.from-bubble"


def test_sd_render_publish_sample_uses_ifc2img_command() -> None:
    module = _load_module()

    assert module.get_sample_file("SD_RENDER_GENERATE") == "command_ifc2img_render.json"
    assert module.get_routing_key("SD_RENDER_GENERATE") == "command.sd-render.generate"


def test_ifc2img_publish_sample_passes_command_validation() -> None:
    data = json.loads((SAMPLE_ROOT / "command_ifc2img_render.json").read_text(encoding="utf-8"))

    command = CommandMessage.model_validate(data)

    assert command.commandType == "SD_RENDER_GENERATE"
    assert command.input is not None
    assert command.input.sourceIfcStorageUrl is not None
    assert command.expectedOutput.renderManifestStorageUrl is not None
    assert command.expectedOutput.renderPhotoFrontDiagonalLeftStorageUrl is not None
    assert command.expectedOutput.renderPhotoFrontDiagonalRightStorageUrl is not None
    assert command.payload.renderMode == "ifc2img"
    assert command.payload.preset == "korean_house"


def test_ifc2img_smoke_output_prefix_is_uniquified(monkeypatch) -> None:
    module = _load_module()
    monkeypatch.delenv("SMOKE_OUTPUT_PREFIX", raising=False)
    payload = {
        "expectedOutput": {
            "renderManifestStorageUrl": (
                "s3://batang-artifacts/projects/project-1/renders/artifact-1/manifest.v1.json"
            )
        }
    }

    result = module.uniquify_smoke_output_prefix(
        payload,
        worker_type="SD_RENDER_GENERATE",
        run_id="20260511T010203Z",
    )

    assert result["expectedOutput"]["renderManifestStorageUrl"] == (
        "s3://batang-artifacts/projects/project-1/renders/artifact-1/"
        "20260511T010203Z/manifest.v1.json"
    )
    assert result["expectedOutput"]["renderPhotoFrontDiagonalLeftStorageUrl"] == (
        "s3://batang-artifacts/projects/project-1/renders/artifact-1/"
        "20260511T010203Z/photo_front_diagonal_left.png"
    )


def test_ifc2img_smoke_output_prefix_can_use_env_base(monkeypatch) -> None:
    module = _load_module()
    monkeypatch.setenv("SMOKE_OUTPUT_PREFIX", "s3://bucket/smoke/custom/")
    payload = {
        "expectedOutput": {
            "renderManifestStorageUrl": (
                "s3://batang-artifacts/projects/project-1/renders/artifact-1/manifest.v1.json"
            )
        }
    }

    result = module.uniquify_smoke_output_prefix(
        payload,
        worker_type="SD_RENDER_GENERATE",
        run_id="20260511T010203Z",
    )

    assert result["expectedOutput"]["renderManifestStorageUrl"] == (
        "s3://bucket/smoke/custom/20260511T010203Z/manifest.v1.json"
    )


def test_smoke_run_id_uses_utc_timestamp() -> None:
    module = _load_module()

    assert (
        module.build_smoke_run_id(
            datetime(2026, 5, 11, 1, 2, 3, tzinfo=UTC),
            unique_suffix="abc12345",
        )
        == "20260511T010203Z-abc12345"
    )


def test_main_publishes_without_s3_env(monkeypatch) -> None:
    module = _load_module()
    monkeypatch.setenv("WORKER_TYPE", "SD_RENDER_GENERATE")
    monkeypatch.setenv("RABBITMQ_HOST", "rabbitmq.local")
    monkeypatch.setenv("RABBITMQ_PORT", "5672")
    monkeypatch.setenv("RABBITMQ_USERNAME", "guest")
    monkeypatch.setenv("RABBITMQ_PASSWORD", "guest")
    monkeypatch.setenv("RABBITMQ_VHOST", "/")
    monkeypatch.delenv("S3_BUCKET", raising=False)

    connection = MagicMock()
    channel_context = connection.__enter__.return_value.channel.return_value
    channel = channel_context.__enter__.return_value
    producer = MagicMock()
    exchange = MagicMock()
    module.build_connection = MagicMock(return_value=connection)
    module.COMMANDS_EXCHANGE = exchange
    module.kombu.Producer = MagicMock(return_value=producer)

    module.main()

    module.build_connection.assert_called_once()
    exchange.declare.assert_called_once_with(channel=channel)
    module.kombu.Producer.assert_called_once_with(channel)
    producer.publish.assert_called_once()
    assert producer.publish.call_args.kwargs["routing_key"] == "command.sd-render.generate"
    published_payload = json.loads(producer.publish.call_args.args[0])
    assert published_payload["expectedOutput"]["renderManifestStorageUrl"].startswith(
        "s3://batang-artifacts/projects/project-ifc2img-001/renders/"
        "artifact-ifc2img-render-001/"
    )
    assert published_payload["expectedOutput"]["renderManifestStorageUrl"].endswith(
        "/manifest.v1.json"
    )
