"""IFC semantic element extraction helpers for debug and view diagnosis."""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import ifcopenshell
import ifcopenshell.geom
import numpy as np

from .exceptions import IFCRenderError

IfcSemanticCategory = Literal["FLOOR", "ROOF", "WALL", "WINDOW", "DOOR"]
IfcColorSource = Literal[
    "surface_style",
    "material",
    "category_aggregate",
    "category_default",
    "fallback",
]
ScreenRegion = Literal["top", "middle", "bottom", "unknown"]
FootprintSide = Literal["min_x", "max_x", "min_y", "max_y", "unknown"]
SUPPORTED_SEMANTIC_CATEGORIES: tuple[IfcSemanticCategory, ...] = (
    "FLOOR",
    "ROOF",
    "WALL",
    "WINDOW",
    "DOOR",
)
_IFC_COLOR_SOURCE_PRIORITY: dict[IfcColorSource, int] = {
    "surface_style": 0,
    "category_aggregate": 1,
    "material": 2,
    "category_default": 3,
    "fallback": 4,
}
_PROMPT_COLOR_PALETTE: dict[str, tuple[float, float, float]] = {
    "black": (0.0, 0.0, 0.0),
    "white": (1.0, 1.0, 1.0),
    "gray": (0.5, 0.5, 0.5),
    "green": (0.0, 0.5, 0.0),
    "blue": (0.0, 0.5, 0.75),
    "brown": (0.46, 0.27, 0.2),
    "tan": (0.82, 0.62, 0.37),
    "beige": (0.75, 0.72, 0.7),
    "red": (0.65, 0.16, 0.16),
}


@dataclass(frozen=True)
class IfcColorCandidate:
    source: IfcColorSource
    style_name: str | None = None
    material_name: str | None = None
    rgb: tuple[float, float, float] | None = None
    transparency: float | None = None

    def __post_init__(self) -> None:
        self._normalize_rgb()
        self._normalize_transparency()

    def _normalize_rgb(self) -> None:
        if self.rgb is None:
            return
        if len(self.rgb) != 3:
            msg = "IFC color RGB must contain exactly three channels."
            raise ValueError(msg)
        rgb = tuple(float(channel) for channel in self.rgb)
        if any(
            not math.isfinite(channel) or channel < 0.0 or channel > 1.0
            for channel in rgb
        ):
            msg = "IFC color RGB channels must be finite floats in the 0.0 to 1.0 range."
            raise ValueError(msg)
        object.__setattr__(self, "rgb", rgb)

    def _normalize_transparency(self) -> None:
        if self.transparency is None:
            return
        transparency = float(self.transparency)
        if not math.isfinite(transparency) or transparency < 0.0 or transparency > 1.0:
            msg = "IFC color transparency must be a finite float in the 0.0 to 1.0 range."
            raise ValueError(msg)
        object.__setattr__(self, "transparency", transparency)

    def to_dict(self) -> dict[str, object]:
        return {
            "source": self.source,
            "styleName": self.style_name,
            "materialName": self.material_name,
            "rgb": list(self.rgb) if self.rgb is not None else None,
            "transparency": self.transparency,
        }


@dataclass(frozen=True)
class IfcSemanticElementColor:
    entity_id: int | None
    category: IfcSemanticCategory
    color: IfcColorCandidate | None

    def to_dict(self) -> dict[str, object]:
        return {
            "entityId": self.entity_id,
            "category": self.category,
            "color": self.color.to_dict() if self.color is not None else None,
        }


@dataclass(frozen=True)
class IfcSemanticCategoryColorSummary:
    category: IfcSemanticCategory
    color: IfcColorCandidate | None
    candidates: tuple[IfcColorCandidate, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "category": self.category,
            "color": self.color.to_dict() if self.color is not None else None,
            "candidates": [candidate.to_dict() for candidate in self.candidates],
        }


@dataclass(frozen=True)
class IfcColorSummary:
    source_ifc_path: Path
    categories: dict[IfcSemanticCategory, IfcSemanticCategoryColorSummary]
    elements: tuple[IfcSemanticElementColor, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "sourceIfcPath": str(self.source_ifc_path),
            "categories": {
                category: summary.to_dict()
                for category, summary in self.categories.items()
            },
            "elements": [element.to_dict() for element in self.elements],
        }


def select_representative_ifc_color(
    candidates: tuple[IfcColorCandidate, ...] | list[IfcColorCandidate],
) -> IfcColorCandidate | None:
    """Select the strongest usable IFC color candidate for an entity/category."""
    usable_candidates = [
        candidate
        for candidate in candidates
        if candidate.rgb is not None
    ]
    if not usable_candidates:
        return None
    return min(
        usable_candidates,
        key=lambda candidate: _IFC_COLOR_SOURCE_PRIORITY[candidate.source],
    )


def build_ifc_semantic_element_color(
    *,
    entity_id: int | None,
    category: IfcSemanticCategory,
    candidates: tuple[IfcColorCandidate, ...] | list[IfcColorCandidate],
) -> IfcSemanticElementColor:
    """Build an entity/category color record using representative color precedence."""
    return IfcSemanticElementColor(
        entity_id=entity_id,
        category=category,
        color=select_representative_ifc_color(candidates),
    )


