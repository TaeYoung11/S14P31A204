from __future__ import annotations

import json
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

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
    assert command.expectedOutput.renderImageStorageUrl is not None
    assert command.payload.renderMode == "ifc2img"
    assert command.payload.preset == "korean_house"
