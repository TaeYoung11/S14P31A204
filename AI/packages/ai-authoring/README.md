# ai-authoring

기존 IFC model에 `AuthoringOperation`을 적용하는 authoring 워커 패키지입니다.

## 책임

- 기존 IFC를 입력으로 받아 수정/삭제/속성 변경 같은 operation을 실행합니다.
- preview/apply 같은 authoring workflow를 처리합니다.
- IfcOpenShell 기반 편집 로직을 유지합니다.

## 책임 아님

- 프로젝트 layout JSON에서 **신규 IFC를 생성하는 import/generation 기능**
- room/zone/boundary 중심의 신규 IFC import 계약 해석

위 기능은 `ai-layout-import` 패키지에서 담당합니다.

## 현재 상태

초기 상태에서는 operation registry 구조만 포함합니다. IfcOpenShell을 사용하는
구체 operation 구현은 후속 작업입니다.
