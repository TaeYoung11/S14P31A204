from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Mapping
from typing import Any


class ImageProvider(ABC):
    """Image-generation provider 공통 인터페이스."""

    @abstractmethod
    async def generate(self, spec: Mapping[str, Any]) -> Mapping[str, Any]:
        """provider-neutral render spec으로 image result를 생성합니다."""
        raise NotImplementedError

    @abstractmethod
    async def healthcheck(self) -> bool:
        """provider가 접근 가능하고 정상 상태인지 반환합니다."""
        raise NotImplementedError
