# Floor Planner 통합 설계

> **작성일**: 2026-04-11
> **대상**: BIM 3D Service 개발자
> **상태**: 구현 준비 완료

---

## 0. 개요

기존 BIM 3D Service(자연어 IFC 편집기)에 **Floor Planner** 기능을 추가한다.
Floor Planner는 D3 Force-Directed 알고리즘으로 방(Room)의 배치를 자동·수동으로 결정하고,
IFC / JSON 포맷으로 내보낼 수 있는 2D 도면 편집 도구다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| 방 추가/삭제 | 이름·타입·크기·층 입력 후 캔버스에 배치 |
| 인접도 설정 | 방 간 연결 강도(0~1) 슬라이더로 조정 |
| Force 시뮬레이션 | D3/Python 동일 파라미터로 방 자동 배치 |
| 방 드래그 | 캔버스에서 직접 방 이동, 잠금 기능 |
| 층 필터 | 층(1F, 2F, B1 등)별 독립 편집 |
| 내보내기 | IFC 2x3 · Rhino/Grasshopper JSON |

### 통합 방식

- `/floor-planner` URL 경로를 신규 추가 (`react-router-dom` 사용)
- 기존 `/` (BIM 뷰어) 페이지는 변경하지 않음
- 백엔드 라우터는 `prefix="/api/v1/floor"` 로 등록 (기존 Vite proxy 재사용)

---

## 1. 아키텍처 다이어그램

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Vite SPA)                         │
│                                                                    │
│  Route: /                          Route: /floor-planner          │
│  ┌─────────────────────────┐       ┌──────────────────────────┐   │
│  │   App.tsx (BIM Viewer)  │       │   FloorPlanner/index.tsx │   │
│  │  ┌────────┐ ┌────────┐  │       │                          │   │
│  │  │ChatPan │ │View3D  │  │       │  ┌──────────┐ ┌───────┐ │   │
│  │  └────────┘ └────────┘  │       │  │RoomMatrix│ │Floor  │ │   │
│  │  ┌────────┐ ┌────────┐  │       │  │Panel     │ │Canvas │ │   │
│  │  │History │ │Prop    │  │       │  └──────────┘ └───────┘ │   │
│  │  │Panel   │ │Panel   │  │       │  ┌──────────────────────┐│   │
│  │  └────────┘ └────────┘  │       │  │    ExportPanel       ││   │
│  └─────────────────────────┘       │  └──────────────────────┘│   │
│                                    └──────────────────────────┘   │
│  Hook: useWebSocket                Hook: useFloorSimulation        │
│  Hook: useBIMModel                 (WebSocket + REST 통합)         │
└─────────────────┬────────────────────────────┬────────────────────┘
                  │ REST /api/v1/...            │ REST /api/v1/floor/...
                  │ WS  /ws/...                 │ WS  /floor/projects/.../ws
┌─────────────────▼────────────────────────────▼────────────────────┐
│                    FastAPI Backend (port 8000)                      │
│                                                                    │
│  ┌──────────────────────┐   ┌─────────────────────────────────┐   │
│  │  기존 api_router      │   │  floor_router (신규)            │   │
│  │  /api/v1/projects    │   │  /api/v1/floor/projects         │   │
│  │  /ws/{project_id}    │   │  /floor/projects/{id}/ws        │   │
│  └──────────────────────┘   └──────────────┬────────────────┘    │
│                                             │                      │
│  ┌──────────────────────┐   ┌──────────────▼──────────────────┐   │
│  │   BIMService         │   │   FloorService (신규)           │   │
│  │   NLPService         │   │   - create_project()            │   │
│  │   (기존, 변경 없음)   │   │   - run_simulation()            │   │
│  └──────────────────────┘   │   - export_to_json/ifc()        │   │
│                              └─────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. 파일 변경 목록

### 2-1. 신규 생성 파일

