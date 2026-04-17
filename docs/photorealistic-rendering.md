# BIM 실사 렌더링 기능 설계 (Stable Diffusion img2img)

> **목표**: BIM 3D 뷰어의 스크린샷을 캡처하여 Stable Diffusion img2img로 실사 건축 이미지를 생성한다.
> 실제 BIM 형상을 유지하면서 재질/조명/분위기를 AI가 리얼리스틱하게 변환하는 방식이다.

---

## 1. 전체 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│                         Frontend (React)                       │
│                                                                │
│  ┌──────────────────┐     ┌────────────────────────────────┐  │
│  │   Viewer3D.tsx   │     │   RenderPreviewModal.tsx       │  │
│  │                  │     │                                │  │
│  │  [📸 RENDER 버튼] │────▶│  ① 렌더 옵션 선택             │  │
│  │                  │     │    - 시간대 (낮/황혼/밤)        │  │
│  │  canvas.toData   │     │    - 시점 (외부/내부/조감도)    │  │
│  │  URL() → base64  │     │    - 계절 (봄/여름/가을/겨울)  │  │
│  └──────────────────┘     │    - denoising 강도 슬라이더   │  │
│                           │                                │  │
│                           │  ② [Generate] 클릭            │  │
│                           │    → canvas 스크린샷 캡처      │  │
│                           │    → base64 인코딩             │  │
│                           │    → POST /render-preview      │  │
│                           │                                │  │
│                           │  ③ 결과 이미지 표시            │  │
│                           │    - 이미지 다운로드           │  │
│                           │    - 비교 슬라이더 (before/after) │
│                           └────────────────────────────────┘  │
└──────────────────────────────────────┬───────────────────────┘
                                       │ POST /api/v1/projects/{id}/render-preview
                                       │ { image_b64, style, denoising_strength }
┌──────────────────────────────────────▼───────────────────────┐
│                     Backend (FastAPI)                          │
│                                                                │
│  project_router.py                                             │
│  └── POST /{project_id}/render-preview                         │
│          │                                                     │
│          ▼                                                     │
│  render_service.py                                             │
│  ├── build_prompt(style, ifc_meta)   ← IFC 분석으로 프롬프트  │
│  ├── call_stable_diffusion_img2img() ← AUTOMATIC1111 API 호출 │
│  └── save_render_result()            ← 렌더 이미지 파일 저장  │
│                                                                │
└──────────────────────────────────────┬───────────────────────┘
                                       │ POST http://localhost:7860/sdapi/v1/img2img
                                       │ (AUTOMATIC1111 WebUI API)
┌──────────────────────────────────────▼───────────────────────┐
│           AUTOMATIC1111 WebUI (로컬 SD 서버)                   │
│                                                                │
│  - 포트: 7860 (기본)                                           │
│  - 모델: Realistic Vision v5.1 (건축 실사 최적)               │
│  - 모드: img2img (입력 이미지 기반 변환)                       │
│  - GPU: RTX 4050 (8GB VRAM)                                   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. 사전 준비사항

### 2.1 AUTOMATIC1111 WebUI 설치

```bash
# 1. 저장소 클론
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui
cd stable-diffusion-webui

# 2. 모델 다운로드 (Realistic Vision v5.1 — 건축 실사에 최적화)
# models/Stable-diffusion/ 폴더에 .safetensors 파일 넣기
# 다운로드: https://civitai.com/models/4201/realistic-vision-v60-b1

# 3. API 모드로 실행 (--api 필수)
./webui.bat --api --xformers --no-half-vae --skip-torch-cuda-test
# 또는 webui-user.bat 파일의 COMMANDLINE_ARGS에 --api 추가
```

### 2.2 RTX 4050 최적화 설정

```bash
# webui-user.bat (Windows)
set COMMANDLINE_ARGS=--api --xformers --no-half-vae --opt-sdp-attention

# 권장 설정 이유
# --xformers        : VRAM 절약, 속도 개선
# --no-half-vae     : 색상 번짐 방지
# --opt-sdp-attention: PyTorch 2.0 어텐션 최적화 (RTX 40xx 유효)
```

### 2.3 API 확인

```bash
# SD 서버 실행 후 테스트
curl http://localhost:7860/sdapi/v1/options
# {"sd_model_checkpoint": "realisticVisionV51_v51VAE.safetensors", ...}
```

