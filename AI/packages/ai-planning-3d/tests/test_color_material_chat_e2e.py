"""Color/material chat command runner through planning-3d and authoring logic."""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from datetime import datetime
from pathlib import Path

import ifcopenshell
import pytest

from ai_planning_3d.command import (
    COLOR_ALIASES,
    MATERIAL_ALIASES,
    LLM3DMaterialChange,
    color_from_alias,
)
from ai_planning_3d.pipeline import LLM3DPipeline

_AI_ROOT = Path(__file__).resolve().parents[3]
_SAMPLE_IFC = _AI_ROOT / "tests" / "sample_batang.ifc"
# 직접 실행할 때 채팅 문장은 여기만 수정하면 됩니다.
_CHAT_COMMAND = (
    "1층 거실 전체 외벽을 나무로 바꾸고, 2층 오른쪽 벽을 파란색으로 바꿔줘. "
    "그리고 지붕을 콘크리트로 해줘."
)
_OUT_DIR = Path.home() / "Downloads" / "batang_history"


def _chat_commands() -> list[str]:
    return LLM3DPipeline.split_chat_commands(_CHAT_COMMAND)


def _first_chat_material_command() -> str:
    # Heuristic 파서를 통해 첫 번째 재질 변경 명령을 찾음
    pipeline = LLM3DPipeline(ifc_path=str(_SAMPLE_IFC))
    for command in _chat_commands():
        parsed = pipeline.engine.parse_command_heuristic(command)
        if parsed.changes and parsed.changes.material:
            return command
    raise AssertionError("_CHAT_COMMAND must include at least one material change command")


def _use_heuristic_chat_parser(pipeline: LLM3DPipeline) -> None:
    async def parse(user_text: str, ifc_context: str | None = None):  # noqa: ARG001
        return pipeline.engine.parse_command_heuristic(user_text)

    pipeline.engine.parse_command = parse  # type: ignore[method-assign]


def _styled_colors(model, element):
    colors = []
    representation = getattr(element, "Representation", None)
    for rep in getattr(representation, "Representations", []) or []:
        for item in getattr(rep, "Items", []) or []:
            for inverse in model.get_inverse(item):
                if not inverse.is_a("IfcStyledItem"):
                    continue
                for assignment in getattr(inverse, "Styles", []) or []:
                    for surface_style in getattr(assignment, "Styles", []) or []:
                        for rendering in getattr(surface_style, "Styles", []) or []:
                            color = getattr(rendering, "SurfaceColour", None)
                            if color:
                                colors.append(color)
    return colors


def _has_rgb_color(colors, expected: tuple[float, float, float]) -> bool:
    return any(
        all(
            abs(float(getattr(color, attr)) - expected_value) < 0.01
            for attr, expected_value in zip(("Red", "Green", "Blue"), expected, strict=True)
        )
        for color in colors
    )


def _rgb_from_color_value(value: str) -> tuple[float, float, float]:
    aliases = {
        "Black": (0.0, 0.0, 0.0),
        "White": (1.0, 1.0, 1.0),
        "Red": (1.0, 0.0, 0.0),
        "Yellow": (1.0, 0.8, 0.0),
        "Blue": (0.0, 0.0, 1.0),
        "Green": (0.0, 0.6, 0.0),
        "Gray": (0.8, 0.8, 0.8),
    }
    raw = value.strip()
    if raw in aliases:
        return aliases[raw]
    hex_value = raw.lstrip("#")
    if len(hex_value) == 6:
        return tuple(int(hex_value[index : index + 2], 16) / 255 for index in (0, 2, 4))
    return aliases["Gray"]


def _material_names(element) -> list[str]:
    names: list[str] = []
    for rel in getattr(element, "HasAssociations", []) or []:
        if rel.is_a("IfcRelAssociatesMaterial"):
            material = getattr(rel, "RelatingMaterial", None)
            name = getattr(material, "Name", None)
            if name:
                names.append(str(name))
    return names


def _all_material_names(model) -> list[str]:
    names: list[str] = []
    for element in model.by_type("IfcProduct"):
        names.extend(_material_names(element))
    return names


