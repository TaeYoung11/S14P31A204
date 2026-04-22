# 안티그래비티 이식 프롬프트 v3 — 전체 요구사항 P1 기준

## Electron 래핑 고려사항

> **이 프로젝트는 추후 Electron으로 래핑할 것을 염두에 두고 설계한다.**
>
> - 프레임워크: **Vite + React + TypeScript** (Next.js 사용 금지)
> - Electron 적용 시 `electron-vite`로 전환. `renderer/` = 현재 `src/` 그대로 이전 가능
> - SSR 코드, `window is not defined` 방어 코드 불필요 (모두 CSR)
> - `electron/main.ts`, `electron/preload.ts`는 추후 Electron 래핑 시 추가
> - `BrowserRouter` 사용 (Next.js App Router 아님)
> - API 호출은 Renderer → 백엔드 직접 (Electron IPC 불필요한 경우)

---

## 필수 선행 지시

**프로젝트 루트의 `DESIGN.md`, `AGENT.md`, `REQUIREMENTS.md`를 반드시 먼저 읽고 구현할 것.**
UI는 DESIGN.md, 코드 규칙은 AGENT.md, 기능 범위는 REQUIREMENTS.md 기준.

---

## 기술 스택 및 패키지

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.6.2",

    "vite": "^5.4.8",
    "@vitejs/plugin-react": "^4.3.2",

    "react-router-dom": "^6.28.0",

    "@thatopen/components": "3.4.0",
    "@thatopen/components-front": "3.4.0",
    "@thatopen/fragments": "3.4.0",
    "three": "0.182.0",
    "web-ifc": "0.0.77",
    "camera-controls": "3.1.2",

    "d3": "^7.9.0",
    "konva": "^9.3.0",
    "react-konva": "^18.2.10",

    "zustand": "^5.0.0",
    "immer": "^10.1.1",

    "@tanstack/react-query": "^5.56.0",
    "@tanstack/react-query-devtools": "^5.56.0",
    "axios": "^1.7.0",

    "@stomp/stompjs": "^7.0.0",
    "sockjs-client": "^1.6.1",

    "react-hotkeys-hook": "^4.5.0",

    "tailwindcss": "^3.4.13",
    "tailwind-merge": "^2.5.3",
    "clsx": "^2.1.1",
    "lucide-react": "^0.451.0",

    "jspdf": "^2.5.1",
    "html2canvas": "^1.4.1",

    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.10",
    "@types/react-dom": "^18.3.0",
    "@types/three": "0.182.0",
    "@types/d3": "^7.4.3",
    "@types/sockjs-client": "^1.5.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47"
  },
  "overrides": {
    "three": "0.182.0",
    "camera-controls": "3.1.2"
  }
}
```

### 설치 후 설정
- `postinstall`: `web-ifc.wasm`, `web-ifc-mt.wasm` → `public/wasm/` 자동 복사
- `vite.config.ts` `optimizeDeps.exclude`: `['@thatopen/components', '@thatopen/components-front', '@thatopen/fragments']`
- shadcn/ui는 설치 후 `npx shadcn@latest init` 실행 (Tailwind 기반, components.json 생성)

---

## 라우팅 구조 (react-router-dom v6)

```
/login                        → 로그인
/register                     → 회원가입
/projects                     → 프로젝트 목록 (DESIGNER만)
/projects/:id                 → 프로젝트 메인
/projects/:id/bubble          → 버블 다이어그램
/projects/:id/floor           → 2D 평면도 (Konva)
/projects/:id/viewer          → 3D 뷰어 (@thatopen)
```

- 미인증 → `/login` redirect (`ProtectedRoute` 컴포넌트)
- CLIENT 유형 → `/projects/:id/viewer` 만 접근 가능

---

## 폴더 구조

```
src/
├── app/                      # 라우트 페이지 (로직 없음)
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   └── (main)/
│       ├── projects/page.tsx
│       └── projects/[id]/
│           ├── page.tsx
│           ├── bubble/page.tsx
│           ├── floor/page.tsx
│           └── viewer/page.tsx
├── components/
│   ├── viewer-3d/            # @thatopen 3D 뷰어
│   ├── planner-2d/           # Konva 2D 평면도
│   ├── diagram-bubble/       # D3 버블 다이어그램
│   ├── comment-pin/          # 댓글 핀
│   ├── project/              # 프로젝트 관리
│   └── common/               # 공통 컴포넌트
├── hooks/                    # TanStack Query 훅
├── services/                 # Service Layer (mock ↔ API 전환점)
├── mocks/                    # Mock 데이터 (API 완성 후 삭제)
├── stores/                   # Zustand + Immer
├── types/                    # TypeScript 타입
├── lib/
│   ├── axios.ts              # axios 인스턴스 + JWT 인터셉터
│   └── stomp.ts              # STOMP 클라이언트 설정
└── utils/
```

---

## 1. 인증 (P1)

### API (Service Layer 경유)
```
POST /api/v1/auth/login       → { email, password } → { access_token, user }
POST /api/v1/auth/register    → { email, password, name, user_type }
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### 구현
- JWT → localStorage `bim-token` 저장
- `lib/axios.ts`: 모든 요청에 `Authorization: Bearer {token}` 자동 첨부, 401 시 `/login` redirect
- `useAuth` 훅 (TanStack Query `useQuery` 사용)
- Zustand `authStore`: `{ user, token, setUser, setToken, logout }`
- `ProtectedRoute` 컴포넌트로 인증 페이지 보호

