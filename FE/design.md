# AGENT.md — BIM 3D Authoring Platform

> 7인 팀 기준 협업 및 유지보수 규칙.
> DESIGN.md, REQUIREMENTS.md와 함께 읽을 것.

---

## 왜 이 규칙들이 필요한가

7명이 동시에 같은 코드베이스를 수정하면 아래 문제가 반드시 발생한다.
- 같은 기능을 서로 다른 방식으로 구현 → 스타일 혼재
- API 호출 방식이 제각각 → 에러 처리 누락, 토큰 빠뜨림
- 파일 위치를 몰라서 찾는 데 시간 낭비
- 한 사람이 수정하면 다른 사람 코드가 깨짐
- "편의상" 만든 함수가 쌓여서 어디서 뭘 쓰는지 아무도 모르는 상태

이 파일은 그 문제를 예방하기 위한 팀 약속이다.

---

## 1. 기술 스택

| 역할 | 라이브러리 | 이유 |
|------|-----------|------|
| 코어 | React 18 + TypeScript + Vite | - |
| 라우팅 | react-router-dom v6 | - |
| 3D 뷰어 | @thatopen/components 3.4 | IFC 파싱·하이라이팅·툴바 완비 |
| 3D 편집 툴박스 | Three.js TransformControls + @thatopen/ui-obc | 이동/회전/스케일 기즈모 내장 |
| IFC | web-ifc 0.0.77 | @thatopen 내부 사용 |
| 2D 평면도 | Konva.js + react-konva | Transformer로 리사이즈/회전 핸들 내장 |
| 버블 다이어그램 | D3.js | force simulation |
| 상태관리 | Zustand + Immer | 불변성 관리 편함 |
| 서버 상태 | TanStack Query + Axios | 캐싱·로딩·에러 자동 관리 |
| 실시간 | @stomp/stompjs | WebSocket Delta |
| 단축키 | react-hotkeys-hook | Ctrl+Z, Redo 등 |
| UI | Tailwind CSS + shadcn/ui + lucide-react | - |
| PDF | jsPDF + html2canvas | - |

---

## 2. 레이어 구조 — 가장 중요한 규칙

```
Page → Hook → Service → (Mock or API)
              ↕
            Store
```

각 레이어가 하는 일과 하면 안 되는 일이 엄격히 구분된다.
**레이어를 넘나드는 코드는 즉시 리팩토링 대상이다.**

---

## 3. Page — "레이아웃과 조합만"

Page는 컴포넌트를 조합해서 화면을 구성하는 역할만 한다.
로직, API 호출, 상태 변경이 단 한 줄도 들어가면 안 된다.

```typescript
// ✅ 올바른 page
export default function ProjectsPage() {
  return (
    <main>
      <ProjectList />
      <ProjectCreateButton />
    </main>
  )
}

// ❌ 잘못된 page — 로직이 들어간 경우
export default function ProjectsPage() {
  const [projects, setProjects] = useState([])      // ❌ 상태
  useEffect(() => { api.get('/projects') }, [])     // ❌ API 호출
  const handleDelete = (id) => { ... }              // ❌ 핸들러
  return <div>...</div>
}
```

**Page에 있으면 안 되는 것:**
- useState (단, UI 전용 상태 — 모달 열림/닫힘 — 은 예외)
- useEffect
- API 호출
- 비즈니스 로직 함수
- Zustand store 직접 접근

---

## 4. Hook — "비즈니스 로직의 유일한 집결지"

모든 API 호출, 상태 조작, 사이드이펙트는 hook에서만 이루어진다.
컴포넌트는 hook을 호출해서 데이터와 액션만 받아간다.

```typescript
// hooks/useProjects.ts
export const useProjects = () => {
  // TanStack Query: 데이터 fetching
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectService.getList(),
  })

  // TanStack Query: 데이터 mutation
  const { mutate: createProject } = useMutation({
    mutationFn: projectService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  return { projects, isLoading, createProject }
}
```

**Hook 작성 규칙:**
- 파일명은 `use` prefix 필수
- 하나의 hook은 하나의 도메인만 담당 (projects, auth, viewer 등)
- hook 안에서 다른 hook을 합성하는 건 허용
- hook이 200줄 넘으면 분리 검토
- 반환값은 컴포넌트가 실제로 쓰는 것만 (불필요한 내부 상태 노출 금지)

---

## 5. Service — "Mock과 API의 전환점"

Service는 hook과 실제 API(또는 mock) 사이의 중간층이다.
API가 완성되면 이 파일만 수정하면 된다. 다른 파일은 건드리지 않는다.

