from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Mapping, Sequence
from typing import Any


class LLMProvider(ABC):
    """Planning task가 사용하는 LLM provider 공통 인터페이스."""

    @abstractmethod
    async def generate(
        self,
        messages: Sequence[Mapping[str, Any]],
        *,
        model: str,
        temperature: float = 0.2,
        response_schema: Mapping[str, Any] | None = None,
        max_tokens: int = 4096,
        stop: Sequence[str] | None = None,
    ) -> Mapping[str, Any]:
        """완성된 응답 하나를 생성합니다."""
        raise NotImplementedError

    @abstractmethod
    def stream_generate(
        self,
        messages: Sequence[Mapping[str, Any]],
        **kwargs: Any,
    ) -> AsyncIterator[Mapping[str, Any]]:
        """provider에서 응답 chunk를 스트리밍합니다."""
        raise NotImplementedError