---

## 2. 프로젝트 관리 (P1)

### API
```
GET    /api/v1/projects
POST   /api/v1/projects         → { name, description }
PUT    /api/v1/projects/:id
DELETE /api/v1/projects/:id
POST   /api/v1/projects/:id/invite  → { email }
GET    /api/v1/projects/:id/members
```

### 구현
- `useProjects` 훅: TanStack Query `useQuery` + `useMutation`
- `ProjectListPage`: 프로젝트 카드 목록, 생성/수정/삭제
- `ProjectShareModal`: 이메일로 CLIENT 초대
- Mock: `mocks/project.mock.ts`에 샘플 2~3개

---

## 3. 3D 뷰어 — @thatopen/components (P1)

### useBIMModel 훅 (기존 코드 이식)
- `OBC.Components` → `OBC.Worlds` → `SimpleScene` + `SimpleCamera` + `SimpleRenderer`
- `OBC.Grids` 생성
- `OBC.FragmentsManager` 초기화 (`fragmentsWorkerUrl: @thatopen/fragments/worker?url`)
- `OBC.IfcLoader` setup: `autoSetWasm: false`, wasm path: `/wasm/`
- `OBCF.Highlighter` setup
- unmount 시 `components.dispose()` 필수

### 기능
- IFC 로드: `GET /api/v1/projects/:id/model` → ArrayBuffer → IfcLoader
- 오브젝트 선택: Highlighter select 이벤트 → expressID → 속성 조회 → store 저장
- 3D 좌표 피킹: Raycaster Z평면 교차 (mm 단위)
- 프리뷰 고스트: wall/slab/column 등 반투명 BoxGeometry
- 타겟 마커: 초록 Sphere + Line
- 스크린샷: `canvas.toDataURL('image/png')`

### 3D 핀 댓글 (P1)
- Three.js Sprite로 핀 렌더링
- 핀 클릭 시 CommentPanel 열기
- `GET/POST /api/v1/projects/:id/pins?type=3d`

### 치수 측정 (P1)
- 두 점 클릭으로 거리(mm) 측정 후 화면 표시

### 실사 렌더링 (P1)
- `POST /api/v1/projects/:id/render-preview`
- body: `{ image_b64, style: { time_of_day, viewpoint, season, weather }, denoising_strength }`
- response: `{ image_b64, prompt, generation_time_sec }`

### 단축키 (react-hotkeys-hook)
```typescript
useHotkeys('ctrl+z', () => undo())
useHotkeys('ctrl+shift+z', () => redo())
useHotkeys('escape', () => cancelTool())
```