| 파일 경로 | 설명 |
|-----------|------|
| `backend/app/models/floor_models.py` | Pydantic v2 데이터 모델 |
| `backend/app/services/floor_service.py` | 시뮬레이션·내보내기 서비스 |
| `backend/app/api/floor_router.py` | FastAPI 라우터 |
| `frontend/src/hooks/useFloorSimulation.ts` | 시뮬레이션 상태 훅 |
| `frontend/src/components/FloorPlanner/index.tsx` | 레이아웃 루트 |
| `frontend/src/components/FloorPlanner/FloorCanvas.tsx` | D3 SVG 캔버스 |
| `frontend/src/components/FloorPlanner/RoomMatrixPanel.tsx` | 방 목록 + 인접도 |
| `frontend/src/components/FloorPlanner/FloorInspector.tsx` | 팝오버 속성 패널 |
| `frontend/src/components/FloorPlanner/ExportPanel.tsx` | 내보내기 버튼 |

### 2-2. 수정 파일

| 파일 경로 | 변경 내용 |
|-----------|-----------|
| `backend/app/main.py` | `floor_router` import 및 `app.include_router()` 1줄 추가 |
| `frontend/vite.config.ts` | WebSocket proxy에 `/floor` 경로 추가 |
| `frontend/src/App.tsx` | `react-router-dom` 적용, `/floor-planner` 라우트·네비 링크 추가 |
| `.env.example` | `FLOOR_SIMULATION_*` 환경변수 2줄 추가 |

### 2-3. 추가 npm 패키지

```bash
npm install react-router-dom d3
npm install -D @types/react-router-dom @types/d3
```

---

## 3. 백엔드 상세 설계

### 3-1. 데이터 모델 (`floor_models.py`)

기존 `bim_command.py`의 Pydantic v2 패턴(`.model_copy()`)을 그대로 따른다.

```python
# backend/app/models/floor_models.py

from pydantic import BaseModel
from typing import Optional, Literal
from enum import Enum


class RoomType(str, Enum):
    LIVING    = "living"
    BEDROOM   = "bedroom"
    KITCHEN   = "kitchen"
    BATHROOM  = "bathroom"
    OFFICE    = "office"
    CORRIDOR  = "corridor"
    OTHER     = "other"


class Room(BaseModel):
    id: str                         # uuid
    name: str
    type: RoomType
    width: float                    # 미터
    height: float                   # 미터
    floor: int                      # 1층 = 1
    x: Optional[float] = None       # 시뮬레이션 후 좌표
    y: Optional[float] = None
    angle: Optional[float] = 0.0    # 라디안
    locked: bool = False            # True → Force 시뮬레이션에서 고정


class AdjacencyEntry(BaseModel):
    from_room_id: str
    to_room_id: str
    strength: float                 # 0.0 ~ 1.0, Force 스프링 강도


class FloorBoundary(BaseModel):
    floor: int
    polygon: list[tuple[float, float]]  # [(x,y), ...] 미터


class FloorProject(BaseModel):
    id: str
    name: str
    rooms: list[Room]
    adjacency: list[AdjacencyEntry]
    boundaries: list[FloorBoundary]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SimulationRequest(BaseModel):
    project_id: str
    iterations: int = 300
    alpha_decay: float = 0.0228     # D3 force 기본값


class SimulationResult(BaseModel):
    project_id: str
    rooms: list[Room]               # x, y 업데이트된 결과
    energy: float                   # 수렴 에너지 (낮을수록 좋음)
    converged: bool


class ExportRequest(BaseModel):
    project_id: str
    format: Literal["ifc", "json", "dxf"]
    include_floors: list[int]       # 내보낼 층 번호


class FloorNLPCommand(BaseModel):
    """자연어로 방 배치를 수정하는 명령 (BIMCommand 패턴 동일)"""
    action: Literal["add_room", "remove_room", "resize_room",
                    "set_adjacency", "lock_room", "unlock_room"]
    target_room_name: Optional[str] = None
    new_room: Optional[Room] = None
    adjacency_target: Optional[str] = None
    adjacency_strength: Optional[float] = None
    resize_width: Optional[float] = None
    resize_height: Optional[float] = None
    confidence: float = 1.0
    needs_clarification: bool = False
    clarification_question: Optional[str] = None
```

