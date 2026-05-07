"""IfcDoor/IfcWindow 개구부 및 호스트 벽 관계 생성 테스트"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.root
import pytest

from ai_authoring.engine_3d import (
    create_door_with_opening,
    create_wall,
    create_window_with_opening,
    delete_element,
    find_host_wall,
)
from ai_authoring.operations.registry import get
import ai_authoring.operations  # noqa: F401


def _make_model():
    model = ifcopenshell.file(schema="IFC4")
    project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name="Project")
    site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="1F")
    storey.Elevation = 0.0

    # create_wall/_box_representation이 Body SubContext를 필요로 함
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

    ifcopenshell.api.aggregate.assign_object(model, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(model, products=[building], relating_object=site)
    ifcopenshell.api.aggregate.assign_object(model, products=[storey], relating_object=building)
    return model, storey


# ── find_host_wall ────────────────────────────────────────────────────────────

def test_find_host_wall_by_global_id():
    model, storey = _make_model()
    wall = create_wall(
        model, storey, length_mm=3000, width_mm=200, height_mm=2400, x_mm=0, y_mm=0, z_mm=0
    )
    assert wall is not None

    found = find_host_wall(model, wall.GlobalId, 0.0, 0.0, 0.0)
    assert found is not None
    assert found.GlobalId == wall.GlobalId


def test_find_host_wall_by_proximity():
    model, storey = _make_model()
    wall = create_wall(
        model, storey, length_mm=3000, width_mm=200, height_mm=2400, x_mm=100, y_mm=100, z_mm=0
    )
    assert wall is not None

    found = find_host_wall(model, None, 100.0, 100.0, 0.0)
    assert found is not None
    assert found.GlobalId == wall.GlobalId


def test_find_host_wall_invalid_global_id_falls_back_to_proximity():
    model, storey = _make_model()
    wall = create_wall(
        model, storey, length_mm=3000, width_mm=200, height_mm=2400, x_mm=0, y_mm=0, z_mm=0
    )
    assert wall is not None

    found = find_host_wall(model, "0000000000000000000000", 0.0, 0.0, 0.0)
    assert found is not None
    assert found.GlobalId == wall.GlobalId


def test_find_host_wall_returns_none_when_too_far():
    model, storey = _make_model()
    create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400, x_mm=0, y_mm=0, z_mm=0)

    found = find_host_wall(model, None, 99999.0, 99999.0, 0.0)
    assert found is None


def test_find_host_wall_returns_none_when_no_walls():
    model, _ = _make_model()
    found = find_host_wall(model, None, 0.0, 0.0, 0.0)
    assert found is None


# ── create_door_with_opening ──────────────────────────────────────────────────

def test_door_creates_opening_and_relations_with_host_wall():
    model, storey = _make_model()
    wall = create_wall(
        model, storey, length_mm=3000, width_mm=200, height_mm=2400, x_mm=0, y_mm=0, z_mm=0
    )
    assert wall is not None

    door = create_door_with_opening(
        model, storey,
        length_mm=900, width_mm=200, height_mm=2100,
        x_mm=500, y_mm=0, z_mm=0,
        host_wall=wall,
        sill_height_mm=0.0,
    )

    assert door is not None
    assert door.is_a("IfcDoor")

    # IfcOpeningElement 생성 확인
    openings = model.by_type("IfcOpeningElement")
    assert len(openings) == 1

    # IfcRelVoidsElement: 벽 → 개구부
    assert len(list(getattr(wall, "HasOpenings", []))) == 1
    rel_void = list(wall.HasOpenings)[0]
    assert rel_void.is_a("IfcRelVoidsElement")
    assert rel_void.RelatedOpeningElement == openings[0]

    # IfcRelFillsElement: 개구부 → 문
    opening = openings[0]
    assert len(list(getattr(opening, "HasFillings", []))) == 1
    rel_fill = list(opening.HasFillings)[0]
    assert rel_fill.is_a("IfcRelFillsElement")
    assert rel_fill.RelatedBuildingElement == door


def test_door_without_host_wall_is_created_as_box():
    model, storey = _make_model()

    door = create_door_with_opening(
        model, storey,
        length_mm=900, width_mm=200, height_mm=2100,
        x_mm=0, y_mm=0, z_mm=0,
        host_wall=None,
    )

    assert door is not None
    assert door.is_a("IfcDoor")
    assert len(model.by_type("IfcOpeningElement")) == 0
    assert len(model.by_type("IfcRelVoidsElement")) == 0
    assert len(model.by_type("IfcRelFillsElement")) == 0


def test_door_storey_containment():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)

    door = create_door_with_opening(model, storey, host_wall=wall)
    assert door is not None

    contained = {
        e
        for rel in storey.ContainsElements
        for e in rel.RelatedElements
    }
    assert door in contained


# ── create_window_with_opening ────────────────────────────────────────────────

def test_window_creates_opening_and_relations_with_host_wall():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    assert wall is not None

    window = create_window_with_opening(
        model, storey,
        length_mm=1200, width_mm=200, height_mm=1200,
        x_mm=1000, y_mm=0, z_mm=0,
        host_wall=wall,
        sill_height_mm=900.0,
    )

    assert window is not None
    assert window.is_a("IfcWindow")

    openings = model.by_type("IfcOpeningElement")
    assert len(openings) == 1

    assert len(list(getattr(wall, "HasOpenings", []))) == 1
    rel_void = list(wall.HasOpenings)[0]
    assert rel_void.RelatedOpeningElement == openings[0]

    opening = openings[0]
    assert len(list(getattr(opening, "HasFillings", []))) == 1
    rel_fill = list(opening.HasFillings)[0]
    assert rel_fill.RelatedBuildingElement == window


def test_window_without_host_wall_is_created_as_box():
    model, storey = _make_model()

    window = create_window_with_opening(model, storey, host_wall=None)

    assert window is not None
    assert window.is_a("IfcWindow")
    assert len(model.by_type("IfcOpeningElement")) == 0


def test_window_sill_height_applied_in_placement():
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)

    window = create_window_with_opening(
        model, storey,
        host_wall=wall,
        sill_height_mm=900.0,
    )
    assert window is not None

    # window placement는 opening 기준 상대 위치 — z=900mm
    rel = window.ObjectPlacement.RelativePlacement
    z_coord = float(rel.Location.Coordinates[2])
    assert z_coord == pytest.approx(900.0)


# ── create_element handler 통합 ───────────────────────────────────────────────

def test_create_element_handler_door_with_host_wall():
    model, storey = _make_model()
    wall = create_wall(
        model, storey, length_mm=3000, width_mm=200, height_mm=2400, x_mm=0, y_mm=0, z_mm=0
    )
    assert wall is not None

    handler = get("create_element")
    door = handler.execute(
        model,
        storey,
        {
            "element_type": "IfcDoor",
            "storey": "1F",
            "coordinate_space": "PROJECT_ABSOLUTE_MM",
            "start_mm": {"x": 500.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"length": 900, "width": 200, "height": 2100},
            "host_wall_global_id": wall.GlobalId,
            "sill_height_mm": 0.0,
        },
    )

    assert door is not None
    assert door.is_a("IfcDoor")
    assert len(model.by_type("IfcOpeningElement")) == 1
    assert len(list(getattr(wall, "HasOpenings", []))) == 1


def test_create_element_handler_window_default_sill():
    model, storey = _make_model()
    wall = create_wall(
        model, storey, length_mm=3000, width_mm=200, height_mm=2400, x_mm=0, y_mm=0, z_mm=0
    )
    assert wall is not None

    handler = get("create_element")
    # [Cleanup] Remove existing doors, windows, and openings to avoid overlapping
    for cls in ["IfcDoor", "IfcWindow", "IfcOpeningElement"]:
        for el in model.by_type(cls):
            delete_element(model, el)
    
    # [Fix] Also reset wall representations if they have booleans to start fresh
    for wall in model.by_type("IfcWall"):
        if wall.Representation:
            for rep in wall.Representation.Representations:
                if rep.RepresentationIdentifier == "Body":
                    # If it's a BooleanResult, try to revert to the first operand (original box)
                    if rep.Items and rep.Items[0].is_a("IfcBooleanResult"):
                        item = rep.Items[0]
                        while item.is_a("IfcBooleanResult"):
                            item = item.FirstOperand
                        rep.Items = [item]
                        rep.RepresentationType = "SweptSolid"

    # [Test Elements] 16 Doors and Windows
    window = handler.execute(
        model,
        storey,
        {
            "element_type": "IfcWindow",
            "storey": "1F",
            "coordinate_space": "PROJECT_ABSOLUTE_MM",
            "start_mm": {"x": 1000.0, "y": 0.0, "z": 0.0},
            "dimensions_mm": {"length": 1200, "width": 200, "height": 1200},
            "host_wall_global_id": wall.GlobalId,
        },
    )

    assert window is not None
    assert window.is_a("IfcWindow")
    assert len(model.by_type("IfcOpeningElement")) == 1

    # sill_height_mm 미지정 시 기본값 900mm 적용
    rel = window.ObjectPlacement.RelativePlacement
    z_coord = float(rel.Location.Coordinates[2])
    assert z_coord == pytest.approx(900.0)


def test_ifc_persists_relations_after_save(tmp_path):
    model, storey = _make_model()
    wall = create_wall(model, storey, length_mm=3000, width_mm=200, height_mm=2400)
    door = create_door_with_opening(model, storey, host_wall=wall)
    assert door is not None

    out = tmp_path / "out.ifc"
    model.write(str(out))

    reloaded = ifcopenshell.open(str(out))
    walls = reloaded.by_type("IfcWall")
    assert len(walls) == 1
    reloaded_wall = walls[0]

    assert len(list(getattr(reloaded_wall, "HasOpenings", []))) == 1
    opening = list(reloaded_wall.HasOpenings)[0].RelatedOpeningElement
    assert opening is not None
    assert len(list(getattr(opening, "HasFillings", []))) == 1
    filling = list(opening.HasFillings)[0].RelatedBuildingElement
    assert filling.is_a("IfcDoor")


# ── e2e: sample_shinchan.ifc에 문/창문 다수 추가 ─────────────────────────────

_AI_ROOT = Path(__file__).resolve().parents[3]   # AI/
_SAMPLE_IFC = _AI_ROOT / "tests" / "sample_shinchan.ifc"
_OUT_DIR = Path.home() / "Downloads" / "batang_history"

# (storey_name, wall_name, is_door, x, y, z, direction, w_mm, h_mm, sill_mm, color, label)
_SCENARIOS = [
    # fmt: off
    # (storey, wall_name, is_door, x, y, z, dir, w, h, sill, color, label)
    # x, y, z 는 모델 절대(world) mm 좌표. 벽 기준점: 1F=400mm, 2F=3600mm.
    # ── 1F 문 ────────────────────────────────────────────────────────────────
    ("1F", "1F_Anbang_South", True,  3500,  6000,  400, "north",  900, 2100,   0, "#8B4513", "안방 문"),  # noqa: E501
    ("1F", "1F_Living_South", True,  7500,  3000,  400, "north",  900, 2100,   0, "#A0522D", "거실 남쪽 문"),  # noqa: E501
    ("1F", "1F_Hall_South",   True, 11000,  4000,  400, "north", 1000, 2100,   0, "#5C3317", "현관문"),  # noqa: E501
    ("1F", "1F_In_Entrance",  True, 11500,  6000,  400, "north",  800, 2100,   0, "#6B4226", "현관-거실 연결문"),  # noqa: E501
    # ── 1F 창문 ──────────────────────────────────────────────────────────────
    ("1F", "1F_North_All",   False,  3000,  9800,  400, "north", 1200, 1200, 900, "#ADD8E6", "북측 창문 1"),  # noqa: E501
    ("1F", "1F_North_All",   False,  6000,  9800,  400, "north", 1200, 1200, 900, "#ADD8E6", "북측 창문 2"),  # noqa: E501
    ("1F", "1F_North_All",   False,  9000,  9800,  400, "north", 1200, 1200, 900, "#ADD8E6", "북측 창문 3"),  # noqa: E501
    ("1F", "1F_Hall_East",   False, 12800,  5500,  400,  "east", 1000, 1000, 900, "#87CEEB", "홀 동쪽 창문"),  # noqa: E501
    ("1F", "1F_Anbang_West", False,  2000,  7500,  400,  "west", 1200, 1200, 900, "#B0E0E6", "안방 서쪽 창문"),  # noqa: E501
    ("1F", "1F_Living_East", False,  9800,  3500,  400,  "east", 1000, 1000, 900, "#87CEEB", "거실 동쪽 창문"),  # noqa: E501
    # ── 2F 문 ────────────────────────────────────────────────────────────────
    ("2F", "2F_Ext_S",       True,  9500,  5000, 3600, "north", 1200, 2100,   0, "#CD853F", "2F 발코니 문"),  # noqa: E501
    ("2F", "2F_In_Room_Div", True,  8500,  7000, 3600, "north",  900, 2100,   0, "#A0522D", "2F 방 칸막이 문"),  # noqa: E501
    # ── 2F 창문 ──────────────────────────────────────────────────────────────
    ("2F", "2F_Ext_W",       False, 7000,  6500, 3600,  "west", 1200, 1200, 900, "#ADD8E6", "2F 서쪽 창문 1"),  # noqa: E501
    ("2F", "2F_Ext_W",       False, 7000,  8500, 3600,  "west", 1200, 1200, 900, "#ADD8E6", "2F 서쪽 창문 2"),  # noqa: E501
    ("2F", "2F_Ext_N",       False, 9000,  9800, 3600, "north", 1500, 1200, 900, "#87CEEB", "2F 북쪽 창문"),  # noqa: E501
    ("2F", "2F_Ext_E",       False, 12800, 7000, 3600,  "east", 1200, 1200, 900, "#B0E0E6", "2F 동쪽 창문"),  # noqa: E501
    # fmt: on
]


def _build_door_window_sample(ifc_out: Path, log_out: Path) -> dict:
    """sample_shinchan.ifc에 문/창문을 다수 추가해 ifc_out에 저장하고 log_out에 로그 기록."""
    model = ifcopenshell.open(str(_SAMPLE_IFC))
    wall_map = {w.Name: w for w in model.by_type("IfcWall")}
    storey_map = {s.Name: s for s in model.by_type("IfcBuildingStorey")}

    lines: list[str] = [f"=== 짱구집 문/창문 개구부 생성 [{datetime.now().isoformat()}] ===", ""]
    ok, fail = 0, 0

    for st_name, w_name, is_door, x, y, z, direction, w, h, sill, color, label in _SCENARIOS:
        storey = storey_map.get(st_name)
        if storey is None:
            msg = f"  [SKIP] storey '{st_name}' 없음 — {label}"
            print(msg)
            lines.append(msg)
            fail += 1
            continue

        named_wall = wall_map.get(w_name)
        host_wall = find_host_wall(model, named_wall.GlobalId if named_wall else None, x, y, z)

        fn = create_door_with_opening if is_door else create_window_with_opening
        el = fn(
            model, storey,
            length_mm=w, width_mm=200, height_mm=h,
            x_mm=x, y_mm=y, z_mm=z,
            direction=direction,
            color=color,
            host_wall=host_wall,
            sill_height_mm=sill,
        )
        kind = "문" if is_door else "창문"
        host_info = host_wall.Name if host_wall else "없음"
        if el:
            msg = f"  [OK] {label} ({kind}) @ ({x}, {y}, z={z}mm) host={host_info}"
            print(msg)
            lines.append(msg)
            ok += 1
        else:
            msg = f"  [FAIL] {label} ({kind}) 생성 실패"
            print(msg)
            lines.append(msg)
            fail += 1

    ifc_out.parent.mkdir(parents=True, exist_ok=True)
    model.write(str(ifc_out))

    for line in [
        "",
        f"[완료] {ok}개 성공 / {fail}개 실패",
        f"[IFC] {ifc_out}",
        f"[LOG] {log_out}",
    ]:
        print(line)
        lines.append(line)

    log_out.parent.mkdir(parents=True, exist_ok=True)
    log_out.write_text("\n".join(lines), encoding="utf-8")

    return {
        "doors": len(model.by_type("IfcDoor")),
        "windows": len(model.by_type("IfcWindow")),
        "openings": len(model.by_type("IfcOpeningElement")),
    }


@pytest.mark.skipif(not _SAMPLE_IFC.exists(), reason="sample_shinchan.ifc 없음")
def test_e2e_door_window_on_shinchan_ifc(tmp_path):
    out_ifc = tmp_path / "shinchan_with_openings.ifc"
    out_log = tmp_path / "shinchan_with_openings.log"
    stats = _build_door_window_sample(out_ifc, out_log)

    assert stats["doors"] >= 4
    assert stats["windows"] >= 6
    assert stats["openings"] >= stats["doors"] + stats["windows"]


if __name__ == "__main__":
    if not _SAMPLE_IFC.exists():
        print(f"[ERROR] 샘플 IFC 없음: {_SAMPLE_IFC}")
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        _build_door_window_sample(
            ifc_out=_OUT_DIR / f"shinchan_openings_{ts}.ifc",
            log_out=_OUT_DIR / f"shinchan_openings_{ts}.log",
        )
