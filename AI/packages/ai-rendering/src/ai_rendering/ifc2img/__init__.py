# ruff: noqa: F401
"""Lightweight public exports for the ifc2img package."""

from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .exceptions import IFCRenderError
    from .presets import list_presets, load_preset
    from .renderer import IFCRenderer
    from .semantics import (
        IfcSemanticSummary,
        extract_ifc_semantic_summary,
    )
    from .style import (
        DepthStyleParams,
        DepthStyleRenderer,
        DepthStyleRenderOptions,
        DepthStyleResult,
        resolve_preset_background_params,
        resolve_preset_view_render_options,
    )
    from .views import IFCView, build_view_prompt

_LAZY_EXPORTS = {
    "IFCRenderer": (".renderer", "IFCRenderer"),
    "IFCView": (".views", "IFCView"),
    "IFCRenderError": (".exceptions", "IFCRenderError"),
    "DepthStyleParams": (".style", "DepthStyleParams"),
    "DepthStyleResult": (".style", "DepthStyleResult"),
    "DepthStyleRenderer": (".style", "DepthStyleRenderer"),
    "DepthStyleRenderOptions": (".style", "DepthStyleRenderOptions"),
    "resolve_preset_background_params": (".style", "resolve_preset_background_params"),
    "resolve_preset_view_render_options": (".style", "resolve_preset_view_render_options"),
    "list_presets": (".presets", "list_presets"),
    "load_preset": (".presets", "load_preset"),
    "build_view_prompt": (".views", "build_view_prompt"),
    "IfcSemanticSummary": (".semantics", "IfcSemanticSummary"),
    "extract_ifc_semantic_summary": (
        ".semantics",
        "extract_ifc_semantic_summary",
    ),
}

__all__ = list(_LAZY_EXPORTS)


def __getattr__(name: str) -> Any:
    try:
        module_name, attr_name = _LAZY_EXPORTS[name]
    except KeyError as exc:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}") from exc

    module = import_module(module_name, __name__)
    value = getattr(module, attr_name)
    globals()[name] = value
    return value


def __dir__() -> list[str]:
    return sorted([*globals(), *_LAZY_EXPORTS])
