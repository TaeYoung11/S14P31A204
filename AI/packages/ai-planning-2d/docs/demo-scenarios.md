# 2D Demo Scenarios

기준 입력 파일:

- 원본 IFC: [House_KR.ifc](/C:/Users/SSAFY/Desktop/S14P31A204/AI/scripts/House_KR.ifc)

시연 원칙:

- 성공 시나리오는 반드시 `preview_ready -> applied`까지 확인된 것만 사용한다.
- 실패 시나리오는 의도적으로 `unsupported` 또는 `needs_clarification`이 나는 이유를 설명한다.
- 시연 중에는 “현재 구현이 안전하게 막는 경우”도 품질의 일부로 설명한다.

## 시나리오 1. add_room 차단 시연

- 목적: 무리한 방 추가를 억지로 수행하지 않고 안전하게 차단하는 흐름을 보여준다.
- 추천 명령:
  - `1층에 2800x2400 방을 추가해줘`
- 기대 preview 결과:
  - `status = unsupported`
  - 요약 메시지에 `feasible placement`가 포함된다.
- apply:
  - 수행하지 않는다.
- 결과 산출물:
  - 별도 output IFC 없음
  - 이유: 현재 `House_KR.ifc` 1층에서는 boundary 내부에 자연스럽게 배치할 수 있는 슬롯을 찾지 못하면 생성 자체를 차단한다.
- 시연 포인트:
  - 예전처럼 멀리 떨어진 floating room을 만들지 않는다.
  - “안전하지 않은 자동 생성은 막는다”는 정책을 설명한다.

## 시나리오 2. resize_room 성공 시연

- 목적: 방향 힌트를 이용한 실제 IFC 수정 성공 케이스를 보여준다.
- 추천 명령:
  - `2층 갤러리를 서쪽으로 줄여서 가로를 10400으로 바꿔줘`
- 기대 preview 결과:
  - `status = preview_ready`
  - `policy_plan.direction = west`
- 기대 apply 결과:
  - `status = applied`
  - `apply_mode = shared_authoring`
- 결과 산출물:
  - [House_KR_resize_gallery_west.ifc](/C:/Users/SSAFY/Desktop/S14P31A204/AI/scripts/House_KR_resize_gallery_west.ifc)
- before / after 체크포인트:
  - 대상 공간: `2층 갤러리`
  - before width: `11400`
  - after width: `10400`
  - 높이(`9400`)는 유지된다.
  - 서쪽 방향 축소이므로 공간 anchor가 서쪽 기준으로 변하고, 결과 IFC를 다시 읽었을 때 width가 줄어든다.

## 시나리오 3. remove_room 성공 시연

- 목적: 실제 주거 IFC에서 room delete가 shared apply까지 이어지는 케이스를 보여준다.
- 추천 명령:
  - `1층 욕실을 삭제해줘`
- 기대 preview 결과:
  - `status = preview_ready`
  - 요약 메시지: `A dominant adjacent absorber was found for room removal.`
- 기대 apply 결과:
  - `status = applied`
  - `apply_mode = shared_authoring`
- 결과 산출물:
  - [House_KR_remove_bathroom.ifc](/C:/Users/SSAFY/Desktop/S14P31A204/AI/scripts/House_KR_remove_bathroom.ifc)
- before / after 체크포인트:
  - before spaces: `7`
  - after spaces: `6`
  - `욕실` 공간이 제거된다.
  - shared interior wall 기반 absorber 판단으로 삭제가 허용된 케이스임을 설명한다.

## 시연 순서 추천

1. `add_room` 차단 케이스로 안전장치를 먼저 보여준다.
2. `resize_room` 성공 케이스로 실제 geometry 수정이 된다는 점을 보여준다.
3. `remove_room` 성공 케이스로 실제 공간 삭제까지 된다는 점을 마무리로 보여준다.

## 발표용 한 줄 요약

- `add_room`: “자연스럽게 배치할 수 없으면 생성하지 않습니다.”
- `resize_room`: “방향이 명확하면 shared authoring으로 실제 IFC를 수정합니다.”
- `remove_room`: “흡수 대상이 명확하면 실제 방 삭제까지 적용합니다.”
