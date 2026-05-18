# LLM Edit FE–BE Handshake

> 최종 갱신: 2026-05-15 (FE-381 기준)

## 전체 흐름

```
FE
 ├─ POST /projects/{projectId}/chat-commands   → jobId 수신
 └─ GET  /jobs/{jobId}  (1.5s 폴링, 최대 180s)
         ├─ terminal: true + SUCCESS  → IFC 결과 URL 적용
         ├─ terminal: true + clarificationPossible: true
         │    └─ GET detailStorageUrl (MinIO)  → clarification 카드 표시
         └─ terminal: true + 기타 오류  → 에러 메시지 표시
```

---

## 1. 명령 전송

```
POST /projects/{projectId}/chat-commands
```

### 요청 본문

```json
{
  "sceneType": "TWO_D",
  "baseRevisionId": "rev-uuid",
  "sourceSceneType": "IFC_MODEL",
  "message": "침실 삭제해줘"
}
```

> 3D 경로는 `sceneType: "THREE_D"`, `sourceSceneStorageUrl`, `sourceScene` 추가 포함.

### 응답

```json
{
  "jobId": "job-uuid",
  "progress": 0
}
```

---

## 2. 작업 상태 폴링

```
GET /jobs/{jobId}
```

### 공통 응답 구조

```json
{
  "jobId": "job-uuid",
  "status": "PROCESSING",
  "terminal": false,
  "progress": 42,
  "outputs": null,
  "error": null
}
```

| 필드 | 설명 |
|---|---|
| `terminal` | `true`이면 폴링 종료 |
| `status` | `SUCCESS` 계열이면 성공, 그 외는 실패 또는 clarification |
| `progress` | 0~100 진행률 (null 가능) |

---

## 3. 성공 응답

```json
{
  "terminal": true,
  "status": "SUCCESS",
  "outputs": {
    "primaryResultUrl": "https://minio/.../result.ifc",
    "primaryArtifactId": "artifact-uuid",
    "targetRevisionId": "rev-uuid-next"
  }
}
```

FE는 `primaryResultUrl`로 IFC를 fetch해 뷰어에 적용합니다.

---

## 4. Clarification 응답

AI가 명령이 모호하다고 판단한 경우입니다.

```json
{
  "terminal": true,
  "status": "FAILED",
  "error": {
    "clarificationPossible": true,
    "detailStorageUrl": "https://minio/.../clarification/detail.v1.json"
  }
}
```

FE는 `detailStorageUrl`에서 MinIO 아티팩트를 직접 fetch합니다.

### MinIO Clarification 아티팩트 (`detail.v1.json`)

```json
{
  "schema_version": "v1",
  "kind": "alternatives",
  "question": "어느 층의 침실을 삭제할까요?",
  "alternatives": [
    {
      "alternative_id": "remove_room-침실-1f-space-001",
      "title": "1층 침실 삭제",
      "description": "1층 침실에 대해 작업합니다.",
      "fill": { "target_floor": 1, "target_room_name": "침실" },
      "affected_entities": ["space-001"],
      "warnings": [],
      "metrics": []
    },
    {
      "alternative_id": "remove_room-침실-2f-space-002",
      "title": "2층 침실 삭제",
      "description": "2층 침실에 대해 작업합니다.",
      "fill": { "target_floor": 2, "target_room_name": "침실" },
      "affected_entities": ["space-002"],
      "warnings": [],
      "metrics": []
    }
  ],
  "job_id": "job-uuid",
  "step_no": 1,
  "clarification_request_id": "clarif-uuid",
  "timestamp": "2026-05-15T12:00:00Z"
}
```

| `kind` 값 | 의미 | `alternatives` |
|---|---|---|
| `alternatives` | 선택지 제공 | 1개 이상 |
| `needs_clarification` | 자유 입력 요청 | 빈 배열 |

### FE 처리

1. `AssistantClarificationCard`로 질문 + 칩 버튼 렌더링
2. 칩 클릭 → `alternative.title`을 메시지로 자동 재전송 (`run()` 호출)
3. `alternatives`가 빈 배열이면 "아래 입력창에 직접 답변을 입력해주세요." 안내

---

## 5. 오류 응답

```json
{
  "terminal": true,
  "status": "FAILED",
  "error": {
    "errorMessage": "IFC 컨텍스트를 읽을 수 없습니다.",
    "clarificationPossible": false
  }
}
```

---

## FE 상태 전이

```
idle
 └─ run() 호출
      → loading  (submitLlmChatCommand 중)
      → running  (폴링 중, 진행률 바 표시)
           ├─ clarification_required  (칩 카드 표시, 자동 재전송 대기)
           ├─ error                   (에러 메시지 표시)
           └─ applied                 (IFC 뷰어 갱신 중)
```
