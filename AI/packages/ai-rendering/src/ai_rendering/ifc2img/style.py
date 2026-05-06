"""Depth-to-style rendering with SD 1.5 + ControlNet-depth."""

from __future__ import annotations

from dataclasses import dataclass, replace as dc_replace
from pathlib import Path
from typing import TYPE_CHECKING, Literal

import numpy as np
from PIL import Image

from .exceptions import IFCRenderError
from .views import IFCView, build_view_prompt

if TYPE_CHECKING:
    import torch


DEFAULT_MODEL_ID = "runwayml/stable-diffusion-v1-5"
DEFAULT_CONTROLNET_DEPTH_ID = "lllyasviel/sd-controlnet-depth"
DEFAULT_CONTROLNET_SEG_ID = "lllyasviel/sd-controlnet-seg"
FRONT_SIDE_NEGATIVE_TERMS = (
    "stone wall, retaining wall, raised foundation, pedestal, plinth, "
    "basement windows, stairs below facade, extra lower floor"
)
FRONT_SIDE_WEIGHTED_NEGATIVE_TERMS = (
    "(stone wall:1.2), (retaining wall:1.25), (raised platform:1.2)"
)
SEMANTIC_BACKGROUND_RGB = (0, 0, 0)
SEMANTIC_BUILDING_RGB = (255, 255, 255)
SEMANTIC_GROUND_RGB = (128, 128, 128)
ADE20K_BACKGROUND_RGB = (0, 0, 0)
ADE20K_BUILDING_RGB = (180, 120, 120)
ADE20K_SKY_RGB = (6, 230, 230)
ADE20K_GRASS_RGB = (4, 250, 7)
ADE20K_ROAD_RGB = (140, 140, 140)
FrontSideGroundClass = Literal["grass", "neutral"]
FRONT_SIDE_GROUND_CLASS_RGB = {
    "grass": ADE20K_GRASS_RGB,
    "neutral": ADE20K_ROAD_RGB,
}
FRONT_SIDE_MASK_BASE_PERCENTILE = 75
FRONT_SIDE_MASK_BAND_RATIO = 0.045
FRONT_SIDE_MASK_SIDE_EXPAND_RATIO = 0.025
FRONT_SIDE_MASK_CONTROL_RGB = (96, 96, 96)
FRONT_SIDE_MASK_BLEND_STRENGTH = 0.18
FRONT_SIDE_SEMANTIC_CONTROL_SCALE = 0.35
FRONT_SIDE_INPAINT_TOP_PADDING_RATIO = 0.01
FRONT_SIDE_INPAINT_SIDE_EXPAND_RATIO = 0.04
FRONT_FULL_WIDTH_GROUND_CONTROL_RGB = (112, 112, 112)
FRONT_FULL_WIDTH_GROUND_BLEND_STRENGTH = 0.24
FRONT_FULL_WIDTH_GROUND_TOP_PADDING_RATIO = 0.02
FRONT_FULL_WIDTH_GROUND_EXPAND_RATIO = 1.03


@dataclass
class DepthStyleParams:
    prompt: str
    negative_prompt: str = ""
    guidance_scale: float = 7.0
    num_inference_steps: int = 25
    controlnet_conditioning_scale: float = 0.7
    seed: int | None = None


@dataclass
class DepthStyleResult:
    image: Image.Image
    params: DepthStyleParams
    depth_size: tuple[int, int]
    output_size: tuple[int, int]

    def save(self, path: Path | str) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.image.save(path, format="PNG")
        return path


def _depth_to_control(depth: Image.Image) -> Image.Image:
    if depth.mode != "RGB":
        return depth.convert("RGB")
    return depth


