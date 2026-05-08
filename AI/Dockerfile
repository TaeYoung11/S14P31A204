FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 모든 AI 워커 패키지를 이미지에 포함한다.
COPY packages/ai-common ./packages/ai-common
COPY packages/ai-domain ./packages/ai-domain
COPY packages/ai-layout-import ./packages/ai-layout-import
COPY packages/ai-planning-2d ./packages/ai-planning-2d
COPY packages/ai-planning-3d ./packages/ai-planning-3d
COPY packages/ai-authoring ./packages/ai-authoring
COPY configs ./configs
COPY sample_messages ./sample_messages
COPY scripts ./scripts
COPY main.py ./main.py

# 공용 엔트리포인트를 유지하며 모든 워커를 지원한다.
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
        -e ./packages/ai-common \
        -e ./packages/ai-domain \
        -e ./packages/ai-layout-import \
        -e ./packages/ai-planning-2d \
        -e ./packages/ai-planning-3d \
        -e ./packages/ai-authoring

CMD ["python", "main.py"]
