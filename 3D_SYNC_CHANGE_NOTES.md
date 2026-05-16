# 3D/2D 동기화 변경 흐름 정리

## 작성 기준

- 기준 diff: 현재 staged 상태의 변경 파일 6개
- 목적: 최근 2D/3D 동기화, IFC 삭제 명령, undo/redo 커서, IFC 재로딩 관련 변경 흐름을 한 문서에서 추적하기 위함
- 주의: 사용자가 마지막에 말한 것처럼 `3D 스냅샷/BE까지 이어지는 변경`은 다른 브랜치로 분리하거나 되돌릴 후보가 있다. 이 문서는 되돌리기 전 현재 변경 내용을 보존하기 위한 기록이다.

## 전체 흐름

1. FE에서 사용자가 2D 또는 3D 편집을 수행한다.
2. `useWorkspaceCommandPublisher`가 편집 내용을 `workspaceCommand`로 만든다.
3. `useEditorPage`가 로컬 floor-plan snapshot 변경 상태를 표시한다.
4. snapshot publish 흐름이 `/floor-plan/update`로 현재 도면 상태와 command를 전송한다.
5. BE `WorkspaceFloorPlanRealtimeService`가 floor-plan draft를 relay하고, IFC 편집 요청을 만든다.
6. BE `FloorPlanIfcEditEngineRequestMapper`가 command를 IFC edit engine operation으로 변환한다.
7. IFC 편집 결과가 새 revision 또는 새 IFC URL로 내려오면 FE가 revision/fallback URL 변화를 감지해 IFC를 다시 로드한다.

## 변경 파일별 정리

### `FE/src/features/editor/hooks/useBubbleSnapshotRealtime.ts`

역할:

- bubble snapshot과 floor-plan snapshot의 undo/redo history cursor를 맞추는 hook이다.

변경 내용:

- floor-plan undo/redo/update 수신 시 `payloadBaseIndex`를 우선 사용하도록 수정했다.
- 기존에는 floor-plan update에서 `(payloadBaseIndex ?? current) + 1`로 계산해 bubble 쪽 cursor 방식과 어긋날 수 있었다.
- 현재는 bubble과 동일하게 서버 payload가 가진 base index를 그대로 신뢰하고, payload가 없을 때만 로컬 ref를 보정한다.

의도:

- undo/redo 시 바로 이전 버전이 아니라 엇갈린 버전을 바라보는 문제를 줄이기 위함이다.
- 2D/3D 편집도 bubble과 같은 history cursor 규칙을 쓰도록 맞춘 변경이다.

### `FE/src/features/editor/hooks/useEditorPage.ts`

역할:

- 에디터 화면의 핵심 상태와 편집 핸들러, snapshot publish 조건, IFC 로딩 상태를 관리한다.

변경 내용:

- `recordIfcElementChange()`에서 IFC 요소 변경 시 `markLocalFloorPlanSnapshotChanged()`를 호출하도록 추가했다.
- IFC 로딩 중복 방지용 `dedupeKey`에 `revisionId`를 포함했다.

의도:

- 3D IFC 요소 편집도 floor-plan snapshot 변경으로 간주해 publish 대상이 되도록 하기 위함이다.
- 같은 asset URL이라도 revision이 바뀌면 새 IFC로 다시 로드되어야 하므로, `projectId + sourceUrl`만으로 dedupe하지 않도록 했다.

주의:

- 이 파일의 `markLocalFloorPlanSnapshotChanged()` 추가는 "3D 스냅샷 전송 구조에 맞춰 보내기" 요구를 반영한 부분이다.
- 이후 사용자가 말한 방향처럼 BE 쪽 IFC 파일 브로드캐스팅 수정은 다른 브랜치에서 진행한다면, 이 변경은 유지/분리/되돌림 여부를 따로 판단해야 한다.

### `FE/src/features/editor/hooks/useFreshIfcUrl.ts`

역할:

- IFC asset id를 fresh URL로 해석하고, 실패 시 fallback URL을 반환한다.

변경 내용:

- 내부 cache 상태에 `fallbackUrl`을 함께 저장하도록 변경했다.
- 같은 `assetId`라도 `fallbackUrl`이 바뀌면 이전 resolved URL을 재사용하지 않고 fallback을 다시 반영한다.

의도:

- IFC edit 후 asset id는 같지만 fallback URL 또는 revision URL이 달라지는 케이스에서 오래된 URL이 계속 사용되는 문제를 막기 위함이다.

### `FE/src/features/editor/hooks/useWorkspaceCommandPublisher.ts`

역할:

- FE 편집 동작을 BE/IFC edit engine이 이해할 수 있는 `workspaceCommand` 형태로 만든다.

변경 내용:

- `IfcDoor` 삭제는 `entity: 'door'`로 보낸다.
- `IfcWindow` 삭제는 `entity: 'window'`로 보낸다.
- 그 외 IFC 요소 삭제는 기존처럼 `entity: 'ifcElement'`로 보낸다.

의도:

- 문/창문은 IFC에서 filler와 opening void가 묶여 있으므로, 일반 `delete_elements` 경로가 아니라 void 삭제 경로로 매핑될 수 있게 entity를 보존하기 위함이다.
- FE에서 무조건 `ifcElement`로 보내면 BE mapper가 문/창문 삭제를 구분할 수 없다.

### `BE/src/main/java/com/a204/batang/domain/workspace/service/FloorPlanIfcEditEngineRequestMapper.java`

역할:

- workspace command를 Python IFC edit engine operation으로 변환한다.

변경 내용:

