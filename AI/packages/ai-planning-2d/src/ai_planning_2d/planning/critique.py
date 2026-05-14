"""생성된 평면 계획의 개선 포인트를 요약하고 피드백 문구로 정리한다."""

from __future__ import annotations

from typing import Literal, TypedDict

from ..command import IFCContext, SpaceContext

TOILET_KEYWORDS = ("화장실", "wc", "toilet", "restroom", "powder")
BATHROOM_KEYWORDS = ("욕실", "bath", "bathroom", "샤워")


class CritiqueSuggestion(TypedDict):
    kind: Literal["missing_toilet", "no_bathroom_on_floor"]
    severity: Literal["high"]
    floor: int
    anchor_room_id: str | None
    anchor_room_name: str | None
    summary: str
    rationale: str
    suggested_prompt: str


def recommend_floor_improvements(
    ifc_context: IFCContext,
    floor: int,
) -> list[CritiqueSuggestion]:
    """Return rule-based improvement suggestions for a target floor."""

    spaces = [space for space in ifc_context.get("spaces", []) if space.get("floor") == floor]
    if not spaces:
        return []

    bathroom = find_bathroom_anchor(spaces)
    if bathroom is None:
        return [
            {
                "kind": "no_bathroom_on_floor",
                "severity": "high",
                "floor": floor,
                "anchor_room_id": None,
                "anchor_room_name": None,
                "summary": f"{floor}층에는 욕실이나 별도 화장실이 없습니다.",
                "rationale": (
                    f"현재 {floor}층 평면에는 위생 공간이 전혀 없어서 "
                    "일상 동선과 사용성이 크게 떨어집니다. "
                    "이 경우에는 공용 동선에서 바로 접근 가능한 "
                    "공용 화장실을 먼저 확보하는 것이 가장 자연스럽습니다."
                ),
                "suggested_prompt": f"{floor}층에 공용 화장실 만들어줘.",
            }
        ]

    if has_toilet_room(spaces):
        return []

    return [
        {
            "kind": "missing_toilet",
            "severity": "high",
            "floor": floor,
            "anchor_room_id": bathroom["id"],
            "anchor_room_name": bathroom["name"],
            "summary": f"{floor}층에는 욕실은 있지만 별도 화장실이 없습니다.",
            "rationale": (
                f"현재 {floor}층에는 위생 공간 '{bathroom['name']}'은 있지만, "
                "욕실과 분리된 화장실이나 WC가 없어 공용 사용성이 떨어집니다."
            ),
            "suggested_prompt": f"{bathroom['name']} 옆에 화장실 만들어줘.",
        }
    ]


def summarize_floor_improvements(
    ifc_context: IFCContext,
    floor: int,
) -> str:
    suggestions = recommend_floor_improvements(ifc_context, floor)
    if not suggestions:
        return f"{floor}층 평면에서 큰 보완 사항은 보이지 않습니다."

    primary = suggestions[0]
    return (
        f"{primary['summary']} {primary['rationale']} "
        f"원하면 '{primary['suggested_prompt']}'처럼 바로 요청해서 수정 방향을 검토할 수 있습니다."
    )


def has_toilet_room(spaces: list[SpaceContext]) -> bool:
    return any(matches_keywords(space.get("name"), TOILET_KEYWORDS) for space in spaces)


def find_bathroom_anchor(spaces: list[SpaceContext]) -> SpaceContext | None:
    for space in spaces:
        if matches_keywords(space.get("name"), BATHROOM_KEYWORDS):
            return space
    for space in spaces:
        if space.get("type") == "bathroom":
            return space
    return None


def matches_keywords(name: str | None, keywords: tuple[str, ...]) -> bool:
    if not name:
        return False
    lowered = name.casefold()
    return any(keyword.casefold() in lowered for keyword in keywords)
