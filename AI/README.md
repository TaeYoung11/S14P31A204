# AI Workspace 안내

이 디렉터리는 AI 서비스용 Python 3.11 `uv` workspace입니다.

## 패키지

- `ai-domain`: 공유 도메인 타입과 schema codegen 결과를 둡니다.
- `ai-common`: 여러 워커가 함께 쓰는 실행 유틸리티를 둡니다.
- `ai-planning`: 2D/3D planning 워커 코드를 둡니다.
- `ai-rendering`: image provider와 rendering 워커 코드를 둡니다.
- `ai-authoring`: authoring operation 실행 구조를 둡니다.
- `ai-evals`: prompt/model/output 품질 평가 전용 코드를 둡니다.

패키지 디렉터리 이름은 하이픈을 쓰고, Python import 이름은 언더스코어를 씁니다.
예를 들어 `packages/ai-domain`은 `ai_domain`으로 import합니다.

## 초기 범위

이 초기 세팅은 구조와 최소 인터페이스만 포함합니다. Ollama, vLLM,
RabbitMQ, IfcOpenShell, A1111, ComfyUI, Docker, CI, schema codegen은 아직
구현하지 않습니다.

## 검증

```bash
uv sync
uv run python -c "import ai_domain, ai_common, ai_planning, ai_rendering, ai_authoring, ai_evals"
uv run pytest
uv run ruff check .
uv run mypy packages
```

사용자 로컬 uv cache 또는 managed Python 디렉터리에 쓰기 권한이 없으면,
workspace 내부 경로를 지정한 뒤 같은 명령을 실행합니다.

```powershell
$env:UV_CACHE_DIR = ".uv-cache"
$env:UV_PYTHON_INSTALL_DIR = ".uv-python"
```