---

### 3-2. 서비스 (`floor_service.py`)

#### Force-Directed 시뮬레이션 알고리즘

프론트엔드 D3와 `alpha_decay`, `strength`, 충돌 반지름이 동일해야 한다.

```
Force 종류             파라미터               역할
────────────────────────────────────────────────────────
링크 힘 (spring)       strength = AdjStrength  인접 방 가까이 배치
충돌 반발력             radius = max(w,h)/2+1m  방 겹침 방지
중력 (center)          (별도 미구현)            선택적
감쇠                   velocity *= 0.6          수렴 유도

수렴 조건: Σ(vx²+vy²) < 0.01
```

#### IFC 내보내기 (향후 구현)

`bim_service.py`의 IfcOpenShell 초기화 패턴을 참고해 구현:

```python
# 참고 패턴 (bim_service.py)
ifc_file = ifcopenshell.open(str(self.ifc_path))

# floor_service.py에서 신규 파일 생성 시:
# ifc_file = ifcopenshell.file(schema="IFC2X3")
# → IfcProject → IfcSite → IfcBuilding
#   → IfcBuildingStorey (floor별)
#     → IfcSpace (Room별)
#       → IfcRelContainedInSpatialStructure
```

---

### 3-3. API 라우터 (`floor_router.py`)

기존 `ConnectionManager` 패턴은 `websocket.py`에서 이미 구현돼 있으므로 독립적으로 작성한다.

#### REST 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/v1/floor/projects` | 프로젝트 생성 |
| `GET` | `/api/v1/floor/projects/{id}` | 프로젝트 조회 |
| `PUT` | `/api/v1/floor/projects/{id}` | 프로젝트 전체 업데이트 |
| `POST` | `/api/v1/floor/projects/{id}/simulate` | 시뮬레이션 실행 |
| `POST` | `/api/v1/floor/projects/{id}/export` | 내보내기 (Blob) |

#### WebSocket 엔드포인트

```
WS /floor/projects/{project_id}/ws
```

메시지 프로토콜:

```jsonc
// 클라이언트 → 서버: 방 드래그
{ "type": "room_drag", "room_id": "uuid", "x": 5.0, "y": 3.2 }

// 서버 → 클라이언트: ACK
{ "type": "ack", "room_id": "uuid" }
```

#### 메모리 내 저장소

```python
_projects: dict[str, FloorProject] = {}
# 프로토타입 단계. 추후 PostgreSQL 마이그레이션 시
# 기존 Project 모델 패턴(SQLAlchemy) 참고
```

---

### 3-4. `main.py` 수정

```python
# 기존 라우터 등록 블록 아래에 추가 (2줄)
from app.api.floor_router import floor_router
app.include_router(floor_router, prefix="/api/v1")
# 결과: /api/v1/floor/projects/...
```

---

## 4. 프론트엔드 상세 설계

### 4-1. 라우팅 구조 (react-router-dom)

이 프로젝트는 **Vite SPA** 이므로 Next.js pages 라우터가 없다.
`react-router-dom v6`을 도입해 클라이언트 사이드 라우팅을 구성한다.

```tsx
// frontend/src/App.tsx 변경 후

import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { FloorPlanner } from './components/FloorPlanner'

// 기존 BIM 뷰어 JSX를 <BIMViewer> 컴포넌트로 추출하거나 인라인 유지
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"              element={<BIMViewerPage />} />
        <Route path="/floor-planner" element={<FloorPlanner />} />
      </Routes>
    </BrowserRouter>
  )
}
```

