from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar


class OperationRegistryError(Exception):
    """Operation registry 오류의 base exception."""


class DuplicateOperationError(OperationRegistryError):
    """operation type이 중복 등록될 때 발생합니다."""


class UnknownOperationError(OperationRegistryError):
    """operation type에 등록된 handler가 없을 때 발생합니다."""


OperationClass = TypeVar("OperationClass", bound=type[Any])

_REGISTRY: dict[str, Any] = {}


def register(op_type: str) -> Callable[[OperationClass], OperationClass]:
    if not op_type:
        raise ValueError("op_type은 비어 있을 수 없습니다")

    def decorator(cls: OperationClass) -> OperationClass:
        if op_type in _REGISTRY:
            raise DuplicateOperationError(f"Operation '{op_type}'은 이미 등록되어 있습니다")

        instance = cls()
        setattr(instance, "type", op_type)
        _REGISTRY[op_type] = instance
        return cls

    return decorator


def get(op_type: str) -> Any:
    try:
        return _REGISTRY[op_type]
    except KeyError as exc:
        raise UnknownOperationError(f"알 수 없는 operation type입니다: {op_type}") from exc


def all_types() -> list[str]:
    return sorted(_REGISTRY)
