"""
test_fake_executor.py — CommandBatch → fake_executor → IFC 파일 E2E 검증 (11가지 시나리오)

IFC 스키마: IFC4 고정 (IFC2x3 미지원)

시나리오 목록:
  01. CREATE_SPACE rect — 1층에 침실 추가
  02. CREATE_SPACE L자 — 1층에 거실 추가
  03. CREATE_SPACE U자 — 2층에 서재 추가
  04. DELETE_SPACE     — 기존 공간(Living Room) 삭제
  05. UPDATE_SPACE     — rect 공간을 L자 6000x8000으로 리사이즈
  06. UPDATE_SPACE     — 치수만 변경 (width/height)
  07. 배치 (batch)     — CREATE 2개 + DELETE 1개를 한 번에 처리
  08. requires_clarification=True — 즉시 실패 반환, IFC 파일 미생성
  09. DELETE_SPACE 잘못된 target_id — failed_command_indices 확인
  10. UPDATE_SPACE 잘못된 target_id — failed_command_indices 확인
  11. IFC2x3 파일 입력 — IFC4 스키마 검증 실패 확인

샘플 IFC: AI/LLM_2D/.claude/batang_sample.ifc
  - Storeys: 1F (04B8lmwHP278bHp9vokefn), 2F (0kx47RPWT8NBDXHlCjFrx0), RF (2upBSvyVv1BPXqLep2f3mW)
  - Spaces:  Living Room (0_UdATTDH0iO1D2DsUJ52j), Bathroom (2AGLeTcBrB3gDCHgBu7zaj),
             Bedroom (0vFF0NQEv5Xv64$suj6fyC)
"""

from pathlib import Path

import ifcopenshell
import ifcopenshell.util.element
import pytest

from fake_executor import ExecutionResult, execute_batch

# ──────────────────────────────────────────────
# 공통 픽스처
# ──────────────────────────────────────────────

SAMPLE_IFC = Path(__file__).parent / ".claude" / "batang_sample.ifc"
SAMPLE_IFC_2X3 = Path(__file__).parent / ".claude" / "RE16_E3D_Building_2x3_Testversion.ifc"

STOREY_1F = "04B8lmwHP278bHp9vokefn"
STOREY_2F = "0kx47RPWT8NBDXHlCjFrx0"

SPACE_LIVING_ROOM = "0_UdATTDH0iO1D2DsUJ52j"
SPACE_BATHROOM = "2AGLeTcBrB3gDCHgBu7zaj"
SPACE_BEDROOM = "0vFF0NQEv5Xv64$suj6fyC"


@pytest.fixture()
def sample_ifc_path() -> Path:
    assert SAMPLE_IFC.exists(), f"샘플 IFC 파일이 없습니다: {SAMPLE_IFC}"
    return SAMPLE_IFC


def _load_ifc(path: Path) -> ifcopenshell.file:
    return ifcopenshell.open(str(path))


def _empty_batch(requires_clarification: bool = False, question: str | None = None) -> dict:
    return {
        "commands": [],
        "requires_clarification": requires_clarification,
        "clarification_question": question,
        "failed_command_indices": [],
    }


def _batch(*commands: dict) -> dict:
    return {
        "commands": list(commands),
        "requires_clarification": False,
        "clarification_question": None,
        "failed_command_indices": [],
    }


def _create_space_cmd(
    storey_id: str,
    name: str,
    space_type: str,
    shape: str,
    width: int,
    height: int,
    rects: list[dict],
) -> dict:
    return {
        "action": "create_space",
        "target_id": None,
        "params": {
            "entity_type": "Space",
            "metadata": {"storey_id": storey_id},
            "geometry": {
                "location": [0.0, 0.0, 0.0],
                "direction": [1.0, 0.0, 0.0],
                "dimensions": {"width": width, "height": height},
            },
            "properties": {"name": name, "type": space_type, "shape": shape, "rects": rects},
        },
        "confidence": 0.95,
        "reason": None,
    }


def _delete_space_cmd(target_id: str, storey_id: str, name: str) -> dict:
    return {
        "action": "delete_space",
        "target_id": target_id,
        "params": {
            "entity_type": "Space",
            "metadata": {"storey_id": storey_id},
            "properties": {"name": name},
        },
        "confidence": 0.95,
        "reason": None,
    }


