# 2D LLM Demo One-Pager

## Demo Message

`2D LLM` is positioned as a safe IFC editing copilot.
It applies clear local edits precisely and does not auto-apply risky room-scale planning changes.

## Core Demo Position

1. Apply demo
- safe local edit only
- wall / opening / door / window

2. Planning-assist demo
- room add / remove / resize
- insert toilet

3. Do not show as auto-apply
- room-scale geometry splitting
- toilet insertion IFC apply
- generic fallback door creation without a reusable template

## Best Single Demo

### Scenario

- user selects one wall in 2D
- assistant input shows a chip like `[wall#2]`
- user says:
  - `[wall#2] 여기에 문을 만들어줘`

### Why this is the best single demo

- visible change is obvious
- target understanding is obvious
- IFC host wall / opening / door relation is easy to explain
- safer than room auto-edit

## Current Create Door Policy

1. House_KR demo target
- create a door only when a reusable existing door template exists in the IFC

2. Representation policy
- prefer existing `IfcDoorType` / `IfcRepresentationMap`
- use deep-copy only as a second choice
- do not present generic swept-solid door generation as demo quality

3. Current branch limits
- no user-selected swing direction
- no user-selected hinge side
- no user-selected width/height in the demo flow
- no automatic semantic choice among entrance / terrace / room door

4. No-template rule
- if no reusable door template exists, do not auto-apply
- return clarification or unsupported

## Recommended Full Demo Flow

### 1. Precise local edit

- select one wall
- request door creation
- show preview
- apply
- confirm in 2D and IFC viewer

### 2. Conflict handling

- select one non-wall element
- ask for a wall-related change
- AI asks a clarification question instead of guessing

### 3. Planning assist

- select one room
- ask to remove or resize it
- AI shows clarification or alternatives
- stop here

### 4. Toilet request

- ask for shared/public toilet insertion
- AI responds with feasibility summary and alternatives
- stop here

## Demo Rules

- single selection only
- selector wins over free text
- room requests do not auto-apply
- insert toilet does not auto-apply
- alternatives are text cards only
- create door is apply-capable only when IFC door template reuse is possible

## What To Say

### Before local apply

- `이 기능은 단순 도형 추가가 아니라, 선택한 벽을 기준으로 IFC의 wall-opening-door 관계를 유지하면서 수정합니다.`

### After local apply

- `문을 그린 것이 아니라, 기존 IFC 문 표현 규칙을 최대한 따라가도록 생성합니다.`

### Before room or toilet alternatives

- `방 단위 변경은 구조와 인접 공간 영향이 커서, 이 브랜치에서는 함부로 자동 적용하지 않고 질문이나 대안으로 돌립니다.`

## What Not To Do

- do not demo add-room apply
- do not demo room apply
- do not demo insert-toilet apply
- do not demo multi-selection
- do not demo geometry overlay previews for alternatives
- do not demo generic door fallback on an IFC with no reusable door template