- delete command의 entity가 `door`, `window`, `opening`이면 `delete_elements`가 아니라 `delete_wall_void` operation으로 변환한다.
- `expected_kind` 파라미터에 entity 값을 넣는다.
- room 삭제는 기존처럼 IFC global id가 아닌 경우 무시한다.

의도:

- 문/창문 삭제 시 opening void까지 함께 삭제되는 engine 경로를 타게 하기 위함이다.
- 3D에서 문/창문을 삭제했는데 IFC에서 void/filler가 제대로 사라지지 않는 문제를 command mapping 차원에서 해결하려는 변경이다.

주의:

- 이 BE 변경은 사용자가 말한 "백엔드까지 수정한 부분은 다른 브랜치에서 진행" 대상에 포함될 가능성이 높다.
- 현재 브랜치에 남길지, 별도 브랜치로 옮길지 판단이 필요하다.

### `BE/src/main/java/com/a204/batang/domain/workspace/service/WorkspaceFloorPlanRealtimeService.java`

역할:

- floor-plan realtime update를 relay하고, 필요한 경우 IFC edit 요청을 생성한다.

변경 내용:

- `DirectIfcEditRequest` 생성 시 `sourceSceneType`을 고정값 `IFC_MODEL` 대신 현재 `sceneType.name()`으로 넣도록 변경했다.

의도:

- 3D 편집에서 들어온 snapshot/command가 3D scene type으로 IFC edit 흐름에 전달되도록 하기 위함이다.

주의:

- 현재 관찰상 "IFC 파일을 다시 브로드캐스팅하지 않는다"는 문제는 이 변경만으로 해결되지 않았다.
- 실제 해결 지점은 IFC edit 완료 후 floor-plan updated 이벤트가 새 `revisionId`/`s3Url`/`assetId`를 포함해 publish되는지 확인하는 쪽일 가능성이 높다.
- 이 변경도 BE 분리 대상일 수 있다.

## 기능 관점 변경 흐름

### Undo/Redo cursor

문제:

- 2D/3D 편집 undo/redo가 바로 이전 상태가 아니라 어긋난 index를 참고하는 것처럼 보였다.

변경:

- floor-plan history cursor도 bubble history cursor처럼 `payloadBaseIndex`를 기준으로 동기화한다.

남은 확인:

- 여러 사용자가 동시에 편집할 때 remote update 이후 local undo/redo depth가 의도대로 유지되는지 확인이 필요하다.

### IFC 문/창문 삭제 command

문제:

- 3D에서 문/창문 삭제가 일반 `ifcElement` 삭제 command로 나가면 BE가 door/window인지 모른다.
- IFC에서는 문/창문과 opening void가 묶여 있어 일반 삭제보다 `delete_wall_void` 계열 처리가 필요하다.

변경:

- FE가 `IfcDoor`/`IfcWindow`를 각각 `door`/`window` entity로 보낸다.
- BE mapper가 해당 entity를 `delete_wall_void` operation으로 변환한다.

남은 확인:

- Python IFC edit engine이 `delete_wall_void`와 `expected_kind`를 기대한 대로 처리하는지 확인해야 한다.
- BE 변경을 다른 브랜치로 옮길 경우 FE command entity 보존만 이 브랜치에 남길지 결정해야 한다.

### IFC 재로딩

문제:

- 같은 asset/source URL로 판단되면 새 revision이 생겨도 FE가 IFC 재로딩을 건너뛸 수 있다.

변경:

- IFC load dedupe key에 `revisionId`를 포함했다.
- `useFreshIfcUrl` cache도 `assetId`뿐 아니라 `fallbackUrl` 변화까지 본다.

남은 확인:

- BE가 IFC edit 완료 후 실제로 새 revision 정보를 내려주는지 확인해야 한다.

### 3D snapshot publish

문제:

- 3D에서 IFC 요소를 변경해도 floor-plan snapshot 변경으로 표시되지 않으면 publish 조건에 걸리지 않을 수 있다.

변경:

- `recordIfcElementChange()`에서 snapshot dirty flag를 올린다.

남은 확인:

- 사용자가 최근 정리한 방향상, 여기서 핵심 문제는 snapshot이 아니라 command 종류가 일반적으로 나가는 부분일 수 있다.
- 따라서 이 변경은 되돌릴 후보이며, 유지하더라도 BE 브로드캐스팅 흐름과 함께 검증해야 한다.

## 검증했던 항목

- FE ESLint
- FE TypeScript build check
- BE `compileJava`

단, 최종적으로 "IFC 파일이 다시 브로드캐스팅되는지"는 아직 해결 확인이 되지 않았다.

## 이후 정리 제안

1. 현재 브랜치에 남길 변경과 다른 브랜치로 옮길 변경을 분리한다.
2. 이 브랜치에 남길 가능성이 높은 변경:
   - floor-plan undo/redo cursor 동기화
   - FE 문/창문 삭제 command entity 보존
   - IFC revision/fallback URL 기반 재로딩 보정
3. 다른 브랜치로 분리할 가능성이 높은 변경:
   - BE `delete_wall_void` mapper 변경
   - BE `sourceSceneType` 전달 변경
   - 3D snapshot dirty flag 추가
4. 분리 후 다시 확인할 핵심 시나리오:
   - 3D에서 문 삭제 시 command entity가 `door`로 나가는지
   - 3D에서 창문 삭제 시 command entity가 `window`로 나가는지
   - BE가 door/window delete를 void 삭제 operation으로 변환하는지
   - IFC edit 완료 후 새 IFC URL 또는 revision이 FE로 내려오는지
   - FE가 새 revision을 보고 IFC를 다시 로드하는지
