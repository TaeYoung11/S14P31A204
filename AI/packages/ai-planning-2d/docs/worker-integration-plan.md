# Worker Integration Plan

목적:

- 현재 2D pipeline이 만든 `engineRequest` / `IfcEditCommandPayload`를 worker 경로에 먼저 연결한다.
- geometry 고도화는 그 다음 단계로 미룬다.

배경:

- 현재 `resize_room` / `remove_room`은 실제 IFC 파일까지 생성할 수 있다.
- 하지만 viewer에서 보면 geometry 품질은 아직 부족하다.
- 따라서 지금은 “더 자연스럽게 보이게 만드는 것”보다 “실제 worker 경로에서 end-to-end로 도는 것”이 우선이다.

## 현재 전제

- 2D 쪽:
  - `extract_ifc_context()`
  - `LLM2DPipeline.execute_preview()`
  - `LLM2DPipeline.execute_apply()`
  - shared authoring apply
  - local fallback
- worker 쪽:
  - 담당 팀원 구현 완료
  - 이제 2D 입력/출력 계약만 맞추면 된다.

## 우선순위

### 1. worker 계약 확인

- worker가 2D에 넘겨주는 입력이 무엇인지 확정
  - 자연어 명령
  - source IFC 위치
  - project / revision 정보
- worker가 2D 결과로 기대하는 출력이 무엇인지 확정
  - preview JSON
  - apply 결과 JSON
  - output IFC 경로 또는 storage URL

### 2. worker에서 2D pipeline 호출 연결

- worker가 `LLM2DPipeline.execute_preview()`를 호출하도록 연결
- apply 단계에서 `session_id`를 이어서 `execute_apply()`를 호출하도록 연결
- 현재 shared apply 경로가 우선 사용되는지 확인

### 3. worker 경유 IFC 산출물 검증

- `House_KR.ifc` 기준으로 최소 2개 검증
  - `resize_room` 성공 케이스
  - `remove_room` 성공 케이스
- worker가 만든 결과 IFC를 다시 열어
  - 공간 수
  - 대상 room width/height
  - output file 생성 여부
  를 확인

### 4. fallback 정책 정리

- worker 환경에서도 shared apply 실패 시 local fallback을 유지할지 결정
- 유지한다면:
  - 어떤 에러에서 fallback 허용
  - 어떤 에러는 즉시 실패 처리
- 제거한다면:
  - 컷오버 시점
  - 제거 전 필요한 통합 테스트

## worker 연결 이후 다음 순서

1. `resize_room` geometry 고도화
   - viewer에서 제일 눈에 띄고 비교가 쉬움
2. `remove_room` geometry healing
3. `add_room` 자연 배치 + wall/door 연결

## 하지 않을 것

- worker 연결 전에 `add_room` geometry를 먼저 고도화하는 것
- viewer 품질 문제를 해결하지 못한 상태에서 시각적 완성도를 약속하는 것
- worker 경로 검증 없이 local script 결과만으로 통합이 끝났다고 보는 것

## 성공 기준

- worker를 통해 `preview -> apply -> output IFC`가 실제로 돈다.
- `House_KR.ifc` 기준으로 최소 한 개의 `resize_room`, 한 개의 `remove_room` 결과 IFC를 worker 경로로 생성한다.
- 그 다음에 geometry 고도화를 시작한다.
