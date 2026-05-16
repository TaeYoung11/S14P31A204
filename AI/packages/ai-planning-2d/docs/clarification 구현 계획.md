# 2D LLM Clarification 구현 계획

> 목표: 사용자가 모호한 명령(예: "거실 없애줘" — 거실이 두 개 존재)을 입력했을 때, AI가 단순 텍스트 질문이 아니라 **Claude 스타일의 클릭 가능한 후보 버튼** 으로 되묻고, 사용자가 버튼 하나만 누르면 후속 명령이 즉시 처리되는 흐름을 만든다.

---

## 1. 현재 상태 진단 (2026-05-14 기준)

### 작동하는 부분
- ai-planning-2d 워커가 `ClarificationRequiredError` 발생 시 `TWO_D_LLM_CLARIFICATION_REQUIRED` eventType 으로 lifecycle event 를 정상 발행 (`ai_common/worker_sdk/event_factory.py`)
- 파이프라인(`planning/session_pipeline.py`) 일부 케이스(`insert_toilet`, `remove_room`)는 이미 `status="alternatives"` 와 함께 **구조화된 alternatives 배열** 을 생성 중
  - 각 alternative 는 `alternative_id`, `title`, `description`, `affected_entities`, `warnings`, `metrics` 를 포함

### 끊긴 지점

| # | 위치 | 문제 |
|---|---|---|
| 1 | AI worker | clarification 발생 시 구조화된 alternatives/policy_plan 을 MinIO 아티팩트로 저장하지 않음. event 의 `error.message` 한 줄만 전달됨 |
| 2 | AI engine | 일반 `needs_clarification` 케이스(insert_toilet/remove_room 외)에는 alternatives 가 비어 있음. LLM 이 후보를 만들도록 SYSTEM_PROMPT 가 유도되어 있지 않음 |
| 3 | BE `TwoDLlmEventListener` | `EVENT_TWO_D_LLM_CLARIFICATION_REQUIRED` 핸들러 부재. clarification 이벤트가 silently drop 되어 job 이 영원히 RUNNING 으로 남음 |
| 4 | BE chat_logs | clarification 메시지를 chat_log 로 저장하는 경로 없음 |
| 5 | FE `useLlmEdit.ts` | polling 종료 조건이 `job.terminal === true` 만 보고 있어 clarification 케이스에서 3분 timeout 후 에러로 처리됨 |
| 6 | FE 채팅 UI | clarification 채팅 메시지 + 버튼 칩 컴포넌트 없음. `LlmEditStatus` enum 에도 clarification 상태 없음 |

### 실증 차단 요인 (별도 영역)
- 샘플 IFC 파일 부재 / IFC 업로드 기능 부재 / MinIO IFC 교체 BE 인터페이스 미수정
  - → 이번 작업 진행 자체는 가능. 실증 단계에서만 영향.

---

## 2. 목표 아키텍처

```
[AI 워커]
  ClarificationRequiredError 발생
    ↓
  clarification 아티팩트 JSON 생성
    ↓
  MinIO 업로드 → URL 획득
    ↓
  error.detail_storage_url = URL 세팅 후 re-raise

[BE TwoDLlmEventListener]
  case EVENT_TWO_D_LLM_CLARIFICATION_REQUIRED → handleClarificationRequired
    ↓
  chat_log 저장 (execution_status=NEEDS_CLARIFICATION, detailStorageUrl 포함)
    ↓
  job/step status=NEEDS_CLARIFICATION, terminal=true

[FE useLlmEdit + AssistantPanel]
  polling 종료 (clarification or success or error)
    ↓
  chat_log fetch → detailStorageUrl 발견 시 MinIO JSON fetch
    ↓
  AssistantPanel 에 질문 + alternatives[].title 버튼 렌더링
    ↓
  버튼 클릭 → 미리 채워진 답변 또는 alternative_id 를 prompt 로 재요청
```

---

## 3. MinIO 아티팩트 contract (예정)

### 경로
`projects/{projectId}/jobs/{jobId}/steps/{NNN}/clarification/detail.v1.json`

### 스키마 (예시 구조 — 정확한 정의는 작업 시 확정)

```json
{
  "schema_version": "v1",
  "kind": "needs_clarification" | "alternatives",
  "question": "사용자에게 보여줄 질문 문장",
  "alternatives": [
    {
      "alternative_id": "remove-room-1f",
      "title": "1층 거실 삭제",
      "description": "...",
      "fill": { "target_floor": 1, "target_room_name": "거실" },
      "affected_entities": ["GlobalId..."],
      "warnings": [],
      "metrics": []
    }
  ],
  "parsed_command_preview": {
    "action": "remove_room",
    "target_room_name": "거실"
  },
  "policy_plan": { ... } | null,
  "job_id": "...",
  "step_no": 1,
  "timestamp": "..."
}
```