def _property_labels(element) -> dict[str, str]:
    labels: dict[str, str] = {}
    for rel in getattr(element, "IsDefinedBy", []) or []:
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        pset = getattr(rel, "RelatingPropertyDefinition", None)
        for prop in getattr(pset, "HasProperties", []) or []:
            if not prop.is_a("IfcPropertySingleValue"):
                continue
            value = getattr(getattr(prop, "NominalValue", None), "wrappedValue", None)
            if value is not None:
                labels[str(prop.Name)] = str(value)
    return labels


def _all_styled_colors(model):
    colors = []
    for element in model.by_type("IfcProduct"):
        colors.extend(_styled_colors(model, element))
    return colors


def _target_wall(model, name: str = "1F_LivingRoom_South_Wall"):
    walls = list(model.by_type("IfcWall")) + list(model.by_type("IfcWallStandardCase"))
    return next(
        element
        for element in walls
        if getattr(element, "Name", None) == name
    )


def _elements_with_label(element_iterable, property_name: str, value: str):
    return [
        element
        for element in element_iterable
        if _property_labels(element).get(property_name) == value
    ]


def _elements_by_ifc_type(model, element_type: str):
    if element_type == "IfcWall":
        return list(model.by_type("IfcWall")) + list(model.by_type("IfcWallStandardCase"))
    return list(model.by_type(element_type))


def _sample_with_editor_properties(tmp_path: Path) -> Path:
    source = ifcopenshell.open(str(_SAMPLE_IFC))
    walls = list(source.by_type("IfcWall")) + list(source.by_type("IfcWallStandardCase"))
    roofs = list(source.by_type("IfcRoof"))
    for element in [*walls, *roofs]:
        material_prop = source.create_entity(
            "IfcPropertySingleValue",
            Name="Material",
            NominalValue=source.create_entity("IfcLabel", "Concrete"),
        )
        color_prop = source.create_entity(
            "IfcPropertySingleValue",
            Name="Color",
            NominalValue=source.create_entity("IfcLabel", "#A8A29E"),
        )
        pset = source.create_entity(
            "IfcPropertySet",
            GlobalId=ifcopenshell.guid.new(),
            Name="Pset_Batang_Dimensions",
            HasProperties=[material_prop, color_prop],
        )
        source.create_entity(
            "IfcRelDefinesByProperties",
            GlobalId=ifcopenshell.guid.new(),
            RelatedObjects=[element],
            RelatingPropertyDefinition=pset,
        )
    editor_ifc = tmp_path / f"{_SAMPLE_IFC.stem}_editor_props.ifc"
    source.write(str(editor_ifc))
    return editor_ifc