---

## 3. 백엔드 구현

### 3.1 디렉토리 구조 변경

```
backend/app/
├── api/
│   ├── project_router.py      ← render-preview 엔드포인트 추가
│   └── ...
├── services/
│   ├── render_service.py      ← [NEW] SD img2img 호출 서비스
│   └── ...
├── models/
│   ├── render.py              ← [NEW] 렌더 요청/응답 Pydantic 모델
│   └── ...
└── storage/
    └── renders/               ← [NEW] 생성된 렌더 이미지 저장 폴더
```

### 3.2 Pydantic 모델 (`backend/app/models/render.py`)

```python
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
        ge=0.3,   # 최소: 원본 형상 잘 유지
        le=0.9,   # 최대: 거의 새 이미지
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
```

### 3.3 렌더링 서비스 (`backend/app/services/render_service.py`)

```python
import base64
import httpx
import time
import json
from pathlib import Path
from typing import Optional
from app.models.render import RenderStyle, RenderPreviewRequest, RenderPreviewResponse
from app.services.bim_service import BIMService

SD_BASE_URL = "http://localhost:7860"
RENDER_STORAGE = Path("./storage/renders")

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
    
    ifc_meta 예시:
    {
        "storey_count": 2,
        "has_roof": True,
        "has_windows": True,
        "has_doors": True,
        "wall_material": "concrete",
    }
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
    except Exception:
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
    
    반환값:
        {
            "images": ["base64_encoded_png"],
            "info": "{\"seed\": 12345, ...}",
        }
    """
    payload = {
        # 입력 이미지 (BIM 뷰어 스크린샷)
        "init_images": [image_b64],

        # 프롬프트
        "prompt": prompt,
        "negative_prompt": NEGATIVE_PROMPT,

        # img2img 핵심 파라미터
        "denoising_strength": denoising_strength,

        # 샘플러 설정
        "sampler_name": "DPM++ 2M Karras",   # 건축 렌더에 최적화된 고품질 샘플러
        "steps": 30,                           # RTX 4050에서 약 25~40초
        "cfg_scale": 7,                        # 프롬프트 충실도 (7 권장)

        # 출력 크기 (16:9 비율)
        "width": width,
        "height": height,

        # 재현성
        "seed": seed,      # -1 = 랜덤, 특정 숫자 = 고정 재현

        # ControlNet 없이도 형상 유지를 위해 restore_faces 비활성
        "restore_faces": False,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
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

    # 3. 출력 크기 결정 (입력 이미지 비율 기반)
    width, height = 1024, 576  # 기본 16:9

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
```

### 3.4 API 엔드포인트 추가 (`project_router.py`에 추가)

```python
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from app.models.render import RenderPreviewRequest, RenderPreviewResponse
from app.services.render_service import generate_photorealistic_render
import httpx

@router.post("/{project_id}/render-preview", response_model=RenderPreviewResponse)
async def render_preview(
    project_id: str,
    payload: RenderPreviewRequest,
    db: Session = Depends(get_db),
):
    """
    BIM 뷰어 스크린샷을 기반으로 Stable Diffusion img2img 실사 렌더링 생성.
    
    - payload.image_b64: Three.js canvas.toDataURL("image/png")의 base64 문자열
    - payload.style: 분위기/시간대/계절 옵션
    - payload.denoising_strength: 0.3(형상유지) ~ 0.9(자유실사화)
    """
    project = _get_project_or_404(project_id, db)
    if not project.ifc_uploaded:
        raise HTTPException(status_code=404, detail="IFC model not found")

    # SD 서버 연결 확인
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.get("http://localhost:7860/sdapi/v1/options")
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Stable Diffusion server is not running. Start AUTOMATIC1111 with --api flag."
        )

    try:
        result = await generate_photorealistic_render(project_id, payload)
        return result
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="SD rendering timed out (>120s)")
    except Exception as e:
        logger.exception("[%s] Render failed", project_id)
        raise HTTPException(status_code=500, detail=str(e))
```

### 3.5 정적 파일 서빙 (`main.py`에 추가)

