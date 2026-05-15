# Bubble JSON Flow (FE 기준)

## 개요
이 문서는 `FE/src/features/editor/hooks/useEditorPage.ts` 기준으로,
버블(JSON) 데이터를 **어디서 가져오고**, **어떻게 바꾸고**, **어떻게 BE로 전달하는지**를 정리한다.

---

## 1) 초기 진입 시 버블 JSON 로드 순서

### 1-1. 1순위: workspace history
- 호출: `workspaceSaveService.loadHistorySnapshot(projectId)`
- API: `GET /api/v1/projects/{projectId}/workspace/history`
- 사용 데이터:
  - `history.bubble.snapshot` (버블/연결)
  - `history.bubble.baseIndex`, `redoDepth`
  - `history.floorPlan` (필요 시 IFC 복원 관련)

### 1-2. 2순위 fallback: project detail
- 호출: `projectService.getWorkspaceDetail(projectId)`
- 사용 데이터:
  - `bubbleSnapshotJson`

즉, 버블 복원은 기본적으로 `history -> detail fallback` 순서.

---

## 2) 로컬에서 버블 JSON이 변경되는 위치

### 2-1. 상태 소스
- `useBubbles.ts`: bubble 추가/이동/리사이즈/라벨 변경/삭제
- `useConnections.ts`: 연결 추가/삭제/스타일 변경

최종적으로 `useEditorPage.ts`의 상태(`bubbles`, `connections`)가 최신 값이 된다.

### 2-2. 스냅샷 구성
- `WorkspaceSnapshot` 타입으로 편집 상태를 묶음
- 핵심 필드:
  - `phaseStatus`, `bubbles`, `connections`
  - `zones`, `floorLayers`, `floorWalls`, `floorOpenings`
  - `isFloorPlanGenerated`, `floorPlanLayoutSource`
  - `ifcElementChanges`

---

## 3) BE로 전달되는 경로

## 3-1. STOMP 실시간 동기화
- 서비스: `workspaceRealtimeService.publishSnapshot(...)`
- 파일: `FE/src/features/editor/services/workspaceRealtime.service.ts`

분기:
- 버블 초안 상태면
  - destination: `/app/project/{projectId}/bubble/update`
  - payload: `WorkspaceBubblePayload`
- 그 외(2D/IFC 관련)면
  - destination: `/app/project/{projectId}/floor-plan/update`
  - payload: `WorkspaceFloorPlanPayload`

### 3-2. REST 보조 저장
- 버블 저장: `POST /api/v1/projects/{projectId}/workspace/bubble/save`
- 서비스: `workspaceSaveService.saveBubbleSnapshot(...)`

---

## 4) 실제 전송 payload 예시

## 4-1. 버블 업데이트 payload (STOMP)
```json
{
  "bubbles": [
    {
      "id": "bubble-1",
      "x": 120,
      "y": 200,
      "width": 180,
      "height": 140,
      "widthMm": 3600,
      "heightMm": 2800,
      "label": "거실",
      "type": "living_room",
      "ratio": 1.3,
      "color": "#E7EBFF"
    }
  ],
  "connections": [
    { "from": "bubble-1", "to": "bubble-2", "type": "thin" }
  ],
  "baseIndex": 3
}
```

## 4-2. floor-plan/update payload (STOMP)
```json
{
  "bubbles": [],
  "connections": [],
  "baseIndex": -1,
  "sceneType": "THREE_D",
  "revisionId": "6f63d14e-dd4a-407b-8aa2-496f94947504",
  "layout": {
    "phaseStatus": "IFC_EDIT",
    "floorLayers": [],
    "activeFloorLayerId": null,
    "isFloorPlanGenerated": true,
    "floorPlanLayoutSource": "project",
    "floorWalls": [],
    "floorOpenings": [],
    "hiddenAutoWallIds": [],
    "hiddenAutoOpeningIds": [],
    "isProjectStructurePreferred": false,
    "ifcElementChanges": [],
    "mode": "ifc",
    "baseIndex": -1
  }
}
```

