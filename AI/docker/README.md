# Docker

This repository currently uses a single top-level `Dockerfile` plus the
`main.py` dispatcher.

The same image now supports these worker types:
- `IFC_GENERATE_FROM_BUBBLE`
- `TWO_D_LLM`

because the image installs both:
- `ai-layout-import`
- `ai-planning-2d`

and `main.py` dispatches by `WORKER_TYPE`.

## Build

```bash
docker build -t batang-ai-worker .
```

## Run With IFC Generate

```bash
docker run --rm \
  --env-file .env \
  -e WORKER_TYPE=IFC_GENERATE_FROM_BUBBLE \
  batang-ai-worker
```

## Run With 2D LLM

```bash
docker run --rm \
  --env-file configs/worker.2d-llm.env.example \
  batang-ai-worker
```

## One-shot

```bash
docker run --rm \
  --env-file configs/worker.2d-llm.env.example \
  batang-ai-worker \
  python main.py --once
```
