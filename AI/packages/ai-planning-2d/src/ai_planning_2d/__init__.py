"""ai_planning_2d 패키지의 주요 진입점과 공개 API를 모아 노출한다."""

from importlib import import_module
from typing import TYPE_CHECKING

from .command import ActionType, CommandBatch, FloorNLPCommand, IFCCommand
from .engine import FloorPlanEngine
from .engine_request import build_engine_request
from .executor import apply_space_plan
from .ifc_extractor import extract_ifc_context
from .pipeline import to_ifc_commands
from .schemas.ifc_context import IFCContext
from .session_pipeline import LLM2DPipeline
from .utils import shape_to_rects

if TYPE_CHECKING:
    from .worker import TwoDLlmWorker, build_two_d_llm_worker, run_two_d_llm_job

__all__ = [
    "FloorNLPCommand",
    "ActionType",
    "IFCCommand",
    "CommandBatch",
    "IFCContext",
    "FloorPlanEngine",
    "build_engine_request",
    "apply_space_plan",
    "extract_ifc_context",
    "to_ifc_commands",
    "LLM2DPipeline",
    "TwoDLlmWorker",
    "build_two_d_llm_worker",
    "run_two_d_llm_job",
    "shape_to_rects",
]


def __getattr__(name: str) -> object:
    if name in {"TwoDLlmWorker", "build_two_d_llm_worker", "run_two_d_llm_job"}:
        try:
            worker_module = import_module(".worker", __name__)
            return getattr(worker_module, name)
        except ImportError as exc:
            raise AttributeError(f"module {__name__!r} has no attribute {name!r}") from exc
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