def _update_space_cmd(
    target_id: str,
    storey_id: str,
    shape: str,
    width: int,
    height: int,
    rects: list[dict],
) -> dict:
    return {
        "action": "update_space",
        "target_id": target_id,
        "params": {
            "entity_type": "Space",
            "metadata": {"storey_id": storey_id},
            "geometry": {
                "location": [0.0, 0.0, 0.0],
                "direction": [1.0, 0.0, 0.0],
                "dimensions": {"width": width, "height": height},
            },
            "properties": {"shape": shape, "rects": rects},
        },
        "confidence": 0.95,
        "reason": None,
    }


# ──────────────────────────────────────────────
# 시나리오 01 — CREATE_SPACE rect (1층 침실 추가)
# ──────────────────────────────────────────────

def test_01_create_space_rect(sample_ifc_path: Path, tmp_path: Path) -> None:
    """1층에 rect 형태 침실(4000x5000)을 추가하면 IFC 공간이 1개 증가해야 한다."""
    output = tmp_path / "out.ifc"
    batch = _batch(
        _create_space_cmd(
            storey_id=STOREY_1F,
            name="침실2",
            space_type="bedroom",
            shape="rect",
            width=4000,
            height=5000,
            rects=[{"x": 0, "y": 0, "width": 4000, "height": 5000}],
        )
    )

    result = execute_batch(str(sample_ifc_path), str(output), batch)

    assert result.success
    assert result.failed_command_indices == []
    assert output.exists()

    ifc = _load_ifc(output)
    spaces = ifc.by_type("IfcSpace")
    assert len(spaces) == 4  # 기존 3 + 신규 1

    new_space = next(s for s in spaces if s.Name == "침실2")
    psets = ifcopenshell.util.element.get_psets(new_space)
    dims = psets["Batang_SpaceDimensions"]
    assert dims["Width"] == 4000
    assert dims["Height"] == 5000
    assert dims["Shape"] == "rect"


# ──────────────────────────────────────────────
# 시나리오 02 — CREATE_SPACE L자 (1층 거실 추가)
# ──────────────────────────────────────────────

def test_02_create_space_l_shape(sample_ifc_path: Path, tmp_path: Path) -> None:
    """L자 형태 거실(6000x8000)을 추가하면 rects에 2개 rect가 저장되어야 한다."""
    output = tmp_path / "out.ifc"
    rects = [
        {"x": 0, "y": 0, "width": 6000, "height": 4000},
        {"x": 0, "y": 4000, "width": 3000, "height": 4000},
    ]
    batch = _batch(
        _create_space_cmd(
            storey_id=STOREY_1F,
            name="거실",
            space_type="living",
            shape="L",
            width=6000,
            height=8000,
            rects=rects,
        )
    )

    result = execute_batch(str(sample_ifc_path), str(output), batch)

    assert result.success
    ifc = _load_ifc(output)
    new_space = next(s for s in ifc.by_type("IfcSpace") if s.Name == "거실")
    psets = ifcopenshell.util.element.get_psets(new_space)
    dims = psets["Batang_SpaceDimensions"]
    assert dims["Shape"] == "L"

    import json
    saved_rects = json.loads(dims["Rects"])
    assert len(saved_rects) == 2


# ──────────────────────────────────────────────
# 시나리오 03 — CREATE_SPACE U자 (2층 서재 추가)
# ──────────────────────────────────────────────

def test_03_create_space_u_shape_2f(sample_ifc_path: Path, tmp_path: Path) -> None:
    """2층에 U자 형태 서재(8000x6000)를 추가하면 해당 층에 공간이 생성되어야 한다."""
    output = tmp_path / "out.ifc"
    rects = [
        {"x": 0, "y": 0, "width": 2000, "height": 6000},
        {"x": 6000, "y": 0, "width": 2000, "height": 6000},
        {"x": 2000, "y": 0, "width": 4000, "height": 2000},
    ]
    batch = _batch(
        _create_space_cmd(
            storey_id=STOREY_2F,
            name="서재",
            space_type="office",
            shape="U",
            width=8000,
            height=6000,
            rects=rects,
        )
    )

    result = execute_batch(str(sample_ifc_path), str(output), batch)

    assert result.success
    ifc = _load_ifc(output)
    spaces = ifc.by_type("IfcSpace")
    assert len(spaces) == 4

    new_space = next(s for s in spaces if s.Name == "서재")
    psets = ifcopenshell.util.element.get_psets(new_space)
    assert psets["Batang_SpaceDimensions"]["Shape"] == "U"

    import json
    assert len(json.loads(psets["Batang_SpaceDimensions"]["Rects"])) == 3