async def run_color_material_chat_commands(
    ifc_path: Path,
    commands: list[str],
    output_path: Path,
    log_path: Path | None = None,
) -> list[dict[str, object]]:
    """Run color/material chat commands and record preview/apply results."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []
    current_ifc = ifc_path

    for index, command in enumerate(commands, start=1):
        command_output_path = output_path
        if len(commands) > 1:
            command_output_path = output_path.with_name(
                f"{output_path.stem}_{index:02d}{output_path.suffix}"
            )
        input_for_command = current_ifc
        pipeline = LLM3DPipeline(ifc_path=str(current_ifc))
        _use_heuristic_chat_parser(pipeline)
        command_records = await pipeline.execute_chat_to_ifc(command, str(command_output_path))
        assert command_records, f"chat command produced no records: {command}"
        if command_output_path.exists() and any(
            record.get("ifc_written") for record in command_records
        ):
            current_ifc = command_output_path
        for record in command_records:
            record["batch_index"] = index
            record["input_ifc"] = str(input_for_command)
            if record.get("ifc_written"):
                record["final_output_ifc"] = str(command_output_path)
            records.append(record)

    if log_path is not None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    return records


def test_pipeline_splits_color_material_chat_command():
    commands = _chat_commands()

    assert commands
    assert all(command.strip() for command in commands)
    assert all(not command.endswith("고") for command in commands)


def test_color_aliases_are_fe_hex_values():
    assert all(re.fullmatch(r"#[0-9A-F]{6}", color) for color in COLOR_ALIASES.values())


@pytest.mark.parametrize(("alias", "expected_color"), sorted(COLOR_ALIASES.items()))
def test_color_aliases_resolve_to_expected_hex(alias, expected_color):
    assert color_from_alias(alias) == expected_color


def test_heuristic_parser_recognizes_chat_color_command():
    parsed = LLM3DPipeline(ifc_path=str(_SAMPLE_IFC)).engine.parse_command_heuristic(
        _chat_commands()[1]
    )

    assert parsed.target.direction == "East"
    assert parsed.changes
    assert parsed.changes.position_mm is None
    assert parsed.changes.color == "#3B82F6"


@pytest.mark.parametrize(
    ("command_index", "expected_material"),
    [
        (0, "Wood"),
        (2, "Concrete"),
    ],
)
def test_heuristic_parser_recognizes_chat_material_commands(
    command_index,
    expected_material,
):
    parsed = LLM3DPipeline(ifc_path=str(_SAMPLE_IFC)).engine.parse_command_heuristic(
        _chat_commands()[command_index]
    )

    assert parsed.changes
    assert parsed.changes.material
    assert parsed.changes.material.name == expected_material


@pytest.mark.parametrize(("alias", "expected_material"), sorted(MATERIAL_ALIASES.items()))
def test_material_aliases_resolve_to_expected_material(alias, expected_material):
    assert LLM3DMaterialChange(name=alias).name == expected_material


@pytest.mark.asyncio
@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample IFC not found")
async def test_chat_command_updates_output_ifc(tmp_path):
    input_ifc = _sample_with_editor_properties(tmp_path)
    output_ifc = tmp_path / f"{_SAMPLE_IFC.stem}_chat_command.ifc"
    log_path = tmp_path / f"{_SAMPLE_IFC.stem}_chat_command.json"

    records = await run_color_material_chat_commands(
        input_ifc,
        [_CHAT_COMMAND],
        output_ifc,
        log_path,
    )

    assert log_path.exists()
    assert all(record["preview_status"] == "preview_ready" for record in records)
    assert all(record["apply_status"] == "applied" for record in records)
    final_output_ifc = Path(str(records[-1]["final_output_ifc"]))
    assert final_output_ifc.exists()

    model = ifcopenshell.open(str(final_output_ifc))
    for record in records:
        changes = record["command"]["changes"]
        target_elements = _elements_by_ifc_type(
            model, record["command"]["target"]["element_type"]
        )
        changed_color = changes.get("color")
        changed_material = (changes.get("material") or {}).get("name")
        assert changed_color or changed_material
        if changed_color:
            color_elements = _elements_with_label(
                target_elements, "Color", changed_color
            )
            assert color_elements
            assert all(
                _has_rgb_color(_styled_colors(model, element), _rgb_from_color_value(changed_color))
                for element in color_elements
            )
        if changed_material:
            material_elements = _elements_with_label(
                target_elements, "Material", changed_material
            )
            assert material_elements
            assert all(
                changed_material in _material_names(element) for element in material_elements
            )


@pytest.mark.asyncio
@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample IFC not found")
async def test_chat_material_command_updates_output_ifc(tmp_path):
    input_ifc = _sample_with_editor_properties(tmp_path)
    output_ifc = tmp_path / f"{_SAMPLE_IFC.stem}_material_command.ifc"
    log_path = tmp_path / f"{_SAMPLE_IFC.stem}_material_command.json"

    [record] = await run_color_material_chat_commands(
        input_ifc,
        [_first_chat_material_command()],
        output_ifc,
        log_path,
    )

    assert log_path.exists()
    assert record["preview_status"] == "preview_ready"
    assert record["apply_status"] == "applied"
    assert output_ifc.exists()

    model = ifcopenshell.open(str(output_ifc))
    changed_material = (record["command"]["changes"].get("material") or {}).get("name")
    assert changed_material
    material_elements = _elements_with_label(
        model.by_type("IfcProduct"), "Material", changed_material
    )
    assert material_elements
    assert any(changed_material in _material_names(element) for element in material_elements)


if __name__ == "__main__":
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=_SAMPLE_IFC)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--log", type=Path)
    parser.add_argument(
        "--command",
        action="append",
        dest="commands",
        help="Chat command to run. Can be passed more than once.",
    )
    args = parser.parse_args()

    output = args.output or _OUT_DIR / f"{args.input.stem}_color_material_chat_{timestamp}.ifc"
    log = args.log or _OUT_DIR / f"{args.input.stem}_color_material_chat_{timestamp}.json"
    commands = args.commands or [_CHAT_COMMAND]
    result = asyncio.run(run_color_material_chat_commands(args.input, commands, output, log))
    print(json.dumps(result, ensure_ascii=False, indent=2))