```python
from fastapi.staticfiles import StaticFiles
import os

# lifespan 내 디렉토리 생성 부분에 추가
os.makedirs("./storage/renders", exist_ok=True)

# app 정의 후 마운트
app.mount("/static/renders", StaticFiles(directory="./storage/renders"), name="renders")
```

---

## 4. 프론트엔드 구현

### 4.1 Canvas 스크린샷 캡처 (`useBIMModel.ts`에 추가)

```typescript
// useBIMModel.ts에 추가할 함수

const captureScreenshot = useCallback((): string | null => {
  const world = worldRef.current
  if (!world) return null

  // OBC.SimpleRenderer가 내부적으로 관리하는 WebGL canvas에서 캡처
  const canvas = world.renderer.three.domElement
  
  // WebGL 캔버스는 preserveDrawingBuffer가 필요할 수 있음
  // → useBIMModel의 initViewer에서 renderer 생성 시 설정 필요
  return canvas.toDataURL('image/png')
}, [])

// initViewer에서 SimpleRenderer 생성 후:
// world.renderer.three.preserveDrawingBuffer = true
// (이 설정 없으면 toDataURL이 빈 이미지를 반환할 수 있음)

return {
  // ... 기존 반환값
  captureScreenshot,  // 추가
}
```

> **주의**: `OBC.SimpleRenderer`가 내부 canvas를 래핑하므로,
> `world.renderer.three.domElement`로 WebGL canvas에 접근한다.
> `preserveDrawingBuffer: true` 옵션이 없으면 `toDataURL()`이 빈 이미지를 반환한다.

### 4.2 RenderPreviewModal 컴포넌트 (`frontend/src/components/RenderPreviewModal/RenderPreviewModal.tsx`)