# ──────────────────────────────────────────────
# 시나리오 04 — DELETE_SPACE (Living Room 삭제)
# ──────────────────────────────────────────────

def test_04_delete_space(sample_ifc_path: Path, tmp_path: Path) -> None:
    """Living Room을 삭제하면 공간 수가 2개로 줄어야 한다."""
    output = tmp_path / "out.ifc"
    batch = _batch(
        _delete_space_cmd(
            target_id=SPACE_LIVING_ROOM,
            storey_id=STOREY_1F,
            name="Living Room",
        )
    )

    result = execute_batch(str(sample_ifc_path), str(output), batch)

    assert result.success
    ifc = _load_ifc(output)
    spaces = ifc.by_type("IfcSpace")
    assert len(spaces) == 2
    assert all(s.GlobalId != SPACE_LIVING_ROOM for s in spaces)


# ──────────────────────────────────────────────
# 시나리오 05 — UPDATE_SPACE rect → L자 리사이즈
# ──────────────────────────────────────────────

def test_05_update_space_rect_to_l(sample_ifc_path: Path, tmp_path: Path) -> None:
    """Living Room을 L자 6000x8000으로 변경하면 Shape와 치수가 갱신되어야 한다."""
    output = tmp_path / "out.ifc"
    rects = [
        {"x": 0, "y": 0, "width": 6000, "height": 4000},
        {"x": 0, "y": 4000, "width": 3000, "height": 4000},
    ]
    batch = _batch(
        _update_space_cmd(
            target_id=SPACE_LIVING_ROOM,
            storey_id=STOREY_1F,
            shape="L",
            width=6000,
            height=8000,
            rects=rects,
        )
    )

    result = execute_batch(str(sample_ifc_path), str(output), batch)

    assert result.success
    ifc = _load_ifc(output)
    space = ifc.by_guid(SPACE_LIVING_ROOM)
    psets = ifcopenshell.util.element.get_psets(space)
    dims = psets["Batang_SpaceDimensions"]
    assert dims["Width"] == 6000
    assert dims["Height"] == 8000
    assert dims["Shape"] == "L"


# ──────────────────────────────────────────────
# 시나리오 06 — UPDATE_SPACE 치수만 변경
# ──────────────────────────────────────────────

def test_06_update_space_dimensions_only(sample_ifc_path: Path, tmp_path: Path) -> None:
    """Bathroom을 rect 3500x3500으로 치수 변경하면 Width/Height가 갱신되어야 한다."""
    output = tmp_path / "out.ifc"
    batch = _batch(
        _update_space_cmd(
            target_id=SPACE_BATHROOM,
            storey_id=STOREY_1F,
            shape="rect",
            width=3500,
            height=3500,
            rects=[{"x": 0, "y": 0, "width": 3500, "height": 3500}],
        )
    )

    result = execute_batch(str(sample_ifc_path), str(output), batch)

    assert result.success
    ifc = _load_ifc(output)
    space = ifc.by_guid(SPACE_BATHROOM)
    psets = ifcopenshell.util.element.get_psets(space)
    dims = psets["Batang_SpaceDimensions"]
    assert dims["Width"] == 3500
    assert dims["Height"] == 3500


# ──────────────────────────────────────────────
# 시나리오 07 — 배치: CREATE 2개 + DELETE 1개
# ──────────────────────────────────────────────

