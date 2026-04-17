# 시스템 아키텍처

## 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                        사용자 브라우저                            │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐ │
│  │      Chat Panel     │    │        3D Viewer                  │ │
│  │  ┌───────────────┐  │    │  ┌────────────────────────────┐  │ │
│  │  │  자연어 입력   │  │    │  │   Three.js Canvas          │  │ │
│  │  │  (한국어)      │  │    │  │   - IFC Scene Graph        │  │ │
│  │  └───────┬───────┘  │    │  │   - WebGL 렌더링            │  │ │
│  │          │           │    │  │   - 카메라 컨트롤           │  │ │
│  │  ┌───────▼───────┐  │    │  └────────────────────────────┘  │ │
│  │  │  대화 히스토리 │  │    │                                   │ │
│  │  │  처리 상태     │  │    │  ┌────────────────────────────┐  │ │
│  │  └───────────────┘  │    │  │   Property Inspector        │  │ │
│  │                     │    │  │   - 요소 속성 표시           │  │ │
│  │  ┌───────────────┐  │    │  │   - 층별 필터               │  │ │
│  │  │ 변경 이력      │  │    │  └────────────────────────────┘  │ │
│  │  │ (Undo/Redo)   │  │    │                                   │ │
│  │  └───────────────┘  │    └──────────────────────────────────┘ │
│  └─────────┬───────────┘                     ▲                    │
└────────────┼─────────────────────────────────┼────────────────────┘
             │ REST / WebSocket                 │ Delta JSON
             │                                  │
┌────────────▼──────────────────────────────────┼────────────────────┐
│                     Backend (FastAPI)           │                    │
│                                                 │                    │
│  ┌──────────────────────────────────────────────▼──────────────┐  │
│  │                    WebSocket Hub                              │  │
│  │  - 프로젝트별 연결 관리                                        │  │
│  │  - Delta JSON 브로드캐스트                                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────┐  │
│  │   NLP Service   │   │   BIM Service    │   │ Diff Service │  │
│  │                 │   │                  │   │              │  │
│  │ - Ollama 클라이언트│──▶│ - IFC 파일 로드   │──▶│ - Delta 계산 │  │
│  │ - instructor    │   │ - 요소 검색       │   │ - JSON 직렬화│  │
│  │ - 프롬프트 관리  │   │ - 속성/지오메트리 │   │              │  │
│  │ - 재질문 생성   │   │   수정           │   │              │  │
│  └─────────────────┘   │ - IFC 저장       │   └──────────────┘  │
│          │             └──────────────────┘                       │
│          ▼                                                         │
│  ┌───────────────────────────────┐                                │
│  │    Ollama (로컬 LLM 서버)     │                                │
│  │    Qwen2.5-7B Q4_K_M         │                                │
│  │    http://localhost:11434     │                                │
│  └───────────────────────────────┘                                │
│                                                                    │
│  ┌──────────────────┐    ┌──────────────────┐                    │
│  │   PostgreSQL     │    │     Redis         │                    │
│  │   - 프로젝트 메타 │    │   - 세션 관리    │                    │
│  │   - 변경 이력    │    │   - 작업 큐      │                    │
│  └──────────────────┘    └──────────────────┘                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 데이터 흐름 시퀀스

### 정상 흐름 (자연어 명령 처리)

```
User        Frontend        Backend(WS)     NLP Service     BIM Service    DB
 │              │                │               │               │          │
 │ "벽 유리로"  │                │               │               │          │
 │─────────────▶│                │               │               │          │
 │              │─POST /command──▶               │               │          │
 │              │                │─LLM 호출──────▶               │          │
 │              │◀─WS: "처리중"──│               │               │          │
 │◀─스피너 표시─│                │               │               │          │
 │              │                │               │─BIM 명령 JSON─│          │
 │              │                │◀──────────────│               │          │
 │              │                │─IFC 수정 요청──────────────────▶          │
 │              │                │               │               │─이력 저장──▶
 │              │                │◀──────────────────────────────│          │
 │              │                │─Delta JSON────▶               │          │
 │              │◀─WS: delta─────│               │               │          │
 │              │─3D 씬 업데이트  │               │               │          │
 │◀─3D 변경 확인│                │               │               │          │
```

