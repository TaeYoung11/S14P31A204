from pydantic import BaseModel, Field
from typing import Optional, Literal

class RenderStyle(BaseModel):
    """렌더링 스타일 옵션"""
    time_of_day: Literal["golden_hour", "noon", "dusk", "night"] = "golden_hour"
    viewpoint: Literal["exterior_front", "exterior_side", "interior", "aerial"] = "exterior_front"
    season: Literal["spring", "summer", "autumn", "winter"] = "spring"
    weather: Literal["clear", "cloudy", "overcast"] = "clear"

class RenderPreviewRequest(BaseModel):
    """프론트엔드에서 전송하는 렌더 요청"""
    image_b64: str = Field(..., description="Three.js canvas의 base64 PNG 스크린샷")
    style: RenderStyle = Field(default_factory=RenderStyle)
    denoising_strength: float = Field(
        default=0.65,
        ge=0.3,
        le=0.9,
        description="0.3~0.9: 낮을수록 BIM 형상 유지, 높을수록 자유로운 실사화"
    )

class RenderPreviewResponse(BaseModel):
    """백엔드가 반환하는 렌더 결과"""
    image_b64: str          # 생성된 실사 이미지 base64
    image_url: str          # /static/renders/{filename} 정적 URL
    prompt: str             # 사용된 프롬프트 (디버그/참고용)
    negative_prompt: str    # 사용된 네거티브 프롬프트
    seed: int               # 재현을 위한 시드값
    generation_time_sec: float
    width: int
    height: int
