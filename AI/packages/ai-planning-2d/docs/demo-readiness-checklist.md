# 2D Demo Readiness Checklist

목표:

- `House_KR.ifc` 기준으로 2D 명령이 실제 IFC 수정까지 이어진다.
- 수정 결과 IFC를 프론트나 IFC 뷰어에서 다시 확인할 수 있다.
- shared engine 계약 기준의 preview/apply 경로를 유지한다.

완료한 항목은 `[x]`, 남은 항목은 `[ ]`로 관리한다.

## 1. 입력 IFC 해석

- [x] `House_KR.ifc`에서 `IfcSpace` 7개를 안정적으로 추출한다.
- [x] `LongName`/Pset fallback으로 방 이름을 복구한다.
- [x] floor boundary, wall, door, window, adjacency를 2D planning에 쓸 수 있게 읽는다.

## 2. 2D planning / preview

- [x] `remove_room` deterministic policy를 구현한다.
- [x] `resize_room` deterministic policy를 구현한다.
- [x] preview validator를 붙인다.
- [x] ambiguity/unsupported를 명시적으로 응답한다.
- [x] `resize_room`에 방향 힌트(`north/south/east/west`)를 지원한다.

## 3. shared engine 계약

- [x] 2D에서 `engineRequest` / `IfcEditCommandPayload`를 생성한다.
- [x] `add_room`, `remove_room`, `resize_room`을 shared operation으로 매핑한다.
- [x] `ai-authoring`에 `create_element`, `delete_elements`, `transform_elements`, `update_element_properties` handler를 연결한다.
- [x] `IfcSpace` create/update/delete가 shared authoring에서 실제로 동작한다.
- [x] shared apply runner를 추가한다.
- [x] `LLM2DPipeline.execute_apply()`가 shared authoring apply를 우선 사용한다.
- [x] shared apply 실패 시 local fallback 경로를 유지한다.

## 4. 테스트 / 검증

- [x] 2D smoke 테스트에 shared payload 검증을 포함한다.
- [x] shared authoring operation 테스트를 추가한다.
- [x] Claude 1차 코드 리뷰를 받고 치명적인 finding을 반영한다.
- [x] `ruff`와 `pytest`를 전체 관련 범위에 대해 통과시킨다.

## 5. 시연 품질

- [x] `add_room` 배치 규칙을 boundary/인접 공간 기준으로 보수적으로 개선한다.
- [x] `House_KR.ifc`에서 무리한 `add_room`은 `unsupported`로 차단한다.
- [x] `House_KR.ifc`에서 방향이 포함된 `resize_room` preview가 실제로 준비되는 케이스를 확보한다.
- [x] `House_KR.ifc`에서 실제 `resize_room` apply 후 output IFC를 생성하고 재추출로 확인한다.
- [x] `House_KR.ifc`에서 실제 `remove_room` apply 시나리오를 하나 확보한다.

## 6. 시연 시나리오

- [x] `House_KR.ifc` 기준 시연 시나리오 3개를 확정한다.
  - `add_room` 또는 `unsupported` 설명 시나리오
  - `resize_room` 성공 시나리오
  - `remove_room` 성공 시나리오
- [x] 각 시나리오별 결과 산출물(output IFC 또는 unsupported 사유)을 정리한다.
- [x] 각 시나리오별 뷰어 확인 포인트를 정리한다.

## 7. Worker 연동

- [ ] worker 담당 팀원 작업과 2D pipeline 입력/출력 계약을 맞춘다.
- [ ] worker 경로에서 `preview -> apply -> output IFC`가 실제로 호출되는지 확인한다.
- [ ] worker를 통해 생성된 output IFC를 다시 열어 `resize_room` / `remove_room` 결과를 검증한다.
- [ ] worker 연결 이후 local fallback 유지 여부와 컷오버 조건을 정리한다.

## 8. 마무리

- [ ] Claude 2차 코드 리뷰를 받는다.
- [ ] worker 연결 이후 최종 변경 요약과 남은 한계를 문서화한다.
- [x] 시연 리허설 스크립트를 정리한다.

## 현재 상태

- `add_room`
  - `House_KR.ifc`에서는 무리한 floating 추가를 막고 `unsupported`로 처리한다.
- `resize_room`
  - 방향 힌트가 있으면 실제 적용 가능한 케이스가 생겼다.
  - 확인 완료 시나리오: `2층 갤러리 width 11400 -> 10400`, `direction=west`
  - 결과 IFC: `AI/scripts/House_KR_resize_gallery_west.ifc`
- `remove_room`
  - shared interior wall 기반 absorber 판단을 추가해 일부 실제 성공 케이스를 확보했다.
  - 확인 완료 시나리오: `1층 욕실 remove_room`
  - 결과 IFC: `AI/scripts/House_KR_remove_bathroom.ifc`
  - 여전히 `서재`, `복도`, `갤러리`는 clarification 또는 unsupported로 남는다.
- 시각화 확인 결과:
  - 현재 `IfcSpace` 중심 수정만으로는 viewer에서 자연스럽지 않다.
  - `add_room`은 멀리 뜬 상자처럼 보일 수 있다.
  - `remove_room`은 section/주변 geometry healing이 없어 변화가 잘 안 보일 수 있다.
  - `resize_room`도 wall/opening/slab 정합성이 부족해 어색하게 보일 수 있다.
  - 따라서 지금은 geometry 고도화보다 worker 연결을 먼저 끝내는 쪽으로 우선순위를 조정한다.

## 다음 작업

- [worker-integration-plan.md](/C:/Users/SSAFY/Desktop/S14P31A204/AI/packages/ai-planning-2d/docs/worker-integration-plan.md) 기준으로 worker 연결을 먼저 진행한다.
- worker 경로에서 결과 IFC가 안정적으로 나오면 그 다음 geometry 고도화 우선순위를 다시 잡는다.
- geometry 고도화 1순위는 `resize_room`, 그 다음 `remove_room`, 마지막이 `add_room`이다.