### 모호한 명령 처리 (확인 질문)

```
User            Backend         NLP Service
 │                  │               │
 │ "회의실 바꿔줘"   │               │
 │──────────────────▶               │
 │                  │─LLM 호출──────▶
 │                  │               │── confidence 낮음 감지
 │                  │◀──────────────│
 │◀─"몇 층 회의실인가요?"────────────│
 │ "3층이요"         │               │
 │──────────────────▶               │
 │                  │─LLM 재호출────▶
 │                  │               │── 명확한 명령 생성
```

---

## 컴포넌트별 역할

### Frontend

| 컴포넌트 | 파일 | 역할 |
|---------|------|------|
| `ChatPanel` | `components/ChatPanel/` | 자연어 입력 UI, 대화 히스토리 |
| `Viewer3D` | `components/Viewer3D/` | Three.js IFC 렌더러, 카메라 컨트롤 |
| `HistoryPanel` | `components/HistoryPanel/` | 변경 이력, Undo/Redo 버튼 |
| `PropertyPanel` | `components/PropertyPanel/` | 선택된 BIM 요소 속성 표시 |
| `useWebSocket` | `hooks/useWebSocket.ts` | WebSocket 연결 관리, Delta 수신 |
| `useBIMModel` | `hooks/useBIMModel.ts` | Three.js 씬 상태 관리 |

### Backend

| 서비스 | 파일 | 역할 |
|--------|------|------|
| `NLPService` | `services/nlp_service.py` | Ollama 호출, BIM 명령 JSON 파싱 |
| `BIMService` | `services/bim_service.py` | IFC 파일 로드/수정/저장 |
| `DiffService` | `services/diff_service.py` | 변경 전후 Delta JSON 생성 |
| `WebSocketHub` | `api/websocket.py` | 실시간 연결 관리 및 브로드캐스트 |

---

## 핵심 데이터 모델

### BIM 명령 구조체 (Pydantic)

```python
class BIMCommand(BaseModel):
    action: Literal["modify", "add", "delete", "query"]
    target: BIMTarget
    changes: Optional[BIMChanges]
    confidence: float          # LLM 확신도 (0~1)
    needs_clarification: bool  # 재질문 필요 여부
    clarification_question: Optional[str]

class BIMTarget(BaseModel):
    floor: Optional[int]       # 층 번호
    room: Optional[str]        # 방 이름
    element_type: str          # wall | slab | column | window | door
    element_guid: Optional[str] # IFC GUID (특정 요소 지정 시)

class BIMChanges(BaseModel):
    material: Optional[str]
    thickness: Optional[float]  # mm
    height: Optional[float]     # mm
    width: Optional[float]      # mm
    openings: Optional[list[Opening]]
    position: Optional[Position]
```

### Delta JSON (실시간 전송)

```json
{
  "type": "model_update",
  "project_id": "proj_001",
  "timestamp": "2026-04-11T02:00:00Z",
  "changes": [
    {
      "guid": "2O2Fr$t4X7Zf8NOew3FNr2",
      "element_type": "IfcWall",
      "operation": "modify",
      "before": { "material": "concrete", "thickness": 200 },
      "after": { "material": "glass", "thickness": 12 },
      "geometry_changed": true,
      "new_geometry": { ... }
    }
  ]
}
```

---

## 성능 최적화 전략

### 렌더링 성능
- **Delta 업데이트**: 전체 IFC 재로드 대신 변경된 요소만 교체
- **LOD (Level of Detail)**: 멀리 있는 요소는 저해상도 메시 사용
- **Frustum Culling**: 카메라 시야 밖 요소 렌더링 제외
- **Instancing**: 동일 지오메트리 요소 인스턴싱 처리

### LLM 성능 (6GB VRAM 최적화)
- 컨텍스트 윈도우: 최대 4096 토큰 (KV 캐시 제한)
- 대화 히스토리: 최근 8턴만 유지
- 백그라운드 앱 VRAM 사용 최소화 권장
- 스트리밍 응답: 첫 토큰까지 지연 최소화

### IFC 처리 성능
- IFC 파일 로드 후 메모리 캐싱
- 수정된 요소만 재직렬화
- 대용량 모델은 비동기 처리 + 진행률 표시
