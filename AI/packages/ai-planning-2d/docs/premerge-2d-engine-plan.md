# Pre-Merge 2D Engine Plan

## Decision

- Do not start a shared IFC core refactor before the teammate's MR is available.
- Assume the final runtime may use the same top-level engine entrypoint for 2D and 3D.
- Keep 2D-specific planning/rules separate even if the low-level IFC executor is shared later.
- Use the pre-merge period to harden 2D requirements and real IFC input support instead of guessing engine boundaries.

## Why This Decision

The current repository does not contain a clean shared IFC mutation core yet.

Relevant code is spread across several places:

- `ai-layout-import`
  - project tree creation
  - owner history
  - units / geometric context
  - space / wall generation helpers
- `ai-authoring`
  - 3D-oriented authoring helpers
  - query helpers
- `ai-planning-3d`
  - 3D planner / pipeline / validators
- `ai-planning-2d`
  - 2D LLM command generation
  - 2D IFC context extraction

Because the teammate's MR may already be splitting or reorganizing the engine, building a new shared core now is likely to duplicate work or conflict with the merge target.

## Current Ground Truth

### 1. Shared IFC Core Status

There is no dedicated shared IFC core package or layer today.

What exists now is a set of reusable fragments:

- creation helpers in `ai-layout-import`
- authoring helpers in `ai-authoring`
- model/query/validation logic inside `ai-planning-3d`

This means the correct pre-merge move is not to refactor first, but to define the 2D requirements that the future shared engine/core must satisfy.

## Responsibility Split

The most important architectural rule is:

- planning semantics stay 2D-specific
- low-level IFC mutation should become shared only if the teammate MR actually exposes a reusable mutation layer

### 2D-Specific Responsibilities

- natural-language interpretation for floor-plan editing
- room name normalization for residential semantics
- room type inference from 2D context
- room polygon based reasoning
- adjacency reasoning between spaces and walls
- room deletion merge policy
- room resize direction policy
- empty-space search for room addition
- clarification policy for ambiguous floor-plan edits

### Shared Engine / Shared Core Responsibilities

- IFC file open/save
- schema / unit validation
- placement read/write
- pset read/write
- containment / aggregation / host relation mutation
- low-level creation/update/deletion of IFC entities
- reusable geometry helpers for body/axis/opening placement
- generic validation hooks such as collision / orphan opening checks

### Rule for Boundary Decisions

If logic answers the question:

> "What should happen in a floor-plan sense?"

it belongs to 2D planning.

If logic answers the question:

> "How do we encode that decision in IFC safely?"

it belongs to the shared executor/core.

### 2. House_KR.ifc Readiness

`House_KR.ifc` is a valid IFC4 file and is structurally usable:

- schema: `IFC4`
- storeys: `2`
- spaces: `7`
- walls: `13`
- doors: `5`
- windows: `11`

However, the current 2D extractor does not yet support its space geometry well enough:

- current extracted spaces: `0`
- current extracted walls: `13`
- current extracted doors: `5`
- current extracted windows: `2`
- current extracted boundaries: `0`

### 3. Why House_KR.ifc Fails in 2D Today

The spaces in `House_KR.ifc` are not using the Batang-specific room Pset/geometry assumptions.

Observed patterns:

- `IfcSpace.Representation`
  - `Body / Brep / IfcFacetedBrep`
  - `Box / BoundingBox / IfcBoundingBox`
  - `FootPrint / GeometricCurveSet / IfcGeometricCurveSet`
- property sets are ArchiCAD-oriented:
  - `AC_Pset_Name`
  - `ArchiCADProperties`
  - `AC_Pset_Allgemeiner_Raumstempel`
  - `ArchiCADQuantities`
  - `BaseQuantities`

The current extractor mostly expects one of:

- `Batang_SpaceDimensions.Rects`
- simple rectangular `IfcExtrudedAreaSolid`
- width/height fallback

That mismatch is the main blocker, not the file itself.

### 4. Space Naming Problem in House_KR.ifc

Even after geometry extraction is fixed, `House_KR.ifc` still has a semantic targeting problem:

- many `IfcSpace.Name` values are numeric (`1`, `2`, `3`, ...)
- natural-language user requests are likely to refer to semantic names such as:
  - `거실`
  - `침실`
  - `주방`
  - `안방`

This means `spaces == 7` is necessary but not sufficient.

2D must also define a naming fallback strategy.

