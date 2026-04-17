# 🏗️ AI 기반 자연어 BIM 3D 편집 서비스 기획서

> **작성일**: 2026-04-12  
> **버전**: v1.1  
> **팀 구성**: 7인 × 5주 개발 (MVP) | 장기 로드맵 포함

---

## 1. 서비스 개요

### 서비스명 (가칭)

**BIM Chat** *(Conversational BIM Authoring Tool)*

### 한 줄 정의

> 채팅창에 한국어로 말하면 건물 3D 모델이 실시간으로 바뀌는, 건축가를 위한 AI BIM 편집 서비스

### 핵심 가치

| 가치 | 설명 |
|------|------|
| ⚡ **직관성** | BIM 소프트웨어를 몰라도 자연어로 설계 변경 가능 |
| 🔄 **실시간성** | 명령 입력 후 3D 뷰어에 즉시 반영, 딜레이 없는 피드백 |
| 🧠 **지능화** | 로컬 LLM이 모호한 명령을 이해하고 재질문으로 보완 |
| 🔒 **프라이버시** | 도면 데이터가 외부 클라우드로 나가지 않는 온프레미스 AI |
| 💾 **호환성** | IFC 표준 포맷 지원으로 Revit, ArchiCAD 등과 완전 호환 |
| 🌊 **예측·시뮬레이션** | 물리 엔진·CFD로 완공 전 건물 거동을 가상으로 검증 |
| 🌐 **현실 연동** | IoT·드론 스캔 데이터와 BIM 모델을 실시간으로 동기화 |
| ♻️ **생애주기 관리** | 설계·시공·운영·철거까지 전 주기 비용·탄소 관리 |

### 사람을 돕는 순간

- **건축사무소 직원**: "3층 회의실 벽 유리로 바꾸고 창문 2개 추가해줘" → 클릭 몇 번 없이 즉각 반영
- **현장 감리사**: 태블릿으로 채팅하면서 설계 변경 사항 실시간 확인
- **발주처 담당자**: 전문 BIM 툴 없이도 변경 내역을 3D로 시각 확인 및 리뷰
- **신입 건축 엔지니어**: BIM 소프트웨어 러닝커브 없이 도면 수정 참여

---

## 2. 왜 이 서비스인가

### 공백 이유

기존 BIM 툴(Revit, ArchiCAD, Navisworks)은:

- **높은 진입 장벽**: 수개월의 학습 기간, 고가 라이선스($3,000+/년)
- **반복 작업**: 간단한 변경도 복잡한 GUI 메뉴 탐색 필요
- **실시간 협업 부재**: 파일 기반 공유로 버전 충돌 빈번
- **AI 미비**: LLM 기반 자동화 기능 거의 없음

반면, 건축/건설 현장에서는:

- 설계 변경 요청의 **70% 이상이 단순 속성 변경** (재질·크기·위치)
- 비전문가도 도면 수정에 참여해야 하는 협업 구조 확대
- 국내 BIM 의무화 확대 (2030년 공공 발주 전면 BIM 적용)

### 주요 타깃 사용자

| 세그먼트 | 규모 | 페인포인트 |
|---------|------|------------|
| **중소 건축사무소** (1~20인) | 국내 約 5,000개 | 전담 BIM 담당자 부재, 라이선스 비용 부담 |
| **건설사 설계팀** | 시공사·CM사 설계 부서 | 반복적인 소규모 설계 변경 업무 |
| **건축 교육기관** | 대학교 건축학과 | 학습용 BIM 도구 접근성 부족 |
| **공공기관 발주처** | 지자체·공기업 | BIM 의무화 대응, 비전문가 검토 필요 |

### 주요 지원 앱 (초기 타깃)

- **웹 브라우저** (Chrome/Edge) - 설치 없는 즉시 접속
- **Tablet Web** - 현장 감리용 모바일 지원
- *(확장 예정)* Revit Plugin, VS Code Extension

---

## 3. 핵심 기능

### 3-1. 자연어 BIM 명령 처리 엔진

사용자의 한국어 발화를 구조화된 BIM 명령 JSON으로 변환하는 AI 파이프라인.