---

## 5) 관련 주요 파일
- `FE/src/features/editor/hooks/useEditorPage.ts`
- `FE/src/features/editor/hooks/useBubbles.ts`
- `FE/src/features/editor/hooks/useConnections.ts`
- `FE/src/features/editor/services/workspaceRealtime.service.ts`
- `FE/src/features/editor/services/workspaceSave.service.ts`
- `FE/src/features/editor/types.ts`

---

## 6) 참고
- 현재 FE는 history 우선 복원 전략이며,
  history가 없거나 불완전할 때 detail fallback을 사용한다.
- IFC 복원 관련은 `history.floorPlan.s3Url` 및 `currentIfcUrl` 복원 로직과 함께 동작한다.

---

## 7) Render Worker input flow (BE -> RabbitMQ -> AI Worker)

### 7-1. Flow
1. FE/Client calls `POST /api/v1/projects/{projectId}/renders`.
2. BE `RenderCommandService.createRender(...)` builds worker command payload.
3. BE publishes to RabbitMQ: exchange `batang.commands.exchange`, routing key `command.sd-render.generate`.
4. AI consumer parses the message as `CommandMessage`.
5. `RenderingWorker` checks `command.input.sourceIfcStorageUrl` and runs ifc2img path.
6. `ai_rendering.ifc2img.worker.map_worker_command_to_ifc2img_request(...)` maps `input/expectedOutput/payload` to final worker request.

### 7-2. Example command payload published by BE
```json
{
  "messageId": "2f3a3f0f-9578-4d4d-88a5-cf50e15f20fd",
  "specVersion": "v1",
  "messageType": "COMMAND",
  "commandType": "SD_RENDER_GENERATE",
  "routingKey": "command.sd-render.generate",
  "jobId": "bf869e7f-16c1-4b39-b474-fe55ec075a0d",
  "jobStepId": "99465615-eb25-41b5-b635-d722a8a191c7",
  "stepNo": 1,
  "totalSteps": 1,
  "projectId": "228f43df-6784-4d43-8f17-27ff450bbfd4",
  "requestedBy": "11111111-2222-3333-4444-555555555555",
  "sourceRevisionId": "6f63d14e-dd4a-407b-8aa2-496f94947504",
  "sourceSceneStateId": "IFC_MODEL",
  "expectedOutputArtifactId": "a2c3c9df-9e6a-4f94-a3f5-5d5eec8fba8c",
  "input": {
    "sourceIfcStorageUrl": "s3://batang-artifacts/projects/228f43df-6784-4d43-8f17-27ff450bbfd4/revisions/6f63d14e-dd4a-407b-8aa2-496f94947504/ifc/model.v1.ifc"
  },
  "expectedOutput": {
    "renderManifestStorageUrl": "s3://batang-artifacts/projects/228f43df-6784-4d43-8f17-27ff450bbfd4/renders/a2c3c9df-9e6a-4f94-a3f5-5d5eec8fba8c/manifest.v1.json",
    "renderPhotoFrontDiagonalLeftStorageUrl": "s3://batang-artifacts/projects/228f43df-6784-4d43-8f17-27ff450bbfd4/renders/a2c3c9df-9e6a-4f94-a3f5-5d5eec8fba8c/photo_front_diagonal_left.png",
    "renderPhotoFrontDiagonalRightStorageUrl": "s3://batang-artifacts/projects/228f43df-6784-4d43-8f17-27ff450bbfd4/renders/a2c3c9df-9e6a-4f94-a3f5-5d5eec8fba8c/photo_front_diagonal_right.png"
  },
  "payload": {
    "renderMode": "ifc2img",
    "prompt": "modern korean house",
    "negativePrompt": "low quality, blurry"
  },
  "attemptNo": 0,
  "maxAttempts": 3,
  "idempotencyKey": "bf869e7f-16c1-4b39-b474-fe55ec075a0d:step-1:sd-render",
  "correlationId": "3e50225d-743d-4b6c-bc22-a57cfb203de7",
  "occurredAt": "2026-05-12T11:26:35.000000Z"
}
```