def nearest_prompt_color_name(
    rgb: tuple[float, float, float],
) -> str:
    """Return a simple prompt-friendly color name for normalized RGB."""
    normalized_rgb = IfcColorCandidate(source="fallback", rgb=rgb).rgb
    if normalized_rgb is None:  # pragma: no cover - constructor guarantees this.
        raise ValueError("RGB is required to resolve a prompt color name.")
    red, green, blue = normalized_rgb
    channel_span = max(normalized_rgb) - min(normalized_rgb)
    if channel_span <= 0.08 and max(normalized_rgb) >= 0.82:
        return "white"
    if channel_span <= 0.08:
        return "gray"
    if (
        red >= 0.68
        and green >= 0.28
        and blue >= 0.40
        and red > green
        and red - green >= 0.16
        and abs(green - blue) <= 0.12
    ):
        return "red"
    return min(
        _PROMPT_COLOR_PALETTE,
        key=lambda name: _rgb_distance_squared(normalized_rgb, _PROMPT_COLOR_PALETTE[name]),
    )


def ifc_color_prompt_cue(candidate: IfcColorCandidate) -> str | None:
    """Return a compact prompt cue for an IFC color candidate."""
    if candidate.rgb is None:
        return None
    color_name = nearest_prompt_color_name(candidate.rgb)
    semantic_names = {
        value.casefold()
        for value in (candidate.style_name, candidate.material_name)
        if value
    }
    is_glass = any("glass" in name or "유리" in name for name in semantic_names)
    if is_glass or (candidate.transparency is not None and candidate.transparency >= 0.5):
        return f"{color_name} glass"
    return color_name


def dedupe_ifc_color_prompt_cues(
    candidates: tuple[IfcColorCandidate, ...] | list[IfcColorCandidate],
    *,
    rgb_tolerance: float = 0.03,
) -> tuple[str, ...]:
    """Return prompt cues with duplicate or near-duplicate colors removed."""
    cues: list[str] = []
    seen_cues: set[str] = set()
    seen_rgb: list[tuple[float, float, float]] = []
    tolerance_squared = rgb_tolerance * rgb_tolerance
    for candidate in candidates:
        cue = ifc_color_prompt_cue(candidate)
        if cue is None:
            continue
        normalized_cue = cue.casefold()
        if normalized_cue in seen_cues:
            continue
        if candidate.rgb is not None and any(
            _rgb_distance_squared(candidate.rgb, rgb) <= tolerance_squared
            for rgb in seen_rgb
        ):
            continue
        cues.append(cue)
        seen_cues.add(normalized_cue)
        if candidate.rgb is not None:
            seen_rgb.append(candidate.rgb)
    return tuple(cues)


def ifc_category_color_prompt_cues(
    category: IfcSemanticCategory,
    candidates: tuple[IfcColorCandidate, ...] | list[IfcColorCandidate],
) -> tuple[str, ...]:
    """Return compact prompt color cues with category-specific ordering."""
    ordered_candidates = sorted(
        candidates,
        key=lambda candidate: _category_color_candidate_priority(category, candidate),
    )
    cues = dedupe_ifc_color_prompt_cues(ordered_candidates)
    if category == "WALL":
        cues = tuple("white" if cue == "beige" else cue for cue in cues)
    if category == "DOOR":
        cues = tuple(
            f"{_normalize_door_color_cue(cue)} wood"
            if _normalize_door_color_cue(cue) in {"brown", "tan"}
            else _normalize_door_color_cue(cue)
            for cue in cues
        )
    return cues


def select_ifc_category_color_candidate(
    category: IfcSemanticCategory,
    candidates: tuple[IfcColorCandidate, ...] | list[IfcColorCandidate],
) -> IfcColorCandidate | None:
    """Select the category-aware representative IFC color candidate."""
    ordered_candidates = sorted(
        candidates,
        key=lambda candidate: _category_color_candidate_priority(category, candidate),
    )
    return next(
        (candidate for candidate in ordered_candidates if candidate.rgb is not None),
        None,
    )


def select_ifc_color_summary_category_cues(
    summary: IfcColorSummary,
) -> dict[IfcSemanticCategory, str]:
    """Select one representative prompt color cue per category from a color summary."""
    selected: dict[IfcSemanticCategory, str] = {}
    for category in SUPPORTED_SEMANTIC_CATEGORIES:
        category_summary = summary.categories.get(category)
        if category_summary is None:
            continue
        cues = ifc_category_color_prompt_cues(
            category,
            category_summary.candidates,
        )
        if cues:
            selected[category] = cues[0]
        elif category_summary.color is not None:
            cue = ifc_color_prompt_cue(category_summary.color)
            if cue is not None:
                selected[category] = cue
    return selected


def build_ifc_color_prompt_suffix(summary: IfcColorSummary) -> str:
    """Build a short opt-in prompt suffix from IFC color summary cues."""
    cues = select_ifc_color_summary_category_cues(summary)
    parts: list[str] = []
    if roof := cues.get("ROOF"):
        parts.append(f"{roof} roof")
    wall_cues = [cue for cue in (cues.get("WALL"),) if cue]
    if wall_cues:
        wall_text = " and ".join(wall_cues)
        parts.append(f"{wall_text} walls")
    if window := cues.get("WINDOW"):
        parts.append(window)
    if door := cues.get("DOOR"):
        parts.append(f"{door} door")
    if not parts:
        return ""
    return f"IFC colors: {_join_prompt_parts(parts)}."


