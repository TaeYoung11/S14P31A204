"""PostEditValidator 단위 테스트.

실제 IFC 모델(sample_batang.ifc)을 사용하여 충돌/구조 위험 검증 로직을 검증한다.
"""

from __future__ import annotations

from pathlib import Path

import ifcopenshell
import pytest

from ai_authoring.post_validator import (
    PostEditValidator,
    PostValidationReport,
    ValidationIssue,
)

_IFC_PATH = Path(__file__).resolve().parents[3] / "tests" / "sample_batang.ifc"


@pytest.fixture()
def model() -> ifcopenshell.file:
    return ifcopenshell.open(str(_IFC_PATH))


# ── 기본 구조 ────────────────────────────────────────────────────────────────


def test_report_is_dataclass(model: ifcopenshell.file) -> None:
    """validate() 가 PostValidationReport 를 반환한다."""
    validator = PostEditValidator(model)
    report = validator.validate(op_results=[], engine_req={"operations": []})
    assert isinstance(report, PostValidationReport)


def test_empty_ops_pass(model: ifcopenshell.file) -> None:
    """적용된 오퍼레이션이 없으면 passed=True, 이슈 없음."""
    validator = PostEditValidator(model)
    report = validator.validate(op_results=[], engine_req={"operations": []})
    assert report.passed is True
    assert report.issues == []
    assert report.checked_element_count == 0


def test_rejected_ops_skipped(model: ifcopenshell.file) -> None:
    """status=rejected 오퍼레이션은 검증 대상에서 제외된다."""
    op_results = [
        {
            "operation_id": "op-1",
            "operation_type": "create_element",
            "status": "rejected",
            "target_count": 0,
            "matched_elements": [],
            "issues": [],
        }
    ]
    engine_req = {
        "operations": [
            {"id": "op-1", "type": "create_element", "selector": {}, "parameters": {}}
        ]
    }
    validator = PostEditValidator(model)
    report = validator.validate(op_results, engine_req)
    assert report.checked_element_count == 0


# ── DELETE 구조 위험 ─────────────────────────────────────────────────────────


def test_delete_load_bearing_wall_raises_warning(model: ifcopenshell.file) -> None:
    """내력벽 이름을 가진 IfcWall 삭제 시 STRUCTURAL_RISK warning 이 발생한다."""
    op_results = [
        {
            "operation_id": "op-del",
            "operation_type": "delete_elements",
            "status": "applied",
            "target_count": 1,
            "matched_elements": [
                {
                    "global_id": "FAKE_GUID_000000000001",
                    "element_type": "IfcWall",
                    "name": "내력벽-01",
                }
            ],
            "issues": [],
        }
    ]
    engine_req = {
        "operations": [
            {
                "id": "op-del",
                "type": "delete_elements",
                "selector": {"element_type": "IfcWall"},
                "parameters": {},
            }
        ]
    }
    validator = PostEditValidator(model)
    report = validator.validate(op_results, engine_req)

    structural_issues = [i for i in report.issues if i.code == "STRUCTURAL_RISK"]
    assert len(structural_issues) >= 1
    issue = structural_issues[0]
    assert issue.severity == "warning"
    assert issue.operation_id == "op-del"


def test_delete_non_structural_wall_no_warning(model: ifcopenshell.file) -> None:
    """일반 IfcWall 삭제 시 STRUCTURAL_RISK 이슈가 없다."""
    op_results = [
        {
            "operation_id": "op-del",
            "operation_type": "delete_elements",
            "status": "applied",
            "target_count": 1,
            "matched_elements": [
                {
                    "global_id": "FAKE_GUID_000000000002",
                    "element_type": "IfcWall",
                    "name": "일반벽-01",
                }
            ],
            "issues": [],
        }
    ]
    engine_req = {
        "operations": [
            {
                "id": "op-del",
                "type": "delete_elements",
                "selector": {},
                "parameters": {},
            }
        ]
    }
    validator = PostEditValidator(model)
    report = validator.validate(op_results, engine_req)

    structural_issues = [i for i in report.issues if i.code == "STRUCTURAL_RISK"]
    assert structural_issues == []


