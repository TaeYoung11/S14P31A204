# ai-layout-import

`ai-layout-import`는 layout JSON 입력을 받아 **새 IFC 산출물을 생성하는 import 전용 패키지**입니다.

## 책임

- `ai_domain.LayoutImportV1` 기반 입력 계약을 받습니다.
- layout import의 공식 서비스 진입점 `convert_layout_to_ifc()`를 제공합니다.
- 향후 `ifc_generate` Worker가 호출할 생성 로직의 패키지 경계를 제공합니다.

## 책임 아님

- 기존 IFC 수정
- preview/apply 기반 revision mutation
- LLM이 만든 IFC edit command 처리

위 책임은 `ai-authoring`에 있습니다.

## Current Status

- 현재 구현은 **패키지 경계와 공식 진입점 고정**까지 완료된 상태입니다.
- 공개 API:
  - `ai_layout_import.convert_layout_to_ifc`
- 현재 `convert_layout_to_ifc(request, output_path)`는 `LayoutImportV1` 요청과 출력 경로를 받는 시그니처만 고정되어 있고, 실제 IFC 생성은 아직 구현되지 않았습니다.
- 현재 테스트는 “공개 진입점이 노출되어 있고 아직 `NotImplementedError`를 발생시킨다”는 점을 검증합니다.

## Files

- `src/ai_layout_import/__init__.py`
  - 공개 import surface를 정의합니다.
- `src/ai_layout_import/service.py`
  - layout import 서비스 진입점을 정의합니다.
- `tests/test_service.py`
  - 현재 단계의 공개 API 계약을 검증합니다.

## Next Step

- `ifc_generate` Worker wrapper(`main.py`, `processor.py`)를 추가합니다.
- IfcOpenShell 기반 실제 IFC 생성 로직을 `service.py` 뒤에 구현합니다.
- storage/RabbitMQ 기반 Worker runtime과 연결합니다.
