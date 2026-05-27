# AI 워크스페이스

이 디렉터리는 Batang AI 워커용 Python 3.11 워크스페이스다.

현재 브랜치의 실행 대상은 `IFC_GENERATE_FROM_BUBBLE` 하나뿐이다.  
2D, 3D, IFC edit, SD render용 placeholder 워커는 이번 브랜치에 등록하지 않는다.

## 패키지

- `ai-common`: 워커 공통 설정, health server, logging, RabbitMQ, S3 어댑터
- `ai-domain`: command/event 메시지 모델
- `ai-layout-import`: IFC generate 워커와 layout-to-IFC 변환 로직
- `ai-authoring`, `ai-planning`, `ai-planning-2d`, `ai-planning-3d`, `ai-rendering`, `ai-evals`: 다른 팀원이 이후 별도 브랜치에서 붙일 패키지

## 로컬 준비

워크스페이스 설치:

```bash
uv sync
```

환경변수 파일 준비:

```bash
cp .env.example .env
```

필수 값:

- `WORKER_TYPE=IFC_GENERATE_FROM_BUBBLE`
- `WORKER_ID=ifc-generate-worker-1`
- `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD`, `RABBITMQ_VHOST`
- `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

`AI_WORKER_TEMP_DIR`는 선택값이며, 비우면 `AI/.tmp/ai-layout-import`를 사용한다.

## IFC Generate 워커 실행

상시 실행:

```bash
uv run ifc-generate-worker
```

one-shot 실행:

```bash
uv run ifc-generate-worker --once
```

루트 디스패처로 실행:

```bash
uv run python main.py
```

루트 디스패처 one-shot 실행:

```bash
uv run python main.py --once
```

## 샘플 command 발행

```bash
WORKER_TYPE=IFC_GENERATE_FROM_BUBBLE uv run python scripts/publish_sample_command.py
```

샘플 발행 스크립트는 `command.ifc-generate.from-bubble` routing key를 사용한다.

## Docker / Compose

현재 Compose 서비스명은 `worker-ifc-generate`이며, 이번 브랜치에서는 이 서비스만 AI 워커로 사용한다.

MinIO bucket 준비만 먼저 하고 싶다면:

```bash
docker compose -f ../INFRA/docker-compose.yml --profile ai up -d rabbitmq minio minio-init
```

IFC generate 워커까지 같이 띄우려면:

```bash
docker compose -f ../INFRA/docker-compose.yml --profile ai up -d worker-ifc-generate
```

## Live Smoke Test

live smoke는 opt-in이며 실제 RabbitMQ/MinIO 연결이 필요하다.

```bash
RUN_LIVE_IFC_GENERATE_SMOKE=1 uv run pytest tests/smoke/test_ifc_generate_worker_live.py
```

이 테스트는 다음을 검증한다.

- UUID 기반 IFC generate command 1건 발행
- `python main.py --once` 실행
- `started`와 `completed` 이벤트 수신
- IFC object 업로드 확인
- validation report object 업로드 확인

주의:

- BE consumer가 붙지 않은 RabbitMQ vhost 또는 격리된 브로커를 사용한다.
- bucket 또는 prefix는 `smoke/<uuid>/...`처럼 격리해서 사용한다.
- `output.storage_url`은 command의 reserved ref와 정확히 같아야 한다.
- 현재 `INFRA/docker-compose.yml`은 호스트에 RabbitMQ AMQP `5672`와 MinIO API `9000`을 노출하지 않으므로, smoke는 해당 서비스에 직접 접근 가능한 환경에서 실행해야 한다.

## 이후 확장 원칙

나중에 다른 worker를 붙일 때도 이번 브랜치에 placeholder를 미리 넣지 않는다.  
각 worker는 별도 컨테이너로 분리해서 추가하고, 공용 이미지 전략 여부는 그 시점에 결정한다.

## 검증

```bash
uv run pytest
uv run ruff check .
uv run mypy packages
```