def build_ifc_compact_color_prompt_suffix(summary: IfcColorSummary) -> str:
    """Build the shortest IFC color prompt phrase for artifact comparisons."""
    cues = select_ifc_color_summary_category_cues(summary)
    parts: list[str] = []
    if roof := cues.get("ROOF"):
        parts.append(f"{roof} roof")
    if wall := cues.get("WALL"):
        parts.append(f"{wall} walls")
    if window := cues.get("WINDOW"):
        parts.append(window)
    if door := cues.get("DOOR"):
        parts.append(f"{door} door")
    if not parts:
        return ""
    return f"IFC colors: {', '.join(parts)}."


def append_ifc_color_prompt_suffix(prompt: str, suffix: str) -> str:
    """Append an IFC color suffix after existing style and DAY/NIGHT prompt text."""
    clean_prompt = prompt.strip()
    clean_suffix = suffix.strip()
    if not clean_suffix:
        return clean_prompt
    if not clean_prompt:
        return clean_suffix
    separator = " " if clean_prompt.endswith((".", "!", "?")) else ", "
    return f"{clean_prompt}{separator}{clean_suffix}"


def inject_ifc_color_prompt(prompt: str, color_prompt: str) -> str:
    """Put IFC color cues before the base prompt so they survive prompt truncation."""
    clean_prompt = prompt.strip()
    clean_color_prompt = color_prompt.strip()
    if not clean_color_prompt:
        return clean_prompt
    if not clean_prompt:
        return clean_color_prompt
    separator = " " if clean_color_prompt.endswith((".", "!", "?")) else ". "
    return f"{clean_color_prompt}{separator}{clean_prompt}"


def compact_ifc_color_base_prompt(prompt: str) -> str:
    """Compress preset text when IFC color cues must fit before CLIP truncation."""
    clean_prompt = prompt.strip()
    if not clean_prompt:
        return clean_prompt
    is_night = "night exterior" in clean_prompt or "dark sky" in clean_prompt
    base_parts = [
        "RAW photo",
        "realistic Korean house exterior",
        "open paved ground",
        "ground touches facade",
        "no balcony",
        "no foreground wall",
    ]
    if is_night:
        base_parts.extend(
            [
                "night exterior",
                "dark sky",
                "warm windows",
                "exterior lights",
                "low glare",
            ]
        )
    else:
        base_parts.extend(["daylight", "blue sky", "soft shadows"])
    return ", ".join(base_parts)


IFC_SHAPE_LOCK_PROMPT = "Shape."
IFC_SHAPE_LOCK_NEGATIVE_PROMPT = ""


def inject_ifc_shape_lock_prompt(
    prompt: str,
    shape_prompt: str = IFC_SHAPE_LOCK_PROMPT,
) -> str:
    """Put compact IFC shape cues before style, color, and DAY/NIGHT text."""
    clean_prompt = prompt.strip()
    clean_shape_prompt = shape_prompt.strip()
    if not clean_shape_prompt:
        return clean_prompt
    if not clean_prompt:
        return clean_shape_prompt
    separator = " " if clean_shape_prompt.endswith((".", "!", "?")) else ". "
    return f"{clean_shape_prompt}{separator}{clean_prompt}"


def append_ifc_shape_lock_negative_prompt(
    negative_prompt: str | None,
    shape_negative_prompt: str = IFC_SHAPE_LOCK_NEGATIVE_PROMPT,
) -> str:
    """Append compact structural failure cues to an optional negative prompt."""
    clean_negative = (negative_prompt or "").strip()
    clean_shape_negative = shape_negative_prompt.strip()
    if not clean_shape_negative:
        return clean_negative
    if not clean_negative:
        return clean_shape_negative
    if clean_shape_negative in clean_negative:
        return clean_negative
    separator = ", " if not clean_negative.endswith(",") else " "
    return f"{clean_negative}{separator}{clean_shape_negative}"


def remove_ifc_color_conflicting_prompt_terms(
    prompt: str,
    category_cues: Mapping[str, str] | None = None,
) -> str:
    """Replace preset color/material priors with IFC color-aware terms."""
    clean_prompt = prompt.strip()
    cues = category_cues or {}
    wall_facade = f"{wall} house facade" if (wall := cues.get("WALL")) else "house facade"
    roof = f"{roof_color} roof" if (roof_color := cues.get("ROOF")) else "simple roof"
    replacements = {
        "white concrete facade": wall_facade,
        "simple tile roof": roof,
    }
    for old, new in replacements.items():
        clean_prompt = clean_prompt.replace(old, new)
    return clean_prompt


def extract_ifc_color_summary(ifc_path: Path | str) -> IfcColorSummary:
    """Extract IFC color candidates grouped by semantic category and entity."""
    source_ifc_path = Path(ifc_path)
    try:
        model = ifcopenshell.open(str(source_ifc_path))
    except Exception as exc:  # pragma: no cover - ifcopenshell error type varies.
        raise IFCRenderError(
            f"Failed to open IFC color source: {source_ifc_path}"
        ) from exc

    named_style_colors = _extract_named_style_colors(model)
    item_to_products = _build_representation_item_product_index(model)
    product_candidates = _extract_product_style_color_candidates(
        model,
        item_to_products,
    )
    product_material_names = _extract_product_material_names(model)

    elements: list[IfcSemanticElementColor] = []
    category_candidates: dict[IfcSemanticCategory, list[IfcColorCandidate]] = {
        category: [] for category in SUPPORTED_SEMANTIC_CATEGORIES
    }
    for product in model.by_type("IfcProduct"):
        category = _semantic_category_for_entity(product)
        if category is None:
            continue
        candidates = [
            *product_candidates.get(_entity_id(product), ()),
            *_material_color_candidates(
                product_material_names.get(_entity_id(product), ()),
                named_style_colors,
            ),
        ]
        category_candidates[category].extend(candidates)
        elements.append(
            build_ifc_semantic_element_color(
                entity_id=_entity_id(product),
                category=category,
                candidates=candidates,
            )
        )

    categories = {
        category: IfcSemanticCategoryColorSummary(
            category=category,
            color=select_representative_ifc_color(candidates),
            candidates=tuple(candidates),
        )
        for category, candidates in category_candidates.items()
    }
    return IfcColorSummary(
        source_ifc_path=source_ifc_path,
        categories=categories,
        elements=tuple(elements),
    )