def test_delete_non_wall_no_structural_risk(model: ifcopenshell.file) -> None:
    """IfcDoor 삭제는 STRUCTURAL_RISK 를 생성하지 않는다."""
    op_results = [
        {
            "operation_id": "op-del-door",
            "operation_type": "delete_elements",
            "status": "applied",
            "target_count": 1,
            "matched_elements": [
                {
                    "global_id": "FAKE_GUID_000000000003",
                    "element_type": "IfcDoor",
                    "name": "구조문",
                }
            ],
            "issues": [],
        }
    ]
    engine_req = {"operations": [{"id": "op-del-door", "type": "delete_elements"}]}
    validator = PostEditValidator(model)
    report = validator.validate(op_results, engine_req)

    assert all(i.code != "STRUCTURAL_RISK" for i in report.issues)


# ── CREATE 충돌 ──────────────────────────────────────────────────────────────


def test_create_collision_message_excludes_self(model: ifcopenshell.file) -> None:
    """충돌 이슈 메시지에 대상 요소 자신의 GUID 가 충돌 상대로 포함되지 않는다."""
    walls = list(model.by_type("IfcWall")) + list(model.by_type("IfcWallStandardCase"))
    if not walls:
        pytest.skip("샘플 IFC에 IfcWall 없음")

    wall = walls[0]
    op_results = [
        {
            "operation_id": "op-create",
            "operation_type": "create_element",
            "status": "applied",
            "target_count": 1,
            "matched_elements": [
                {
                    "global_id": wall.GlobalId,
                    "element_type": wall.is_a(),
                    "name": wall.Name,
                }
            ],
            "issues": [],
        }
    ]
    engine_req = {"operations": [{"id": "op-create", "type": "create_element"}]}

    validator = PostEditValidator(model)
    report = validator.validate(op_results, engine_req)

    # 충돌 이슈가 있더라도, 대상 요소의 GUID 가 충돌 상대(메시지)로 포함되면 안 됨
    short_gid = wall.GlobalId[:8]
    for issue in report.issues:
        if issue.code == "COLLISION" and issue.element_global_id == wall.GlobalId:
            # 메시지에서 충돌 상대 GUID 부분만 추출
            # 메시지 형식: "[충돌] 신규 TYPE(SELF_GID)가 OTHER_TYPE(OTHER_GID)와 겹칩니다."
            assert short_gid not in issue.message.split("가 ")[1], (
                f"자기 자신 GUID 가 충돌 상대로 표시됨: {issue.message}"
            )


# ── to_dict ──────────────────────────────────────────────────────────────────


def test_report_to_dict_structure(model: ifcopenshell.file) -> None:
    """to_dict() 가 필수 키를 모두 포함하는지 확인한다."""
    validator = PostEditValidator(model)
    report = validator.validate(op_results=[], engine_req={"operations": []})
    d = report.to_dict()

    assert "passed" in d
    assert "checked_element_count" in d
    assert "collision_count" in d
    assert "structural_risk_count" in d
    assert "issues" in d
    assert isinstance(d["issues"], list)


def test_issue_to_dict_fields(model: ifcopenshell.file) -> None:
    """이슈가 있을 때 to_dict() 의 issues 항목이 올바른 필드를 가진다."""
    op_results = [
        {
            "operation_id": "op-x",
            "operation_type": "delete_elements",
            "status": "applied",
            "target_count": 1,
            "matched_elements": [
                {
                    "global_id": "FAKE_GUID_STRUCT",
                    "element_type": "IfcWall",
                    "name": "structural wall",
                }
            ],
            "issues": [],
        }
    ]
    engine_req = {"operations": [{"id": "op-x", "type": "delete_elements"}]}
    validator = PostEditValidator(model)
    report = validator.validate(op_results, engine_req)

    issues_with_risk = [i for i in report.issues if i.code == "STRUCTURAL_RISK"]
    if not issues_with_risk:
        pytest.skip("구조 위험 이슈 없음 — 내력벽 키워드 매칭 안됨")

    d = report.to_dict()
    issue_dict = d["issues"][0]
    for key in ("operation_id", "element_global_id", "element_type", "code", "severity", "message"):
        assert key in issue_dict, f"to_dict() 이슈에 '{key}' 필드 누락"


# ── ValidationIssue 직접 생성 ────────────────────────────────────────────────


def test_validation_issue_fields() -> None:
    """ValidationIssue 데이터클래스가 올바른 필드를 가진다."""
    issue = ValidationIssue(
        operation_id="op-1",
        element_global_id="GUID-001",
        element_type="IfcWall",
        code="COLLISION",
        severity="error",
        message="테스트 충돌 메시지",
    )
    assert issue.operation_id == "op-1"
    assert issue.code == "COLLISION"
    assert issue.severity == "error"