- `fill` 필드는 FE 버튼 클릭 시 다음 요청 prompt 에 미리 채울 값 (신규 도입)
- 기존 `error_detail_artifact.v1.schema.json` 와 별도 — 그건 실패 추적 메타데이터 용도

---

## 4. 작업 분할

### AI 측 (사용자 직접)
- **A-1. clarification 아티팩트 스키마 + 워커 업로드 경로**
- **A-2. SYSTEM_PROMPT 보강** — 일반 `needs_clarification` 케이스에도 후보 1~3개 LLM 이 만들도록
- **A-3. 로컬 smoke 시나리오 (시간 되면 같이)** — MinIO/BE 없이 clarification 경로 회귀 안전망

### BE 측 (BE 담당자)
- **B-1. `TwoDLlmEventListener.handleClarificationRequired` 추가**
- **B-2. job/step `NEEDS_CLARIFICATION` 상태 + `terminal=true` 처리**
- **B-3. chat_log 저장 + JobStatusResponseDto 응답**

### FE 측 (사용자 직접 — chat 영역만)
- **C-1. `LlmEditStatus`, `JobStatusResponseDto` 에 clarification 상태 추가**
- **C-2. `useLlmEdit.ts` polling 종료 + detailStorageUrl fetch 로직**
- **C-3. AssistantPanel — Claude 스타일 메시지 + 버튼 칩 컴포넌트**
- **C-4. `LLM_EDIT_HANDSHAKE.md` 갱신 또는 삭제 (현재 미사용 mock 스펙)**

---

## 5. 의존 관계 / 순서

```
A-1 (AI artifact)  ──┐
                     ├──> B-1/B-2/B-3 (BE handler)  ──> C-1/C-2/C-3 (FE UI)
A-2 (LLM prompt)  ──┘
A-3 (smoke) — 병행 가능
C-4 — 독립
```

권장 진행:
1. **A-1** 먼저 (BE/FE 둘 다 이걸 기준으로 시작 가능)
2. **A-2, A-3, C-4** 병행 (각자 독립)
3. **B-1~B-3** — BE 담당자에게 위임, ETA 확인
4. **C-1~C-3** — B-1 이후 (또는 mock 으로 선행하다 B-1 머지 시 교체)

---

## 6. 시작 전 합의 완료 항목

- **clarification 전달 채널**: `error.detail_storage_url` 통한 MinIO 아티팩트 (option B 확정)
  - 근거: Claude 스타일 버튼/칩 UI 를 위해 구조화 데이터 필요
  - BE `TwoDLlmEventListener.handleFailed` 가 이미 `detailStorageUrl` payload 통과 패턴을 가지고 있어서, clarification 핸들러도 동일 패턴 한 줄 추가만 부탁하면 됨

- **schema_version 페이로드 누락 이슈** (이전 검토에서 발견): BE 담당자가 별도 처리 예정

---

## 7. 관련 파일 인덱스

### AI
- `ai-planning-2d/src/ai_planning_2d/worker_runtime/worker.py` — clarification raise 지점 (line 351)
- `ai-planning-2d/src/ai_planning_2d/planning/session_pipeline.py` — alternatives 생성 지점 (line 405, 485)
- `ai-planning-2d/src/ai_planning_2d/planning/engine.py` — SYSTEM_PROMPT (line 499)
- `ai-common/src/ai_common/worker_sdk/event_factory.py` — `build_clarification_event` (line 109)
- `ai-common/src/ai_common/errors.py` — `ClarificationRequiredError` (line 52)
- `shared/schemas/messages/event_message.schema.json` — `eventError.detail_storage_url` (line 262)

### BE
- `BE/src/main/java/com/a204/batang/domain/ifcedit/messaging/TwoDLlmEventListener.java` (line 58-65 switch)
- `BE/src/main/java/com/a204/batang/domain/ifcedit/IfcEditConstants.java` — eventType 상수 추가 필요

### FE
- `FE/src/features/editor/hooks/useLlmEdit.ts` (line 130-147 polling)
- `FE/src/features/editor/types/llmEdit.types.ts` — `LlmEditStatus`
- `FE/src/features/editor/types/llmEdit.dto.ts` — `JobStatusResponseDto`
- `FE/src/features/editor/components/panels/AssistantPanel.tsx`
- `FE/src/features/editor/components/panels/assistant/AssistantPromptSection.tsx`
- `FE/src/features/editor/docs/LLM_EDIT_HANDSHAKE.md` — 정리 대상

---

## 8. 참고

- 본 계획서는 schema 정리 티켓(AI-S14P31A204-370) 작업 중 코드 검토를 통해 도출됨
- 합의된 옵션 B (MinIO 구조화 아티팩트) 기반으로 작성됨
- 변경/조정 시 8번까지 같이 갱신해서 다음 담당자가 컨텍스트를 잃지 않도록 한다
