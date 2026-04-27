# ai-layout-import

프로젝트 layout JSON으로부터 **신규 IFC를 생성**하는 import 패키지입니다.

## 책임

- shared schema 기반 입력을 검증합니다.
- layout JSON -> 신규 IFC 생성 진입점을 제공합니다.
- room 중심의 v1 `space-only` IFC를 생성합니다.

## 책임 아님

- 기존 IFC를 수정하는 authoring operation 실행
- preview/apply 기반 편집 워크플로
- 기존 IFC 요소를 대상으로 한 IfcOpenShell 직접 수정 로직

위 책임은 `ai-authoring` 패키지에 있습니다.

## 현재 구현 범위

- IFC4 기반 `space-only` 생성
- 생성 엔티티:
  - `IfcProject`
  - `IfcSite`
  - `IfcBuilding`
  - `IfcBuildingStorey`
  - `IfcSpace`
- 현재 생성하지 않는 엔티티:
  - `IfcWall`
  - `IfcSlab`
  - `IfcRoof`
  - `IfcDoor`
  - `IfcWindow`

뷰어에서는 방이 실제 벽체가 아니라 `IfcSpace` 볼륨 중심으로 보입니다.

## 입력 단위 규칙

- `width`, `height`, `space_height_mm`는 `int mm`
- `x`, `y`는 room 중심점 좌표이며 `float mm`
- `angle`은 `float radian`

즉, 입력 계산은 mm 기준으로 유지하고 회전값만 라디안으로 받습니다.

## mm -> m 변환 규칙

IFC geometry 생성 직전에만 mm 값을 meter로 변환합니다.

- `x_m = x_mm / 1000.0`
- `y_m = y_mm / 1000.0`
- `width_m = width_mm / 1000.0`
- `height_m = height_mm / 1000.0`
- `space_height_m = space_height_mm / 1000.0`

`space_height_mm`가 없으면 `2700`을 fallback으로 사용합니다.

## 공간 배치 규칙

- `x`, `y`는 방 중심점입니다.
- 각 room은 직사각형 footprint를 갖는 `IfcSpace`로 생성됩니다.
- `angle`은 XY 평면 회전에 반영됩니다.
- 층 배치는 다음 규칙을 따릅니다.
  - `floor=1 -> Z=0`
  - `floor=n -> (n-1) * effective_space_height_m`

즉, 다층 공간은 유효 공간 높이만큼 위로 적층됩니다.

## v1 제한 사항

- `zones`, `adjacency`, `boundaries`는 v1에서 geometry 생성에 사용하지 않습니다.
- v1은 의도적으로 `space-only`입니다.
- 외벽/슬래브/지붕/문/창 생성은 후속 버전 범위입니다.