#### 헤더 네비게이션 추가

```tsx
// 기존 헤더 오른쪽 버튼 영역에 추가
<Link
  to="/floor-planner"
  className="glass-button px-4 py-2 rounded-lg text-xs font-bold"
>
  FLOOR PLANNER
</Link>
<Link
  to="/"
  className="glass-button px-4 py-2 rounded-lg text-xs font-bold"
>
  BIM VIEWER
</Link>
```

---

### 4-2. 레이아웃 구조 (`FloorPlanner/index.tsx`)

기존 `App.tsx`의 `header + main + footer` 3단 레이아웃을 동일하게 적용한다.

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER: 프로젝트명 | 시뮬레이션 상태(energy / converged) | 단축키 │
├─────────────────┬───────────────────────────────────────────────┤
│ RoomMatrixPanel │                FloorCanvas                     │
│   (w-60, 좌측)  │           (flex-1, D3 SVG 캔버스)             │
│                 │                                               │
│ ▪ 층 선택 탭   │   ┌────────────────────────────────────────┐ │
│                 │   │    FloorCanvas 내부                     │ │
│ ▪ 방 목록      │   │   [ RoomRect ]──────[ RoomRect ]        │ │
│   색상점+이름   │   │        │ (연결선, 굵기=strength*4)       │ │
│   W×H m²       │   │   [ RoomRect ]                          │ │
│   🔒 잠금      │   │                                         │ │
│                 │   │  더블클릭 → 방 추가 모달                 │ │
│ ▪ 인접도       │   └────────────────────────────────────────┘ │
│   슬라이더      │   [ FloorInspector 팝오버 (선택된 방 위) ]   │
│                 │                                               │
│ ▪ 방 추가 버튼  │                                               │
├─────────────────┴───────────────────────────────────────────────┤
│ ExportPanel: ▶ 시뮬레이션  [ IFC ] [ JSON ] [ DXF(비활성) ]    │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4-3. `useFloorSimulation.ts` 훅

`useWebSocket.ts`의 reconnect·shouldReconnectRef 패턴을 재사용한다.

```typescript
// URL 패턴 (기존 useWebSocket과 동일한 방식)
const WS_URL = `ws://localhost:8000/floor/projects/${projectId}/ws`
const API_BASE = `/api/v1/floor/projects/${projectId}`

// 상태
const [project, setProject]       // FloorProject | null
const [simulation, setSimulation] // running | energy | converged | iterationCount
const [selectedRoomId, setSelectedRoomId]

// 주요 함수
startSimulation()    // POST .../simulate → setProject rooms
stopSimulation()     // 로컬 상태 토글
dragRoom(id, x, y)  // 로컬 업데이트 + WS send
toggleLock(id)      // 로컬 업데이트
updateAdjacency(from, to, strength)  // 로컬 업데이트
```

---

### 4-4. `FloorCanvas.tsx` — D3 Force 캔버스

#### SVG 선택 이유

- Three.js(`useBIMModel`)와 DOM 충돌 없음
- D3의 `.call(drag)` 패턴이 SVG에 자연스럽게 통합
- CSS로 스타일링 용이

#### D3 파라미터 (백엔드 `floor_service.py`와 동일하게 유지)

```typescript
const sim = d3.forceSimulation<RoomNode>(nodes)
  .force('link', d3.forceLink<RoomNode, AdjLink>(links)
    .id(d => d.id)
    .strength(d => d.strength)
    .distance(100))           // px (= 5m 기준)
  .force('collide', d3.forceCollide<RoomNode>()
    .radius(d => Math.max(d.width, d.height) / 2 * SCALE + 10))
  .force('charge', d3.forceManyBody().strength(-30))
  .alphaDecay(0.0228)
