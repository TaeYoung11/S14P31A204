# ai-layout-import

프로젝트 layout JSON으로부터 **신규 IFC를 생성**하는 import 패키지입니다.

## 책임

- `LayoutImportV1` 입력을 검증합니다.
- `convert_layout_to_ifc()` 코어 API를 제공합니다.
- 로컬 CLI와 worker adapter를 통해 같은 코어를 재사용합니다.
- v1 범위에서는 `space-only` IFC를 생성합니다.

## 현재 생성 범위

- `IfcProject`
- `IfcSite`
- `IfcBuilding`
- `IfcBuildingStorey`
- `IfcSpace`
- `IfcZone`

## 현재 생성하지 않는 범위

- `IfcWall`
- `IfcSlab`
- `IfcRoof`
- `IfcDoor`
- `IfcWindow`

## 입력 단위 규칙

- `width`, `height`, `space_height_mm`: `int mm`
- `x`, `y`: 중심점 좌표 `float mm`
- `angle`: `float radian`

IFC geometry 생성 직전에만 `mm -> m` 변환을 수행합니다.

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

## Worker adapter

worker용 얇은 adapter는 `ai_layout_import.worker`에 있습니다.

```python
from ai_layout_import.worker import run_layout_import_job

result = run_layout_import_job(payload, "output/model.ifc")
```

반환 형식:

- 성공: `{"ok": true, "output_path": "..."}`
- 실패: `{"ok": false, "code": "...", "message": "...", "details": [...]}`

## 샘플 입력

- 경로: `packages/ai-layout-import/examples/layout_import_v1_sample.json`
- 현재 예시는 `zones`, `adjacency`, `boundaries`를 포함합니다.
- v1에서는 `adjacency`, `boundaries`를 geometry에 사용하지 않고 metadata로만 보존합니다.

## IFC viewer 수동 검증

1. 생성된 IFC를 IFC viewer에서 엽니다.
2. `IfcSpace`가 방 개수만큼 보이는지 확인합니다.
3. `1F`, `2F` 등 storey가 분리되어 있는지 확인합니다.
4. zone이 있는 room은 `IfcZone` group assignment가 있는지 확인합니다.
5. 벽, 슬래브, 지붕이 생성되지 않았는지 확인합니다.
