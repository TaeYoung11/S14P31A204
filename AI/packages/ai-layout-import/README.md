# ai-layout-import

`ai-layout-import`는 프로젝트 layout JSON으로부터 **신규 IFC를 생성**하는 import 전용 패키지입니다.

## 책임

- `ai_domain.LayoutImportV1` 입력 계약을 받습니다.
- `convert_layout_to_ifc()` 코어 API를 제공합니다.
- 로컬 CLI와 worker adapter가 같은 코어를 재사용하도록 경계를 제공합니다.
- v1 범위에서는 `space-only` IFC 생성 로직을 담당합니다.

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
  - `IfcZone`
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

`zones`, `adjacency`, `boundaries`의 좌표/참조 값도 현재 v1 계약 기준에 맞춰 해석합니다.  
특히 `boundaries[].polygon` 좌표는 `float mm` 기준입니다.

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

## zone / metadata 처리

- `zones`가 있으면 `IfcZone`를 생성합니다.
- `room.zone_id`가 있으면 해당 `IfcSpace`를 `IfcZone`에 연결합니다.
- `zone.color`는 v1에서 시각 스타일에 사용하지 않고 metadata로만 저장합니다.
- room / zone metadata는 property set으로 저장합니다.
- `adjacency`, `boundaries`는 geometry 생성에 사용하지 않고 metadata로만 보존합니다.

## 공개 API

```python
from ai_layout_import import convert_layout_to_ifc
```

```python
convert_layout_to_ifc(request, "output/model.ifc")
```

## CLI 사용법

설치형 script:

```powershell
uv run layout-import-json-to-ifc --input packages/ai-layout-import/examples/layout_import_v1_sample.json --output .codex-test-output/model.ifc
```

모듈 실행:

```powershell
uv run python -m ai_layout_import.cli --input packages/ai-layout-import/examples/layout_import_v1_sample.json --output .codex-test-output/model.ifc
```

성공 시 stdout으로 JSON 결과를 출력합니다.

```json
{"ok": true, "output_path": ".codex-test-output/model.ifc"}
```

실패 시 stderr로 JSON 에러를 출력합니다.

```json
{"ok": false, "code": "validation_error", "message": "입력 검증에 실패했습니다.", "details": []}
```

에러 코드는 현재 아래를 사용합니다.

- `validation_error`
- `input_error`
- `conversion_error`

## Worker adapter

worker용 얇은 adapter는 `ai_layout_import.worker`에 있습니다.

```python
from ai_layout_import.worker import run_layout_import_job

result = run_layout_import_job(payload, "output/model.ifc")
```

반환 형식:

- 성공: `{"ok": true, "output_path": "..."}`
- 실패: `{"ok": false, "code": "...", "message": "...", "details": [...]}`

이 adapter는 코어 API를 호출하는 thin wrapper까지만 담당하며, 실제 broker/consumer 루프는 포함하지 않습니다.

## 샘플 입력

- 경로: `packages/ai-layout-import/examples/layout_import_v1_sample.json`
- 현재 예시는 `zones`, `adjacency`, `boundaries`를 포함합니다.
- v1에서는 `adjacency`, `boundaries`를 geometry에 사용하지 않고 metadata로만 보존합니다.

## IFC viewer 수동 검증

1. 생성된 IFC를 IFC viewer에서 엽니다.
2. `IfcSpace`가 방 개수만큼 보이는지 확인합니다.
3. `1F`, `2F` 등 storey가 분리되어 있는지 확인합니다.
4. zone이 있는 room은 `IfcZone` group assignment가 있는지 확인합니다.
5. 벽, 슬래브, 지붕, 문, 창이 생성되지 않았는지 확인합니다.

## 주요 파일

- `src/ai_layout_import/__init__.py`
  - 공개 import surface를 정의합니다.
- `src/ai_layout_import/service.py`
  - `convert_layout_to_ifc()` 코어 IFC 생성 로직을 제공합니다.
- `src/ai_layout_import/cli.py`
  - 로컬 JSON -> IFC CLI 진입점을 제공합니다.
- `src/ai_layout_import/worker.py`
  - worker용 thin adapter를 제공합니다.
- `tests/test_service.py`
  - 공개 API 및 현재 IFC 생성 범위를 검증합니다.
- `tests/test_cli.py`
  - CLI 실행 경로를 검증합니다.
- `tests/test_worker.py`
  - worker adapter 경로를 검증합니다.

## 다음 단계

- 실제 `ifc_generate` worker runtime과 연결합니다.
- storage / RabbitMQ 기반 consumer와 통합합니다.
- v2 이상에서 wall / slab / roof / opening 계열 엔티티 생성을 확장합니다.