### Naming Fallback Strategy

Priority order:

1. Batang-specific room name property if present
2. semantic room label from known ArchiCAD / external property sets if present
3. `IfcSpace.LongName` if usable
4. `IfcSpace.Name`
5. generated fallback label such as `Room-1`, with clarification required for user-facing targeting

### Clarification Rule for Naming

If semantic names cannot be recovered and only numeric names remain:

- do not silently guess `거실` / `침실`
- require clarification or selection by shown room label
- for demo readiness, semantic naming recovery is strongly preferred

## Demo Success Criteria

This project is not aiming for a technical-only pipeline demo. The minimum demo bar is visual plausibility on the same IFC file.

### Minimum Demo Criteria

- `House_KR.ifc` spaces are extracted and targetable
- a user can identify an existing room from 2D context
- the same modified IFC can be reloaded by frontend 2D and 3D views
- delete / resize results do not look like isolated detached blocks
- wall / opening side effects are at least handled deterministically or blocked with clarification

### Non-Acceptable Demo State

- adding a room as a disconnected floating block
- deleting a room by only removing `IfcSpace` while leaving obviously broken layout geometry
- showing a 2D-only visual change that is not encoded into the saved IFC
- allowing ambiguous semantic targeting without clarification

## Pre-Merge TODOs

## TODO 1. Recover 2D Space Extraction for Real IFC

### Goal

Make `House_KR.ifc` usable as a 2D editing input by restoring `IfcSpace` extraction.

### Must Support

- `IfcFacetedBrep` based room body extraction
- `FootPrint` based 2D polygon extraction
- ArchiCAD/standard Pset fallback for room metadata
- `BaseQuantities` fallback for width/height/height/perimeter if Batang Pset is absent

### Minimum Success Criteria

- `extract_ifc_context("House_KR.ifc")` returns `spaces == 7`
- each extracted space has:
  - `id`
  - `name`
  - `floor`
  - `polygon`
  - width/height derived from polygon or quantity fallback
- floor boundaries are generated for both storeys

### Why This Is Safe Pre-Merge

This work is input compatibility work. It does not depend on the final engine split and remains useful no matter how the shared engine is merged later.

## TODO 2. Freeze 2D Editing Requirements by Action

### Goal

Write down what 2D editing actually means at the IFC level so engine discussions stop being abstract.

### remove_room

Required read capabilities:

- target room lookup by normalized name
- target room polygon
- adjacent rooms
- shared walls
- connected doors/windows
- containing storey and floor boundary

Required mutation capabilities:

- delete or deactivate target `IfcSpace`
- decide merge target or vacancy policy
- update neighboring room geometry if merged
- update/remove shared walls
- update door/window host relations or remove orphan openings

Clarification conditions:

- room name ambiguous
- locked room
- semantic room name cannot be resolved from source IFC
- no valid merge policy
- structural / exterior wall constraints prevent deterministic change

### remove_room 1차 deterministic rule

#### 목표

- `IfcSpace`만 지우는 것이 아니라, 사람이 봤을 때 납득 가능한 평면 결과를 같은 IFC에 반영한다.

#### 1차 지원 범위

- 하나의 내부 공간만 삭제
- 같은 층에서만 처리
- 삭제 대상과 맞닿아 있는 인접 공간 중 **지배적인 하나의 흡수 후보**가 있을 때만 자동 처리

#### 지배적인 흡수 후보 정의

아래 조건을 모두 만족하는 후보가 정확히 하나일 때만 자동 삭제를 허용한다.

1. 삭제 대상과 shared wall 또는 직접 닿는 boundary edge가 있다.
2. 후보 공간이 삭제 대상과 같은 `floor`에 있다.
3. 삭제 대상과 맞닿는 길이가 인접 후보 중 가장 길다.
4. 그 길이가 전체 삭제 대상 둘레의 의미 있는 비율을 차지한다.
   - 초기 기준: shared edge 비율 `>= 0.3`
5. 후보가 외부 boundary를 심하게 침범하지 않는다.

#### 적용 결과

- 삭제 대상 `IfcSpace`는 제거 또는 비활성화한다.
- 지배적인 후보 공간 polygon은 삭제 대상 polygon을 union하여 확장한다.
- 두 공간 사이 shared wall은 제거 후보로 본다.
- shared wall에 붙은 문/창/opening은 아래 규칙을 따른다.

#### opening 처리 규칙

