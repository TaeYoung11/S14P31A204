from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "publish_sample_command.py"


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
