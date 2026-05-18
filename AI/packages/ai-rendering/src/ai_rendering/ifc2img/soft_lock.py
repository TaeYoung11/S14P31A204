"""Soft-lock img2img diffusion that preserves IFC color/shape while gaining photo texture.

The renderer combines:
- an init image from the IFC-locked F-2 baseline (already contains IFC color blocks)
- a depth ControlNet for silhouette / mass guidance
- an optional segmentation ControlNet for opening / category guidance
- a region-aware prompt that names the visible category families

Geometry exactness is protected by ControlNet conditioning + low img2img strength,
not by hard inpaint masks. Drift is rejected downstream by F-4 exactness metrics.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image

from .exceptions import IFCRenderError
from .semantics import (
    IfcColorSummary,
    IfcSemanticCategory,
    nearest_prompt_color_name,
)


DEFAULT_MODEL_ID = "runwayml/stable-diffusion-v1-5"
DEFAULT_CONTROLNET_DEPTH_ID = "lllyasviel/sd-controlnet-depth"
DEFAULT_CONTROLNET_SEG_ID = "lllyasviel/sd-controlnet-seg"
DEFAULT_CONTROLNET_CANNY_ID = "lllyasviel/sd-controlnet-canny"
CONTROLNET_V11_CANNY_ID = "lllyasviel/control_v11p_sd15_canny"

CategoryName = Literal["roof", "wall", "window", "door", "floor"]

# Generic material-only phrases. Used when the caller does not supply a style
# profile or an IFC color summary, so the renderer stays IFC-agnostic by default.
NEUTRAL_DAY_CATEGORY_PHRASE: dict[str, str] = {
    "roof": "tile roof",
    "wall": "plaster walls",
    "window": "glass windows",
    "door": "wood door",
}
NEUTRAL_NIGHT_CATEGORY_PHRASE: dict[str, str] = {
    "roof": "tile roof under night sky",
    "wall": "plaster walls in evening light",
    "window": "warm lit glass windows",
    "door": "wood door",
}

# Project-specific palette tuned for shinchan.ifc.
SHINCHAN_DAY_CATEGORY_PHRASE: dict[str, str] = {
    "roof": "red tile roof",
    "wall": "white plaster walls",
    "window": "blue glass windows",
    "door": "tan wood door",
}
SHINCHAN_NIGHT_CATEGORY_PHRASE: dict[str, str] = {
    "roof": "red tile roof under night sky",
    "wall": "pale plaster walls in evening light",
    "window": "warm lit blue glass windows",
    "door": "tan wood door",
}

# Templates used when deriving a style profile from an IFC color summary.
_CATEGORY_DAY_TEMPLATE: dict[str, str] = {
    "roof": "{color} tile roof",
    "wall": "{color} plaster walls",
    "window": "{color} glass windows",
    "door": "{color} wood door",
    "floor": "{color} floor",
}
_CATEGORY_NIGHT_TEMPLATE: dict[str, str] = {
    "roof": "{color} tile roof under night sky",
    "wall": "{color} plaster walls in evening light",
    "window": "warm lit {color} glass windows",
    "door": "{color} wood door",
    "floor": "{color} floor",
}
_CATEGORY_NAME_TO_SEMANTIC: dict[str, IfcSemanticCategory] = {
    "roof": "ROOF",
    "wall": "WALL",
    "window": "WINDOW",
    "door": "DOOR",
    "floor": "FLOOR",
}
DAY_SCENE_SUFFIX = (
    "photoreal exterior architectural photo, small detached house, "
    "natural daylight, soft shadows, realistic materials, 35mm photograph"
)
NIGHT_SCENE_SUFFIX = (
    "photoreal exterior night photo, small detached house, "
    "dark blue sky, clear empty sky, no other buildings, "
    "warm interior window lights, realistic materials, 35mm photograph"
)
DAY_NEGATIVE = (
    "drawing, illustration, cartoon, painting, render, low quality, "
    "blurry, oversaturated, neon, fantasy, toy, miniature, "
    "chimney, dome, tower, spire, antenna, smoke, statue, sculpture, "
    "extra building, extra wing, balcony, porch railing, "
    "people, person, car, vehicle, tree, fence"
)
NIGHT_NEGATIVE = (
    "drawing, illustration, cartoon, painting, render, low quality, "
    "blurry, oversaturated, bright daylight, blue sky, toy, miniature, "
    "chimney, dome, tower, spire, antenna, smoke, statue, sculpture, "
    "extra building, extra wing, balcony, porch railing, "
    "people, person, car, vehicle, tree, fence, "
    "looming structure, warehouse, factory, industrial building, "
    "second house, neighboring house, building in background, "
    "dark silhouette, large dark structure, tall building, "
    "city skyline, cluttered background, "
    "two-story upper block, second floor protrusion, attic, loft, "
    "rear building, detached annex, oversized rooftop block, "
    "large windows on upper block, dormer windows"
)
NIGHT_SCENE_SUFFIX_CLEAR = (
    "photoreal exterior night photo, small detached house, "
    "dark blue sky, clear empty sky with stars, no other buildings, "
    "warm interior window lights, realistic materials, 35mm photograph"
)

CATEGORY_ORDER: tuple[str, ...] = ("roof", "wall", "window", "door")

ADE20K_SKY_RGB = (6, 230, 230)
ADE20K_BUILDING_RGB = (180, 120, 120)
ADE20K_GRASS_RGB = (4, 250, 7)
ADE20K_TREE_RGB = (4, 200, 3)
ADE20K_ROAD_RGB = (140, 140, 140)


def build_ade20k_seg_control(
    *,
    building_mask: Image.Image,
    ground_class: Literal["grass", "road"] = "grass",
) -> Image.Image:
    """Build an ADE20K-style seg image from a building mask.

    Pixels where the building mask is bright become ADE20K_BUILDING_RGB.
    Pixels above the building footprint top become ADE20K_SKY_RGB.
    Pixels below become ADE20K_GRASS_RGB or ADE20K_ROAD_RGB.

    This keeps the sd-controlnet-seg input inside the ADE20K palette so the
    network does not hallucinate building textures into the sky region.
    """
    mask_l = building_mask.convert("L")
    width, height = mask_l.size
    mask_arr = np.asarray(mask_l, dtype=np.uint8) > 0
    out = np.zeros((height, width, 3), dtype=np.uint8)

    ground_rgb = ADE20K_GRASS_RGB if ground_class == "grass" else ADE20K_ROAD_RGB
    if not mask_arr.any():
        out[:] = ADE20K_SKY_RGB
        sky_limit = int(round(height * 0.72))
        out[sky_limit:, :] = ground_rgb
        return Image.fromarray(out, mode="RGB")

    col_has_building = mask_arr.any(axis=0)
    row_has_building = mask_arr.any(axis=1)
    bottom_per_column = np.full(width, -1, dtype=np.int32)
    for x in range(width):
        if col_has_building[x]:
            ys = np.where(mask_arr[:, x])[0]
            if ys.size:
                bottom_per_column[x] = int(ys.max())

    building_top_row = int(np.where(row_has_building)[0].min())

    out[:] = ADE20K_SKY_RGB
    for x in range(width):
        b = int(bottom_per_column[x])
        if b < 0:
            continue
        out[b + 1 :, x] = ground_rgb
    if building_top_row > 0:
        no_building_columns = ~col_has_building
        out[building_top_row + 1 :, no_building_columns] = ground_rgb
    out[mask_arr] = ADE20K_BUILDING_RGB
    return Image.fromarray(out, mode="RGB")


def build_canny_control_from_no_background(
    image_path: Path | str,
    *,
    low_threshold: int = 80,
    high_threshold: int = 180,
) -> Image.Image:
    """Build a canny edge ControlNet input from the F-2 no-background RGBA.

    The alpha-derived building region is converted to grayscale and edge-detected.
    The output is RGB with white edges on black background, matching the format
    expected by lllyasviel/sd-controlnet-canny.
    """
    try:
        import cv2
    except ImportError as exc:  # pragma: no cover - environment guard
        raise IFCRenderError(
            "OpenCV (cv2) is required for canny control image"
        ) from exc

    with Image.open(image_path) as raw:
        rgba = raw.convert("RGBA")
    rgb = np.asarray(rgba.convert("RGB"))
    alpha = np.asarray(rgba.split()[-1]) > 0
    gray = np.where(alpha, np.mean(rgb, axis=2), 0).astype(np.uint8)
    edges = cv2.Canny(gray, low_threshold, high_threshold)
    edges_rgb = np.stack([edges, edges, edges], axis=-1)
    return Image.fromarray(edges_rgb, mode="RGB")


def building_mask_from_no_background(image_path: Path | str) -> Image.Image:
    """Return an L-mode mask from the alpha channel of an RGBA no-background image."""
    with Image.open(image_path) as image:
        if image.mode != "RGBA":
            rgba = image.convert("RGBA")
        else:
            rgba = image.copy()
    alpha = rgba.split()[-1]
    return alpha.point(lambda value: 255 if value > 0 else 0).convert("L")


@dataclass(frozen=True)
class StylePrompt:
    """Per-category prompt phrase bundle, separated from generic scene suffix.

    `day_phrases` / `night_phrases` map lowercase category names
    ("roof","wall","window","door","floor") to a noun phrase. Categories
    without a phrase fall back to the neutral phrase for that category.
    """

    day_phrases: dict[str, str]
    night_phrases: dict[str, str]


NEUTRAL_STYLE_PROFILE = StylePrompt(
    day_phrases=dict(NEUTRAL_DAY_CATEGORY_PHRASE),
    night_phrases=dict(NEUTRAL_NIGHT_CATEGORY_PHRASE),
)
SHINCHAN_STYLE_PROFILE = StylePrompt(
    day_phrases=dict(SHINCHAN_DAY_CATEGORY_PHRASE),
    night_phrases=dict(SHINCHAN_NIGHT_CATEGORY_PHRASE),
)


def style_profile_from_ifc_color_summary(summary: IfcColorSummary) -> StylePrompt:
    """Build a StylePrompt by reading the dominant color of each IFC category.

    Categories without a usable representative color fall back to the neutral
    palette for that category. This keeps a non-shinchan IFC self-describing
    (its own colors) instead of inheriting the shinchan tuning.
    """
    day = dict(NEUTRAL_DAY_CATEGORY_PHRASE)
    night = dict(NEUTRAL_NIGHT_CATEGORY_PHRASE)
    for name, semantic in _CATEGORY_NAME_TO_SEMANTIC.items():
        category_summary = summary.categories.get(semantic)
        if category_summary is None or category_summary.color is None:
            continue
        rgb = category_summary.color.rgb
        if rgb is None:
            continue
        color_name = nearest_prompt_color_name(rgb)
        day[name] = _CATEGORY_DAY_TEMPLATE[name].format(color=color_name)
        night[name] = _CATEGORY_NIGHT_TEMPLATE[name].format(color=color_name)
    return StylePrompt(day_phrases=day, night_phrases=night)


def build_region_aware_prompt(
    *,
    visible_categories: set[str],
    time_of_day: str,
    style_profile: StylePrompt | None = None,
    ifc_color_summary: IfcColorSummary | None = None,
) -> str:
    """Return a region-aware prompt naming visible IFC categories by family.

    visible_categories must be a subset of {"roof","wall","window","door","floor"}.
    time_of_day must be "DAY" or "NIGHT".

    Palette resolution order:
    1. explicit `style_profile` (e.g. SHINCHAN_STYLE_PROFILE)
    2. derived from `ifc_color_summary` via the IFC dominant colors
    3. NEUTRAL_STYLE_PROFILE (material-only phrases, no color words)

    The renderer is IFC-agnostic by default; shinchan-flavored phrasing only
    appears when the caller explicitly opts in.
    """
    if time_of_day not in {"DAY", "NIGHT"}:
        raise ValueError(f"unknown time_of_day: {time_of_day!r}")
    if style_profile is not None:
        profile = style_profile
    elif ifc_color_summary is not None:
        profile = style_profile_from_ifc_color_summary(ifc_color_summary)
    else:
        profile = NEUTRAL_STYLE_PROFILE
    palette = profile.day_phrases if time_of_day == "DAY" else profile.night_phrases
    suffix = DAY_SCENE_SUFFIX if time_of_day == "DAY" else NIGHT_SCENE_SUFFIX
    phrases = [
        palette[cat]
        for cat in CATEGORY_ORDER
        if cat in visible_categories and cat in palette
    ]
    if not phrases:
        return suffix
    return ", ".join(phrases + [suffix])


def build_region_aware_negative_prompt(*, time_of_day: str) -> str:
    if time_of_day not in {"DAY", "NIGHT"}:
        raise ValueError(f"unknown time_of_day: {time_of_day!r}")
    return DAY_NEGATIVE if time_of_day == "DAY" else NIGHT_NEGATIVE


def visible_categories_from_element_masks(element_mask_paths: dict[str, Path]) -> set[str]:
    """Return the subset of categories that have at least one bright pixel.

    Categories with missing files or all-zero masks are excluded.
    """
    visible: set[str] = set()
    for category in CATEGORY_ORDER + ("floor",):
        path = element_mask_paths.get(category)
        if path is None or not Path(path).exists():
            continue
        with Image.open(path) as image:
            mask = image.convert("L")
            extrema = mask.getextrema()
            if isinstance(extrema, tuple) and len(extrema) == 2 and extrema[1] > 0:
                visible.add(category)
    return visible


@dataclass
class SoftLockRenderParams:
    prompt: str
    negative_prompt: str = ""
    strength: float = 0.45
    guidance_scale: float = 7.5
    num_inference_steps: int = 25
    depth_conditioning_scale: float = 1.0
    seg_conditioning_scale: float = 1.0
    seed: int | None = 42


@dataclass
class SoftLockRenderResult:
    image: Image.Image
    params: SoftLockRenderParams
    output_size: tuple[int, int]

    def save(self, path: Path | str) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.image.save(path, format="PNG")
        return path


class SoftLockDiffusionRenderer:
    """img2img + (optional) 2 ControlNet renderer for soft-lock IFC fidelity.

    When seg_controlnet_id is None, the renderer runs with only the depth
    ControlNet, which is useful for the smoke stage of the sweep.
    """

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        depth_controlnet_id: str = DEFAULT_CONTROLNET_DEPTH_ID,
        seg_controlnet_id: str | None = DEFAULT_CONTROLNET_SEG_ID,
        device: str | None = None,
        dtype: object = None,
    ) -> None:
        import torch as _torch
        from diffusers import (
            ControlNetModel,
            DPMSolverMultistepScheduler,
            StableDiffusionControlNetImg2ImgPipeline,
        )

        if device is None:
            device = "cuda" if _torch.cuda.is_available() else "cpu"
        if dtype is None:
            is_cuda = _torch.device(device).type == "cuda"
            dtype = _torch.float16 if is_cuda else _torch.float32

        try:
            depth_cn = ControlNetModel.from_pretrained(
                depth_controlnet_id,
                torch_dtype=dtype,
            )
        except Exception as exc:
            raise IFCRenderError(
                f"depth ControlNet load failed ({depth_controlnet_id}): {exc}"
            ) from exc

        controlnets: list = [depth_cn]
        if seg_controlnet_id is not None:
            try:
                seg_cn = ControlNetModel.from_pretrained(
                    seg_controlnet_id,
                    torch_dtype=dtype,
                )
            except Exception as exc:
                raise IFCRenderError(
                    f"seg ControlNet load failed ({seg_controlnet_id}): {exc}"
                ) from exc
            controlnets.append(seg_cn)

        pipeline_controlnet: object = (
            controlnets if len(controlnets) > 1 else controlnets[0]
        )

        try:
            pipe = StableDiffusionControlNetImg2ImgPipeline.from_pretrained(
                model_id,
                controlnet=pipeline_controlnet,
                torch_dtype=dtype,
                safety_checker=None,
                requires_safety_checker=False,
            )
        except Exception as exc:
            raise IFCRenderError(f"SD pipeline load failed ({model_id}): {exc}") from exc

        try:
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                pipe.scheduler.config,
                use_karras_sigmas=True,
                algorithm_type="dpmsolver++",
            )
        except Exception as exc:
            raise IFCRenderError(f"Scheduler setup failed: {exc}") from exc

        if device.startswith("cuda"):
            try:
                pipe.enable_vae_slicing()
                pipe.enable_attention_slicing()
            except Exception:
                pass

        try:
            pipe.to(device)
        except Exception as exc:
            raise IFCRenderError(f"Device move failed ({device}): {exc}") from exc

        self.model_id = model_id
        self.depth_controlnet_id = depth_controlnet_id
        self.seg_controlnet_id = seg_controlnet_id
        self.device = device
        self.dtype = dtype
        self.pipe = pipe
        self._torch = _torch
        self.uses_seg = seg_controlnet_id is not None

    def render(
        self,
        *,
        init_image: Image.Image,
        depth_image: Image.Image,
        seg_image: Image.Image | None,
        params: SoftLockRenderParams,
        width: int | None = None,
        height: int | None = None,
    ) -> SoftLockRenderResult:
        if width is None or height is None:
            width, height = init_image.size
        width = max(int(width) - int(width) % 8, 64)
        height = max(int(height) - int(height) % 8, 64)
        target_size = (width, height)
        init_rgb = init_image.convert("RGB").resize(target_size, Image.Resampling.LANCZOS)
        depth_rgb = depth_image.convert("RGB").resize(target_size, Image.Resampling.NEAREST)
        if self.uses_seg:
            if seg_image is None:
                raise IFCRenderError("seg ControlNet requires seg_image")
            seg_rgb = seg_image.convert("RGB").resize(target_size, Image.Resampling.NEAREST)
            control_image: object = [depth_rgb, seg_rgb]
            cn_scale: object = [
                params.depth_conditioning_scale,
                params.seg_conditioning_scale,
            ]
        else:
            control_image = depth_rgb
            cn_scale = params.depth_conditioning_scale
        if params.seed is None:
            generator = None
        else:
            generator = self._torch.Generator(device=self.device).manual_seed(params.seed)
        try:
            out = self.pipe(
                prompt=params.prompt,
                negative_prompt=params.negative_prompt,
                image=init_rgb,
                control_image=control_image,
                strength=float(params.strength),
                guidance_scale=float(params.guidance_scale),
                num_inference_steps=int(params.num_inference_steps),
                controlnet_conditioning_scale=cn_scale,
                generator=generator,
            )
            image = out.images[0]
        except Exception as exc:
            raise IFCRenderError(f"Soft-lock img2img render failed: {exc}") from exc
        return SoftLockRenderResult(
            image=image,
            params=params,
            output_size=image.size,
        )
