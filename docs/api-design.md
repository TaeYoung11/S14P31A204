# API 설계 명세

## 기본 정보

- **Base URL**: `http://localhost:8000/api/v1`
- **WebSocket**: `ws://localhost:8000/ws/{project_id}`
- **인증**: JWT Bearer Token (Phase 2 이후 추가)

---

## REST API

### 프로젝트 관리

#### `POST /projects` — 새 프로젝트 생성

**Request Body:**
```json
{
  "name": "서울 오피스 빌딩",
  "description": "15층 규모 업무용 건물"
}
```

**Response `201`:**
```json
{
  "id": "proj_abc123",
  "name": "서울 오피스 빌딩",
  "description": "15층 규모 업무용 건물",
  "created_at": "2026-04-11T02:00:00Z",
  "ifc_uploaded": false
}
```

---

#### `POST /projects/{project_id}/upload` — IFC 파일 업로드

**Request:** `multipart/form-data`
```
file: <IFC 파일>
```

**Response `200`:**
```json
{
  "project_id": "proj_abc123",
  "filename": "building.ifc",
  "floors": [1, 2, 3, 4, 5],
  "element_count": 2847,
  "file_size_mb": 12.4
}
```

**Errors:**
- `400`: 지원하지 않는 IFC 버전
- `413`: 파일 크기 초과 (최대 200MB)

---

#### `GET /projects/{project_id}` — 프로젝트 정보 조회

**Response `200`:**
```json
{
  "id": "proj_abc123",
  "name": "서울 오피스 빌딩",
  "ifc_uploaded": true,
  "floors": [1, 2, 3, 4, 5],
  "element_count": 2847,
  "last_modified": "2026-04-11T02:30:00Z"
}
```

---

#### `GET /projects/{project_id}/model` — IFC 파일 다운로드

**Response `200`:** `application/octet-stream` (IFC 파일)

---

### 자연어 명령 처리

#### `POST /projects/{project_id}/command` — 자연어 명령 실행

**Request Body:**
```json
{
  "text": "3층 회의실 벽을 유리로 바꾸고 창문 2개 추가해줘",
  "session_id": "sess_xyz789"
}
```

**Response `200` (명령 실행 성공):**
```json
{
  "status": "success",
  "command": {
    "action": "modify",
    "target": {
      "floor": 3,
      "room": "회의실",
      "element_type": "wall"
    },
    "changes": {
      "material": "glass",
      "openings": [
        { "type": "window", "count": 2, "width": 1200, "height": 1500 }
      ]
    }
  },
  "affected_elements": [
    {
      "guid": "2O2Fr$t4X7Zf8NOew3FNr2",
      "type": "IfcWall",
      "description": "3층 회의실 서쪽 벽"
    }
  ],
  "message": "3층 회의실 서쪽 벽의 재질을 유리로 변경하고 창문 2개를 추가했습니다.",
  "delta_sent_via_websocket": true
}
```

**Response `200` (재질문 필요):**
```json
{
  "status": "needs_clarification",
  "question": "어느 층 회의실을 말씀하시는 건가요? (현재 2층, 3층, 5층에 회의실이 있습니다)",
  "session_id": "sess_xyz789"
}
```

**Response `200` (조회 명령):**
```json
{
  "status": "query_result",
  "query_type": "area_summary",
  "data": {
    "floors": [
      { "floor": 1, "area_m2": 450.5 },
      { "floor": 2, "area_m2": 448.2 },
      { "floor": 3, "area_m2": 448.2 }
    ],
    "total_area_m2": 1346.9
  }
}
```

---

### 변경 이력

#### `GET /projects/{project_id}/history` — 변경 이력 조회

**Query Parameters:**
- `page` (int, default: 1)
- `limit` (int, default: 20)

**Response `200`:**
```json
{
  "total": 42,
  "page": 1,
  "items": [
    {
      "id": "hist_001",
      "timestamp": "2026-04-11T02:30:00Z",
      "command_text": "3층 회의실 벽을 유리로 바꿔줘",
      "action": "modify",
      "affected_elements": 1,
      "can_undo": true
    }
  ]
}
```

---

#### `POST /projects/{project_id}/undo` — 마지막 변경 취소

**Response `200`:**
```json
{
  "status": "success",
  "undone_command": "3층 회의실 벽 재질 변경",
  "delta_sent_via_websocket": true
}
```

---

#### `POST /projects/{project_id}/redo` — 다시 실행

**Response `200`:**
```json
{
  "status": "success",
  "redone_command": "3층 회의실 벽 재질 변경",
  "delta_sent_via_websocket": true
}
```

---

## WebSocket API

### 연결

```
WS ws://localhost:8000/ws/{project_id}
```

연결 시 초기 메시지:
```json
{
  "type": "connected",
  "project_id": "proj_abc123",
  "message": "프로젝트에 연결되었습니다."
}
```

---

### 서버 → 클라이언트 메시지 타입

#### `model_update` — 3D 모델 변경 사항

```json
{
  "type": "model_update",
  "project_id": "proj_abc123",
  "timestamp": "2026-04-11T02:30:00Z",
  "changes": [
    {
      "guid": "2O2Fr$t4X7Zf8NOew3FNr2",
      "element_type": "IfcWall",
      "operation": "modify",
      "properties_changed": {
        "material": { "before": "Concrete", "after": "Glass" }
      },
      "geometry_changed": false
    },
    {
      "guid": "3P3Gs$u5Y8Ag9OPfx4GOr3",
      "element_type": "IfcWindow",
      "operation": "add",
      "geometry": {
        "type": "box",
        "width": 1200,
        "height": 1500,
        "position": { "x": 5.5, "y": 0.8, "z": 10.2 }
      }
    }
  ]
}
```

#### `processing` — 처리 상태

```json
{
  "type": "processing",
  "status": "analyzing",
  "message": "명령을 분석하고 있습니다..."
}
```

```json
{
  "type": "processing",
  "status": "modifying",
  "message": "IFC 모델을 수정하고 있습니다..."
}
```

#### `error` — 오류

```json
{
  "type": "error",
  "code": "ELEMENT_NOT_FOUND",
  "message": "3층에 회의실을 찾을 수 없습니다. 방 이름을 확인해주세요."
}
```

---

### 클라이언트 → 서버 메시지 타입

#### `ping` — 연결 유지

```json
{ "type": "ping" }
```

---

## 에러 코드 목록

| Code | HTTP | 설명 |
|------|------|------|
| `PROJECT_NOT_FOUND` | 404 | 프로젝트가 존재하지 않음 |
| `IFC_NOT_UPLOADED` | 400 | IFC 파일이 업로드되지 않음 |
| `ELEMENT_NOT_FOUND` | 422 | 명령 대상 요소를 IFC에서 찾을 수 없음 |
| `LLM_PARSE_FAILED` | 422 | LLM이 명령을 파싱하지 못함 |
| `UNSUPPORTED_OPERATION` | 422 | 현재 지원하지 않는 BIM 수정 작업 |
| `IFC_MODIFY_FAILED` | 500 | IFC 파일 수정 중 오류 |
| `VRAM_INSUFFICIENT` | 503 | GPU 메모리 부족 (모델 로드 실패) |
