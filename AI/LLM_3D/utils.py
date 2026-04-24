from typing import Dict, Optional

# ── 층 이름 매핑 ──────────────────────────────────────────────────────────────
STOREY_ALIAS: Dict[str, str] = {
    "b2": "B2", "b1": "B1",
    "지하2층": "B2", "지하2": "B2",
    "지하1층": "B1", "지하1": "B1",
    "1f": "1F", "1층": "1F", "level 1": "1F",
    "2f": "2F", "2층": "2F", "level 2": "2F",
    "3f": "3F", "3층": "3F", "level 3": "3F",
    "rf": "RF", "옥상": "RF", "옥상층": "RF", "옥탑": "RF", "루프": "RF",
    # LLM(qwen2.5) 중국어 hallucination 방어
    "屋顶层": "RF", "屋顶": "RF", "屋上": "RF", "顶层": "RF",
    "一层": "1F", "一楼": "1F",
    "二层": "2F", "二楼": "2F",
    "三层": "3F", "三楼": "3F",
    "地下一层": "B1", "地下二层": "B2",
}

def normalize_storey_name(storey: str) -> str:
    """사용자 입력 층 이름을 표준 IFC 층 이름(1F, B1 등)으로 정규화"""
    if not storey:
        return storey
    # 한국어/영어는 소문자 키로, 중국어는 원문 그대로 먼저 체크
    direct = STOREY_ALIAS.get(storey.strip())
    if direct:
        return direct
    return STOREY_ALIAS.get(storey.strip().lower(), storey.upper())


# ── 공간 이름 매핑 (한국어 → 영어 IFC 공간명) ─────────────────────────────────
SPACE_ALIAS: Dict[str, str] = {
    # 거실
    "거실": "Living Room", "리빙룸": "Living Room", "living room": "Living Room",
    # 침실 / 안방
    "안방": "Bedroom", "침실": "Bedroom", "마스터룸": "Bedroom", "bedroom": "Bedroom",
    # 화장실 / 욕실
    "화장실": "Bathroom", "욕실": "Bathroom", "변기실": "Bathroom",
    "bathroom": "Bathroom", "toilet": "Bathroom", "restroom": "Bathroom",
    # 주방
    "주방": "Kitchen", "키친": "Kitchen", "부엌": "Kitchen", "kitchen": "Kitchen",
    # 현관
    "현관": "Entrance", "entrance": "Entrance", "foyer": "Entrance",
    # 복도
    "복도": "Corridor", "hallway": "Corridor", "corridor": "Corridor",
    # 옥상
    "옥상": "Roof", "루프": "Roof", "roof": "Roof",
}

def normalize_space_name(space: Optional[str]) -> Optional[str]:
    """
    한국어 공간명을 IFC 영문 공간명으로 변환.
    LLM 규칙 위반(한국어 출력) 방어용 레이어.
    알 수 없는 이름은 원본 그대로 반환.
    """
    if not space:
        return space
    key = space.strip().lower()
    return SPACE_ALIAS.get(key, space)

