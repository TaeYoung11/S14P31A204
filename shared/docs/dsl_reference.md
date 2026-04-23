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
