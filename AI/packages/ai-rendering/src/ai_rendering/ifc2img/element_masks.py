"""IFC element-type debug mask rendering."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import open3d as o3d
from PIL import Image

from .exceptions import IFCRenderError
from .semantics import (
    IfcColorSummary,
    IfcSemanticCategory,
    SUPPORTED_SEMANTIC_CATEGORIES,
    nearest_prompt_color_name,
    select_ifc_category_color_candidate,
)
from .semantics import _semantic_category_for_entity as semantic_category_for_entity

IfcColorArtifactVariant = Literal[
    "default",
    "prompt_injection",
    "hybrid_color",
    "post_color_lock",
]
IfcColorArtifactTimeOfDay = Literal["DAY", "NIGHT"]

ELEMENT_MASK_COLORS: dict[IfcSemanticCategory, tuple[int, int, int]] = {
    "FLOOR": (255, 64, 64),
    "ROOF": (64, 128, 255),
    "WALL": (160, 160, 160),
    "WINDOW": (64, 220, 255),
    "DOOR": (255, 160, 64),
}


@dataclass(frozen=True)
class IfcElementMaskRenderResult:
    masks: dict[IfcSemanticCategory, Image.Image]
    composite: Image.Image


@dataclass(frozen=True)
class IfcElementMeanColor:
    category: IfcSemanticCategory
    pixel_count: int
    mean_rgb: tuple[float, float, float] | None


@dataclass(frozen=True)
class IfcElementColorDelta:
    category: IfcSemanticCategory
    pixel_count: int
    mean_rgb: tuple[float, float, float] | None
    target_rgb: tuple[float, float, float] | None
    delta: float | None


@dataclass(frozen=True)
class IfcElementColorCorrectionCandidate:
    category: IfcSemanticCategory
    pixel_count: int
    mean_rgb: tuple[float, float, float] | None
    target_rgb: tuple[float, float, float] | None
    delta: float


@dataclass(frozen=True)
class IfcCategoryColorEvaluation:
    category: IfcSemanticCategory
    delta_to_target: float | None
    pixel_count: int
    pixel_coverage: float
    measured_color_family: str | None
    target_color_family: str | None
    expected_color_families: tuple[str, ...]
    family_pass: bool
    delta_pass: bool


@dataclass(frozen=True)
class IfcColorEvaluationReport:
    categories: dict[IfcSemanticCategory, IfcCategoryColorEvaluation]
    shape_collapse_notes: str
    background_regression_notes: str

    @property
    def color_family_pass(self) -> bool:
        return all(
            category.family_pass
            for category in self.categories.values()
        )

    @property
    def delta_pass(self) -> bool:
        return all(
            category.delta_pass
            for category in self.categories.values()
        )

    @property
    def shape_pass(self) -> bool:
        return self.shape_collapse_notes == ""

    @property
    def background_pass(self) -> bool:
        return self.background_regression_notes == ""

    @property
    def success(self) -> bool:
        return (
            self.color_family_pass
            and self.delta_pass
            and self.shape_pass
            and self.background_pass
        )


@dataclass(frozen=True)
class IfcColorArtifactMatrixCase:
    variant: IfcColorArtifactVariant
    time_of_day: IfcColorArtifactTimeOfDay
    ifc_color_mode: str
    use_prompt_color_injection: bool
    use_ifc_color_composite: bool
    use_post_color_lock: bool
    post_color_lock_strength: float

    @property
    def case_name(self) -> str:
        return f"{self.variant}_{self.time_of_day.lower()}"


COLOR_LOCK_MEASURE_CATEGORIES: tuple[IfcSemanticCategory, ...] = (
    "ROOF",
    "WALL",
    "WINDOW",
    "DOOR",
)
DEFAULT_COLOR_CORRECTION_DELTA_THRESHOLD = 0.18
EXPECTED_IFC_COLOR_FAMILIES: dict[IfcSemanticCategory, tuple[str, ...]] = {
    "FLOOR": (),
    "ROOF": ("green",),
    "WALL": ("gray", "white"),
    "WINDOW": ("blue",),
    "DOOR": ("tan", "brown"),
}
COLOR_ARTIFACT_VARIANTS: tuple[IfcColorArtifactVariant, ...] = (
    "default",
    "prompt_injection",
    "hybrid_color",
    "post_color_lock",
)
COLOR_ARTIFACT_TIMES_OF_DAY: tuple[IfcColorArtifactTimeOfDay, ...] = (
    "DAY",
    "NIGHT",
)


def render_ifc_element_masks(
    ifc_path: Path | str,
    *,
    eye: tuple[float, float, float] | list[float],
    look_at: tuple[float, float, float] | list[float],
    up: tuple[float, float, float] | list[float],
    width: int,
    height: int,
) -> IfcElementMaskRenderResult:
    """Render visible FLOOR/ROOF/WALL/WINDOW/DOOR masks from IFC geometry."""
    ifc_path = Path(ifc_path)
    category_meshes = _load_category_meshes(ifc_path)
    all_mesh = _merge_meshes(list(category_meshes.values()))
    if all_mesh is None:
        raise IFCRenderError("IFC element mask rendering found no supported geometry.")

    rays = _create_rays(
        eye=np.asarray(eye, dtype=np.float32),
        look_at=np.asarray(look_at, dtype=np.float32),
        up=np.asarray(up, dtype=np.float32),
        width=width,
        height=height,
    )
    full_depth = _cast_depth(all_mesh, rays, width=width, height=height)
    masks: dict[IfcSemanticCategory, Image.Image] = {}
    composite_arr = np.zeros((height, width, 3), dtype=np.uint8)

    for category in SUPPORTED_SEMANTIC_CATEGORIES:
        mesh = category_meshes.get(category)
        if mesh is None:
            mask_arr = np.zeros((height, width), dtype=np.uint8)
        else:
            category_depth = _cast_depth(mesh, rays, width=width, height=height)
            visible = _visible_category_mask(full_depth, category_depth)
            mask_arr = visible.astype(np.uint8) * 255
            composite_arr[visible] = ELEMENT_MASK_COLORS[category]
        masks[category] = Image.fromarray(mask_arr, mode="L")

    return IfcElementMaskRenderResult(
        masks=masks,
        composite=Image.fromarray(composite_arr, mode="RGB"),
    )


def build_ifc_color_artifact_matrix(
    *,
    post_color_lock_strength: float = 1.0,
) -> tuple[IfcColorArtifactMatrixCase, ...]:
    """Return the fixed DAY/NIGHT artifact matrix for IFC color comparison."""
    if not 0.0 <= post_color_lock_strength <= 1.0:
        raise ValueError("post_color_lock_strength must be between 0.0 and 1.0")

    cases: list[IfcColorArtifactMatrixCase] = []
    for time_of_day in COLOR_ARTIFACT_TIMES_OF_DAY:
        cases.extend(
            (
                IfcColorArtifactMatrixCase(
                    variant="default",
                    time_of_day=time_of_day,
                    ifc_color_mode="none",
                    use_prompt_color_injection=False,
                    use_ifc_color_composite=False,
                    use_post_color_lock=False,
                    post_color_lock_strength=0.0,
                ),
                IfcColorArtifactMatrixCase(
                    variant="prompt_injection",
                    time_of_day=time_of_day,
                    ifc_color_mode="prompt",
                    use_prompt_color_injection=True,
                    use_ifc_color_composite=False,
                    use_post_color_lock=False,
                    post_color_lock_strength=0.0,
                ),
                IfcColorArtifactMatrixCase(
                    variant="hybrid_color",
                    time_of_day=time_of_day,
                    ifc_color_mode="hybrid",
                    use_prompt_color_injection=True,
                    use_ifc_color_composite=True,
                    use_post_color_lock=False,
                    post_color_lock_strength=0.0,
                ),
                IfcColorArtifactMatrixCase(
                    variant="post_color_lock",
                    time_of_day=time_of_day,
                    ifc_color_mode="none",
                    use_prompt_color_injection=False,
                    use_ifc_color_composite=False,
                    use_post_color_lock=True,
                    post_color_lock_strength=post_color_lock_strength,
                ),
            )
        )
    return tuple(cases)


def measure_element_mask_mean_colors(
    image: Image.Image,
    element_masks: IfcElementMaskRenderResult,
    *,
    categories: tuple[IfcSemanticCategory, ...] = COLOR_LOCK_MEASURE_CATEGORIES,
) -> dict[IfcSemanticCategory, IfcElementMeanColor]:
    """Measure normalized mean RGB in final-photo regions selected by masks."""
    image_rgb = image.convert("RGB")
    image_arr = np.asarray(image_rgb, dtype=np.float32) / 255.0
    measurements: dict[IfcSemanticCategory, IfcElementMeanColor] = {}

    for category in categories:
        mask = element_masks.masks.get(category)
        if mask is None:
            pixel_count = 0
            mean_rgb = None
        else:
            if mask.size != image_rgb.size:
                raise IFCRenderError(
                    "element mask size does not match image size for "
                    f"{category}: mask={mask.size}, image={image_rgb.size}"
                )
            mask_arr = np.asarray(mask.convert("L"), dtype=np.uint8) > 0
            pixel_count = int(mask_arr.sum())
            mean_rgb = (
                None
                if pixel_count == 0
                else tuple(
                    float(channel)
                    for channel in image_arr[mask_arr].mean(axis=0)
                )
            )
        measurements[category] = IfcElementMeanColor(
            category=category,
            pixel_count=pixel_count,
            mean_rgb=mean_rgb,
        )

    return measurements


def measure_ifc_color_target_deltas(
    measurements: dict[IfcSemanticCategory, IfcElementMeanColor],
    color_summary: IfcColorSummary,
    *,
    categories: tuple[IfcSemanticCategory, ...] = COLOR_LOCK_MEASURE_CATEGORIES,
) -> dict[IfcSemanticCategory, IfcElementColorDelta]:
    """Compare measured final-photo colors with representative IFC target RGB."""
    deltas: dict[IfcSemanticCategory, IfcElementColorDelta] = {}

    for category in categories:
        measurement = measurements.get(category)
        category_summary = color_summary.categories.get(category)
        target_color = (
            select_ifc_category_color_candidate(
                category,
                category_summary.candidates,
            )
            if category_summary is not None
            else None
        )
        if (
            target_color is None
            and category_summary is not None
            and category_summary.color is not None
        ):
            target_color = category_summary.color
        mean_rgb = measurement.mean_rgb if measurement is not None else None
        target_rgb = target_color.rgb if target_color is not None else None
        delta = (
            None
            if mean_rgb is None or target_rgb is None
            else _rgb_delta(mean_rgb, target_rgb)
        )
        deltas[category] = IfcElementColorDelta(
            category=category,
            pixel_count=measurement.pixel_count if measurement is not None else 0,
            mean_rgb=mean_rgb,
            target_rgb=target_rgb,
            delta=delta,
        )

    return deltas


def select_ifc_color_correction_candidates(
    deltas: dict[IfcSemanticCategory, IfcElementColorDelta],
    *,
    delta_threshold: float = DEFAULT_COLOR_CORRECTION_DELTA_THRESHOLD,
    categories: tuple[IfcSemanticCategory, ...] = COLOR_LOCK_MEASURE_CATEGORIES,
) -> tuple[IfcElementColorCorrectionCandidate, ...]:
    """Select categories whose final-photo colors differ enough from IFC targets."""
    candidates: list[IfcElementColorCorrectionCandidate] = []
    for category in categories:
        color_delta = deltas.get(category)
        if color_delta is None or color_delta.delta is None:
            continue
        if color_delta.delta <= delta_threshold:
            continue
        candidates.append(
            IfcElementColorCorrectionCandidate(
                category=category,
                pixel_count=color_delta.pixel_count,
                mean_rgb=color_delta.mean_rgb,
                target_rgb=color_delta.target_rgb,
                delta=color_delta.delta,
            )
        )
    return tuple(
        sorted(
            candidates,
            key=lambda candidate: candidate.delta,
            reverse=True,
        )
    )


def build_ifc_color_lock_artifact(
    image: Image.Image,
    element_masks: IfcElementMaskRenderResult,
    candidates: tuple[IfcElementColorCorrectionCandidate, ...],
    *,
    strength: float,
) -> Image.Image:
    """Build an artifact-only color-lock preview without changing production output."""
    if not 0.0 <= strength <= 1.0:
        raise ValueError("strength must be between 0.0 and 1.0")
    if strength == 0.0 or not candidates:
        return image.convert("RGB")

    image_rgb = image.convert("RGB")
    output = np.asarray(image_rgb, dtype=np.float32)
    for candidate in candidates:
        if candidate.target_rgb is None:
            continue
        mask = element_masks.masks.get(candidate.category)
        if mask is None:
            continue
        if mask.size != image_rgb.size:
            raise IFCRenderError(
                "element mask size does not match image size for "
                f"{candidate.category}: mask={mask.size}, image={image_rgb.size}"
            )
        mask_arr = np.asarray(mask.convert("L"), dtype=np.uint8) > 0
        if not mask_arr.any():
            continue
        target = np.asarray(candidate.target_rgb, dtype=np.float32) * 255.0
        output[mask_arr] = output[mask_arr] * (1.0 - strength) + target * strength

    return Image.fromarray(np.clip(np.round(output), 0, 255).astype(np.uint8), mode="RGB")


def evaluate_ifc_quantitative_color(
    deltas: dict[IfcSemanticCategory, IfcElementColorDelta],
    *,
    total_pixel_count: int,
    delta_threshold: float = DEFAULT_COLOR_CORRECTION_DELTA_THRESHOLD,
    shape_collapse_notes: str = "",
    background_regression_notes: str = "",
    categories: tuple[IfcSemanticCategory, ...] = COLOR_LOCK_MEASURE_CATEGORIES,
) -> IfcColorEvaluationReport:
    """Evaluate IFC color preservation with numeric and color-family criteria."""
    if total_pixel_count <= 0:
        raise ValueError("total_pixel_count must be greater than zero")

    evaluations: dict[IfcSemanticCategory, IfcCategoryColorEvaluation] = {}
    for category in categories:
        color_delta = deltas.get(category)
        pixel_count = color_delta.pixel_count if color_delta is not None else 0
        measured_rgb = color_delta.mean_rgb if color_delta is not None else None
        target_rgb = color_delta.target_rgb if color_delta is not None else None
        measured_family = (
            nearest_prompt_color_name(measured_rgb)
            if measured_rgb is not None
            else None
        )
        target_family = (
            nearest_prompt_color_name(target_rgb)
            if target_rgb is not None
            else None
        )
        expected_families = EXPECTED_IFC_COLOR_FAMILIES[category]
        delta = color_delta.delta if color_delta is not None else None
        evaluations[category] = IfcCategoryColorEvaluation(
            category=category,
            delta_to_target=delta,
            pixel_count=pixel_count,
            pixel_coverage=pixel_count / total_pixel_count,
            measured_color_family=measured_family,
            target_color_family=target_family,
            expected_color_families=expected_families,
            family_pass=(
                measured_family is not None
                and measured_family in expected_families
            ),
            delta_pass=delta is not None and delta <= delta_threshold,
        )

    return IfcColorEvaluationReport(
        categories=evaluations,
        shape_collapse_notes=shape_collapse_notes,
        background_regression_notes=background_regression_notes,
    )


def compare_ifc_color_family_consistency(
    first: IfcColorEvaluationReport,
    second: IfcColorEvaluationReport,
    *,
    categories: tuple[IfcSemanticCategory, ...] = COLOR_LOCK_MEASURE_CATEGORIES,
) -> dict[IfcSemanticCategory, bool]:
    """Compare whether two artifacts keep the same measured category color families."""
    consistency: dict[IfcSemanticCategory, bool] = {}
    for category in categories:
        first_family = first.categories.get(category)
        second_family = second.categories.get(category)
        consistency[category] = (
            first_family is not None
            and second_family is not None
            and first_family.measured_color_family is not None
            and first_family.measured_color_family == second_family.measured_color_family
        )
    return consistency


def build_ifc_color_composite_from_element_masks(
    element_masks: IfcElementMaskRenderResult,
    color_summary: IfcColorSummary,
    *,
    missing_color_fallback: str = "debug",
) -> Image.Image:
    """Paint element mask regions with representative IFC category colors."""
    width, height = element_masks.composite.size
    composite_arr = np.zeros((height, width, 3), dtype=np.uint8)
    for category in SUPPORTED_SEMANTIC_CATEGORIES:
        category_summary = color_summary.categories.get(category)
        category_color = (
            select_ifc_category_color_candidate(
                category,
                category_summary.candidates,
            )
            if category_summary is not None
            else None
        )
        if (
            category_color is None
            and category_summary is not None
            and category_summary.color is not None
        ):
            category_color = category_summary.color
        color = _category_color_or_fallback(
            category,
            category_color.rgb
            if category_color is not None
            else None,
            missing_color_fallback=missing_color_fallback,
        )
        if color is None:
            continue
        mask = element_masks.masks.get(category)
        if mask is None:
            continue
        mask_arr = np.asarray(mask.convert("L"), dtype=np.uint8) > 0
        composite_arr[mask_arr] = color
    return Image.fromarray(composite_arr, mode="RGB")


def _load_category_meshes(ifc_path: Path) -> dict[IfcSemanticCategory, Any]:
    try:
        model = ifcopenshell.open(str(ifc_path))
    except Exception as exc:
        raise IFCRenderError(f"IFC element mask read failed: {exc}") from exc

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.WELD_VERTICES, True)

    iterator = ifcopenshell.geom.iterator(settings, model)
    if not iterator.initialize():
        raise IFCRenderError("IFC element mask geometry iterator failed.")

    grouped_vertices: dict[IfcSemanticCategory, list[np.ndarray]] = {
        category: [] for category in SUPPORTED_SEMANTIC_CATEGORIES
    }
    grouped_faces: dict[IfcSemanticCategory, list[np.ndarray]] = {
        category: [] for category in SUPPORTED_SEMANTIC_CATEGORIES
    }

    while True:
        shape = iterator.get()
        entity = model.by_id(shape.id)
        category = semantic_category_for_entity(entity)
        if category is not None:
            vertices = np.asarray(shape.geometry.verts, dtype=np.float64).reshape(-1, 3)
            faces = np.asarray(shape.geometry.faces, dtype=np.int64).reshape(-1, 3)
            if len(vertices) > 0 and len(faces) > 0:
                grouped_vertices[category].append(vertices)
                grouped_faces[category].append(faces)
        if not iterator.next():
            break

    meshes: dict[IfcSemanticCategory, Any] = {}
    for category in SUPPORTED_SEMANTIC_CATEGORIES:
        mesh = _mesh_from_parts(grouped_vertices[category], grouped_faces[category])
        if mesh is not None:
            meshes[category] = mesh
    return meshes


def _rgb_float_to_uint8(rgb: tuple[float, float, float]) -> tuple[int, int, int]:
    return tuple(
        int(round(min(1.0, max(0.0, channel)) * 255.0))
        for channel in rgb
    )


def _category_color_or_fallback(
    category: IfcSemanticCategory,
    rgb: tuple[float, float, float] | None,
    *,
    missing_color_fallback: str,
) -> tuple[int, int, int] | None:
    if rgb is not None:
        return _rgb_float_to_uint8(rgb)
    if missing_color_fallback == "debug":
        return ELEMENT_MASK_COLORS[category]
    if missing_color_fallback == "neutral":
        return (128, 128, 128)
    if missing_color_fallback == "none":
        return None
    raise ValueError(
        "missing_color_fallback must be one of: debug, neutral, none"
    )


def _rgb_delta(
    source_rgb: tuple[float, float, float],
    target_rgb: tuple[float, float, float],
) -> float:
    source = np.asarray(source_rgb, dtype=np.float64)
    target = np.asarray(target_rgb, dtype=np.float64)
    return float(np.linalg.norm(source - target))


def _mesh_from_parts(
    vertices_parts: list[np.ndarray],
    faces_parts: list[np.ndarray],
) -> Any | None:
    if not vertices_parts or not faces_parts:
        return None
    merged_vertices: list[np.ndarray] = []
    merged_faces: list[np.ndarray] = []
    offset = 0
    for vertices, faces in zip(vertices_parts, faces_parts, strict=True):
        merged_vertices.append(vertices)
        merged_faces.append(faces + offset)
        offset += len(vertices)
    mesh = o3d.geometry.TriangleMesh()
    mesh.vertices = o3d.utility.Vector3dVector(np.vstack(merged_vertices))
    mesh.triangles = o3d.utility.Vector3iVector(np.vstack(merged_faces))
    return mesh


def _merge_meshes(meshes: list[Any]) -> Any | None:
    vertices_parts: list[np.ndarray] = []
    faces_parts: list[np.ndarray] = []
    for mesh in meshes:
        vertices_parts.append(np.asarray(mesh.vertices, dtype=np.float64))
        faces_parts.append(np.asarray(mesh.triangles, dtype=np.int64))
    return _mesh_from_parts(vertices_parts, faces_parts)


def _create_rays(
    *,
    eye: np.ndarray,
    look_at: np.ndarray,
    up: np.ndarray,
    width: int,
    height: int,
) -> Any:
    return o3d.t.geometry.RaycastingScene.create_rays_pinhole(
        60.0,
        o3d.core.Tensor(look_at, dtype=o3d.core.Dtype.Float32),
        o3d.core.Tensor(eye, dtype=o3d.core.Dtype.Float32),
        o3d.core.Tensor(up, dtype=o3d.core.Dtype.Float32),
        width,
        height,
    )


def _cast_depth(
    mesh: Any,
    rays: Any,
    *,
    width: int,
    height: int,
) -> np.ndarray:
    scene = o3d.t.geometry.RaycastingScene()
    mesh_t = o3d.t.geometry.TriangleMesh.from_legacy(mesh)
    scene.add_triangles(mesh_t)
    ans = scene.cast_rays(rays)
    depth = ans["t_hit"].numpy().reshape((height, width)).astype(np.float32, copy=False)
    depth[~np.isfinite(depth)] = 0.0
    # Match the raycast depth image row convention used by IFCRenderer.
    depth = np.flipud(depth).copy()
    return depth


def _visible_category_mask(
    full_depth: np.ndarray,
    category_depth: np.ndarray,
) -> np.ndarray:
    full_hit = full_depth > 0
    category_hit = category_depth > 0
    epsilon = np.maximum(full_depth * 1e-3, 1e-3)
    return full_hit & category_hit & (np.abs(category_depth - full_depth) <= epsilon)
