# Authoring DSL 참조

이 문서는 AuthoringOperation 객체의 초기 공유 의미를 기록합니다.

## 단위

schema가 별도로 명시하지 않는 한 모든 geometry 길이와 좌표는 밀리미터
(`mm`)를 사용합니다.

## Operation 이름 규칙

operation type은 verb-object 형태의 snake case를 사용합니다.

예시:

- `create_wall`
- `create_slab`
- `create_opening`
- `create_space`
- `create_site`

첫 번째 구현 후보는 `create_wall`입니다.

## 책임 경계

operation registry는 operation type 이름을 authoring handler에 연결합니다.
IfcOpenShell 호출은 registry가 아니라 구체 operation module에 둡니다.

## 3D EngineRequest v1

3D Engine Service는 자연어, LLM, 채팅, 사용자 세션을 알지 않는 순수 명령
실행기입니다. 입력은 `EngineRequest` JSON 하나이며, `mode`에 따라
`preview` 또는 `apply` 결과를 반환합니다.

공유 schema 원본은 다음 파일입니다.

- `shared/schemas/engine_request.schema.json`
- `shared/schemas/engine_preview_result.schema.json`
- `shared/schemas/engine_apply_result.schema.json`

`EngineRequest`의 최상위 필드는 다음 의미를 가집니다.

- `schema_version`: v1에서는 항상 `v1`입니다.
- `request_id`: 호출자가 부여하는 요청 식별자입니다. 사용자 세션 ID가 아닙니다.
- `mode`: `preview` 또는 `apply`입니다.
- `project_id`: storage project key입니다. path-safe 문자만 허용합니다.
- `base_revision_id`: 기존 IFC revision 식별자입니다. 새 모델 생성 계열 명령에서는
  `null`일 수 있습니다.
- `operations`: 하나 이상의 정규화된 authoring operation 목록입니다.

### Selector 규칙

`selector.global_ids`는 IFC 요소의 `GlobalId` 목록이며, 가장 정확한 선택자입니다.
`global_ids`가 있으면 엔진은 이를 최우선으로 사용합니다. `global_ids`가 없으면
`element_type`, `name`, `storey`, `tag`, `select_all` 조합으로 요소를 찾습니다.

`select_all=false`이고 `global_ids`가 없는 경우에는 최소 하나의 식별 필터가
있어야 합니다. 아무 조건 없는 전체 선택은 허용하지 않습니다.

### v1 operation type

v1에서 공유 계약으로 인정하는 operation type은 다음 네 가지입니다.

- `create_wall`
- `update_element_properties`
- `transform_elements`
- `delete_elements`

각 operation의 `parameters`는 operation type별 schema로 제한합니다. 임의의
`dict`를 handler가 알아서 해석하는 방식은 허용하지 않습니다.

### Preview와 apply의 경계

`preview`는 IFC 파일과 revision metadata를 쓰지 않습니다. 요소 매칭, 검증,
예상 변경 요약만 반환합니다.

`apply`는 preview 결과나 서버 세션을 신뢰하지 않습니다. 같은 `EngineRequest`를
처음부터 다시 검증하고 매칭한 뒤, 모든 operation이 유효할 때만 새 revision을
저장합니다. v1 apply는 all-or-nothing이며 부분 성공 저장은 허용하지 않습니다.

### Result status

preview result status:

- `preview_ready`
- `invalid_request`
- `not_found`
- `rejected`

apply result status:

- `applied`
- `invalid_request`
- `not_found`
- `rejected`
- `failed`