- 삭제되는 shared wall에만 붙은 opening은 기본적으로 제거한다.
- 외벽이나 유지되는 wall에 붙은 opening은 유지한다.
- host wall을 잃는 opening이 남으면 실패로 간주하고 clarification 또는 block 처리한다.

#### 벽 처리 규칙

- 두 공간 사이 내부 shared wall만 제거 대상이다.
- 외벽은 제거하지 않는다.
- 구조/내력 정보가 불분명하면 제거하지 않고 clarification 처리한다.

#### 자동 처리 금지 조건

- 인접 후보가 0개
- 인접 후보가 여러 개이고 지배적인 하나로 결정되지 않음
- 삭제 대상이 외부 boundary에 직접 크게 기여하는 공간임
- 제거 대상 wall에 중요한 opening이 걸려 있어 orphan risk가 발생함
- 구조 wall / exterior wall 제거가 필요한 경우

#### 실패 시 동작

- 자동 추론으로 밀어붙이지 않는다.
- `needs_clarification=true` 또는 explicit unsupported로 반환한다.

### resize_room

Required read capabilities:

- target room polygon
- neighboring room polygons
- shared wall graph
- exterior boundary constraints
- doors/windows attached to moved walls

Required mutation capabilities:

- move/reshape room polygon
- move/split/merge walls
- reproject or recreate openings
- revalidate adjacency and boundary

Clarification conditions:

- expansion direction ambiguous
- resize collides with multiple rooms
- semantic room name cannot be resolved from source IFC
- structural / exterior constraints block deterministic move

### resize_room 1차 deterministic rule

#### 목표

- 리사이즈는 단순 width/height 숫자 수정이 아니라, 방 polygon과 관련 wall을 함께 재조정하는 것이다.

#### 1차 지원 범위

- 하나의 공간만 대상
- 같은 층에서만 처리
- 직사각형에 가까운 단순 공간부터 지원
- 한 번에 **한 방향 확장 또는 축소**만 허용

#### 방향 결정 규칙

자동 처리 가능 조건은 아래 중 하나다.

1. 사용자 텍스트에 방향이 명시됨
   - 예: 북쪽, 동쪽, 오른쪽, 복도 쪽
2. 확장 가능한 방향이 하나뿐임
   - 한 방향만 빈 공간 또는 단일 인접 공간과 접함
3. 상대적 크기 변경인데 현재 공간의 가장 긴 자유 edge가 명확함

그 외에는 clarification 처리한다.

#### 확장 규칙

- 확장 방향의 edge를 목표 치수만큼 평행 이동한다.
- 이동 결과가 빈 공간이면 그대로 확장한다.
- 이동 결과가 정확히 하나의 인접 공간과만 충돌하면:
  - 인접 공간 축소 가능 여부를 확인
  - 가능하면 shared wall을 이동
  - 불가능하면 clarification
- 둘 이상 공간과 동시 충돌하면 clarification

#### 축소 규칙

- 축소는 대상 공간 polygon만 줄이고, 남는 영역은 자동으로 새 방을 만들지 않는다.
- 남는 영역은 아래 중 하나로만 처리한다.
  - 같은 인접 공간 하나에 흡수
  - unsupported / clarification

#### wall 처리 규칙

- resize는 관련 shared wall 이동으로 표현한다.
- 외벽 방향 resize는 더 엄격하게 처리한다.
  - 외벽 이동이 필요하면 구조/경계 검증이 선행되어야 한다.
- wall split/merge가 필요하더라도 결과가 deterministic할 때만 허용한다.

#### opening 처리 규칙

- 이동하는 wall에 붙은 door/window는 wall-local position을 재투영한다.
- 재투영 후 wall segment 범위를 벗어나면 clarification 또는 remove candidate로 처리한다.
- host wall이 변경되는 경우는 1차 범위에서 지원하지 않는다.

#### 자동 처리 금지 조건

- 리사이즈 방향이 두 개 이상 가능함
- 둘 이상의 인접 공간을 동시에 밀어야 함
- 외벽/구조 wall을 크게 이동해야 함
- opening 재배치가 deterministic하지 않음
- 결과 polygon이 self-intersection 또는 boundary overflow를 일으킴

#### 실패 시 동작

- geometry를 억지로 쓰지 않는다.
- clarification 또는 unsupported로 반환한다.

### add_room

Required read capabilities:

