# ai-layout-import

`ai-layout-import`는 layout JSON 입력을 받아 **신규 IFC 산출물을 생성하는 import 전용 패키지**입니다.

## 책임

- `ai_domain.LayoutImportV1` 기반 입력 계약을 받습니다.
- layout JSON을 해석해 신규 IFC 생성 진입점을 제공합니다.
- room 중심의 v1 `space-only` IFC 생성 로직을 담당합니다.
- 향후 `ifc_generate` Worker가 호출할 생성 로직의 패키지 경계를 제공합니다.

## 책임 아님

- 기존 IFC 수정
- preview/apply 기반 revision mutation
- LLM이 만든 IFC edit command 처리
- 기존 IFC 요소를 대상으로 한 IfcOpenShell 직접 수정 로직

위 책임은 `ai-authoring`에 있습니다.

## 현재 구현 범위

- IFC4 기반 `space-only` 생성
- 공개 API:
  - `ai_layout_import.convert_layout_to_ifc`
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

즉, v1은 벽체 중심 모델이 아니라 **공간(`IfcSpace`) 중심 모델**입니다.  
뷰어에서는 방이 실제 벽체가 아니라 `IfcSpace` 볼륨 중심으로 보일 수 있습니다.

## 입력 단위 규칙

`LayoutImportV1` 기준 입력은 아래 규칙을 따릅니다.

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

## 주요 파일

- `src/ai_layout_import/__init__.py`
  - 공개 import surface를 정의합니다.
- `src/ai_layout_import/service.py`
  - layout import 서비스 진입점 `convert_layout_to_ifc()`를 제공합니다.
- `tests/test_service.py`
  - 공개 API 및 현재 구현 범위를 검증합니다.

## 다음 단계

- `ifc_generate` Worker wrapper(`main.py`, `processor.py`)를 추가합니다.
- storage/RabbitMQ 기반 Worker runtime과 연결합니다.
- v2 이상에서 wall/slab/roof/opening 계열 엔티티 생성을 확장합니다.
