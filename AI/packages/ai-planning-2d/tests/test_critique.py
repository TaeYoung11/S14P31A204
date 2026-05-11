from pathlib import Path

from ai_planning_2d import extract_ifc_context
from ai_planning_2d.critique import (
    recommend_floor_improvements,
    summarize_floor_improvements,
)
from ai_planning_2d.toilet_demo import plan_toilet_near_bathroom


def _ifc_context_with_spaces(spaces: list[dict], adjacency: list[dict] | None = None) -> dict:
    return {
        "spaces": spaces,
        "adjacency": adjacency or [],
        "walls": [],
        "doors": [],
        "windows": [],
        "boundaries": [],
        "storeys": [],
    }


def _space(
    space_id: str,
    name: str,
    space_type: str,
    floor: int,
    *,
    width: int = 2000,
    height: int = 2000,
) -> dict:
    return {
        "id": space_id,
        "name": name,
        "type": space_type,
        "floor": floor,
        "polygon": [
            (0.0, 0.0),
            (float(width), 0.0),
            (float(width), float(height)),
            (0.0, float(height)),
        ],
        "width": width,
        "height": height,
        "x": 0.0,
        "y": 0.0,
        "angle": 0.0,
        "locked": False,
        "zone_id": None,
    }


def test_recommend_floor_improvements_flags_missing_toilet_near_bathroom():
    ifc_context = _ifc_context_with_spaces(
        [
            _space("space-bath", "욕실", "bathroom", 1),
            _space("space-living", "거실", "living", 1, width=4000, height=4000),
        ]
    )

    suggestions = recommend_floor_improvements(ifc_context, floor=1)

    assert len(suggestions) == 1
    suggestion = suggestions[0]
    assert suggestion["kind"] == "missing_toilet"
    assert suggestion["anchor_room_name"] == "욕실"
    assert suggestion["suggested_prompt"] == "욕실 옆에 화장실 만들어줘."


def test_recommend_floor_improvements_returns_empty_when_toilet_exists():
    ifc_context = _ifc_context_with_spaces(
        [
            _space("space-bath", "욕실", "bathroom", 1),
            _space("space-wc", "화장실", "bathroom", 1, width=1200, height=1800),
        ]
    )

    assert recommend_floor_improvements(ifc_context, floor=1) == []


def test_recommend_floor_improvements_flags_missing_bathroom_on_floor():
    ifc_context = _ifc_context_with_spaces(
        [
            _space("space-living", "거실", "living", 1, width=4000, height=4000),
            _space("space-kitchen", "주방", "kitchen", 1, width=3000, height=3000),
        ]
    )

    suggestions = recommend_floor_improvements(ifc_context, floor=1)

    assert len(suggestions) == 1
    suggestion = suggestions[0]
    assert suggestion["kind"] == "no_bathroom_on_floor"
    assert suggestion["anchor_room_id"] is None
    assert suggestion["suggested_prompt"] == "1층에 공용 화장실 만들어줘."


def test_summarize_floor_improvements_mentions_followup_prompt():
    ifc_context = _ifc_context_with_spaces(
        [
            _space("space-bath", "욕실", "bathroom", 1),
        ]
    )

    summary = summarize_floor_improvements(ifc_context, floor=1)

    assert "별도 화장실이 없습니다." in summary
    assert "욕실 옆에 화장실 만들어줘." in summary


def test_critique_and_planner_use_same_anchor_room():
    house_kr = Path(__file__).resolve().parents[3] / "scripts" / "House_KR.ifc"
    ifc_context = extract_ifc_context(str(house_kr))

    suggestion = recommend_floor_improvements(ifc_context, floor=1)[0]
    plan = plan_toilet_near_bathroom(
        ifc_context,
        floor=1,
        anchor_room_name=suggestion["anchor_room_name"],
    )

    assert plan is not None
    assert plan["anchor_room_id"] == suggestion["anchor_room_id"]
    assert plan["anchor_room_name"] == suggestion["anchor_room_name"]


def test_no_bathroom_fixture_recommends_public_toilet():
    fixture = Path(__file__).resolve().parents[3] / "scripts" / "House_KR_nobathroom.ifc"
    ifc_context = extract_ifc_context(str(fixture))

    suggestions = recommend_floor_improvements(ifc_context, floor=1)

    assert len(suggestions) == 1
    assert suggestions[0]["kind"] == "no_bathroom_on_floor"
    assert suggestions[0]["suggested_prompt"] == "1층에 공용 화장실 만들어줘."
