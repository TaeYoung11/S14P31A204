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

# 현재 브랜치에서는 IFC generate 실행에 필요한 패키지만 이미지에 포함한다.
COPY packages/ai-common ./packages/ai-common
COPY packages/ai-domain ./packages/ai-domain
COPY packages/ai-layout-import ./packages/ai-layout-import
COPY configs ./configs
COPY sample_messages ./sample_messages
COPY scripts ./scripts
COPY main.py ./main.py

# 공용 엔트리포인트를 유지하되, 현재 디스패처는 IFC generate만 지원한다.
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
        -e ./packages/ai-common \
        -e ./packages/ai-domain \
        -e ./packages/ai-layout-import

CMD ["python", "main.py"]