def _append_negative_terms(base_negative: str, extra_negative: str) -> str:
    if not extra_negative:
        return base_negative
    if not base_negative:
        return extra_negative
    terms: list[str] = []
    term_indexes: dict[str, int] = {}
    for raw_term in f"{base_negative}, {extra_negative}".split(","):
        term = raw_term.strip()
        if not term:
            continue
        key = _negative_term_key(term)
        existing_index = term_indexes.get(key)
        if existing_index is not None:
            if _is_weighted_negative_term(term) and not _is_weighted_negative_term(
                terms[existing_index]
            ):
                terms[existing_index] = term
            continue
        term_indexes[key] = len(terms)
        terms.append(term)
    return ", ".join(terms)


def _negative_term_key(term: str) -> str:
    normalized = term.strip().lower()
    if (
        normalized.startswith("(")
        and normalized.endswith(")")
        and ":" in normalized
    ):
        normalized = normalized[1:-1].rsplit(":", 1)[0].strip()
    return normalized


def _is_weighted_negative_term(term: str) -> bool:
    normalized = term.strip()
    return normalized.startswith("(") and normalized.endswith(")") and ":" in normalized


def _build_front_side_semantic_mask(control: Image.Image) -> Image.Image:
    """Create a localized 3-class semantic cue for front/side ground contact.

    Classes:
      - building: existing non-background geometry
      - ground-contact band: narrow band directly below lower facade envelope
      - background: everything else
    """
    arr = np.asarray(control.convert("RGB"), dtype=np.uint8)
    bg_mask = np.all(arr == 0, axis=2)
    geom_mask = ~bg_mask
    height, width = bg_mask.shape

    mask = np.zeros((height, width, 3), dtype=np.uint8)
    if not np.any(geom_mask):
        return Image.fromarray(mask, mode="RGB")

    mask[geom_mask] = np.array(SEMANTIC_BUILDING_RGB, dtype=np.uint8)

    ys, xs = np.nonzero(geom_mask)
    left = int(xs.min())
    right = int(xs.max())
    bbox_width = max(1, right - left + 1)
    expand_px = max(1, int(round(bbox_width * FRONT_SIDE_MASK_SIDE_EXPAND_RATIO)))
    band_thickness = max(1, int(round(height * FRONT_SIDE_MASK_BAND_RATIO)))

    bottom_by_x = np.full(width, -1, dtype=np.int32)
    for x in np.unique(xs):
        bottom_by_x[x] = int(ys[xs == x].max())

    support = bottom_by_x >= 0
    support_bottoms = bottom_by_x[support]
    base_y = int(np.percentile(support_bottoms, FRONT_SIDE_MASK_BASE_PERCENTILE))
    base_y = int(np.clip(base_y, 0, height - 1))

    ground_mask = np.zeros((height, width), dtype=bool)
    x_start = max(0, left - expand_px)
    x_end = min(width - 1, right + expand_px)

    for x in range(x_start, x_end + 1):
        if x < left:
            norm = (left - x) / max(1, expand_px)
        elif x > right:
            norm = (x - right) / max(1, expand_px)
        else:
            norm = 0.0

        taper = 1.0 - 0.5 * min(1.0, norm)
        local_thickness = max(1, int(round(band_thickness * taper)))

        if bottom_by_x[x] >= 0:
            local_top = max(base_y, int(bottom_by_x[x]))
            local_top = min(local_top, base_y + max(0, band_thickness // 3))
        else:
            local_top = base_y

        local_bottom = min(height - 1, local_top + local_thickness - 1)
        if local_bottom < local_top:
            continue

        column_slice = slice(local_top, local_bottom + 1)
        ground_mask[column_slice, x] = bg_mask[column_slice, x]

    mask[ground_mask] = np.array(SEMANTIC_GROUND_RGB, dtype=np.uint8)
    return Image.fromarray(mask, mode="RGB")


def _apply_front_side_semantic_mask_to_control(
    control: Image.Image,
    strength: float = FRONT_SIDE_MASK_BLEND_STRENGTH,
) -> Image.Image:
    """Weakly add the local ground-contact band to a depth control image."""
    control_rgb = control.convert("RGB")
    if strength <= 0:
        return control_rgb

    semantic_mask = _build_front_side_semantic_mask(control_rgb)
    mask_arr = np.asarray(semantic_mask, dtype=np.uint8)
    ground_mask = np.all(mask_arr == SEMANTIC_GROUND_RGB, axis=2)
    if not np.any(ground_mask):
        return control_rgb

    strength = float(np.clip(strength, 0.0, 1.0))
    arr = np.asarray(control_rgb, dtype=np.float32).copy()
    target = np.array(FRONT_SIDE_MASK_CONTROL_RGB, dtype=np.float32)
    arr[ground_mask] = arr[ground_mask] * (1.0 - strength) + target * strength
    return Image.fromarray(np.clip(np.rint(arr), 0, 255).astype(np.uint8), mode="RGB")


def _build_front_full_width_ground_mask(control: Image.Image) -> Image.Image:
    """Mark lower full-width background as front-view ground.

    This is intentionally broader than the localized front/side semantic band:
    in orthographic-like front views, any lower area outside the building
    silhouette should read as ground until the image edge.
    """
    arr = np.asarray(control.convert("RGB"), dtype=np.uint8)
    bg_mask = np.all(arr == 0, axis=2)
    geom_mask = ~bg_mask
    height, width = bg_mask.shape

    out = np.zeros((height, width), dtype=np.uint8)
    if not np.any(geom_mask):
        return Image.fromarray(out, mode="L")

    ground_top = _compute_front_full_width_ground_top(geom_mask)
    out[ground_top:, :] = 255
    return Image.fromarray(out, mode="L")


def _compute_front_full_width_ground_top(geom_mask: np.ndarray) -> int:
    height, width = geom_mask.shape
    row_counts = geom_mask.sum(axis=1)
    rows = np.flatnonzero(row_counts)
    if rows.size == 0:
        return height - 1

    ys, xs = np.nonzero(geom_mask)
    bottom_by_x = np.full(width, -1, dtype=np.int32)
    for x in np.unique(xs):
        bottom_by_x[x] = int(ys[xs == x].max())

    support_bottoms = bottom_by_x[bottom_by_x >= 0]
    fallback_base_y = int(np.percentile(support_bottoms, FRONT_SIDE_MASK_BASE_PERCENTILE))
    top_padding = max(
        1,
        int(round(height * FRONT_FULL_WIDTH_GROUND_TOP_PADDING_RATIO)),
    )
    fallback_ground_top = int(np.clip(fallback_base_y + top_padding, 0, height - 1))

    lower_start = int(rows.min() + (rows.max() - rows.min()) * 0.70)
    sample_start = max(int(rows.min()), lower_start - 2)
    sample_end = min(int(rows.max()) + 1, lower_start + 3)
    sample_counts = row_counts[sample_start:sample_end]
    positive_sample_counts = sample_counts[sample_counts > 0]
    if positive_sample_counts.size == 0:
        return fallback_ground_top

    facade_width = int(np.median(positive_sample_counts))
    if facade_width <= 0:
        return fallback_ground_top

    expansion_threshold = max(
        facade_width + 1,
        int(round(facade_width * FRONT_FULL_WIDTH_GROUND_EXPAND_RATIO)),
    )
    expansion_rows = np.flatnonzero(row_counts[lower_start:] >= expansion_threshold)
    if expansion_rows.size == 0:
        return fallback_ground_top

    expansion_y = int(lower_start + expansion_rows[0])
    return int(np.clip(min(expansion_y, fallback_ground_top), 0, height - 1))


def _apply_front_full_width_ground_control(
    control: Image.Image,
    strength: float = FRONT_FULL_WIDTH_GROUND_BLEND_STRENGTH,
) -> Image.Image:
    """Weakly add a front-only full-width ground cue to depth control."""
    control_rgb = control.convert("RGB")
    if strength <= 0:
        return control_rgb

    mask = _build_front_full_width_ground_mask(control_rgb)
    mask_arr = np.asarray(mask, dtype=np.uint8) > 0
    if not np.any(mask_arr):
        return control_rgb

    strength = float(np.clip(strength, 0.0, 1.0))
    arr = np.asarray(control_rgb, dtype=np.float32).copy()
    height, _width = mask_arr.shape
    y = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
    target = np.array(FRONT_FULL_WIDTH_GROUND_CONTROL_RGB, dtype=np.float32)
    target_map = target + (y * 18.0)
    target_map = np.repeat(target_map[:, None, :], arr.shape[1], axis=1)

    arr[mask_arr] = arr[mask_arr] * (1.0 - strength) + target_map[mask_arr] * strength
    return Image.fromarray(np.clip(np.rint(arr), 0, 255).astype(np.uint8), mode="RGB")


def _build_front_full_width_seg_control(
    control: Image.Image,
    ground_class: FrontSideGroundClass = "neutral",
) -> Image.Image:
    """Map front-view full-width ground intent into ADE20K semantic colors."""
    if ground_class not in FRONT_SIDE_GROUND_CLASS_RGB:
        raise ValueError(f"unsupported front ground class: {ground_class}")

    arr = np.asarray(control.convert("RGB"), dtype=np.uint8)
    bg_mask = np.all(arr == 0, axis=2)
    building_mask = ~bg_mask
    ground_mask = np.asarray(
        _build_front_full_width_ground_mask(control),
        dtype=np.uint8,
    ) > 0

    height, width = building_mask.shape
    seg = np.zeros((height, width, 3), dtype=np.uint8)
    seg[:, :] = np.array(ADE20K_BACKGROUND_RGB, dtype=np.uint8)
    seg[building_mask] = np.array(ADE20K_BUILDING_RGB, dtype=np.uint8)
    seg[ground_mask] = np.array(
        FRONT_SIDE_GROUND_CLASS_RGB[ground_class],
        dtype=np.uint8,
    )

    if np.any(building_mask):
        ys, _ = np.nonzero(building_mask)
        sky_limit = int(max(0, ys.min()))
        sky_mask = bg_mask & ~ground_mask
        sky_mask[sky_limit:, :] = False
        seg[sky_mask] = np.array(ADE20K_SKY_RGB, dtype=np.uint8)

    return Image.fromarray(seg, mode="RGB")


def _build_front_side_seg_control(
    control: Image.Image,
    ground_class: FrontSideGroundClass = "grass",
) -> Image.Image:
    """Map the localized front/side mask into ADE20K colors for seg ControlNet."""
    if ground_class not in FRONT_SIDE_GROUND_CLASS_RGB:
        raise ValueError(f"unsupported front/side ground class: {ground_class}")

    semantic_mask = _build_front_side_semantic_mask(control)
    mask_arr = np.asarray(semantic_mask, dtype=np.uint8)
    building_mask = np.all(mask_arr == SEMANTIC_BUILDING_RGB, axis=2)
    ground_mask = np.all(mask_arr == SEMANTIC_GROUND_RGB, axis=2)

    height, width = building_mask.shape
    seg = np.zeros((height, width, 3), dtype=np.uint8)
    seg[:, :] = np.array(ADE20K_BACKGROUND_RGB, dtype=np.uint8)
    seg[building_mask] = np.array(ADE20K_BUILDING_RGB, dtype=np.uint8)
    seg[ground_mask] = np.array(
        FRONT_SIDE_GROUND_CLASS_RGB[ground_class],
        dtype=np.uint8,
    )

    if np.any(building_mask):
        ys, _ = np.nonzero(building_mask)
        sky_limit = int(max(0, ys.min()))
        sky_mask = ~building_mask & ~ground_mask
        sky_mask[sky_limit:, :] = False
        seg[sky_mask] = np.array(ADE20K_SKY_RGB, dtype=np.uint8)

    return Image.fromarray(seg, mode="RGB")


def _build_front_side_inpaint_mask(control: Image.Image) -> Image.Image:
    """Create a lower-facade inpaint mask for front/side two-pass experiments.

    White pixels are intended to be repainted. The mask starts around the
    localized ground-contact band and extends downward only around the building
    footprint, so upper facade details stay protected.
    """
    semantic_mask = _build_front_side_semantic_mask(control)
    mask_arr = np.asarray(semantic_mask, dtype=np.uint8)
    building_mask = np.all(mask_arr == SEMANTIC_BUILDING_RGB, axis=2)
    ground_mask = np.all(mask_arr == SEMANTIC_GROUND_RGB, axis=2)
    height, width = building_mask.shape

    out = np.zeros((height, width), dtype=np.uint8)
    if not np.any(building_mask) or not np.any(ground_mask):
        return Image.fromarray(out, mode="L")

    _, building_xs = np.nonzero(building_mask)
    ground_ys, ground_xs = np.nonzero(ground_mask)
    left = int(min(building_xs.min(), ground_xs.min()))
    right = int(max(building_xs.max(), ground_xs.max()))
    bbox_width = max(1, right - left + 1)
    expand_px = max(1, int(round(bbox_width * FRONT_SIDE_INPAINT_SIDE_EXPAND_RATIO)))
    top_padding = max(1, int(round(height * FRONT_SIDE_INPAINT_TOP_PADDING_RATIO)))

    x_start = max(0, left - expand_px)
    x_end = min(width - 1, right + expand_px)
    y_start = max(0, int(ground_ys.min()) - top_padding)

    out[y_start:, x_start : x_end + 1] = 255
    return Image.fromarray(out, mode="L")


class DepthStyleRenderer:
    """SD 1.5 + ControlNet-depth txt2img renderer."""

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        controlnet_model_id: str = DEFAULT_CONTROLNET_DEPTH_ID,
        semantic_controlnet_model_id: str | None = None,
        device: str | None = None,
        dtype: torch.dtype | None = None,
        warmup: bool = True,
    ) -> None:
        import torch as _torch
        from diffusers import (
            ControlNetModel,
            DPMSolverMultistepScheduler,
            StableDiffusionControlNetPipeline,
        )

        if device is None:
            device = "cuda" if _torch.cuda.is_available() else "cpu"
        if dtype is None:
            is_cuda = _torch.device(device).type == "cuda"
            dtype = _torch.float16 if is_cuda else _torch.float32

        try:
            controlnet = ControlNetModel.from_pretrained(
                controlnet_model_id,
                torch_dtype=dtype,
            )
        except Exception as exc:
            raise IFCRenderError(
                f"ControlNet load failed ({controlnet_model_id}): {exc}"
            ) from exc

        if semantic_controlnet_model_id is not None:
            try:
                semantic_controlnet = ControlNetModel.from_pretrained(
                    semantic_controlnet_model_id,
                    torch_dtype=dtype,
                )
            except Exception as exc:
                raise IFCRenderError(
                    f"Semantic ControlNet load failed ({semantic_controlnet_model_id}): {exc}"
                ) from exc
            controlnet = [controlnet, semantic_controlnet]

        try:
            pipe = StableDiffusionControlNetPipeline.from_pretrained(
                model_id,
                controlnet=controlnet,
                torch_dtype=dtype,
                safety_checker=None,
                requires_safety_checker=False,
            )
        except Exception as exc:
            raise IFCRenderError(f"SD model load failed ({model_id}): {exc}") from exc

        try:
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                pipe.scheduler.config,
                use_karras_sigmas=True,
                algorithm_type="dpmsolver++",
            )
        except Exception as exc:
            raise IFCRenderError(f"Scheduler setup failed: {exc}") from exc

        try:
            pipe.to(device)
        except Exception as exc:
            raise IFCRenderError(f"Device move failed ({device}): {exc}") from exc

        self.model_id = model_id
        self.controlnet_model_id = controlnet_model_id
        self.semantic_controlnet_model_id = semantic_controlnet_model_id
        self.device = device
        self.dtype = dtype
        self.pipe = pipe
        self._torch = _torch

        if warmup:
            self._warmup()

    def _warmup(self) -> None:
        dummy = Image.new("RGB", (768, 448), (128, 128, 128))
        image = [dummy, dummy] if self.semantic_controlnet_model_id else dummy
        conditioning_scale = [0.5, 0.2] if self.semantic_controlnet_model_id else 0.5
        try:
            self.pipe(
                prompt="warmup",
                image=image,
                num_inference_steps=2,
                guidance_scale=1.0,
                controlnet_conditioning_scale=conditioning_scale,
                width=768,
                height=448,
            )
        except Exception as exc:
            raise IFCRenderError(f"Warmup failed: {exc}") from exc

    def render(
        self,
        depth_image: Image.Image,
        params: DepthStyleParams,
        view: IFCView | None = None,
        use_front_side_semantic_mask: bool = False,
        use_front_side_semantic_control: bool = False,
        use_front_full_width_semantic_control: bool = False,
        use_front_full_width_ground_control: bool = False,
        use_weighted_front_side_negative: bool = False,
        front_side_ground_class: FrontSideGroundClass = "grass",
        front_side_semantic_control_scale: float = FRONT_SIDE_SEMANTIC_CONTROL_SCALE,
    ) -> DepthStyleResult:
        depth_size = depth_image.size
        control = _depth_to_control(depth_image)
        if use_front_full_width_ground_control and view is IFCView.FRONT:
            control = _apply_front_full_width_ground_control(control)
        if use_front_side_semantic_mask and view in {IFCView.FRONT, IFCView.SIDE}:
            control = _apply_front_side_semantic_mask_to_control(control)
        control_image: Image.Image | list[Image.Image] = control
        conditioning_scale: float | list[float] = params.controlnet_conditioning_scale
        if use_front_full_width_semantic_control and view is IFCView.FRONT:
            if not self.semantic_controlnet_model_id:
                raise IFCRenderError(
                    "front full-width semantic control requires "
                    "semantic_controlnet_model_id"
                )
            control_image = [
                control,
                _build_front_full_width_seg_control(
                    control,
                    ground_class=front_side_ground_class,
                ),
            ]
            conditioning_scale = [
                params.controlnet_conditioning_scale,
                front_side_semantic_control_scale,
            ]
        if use_front_side_semantic_control and view in {IFCView.FRONT, IFCView.SIDE}:
            if not self.semantic_controlnet_model_id:
                raise IFCRenderError(
                    "front/side semantic control requires semantic_controlnet_model_id"
                )
            control_image = [
                control,
                _build_front_side_seg_control(
                    control,
                    ground_class=front_side_ground_class,
                ),
            ]
            conditioning_scale = [
                params.controlnet_conditioning_scale,
                front_side_semantic_control_scale,
            ]
        width, height = control.size

        if view is not None:
            prompt = build_view_prompt(params.prompt, view)
            applied_params = dc_replace(params, prompt=prompt)
        else:
            prompt = params.prompt
            applied_params = params
        negative_prompt = params.negative_prompt
        if view in {IFCView.FRONT, IFCView.SIDE}:
            front_side_negative = (
                FRONT_SIDE_WEIGHTED_NEGATIVE_TERMS
                if use_weighted_front_side_negative
                else FRONT_SIDE_NEGATIVE_TERMS
            )
            negative_prompt = _append_negative_terms(
                negative_prompt,
                front_side_negative,
            )

        try:
            if params.seed is None:
                generator = None
            else:
                generator = self._torch.Generator(device=self.device).manual_seed(
                    params.seed
                )
            out = self.pipe(
                prompt=prompt,
                image=control_image,
                negative_prompt=negative_prompt,
                guidance_scale=params.guidance_scale,
                num_inference_steps=params.num_inference_steps,
                controlnet_conditioning_scale=conditioning_scale,
                width=width,
                height=height,
                generator=generator,
            )
            image = out.images[0]
        except Exception as exc:
            raise IFCRenderError(f"Render failed: {exc}") from exc

        return DepthStyleResult(
            image=image,
            params=applied_params,
            depth_size=depth_size,
            output_size=image.size,
        )