```
입력: "3층 회의실 서쪽 벽 유리로 바꾸고 창문 2개 추가해줘"
  ↓ Qwen2.5-7B (Ollama, 로컬 GPU)
출력: { action: "modify", target: { floor: 3, room: "회의실", element: "wall" },
        changes: { material: "glass", openings: [{type:"window", count:2}] } }
```

- **재질문 로직**: confidence < 0.7 이면 자동으로 명확화 질문 생성
- **컨텍스트 유지**: 최근 8턴 대화 기억, 연속 명령 처리 가능
- **한국어 건축 용어 사전**: BIM 도메인 특화 프롬프트 설계

### 3-2. 실시간 IFC 수정 및 3D 뷰어 연동

명령 처리 결과가 WebSocket을 통해 즉시 3D 공간에 반영.

- WebSocket Delta 전송: 변경된 요소만 전달 (전체 IFC 재로드 없음)
- IFC 2x3 / IFC4 표준 지원 (IfcOpenShell 기반)
- **@thatopen/components** 기반 WebGL 렌더러 (Three.js 위에서 동작)
- 작도 미리보기: Ghost 지오메트리로 커밋 전 3D 시각화 지원

### 3-3. 인터랙티브 Floor Planner (2D 평면도 편집기)

Canvas 기반 2D 방 배치 편집기 + Force-Directed 물리 시뮬레이션 자동 배치 도구.

- 방 추가/삭제/크기 조정 (이름·타입·크기·층 입력)
- 인접도 매트릭스로 방 간 연결 강도 설정 (0~1)
- 자동 배치 시뮬레이션 (스프링+충돌 물리 기반) → 1클릭으로 최적 레이아웃 생성
- WebSocket 실시간 드래그 동기화 (다중 클라이언트 방 위치 공유)
- JSON / IFC 포맷 내보내기 (DXF는 미구현)

### 3-4. 포토리얼리스틱 렌더링 (AI 이미지 생성)

3D BIM 뷰어 화면을 Stable Diffusion img2img로 사실적인 건축 투시도로 변환.

- Stable Diffusion WebUI (로컬 RTX 4050 GPU) 연동
- 렌더링 스타일 선택: 낮/저녁/야경, 외관/인테리어, 계절 등
- 생성된 이미지 다운로드 및 발주처 제출용 PT 자료化

### 3-5. 자연어 BIM 조회 및 리포트

- "각 층 면적 알려줘" → IFC 속성 집계 → 테이블/차트 출력
- "창문 몇 개야?" → 요소 카운트 자동화
- 수정된 IFC 파일 다운로드 + 변경 이력 PDF 리포트 생성

### 3-6. 변경 이력 관리 (Undo/Redo)

- IFC 파일 스냅샷 기반 전체 이력 추적 (매 명령 전 백업 저장)
- REST API: `POST /projects/{id}/undo`, `POST /projects/{id}/redo`
- HistoryPanel에서 변경 이력 타임라인 확인

### 3-7. 작도 시스템 (Authoring)

GUI 팔레트로 BIM 요소를 직접 생성·수정·삭제하는 작도 워크플로.

- 12종 작도 도구: wall, slab, column, beam, door, window, stair, roof, move, rotate, delete, select
- **Preview → Commit** 2단계 워크플로: Ghost 지오메트리로 미리 확인 후 확정
- Redis 기반 세션·잠금(Lock) 관리: 동일 영역 동시 편집 충돌 방지
- 작도 세션 상태(presence·lock·preview)를 WebSocket으로 실시간 브로드캐스트

### 3-8. (예정) 건축 법규 자동 검토

- "이 설계 건폐율 기준 맞나?" → 층별 면적 자동 계산 + 법규 기준 대조
- 일조권, 주차 대수, 높이 제한 등 국내 건축법 기반 자동 검증

---

## 4. 기술 스택

### Backend

| 항목 | 기술 | 역할 |
|------|------|------|
| API 서버 | **FastAPI** (Python 3.11) | 비동기 REST + WebSocket |
| BIM 엔진 | **IfcOpenShell** | IFC 파일 파싱·수정·생성 |
| AI 추론 | **Ollama** + Qwen2.5-7B Q4_K_M | 로컬 LLM, 30~40 tok/s |
| 구조화 출력 | **instructor** + Pydantic v2 | 안정적 JSON 출력 보장 |
| 실시간 통신 | **WebSocket** (FastAPI 내장) | Delta 브로드캐스트 |
| DB | **PostgreSQL** | 프로젝트·변경이력 관리 |
| 캐시·큐 | **Redis** | 세션, 비동기 작업 큐 |
| 렌더링 AI | **Stable Diffusion WebUI** | img2img 포토리얼리스틱 |