@dataclass(frozen=True)
class IfcSemanticBounds:
    min_xyz: tuple[float, float, float]
    max_xyz: tuple[float, float, float]
    center_xyz: tuple[float, float, float]

    @property
    def z_min(self) -> float:
        return self.min_xyz[2]

    @property
    def z_max(self) -> float:
        return self.max_xyz[2]

    def to_dict(self) -> dict[str, object]:
        return {
            "min": list(self.min_xyz),
            "max": list(self.max_xyz),
            "center": list(self.center_xyz),
            "zMin": self.z_min,
            "zMax": self.z_max,
        }


@dataclass(frozen=True)
class IfcSemanticElement:
    category: IfcSemanticCategory
    entity_id: int
    ifc_type: str
    predefined_type: str | None
    name: str | None
    vertex_count: int
    face_count: int
    bounds: IfcSemanticBounds

    def to_dict(self) -> dict[str, object]:
        return {
            "category": self.category,
            "entityId": self.entity_id,
            "ifcType": self.ifc_type,
            "predefinedType": self.predefined_type,
            "name": self.name,
            "vertexCount": self.vertex_count,
            "faceCount": self.face_count,
            "bounds": self.bounds.to_dict(),
        }


@dataclass(frozen=True)
class IfcSemanticCategorySummary:
    category: IfcSemanticCategory
    count: int
    z_min: float | None
    z_max: float | None
    vertex_count: int
    face_count: int

    def to_dict(self) -> dict[str, object]:
        return {
            "count": self.count,
            "zMin": self.z_min,
            "zMax": self.z_max,
            "vertexCount": self.vertex_count,
            "faceCount": self.face_count,
        }


@dataclass(frozen=True)
class IfcSemanticSummary:
    source_ifc_path: Path
    elements: tuple[IfcSemanticElement, ...]
    categories: dict[IfcSemanticCategory, IfcSemanticCategorySummary]

    def to_dict(self) -> dict[str, object]:
        return {
            "sourceIfcPath": str(self.source_ifc_path),
            "categories": {
                category: summary.to_dict()
                for category, summary in self.categories.items()
            },
            "lowestFloor": _element_to_dict_or_none(self.lowest_floor),
            "highestRoof": _element_to_dict_or_none(self.highest_roof),
            "doorCandidates": [element.to_dict() for element in self.door_candidates],
            "frontDirectionCandidates": [
                candidate.to_dict() for candidate in self.front_direction_candidates
            ],
            "mainDoorCandidate": _front_candidate_to_dict_or_none(
                self.main_door_candidate
            ),
            "elements": [element.to_dict() for element in self.elements],
        }

    @property
    def lowest_floor(self) -> IfcSemanticElement | None:
        floors = [element for element in self.elements if element.category == "FLOOR"]
        if not floors:
            return None
        return min(floors, key=lambda element: element.bounds.z_min)

    @property
    def highest_roof(self) -> IfcSemanticElement | None:
        roofs = [element for element in self.elements if element.category == "ROOF"]
        if not roofs:
            return None
        return max(roofs, key=lambda element: element.bounds.z_max)

    @property
    def door_candidates(self) -> tuple[IfcSemanticElement, ...]:
        return tuple(element for element in self.elements if element.category == "DOOR")

    @property
    def front_direction_candidates(self) -> tuple[IfcFrontDirectionCandidate, ...]:
        return tuple(build_front_direction_candidates(self.elements))

    @property
    def main_door_candidate(self) -> IfcFrontDirectionCandidate | None:
        candidates = self.front_direction_candidates
        if not candidates:
            return None
        return max(candidates, key=lambda candidate: candidate.score)


@dataclass(frozen=True)
class IfcFrontDirectionCandidate:
    door_entity_id: int
    door_name: str | None
    door_center: tuple[float, float, float]
    nearest_footprint_side: FootprintSide
    distance_to_footprint_edge: float | None
    exterior_wall_near: bool
    nearest_wall_entity_id: int | None
    nearest_wall_distance: float | None
    front_vector: tuple[float, float, float]
    score: float

    def to_dict(self) -> dict[str, object]:
        return {
            "doorEntityId": self.door_entity_id,
            "doorName": self.door_name,
            "doorCenter": list(self.door_center),
            "nearestFootprintSide": self.nearest_footprint_side,
            "distanceToFootprintEdge": self.distance_to_footprint_edge,
            "exteriorWallNear": self.exterior_wall_near,
            "nearestWallEntityId": self.nearest_wall_entity_id,
            "nearestWallDistance": self.nearest_wall_distance,
            "frontVector": list(self.front_vector),
            "score": self.score,
        }