```typescript
// services/project.service.ts
import { MOCK_PROJECTS } from '../mocks/project.mock'  // API 완성 후 삭제
// import { api } from '../lib/axios'                   // API 완성 후 주석 해제

export const projectService = {
  getList: async (): Promise<Project[]> => {
    return MOCK_PROJECTS
    // return api.get<Project[]>('/projects')
  },

  create: async (data: CreateProjectDto): Promise<Project> => {
    await new Promise(r => setTimeout(r, 300))  // 지연 시뮬레이션
    return { id: `mock-${Date.now()}`, ...data, ifc_uploaded: false }
    // return api.post<Project>('/projects', data)
  },
}
```

**Service 파일 목록 (이 외에 새로 만들지 않는다):**
```
services/
├── auth.service.ts
├── project.service.ts
├── viewer.service.ts
├── floor.service.ts
├── bubble.service.ts
└── comment.service.ts
```

**API 전환 시 작업:**
1. `src/mocks/` 폴더 삭제
2. 각 service 파일: mock import 삭제, axios 호출로 교체
3. 끝. 다른 파일은 변경 없음

---

## 6. Store — "전역 상태 저장소, 로직 없음"

Store는 상태를 저장하고 업데이트하는 역할만 한다.
API 호출, 비즈니스 로직, 사이드이펙트가 들어가면 안 된다.

```typescript
// stores/projectStore.ts
interface ProjectStore {
  currentProject: Project | null
  setCurrentProject: (project: Project | null) => void  // 단순 setter
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      currentProject: null,
      setCurrentProject: (project) =>
        set(produce(draft => { draft.currentProject = project })),
    }),
    { name: 'bim-project' }
  )
)
```

**스토어 분리 (도메인별):**
```
stores/
├── authStore.ts        → user, token
├── projectStore.ts     → currentProject
├── viewerStore.ts      → selectedElementId, activeTool, presence, locks, previews, authoringDraft
├── chatStore.ts        → messages
└── notificationStore.ts → notifications, unreadCount
```

**Store 규칙:**
- action은 단순 setter만 (복잡한 로직 금지)
- store 안에서 다른 store를 import 금지
- persist 대상: authStore(user, token), projectStore(currentProject)

---

## 7. Component — "받은 것을 렌더링하는 역할"

컴포넌트는 hook에서 받은 데이터를 화면에 그리고,
사용자 입력을 hook의 액션으로 전달하는 역할만 한다.

```typescript
// ✅ 올바른 컴포넌트
const ProjectCard = ({ project, onDelete }: ProjectCardProps) => {
  return (
    <div>
      <h3>{project.name}</h3>
      <button onClick={() => onDelete(project.id)}>삭제</button>
    </div>
  )
}

// ✅ hook을 쓰는 경우는 최상위 컴포넌트에서만
const ProjectList = () => {
  const { projects, isLoading, deleteProject } = useProjects()
  if (isLoading) return <Skeleton />
  return projects.map(p => <ProjectCard project={p} onDelete={deleteProject} />)
}
```

**컴포넌트 규칙:**
- 파일 하나에 컴포넌트 하나 (default export)
- 200줄 넘으면 분리
- props 타입은 `interface XxxProps`로 위에 정의
- 세 가지 상태 항상 처리: 빈 상태 / 로딩(skeleton) / 에러(메시지+재시도)
- CLIENT 유저 편집 버튼: `disabled` 아닌 조건부 렌더링(`hidden`)

---

## 8. 함수 작성 규칙 — "불필요한 함수를 만들지 않는다"

함수 남발은 어디서 뭘 쓰는지 파악을 어렵게 만들고 유지보수 비용을 높인다.

**함수를 만들기 전 체크리스트:**
1. 이 함수가 2곳 이상에서 쓰이는가? → 아니면 인라인으로 쓴다
2. 이 함수가 테스트 대상인가? → 아니면 인라인으로 쓴다
3. 이미 같은 역할의 함수가 있는가? → 있으면 새로 만들지 않는다
4. utils에 넣을 함수인가? → 순수 함수(입력→출력, 사이드이펙트 없음)만 utils에

```typescript
// ❌ 불필요한 추상화
const formatDate = (date: string) => new Date(date).toLocaleDateString()
const getProjectName = (project: Project) => project.name  // 이건 그냥 project.name
const isLoading = (state: boolean) => state === true       // 이건 그냥 state

// ✅ 인라인으로 충분
<span>{new Date(item.created_at).toLocaleDateString()}</span>
<h3>{project.name}</h3>
{isLoading && <Spinner />}
```

**utils에 넣는 것 (순수 함수만):**
```typescript
// utils/format.ts
export const mmToM = (mm: number) => mm / 1000
export const exportToPDF = async (elementId: string, filename: string) => { ... }
```

