FROM python:3.11-slim AS ai-base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    XDG_RUNTIME_DIR=/tmp/runtime-root \
    IFC2IMG_RENDER_BACKEND=raycast

WORKDIR /app

RUN mkdir -p /tmp/runtime-root && chmod 700 /tmp/runtime-root


FROM ai-base AS ai-core

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY packages/ai-common ./packages/ai-common
COPY packages/ai-domain ./packages/ai-domain
COPY packages/ai-layout-import ./packages/ai-layout-import
COPY packages/ai-planning-2d ./packages/ai-planning-2d
COPY packages/ai-planning-3d ./packages/ai-planning-3d
COPY packages/ai-authoring ./packages/ai-authoring
COPY configs ./configs
COPY sample_messages ./sample_messages
COPY main.py ./main.py

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
        -e ./packages/ai-common \
        -e ./packages/ai-domain \
        -e ./packages/ai-layout-import \
        -e ./packages/ai-planning-2d \
        -e ./packages/ai-authoring \
        -e ./packages/ai-planning-3d

ENTRYPOINT ["python", "main.py"]
CMD []


FROM ai-core AS ai-rendering

RUN apt-get update && apt-get install -y --no-install-recommends \
    libegl1 \
    libosmesa6 \
    xauth \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

COPY packages/ai-rendering ./packages/ai-rendering
COPY scripts ./scripts

RUN pip install --no-cache-dir \
        -e ./packages/ai-rendering

ENTRYPOINT ["sh", "-c", "mkdir -p \"$XDG_RUNTIME_DIR\" && chmod 700 \"$XDG_RUNTIME_DIR\"; Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp & export DISPLAY=:99; exec python main.py \"$@\"", "--"]
CMD []
