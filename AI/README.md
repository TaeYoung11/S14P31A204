# AI Workspace

이 디렉토리는 Python 3.11 기반 `uv` workspace입니다.

## Packages

- `ai-common`: Worker 공통 실행 SDK, 설정, 로깅, 어댑터가 들어갈 공용 패키지
- `ai-domain`: 공용 메시지 모델, 스키마 대응 타입, 도메인 계약 패키지
- `ai-planning`: `llm_2d`, `llm_3d` 계열 Worker 템플릿과 planning 로직 패키지
- `ai-rendering`: `sd_render` 계열 Worker 템플릿과 rendering 로직 패키지
- `ai-layout-import`: `ifc_generate` 계열 Worker 템플릿과 layout → IFC import 패키지
- `ai-authoring`: `ifc_edit` 계열 Worker 템플릿과 IFC authoring 패키지
- `ai-evals`: 평가 및 실험용 패키지

패키지 디렉토리 이름은 kebab-case를 쓰고, Python import 이름은 snake_case를 씁니다.
예: `packages/ai-layout-import` → `ai_layout_import`

## Worker Asset Conventions

루트 공용 자산은 아래 위치를 기준으로 사용합니다.

- `configs/`: Worker별 환경 변수 템플릿 (`*.env.example`만 커밋, 실제 `*.env`는 로컬에서 생성)
- `sample_messages/`: command/event 샘플 메시지
- `scripts/`: 로컬 실행, 샘플 publish, bucket bootstrap 등 운영 스크립트
- `docker/`: Worker 이미지용 Dockerfile
- `tests/unit/`: 순수 단위 테스트
- `tests/integration/`: 외부 어댑터 연동 테스트
- `tests/smoke/`: 실행 가능성 확인용 스모크 테스트

## Package Ownership

- `ifc_generate` 책임은 `ai-layout-import`가 가진다.
- `ifc_edit` 책임은 `ai-authoring`이 가진다.
- `ai-layout-import`는 새 IFC 산출물 생성에 집중하고, 기존 IFC 수정 책임은 갖지 않는다.
- `ai-authoring`은 기존 IFC/revision 수정에 집중하고, layout import 책임은 갖지 않는다.

## Current Scope

현재 워크스페이스는 공통 구조와 패키지 경계를 우선 정리하는 단계다.
RabbitMQ, MinIO/S3, Worker loop, health check, Docker Compose wiring, stub Worker 구현은
후속 티켓에서 순차적으로 추가한다.

## Validation

```bash
uv sync
uv run python -c "import ai_domain, ai_common, ai_planning, ai_rendering, ai_layout_import, ai_authoring, ai_evals"
uv run pytest
uv run ruff check .
uv run mypy packages
```

Windows에서 로컬 cache / managed Python 경로를 workspace 내부로 고정하려면 아래 예시를 사용합니다.

```powershell
$env:UV_CACHE_DIR = ".uv-cache"
$env:UV_PYTHON_INSTALL_DIR = ".uv-python"
```
