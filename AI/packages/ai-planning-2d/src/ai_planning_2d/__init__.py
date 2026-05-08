from importlib import import_module
from typing import TYPE_CHECKING

from .command import ActionType, CommandBatch, FloorNLPCommand, IFCCommand, NewRoom
from .context import AdjacencyEntry, FloorBoundary, FloorProject, Room
from .critique import recommend_floor_improvements, summarize_floor_improvements
from .engine import FloorPlanEngine
from .engine_request import build_engine_request, build_ifc_edit_payload
from .executor import apply_space_plan
from .ifc_extractor import extract_ifc_context
from .policies import plan_remove_room, plan_resize_room
from .pipeline import to_ifc_commands
from .preview_validators import PreviewValidationResult, validate_preview_plan
from .schemas.ifc_context import IFCContext, SpaceContext, StoreyContext
from .schemas.plan_v14 import PLAN_SCHEMA_VERSION, PlanV14
from .schemas.validation import PlanStatus, ValidationIssue, ValidationSeverity
from .session_pipeline import LLM2DPipeline
from .toilet_demo import build_toilet_insertion_geometry_plan, plan_toilet_near_bathroom
from .utils import shape_to_rects

if TYPE_CHECKING:
    from .worker import TwoDLlmWorker, build_two_d_llm_worker, run_two_d_llm_job

__all__ = [
    # command
    "FloorNLPCommand",
    "NewRoom",
    "ActionType",
    "PLAN_SCHEMA_VERSION",
    "PlanStatus",
    "PlanV14",
    "IFCCommand",
    "CommandBatch",
    "IFCContext",
    "SpaceContext",
    "StoreyContext",
    "ValidationIssue",
    "ValidationSeverity",
    # context
    "Room",
    "AdjacencyEntry",
    "FloorBoundary",
    "FloorProject",
    "recommend_floor_improvements",
    "summarize_floor_improvements",
    "plan_toilet_near_bathroom",
    "build_toilet_insertion_geometry_plan",
    # engine
    "FloorPlanEngine",
    "build_engine_request",
    "build_ifc_edit_payload",
    "apply_space_plan",
    "extract_ifc_context",
    "plan_remove_room",
    "plan_resize_room",
    # pipeline
    "to_ifc_commands",
    "LLM2DPipeline",
    "PreviewValidationResult",
    "validate_preview_plan",
    "TwoDLlmWorker",
    "build_two_d_llm_worker",
    "run_two_d_llm_job",
    # utils
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