@dataclass(frozen=True)
class IfcSemanticScreenMaskStats:
    category: IfcSemanticCategory
    pixel_count: int
    y_min: int | None
    y_max: int | None
    image_height: int

    @property
    def y_center(self) -> float | None:
        if self.y_min is None or self.y_max is None:
            return None
        return (self.y_min + self.y_max) / 2.0

    @property
    def screen_region(self) -> ScreenRegion:
        center = self.y_center
        if self.pixel_count <= 0 or center is None or self.image_height <= 0:
            return "unknown"
        if center < self.image_height / 3:
            return "top"
        if center > self.image_height * 2 / 3:
            return "bottom"
        return "middle"

    def to_dict(self) -> dict[str, object]:
        return {
            "category": self.category,
            "pixelCount": self.pixel_count,
            "yMin": self.y_min,
            "yMax": self.y_max,
            "yCenter": self.y_center,
            "screenRegion": self.screen_region,
        }


def is_reliable_main_door_candidate(
    candidate: IfcFrontDirectionCandidate | None,
) -> bool:
    """Return whether a door candidate is reliable enough for semantic front camera."""
    if candidate is None:
        return False
    if not candidate.exterior_wall_near:
        return False
    if candidate.nearest_footprint_side == "unknown":
        return False
    if candidate.score <= 0.0:
        return False
    front_vector = np.asarray(candidate.front_vector, dtype=np.float64)
    if front_vector.shape != (3,):
        return False
    if not np.all(np.isfinite(front_vector)):
        return False
    xy_length = float(np.linalg.norm(front_vector[:2]))
    return abs(xy_length - 1.0) <= 1e-3 and abs(float(front_vector[2])) <= 1e-6


@dataclass(frozen=True)
class IfcProjectionDiagnostics:
    vertical_inversion_suspected: bool
    floor_screen_region: ScreenRegion
    roof_screen_region: ScreenRegion
    floor_above_roof_on_screen: bool | None
    floor_below_roof_in_world: bool | None

    @property
    def projection_vertical_inversion_suspected(self) -> bool:
        return self.vertical_inversion_suspected

    def to_dict(self) -> dict[str, object]:
        return {
            "projectionVerticalInversionSuspected": (
                self.projection_vertical_inversion_suspected
            ),
            "verticalInversionSuspected": self.vertical_inversion_suspected,
            "floorScreenRegion": self.floor_screen_region,
            "roofScreenRegion": self.roof_screen_region,
            "floorAboveRoofOnScreen": self.floor_above_roof_on_screen,
            "floorBelowRoofInWorld": self.floor_below_roof_in_world,
        }


def extract_ifc_semantic_summary(ifc_path: Path | str) -> IfcSemanticSummary:
    """Extract key architectural IFC elements with world-space geometry bounds."""
    ifc_path = Path(ifc_path)
    try:
        model = ifcopenshell.open(str(ifc_path))
    except Exception as exc:
        raise IFCRenderError(f"IFC semantic read failed: {exc}") from exc

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.WELD_VERTICES, True)

    iterator = ifcopenshell.geom.iterator(settings, model)
    if not iterator.initialize():
        raise IFCRenderError("IFC semantic geometry iterator failed.")

    elements: list[IfcSemanticElement] = []
    while True:
        shape = iterator.get()
        entity = model.by_id(shape.id)
        category = _semantic_category_for_entity(entity)
        if category is not None:
            vertices = np.asarray(shape.geometry.verts, dtype=np.float64).reshape(-1, 3)
            faces = np.asarray(shape.geometry.faces, dtype=np.int64).reshape(-1, 3)
            if len(vertices) > 0 and len(faces) > 0:
                elements.append(
                    IfcSemanticElement(
                        category=category,
                        entity_id=int(entity.id()),
                        ifc_type=str(entity.is_a()),
                        predefined_type=_entity_predefined_type(entity),
                        name=_entity_name(entity),
                        vertex_count=int(len(vertices)),
                        face_count=int(len(faces)),
                        bounds=_bounds_for_vertices(vertices),
                    )
                )
        if not iterator.next():
            break

    return IfcSemanticSummary(
        source_ifc_path=ifc_path,
        elements=tuple(elements),
        categories=_summarize_categories(elements),
    )


def diagnose_projection_vertical_inversion(
    semantic_summary: IfcSemanticSummary,
    screen_masks: dict[IfcSemanticCategory, IfcSemanticScreenMaskStats],
) -> IfcProjectionDiagnostics:
    """Compare IFC world z semantics with screen y positions for inversion clues."""
    floor_summary = semantic_summary.categories["FLOOR"]
    roof_summary = semantic_summary.categories["ROOF"]
    floor_below_roof_in_world: bool | None
    if (
        floor_summary.z_max is None
        or roof_summary.z_min is None
        or floor_summary.count == 0
        or roof_summary.count == 0
    ):
        floor_below_roof_in_world = None
    else:
        floor_below_roof_in_world = floor_summary.z_max < roof_summary.z_min

    floor_mask = screen_masks.get("FLOOR")
    roof_mask = screen_masks.get("ROOF")
    floor_above_roof_on_screen: bool | None
    if (
        floor_mask is None
        or roof_mask is None
        or floor_mask.y_center is None
        or roof_mask.y_center is None
    ):
        floor_above_roof_on_screen = None
    else:
        floor_above_roof_on_screen = floor_mask.y_center < roof_mask.y_center

    vertical_inversion_suspected = bool(
        floor_below_roof_in_world is True
        and floor_above_roof_on_screen is True
    )

    return IfcProjectionDiagnostics(
        vertical_inversion_suspected=vertical_inversion_suspected,
        floor_screen_region=(
            floor_mask.screen_region if floor_mask is not None else "unknown"
        ),
        roof_screen_region=(
            roof_mask.screen_region if roof_mask is not None else "unknown"
        ),
        floor_above_roof_on_screen=floor_above_roof_on_screen,
        floor_below_roof_in_world=floor_below_roof_in_world,
    )