### 7-3. Fields required by worker
- `command.input.sourceIfcStorageUrl`
- `command.expectedOutput.renderManifestStorageUrl` (or legacy `renderImageStorageUrl`)
- `command.payload.preset` (worker default preset is used when missing)

Worker does not consume REST body directly. It consumes RabbitMQ `CommandMessage` built by BE.

## 8) Layer Add Flow (Inspector)

When user clicks `층 추가` in Inspector > Floor View:

1. Current active layer becomes lower layer.
2. New layer is created and becomes active layer.
3. Overlay mode is turned on automatically.
4. Previous active layer is added to overlay targets.
5. Previous layer opacity defaults to `0.35` (if not set).
6. Selection is cleared to prevent editing old layer elements.

### Related FE state updates
- `setActiveFloorLayerId(newLayerId)`
- `setIsLayerOverlayMode(true)`
- `setOverlayLayerIds([...prev, previousActiveLayerId])`
- `setOverlayOpacityByLayerId[previousActiveLayerId] = 0.35`

### Example floor-plan sync payload after adding 2F over 1F
```json
{
  "action": "FLOOR_PLAN_UPDATED",
  "floorPlanPayloadJson": {
    "sceneType": "TWO_D",
    "layout": {
      "isFloorPlanGenerated": true,
      "floorPlanLayoutSource": "project",
      "activeFloorLayerId": "floor-2",
      "floorLayers": [
        { "id": "floor-1", "name": "1F 평면도", "rooms": [] },
        { "id": "floor-2", "name": "2F 평면도", "rooms": [] }
      ],
      "baseIndex": 12
    }
  }
}
```

Note: overlay state (`isLayerOverlayMode`, `overlayLayerIds`, `overlayOpacityByLayerId`) is FE view-state and controls edit/visibility behavior in the editor.

### 8-1. Initial Bubble to Multi-floor Rule
- Initial bubble diagram is treated as `1F`.
- On first `층 추가` click from bubble-only state:
  1) FE builds `floor-1` from current bubbles/connections.
  2) FE immediately creates `floor-2` as active editable layer.
  3) `floor-1` is switched to overlay with default opacity `0.35`.
  4) Editing targets active layer only (`floor-2`).

Example state after first add:
```json
{
  "activeFloorLayerId": "floor-2",
  "floorLayers": [
    { "id": "floor-1", "name": "1F 평면도" },
    { "id": "floor-2", "name": "2층 평면도" }
  ],
  "overlay": {
    "isLayerOverlayMode": true,
    "overlayLayerIds": ["floor-1"],
    "overlayOpacityByLayerId": { "floor-1": 0.35 }
  }
}
```

## 9) Multi-layer Bubble Editing Direction (WIP)

Goal: make each floor's bubble diagram independently editable (Figma/Photoshop-style layer workflow).

### 9-1. Core Principle
- Bubble data is handled per floor layer, not as one global shared diagram.
- Active layer is editable.
- Lower layers are overlay-only (read-only visual reference).

### 9-2. Editing Flow
1. Before layer switch/add, persist current bubble state into current active layer snapshot.
2. When switching to another layer, load that layer snapshot as current editable bubbles.
3. On add-layer:
   - keep current layer as lower layer
   - create new layer snapshot (initial clone)
   - set new layer active
   - force previous layer into overlay with opacity default (`0.35`).

### 9-3. State Rules
- `activeFloorLayerId` decides edit target.
- Overlay layers must not be mutation targets.
- Selection must be cleared after layer transition to avoid stale edits on lower layer entities.

### 9-4. Payload Impact
- FE should publish only active-layer edits as current working bubble payload.
- Layer snapshots must be restorable so re-entry reproduces per-layer bubble differences.

This section documents the intended architecture direction. Implementation is being migrated to this model.
