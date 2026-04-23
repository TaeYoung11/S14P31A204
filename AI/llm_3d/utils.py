from typing import Dict

# 층 이름 매핑 사전
STOREY_ALIAS: Dict[str, str] = {
    "b2": "B2", "b1": "B1",
    "지하2층": "B2", "지하2": "B2",
    "지하1층": "B1", "지하1": "B1",
    "1f": "1F", "1층": "1F", "level 1": "1F",
    "2f": "2F", "2층": "2F", "level 2": "2F",
    "3f": "3F", "3층": "3F", "level 3": "3F",
    "rf": "RF", "옥상": "RF", "옥상층": "RF", "옥탑": "RF", "루프": "RF",
}

def normalize_storey_name(storey: str) -> str:
    """사용자 입력 층 이름을 표준 IFC 층 이름(1F, B1 등)으로 정규화"""
    if not storey:
        return storey
    return STOREY_ALIAS.get(storey.strip().lower(), storey.upper())
