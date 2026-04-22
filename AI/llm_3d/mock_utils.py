import uuid
from typing import Any, Dict, Optional
try:
    from .command import LLM3DElementType
except ImportError:
    from command import LLM3DElementType

def generate_mock_element(
    global_id: Optional[str] = None,
    element_type: Optional[LLM3DElementType] = None,
    storey: str = "1F",
    name: str = "MockElement",
    tag: Optional[str] = None,
) -> Dict[str, Any]:
    """테스트를 위한 가짜(Mock) IFC 요소 데이터 생성"""
    return {
        "global_id":    global_id or f"MOCK{uuid.uuid4().hex[:19].upper()}",
        "name":         name,
        "element_type": (element_type.value if element_type else "IfcWall"),
        "storey":       storey,
        "tag":          tag,
        "dims": {
            "height_mm": 2400.0,
            "length_mm": 600.0,
            "width_mm":    400.0,
        },
    }