```

#### 방 렌더링 규칙

| 상태 | 표현 |
|------|------|
| 일반 | 반투명 fill + type별 색상 |
| 선택됨 | stroke: primary color, stroke-width: 2px |
| 잠김 | stroke-dasharray: 4 2 + 🔒 아이콘 |
| 잠긴 다른 방 | opacity: 0.5 |

#### 인접도 연결선 규칙

```
stroke-width = strength * 4    (strength 0→0px, 1→4px)
stroke-opacity = 0.4 + strength * 0.4
```

---

### 4-5. `RoomMatrixPanel.tsx` — 방 목록 + 인접도

`PropertyPanel.tsx`의 `flex items-center gap-2`, `text-xs text-white/40` 등 CSS 클래스를 그대로 재사용한다.

#### 방 추가 폼

```
이름(text) | 타입(select) | W(number, m) | H(number, m) | 층(number)
                                                            [추가] 버튼
```

POST `/api/v1/floor/projects/{id}` (PUT 전체 업데이트)

#### 인접도 슬라이더

선택된 방(`selectedRoomId`)이 있을 때, 다른 방들과의 `strength` 슬라이더를 나열:

```
[ 침실 A ] ━━━━━━━━╋━━━━━━━━ 0.8
[ 화장실 ] ━━━━╋━━━━━━━━━━━ 0.4
             0                   1
```

입력 즉시 `updateAdjacency()` 호출 → 캔버스 연결선 굵기 즉시 반영

---

### 4-6. `FloorInspector.tsx` — 팝오버 패널

```typescript
// 캔버스 좌표 → 스크린 좌표 변환
const svgRect = svgRef.current.getBoundingClientRect()
const screenX = svgRect.left + room.x * SCALE
const screenY = svgRect.top  + room.y * SCALE

