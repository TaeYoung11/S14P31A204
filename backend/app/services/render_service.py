import base64
import httpx
import time
import json
import logging
from pathlib import Path
from typing import Optional
from app.models.render import RenderStyle, RenderPreviewRequest, RenderPreviewResponse
from app.services.bim_service import BIMService
from app.core.config import settings

logger = logging.getLogger(__name__)

SD_BASE_URL = settings.SD_BASE_URL
RENDER_STORAGE = Path(settings.RENDER_STORAGE_DIR)

# ─────────────────────────────────────────────────────────
# 프롬프트 빌더
# ─────────────────────────────────────────────────────────

# 스타일별 프롬프트 토큰 매핑
TIME_PROMPTS = {
    "golden_hour": "golden hour lighting, warm sunlight, long shadows, magical atmosphere",
    "noon":        "bright midday sunlight, sharp shadows, clear blue sky",
    "dusk":        "twilight, blue hour, city lights beginning to glow, dramatic sky",
    "night":       "night scene, exterior lighting, illuminated windows, dark sky with stars",
}

VIEWPOINT_PROMPTS = {
    "exterior_front": "architectural exterior front view, street level perspective",
    "exterior_side":  "architectural exterior side view, 3/4 angle",
    "interior":       "photorealistic interior architectural rendering, natural light",
    "aerial":         "aerial drone view, bird's eye perspective of building",
}

SEASON_PROMPTS = {
    "spring": "spring season, fresh green trees, flowers blooming",
    "summer": "summer, lush green vegetation, bright atmosphere",
    "autumn": "autumn foliage, orange and red leaves, warm tones",
    "winter": "winter, snow on ground and roof, bare trees, cold light",
}

WEATHER_PROMPTS = {
    "clear":    "clear sky, bright sunny day",
    "cloudy":   "partly cloudy sky, soft diffused light",
    "overcast": "overcast sky, even soft lighting, no harsh shadows",
}

QUALITY_SUFFIX = (
    "photorealistic, hyperrealistic, 8K resolution, RAW photo, "
    "DSLR camera, architectural photography, professional rendering, "
    "sharp focus, detailed textures, ambient occlusion, global illumination"
)

NEGATIVE_PROMPT = (
    "cartoon, anime, sketch, drawing, painting, illustration, "
    "low quality, blurry, distorted, deformed, ugly, watermark, "
    "text, signature, overexposed, flat lighting, 3D render style, CGI looking"
)


def build_prompt(style: RenderStyle, ifc_meta: Optional[dict] = None) -> str:
    """
    IFC 메타 정보와 스타일 옵션을 조합하여 SD 프롬프트를 생성한다.
    """
    parts = []

    # 1. 뷰포인트 (가장 중요, 앞에 배치)
    parts.append(VIEWPOINT_PROMPTS[style.viewpoint])

    # 2. IFC 분석 기반 건물 묘사
    if ifc_meta:
        storeys = ifc_meta.get("storey_count", 1)
        building_desc = f"{storeys}-story modern building"
        if ifc_meta.get("has_roof"):
            building_desc += " with pitched roof"
        if ifc_meta.get("wall_material") == "concrete":
            building_desc += ", concrete structure"
        parts.append(building_desc)
    else:
        parts.append("modern architectural building")

    # 3. 시간대
    parts.append(TIME_PROMPTS[style.time_of_day])

    # 4. 계절
    parts.append(SEASON_PROMPTS[style.season])

    # 5. 날씨
    parts.append(WEATHER_PROMPTS[style.weather])

    # 6. 품질 접미사
    parts.append(QUALITY_SUFFIX)

    return ", ".join(parts)


def extract_ifc_meta(project_id: str) -> dict:
    """IFC 파일에서 건물 메타 정보를 추출한다."""
    try:
        service = BIMService(project_id).load()
        storeys = service.find_storeys()
        ifc_file = service._ifc_file

        return {
            "storey_count": len(storeys),
            "has_roof":    len(ifc_file.by_type("IfcRoof")) > 0,
            "has_windows": len(ifc_file.by_type("IfcWindow")) > 0,
            "has_doors":   len(ifc_file.by_type("IfcDoor")) > 0,
            "wall_count":  len(ifc_file.by_type("IfcWall")),
        }
    except Exception as e:
        logger.error(f"Failed to extract IFC meta for {project_id}: {e}")
        return {}


# ─────────────────────────────────────────────────────────
# Stable Diffusion API 호출
# ─────────────────────────────────────────────────────────

async def call_img2img(
    image_b64: str,
    prompt: str,
    denoising_strength: float = 0.65,
    width: int = 1024,
    height: int = 576,
    seed: int = -1,
) -> dict:
    """
    AUTOMATIC1111 WebUI의 img2img API를 호출한다.
    """
    payload = {
        "init_images": [image_b64],
        "prompt": prompt,
        "negative_prompt": NEGATIVE_PROMPT,
        "denoising_strength": denoising_strength,
        "sampler_name": "DPM++ 2M Karras",
        "steps": 30,
        "cfg_scale": 7,
        "width": width,
        "height": height,
        "seed": seed,
        "restore_faces": False,
    }

    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.post(
            f"{SD_BASE_URL}/sdapi/v1/img2img",
            json=payload,
        )
        response.raise_for_status()
        return response.json()


# ─────────────────────────────────────────────────────────
# 메인 서비스 함수
# ─────────────────────────────────────────────────────────

async def generate_photorealistic_render(
    project_id: str,
    request: RenderPreviewRequest,
) -> RenderPreviewResponse:
    """
    BIM 뷰어 스크린샷을 받아 SD img2img로 실사 이미지를 생성한다.
    """
    start_time = time.time()
    RENDER_STORAGE.mkdir(parents=True, exist_ok=True)

    # 1. IFC 메타 추출 (프롬프트 개선용)
    ifc_meta = extract_ifc_meta(project_id)

    # 2. 프롬프트 생성
    prompt = build_prompt(request.style, ifc_meta)

    # 3. 출력 크기 결정 (기본 16:9)
    width, height = 1024, 576

    # 4. SD img2img 호출
    result = await call_img2img(
        image_b64=request.image_b64,
        prompt=prompt,
        denoising_strength=request.denoising_strength,
        width=width,
        height=height,
    )

    # 5. 결과 이미지 추출 및 저장
    output_b64 = result["images"][0]
    info = json.loads(result.get("info", "{}"))
    used_seed = info.get("seed", -1)

    filename = f"{project_id}_{int(time.time())}.png"
    output_path = RENDER_STORAGE / filename
    with open(output_path, "wb") as f:
        f.write(base64.b64decode(output_b64))

    return RenderPreviewResponse(
        image_b64=output_b64,
        image_url=f"/static/renders/{filename}",
        prompt=prompt,
        negative_prompt=NEGATIVE_PROMPT,
        seed=used_seed,
        generation_time_sec=round(time.time() - start_time, 2),
        width=width,
        height=height,
    )