def test_07_batch_create_and_delete(sample_ifc_path: Path, tmp_path: Path) -> None:
    """CREATE 2개 + DELETE 1개를 한 번에 처리하면 총 공간 수가 4개(3-1+2)여야 한다."""
    output = tmp_path / "out.ifc"
    batch = _batch(
        _create_space_cmd(
            storey_id=STOREY_1F,
            name="주방",
            space_type="kitchen",
            shape="rect",
            width=3000,
            height=4000,
            rects=[{"x": 0, "y": 0, "width": 3000, "height": 4000}],
        ),
        _create_space_cmd(
            storey_id=STOREY_2F,
            name="드레스룸",
            space_type="other",
            shape="rect",
            width=2500,
            height=3000,
            rects=[{"x": 0, "y": 0, "width": 2500, "height": 3000}],
        ),
        _delete_space_cmd(
            target_id=SPACE_LIVING_ROOM,
            storey_id=STOREY_1F,
            name="Living Room",
        ),
    )

    result = execute_batch(str(sample_ifc_path), str(output), batch)

    assert result.success
    assert result.failed_command_indices == []
    ifc = _load_ifc(output)
    spaces = ifc.by_type("IfcSpace")
    assert len(spaces) == 4  # 3 - 1 + 2

    names = {s.Name for s in spaces}
    assert "주방" in names
    assert "드레스룸" in names
    assert "Living Room" not in names


# ──────────────────────────────────────────────
# 시나리오 08 — requires_clarification=True
# ──────────────────────────────────────────────

def test_08_requires_clarification(sample_ifc_path: Path, tmp_path: Path) -> None:
    """requires_clarification=True인 BatchCommand는 즉시 실패하고 IFC 파일을 생성하지 않아야 한다."""
    output = tmp_path / "out.ifc"
    batch = _empty_batch(
        requires_clarification=True,
        question="어떤 방을 어떻게 변경할까요?",
    )

    result = execute_batch(str(sample_ifc_path), str(output), batch)

    assert not result.success
    assert not output.exists()
    assert -1 in result.errors


# ──────────────────────────────────────────────
# 시나리오 09 — DELETE_SPACE 잘못된 target_id
# ──────────────────────────────────────────────

def test_09_delete_space_invalid_target(sample_ifc_path: Path, tmp_path: Path) -> None:
    """존재하지 않는 target_id로 DELETE_SPACE를 시도하면 failed_command_indices=[0]여야 한다."""
    output = tmp_path / "out.ifc"
    batch = _batch(
        _delete_space_cmd(
            target_id="INVALID_GUID_DOES_NOT_EXIST",
            storey_id=STOREY_1F,
            name="없는방",
        )
    )

    result = execute_batch(str(sample_ifc_path), str(output), batch)

    assert not result.success
    assert 0 in result.failed_command_indices
    assert 0 in result.errors


# ──────────────────────────────────────────────
# 시나리오 10 — UPDATE_SPACE 잘못된 target_id
# ──────────────────────────────────────────────

def test_10_update_space_invalid_target(sample_ifc_path: Path, tmp_path: Path) -> None:
    """존재하지 않는 target_id로 UPDATE_SPACE를 시도하면 failed_command_indices=[0]여야 한다."""
    output = tmp_path / "out.ifc"
    batch = _batch(
        _update_space_cmd(
            target_id="INVALID_GUID_DOES_NOT_EXIST",
            storey_id=STOREY_1F,
            shape="rect",
            width=4000,
            height=4000,
            rects=[{"x": 0, "y": 0, "width": 4000, "height": 4000}],
        )
    )

    result = execute_batch(str(sample_ifc_path), str(output), batch)

    assert not result.success
    assert 0 in result.failed_command_indices
    assert 0 in result.errors


# ──────────────────────────────────────────────
# 시나리오 11 — IFC2x3 파일 입력 → 스키마 검증 실패
# ──────────────────────────────────────────────

def test_11_ifc2x3_schema_rejected(tmp_path: Path) -> None:
    """IFC2x3 파일을 입력하면 스키마 검증에서 즉시 실패해야 한다. IFC4만 지원한다."""
    ifc2x3_path = SAMPLE_IFC_2X3
    assert ifc2x3_path.exists(), f"IFC2x3 샘플 파일이 없습니다: {ifc2x3_path}"

    output = tmp_path / "out.ifc"
    batch = _batch(
        _create_space_cmd(
            storey_id="any_storey_id",
            name="테스트방",
            space_type="bedroom",
            shape="rect",
            width=3000,
            height=4000,
            rects=[{"x": 0, "y": 0, "width": 3000, "height": 4000}],
        )
    )

    result = execute_batch(str(ifc2x3_path), str(output), batch)

    assert not result.success
    assert not output.exists()
    assert -1 in result.errors
    assert "IFC4" in result.errors[-1]