// 화면 경계 초과 시 flip
const flipX = screenX + 240 > window.innerWidth
const flipY = screenY + 200 > window.innerHeight
```

표시 항목:
- 방 이름 (편집 가능, `onBlur` → PUT)
- W(m) · H(m) (편집 가능)
- 층
- 면적(m²) = W × H (자동 계산)
- 잠금 토글

---

### 4-7. `ExportPanel.tsx` — 내보내기

```typescript
const handleExport = async (format: 'ifc' | 'json' | 'dxf') => {
  setLoading(format)
  const res = await fetch(`/api/v1/floor/projects/${projectId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, format, include_floors: selectedFloors })
  })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName}.${format}`
  a.click()
  URL.revokeObjectURL(url)
  setLoading(null)
}
```

---

### 4-8. `vite.config.ts` 수정

```typescript
server: {
  proxy: {
    '/api': { target: 'http://localhost:8000', changeOrigin: true },
    '/ws':  { target: 'ws://localhost:8000', ws: true },
    // 신규 추가
    '/floor': {
      target: 'ws://localhost:8000',
      ws: true,
      changeOrigin: true,
    },
  },
},
```

> **주의**: `/floor` 프록시는 REST(`/api/v1/floor`)가 아닌 WebSocket (`/floor/projects/{id}/ws`) 전용.
> REST 요청은 이미 `/api` → `http://localhost:8000` 프록시를 사용하며,
> 프론트에서 fetch 경로를 `/api/v1/floor/...` 로 작성하면 자동으로 적용된다.

---

## 5. API 상세 명세

### 5-1. 프로젝트 CRUD

#### `POST /api/v1/floor/projects?name={name}` — 프로젝트 생성

**Response `200`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "테스트 평면도",
  "rooms": [],
  "adjacency": [],
  "boundaries": [],
  "created_at": null,
  "updated_at": null
}
```

---

#### `GET /api/v1/floor/projects/{id}` — 프로젝트 조회

**Response `200`:**
```json
{
  "id": "550e8400-...",
  "name": "2층 평면도",
  "rooms": [
    { "id": "room-1", "name": "거실", "type": "living", "width": 5.0, "height": 4.0,
      "floor": 1, "x": 12.3, "y": 8.1, "angle": 0.0, "locked": false }
  ],
  "adjacency": [
    { "from_room_id": "room-1", "to_room_id": "room-2", "strength": 0.8 }
  ],
  "boundaries": []
}
```

**Errors:**
- `404`: 프로젝트를 찾을 수 없습니다

---

#### `PUT /api/v1/floor/projects/{id}` — 전체 업데이트

방 목록·인접도·경계를 한 번에 교체한다.
Request body: `FloorProject` 전체 JSON

---

### 5-2. 시뮬레이션

#### `POST /api/v1/floor/projects/{id}/simulate`

**Request Body:**
```json
{ "project_id": "550e8400-...", "iterations": 300, "alpha_decay": 0.0228 }
```

**Response `200`:**
```json
{
  "project_id": "550e8400-...",
  "rooms": [
    { "id": "room-1", ..., "x": 12.345, "y": 8.012 }
  ],
  "energy": 0.0032,
  "converged": true
}
```

> `converged: true` 조건: `energy < 0.01`

---

### 5-3. 내보내기

#### `POST /api/v1/floor/projects/{id}/export`

**Request Body:**
```json
{ "project_id": "550e8400-...", "format": "json", "include_floors": [1, 2] }
```

**Response (format=json):**
```json
{
  "schema": "floor_planner_v1",
  "project_id": "550e8400-...",
  "rooms": [ ... ],
  "adjacency": [ ... ],
  "boundaries": [ ... ]
}
```
`Content-Disposition: attachment; filename={project_name}.json`

**Response (format=ifc):**
`application/octet-stream` — IFC 2x3 바이너리
`Content-Disposition: attachment; filename={project_name}.ifc`

**현재 미지원:**
- `format=dxf` → `400 Bad Request` (추후 `ezdxf` 라이브러리로 구현 예정)
- `format=ifc` → `501 Not Implemented` (IfcOpenShell 연동 후 구현)

---

### 5-4. WebSocket

```
WS ws://localhost:8000/floor/projects/{project_id}/ws
```

#### 클라이언트 → 서버

| type | 설명 | 필드 |
|------|------|------|
| `room_drag` | 방 드래그 위치 전송 | `room_id`, `x`, `y` |

#### 서버 → 클라이언트

| type | 설명 | 필드 |
|------|------|------|
| `ack` | 드래그 위치 수신 확인 | `room_id` |
| `simulation_step` | (향후) 실시간 스텝 스트리밍 | `rooms`, `energy`, `converged` |

---

## 6. 데이터 흐름 시퀀스

### 방 추가 후 시뮬레이션 실행

```
User           RoomMatrixPanel      useFloorSimulation      Backend
 │                    │                     │                   │
 │ [방 추가] 클릭     │                     │                   │
 │───────────────────▶│                     │                   │
 │                    │─PUT /projects/{id}──────────────────────▶
 │                    │◀────────────────────────────────────────│
 │                    │─setProject(응답)────▶                   │
 │                    │                     │                   │
 │ [시뮬레이션] 클릭  │                     │                   │
 │──────────────────────────────────────────▶                   │
 │                    │                     │─POST .../simulate──▶
 │                    │                     │◀───────────────────│
 │                    │                     │─setProject(rooms)  │
 │◀────────────────────────────────────────FloorCanvas 리렌더링  │
```

### 방 드래그 (실시간)

```
User          FloorCanvas         useFloorSimulation       Backend
 │                │                       │                    │
 │ 드래그 시작    │                       │                    │
 │───────────────▶│─dragRoom(id,x,y)──────▶                   │
 │                │                       │─WS: room_drag──────▶
 │                │◀──────────────────────│◀──WS: ack──────────│
 │ 드래그 중      │─즉시 로컬 위치 업데이트│                    │
 │:::::::::::::::▶│───────────────────────▶                    │