---

## 4. 3D 모델 편집 (P1)

### 도구 목록
`select / wall / slab / column / beam / door / window / stair / roof / move / rotate / delete`

### 기본 치수 (mm)
| 도구 | 기본값 |
|------|--------|
| wall | length=4000, thickness=200, height=3000 |
| slab | length=6000, width=4000, thickness=250 |
| column | width=400, depth=400, height=3000 |
| beam | width=300, depth=4000, height=600, elevation=2500 |
| door | width=900, height=2100, sill_height=0 |
| window | width=1500, height=1200, sill_height=900 |
| stair | width=1200, depth=4200, height=3000 |
| roof | length=6000, width=4000, height=900, thickness=250, pitch=30 |

### API
```
POST   /api/v1/projects/:id/authoring/operations          → 요소 생성
POST   /api/v1/projects/:id/authoring/operations?mode=preview
DELETE /api/v1/projects/:id/elements/:guid
PUT    /api/v1/projects/:id/elements/:guid/move
PUT    /api/v1/projects/:id/elements/:guid/rotate
```

### LLM 채팅 (ChatPanel)
- `POST /api/v1/projects/:id/command?text={text}`
- 상태: `analyzing → modifying → success/error`
- STOMP으로 실시간 상태 업데이트 수신

---

## 5. 2D 평면도 — Konva.js (P1)

### 왜 Konva인가
기존 D3 기반 FloorCanvas는 force simulation 용도. 편집 기능(드래그, 리사이즈, 도형 그리기)은 Konva가 훨씬 적합.

### 구현
- `react-konva`의 `Stage` + `Layer`로 캔버스 구성
- 방(Room) 사각형: 드래그, 리사이즈, 선택
- 벽선 그리기: Line 도구
- 층 전환: 드롭다운으로 storey 선택
- 층 겹쳐보기: 다른 층을 opacity 0.3으로 오버레이
- 2D 핀 댓글: Konva Circle로 핀 렌더링

### API
```
GET /api/v1/projects/:id/floor
PUT /api/v1/projects/:id/floor
POST /api/v1/projects/:id/floor/command?text={text}   → LLM 수정
POST /api/v1/projects/:id/floor/undo
POST /api/v1/projects/:id/floor/redo
```

---

## 6. 버블 다이어그램 — D3.js (P1)

### 구현
- D3 force simulation으로 버블 노드 배치
- 버블 생성/편집/삭제/연결
- Zone 그룹핑 (같은 색 = 같은 Zone, 헐 렌더링)
- 버블 → 평면도 생성 연동

### API
```
GET /api/v1/projects/:id/bubble
PUT /api/v1/projects/:id/bubble
POST /api/v1/projects/:id/bubble/undo
POST /api/v1/projects/:id/bubble/redo
```

---

## 7. 댓글 핀 시스템 (P1)

```
GET    /api/v1/projects/:id/pins                    → 핀 목록 (type: 2d|3d)
POST   /api/v1/projects/:id/pins                    → 핀 생성
GET    /api/v1/projects/:id/pins/:pinId/comments
POST   /api/v1/projects/:id/pins/:pinId/comments    → { content }
PUT    /api/v1/projects/:id/pins/:pinId/comments/:commentId
DELETE /api/v1/projects/:id/pins/:pinId/comments/:commentId
PATCH  /api/v1/projects/:id/pins/:pinId/resolve     → 핀 완료 (하위 댓글 전체 완료)
```

---

## 8. Undo / Redo / 저장 (P1)

```
POST /api/v1/projects/:id/undo
POST /api/v1/projects/:id/redo
POST /api/v1/projects/:id/save
GET  /api/v1/projects/:id/history
```

- `react-hotkeys-hook`: Ctrl+Z → undo, Ctrl+Shift+Z → redo

---

## 9. 실시간 협업 — @stomp/stompjs (P1)

### 연결 설정 (`lib/stomp.ts`)
```typescript
const client = new Client({
  brokerURL: 'ws://localhost:8000/ws',
  // 또는 SockJS fallback:
  // webSocketFactory: () => new SockJS('http://localhost:8000/stomp')
  reconnectDelay: 3000,
})
```