def build_front_direction_candidates(
    elements: tuple[IfcSemanticElement, ...] | list[IfcSemanticElement],
) -> list[IfcFrontDirectionCandidate]:
    """Infer front direction candidates from exterior-like door positions."""
    doors = [element for element in elements if element.category == "DOOR"]
    if not doors:
        return []

    footprint_elements = [
        element
        for element in elements
        if element.category in {"FLOOR", "ROOF", "WALL", "DOOR"}
    ]
    footprint = _footprint_bounds(footprint_elements)
    walls = [element for element in elements if element.category == "WALL"]
    footprint_extent = max(
        footprint[1] - footprint[0],
        footprint[3] - footprint[2],
        1.0,
    )
    edge_threshold = max(0.5, footprint_extent * 0.08)
    wall_threshold = max(0.25, footprint_extent * 0.05)

    candidates: list[IfcFrontDirectionCandidate] = []
    for door in doors:
        side, edge_distance, front_vector = _nearest_footprint_side(
            door.bounds.center_xyz,
            footprint,
        )
        nearest_wall, wall_distance = _nearest_wall(door, walls)
        exterior_wall_near = (
            edge_distance <= edge_threshold
            and wall_distance is not None
            and wall_distance <= wall_threshold
        )
        door_extent = (
            door.bounds.max_xyz[0] - door.bounds.min_xyz[0],
            door.bounds.max_xyz[1] - door.bounds.min_xyz[1],
            door.bounds.max_xyz[2] - door.bounds.min_xyz[2],
        )
        door_size_score = max(door_extent[0], door_extent[1]) * max(door_extent[2], 0.1)
        edge_score = max(0.0, 1.0 - edge_distance / edge_threshold)
        wall_score = (
            max(0.0, 1.0 - wall_distance / wall_threshold)
            if wall_distance is not None
            else 0.0
        )
        score = door_size_score + edge_score + wall_score
        if exterior_wall_near:
            score += 2.0
        candidates.append(
            IfcFrontDirectionCandidate(
                door_entity_id=door.entity_id,
                door_name=door.name,
                door_center=door.bounds.center_xyz,
                nearest_footprint_side=side,
                distance_to_footprint_edge=edge_distance,
                exterior_wall_near=exterior_wall_near,
                nearest_wall_entity_id=(
                    nearest_wall.entity_id if nearest_wall is not None else None
                ),
                nearest_wall_distance=wall_distance,
                front_vector=front_vector,
                score=float(score),
            )
        )
    return sorted(candidates, key=lambda candidate: candidate.score, reverse=True)


def _semantic_category_for_entity(entity: object) -> IfcSemanticCategory | None:
    if _is_a(entity, "IfcSlab"):
        predefined_type = _entity_predefined_type(entity)
        if predefined_type == "FLOOR":
            return "FLOOR"
        if predefined_type == "ROOF":
            return "ROOF"
        return None
    if _is_a(entity, "IfcRoof"):
        return "ROOF"
    if _is_a(entity, "IfcWall") or _is_a(entity, "IfcWallStandardCase"):
        return "WALL"
    if _is_a(entity, "IfcWindow"):
        return "WINDOW"
    if _is_a(entity, "IfcDoor"):
        return "DOOR"
    return None


def _summarize_categories(
    elements: list[IfcSemanticElement],
) -> dict[IfcSemanticCategory, IfcSemanticCategorySummary]:
    summaries: dict[IfcSemanticCategory, IfcSemanticCategorySummary] = {}
    for category in SUPPORTED_SEMANTIC_CATEGORIES:
        category_elements = [
            element for element in elements if element.category == category
        ]
        if category_elements:
            z_min = min(element.bounds.z_min for element in category_elements)
            z_max = max(element.bounds.z_max for element in category_elements)
        else:
            z_min = None
            z_max = None
        summaries[category] = IfcSemanticCategorySummary(
            category=category,
            count=len(category_elements),
            z_min=z_min,
            z_max=z_max,
            vertex_count=sum(element.vertex_count for element in category_elements),
            face_count=sum(element.face_count for element in category_elements),
        )
    return summaries


def _bounds_for_vertices(vertices: np.ndarray) -> IfcSemanticBounds:
    min_xyz_arr = vertices.min(axis=0)
    max_xyz_arr = vertices.max(axis=0)
    center_xyz_arr = (min_xyz_arr + max_xyz_arr) / 2
    return IfcSemanticBounds(
        min_xyz=tuple(float(value) for value in min_xyz_arr),
        max_xyz=tuple(float(value) for value in max_xyz_arr),
        center_xyz=tuple(float(value) for value in center_xyz_arr),
    )


def _entity_predefined_type(entity: object) -> str | None:
    value = getattr(entity, "PredefinedType", None)
    if value is None:
        return None
    return str(value).upper()


def _entity_name(entity: object) -> str | None:
    value = getattr(entity, "Name", None)
    if value is None:
        return None
    return str(value)


def _is_a(entity: object, ifc_type: str) -> bool:
    is_a = getattr(entity, "is_a", None)
    if not callable(is_a):
        return False
    return bool(is_a(ifc_type))


def _entity_id(entity: object) -> int | None:
    entity_id = getattr(entity, "id", None)
    if not callable(entity_id):
        return None
    value = entity_id()
    if value is None:
        return None
    return int(value)


