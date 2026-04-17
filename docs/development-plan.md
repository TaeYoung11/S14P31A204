# 개발 계획 (Development Plan)

> RTX 4050 Laptop (6GB VRAM) 기준 로컬 오픈소스 LLM 활용

---

## 환경 정보

| 항목 | 내용 |
|------|------|
| GPU | NVIDIA RTX 4050 Laptop (6GB GDDR6) |
| LLM | Qwen2.5-7B-Instruct Q4_K_M (~4.5GB VRAM) |
| 추론 속도 | 30~40 token/s |
| 서빙 | Ollama (http://localhost:11434) |
| 구조화 출력 | instructor + Pydantic |

---

## Phase 1: 기반 구축 (2주)

### 목표
IFC 파일을 3D로 볼 수 있고, 자연어 명령을 JSON으로 변환하는 최소 파이프라인 완성

### Week 1: 프로젝트 셋업 & 3D 뷰어

- [ ] **1-1** 프로젝트 기본 구조 생성
  - Vite + React + TypeScript 프론트엔드 초기화
  - FastAPI 백엔드 초기화
  - docker-compose.yml 작성 (postgres, redis)

- [ ] **1-2** IFC 3D 뷰어 구현
  - `web-ifc-three` 라이브러리 연동
  - Three.js 카메라 컨트롤 (OrbitControls)
  - IFC 파일 업로드 → 3D 렌더링 기능
  - 층별 필터 UI (체크박스)

- [ ] **1-3** 백엔드 기본 API
  - 프로젝트 생성 / IFC 파일 업로드 API
  - IFC 파일 저장소 구성 (로컬 파일시스템 → 추후 S3)
  - PostgreSQL 스키마 설계 및 마이그레이션

### Week 2: NLP 파이프라인

- [ ] **2-1** Ollama + Qwen2.5-7B 연동
  - Ollama Python 클라이언트 설정
  - `instructor` 라이브러리 연동
  - BIM 명령 Pydantic 모델 정의 (`BIMCommand`, `BIMTarget`, `BIMChanges`)

- [ ] **2-2** 시스템 프롬프트 설계 (BIM 도메인 특화)
  - 건축 도메인 용어 처리 (벽, 슬래브, 기둥, 개구부 등)
  - 한국어 자연어 → BIM 명령 JSON 변환 프롬프트
  - 모호한 명령 감지 및 재질문 생성 로직

- [ ] **2-3** WebSocket 기반 실시간 통신
  - FastAPI WebSocket 라우터
  - 프론트엔드 `useWebSocket` 훅 구현
  - 처리 상태 메시지 (로딩 스피너 연동)

**Phase 1 완료 기준:**
```
✅ IFC 파일 업로드 후 3D 뷰어에 표시
✅ 채팅창에 자연어 입력 → BIM JSON 구조체 변환 확인
✅ WebSocket으로 상태 메시지 실시간 수신
```

---

## Phase 2: BIM 수정 엔진 (3주)

### 목표
자연어 명령이 실제 IFC 파일을 수정하고 3D 뷰어에 즉시 반영

### Week 3: 속성 수정 (재질, 치수)

- [ ] **3-1** IfcOpenShell 기반 BIM 서비스 구현
  ```python
  # 구현할 기능
  - load_ifc(project_id) -> IfcFile
  - find_elements(floor, room, element_type) -> list[IfcElement]
  - modify_material(guid, material_name)
  - modify_property(guid, property, value)
  - save_ifc(project_id, ifc_file)
  ```

- [ ] **3-2** 재질 라이브러리 구성
  - 자주 쓰이는 건축 재질 매핑 테이블
    ```
    "콘크리트" → IfcMaterial("Concrete")
    "유리"     → IfcMaterial("Glass")
    "목재"     → IfcMaterial("Wood")
    "대리석"   → IfcMaterial("Marble")
    ...
    ```
  - IFC 재질 속성 업데이트 로직

- [ ] **3-3** Delta 계산 & 전송
  - 수정 전후 요소 속성 비교
  - Delta JSON 직렬화
  - WebSocket으로 프론트엔드에 브로드캐스트
  - 프론트엔드에서 Three.js 메시 재질 교체

### Week 4: 기하학적 수정 (창문/문 추가, 벽 두께)

- [ ] **4-1** 개구부(Opening) 추가
  - IfcOpeningElement 생성
  - IfcWindow / IfcDoor 삽입
  - 위치 계산 로직 (벽 중앙 배치 등)

- [ ] **4-2** 치수 변경 (두께, 높이)
  - IfcExtrudedAreaSolid 파라미터 수정
  - 인접 요소와의 충돌 감지 (기본)

- [ ] **4-3** 프론트엔드 Delta 렌더링
  - 변경된 요소만 Three.js 씬에서 교체
  - 변경 요소 하이라이트 (노란색, 3초)
  - 수정 완료 애니메이션

### Week 5: 요소 추가/삭제 & Undo/Redo

- [ ] **5-1** 요소 추가
  - IfcWall, IfcColumn, IfcSlab 신규 생성
  - 층/공간과의 관계 설정 (IfcRelContainedInSpatialStructure)

- [ ] **5-2** 요소 삭제
  - GUID 기반 요소 제거
  - 관계 정리 (참조 요소 처리)

- [ ] **5-3** Command 패턴 Undo/Redo
  ```python
  class CommandHistory:
      def execute(command: BIMCommand)
      def undo() -> BIMCommand
      def redo() -> BIMCommand
  ```
  - 자연어 Undo: "이전으로 돌려줘" → LLM이 undo 명령으로 인식

**Phase 2 완료 기준:**
```
✅ "3층 벽 유리로 변경" → IFC 수정 → 3D 즉시 반영
✅ "창문 2개 추가" → IFC 개구부 생성 → 3D 반영
✅ "되돌려줘" → Undo 동작
```

---

## Phase 3: 고도화 (2주)

### Week 6: UX 개선

- [ ] **6-1** 3D 뷰어 고급 기능
  - 단면 절단 (Section Cut) 뷰
  - 층별 분리 뷰 (층 선택 시 해당 층만)
  - 요소 클릭 → PropertyPanel에 속성 표시
  - 선택된 요소 강조 (파란색 아웃라인)

- [ ] **6-2** 채팅 UI 개선
  - 명령 처리 중 스트리밍 텍스트 표시
  - 수정 결과 요약 메시지 ("3층 회의실 서쪽 벽의 재질을 유리로 변경했습니다")
  - 추천 명령어 빠른 버튼

- [ ] **6-3** 변경 이력 타임라인 UI
  - 썸네일 스냅샷 (변경 전/후 미니 3D 캡처)
  - 특정 시점으로 점프

### Week 7: 공간 조회 & 내보내기

- [ ] **7-1** 자연어 조회 기능
  - "각 층 면적 알려줘" → IFC 속성 집계 → 테이블 출력
  - "창문 몇 개야?" → 요소 카운트
  - "3층 평면도 보여줘" → 평면도 단면 뷰 자동 전환

- [ ] **7-2** 수정된 IFC 파일 내보내기
  - 수정된 IFC 다운로드
  - 변경 이력 리포트 PDF 생성

- [ ] **7-3** 성능 최적화
  - 대용량 IFC (>50MB) 비동기 처리
  - Three.js LOD 적용
  - VRAM 사용량 모니터링 API

**Phase 3 완료 기준:**
```
✅ "3층 면적 알려줘" → 데이터 응답
✅ 단면 절단 뷰 동작
✅ 수정된 IFC 다운로드
```

---

## Phase 4: 확장 (추후)

> Phase 1~3 완료 후 필요에 따라 진행

- [ ] **다중 사용자 협업** - CRDT 기반 동시 편집
- [ ] **AI 설계 제안** - "더 효율적인 레이아웃 제안해줘"
- [ ] **건축 법규 자동 검토** - "이 설계 건폐율 기준 맞나?"
- [ ] **Revit 연동** - Revit IFC 익스포트 → BIM 3D Service 연동
- [ ] **VR 뷰어** - WebXR 기반 VR 모드
- [ ] **클라우드 배포** - AWS/GCP + GPU 인스턴스

---

## 기술적 위험 요소 & 대응

| 위험 | 가능성 | 대응 방안 |
|------|--------|----------|
| IFC 지오메트리 수정 복잡성 | 높음 | Phase 1에서 속성만 수정, 지오메트리는 Phase 2에서 점진적 구현 |
| 6GB VRAM 부족 | 중간 | 컨텍스트 제한, 백그라운드 앱 종료 가이드 제공 |
| LLM 한국어 BIM 명령 오파싱 | 중간 | few-shot 예제 프롬프트, confidence 낮으면 재질문 |
| 대용량 IFC 렌더링 느림 | 중간 | Delta 업데이트, LOD, 요소 culling |
| IfcOpenShell Windows 호환성 | 낮음 | Conda 환경 또는 WSL2 사용 |

---

## 개발 환경 설정 순서

```bash
# 1. Ollama 설치 및 모델 다운로드
winget install Ollama.Ollama
ollama pull qwen2.5:7b
# 설치 확인 (VRAM 사용량 체크)
nvidia-smi

# 2. Python 환경
conda create -n bim3d python=3.11
conda activate bim3d
pip install ifcopenshell fastapi uvicorn instructor redis psycopg2-binary

# 3. Node.js 환경
nvm install 20
cd frontend && npm install

# 4. Docker (DB)
docker-compose up -d postgres redis

# 5. 백엔드 실행
cd backend && uvicorn app.main:app --reload

# 6. 프론트엔드 실행
cd frontend && npm run dev
```
