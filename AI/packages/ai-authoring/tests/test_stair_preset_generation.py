"""Tests for straight IfcStair preset generation."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.root
import pytest

import ai_authoring.operations  # noqa: F401
from ai_authoring.apply_engine_request import apply_ifc_edit_payload
from ai_authoring.engine_3d import create_stair_preset
from ai_authoring.operations.registry import get

_AI_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_SAMPLE_IFC = _AI_ROOT / "tests" / "sample_batang.ifc"
_OUT_DIR = Path.home() / "Downloads" / "batang_history"


def _make_model():
    model = ifcopenshell.file(schema="IFC4")
    project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="Project")
    site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="1F")
    storey.Elevation = 0.0

    model_ctx = model.create_entity(
        "IfcGeometricRepresentationContext",
        ContextIdentifier="Model",
        ContextType="Model",
        CoordinateSpaceDimension=3,
        Precision=1e-5,
        WorldCoordinateSystem=model.create_entity(
            "IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        ),
    )
    model.create_entity(
        "IfcGeometricRepresentationSubContext",
        ContextIdentifier="Body",
        ContextType="Model",
        ParentContext=model_ctx,
        TargetView="MODEL_VIEW",
    )
    project.RepresentationContexts = [model_ctx]
    project.UnitsInContext = model.create_entity(
        "IfcUnitAssignment",
        Units=[
            model.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Name="METRE"),
        ],
    )

    ifcopenshell.api.aggregate.assign_object(model, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(model, products=[building], relating_object=site)
    ifcopenshell.api.aggregate.assign_object(model, products=[storey], relating_object=building)
    return model, storey


def _body_items(element):
    body = next(
        rep
        for rep in element.Representation.Representations
        if rep.RepresentationIdentifier == "Body"
    )
    return list(body.Items)


def _stair_engine_request() -> dict[str, object]:
    return {
        "schema_version": "v1",
        "request_id": "req-create-stair-preset-on-batang",
        "mode": "apply",
        "project_id": "project-layout-001",
        "base_revision_id": None,
        "operations": [
            {
                "id": "op-create-stair-preset",
                "type": "create_element",
                "selector": None,
                "parameters": {
                    "element_type": "IfcStair",
                    "storey": "1F",
                    "coordinate_space": "PROJECT_ABSOLUTE_MM",
                    "start_mm": {"x": 2200.0, "y": 1200.0, "z": 0.0},
                    "dimensions_mm": {"length": 3600, "width": 1000, "height": 3000},
                    "direction": "east",
                    "step_count": 16,
                    "material": "Concrete",
                    "color": "#B0B0B0",
                },
            }
        ],
    }


def _build_stair_sample(
    ifc_in: Path,
    ifc_out: Path,
    log_out: Path | None = None,
) -> dict[str, object]:
    source_model = ifcopenshell.open(str(ifc_in))
    before_stairs = len(source_model.by_type("IfcStair"))
    before_flights = len(source_model.by_type("IfcStairFlight"))

    ifc_out.parent.mkdir(parents=True, exist_ok=True)
    result = apply_ifc_edit_payload(
        ifc_path=str(ifc_in),
        output_path=str(ifc_out),
        payload={"engineRequest": _stair_engine_request()},
    )

    reopened = ifcopenshell.open(str(ifc_out))
    stairs = reopened.by_type("IfcStair")
    created_stairs = [
        stair
        for stair in stairs
        if getattr(stair, "GlobalId", None) in result["created_ids"]
    ]
    created_stair = created_stairs[0] if created_stairs else stairs[-1]
    stats = {
        "before_stairs": before_stairs,
        "after_stairs": len(stairs),
        "before_flights": before_flights,
        "stair_flights": len(reopened.by_type("IfcStairFlight")),
        "body_items": len(_body_items(created_stair)),
        "created_ids": result["created_ids"],
        "ifc_out": str(ifc_out),
    }
    if log_out is not None:
        log_out.parent.mkdir(parents=True, exist_ok=True)
        log_lines = [
            f"=== stair preset sample [{datetime.now().isoformat()}] ===",
            f"[input] {ifc_in}",
            f"[output] {ifc_out}",
            f"[before_stairs] {stats['before_stairs']}",
            f"[after_stairs] {stats['after_stairs']}",
            f"[before_flights] {stats['before_flights']}",
            f"[stair_flights] {stats['stair_flights']}",
            f"[body_items] {stats['body_items']}",
            f"[created_ids] {stats['created_ids']}",
        ]
        log_out.write_text("\n".join(log_lines), encoding="utf-8")
        stats["log_out"] = str(log_out)
    return stats

def test_create_stair_preset_builds_stepped_ifc_stair():
    model, storey = _make_model()

    stair = create_stair_preset(
        model,
        storey,
        length_mm=3000,
        width_mm=1000,
        height_mm=1500,
        step_count=10,
    )

    assert stair is not None
    assert stair.is_a("IfcStair")
    assert len(model.by_type("IfcStairFlight")) == 1
    assert len(_body_items(stair)) == 10
    assert [round(float(item.Depth), 3) for item in _body_items(stair)[-2:]] == [1.35, 1.5]
    assert any(rel.RelatingObject == stair for rel in model.by_type("IfcRelAggregates"))


def test_create_element_handler_routes_ifc_stair_to_preset():
    model, storey = _make_model()
    handler = get("create_element")

    stair = handler.execute(
        model,
        storey,
        {
            "element_type": "IfcStair",
            "storey": "1F",
            "coordinate_space": "PROJECT_ABSOLUTE_MM",
            "start_mm": {"x": 100.0, "y": 200.0, "z": 0.0},
            "dimensions_mm": {"length": 3200, "width": 1100, "height": 1600},
            "step_count": 8,
            "material": "Concrete",
            "color": "#B0B0B0",
        },
    )

    assert stair is not None
    assert stair.is_a("IfcStair")
    assert len(_body_items(stair)) == 8
    assert len(model.by_type("IfcStairFlight")) == 1
    assert stair.ContainedInStructure


def test_stair_preset_survives_ifc_save_and_reopen(tmp_path):
    model, storey = _make_model()
    stair = create_stair_preset(model, storey, height_mm=1530, step_count=9)
    assert stair is not None

    out_path = tmp_path / "stair-preset.ifc"
    model.write(str(out_path))

    reopened = ifcopenshell.open(str(out_path))
    [reopened_stair] = reopened.by_type("IfcStair")
    assert len(reopened.by_type("IfcStairFlight")) == 1
    assert len(_body_items(reopened_stair)) == 9


def test_engine_request_schema_accepts_stair_preset_fields():
    schema_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "schemas"
        / "engine_request.v2.schema.json"
    )
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    properties = schema["$defs"]["createElementParameters"]["properties"]

    assert "step_count" in properties
    assert "riser_height_mm" in properties
    assert "tread_depth_mm" in properties


@pytest.mark.skipif(not _DEFAULT_SAMPLE_IFC.exists(), reason="sample IFC not found")
def test_create_stair_on_batang_sample_ifc(tmp_path):
    stats = _build_stair_sample(
        _DEFAULT_SAMPLE_IFC,
        tmp_path / f"{_DEFAULT_SAMPLE_IFC.stem}_with_stair.ifc",
    )

    assert stats["after_stairs"] == stats["before_stairs"] + 1
    assert stats["stair_flights"] == stats["before_flights"] + 1
    assert stats["body_items"] == 16
    assert len(stats["created_ids"]) == 1


if __name__ == "__main__":
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=_DEFAULT_SAMPLE_IFC)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--log", type=Path)
    args = parser.parse_args()
    output = args.output or _OUT_DIR / f"{args.input.stem}_stair_preset_{timestamp}.ifc"
    log = args.log or _OUT_DIR / f"{args.input.stem}_stair_preset_{timestamp}.log"
    result = _build_stair_sample(args.input, output, log)
    print(result)