```

---

## 7. 방 타입별 색상 시스템

UI에서 방 타입을 시각적으로 구분한다. Tailwind + 인라인 SVG fill 사용.

| RoomType | 색상 (HSL) | Hex |
|----------|-----------|-----|
| `living` | hsl(220 80% 60%) | `#4d88e6` |
| `bedroom` | hsl(280 60% 60%) | `#9966cc` |
| `kitchen` | hsl(35 90% 55%) | `#f59e0b` |
| `bathroom` | hsl(180 60% 50%) | `#33b3b3` |
| `office` | hsl(200 70% 55%) | `#3399cc` |
| `corridor` | hsl(0 0% 55%) | `#8c8c8c` |
| `other` | hsl(0 0% 45%) | `#737373` |

---

## 8. 구현 순서 (Step-by-Step)

```
Step 01  backend/app/models/floor_models.py         신규 생성
Step 02  backend/app/services/floor_service.py      신규 생성
Step 03  backend/app/api/floor_router.py            신규 생성
Step 04  backend/app/main.py                        수정 (2줄 추가)
─────────── 백엔드 완료: uvicorn 재시작 후 API 동작 확인
Step 05  npm install react-router-dom d3            패키지 설치
         npm install -D @types/react-router-dom @types/d3
Step 06  frontend/vite.config.ts                    수정 (proxy /floor 추가)
Step 07  frontend/src/hooks/useFloorSimulation.ts    신규 생성
Step 08  frontend/src/components/FloorPlanner/index.tsx       신규 생성
Step 09  frontend/src/components/FloorPlanner/FloorCanvas.tsx 신규 생성
Step 10  frontend/src/components/FloorPlanner/RoomMatrixPanel.tsx 신규 생성
Step 11  frontend/src/components/FloorPlanner/FloorInspector.tsx  신규 생성
Step 12  frontend/src/components/FloorPlanner/ExportPanel.tsx     신규 생성
Step 13  frontend/src/App.tsx                        수정 (라우터 + 네비 링크)
Step 14  .env.example                                수정 (2줄 추가)
─────────── 프론트엔드 완료: /floor-planner 접근 확인
```

---

## 9. 완료 기준 (Done Criteria)

| 항목 | 검증 방법 |
|------|-----------|
| `GET /api/v1/floor/projects/{id}` 200 응답 | `curl` 또는 브라우저 |
| `POST .../simulate` rooms에 x,y 좌표 포함 | `curl` 또는 DevTools |
| `/floor-planner` 브라우저 접근 | `http://localhost:5173/floor-planner` |
| 방 드래그 시 캔버스 위치 업데이트 | 직접 드래그 테스트 |
| 인접도 슬라이더 → 연결선 굵기 변화 | 슬라이더 조작 테스트 |
| JSON 내보내기 `floor_planner_v1` 스키마 | 다운로드 후 JSON 확인 |
| 기존 `/` BIM 뷰어 정상 동작 (회귀 없음) | 기존 IFC 로드 테스트 |

---

## 10. 향후 확장 계획

| 기능 | 우선순위 | 메모 |
|------|---------|------|
| IFC export (IfcOpenShell) | 높음 | `bim_service.py` 패턴 참고 |
| DXF export (ezdxf) | 중간 | `pip install ezdxf` 필요 |
| PostgreSQL 마이그레이션 | 중간 | 기존 `Project` SQLAlchemy 모델 참고 |
| 자연어 명령 (FloorNLPCommand) | 낮음 | `nlp_service.py`의 Ollama 패턴 재사용 |
| 층간 연결 (계단/엘리베이터) | 낮음 | `FloorBoundary` 확장으로 구현 가능 |
| 실시간 시뮬레이션 스트리밍 | 낮음 | WS `simulation_step` 타입 확장 |

---

## 11. 관련 파일 참조

- [기존 아키텍처](./architecture.md)
- [기존 API 설계](./api-design.md)
- [BIM 엔진](./bim-engine.md)
- [NLP 설계](./nlp-design.md)