def _extract_named_style_colors(model: object) -> dict[str, IfcColorCandidate]:
    named_style_colors: dict[str, IfcColorCandidate] = {}
    for style in model.by_type("IfcSurfaceStyle"):
        style_name = _entity_name(style)
        if not style_name:
            continue
        color = _color_candidate_from_surface_style(
            style,
            source="material",
            material_name=style_name,
        )
        if color is not None:
            named_style_colors[style_name] = color
    return named_style_colors


def _build_representation_item_product_index(
    model: object,
) -> dict[int, list[object]]:
    item_to_products: dict[int, list[object]] = {}
    for product in model.by_type("IfcProduct"):
        representation = getattr(product, "Representation", None)
        if representation is None:
            continue
        for representation_item in getattr(representation, "Representations", ()) or ():
            stack = list(getattr(representation_item, "Items", ()) or ())
            seen: set[int] = set()
            while stack:
                item = stack.pop()
                item_id = _entity_id(item)
                if item_id is None or item_id in seen:
                    continue
                seen.add(item_id)
                item_to_products.setdefault(item_id, []).append(product)
                stack.extend(_child_representation_items(item))
    return item_to_products


def _child_representation_items(item: object) -> list[object]:
    children: list[object] = []
    for attr in (
        "MappingSource",
        "MappedRepresentation",
        "Items",
        "Outer",
        "CfsFaces",
        "Bounds",
        "Bound",
        "Polygon",
    ):
        value = getattr(item, attr, None)
        if value is None:
            continue
        if isinstance(value, (list, tuple)):
            children.extend(child for child in value if hasattr(child, "is_a"))
        elif hasattr(value, "is_a"):
            children.append(value)
    return children


def _extract_product_style_color_candidates(
    model: object,
    item_to_products: dict[int, list[object]],
) -> dict[int, list[IfcColorCandidate]]:
    product_candidates: dict[int, list[IfcColorCandidate]] = {}
    for styled_item in model.by_type("IfcStyledItem"):
        item = getattr(styled_item, "Item", None)
        item_id = _entity_id(item) if item is not None else None
        if item_id is None:
            continue
        candidates = _color_candidates_from_styled_item(styled_item)
        if not candidates:
            continue
        for product in item_to_products.get(item_id, ()):
            product_id = _entity_id(product)
            if product_id is not None:
                product_candidates.setdefault(product_id, []).extend(candidates)
    return product_candidates


def _color_candidates_from_styled_item(
    styled_item: object,
) -> list[IfcColorCandidate]:
    candidates: list[IfcColorCandidate] = []
    for style in _unwrap_presentation_styles(getattr(styled_item, "Styles", ()) or ()):
        candidate = _color_candidate_from_surface_style(
            style,
            source="surface_style",
        )
        if candidate is not None:
            candidates.append(candidate)
    return candidates


def _unwrap_presentation_styles(styles: object) -> list[object]:
    unwrapped: list[object] = []
    if not isinstance(styles, (list, tuple)):
        return unwrapped
    for style in styles:
        if style is None:
            continue
        if _is_a(style, "IfcPresentationStyleAssignment"):
            unwrapped.extend(getattr(style, "Styles", ()) or ())
        else:
            unwrapped.append(style)
    return unwrapped


def _color_candidate_from_surface_style(
    style: object,
    *,
    source: IfcColorSource,
    material_name: str | None = None,
) -> IfcColorCandidate | None:
    if not _is_a(style, "IfcSurfaceStyle"):
        return None
    for surface_item in getattr(style, "Styles", ()) or ():
        if not (
            _is_a(surface_item, "IfcSurfaceStyleRendering")
            or _is_a(surface_item, "IfcSurfaceStyleShading")
        ):
            continue
        rgb = _rgb_from_colour(getattr(surface_item, "SurfaceColour", None))
        if rgb is None:
            return None
        return IfcColorCandidate(
            source=source,
            style_name=_entity_name(style),
            material_name=material_name,
            rgb=rgb,
            transparency=_transparency_from_surface_item(surface_item),
        )
    return None


def _rgb_from_colour(colour: object | None) -> tuple[float, float, float] | None:
    if colour is None:
        return None
    return (
        float(getattr(colour, "Red")),
        float(getattr(colour, "Green")),
        float(getattr(colour, "Blue")),
    )


def _transparency_from_surface_item(surface_item: object) -> float | None:
    transparency = getattr(surface_item, "Transparency", None)
    if transparency is None:
        return None
    return float(transparency)


def _extract_product_material_names(model: object) -> dict[int, list[str]]:
    product_material_names: dict[int, list[str]] = {}
    for relation in model.by_type("IfcRelAssociatesMaterial"):
        material_names = _material_names(getattr(relation, "RelatingMaterial", None))
        for product in getattr(relation, "RelatedObjects", ()) or ():
            product_id = _entity_id(product)
            if product_id is not None:
                product_material_names.setdefault(product_id, []).extend(material_names)
    return product_material_names


def _material_names(material: object | None) -> list[str]:
    if material is None:
        return []
    names: list[str] = []
    stack = [material]
    seen: set[tuple[str, int | None]] = set()
    while stack:
        item = stack.pop()
        marker = (str(getattr(item, "is_a", lambda: type(item).__name__)()), _entity_id(item))
        if marker in seen:
            continue
        seen.add(marker)
        name = _entity_name(item)
        if name:
            names.append(name)
        for attr in (
            "Materials",
            "MaterialLayers",
            "MaterialConstituents",
            "ForLayerSet",
            "Material",
        ):
            value = getattr(item, attr, None)
            if value is None or isinstance(value, str):
                continue
            if isinstance(value, (list, tuple)):
                stack.extend(child for child in value if hasattr(child, "is_a"))
            elif hasattr(value, "is_a"):
                stack.append(value)
    return names


