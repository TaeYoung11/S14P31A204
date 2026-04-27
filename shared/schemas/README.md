# Shared Schemas 안내

이 디렉터리는 BE-AI 경계를 넘거나 여러 AI 워커 패키지가 공유하는 JSON
계약의 단일 원본입니다.

## 여기에 둘 것

- `messages/*.schema.json` 같은 queue message payload schema
- `building_plan.schema.json` 같은 공유 domain 계약
- `authoring_operation.schema.json` 같은 워커 간 계약
- `layout_import_v1.schema.json` 같은 신규 IFC import 계약
- `engine_request.schema.json` 같은 3D Engine Service 입력/결과 계약

## 여기에 두지 않을 것

- A1111 request body 같은 provider 전용 payload
- 패키지 내부에서만 쓰는 schema
- 아직 공유 계약이 아닌 prompt task output schema

prompt task schema는 공유 계약으로 승격되기 전까지
`AI/prompts/tasks/{group}/{task}/{version}/schema.json`에 둡니다.

초기 codegen 대상은 shared schema로 한정하고, package-local schema는 포함하지
않습니다.

## 3D Engine Service 계약

순수 3D Engine Service는 정규화된 `EngineRequest`만 입력으로 받습니다.
AI, 자연어, 채팅, 사용자 세션은 이 계약에 포함하지 않습니다.

현재 v1 계약 파일은 다음과 같습니다.

- `engine_request.schema.json`
- `engine_preview_result.schema.json`
- `engine_apply_result.schema.json`