### 구독 토픽
```
/topic/project.{id}.model     → model_update, model_reset
/topic/project.{id}.presence  → presence.state
/topic/project.{id}.locks     → lock.state
/topic/project.{id}.previews  → preview.state
/topic/project.{id}.pins      → pin.new
/queue/processing.{sessionId} → LLM 처리 상태
```

### 발행 토픽
```
/app/presence.join    → { session_id, display_name, user_type }
/app/selection.set    → { session_id, selection: expressID }
```

### 수신 메시지 처리 (useWebSocket 훅)
| 타입 | 처리 |
|------|------|
| `model_update` | setModelRevision + CustomEvent('bim-model-update') |
| `model_reset` | CustomEvent('bim-model-reset') → reload |
| `processing` | updateLastMessageStatus |
| `presence.state` | setPresence |
| `lock.state` | setLocks |
| `preview.state` | setPreviews |
| `pin.new` | notifications 추가 |
| `commit.accepted` | setModelRevision |
| `commit.rejected` | updateLastMessageStatus('error') |

---

## 10. Zustand + Immer 스토어

```typescript
// Immer 적용 예시
import { produce } from 'immer'

const useViewerStore = create<ViewerStore>((set) => ({
  selectedElementId: null,
  setSelectedId: (id) => set(produce(draft => {
    draft.selectedElementId = id
  })),
}))
```

### 스토어 분리
- `authStore`: user, token
- `projectStore`: currentProject
- `viewerStore`: selectedElementId, selectedElementProperties, modelRevision, authoringSession, presence, locks, previews, activeTool, activeStoreyGuid, authoringDraft
- `chatStore`: messages
- `notificationStore`: notifications, unreadCount

persist 미들웨어: `authStore`(user, token), `projectStore`(currentProject) → localStorage `bim-storage`

---

## 11. TanStack Query 설정

```typescript
// main.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,  // 5분
    },
  },
})
```

### 훅 패턴 (Service Layer 경유)
```typescript
// hooks/useProjects.ts
export const useProjects = () => useQuery({
  queryKey: ['projects'],
  queryFn: () => projectService.getList(),
})

export const useCreateProject = () => useMutation({
  mutationFn: projectService.create,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
})
```

---

## 12. Mock → Real API 전환 구조

```
services/
├── auth.service.ts       ← mock import 줄만 삭제하면 API 전환
├── project.service.ts
├── viewer.service.ts
├── floor.service.ts
├── bubble.service.ts
└── comment.service.ts

mocks/                    ← API 완성 후 폴더째 삭제
├── auth.mock.ts
├── project.mock.ts
├── viewer.mock.ts
├── floor.mock.ts
├── bubble.mock.ts
└── comment.mock.ts
```

Mock 데이터 규칙:
- 실제 API 응답 타입과 동일한 구조
- ID는 `'mock-1'`, `'mock-2'` 형태로 명시
- 최소 2~3개 데이터 포함
- 지연 시뮬레이션: `await new Promise(r => setTimeout(r, 300))`

---

## 13. PDF 내보내기 — jsPDF + html2canvas

```typescript
// utils/export.ts
export const exportToPDF = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId)
  const canvas = await html2canvas(element)
  const pdf = new jsPDF()
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297)
  pdf.save(filename)
}
```

---

## 14. 주의사항

- `@thatopen` 관련 코드는 `components/viewer-3d/`와 `hooks/useBIMModel.ts` 밖으로 나가지 않음
- Three.js 중복 import 경고는 `console.warn` 필터로 억제 (`main.tsx`)
- CLIENT 유저: 편집 버튼 `hidden` 처리 (disabled 아닌 hidden)
- wasm 경로: `/wasm/web-ifc.wasm`, `/wasm/web-ifc-mt.wasm`
- STOMP 연결은 `useWebSocket` 훅 하나에서만 관리
- TanStack Query devtools는 개발 환경에서만 렌더링