### Frontend

| 항목 | 기술 | 역할 |
|------|------|------|
| UI 프레임워크 | **React 18** + TypeScript | SPA 구성 |
| 3D 렌더러 | **@thatopen/components** (Three.js 기반) | WebGL IFC 뷰어, 요소 선택, Ghost 미리보기 |
| 2D 에디터 | **Canvas API** (커스텀) | Force 시뮬레이션 Floor Planner |
| 라우팅 | **react-router-dom v6** | `/` BIM Viewer, `/floor-planner` 전환 |
| 상태 관리 | **Zustand** (단일 useStore) | 전역 BIM·작도·채팅 상태 |
| 스타일 | **Tailwind CSS** | 유틸리티 CSS |
| 빌드 | **Vite** | HMR 개발 환경 |

### AI/NLP

| 항목 | 내용 |
|------|------|
| LLM | Qwen2.5-7B-Instruct (한국어 특화, 오픈소스) |
| VRAM 사용 | ~4.5GB (RTX 4050 6GB 기준 여유 있음) |
| 추론 속도 | 30~40 token/s |
| 이미지 생성 | Stable Diffusion 1.5 / SDXL (img2img) |

---

## 5. 시스템 아키텍처

```
┌───────────────────────────────────────────────────────────────────────┐
│                    사용자 브라우저 (React SPA)                          │
│                                                                        │
│  [Route: /]  BIM Viewer              [Route: /floor-planner]           │
│  ┌──────────┐ ┌────────────────────┐  ┌──────────────────────────────┐│
│  │ChatPanel │ │ Viewer3D           │  │ FloorPlanner                 ││
│  │(자연어)  │ │ (@thatopen/comps)  │  │ FloorCanvas + RoomMatrix     ││
│  ├──────────┤ ├────────────────────┤  ├──────────────────────────────┤│
│  │History   │ │ AuthoringPanel     │  │ CreativePanel + ExportPanel  ││
│  │Panel     │ │ (작도 도구 팔레트)  │  │ (렌더 스타일 + IFC/JSON)     ││
│  ├──────────┤ ├────────────────────┤  └──────────────────────────────┘│
│  │Property  │ │ RenderPreviewModal │   Hook: useFloorSimulation        │
│  │Panel     │ │ (SD img2img)       │                                   │
│  └──────────┘ └────────────────────┘                                  │
│  Hook: useWebSocket, useBIMModel, useAuthoringSession                  │
└──────────────────────────┬────────────────────────┬───────────────────┘
                           │ REST + WebSocket        │ REST /api/v1/floor
                           ▼                         ▼
┌───────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (port 8000)                       │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────────┐ │
│  │ NLP Service │ │ BIM Service  │ │ Authoring  │ │ Floor Service  │ │
│  │ Ollama/Qwen │→│ IfcOpenShell │ │ Service    │ │ Force Sim      │ │
│  └─────────────┘ └──────────────┘ │ + State    │ └────────────────┘ │
│  ┌─────────────┐ ┌──────────────┐ └────────────┘ ┌────────────────┐ │
│  │ PostgreSQL  │ │   Redis      │                 │ Render Service │ │
│  │ (이력·메타) │ │ (세션·잠금)  │                 │ Stable Diffusion│ │
│  └─────────────┘ └──────────────┘                 └────────────────┘ │
│                                                                        │
│  External:  Ollama (localhost:11434, Qwen2.5-7B)                      │
│             Stable Diffusion WebUI (localhost:7860)                    │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 6. 비즈니스 모델

### 개인 구독 (B2C)

| 플랜 | 가격 | 제공 기능 |
|------|------|-----------|
| **Free** | 무료 | IFC 뷰어 + 기본 조회 (자연어 수정 미지원) |
| **Pro** | ₩29,000/월 | 자연어 수정 + Floor Planner + 이력 관리 |
| **Creator** | ₩59,000/월 | Pro + 포토리얼리스틱 렌더링 + 리포트 PDF |

### 가족/팀 구독

| 플랜 | 가격 | 제공 기능 |
|------|------|-----------|
| **Team (5인)** | ₩99,000/월 | Creator 기능 × 5 계정 + 실시간 협업 |
| **Studio (20인)** | ₩299,000/월 | Team + 우선 지원 + 커스텀 재질 라이브러리 |

### 지자체 / 공공기관 (B2G)

- **온프레미스 라이선스**: 연간 계약, 내부망 설치 가능 (데이터 외부 유출 없음)
- 국내 BIM 의무화 대응 컨설팅 포함
- 제안금액: 기관 규모별 협상 (예: 지자체 건축과 ₩3,000만~1억/년)

### 기업 CSR (B2B)

- **건설사·건축사무소 엔터프라이즈**: 전용 서버 + API 연동
- Revit/ArchiCAD 플러그인 OEM 공급
- BIM 데이터 분석 리포트 정기 제공 (월간 AI 건축 인사이트)

---

## 7. 경쟁 우위

| 비교 항목 | BIM Chat | Revit | ArchiCAD | Speckle |
|----------|----------|-------|----------|---------|
| **자연어 편집** | ✅ 완전 지원 | ❌ | ❌ | ❌ |
| **로컬 AI 추론** | ✅ (온프레미스) | ❌ | ❌ | ❌ |
| **한국어 최적화** | ✅ Qwen2.5 | ❌ | ❌ | ❌ |
| **IFC 호환** | ✅ IFC 2x3/4 | ✅ | ✅ | ✅ |
| **웹 기반 접속** | ✅ 브라우저 | ❌ | ❌ | ✅ |
| **설치 비용** | 무료 시작 | $3,000+/년 | $2,500+/년 | 오픈소스 |
| **Floor Planner** | ✅ Canvas + Force Sim | ✅ | ✅ | ❌ |
| **AI 렌더링** | ✅ (Stable Diffusion) | 외부 연동 필요 | 외부 연동 필요 | ❌ |
| **프라이버시** | ✅ 로컬 처리 | ☁️ 클라우드 | ☁️ 클라우드 | ☁️ 클라우드 |
| **Generative Design** | 🔜 로드맵 (Phase 2) | 제한적 지원 | ❌ | ❌ |
| **물리 시뮬레이션 (CFD)** | 🔜 로드맵 (Phase 3) | 외부 툴 필요 | 외부 툴 필요 | ❌ |
| **디지털 트윈 (IoT)** | 🔜 로드맵 (Phase 3) | 외부 툴 필요 | ❌ | ❌ |
| **5D/6D BIM (생애주기)** | 🔜 로드맵 (Phase 4) | ✅ (고가) | 제한적 | ❌ |
| **건축 법규 자동 검토** | 🔜 로드맵 (Phase 2) | ❌ | ❌ | ❌ |

**핵심 차별점**: "로컬 GPU + 자연어 + IFC 표준" 3가지를 동시에 충족하며, Generative Design → 디지털 트윈 → 생애주기 관리까지 단일 플랫폼으로 확장 가능한 유일한 오픈소스 기반 솔루션

---

## 8. 개발 계획 (7명 × 5주)

### 역할 분배

| 포지션 | 담당자 수 | 주요 책임 |
|--------|-----------|-----------|
| **Frontend** | 2명 | React/Three.js 3D 뷰어, Floor Planner, UI/UX |
| **Backend/AI** | 2명 | FastAPI, NLP Service, Ollama 연동 |
| **BIM 엔진** | 1명 | IfcOpenShell, Delta 계산, IFC 내보내기 |
| **인프라/DevOps** | 1명 | Docker, PostgreSQL, Redis, CI/CD |
| **기획/QA** | 1명 | 유저 테스트, 기능 명세, 데모 준비 |

### 주차별 목표

#### 1주차 — 환경 세팅 + PoC

| 항목 | 담당 | 완료 기준 |
|------|------|-----------|
| 프로젝트 기본 구조 (Vite + FastAPI + Docker) | 인프라 | `docker-compose up` 정상 기동 |
| Ollama + Qwen2.5-7B 연동 | Backend/AI | 자연어 → BIM JSON 변환 확인 |
| IFC 3D 뷰어 기본 동작 | Frontend | IFC 파일 로드 → Three.js 렌더링 |
| PostgreSQL 스키마 설계 | 인프라 | 프로젝트·이력 테이블 마이그레이션 |
| Stable Diffusion WebUI 연동 테스트 | Backend/AI | img2img API 호출 성공 |

#### 2주차 — AI 파이프라인 + 프록시 구현

| 항목 | 담당 | 완료 기준 |
|------|------|-----------|
| NLP Service (instructor + Pydantic) | Backend/AI | BIMCommand 구조체 안정적 생성 |
| BIM Service (IFC 속성 수정) | BIM 엔진 | 재질 변경 → IFC 저장 |
| WebSocket Delta 전송 | Backend | Delta JSON → 프론트 수신 확인 |
| 채팅 UI (ChatPanel) | Frontend | 메시지 입출력, 로딩 스피너 |
| 변경 요소 하이라이트 | Frontend | 수정 요소 3초 노란색 강조 |

#### 3주차 — 표준 UI + 앱 개발

| 항목 | 담당 | 완료 기준 |
|------|------|-----------|
| Floor Planner 완성 | Frontend | 방 배치 시뮬레이션 + JSON 내보내기 |
| 기하학적 수정 (창문·문 추가) | BIM 엔진 | IfcOpeningElement 생성 + 3D 반영 |
| HistoryPanel + Undo/Redo | Frontend + Backend | "이전으로 돌려줘" 자연어 Undo |
| PropertyPanel (요소 클릭 → 속성 표시) | Frontend | 요소 선택 → 속성 팝업 |
| 포토리얼리스틱 렌더링 UI | Frontend | Render 버튼 → AI 이미지 다운로드 |

#### 4주차 — 사용자 테스트

| 항목 | 담당 | 완료 기준 |
|------|------|-----------|
| 내부 알파 테스트 (7인 팀) | 전체 | 주요 버그 리스트 작성 |
| 자연어 조회 기능 | Backend/AI | "각 층 면적" → 테이블 출력 |
| IFC 다운로드 + PDF 리포트 | BIM 엔진 | 파일 다운로드 E2E 확인 |
| 반응형 UI 완성 | Frontend | 태블릿 해상도 정상 동작 |
| 버그 수정 및 성능 개선 | 전체 | Critical 버그 0건 |

#### 5주차 — 고도화 + 데모 준비

| 항목 | 담당 | 완료 기준 |
|------|------|-----------|
| LOD 최적화 (대용량 IFC) | Frontend | 50MB IFC 파일 유사 FPS 유지 |
| 건축 법규 검토 PoC | Backend/AI | 건폐율 자동 계산 API |
| 데모 시나리오 영상 제작 | 기획/QA | 3분 핵심 데모 영상 완성 |
| README + 기술 문서 정리 | 전체 | GitHub README 최종본 |
| QA 최종 검증 + 배포 | 인프라 | Docker 이미지 배포 완료 |

---

## 9. MVP 정의

MVP는 아래 5가지 핵심 플로우를 완전히 작동시키는 것으로 정의한다.

| # | MVP 시나리오 | 성공 기준 |
|---|------------|-----------|
| 1 | IFC 파일 업로드 → 3D 뷰어 표시 | 5초 내 렌더링 |
| 2 | 자연어 입력 → BIM 속성 수정 → 3D 즉시 반영 | 재질/두께 변경 성공률 90%+ |
| 3 | Floor Planner 방 배치 → JSON 내보내기 | 시뮬레이션 수렴 + 파일 다운로드 |
| 4 | "이전으로 돌려줘" → Undo 동작 | 최근 10단계 Undo 지원 |
| 5 | 3D 뷰어 → AI 포토리얼리스틱 렌더링 이미지 생성 | 30초 내 이미지 출력 |

**MVP 제외 항목** (Phase 2+ 예정)
- 건축 법규 자동 검토 전체 구현
- 모바일 네이티브 앱
- 클라우드 SaaS 배포

> **참고**: 다중 사용자 실시간 협업의 기반(presence·lock·preview WebSocket 브로드캐스트, 작도 세션 잠금)은 구현 완료. CRDT 기반 완전 동시 편집은 Phase 2 예정.

---

## 10. 리스크 및 대응 방안

| # | 리스크 | 발생 가능성 | 영향도 | 대응 방안 |
|---|--------|------------|--------|-----------|
| 1 | **IFC 지오메트리 수정 복잡성** | 높음 | 높음 | 1주차에는 속성(재질·두께)만 수정, 지오메트리는 2주차부터 점진적 구현 |
| 2 | **RTX 4050 6GB VRAM 부족** | 중간 | 높음 | 컨텍스트 4096 토큰 제한, Stable Diffusion 사용 시 Ollama 언로드 후 실행 |
| 3 | **LLM 한국어 BIM 명령 오파싱** | 중간 | 중간 | few-shot 프롬프트 예제 추가, confidence < 0.7 시 자동 재질문 |
| 4 | **대용량 IFC(50MB+) 렌더링 지연** | 중간 | 중간 | Delta 업데이트, Three.js LOD, Frustum Culling 적용 |
| 5 | **IfcOpenShell Windows 호환성** | 낮음 | 높음 | conda 환경 사용 또는 WSL2 fallback 가이드 준비 |
| 6 | **Stable Diffusion WebUI 연동 실패** | 중간 | 낮음 | Pollinations.ai API를 대체 옵션으로 준비 (외부 API) |
| 7 | **5주 내 일정 초과** | 중간 | 중간 | Week 4에 기능 Freeze, 남은 1주는 안정화만 진행 |
| 8 | **IFC 표준 버전 충돌** | 낮음 | 중간 | IFC 2x3 우선 지원 후 IFC4 확장, 입력 시 버전 자동 감지 |
| 9 | **보안: 도면 데이터 유출 우려** | 낮음 | 매우 높음 | 모든 AI 연산 로컬 처리 원칙 유지, 외부 API 사용 시 명시적 동의 |
| 10 | **팀 내 BIM 도메인 지식 부족** | 중간 | 중간 | 1주차 BIM 전문 용어 스터디 세션, IfcOpenShell 문서 공유 |

---

## 11. 미래 로드맵 (Phase 2~4)

> 아래 기능들은 MVP(5주) 완료 후 단계적으로 구현하는 장기 비전입니다.
> 기술 타당성과 팀 역량을 고려하여 Phase별로 우선순위를 조정합니다.

### Phase 2 — AI 지능화 (MVP 완료 후 1~2개월)

#### 🤖 초지능형 AI 설계 어시스턴트 (Generative Design)

현재는 사용자의 명령을 수행하는 수준이지만, AI가 **적극적으로 설계를 제안**하는 단계로 발전합니다.

| 기능 | 설명 | 구현 방향 |
|------|------|----------|
| **자율 레이아웃 생성** | "이 부지에 1인 가구 20세대가 들어갈 가장 효율적인 평면도 5개를 뽑아줘" → AI가 대지 조건과 법규를 고려해 평면 자동 설계 | LLM + Floor Planner Force 시뮬레이션 조합 |
| **실시간 에너지 최적화** | 벽 위치·창문 크기 변경 시마다 AI가 일조량·탄소 배출량을 실시간 시뮬레이션하여 친환경 설계 추천 | Python의 `ladybug-tools` 또는 자체 경량 계산 엔진 |
| **스케치 투 BIM (Sketch-to-BIM)** | 종이에 그린 평면도를 사진 찍어 올리면 AI가 즉시 정교한 3D IFC 모델로 변환 | Vision-Language 모델 (LLaVA 또는 GPT-4V API) + IfcOpenShell 생성 |

**5주 MVP와의 차이**: MVP는 "명령 → 수정"이지만, Phase 2는 "AI → 자율 제안" 방향으로 역할 전환

#### 🎨 AI 인테리어 스타일링

- "이 방을 북유럽 스타일로 꾸며줘" → 가구 배치부터 조명·텍스처까지 AI가 수초 내 렌더링 완성
- Stable Diffusion ControlNet + 공간 구조 정보 결합
- 생성된 이미지를 참고해 IFC 재질 속성에 역으로 반영

---

### Phase 3 — 시뮬레이션 & 현실 연동 (2~4개월)

#### 🌊 물리 엔진 기반 고성능 시뮬레이션

모델링을 넘어, 이 건물이 **실제 세상에서 어떻게 작동할지**를 예측합니다.

| 기능 | 설명 | 구현 후보 기술 |
|------|------|---------------|
| **CFD 유체 역학 시뮬레이션** | 창문을 열었을 때 자연 환기 흐름, 화재 시 연기 확산 경로를 실시간 시각화 | OpenFOAM (오픈소스 CFD), Three.js 파티클 렌더링 |
| **군집 피난 시뮬레이션** | 수백 명의 가상 에이전트(NPC)를 투입해 비상 대피 경로와 병목 현상 테스트 | Mesa (Python Agent-Based) + D3 시각화 |
| **구조 한계 테스트** | 지진(진도별)·강풍 발생 시 어느 부위에 응력이 집중되는지 물리 엔진으로 검증 | FEniCSx (유한요소법 오픈소스) 또는 외부 API 연동 |

> ⚠️ **기술 타당성 주의**: CFD / FEM 계산은 GPU 자원을 매우 많이 소모합니다. MVP 환경(RTX 4050 6GB)에서는 경량 근사 계산으로 시작하고, 점진적으로 full-scale 시뮬레이션으로 전환을 권장합니다.

#### 🌐 현실 세계와의 동기화 (Digital Twin & XR)

화면 속의 모델을 **현실의 물리적 공간**과 연결합니다.

| 기능 | 설명 | 구현 방향 |
|------|------|----------|
| **IoT 센서 연동 (Live Data)** | 건물의 실제 온도·습도·전력·유동 인구 데이터를 3D 모델 위에 실시간 시각화 (디지털 트윈) | MQTT 브로커 + WebSocket → Three.js 히트맵 오버레이 |
| **MR 시공 가이드** | 현장에서 AR 기기를 쓰고 벽을 보면 내부 배관·전선 위치를 엑스레이처럼 표시 | WebXR API (브라우저 기반) + IFC 레이어 필터링 |
| **드론 스캔 vs 설계 비교** | 매일 드론 포인트 클라우드 스캔 결과를 BIM 설계 도면과 자동 비교, 시공 오차 (cm 단위) 감지 | Open3D (포인트 클라우드 처리) + IFC 좌표계 매칭 |

---

### Phase 4 — 생애주기 관리 (5D & 6D BIM) (4~6개월)

#### 💰 경제 및 생애주기 전주기 관리

건축 이후의 **수십 년**을 하나의 플랫폼에서 관리합니다.

| BIM 차원 | 기능 | 설명 |
|---------|------|------|
| **5D BIM** (비용) | **실시간 견적 + 공급망 연동** | 설계 수정 시 총 공사비 즉시 업데이트, 현재 자재 시장 재고·배송 일정까지 예측 |
| **5D BIM** (비용) | **자재 가격 API 연동** | 건자재 시세 API (e.g., 조달청 나라장터) 연동으로 실시간 단가 반영 |
| **6D BIM** (지속가능성) | **유지보수 AI (Predictive Maintenance)** | "엘리베이터가 3개월 뒤 고장 확률 높음, 부품 주문 권고" 등 예측 알림 |
| **6D BIM** (지속가능성) | **철거 및 재활용 시뮬레이션** | 건물 철거 시 폐기물 양 계산, 자재 재활용 가치 평가, 탄소 중립 점수 산출 |

#### 🎬 Unreal Engine 5 통합 (Extreme Visuals)

- 웹 기반 뷰어를 넘어, UE5 **루멘(Lumen)** 글로벌 일루미네이션으로 영화 같은 실시간 건축 워크쓰루
- Pixel Streaming으로 클라우드 GPU에서 렌더링 → 브라우저로 스트리밍 (로컬 GPU 불필요)
- IFC → Datasmith 플러그인 경유 UE5 자동 임포트 파이프라인 구축

---

### 기능 우선순위 로드맵 요약

```
Phase 1 (0~5주)  ── MVP ──────────────────────────────────────────────
  ✅ 자연어 BIM 편집  ✅ Floor Planner  ✅ AI 포토렌더링  ✅ Undo/Redo

