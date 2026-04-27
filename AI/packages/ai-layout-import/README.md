# ai-layout-import

프로젝트 layout JSON으로부터 **신규 IFC를 생성**하기 위한 import 패키지입니다.

## 책임

- shared schema 대응 입력을 검증합니다.
- layout JSON -> 신규 IFC 생성 진입점을 제공합니다.
- room, zone, boundary 같은 import 도메인 계약을 해석합니다.

## 책임 아님

- 기존 IFC를 수정하는 authoring operation 실행
- preview/apply 기반 편집 워크플로우
- 기존 IFC 요소를 대상으로 한 IfcOpenShell 편집 로직

위 책임은 `ai-authoring` 패키지에서 담당합니다.

## 현재 상태

- 티켓 1 범위에서는 패키지 골격과 공식 진입점 이름만 고정합니다.
- 실제 IfcOpenShell 기반 IFC 생성 구현은 티켓 2부터 추가합니다.