def _material_color_candidates(
    material_names: list[str] | tuple[str, ...],
    named_style_colors: dict[str, IfcColorCandidate],
) -> list[IfcColorCandidate]:
    candidates: list[IfcColorCandidate] = []
    seen_names: set[str] = set()
    for material_name in material_names:
        if material_name in seen_names:
            continue
        seen_names.add(material_name)
        candidate = named_style_colors.get(material_name)
        if candidate is not None:
            candidates.append(candidate)
    return candidates


def _rgb_distance_squared(
    first: tuple[float, float, float],
    second: tuple[float, float, float],
) -> float:
    return sum(
        (first_channel - second_channel) ** 2
        for first_channel, second_channel in zip(first, second, strict=True)
    )


def _normalize_door_color_cue(cue: str) -> str:
    """Keep door cues in wood-like families instead of roof-like red accents."""
    if cue == "red":
        return "brown"
    return cue


def _category_color_candidate_priority(
    category: IfcSemanticCategory,
    candidate: IfcColorCandidate,
) -> tuple[int, int]:
    semantic_name = " ".join(
        value.casefold()
        for value in (candidate.style_name, candidate.material_name)
        if value
    )
    cue = ifc_color_prompt_cue(candidate)
    if category == "ROOF" and candidate.source == "surface_style" and cue == "red":
        return (0, _IFC_COLOR_SOURCE_PRIORITY[candidate.source])
    if category == "ROOF" and ("roof" in semantic_name or "지붕" in semantic_name):
        return (0, _IFC_COLOR_SOURCE_PRIORITY[candidate.source])
    if category == "WALL" and cue in {"gray", "white"}:
        return (0, _IFC_COLOR_SOURCE_PRIORITY[candidate.source])
    if category == "WINDOW" and cue is not None and "glass" in cue:
        return (0, _IFC_COLOR_SOURCE_PRIORITY[candidate.source])
    if category == "DOOR" and ("door" in semantic_name or "문" in semantic_name):
        return (0, _IFC_COLOR_SOURCE_PRIORITY[candidate.source])
    if category == "WALL" and cue == "beige":
        return (2, _IFC_COLOR_SOURCE_PRIORITY[candidate.source])
    return (1, _IFC_COLOR_SOURCE_PRIORITY[candidate.source])


def _join_prompt_parts(parts: list[str]) -> str:
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return " and ".join(parts)
    return f"{', '.join(parts[:-1])}, and {parts[-1]}"


def _footprint_bounds(
    elements: list[IfcSemanticElement],
) -> tuple[float, float, float, float]:
    if not elements:
        return (0.0, 0.0, 0.0, 0.0)
    min_x = min(element.bounds.min_xyz[0] for element in elements)
    max_x = max(element.bounds.max_xyz[0] for element in elements)
    min_y = min(element.bounds.min_xyz[1] for element in elements)
    max_y = max(element.bounds.max_xyz[1] for element in elements)
    return (min_x, max_x, min_y, max_y)


def _nearest_footprint_side(
    center_xyz: tuple[float, float, float],
    footprint: tuple[float, float, float, float],
) -> tuple[FootprintSide, float, tuple[float, float, float]]:
    x, y, _z = center_xyz
    min_x, max_x, min_y, max_y = footprint
    distances: dict[FootprintSide, float] = {
        "min_x": abs(x - min_x),
        "max_x": abs(max_x - x),
        "min_y": abs(y - min_y),
        "max_y": abs(max_y - y),
    }
    side = min(distances, key=distances.__getitem__)
    vectors: dict[FootprintSide, tuple[float, float, float]] = {
        "min_x": (-1.0, 0.0, 0.0),
        "max_x": (1.0, 0.0, 0.0),
        "min_y": (0.0, -1.0, 0.0),
        "max_y": (0.0, 1.0, 0.0),
        "unknown": (0.0, -1.0, 0.0),
    }
    return side, float(distances[side]), vectors[side]


def _nearest_wall(
    door: IfcSemanticElement,
    walls: list[IfcSemanticElement],
) -> tuple[IfcSemanticElement | None, float | None]:
    if not walls:
        return None, None
    nearest = min(walls, key=lambda wall: _xy_aabb_distance(door, wall))
    return nearest, _xy_aabb_distance(door, nearest)


def _xy_aabb_distance(first: IfcSemanticElement, second: IfcSemanticElement) -> float:
    dx = max(
        first.bounds.min_xyz[0] - second.bounds.max_xyz[0],
        second.bounds.min_xyz[0] - first.bounds.max_xyz[0],
        0.0,
    )
    dy = max(
        first.bounds.min_xyz[1] - second.bounds.max_xyz[1],
        second.bounds.min_xyz[1] - first.bounds.max_xyz[1],
        0.0,
    )
    return float((dx * dx + dy * dy) ** 0.5)


def _element_to_dict_or_none(
    element: IfcSemanticElement | None,
) -> dict[str, object] | None:
    if element is None:
        return None
    return element.to_dict()


def _front_candidate_to_dict_or_none(
    candidate: IfcFrontDirectionCandidate | None,
) -> dict[str, object] | None:
    if candidate is None:
        return None
    return candidate.to_dict()