Phase 2 (1~2개월) ── AI 지능화 ────────────────────────────────────────
  🔜 Generative Design   🔜 Sketch-to-BIM   🔜 건축 법규 자동 검토
  🔜 AI 인테리어 스타일링   🔜 에너지 최적화 추천

Phase 3 (2~4개월) ── 시뮬레이션 & 현실 연동 ──────────────────────────
  🔜 CFD 환기/연기 시뮬레이션   🔜 군집 피난 시뮬레이션
  🔜 IoT 디지털 트윈         🔜 드론 스캔 비교   🔜 MR 시공 가이드

Phase 4 (4~6개월) ── 생애주기 & 극한 비주얼 ──────────────────────────
  🔜 5D BIM (실시간 견적)    🔜 6D BIM (예측 유지보수)
  🔜 철거·재활용 시뮬레이션  🔜 Unreal Engine 5 통합
```

---

## 부록

### A. 관련 문서

| 문서 | 경로 | 내용 |
|------|------|------|
| 시스템 아키텍처 | `docs/architecture.md` | 컴포넌트 구조, 데이터 흐름 |
| API 설계 | `docs/api-design.md` | REST/WebSocket 전체 명세 |
| 개발 계획 상세 | `docs/development-plan.md` | Phase별 태스크 체크리스트 |
| NLP 설계 | `docs/nlp-design.md` | LLM 프롬프트, Function Calling |
| BIM 엔진 | `docs/bim-engine.md` | IfcOpenShell 수정 로직 |
| Floor Planner | `docs/floor-planner.md` | 2D 평면도 편집기 설계 |
| 포토리얼리스틱 렌더링 | `docs/photorealistic-rendering.md` | Stable Diffusion 연동 |

### B. 시스템 요구사항

| 항목 | 최소 | 권장 |
|------|------|------|
| GPU | RTX 4050 Laptop (6GB VRAM) | RTX 4070+ |
| RAM | 16GB | 32GB |
| 디스크 | 20GB | 50GB |
| OS | Windows 10/11, Ubuntu 22.04 | Ubuntu 22.04 |
| Python | 3.11+ | 3.11 |
| Node.js | 18+ | 20 LTS |

### C. 핵심 기술 용어

| 용어 | 설명 |
|------|------|
| **IFC** | Industry Foundation Classes - 건축 BIM 국제 표준 데이터 포맷 |
| **BIM** | Building Information Modeling - 건축물 디지털 정보 모델링 |
| **5D BIM** | 3D 모델 + 4D(공정) + 비용 정보를 결합한 BIM 차원 |
| **6D BIM** | 5D + 에너지·지속가능성·생애주기 관리까지 포함한 BIM 차원 |
| **IfcOpenShell** | IFC 파일 파싱/수정을 위한 오픈소스 Python 라이브러리 |
| **Ollama** | 로컬 GPU에서 LLM을 실행하는 오픈소스 서버 |
| **Qwen2.5-7B** | Alibaba 개발 오픈소스 LLM, 한국어 성능 우수 |
| **Delta JSON** | IFC 변경 전후 차이만 담은 최소 전송 단위 |
| **instructor** | LLM 출력을 Pydantic 모델로 강제하는 라이브러리 |
| **D3 Force** | D3.js의 물리 시뮬레이션으로 노드 자동 배치 알고리즘 |
| **Generative Design** | AI가 제약 조건(면적·법규·비용)을 만족하는 설계안을 자동 생성하는 기법 |
| **CFD** | Computational Fluid Dynamics - 유체 역학 수치 시뮬레이션 |
| **Digital Twin** | 물리적 건물을 실시간 데이터로 동기화한 가상 복제 모델 |
| **Sketch-to-BIM** | 손으로 그린 스케치를 AI가 자동으로 BIM 모델로 변환하는 기술 |
| **Predictive Maintenance** | 센서 데이터와 AI로 설비 고장을 사전 예측하는 유지보수 방식 |
| **Lumen (UE5)** | Unreal Engine 5의 실시간 글로벌 일루미네이션 렌더링 시스템 |
| **Pixel Streaming** | 클라우드 GPU에서 렌더링한 UE5 화면을 브라우저로 스트리밍하는 기술 |
| **CRDT** | Conflict-free Replicated Data Type - 분산 환경 충돌 없는 동시 편집 자료구조 |
| **WebXR** | 브라우저에서 VR·AR·MR을 구현하는 웹 표준 API |
| **Open3D** | 포인트 클라우드·3D 데이터 처리 오픈소스 라이브러리 |
