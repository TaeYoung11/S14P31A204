"""AI 워커 루트 디스패처.

지원 워커:
- IFC_GENERATE_FROM_BUBBLE: 버블 다이어그램 → IFC 변환 워커
- THREE_D_LLM: 3D LLM 진단 및 계획 워커
- IFC_EDIT_APPLY: IFC 편집 (Authoring) 워커
"""

from __future__ import annotations

import os
from collections.abc import Callable, Sequence
from importlib import import_module

Entrypoint = Callable[[Sequence[str] | None], int]

_WORKER_TYPE_TO_ENTRYPOINT: dict[str, str] = {
    "IFC_GENERATE_FROM_BUBBLE": "ai_layout_import.worker_app:main",
    "TWO_D_LLM": "ai_planning_2d.worker_app:main",
    "THREE_D_LLM": "ai_planning_3d.worker_app:main",
    "IFC_EDIT_APPLY": "ai_authoring.worker_app:main",
    "SD_RENDER_GENERATE": "ai_rendering.worker_app:main",
}


def _load_entrypoint(target: str) -> Entrypoint:
    module_name, function_name = target.split(":", maxsplit=1)
    module = import_module(module_name)
    return getattr(module, function_name)


def main(argv: Sequence[str] | None = None) -> int:
    worker_type = os.getenv("WORKER_TYPE")
    if not worker_type:
        raise RuntimeError("AI 워커를 시작하려면 WORKER_TYPE 환경변수가 필요합니다.")

    target = _WORKER_TYPE_TO_ENTRYPOINT.get(worker_type)
    if target is None:
        raise RuntimeError(
            f"지원하지 않는 WORKER_TYPE입니다: {worker_type!r}. "
            f"현재 지원 목록: {sorted(_WORKER_TYPE_TO_ENTRYPOINT)}"
        )

    entrypoint = _load_entrypoint(target)
    return entrypoint(argv)


if __name__ == "__main__":
    raise SystemExit(main())
