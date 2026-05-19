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

# Install PyTorch with CUDA 12.6 support first so the subsequent
# `pip install -e ./packages/ai-rendering` reuses these wheels instead of
# pulling the default CPU wheel from PyPI. Target hardware: NVIDIA L4 / Ada
# (compute capability 8.9). Falls back to CPU at runtime when CUDA is absent.
#
# Pinned versions — the combination is verified against basicsr/realesrgan
# compatibility on g6.2xlarge. basicsr historically depends on
# `torchvision.transforms.functional_tensor` which was removed in newer
# torchvision releases; a runtime shim in postprocess.py handles that, but
# we still pin the wheel pair so a rebuild can never silently pull a torch
# release that re-introduces ABI breakage with basicsr.
RUN pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cu126 \
        torch==2.11.0+cu126 \
        torchvision==0.26.0+cu126

COPY packages/ai-rendering ./packages/ai-rendering
COPY scripts ./scripts

RUN pip install --no-cache-dir \
        -e ./packages/ai-rendering

# Build-time smoke test: fail fast if any rendering dependency cannot be
# imported (matches the original incident where torchvision was missing).
RUN python -c "import torch, torchvision; \
from ai_rendering.ifc2img.postprocess import _install_basicsr_torchvision_shim; \
_install_basicsr_torchvision_shim(); \
from basicsr.archs.rrdbnet_arch import RRDBNet; \
from realesrgan import RealESRGANer; \
print('torch:', torch.__version__, '/ cuda:', torch.version.cuda); \
print('torchvision:', torchvision.__version__); \
print('RealESRGAN import path ok:', RRDBNet.__name__, RealESRGANer.__name__)"

ENTRYPOINT ["sh", "-c", "mkdir -p \"$XDG_RUNTIME_DIR\" && chmod 700 \"$XDG_RUNTIME_DIR\"; Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp & export DISPLAY=:99; exec python main.py \"$@\"", "--"]
CMD []
