# Docker

현재 AI 이미지는 IFC generate 워커 전용 런타임으로 사용한다.

이번 브랜치에서는 별도 Dockerfile을 추가하지 않고, `main.py` 디스패처와 `WORKER_TYPE=IFC_GENERATE_FROM_BUBBLE` 조합으로 실행한다.

## 이미지 빌드

`AI` 디렉터리에서 실행:

```bash
docker build -t batang-ai-ifc-generate .
```

## 컨테이너 실행

env 파일 기준 상시 실행:

```bash
docker run --rm \
  --env-file .env \
  batang-ai-ifc-generate
```

one-shot 실행:

```bash
docker run --rm \
  --env-file .env \
  batang-ai-ifc-generate \
  python main.py --once
```

## 이후 확장 원칙

다른 worker가 추가되더라도 이번 브랜치에서는 placeholder 이미지를 만들지 않는다.  
추후에는 worker별 컨테이너를 별도로 추가하고, 공용 이미지 유지 여부는 의존성을 보고 결정한다.
## SD render Docker smoke

Build the worker image from the `AI` directory:

```bash
docker build -t batang-ai-worker:sd-render .
```

Use the Docker-specific env example for container-to-host networking:

```bash
docker run --rm \
  --env-file configs/worker.sd-render.docker.env.example \
  batang-ai-worker:sd-render \
  --help
```

On Windows PowerShell, keep the Hugging Face model cache across smoke runs:

```powershell
docker run --rm `
  --name batang-sd-render-worker-smoke `
  --env-file configs\worker.sd-render.docker.env.example `
  -v "$env:USERPROFILE\.cache\huggingface:/root/.cache/huggingface" `
  batang-ai-worker:sd-render `
  --once --work-root /tmp/ai_rendering_worker
```

The Docker env file uses `host.docker.internal` for RabbitMQ and MinIO because
`localhost` inside the container points at the container itself. It also sets
`RABBITMQ_HEARTBEAT=0` for long first-run smoke tests where model downloads can
block the consumer loop.
