"""IFC element-type debug mask rendering."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import open3d as o3d
from PIL import Image

from .exceptions import IFCRenderError
from .semantics import (
    IfcColorCandidate,
    IfcColorSummary,
    IfcSemanticCategory,
    SUPPORTED_SEMANTIC_CATEGORIES,
    ifc_category_color_prompt_cues,
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


IfcElementMaskCoverageWarning = Literal[
    "missing_mesh",
    "coverage_below_threshold",
]


# Categories that mask quality drops matter most for downstream color/metric work.
# WINDOW/DOOR are typically thin and coplanar with walls so they are most exposed
# to depth-epsilon dropouts in `_visible_category_mask`.
KEY_COVERAGE_CATEGORIES: tuple[IfcSemanticCategory, ...] = ("WINDOW", "DOOR")
DEFAULT_VISIBLE_TO_HIT_RATIO_THRESHOLD = 0.5
DEFAULT_MIN_VISIBLE_PIXEL_COUNT = 50


@dataclass(frozen=True)
class IfcElementMaskCoverage:
    """Per-category visibility summary for a rendered element mask set.

    `visible_pixel_count` counts pixels passing the occlusion-aware visibility
    filter. `category_hit_count` is the raw raycast hit count before the filter;
    a low `visible_to_hit_ratio` suggests epsilon dropouts at coplanar
    boundaries (thin window/door panels inside walls etc.).
    """

    category: IfcSemanticCategory
    visible_pixel_count: int
    category_hit_count: int
    visible_to_hit_ratio: float
    warning: IfcElementMaskCoverageWarning | None

    def to_dict(self) -> dict[str, object]:
        return {
            "category": self.category,
            "visiblePixelCount": self.visible_pixel_count,
            "categoryHitCount": self.category_hit_count,
            "visibleToHitRatio": self.visible_to_hit_ratio,
            "warning": self.warning,
        }


@dataclass(frozen=True)
class IfcElementMaskRenderResult:
    masks: dict[IfcSemanticCategory, Image.Image]
    composite: Image.Image
    coverage: dict[IfcSemanticCategory, IfcElementMaskCoverage] = field(
        default_factory=dict
    )


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
class IfcMaskBoundingBox:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left + 1

    @property
    def height(self) -> int:
        return self.bottom - self.top + 1

    @property
    def area(self) -> int:
        return self.width * self.height

    def to_dict(self) -> dict[str, int]:
        return {
            "left": self.left,
            "top": self.top,
            "right": self.right,
            "bottom": self.bottom,
            "width": self.width,
            "height": self.height,
            "area": self.area,
        }


@dataclass(frozen=True)
class IfcCategoryGeometryFidelity:
    category: IfcSemanticCategory
    pixel_count: int
    pixel_coverage: float
    bbox: IfcMaskBoundingBox | None
    bbox_area_coverage: float
    foreground_overlap_ratio: float
    region_visibility_score: float

    def to_dict(self) -> dict[str, object]:
        return {
            "category": self.category,
            "pixelCount": self.pixel_count,
            "pixelCoverage": self.pixel_coverage,
            "bbox": None if self.bbox is None else self.bbox.to_dict(),
            "bboxAreaCoverage": self.bbox_area_coverage,
            "foregroundOverlapRatio": self.foreground_overlap_ratio,
            "regionVisibilityScore": self.region_visibility_score,
        }


@dataclass(frozen=True)
class IfcGeometryFidelityReport:
    image_size: tuple[int, int]
    building_pixel_count: int
    building_pixel_coverage: float
    building_bbox: IfcMaskBoundingBox | None
    estimated_photo_foreground_pixel_count: int
    estimated_photo_foreground_fill_ratio: float
    estimated_photo_foreground_bbox: IfcMaskBoundingBox | None
    building_bbox_overlap: float | None
    silhouette_iou: float
    edge_alignment_score: float
    categories: dict[IfcSemanticCategory, IfcCategoryGeometryFidelity]

    def to_dict(self) -> dict[str, object]:
        return {
            "imageSize": [self.image_size[0], self.image_size[1]],
            "buildingPixelCount": self.building_pixel_count,
            "buildingPixelCoverage": self.building_pixel_coverage,
            "buildingBbox": (
                None if self.building_bbox is None else self.building_bbox.to_dict()
            ),
            "estimatedPhotoForegroundPixelCount": (
                self.estimated_photo_foreground_pixel_count
            ),
            "estimatedPhotoForegroundFillRatio": (
                self.estimated_photo_foreground_fill_ratio
            ),
            "estimatedPhotoForegroundBbox": (
                None
                if self.estimated_photo_foreground_bbox is None
                else self.estimated_photo_foreground_bbox.to_dict()
            ),
            "buildingBboxOverlap": self.building_bbox_overlap,
            "silhouetteIou": self.silhouette_iou,
            "edgeAlignmentScore": self.edge_alignment_score,
            "categories": {
                category: item.to_dict()
                for category, item in self.categories.items()
            },
        }


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
    visible_to_hit_ratio_threshold: float = DEFAULT_VISIBLE_TO_HIT_RATIO_THRESHOLD,
    min_visible_pixel_count: int = DEFAULT_MIN_VISIBLE_PIXEL_COUNT,
    key_coverage_categories: tuple[IfcSemanticCategory, ...] = KEY_COVERAGE_CATEGORIES,
) -> IfcElementMaskRenderResult:
    """Render visible FLOOR/ROOF/WALL/WINDOW/DOOR masks from IFC geometry.

    Also records per-category coverage info so downstream metric / color-lock
    callers can detect categories where the depth-epsilon visibility filter
    silently dropped most pixels (typically thin window/door coplanar with
    walls).
    """
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
    coverage: dict[IfcSemanticCategory, IfcElementMaskCoverage] = {}
    composite_arr = np.zeros((height, width, 3), dtype=np.uint8)

    for category in SUPPORTED_SEMANTIC_CATEGORIES:
        mesh = category_meshes.get(category)
        if mesh is None:
            mask_arr = np.zeros((height, width), dtype=np.uint8)
            coverage[category] = IfcElementMaskCoverage(
                category=category,
                visible_pixel_count=0,
                category_hit_count=0,
                visible_to_hit_ratio=0.0,
                warning="missing_mesh",
            )
        else:
            category_depth = _cast_depth(mesh, rays, width=width, height=height)
            visible = _visible_category_mask(full_depth, category_depth)
            mask_arr = visible.astype(np.uint8) * 255
            composite_arr[visible] = ELEMENT_MASK_COLORS[category]
            visible_count = int(visible.sum())
            hit_count = int((category_depth > 0).sum())
            ratio = 1.0 if hit_count == 0 else visible_count / hit_count
            warning: IfcElementMaskCoverageWarning | None = None
            if (
                category in key_coverage_categories
                and hit_count > 0
                and (
                    ratio < visible_to_hit_ratio_threshold
                    or visible_count < min_visible_pixel_count
                )
            ):
                warning = "coverage_below_threshold"
            coverage[category] = IfcElementMaskCoverage(
                category=category,
                visible_pixel_count=visible_count,
                category_hit_count=hit_count,
                visible_to_hit_ratio=ratio,
                warning=warning,
            )
        masks[category] = Image.fromarray(mask_arr, mode="L")

    return IfcElementMaskRenderResult(
        masks=masks,
        composite=Image.fromarray(composite_arr, mode="RGB"),
        coverage=coverage,
    )


def summarize_coverage_warnings(
    result: IfcElementMaskRenderResult,
) -> dict[IfcSemanticCategory, IfcElementMaskCoverageWarning]:
    """Return only categories with a coverage warning."""
    return {
        category: cov.warning
        for category, cov in result.coverage.items()
        if cov.warning is not None
    }


def has_critical_coverage_warning(
    result: IfcElementMaskRenderResult,
    *,
    categories: tuple[IfcSemanticCategory, ...] = KEY_COVERAGE_CATEGORIES,
) -> bool:
    """True when any of the key categories carries a coverage warning.

    Callers (color lock / metric) can use this to refuse silent acceptance of
    a mask set that has likely epsilon dropouts on critical category surfaces.
    """
    for category in categories:
        cov = result.coverage.get(category)
        if cov is None:
            continue
        if cov.warning is not None:
            return True
    return False


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


def measure_ifc_geometry_fidelity(
    image: Image.Image,
    element_masks: IfcElementMaskRenderResult,
    *,
    categories: tuple[IfcSemanticCategory, ...] = COLOR_LOCK_MEASURE_CATEGORIES,
    foreground_threshold: float = 0.08,
) -> IfcGeometryFidelityReport:
    """Measure approximate shape fidelity between IFC masks and the final photo."""
    image_rgb = image.convert("RGB")
    width, height = image_rgb.size
    total_pixels = width * height
    if total_pixels <= 0:
        raise IFCRenderError("image must contain at least one pixel")

    category_masks = {
        category: _mask_to_bool_array(
            element_masks.masks.get(category),
            expected_size=image_rgb.size,
            category=category,
        )
        for category in SUPPORTED_SEMANTIC_CATEGORIES
    }
    building_mask = np.zeros((height, width), dtype=bool)
    for mask_arr in category_masks.values():
        building_mask |= mask_arr

    foreground_mask = _estimate_photo_foreground_mask(
        image_rgb,
        threshold=foreground_threshold,
    )
    building_bbox = _mask_bbox(building_mask)
    foreground_bbox = _mask_bbox(foreground_mask)
    building_pixels = int(building_mask.sum())
    foreground_pixels = int(foreground_mask.sum())
    silhouette_iou = _mask_iou(building_mask, foreground_mask)
    category_reports: dict[IfcSemanticCategory, IfcCategoryGeometryFidelity] = {}
    for category in categories:
        mask_arr = category_masks[category]
        pixel_count = int(mask_arr.sum())
        bbox = _mask_bbox(mask_arr)
        foreground_overlap_ratio = (
            0.0
            if pixel_count == 0
            else float(np.logical_and(mask_arr, foreground_mask).sum()) / pixel_count
        )
        category_reports[category] = IfcCategoryGeometryFidelity(
            category=category,
            pixel_count=pixel_count,
            pixel_coverage=pixel_count / total_pixels,
            bbox=bbox,
            bbox_area_coverage=0.0 if bbox is None else bbox.area / total_pixels,
            foreground_overlap_ratio=foreground_overlap_ratio,
            region_visibility_score=_masked_luma_std(image_rgb, mask_arr),
        )

    return IfcGeometryFidelityReport(
        image_size=image_rgb.size,
        building_pixel_count=building_pixels,
        building_pixel_coverage=building_pixels / total_pixels,
        building_bbox=building_bbox,
        estimated_photo_foreground_pixel_count=foreground_pixels,
        estimated_photo_foreground_fill_ratio=foreground_pixels / total_pixels,
        estimated_photo_foreground_bbox=foreground_bbox,
        building_bbox_overlap=_bbox_iou(building_bbox, foreground_bbox),
        silhouette_iou=silhouette_iou,
        edge_alignment_score=_edge_alignment_score(building_mask, foreground_mask),
        categories=category_reports,
    )


# Defaults derived from the H-1.b hot DAY/NIGHT runs on shinchan.ifc where
# accepted outputs sit comfortably above each bound; values dropping under
# these limits in earlier seed sweeps coincided with visible drift
# (background buildings, roof protrusions, wall reshape).
DEFAULT_SILHOUETTE_IOU_MIN = 0.55
DEFAULT_EDGE_ALIGNMENT_MIN = 0.25
DEFAULT_BBOX_OVERLAP_MIN = 0.60

IfcGeometryFidelityFailReason = Literal[
    "silhouette_iou_below_threshold",
    "edge_alignment_below_threshold",
    "bbox_overlap_below_threshold",
    "bbox_overlap_unavailable",
]


@dataclass(frozen=True)
class IfcGeometryFidelityThresholds:
    silhouette_iou_min: float = DEFAULT_SILHOUETTE_IOU_MIN
    edge_alignment_min: float = DEFAULT_EDGE_ALIGNMENT_MIN
    bbox_overlap_min: float = DEFAULT_BBOX_OVERLAP_MIN

    def to_dict(self) -> dict[str, float]:
        return {
            "silhouetteIouMin": self.silhouette_iou_min,
            "edgeAlignmentMin": self.edge_alignment_min,
            "bboxOverlapMin": self.bbox_overlap_min,
        }


@dataclass(frozen=True)
class IfcGeometryFidelityGateDecision:
    accepted: bool
    fail_reasons: tuple[IfcGeometryFidelityFailReason, ...]
    thresholds: IfcGeometryFidelityThresholds
    silhouette_iou: float
    edge_alignment_score: float
    building_bbox_overlap: float | None

    def to_dict(self) -> dict[str, object]:
        return {
            "accepted": self.accepted,
            "failReasons": list(self.fail_reasons),
            "thresholds": self.thresholds.to_dict(),
            "silhouetteIou": self.silhouette_iou,
            "edgeAlignmentScore": self.edge_alignment_score,
            "buildingBboxOverlap": self.building_bbox_overlap,
        }


def evaluate_ifc_geometry_fidelity_gate(
    report: IfcGeometryFidelityReport,
    *,
    thresholds: IfcGeometryFidelityThresholds | None = None,
) -> IfcGeometryFidelityGateDecision:
    """Decide whether a diffusion output passes the soft-lock fidelity gate.

    Used by the production pipeline immediately after H-1 diffusion to reject
    drift (silhouette / edge / bbox overlap below threshold) before the result
    is persisted or amplified by upscale.
    """
    th = thresholds or IfcGeometryFidelityThresholds()
    reasons: list[IfcGeometryFidelityFailReason] = []
    if report.silhouette_iou < th.silhouette_iou_min:
        reasons.append("silhouette_iou_below_threshold")
    if report.edge_alignment_score < th.edge_alignment_min:
        reasons.append("edge_alignment_below_threshold")
    overlap = report.building_bbox_overlap
    if overlap is None:
        reasons.append("bbox_overlap_unavailable")
    elif overlap < th.bbox_overlap_min:
        reasons.append("bbox_overlap_below_threshold")
    return IfcGeometryFidelityGateDecision(
        accepted=not reasons,
        fail_reasons=tuple(reasons),
        thresholds=th,
        silhouette_iou=report.silhouette_iou,
        edge_alignment_score=report.edge_alignment_score,
        building_bbox_overlap=overlap,
    )


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
    """Build an artifact-only color-lock preview without changing production output.

    이 helper는 debug/probe 비교 전용이고, production `photo_*.png` 저장 경로에는
    호출되지 않는다 (`run_ifc2img_photo_pipeline()`에서 사용되지 않음). 색 보존을
    최종 photo에 실제 적용하는 wiring은 G-4 soft_lock path를 worker로 통합하는
    별도 MR에서 결정한다.
    """
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
            _target_color_family_for_category(category, target_rgb)
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


def _target_color_family_for_category(
    category: IfcSemanticCategory,
    target_rgb: tuple[float, float, float],
) -> str:
    cues = ifc_category_color_prompt_cues(
        category,
        [IfcColorCandidate(source="fallback", rgb=target_rgb)],
    )
    if cues:
        return cues[0]
    return nearest_prompt_color_name(target_rgb)


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


def _mask_to_bool_array(
    mask: Image.Image | None,
    *,
    expected_size: tuple[int, int],
    category: IfcSemanticCategory,
) -> np.ndarray:
    width, height = expected_size
    if mask is None:
        return np.zeros((height, width), dtype=bool)
    if mask.size != expected_size:
        raise IFCRenderError(
            "element mask size does not match image size for "
            f"{category}: mask={mask.size}, image={expected_size}"
        )
    return np.asarray(mask.convert("L"), dtype=np.uint8) > 0


def _estimate_photo_foreground_mask(
    image: Image.Image,
    *,
    threshold: float,
) -> np.ndarray:
    image_arr = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    height, width, _ = image_arr.shape
    corners = np.asarray(
        [
            image_arr[0, 0],
            image_arr[0, width - 1],
            image_arr[height - 1, 0],
            image_arr[height - 1, width - 1],
        ],
        dtype=np.float32,
    )
    background = np.median(corners, axis=0)
    distance = np.linalg.norm(image_arr - background, axis=2)
    return distance > threshold


def _mask_bbox(mask: np.ndarray) -> IfcMaskBoundingBox | None:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0 or len(ys) == 0:
        return None
    return IfcMaskBoundingBox(
        left=int(xs.min()),
        top=int(ys.min()),
        right=int(xs.max()),
        bottom=int(ys.max()),
    )


def _bbox_iou(
    first: IfcMaskBoundingBox | None,
    second: IfcMaskBoundingBox | None,
) -> float | None:
    if first is None or second is None:
        return None
    left = max(first.left, second.left)
    top = max(first.top, second.top)
    right = min(first.right, second.right)
    bottom = min(first.bottom, second.bottom)
    if right < left or bottom < top:
        return 0.0
    intersection = (right - left + 1) * (bottom - top + 1)
    union = first.area + second.area - intersection
    return 0.0 if union <= 0 else intersection / union


def _mask_iou(first: np.ndarray, second: np.ndarray) -> float:
    union = int(np.logical_or(first, second).sum())
    if union == 0:
        return 0.0
    intersection = int(np.logical_and(first, second).sum())
    return intersection / union


def _masked_luma_std(image: Image.Image, mask: np.ndarray) -> float:
    if not mask.any():
        return 0.0
    image_arr = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    luma = (
        image_arr[..., 0] * 0.2126
        + image_arr[..., 1] * 0.7152
        + image_arr[..., 2] * 0.0722
    )
    return float(luma[mask].std())


def _edge_alignment_score(reference: np.ndarray, candidate: np.ndarray) -> float:
    reference_edge = _mask_edge(reference)
    candidate_edge = _mask_edge(candidate)
    return _mask_iou(reference_edge, candidate_edge)


def _mask_edge(mask: np.ndarray) -> np.ndarray:
    if not mask.any():
        return np.zeros_like(mask, dtype=bool)
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    center = padded[1:-1, 1:-1]
    eroded = (
        center
        & padded[:-2, 1:-1]
        & padded[2:, 1:-1]
        & padded[1:-1, :-2]
        & padded[1:-1, 2:]
    )
    return center & ~eroded


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
    # Epsilon은 두 raycast의 부동소수점 차이를 허용하기 위함이지만, 벽 안에 박힌
    # 얇은 window/door처럼 coplanar에 가까운 geometry에서는 일부 픽셀이 boundary
    # 근처에서 드롭될 수 있다. `IfcElementMaskRenderResult.coverage`가 카테고리별
    # visible/hit ratio + warning을 노출하므로, 후속 metric/color-lock 호출자는
    # `has_critical_coverage_warning()`으로 dropout 위험을 확인할 수 있다.
    full_hit = full_depth > 0
    category_hit = category_depth > 0
    epsilon = np.maximum(full_depth * 1e-3, 1e-3)
    return full_hit & category_hit & (np.abs(category_depth - full_depth) <= epsilon)
