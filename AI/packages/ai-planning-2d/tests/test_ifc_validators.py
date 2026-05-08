from __future__ import annotations

from ai_planning_2d.validators.ifc import validate_ifc_output_context

from _fixtures.synthetic import make_minimal_ifc_context


def test_validate_ifc_output_context_accepts_minimal_valid_fixture() -> None:
    issues = validate_ifc_output_context(make_minimal_ifc_context())

    assert issues == []


def test_validate_ifc_output_context_flags_duplicate_wall_segments() -> None:
    context = make_minimal_ifc_context()
    context["walls"].append({**context["walls"][0], "id": "wall-duplicate"})

    issues = validate_ifc_output_context(context)

    assert any(issue.code == "duplicate_wall_segment" for issue in issues)


def test_validate_ifc_output_context_flags_orphan_filler() -> None:
    context = make_minimal_ifc_context()
    context["doors"][0]["host_wall_id"] = "missing-wall"

    issues = validate_ifc_output_context(context)

    assert any(issue.code == "orphan_filler_missing_host_wall" for issue in issues)


def test_validate_ifc_output_context_flags_position_outside_host_wall() -> None:
    context = make_minimal_ifc_context()
    context["doors"][0]["position"] = 9999

    issues = validate_ifc_output_context(context)

    assert any(issue.code == "opening_position_outside_host_wall" for issue in issues)