- floor boundary
- empty candidate region
- adjacency targets
- available host walls

Required mutation capabilities:

- create `IfcSpace`
- create or split walls
- optionally create opening/door plan
- assign storey / psets / placement / representation

Clarification conditions:

- no valid placement region
- requested size cannot fit boundary
- requested adjacency cannot be satisfied deterministically

### visual/style_change

This action is relevant for demo expectations, but should be explicitly scoped.

#### 1st Phase

- color/material change is optional
- geometry correctness and same-IFC reload take priority

#### 2nd Phase

- if frontend and renderer support it, attach visual style/material updates through IFC-compatible metadata or surface styles

#### Rule

Do not implement color-only 2D visual changes unless the change survives in the same IFC consumed by both 2D and 3D views.

## TODO 3. Define the Engine Contract 2D Needs

### Goal

Prepare a concrete interface checklist for reviewing the teammate's MR.

The engine can still be shared at the top level, but the following contract must exist somewhere.

### Required Contract Surface

#### Load / Save

- open IFC model
- validate supported schema
- save modified IFC

#### Query / Context

- get storeys
- get spaces with polygon/placement/metadata
- get walls with start/end/thickness/hosted openings
- get doors/windows and host relations
- get floor boundary / adjacency graph

#### Mutation

- create/update/delete `IfcSpace`
- create/update/delete `IfcWall`
- create/update/delete `IfcOpeningElement`
- create/update/delete `IfcDoor`
- create/update/delete `IfcWindow`
- reassign containment / aggregation / host relations

#### Geometry / Placement

- model unit to mm conversion
- local placement read/write
- polygon/body/axis helper creation
- wall axis and body update
- opening projection onto host wall

#### Validation Hooks

- collision check
- boundary overflow check
- orphan opening check
- structural/exterior wall guardrails
- failure result with machine-readable reason for clarification handoff

### Review Question for the MR

When the teammate's MR arrives, review it with this single question:

> Can 2D inject a deterministic layout plan into this engine and rely on it to mutate the same IFC file that 3D also renders?

If the answer is no, the shared engine is incomplete for 2D even if the top-level API is shared.

## TODO 4. List the Capabilities 2D Must Eventually Own

These are planner-level responsibilities and should remain 2D-specific even if the executor is shared.

- room name normalization for floor-plan semantics
- room-type inference for residential plans
- room polygon based planning
- wall-space adjacency reasoning
- merge policy after room deletion
- resize direction policy
- empty-space candidate search for room addition
- opening retention / movement rules from a 2D layout perspective

This list is important because it marks what should **not** be forced into a generic 3D planner.

## Failure Policy

2D editing must not "sort of succeed" if the resulting IFC would be visually broken.

### Preferred Failure Order

1. deterministic success
2. deterministic block with clarification
3. explicit unsupported result

### Avoid

- silent no-op with success response
- partially broken IFC mutation
- visual-only fake success not reflected in the IFC

## TODO 5. Post-MR Decision Rule

After the teammate's MR is merged or ready for review:

### If the MR Already Introduces a Shared Mutation Layer

- do not build another core
- map 2D planner outputs to that layer
- request missing 2D capabilities explicitly

### If the MR Only Shares the Top-Level Engine Entry

- keep the shared entry
- split 2D and 3D planners under it
- propose a shared IFC mutation sublayer as the next refactor

### If the MR Is Still 3D-Biased Internally

- do not force 2D into 3D planner logic
- extract low-level IFC mutation helpers only
- keep 2D planner/rules separate

## Recommended Immediate Work Order

1. Expand `extract_ifc_context()` to support `House_KR.ifc` spaces.
2. Add tests using `House_KR.ifc`-like `IfcFacetedBrep` / `FootPrint` structures.
3. Write down deterministic 2D mutation policies for `remove_room` and `resize_room`.
4. Wait for the teammate's MR before creating any shared IFC core package.
5. Review the MR against the contract in this document.

## Non-Goals Before the MR

- creating a new `ai-ifc-core` package immediately
- large cross-package refactors
- forcing a permanent 2D/3D engine split before seeing the merged structure
- implementing visual-only 2D edits that do not round-trip into IFC

## Summary

The most sensible pre-merge path is:

- do not refactor shared engine/core yet
- do make 2D real-IFC-compatible now
- do define the exact contract the shared engine must satisfy for 2D

That keeps the work useful regardless of how the teammate finally merges the shared engine.