```tsx
import { useState, useRef } from 'react'
import { X, Download, Camera, Loader2, SlidersHorizontal } from 'lucide-react'

interface RenderStyle {
  time_of_day: 'golden_hour' | 'noon' | 'dusk' | 'night'
  viewpoint: 'exterior_front' | 'exterior_side' | 'interior' | 'aerial'
  season: 'spring' | 'summer' | 'autumn' | 'winter'
  weather: 'clear' | 'cloudy' | 'overcast'
}

interface Props {
  projectId: string
  onClose: () => void
  captureScreenshot: () => string | null
}

export const RenderPreviewModal = ({ projectId, onClose, captureScreenshot }: Props) => {
  const [style, setStyle] = useState<RenderStyle>({
    time_of_day: 'golden_hour',
    viewpoint: 'exterior_front',
    season: 'spring',
    weather: 'clear',
  })
  const [denoising, setDenoising] = useState(0.65)
  const [isLoading, setIsLoading] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [beforeImage, setBeforeImage] = useState<string | null>(null)  // 스크린샷 원본
  const [prompt, setPrompt] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [genTime, setGenTime] = useState<number | null>(null)

  const handleGenerate = async () => {
    const screenshot = captureScreenshot()
    if (!screenshot) {
      setError('Failed to capture 3D view screenshot.')
      return
    }

    setIsLoading(true)
    setError(null)
    setBeforeImage(screenshot)  // before 이미지 저장

    try {
      const res = await fetch(`http://localhost:8000/api/v1/projects/${projectId}/render-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_b64: screenshot.replace(/^data:image\/png;base64,/, ''),
          style,
          denoising_strength: denoising,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Render failed')
      }

      const data = await res.json()
      setResultImage(`data:image/png;base64,${data.image_b64}`)
      setPrompt(data.prompt)
      setGenTime(data.generation_time_sec)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    if (!resultImage) return
    const link = document.createElement('a')
    link.href = resultImage
    link.download = `bim-render-${Date.now()}.png`
    link.click()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[900px] max-h-[90vh] bg-[#111] border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Camera className="w-5 h-5 text-primary" />
            <span className="font-bold tracking-widest text-sm uppercase">Photorealistic Render</span>
          </div>
          <button onClick={onClose} className="p-2 glass-button rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 옵션 패널 */}
          <div className="w-64 shrink-0 p-5 border-r border-white/10 flex flex-col gap-5 overflow-y-auto">
            
            {/* 시간대 */}
            <OptionGroup label="Time of Day" value={style.time_of_day}
              options={[
                { value: 'golden_hour', label: '🌅 Golden Hour' },
                { value: 'noon',        label: '☀️ Noon' },
                { value: 'dusk',        label: '🌆 Dusk' },
                { value: 'night',       label: '🌙 Night' },
              ]}
              onChange={(v) => setStyle({ ...style, time_of_day: v as RenderStyle['time_of_day'] })}
            />

            {/* 시점 */}
            <OptionGroup label="Viewpoint" value={style.viewpoint}
              options={[
                { value: 'exterior_front', label: '🏠 Front' },
                { value: 'exterior_side',  label: '🏠 Side' },
                { value: 'interior',       label: '🛋️ Interior' },
                { value: 'aerial',         label: '🚁 Aerial' },
              ]}
              onChange={(v) => setStyle({ ...style, viewpoint: v as RenderStyle['viewpoint'] })}
            />

            {/* 계절 */}
            <OptionGroup label="Season" value={style.season}
              options={[
                { value: 'spring', label: '🌸 Spring' },
                { value: 'summer', label: '🌿 Summer' },
                { value: 'autumn', label: '🍂 Autumn' },
                { value: 'winter', label: '❄️ Winter' },
              ]}
              onChange={(v) => setStyle({ ...style, season: v as RenderStyle['season'] })}
            />

            {/* denoising 슬라이더 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                  <SlidersHorizontal className="inline w-3 h-3 mr-1" />
                  Creativity
                </label>
                <span className="text-[10px] text-white/70 font-mono">{denoising.toFixed(2)}</span>
              </div>
              <input type="range" min="0.3" max="0.9" step="0.05"
                value={denoising}
                onChange={(e) => setDenoising(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[9px] text-white/30">
                <span>Preserve shape</span>
                <span>Free style</span>
              </div>
            </div>

            {/* Generate 버튼 */}
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="glass-button mt-auto px-4 py-3 rounded-xl font-bold text-sm text-primary border-primary/30 hover:border-primary/60 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Rendering...</>
                : <><Camera className="w-4 h-4" /> Generate</>
              }
            </button>

            {genTime && (
              <p className="text-[9px] text-white/30 text-center">
                Generated in {genTime}s
              </p>
            )}
          </div>

          {/* 결과 이미지 영역 */}
          <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">
                ⚠️ {error}
              </div>
            )}

            {isLoading && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-white/50 text-sm">Running AI rendering on RTX 4050...</p>
                <p className="text-white/30 text-xs">Typical: 25~45 seconds</p>
              </div>
            )}

            {resultImage && !isLoading && (
              <>
                <div className="relative rounded-2xl overflow-hidden border border-white/10">
                  <img src={resultImage} alt="Photorealistic render" className="w-full" />
                  <button
                    onClick={handleDownload}
                    className="absolute bottom-4 right-4 glass-button p-3 rounded-xl hover:bg-white/20"
                    title="Download"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>

                {prompt && (
                  <details className="text-[10px] text-white/30 font-mono">
                    <summary className="cursor-pointer text-white/50 hover:text-white/70">
                      Show prompt
                    </summary>
                    <p className="mt-2 p-3 bg-white/5 rounded-lg leading-relaxed">{prompt}</p>
                  </details>
                )}
              </>
            )}

            {!resultImage && !isLoading && !error && (
              <div className="flex-1 flex flex-col items-center justify-center text-white/20">
                <Camera className="w-16 h-16 mb-4" />
                <p className="text-sm">Select options and click Generate</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 재사용 가능한 옵션 그룹 컴포넌트
const OptionGroup = ({
  label, value, options, onChange
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] font-bold uppercase tracking-widest text-white/50">{label}</label>
    <div className="flex flex-col gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`text-left px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
            value === opt.value
              ? 'bg-primary/20 border border-primary/40 text-primary'
              : 'glass-button text-white/60 hover:text-white/80'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
)
```

### 4.3 Viewer3D.tsx에 렌더 버튼 추가

```tsx
// Viewer3D.tsx 변경사항

import { Camera } from 'lucide-react'
import { RenderPreviewModal } from '../RenderPreviewModal/RenderPreviewModal'

// useBIMModel에서 captureScreenshot 추가
const { ..., captureScreenshot } = useBIMModel(containerRef)

// state 추가
const [isRenderModalOpen, setIsRenderModalOpen] = useState(false)

// JSX — 하단 툴바에 버튼 추가
<button
  className="p-3 glass-button rounded-xl text-primary"
  title="Photorealistic Render"
  onClick={() => setIsRenderModalOpen(true)}
  disabled={!currentProject?.ifc_uploaded}
>
  <Camera className="w-5 h-5" />
</button>

// 모달 렌더링 (return문 최하단)
{isRenderModalOpen && currentProject && (
  <RenderPreviewModal
    projectId={currentProject.id}
    onClose={() => setIsRenderModalOpen(false)}
    captureScreenshot={captureScreenshot}
  />
)}
```

---

## 5. ControlNet 확장 (선택적 고도화)

`denoising_strength`를 높여도 BIM 형상이 유지되도록 ControlNet을 활용할 수 있다.

```python
# render_service.py — ControlNet 사용 시 payload에 추가

"alwayson_scripts": {
    "controlnet": {
        "args": [
            {
                "input_image": image_b64,        # 동일 스크린샷
                "model": "control_v11p_sd15_canny",  # 엣지 감지
                "module": "canny",
                "weight": 0.8,
                "guidance_start": 0.0,
                "guidance_end": 1.0,
                "resize_mode": 1,
            }
        ]
    }
}
```

> ControlNet 사용 시 BIM 벽, 창문, 지붕의 외곽선이 실사 이미지에서도 정확히 유지된다.
> `control_v11p_sd15_canny.pth` 파일을 `extensions/sd-webui-controlnet/models/`에 다운로드 필요.

---

## 6. 환경변수 설정

```bash
# .env에 추가
SD_API_URL=http://localhost:7860
SD_DEFAULT_MODEL=realisticVisionV51_v51VAE.safetensors
SD_TIMEOUT_SEC=120
RENDER_STORAGE_PATH=./storage/renders
```

```python
# core/config.py에 추가
SD_API_URL: str = "http://localhost:7860"
SD_TIMEOUT_SEC: int = 120
RENDER_STORAGE_PATH: str = "./storage/renders"
```

---

## 7. 구현 순서 (체크리스트)

### Phase 1: 백엔드 기반 (1~2일)
- [ ] AUTOMATIC1111 설치 및 `--api` 모드 확인
- [ ] `models/render.py` Pydantic 모델 생성
- [ ] `services/render_service.py` 구현 (프롬프트 빌더 + SD 호출)
- [ ] `project_router.py`에 `/render-preview` 엔드포인트 추가
- [ ] `main.py`에 정적 파일 서빙 추가
- [ ] `curl` 또는 Postman으로 엔드포인트 테스트

### Phase 2: 프론트엔드 (1~2일)
- [ ] `useBIMModel.ts`에 `captureScreenshot` 함수 추가
  - [ ] `preserveDrawingBuffer` 설정 확인
- [ ] `RenderPreviewModal.tsx` 컴포넌트 구현
- [ ] `Viewer3D.tsx`에 카메라 아이콘 버튼 추가
- [ ] 로딩/에러/결과 상태 처리

### Phase 3: 품질 개선 (선택)
- [ ] ControlNet Canny 적용 (형상 보존 강화)
- [ ] before/after 비교 슬라이더 UI
- [ ] 이미지 히스토리 저장 및 갤러리 뷰
- [ ] WebSocket으로 생성 진행률 스트리밍

---

## 8. 성능 기대치 (RTX 4050 8GB, Realistic Vision v5.1)

| 설정 | 예상 시간 |
|------|----------|
| steps=20, 512×288 | ~15초 |
| steps=30, 1024×576 | ~30초 |
| steps=30, 1024×576 + ControlNet | ~40초 |
| steps=40, 1344×768 | ~55초 |

---

## 9. 주요 트레이드오프

| 파라미터 | 낮은 값 | 높은 값 |
|---------|---------|---------|
| `denoising_strength` | BIM 형상 정확히 유지, 덜 실사적 | 형상 변형 가능, 더 실사적 |
| `steps` | 빠르지만 품질 낮음 | 느리지만 고품질 |
| `cfg_scale` | 프롬프트 덜 반영 | 프롬프트 강하게 반영 |
| 출력 해상도 | 빠름 | 느리지만 선명 |

> **권장 시작값**: `denoising_strength=0.65`, `steps=30`, `cfg_scale=7`, `1024×576`
