# Shared Schemas

This directory contains JSON Schemas shared across the BE/AI boundary and AI workspace packages.

## Included here

- `messages/*.schema.json`: queue message payload schemas
- `layout_import_v1.schema.json`: v1 layout import contract
- `layout_import_v2.schema.json`: v2 layout import contract
- `engine_request.schema.json`: 3D engine request contract
- `engine_preview_result.schema.json`: 3D engine preview result contract
- `engine_apply_result.schema.json`: 3D engine apply result contract

## 2D LLM 워커 계약

### 입력 페이로드
- `two_d_llm_generate.payload.schema.json`: TWO_D_LLM 워커 커맨드 페이로드

### MinIO 아티팩트 출력 (2D LLM)

| MinIO 경로 | 스키마 파일 | 설명 |
|---|---|---|
| `planner/2d-command.v1.json` | `2d_command_artifact.v1.schema.json` | LLM 파싱 결과 + CommandBatch |
| `engine/preview-result.v2.json` | `preview_result_artifact.v2.schema.json` | preview 전체 결과 |
| `engine/engine-request.v2.json` | `engine_request.v2.schema.json` | ai-authoring 실행 요청 (내부 schema_version=v1) |
| `engine/validation-report.v1.json` | `validation_report_artifact.v1.schema.json` | 검증 리포트 |
| `error/error-detail.v1.json` | `error_detail_artifact.v1.schema.json` | 오류 상세 |

> **주의**: `engine/engine-request.v2.json` 파일 내부의 `schema_version` 필드값은 `"v1"` 입니다.  
> 파일명(`v2`)과 내부 버전(`v1`) 불일치는 알려진 이슈이며 추후 정리 예정입니다.

## Worker message contracts

- `messages/command_message.schema.json`: full worker command message contract
- `messages/event_message.schema.json`: full worker event message contract
- Worker message fields use camelCase to match MQ contracts.
- `ifc_generate` accepts layout import payloads using either:
  - `layout_import_v1.schema.json`
  - `layout_import_v2.schema.json`
- `ifc_edit` accepts either an inline engine request or a referenced command JSON.

## Layout import versions

- `v1` remains the original space-oriented import contract.
- `v2` adds:
  - `generation_options`
  - extended `modeling_defaults`
  - `generation_policy`
- `v2` currently fixes policy support to:
  - `boundary_wall_mode = outer_boundary`
  - `shared_wall_policy = from_adjacency`
  - `roof_shape = flat`

The `v2` contract is intended to lock input validation and feature prerequisites for future wall/slab/roof generation. It does not imply those IFC elements are generated today.
