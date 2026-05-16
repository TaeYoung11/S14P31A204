# SESSION_RESUME

작성일: 2026-05-12
브랜치: fix/FE-S14P31A204-352-FE자동저장로직수정 (대화 기준)

## 1) 현재 목표
층(Layer) UX/동작을 다음 규칙으로 완성
- 층 선택은 가능
- 선택된 층만 활성 상태로 표시
- 선택되지 않은 층은 비활성(회색/disabled 느낌)
- 하위 층은 읽기 전용(편집 불가)
- 층 추가 시 자동저장 트리거 발생
- 층 전환 시 1층 기본 bubble이 같이 움직이지 않도록 층별 스냅샷 분리 보장

## 2) 이미 반영된 핵심 로직

### 2.1 하위층 read-only 가드
- 파일: `FE/src/features/editor/hooks/useEditorPage.ts`
  - `topFloorLayerId`, `isTwoDLowerLayerReadOnly` 계산
  - 룸 편집 경로 차단
    - `handleResizeFloorRoom`
    - `handleMoveFloorRoom`
    - `handleUpdateFloorRoomPolygon`

- 파일: `FE/src/features/editor/hooks/useEditorStructureEditHandlers.ts`
  - `isReadOnly` 파라미터 추가
  - 벽/개구부 생성/수정/삭제 mutation 함수들 early return

- 파일: `FE/src/features/editor/hooks/useEditorAttributePanelHandlers.ts`
  - `isReadOnly` 파라미터 추가
  - 2D 속성 패널(label/type/size) 경로 차단

### 2.2 자동저장 트리거
- 파일: `FE/src/features/editor/hooks/useEditorPage.ts`
  - `handleAddFloorLayer` 시작부에 `markLocalFloorPlanSnapshotChanged()` 추가

### 2.3 빌드 상태
- `npm run build` 통과 확인됨

## 3) 아직 남은 이슈

### 3.1 층 버튼 활성/비활성 시각 상태
- 요구사항: "선택된 층만 활성"
- 현재: 일부 UI 로직에서 top-layer 기준 흔적/상태 표시 불일치
- 대상 파일:
  - `FE/src/features/editor/components/layout/TwoDLeftPanels.tsx`
  - `FE/src/features/editor/components/panels/InspectorPanel.tsx`

### 3.2 층 전환 시 1층 기본 bubble이 같이 움직이는 현상
- 의심 지점: 층 전환/스냅샷 저장·복원 타이밍
- 대상 파일:
  - `FE/src/features/editor/hooks/useEditorPage.ts`
  - 핵심 함수:
    - `saveCurrentLayerBubbleSnapshot`
    - `loadLayerBubbleSnapshot`
    - `handleSelectFloorLayer`
    - `handleAddFloorLayer`

## 4) 다음 세션 즉시 실행 TODO

1. `TwoDLeftPanels.tsx` / `InspectorPanel.tsx`
- 선택된 층만 강조색
- 비선택 층은 회색/opacity 낮춤
- 층 전환 클릭은 허용
- rename/delete/overlay 버튼은 활성층만 가능하도록 정리

2. `useEditorPage.ts` 스냅샷 강화
- 층 전환 직전 `saveCurrentLayerBubbleSnapshot(activeFloorLayerId)` 강제
- 층 전환 직후 `loadLayerBubbleSnapshot(targetLayerId)` 결과 검증
- target snapshot 없을 때 clone fallback 로직 재검증
- bubble 모드↔2d 전환 간 자동 refresh가 층 스냅샷 덮어쓰지 않도록 조건 점검

3. 재현 시나리오로 검증
- (a) 진입 -> 1층 확인
- (b) 층 추가 -> 2층 생성
- (c) 2층에서 편집
- (d) 1층 전환
- 기대: 1층 원본 불변, 2층 변경만 유지

## 5) 다음 세션 시작 프롬프트(복붙용)
"SESSION_RESUME.md 기준으로 이어서 작업해. 남은 이슈는
1) 층 버튼 활성/비활성 시각 상태 정합,
2) 층 전환 시 1층 bubble 동시 이동 문제 해결.
코드 수정 후 빌드까지 확인해줘."