**utils에 넣으면 안 되는 것:**
- API 호출이 있는 함수 → service에
- 상태 변경이 있는 함수 → hook에
- React hook을 쓰는 함수 → hook으로 만들기

---

## 9. API 호출 규칙

**왜 axios 인스턴스인가:**
fetch 직접 사용 시 팀원마다 토큰 첨부·에러 처리 방식이 달라진다.
`lib/axios.ts` 하나에서 기본 URL, JWT 자동 첨부, 401 redirect, 공통 에러 처리를 통제한다.

**왜 TanStack Query인가:**
로딩·에러·캐시를 매번 직접 관리할 필요가 없다.
같은 queryKey를 여러 컴포넌트에서 쓰면 중복 요청도 자동으로 막힌다.

```typescript
// ❌ 직접 관리 (3개 상태를 매번 반복)
const [data, setData] = useState([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)
useEffect(() => {
  fetch('/projects').then(r => r.json()).then(setData)
    .catch(setError).finally(() => setLoading(false))
}, [])

// ✅ TanStack Query (한 줄)
const { data, isLoading, error } = useQuery({
  queryKey: ['projects'],
  queryFn: () => projectService.getList()
})
```

---

## 10. 실시간 — STOMP

STOMP 연결은 `useWebSocket` 훅 하나에서만 관리한다.
다른 컴포넌트에서 직접 STOMP 클라이언트를 생성하면 연결 중복, 메모리 누수 발생.

```
구독 토픽: /topic/project.{id}.*
발행 토픽: /app/presence.join, /app/selection.set
```

---

## 11. 편집 툴박스 라이브러리

별도 toolbox 라이브러리 없이 각 라이브러리 내장 기능을 사용한다.

**2D 평면도 (Konva):**
- `Konva.Transformer`: 선택된 도형에 리사이즈·회전 핸들 자동 표시
- `draggable`: 드래그 이동
- 별도 라이브러리 불필요

**3D 뷰어 (@thatopen):**
- `THREE.TransformControls`: 이동/회전/스케일 기즈모
- `@thatopen/ui-obc`: BIM 기능과 연결된 버튼·툴바·패널 컴포넌트
- `OBCF.Highlighter`: 선택 하이라이팅

---

## 12. @thatopen 규칙

@thatopen은 React 밖에서 동작하는 라이브러리다.
잘못 쓰면 메모리 누수가 쌓이고 장시간 사용 시 크래시가 발생한다.

- 초기화·해제는 `useBIMModel` 훅에서만
- unmount 시 `components.dispose()` 반드시 호출
- @thatopen 관련 코드는 `components/viewer-3d/`와 `hooks/useBIMModel.ts` 밖으로 나가지 않음
- Three.js 중복 import 경고는 `console.warn` 필터로 억제

---

## 13. 폴더 구조

```
src/
├── app/                   # 라우트 페이지 — 레이아웃과 조합만
│   ├── (auth)/
│   └── (main)/
├── components/            # UI 렌더링만
│   ├── viewer-3d/         # @thatopen 3D 뷰어
│   ├── planner-2d/        # Konva 2D 평면도
│   ├── diagram-bubble/    # D3 버블 다이어그램
│   ├── comment-pin/       # 댓글 핀
│   ├── project/           # 프로젝트 관리
│   └── common/            # 2곳 이상에서 쓰는 공통 컴포넌트
├── hooks/                 # 비즈니스 로직 (TanStack Query)
├── services/              # Mock ↔ API 전환점
├── mocks/                 # Mock 데이터 (API 완성 후 삭제)
├── stores/                # Zustand 상태 저장
├── types/                 # TypeScript 타입
├── lib/
│   ├── axios.ts           # axios 인스턴스 + JWT 인터셉터
│   └── stomp.ts           # STOMP 클라이언트
└── utils/                 # 순수 함수만 (사이드이펙트 없음)
```

---

## 14. 절대 하지 말 것

| 금지 | 이유 |
|------|------|
| Page에 로직 작성 | Page는 조합만 |
| Page에 API 호출 | hook 경유 필수 |
| Store에 API 호출 | store는 저장만 |
| Service 우회하여 axios 직접 호출 | mock 전환 불가 |
| `fetch` 직접 사용 | axios 인스턴스 사용 |
| `any` 타입 | 런타임 에러 |
| 1곳에서만 쓰는 util 함수 생성 | 인라인으로 작성 |
| 200줄 넘는 컴포넌트 | 분리 |
| CLIENT에게 편집 버튼 disabled | hidden 처리 |
| Three.js dispose 누락 | 메모리 누수 |
| STOMP 다중 연결 | useWebSocket 하나에서만 |
| mock을 컴포넌트/hook에 직접 | service 경유 필수 |