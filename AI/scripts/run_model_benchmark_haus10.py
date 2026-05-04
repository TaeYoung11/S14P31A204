"""Run the Haus 10-slot model-prior benchmark for candidate checkpoints.

This benchmark keeps fixture, prompts, seed, views, and resolution fixed while
changing only the base image model family. The goal is to compare how each
model reads facade-ground relationships and eye-level exterior context.

Examples:
    uv run python scripts/run_model_benchmark_haus10.py
    uv run python scripts/run_model_benchmark_haus10.py --model=realistic_vision_v6
    uv run python scripts/run_model_benchmark_haus10.py --output=outputs/haus10_alt
"""

from __future__ import annotations

import io
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from PIL import Image

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from ai_rendering.ifc2img import (  # noqa: E402
    DepthStyleParams,
    DepthStyleRenderer,
    IFCRenderError,
    IFCRenderer,
    IFCView,
    load_preset,
)
from ai_rendering.ifc2img.views import AutoZoomMode  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "packages" / "ai-rendering" / "tests" / "fixtures" / "ifc" / "AC20-FZK-Haus.ifc"
DEFAULT_OUTPUT_ROOT = ROOT / "outputs" / "model_benchmark_haus10"

BENCHMARK_VIEWS = [
    IFCView.FRONT,
    IFCView.SIDE,
    IFCView.EYE_NE,
    IFCView.EYE_NW,
    IFCView.EYE_SE,
]
BENCHMARK_PRESETS = ["scandinavian", "korean_villa"]
BENCHMARK_TIME = "day"
SDXL_CONTROLNET_DEPTH_ID = "diffusers/controlnet-depth-sdxl-1.0"
SDXL_VAE_ID = "madebyollin/sdxl-vae-fp16-fix"


@dataclass(frozen=True)
class ModelSpec:
    tag: str
    label: str
    family: str
    model_id: str
    variant: str | None = None


MODEL_SPECS: dict[str, ModelSpec] = {
    "realistic_vision_v6": ModelSpec(
        tag="realistic_vision_v6",
        label="Realistic Vision V6.0 B1",
        family="sd15",
        model_id="SG161222/Realistic_Vision_V6.0_B1_noVAE",
    ),
    "juggernaut_xl_v9": ModelSpec(
        tag="juggernaut_xl_v9",
        label="Juggernaut XL v9",
        family="sdxl",
        model_id="RunDiffusion/Juggernaut-XL-v9",
        variant="fp16",
    ),
}


class BenchmarkRenderer(Protocol):
    device: str

    def render(
        self,
        depth_image: Image.Image,
        params: DepthStyleParams,
        view: IFCView,
    ) -> Image.Image:
        ...


class SD15BenchmarkRenderer:
    """Thin wrapper around the existing SD1.5-style renderer."""

    def __init__(self, model_id: str) -> None:
        self._renderer = DepthStyleRenderer(model_id=model_id)
        self.device = self._renderer.device

    def render(
        self,
        depth_image: Image.Image,
        params: DepthStyleParams,
        view: IFCView,
    ) -> Image.Image:
        return self._renderer.render(depth_image, params, view=view).image


class SDXLBenchmarkRenderer:
    """Local SDXL + ControlNet-depth benchmark path."""

    def __init__(self, model_id: str, variant: str | None = None) -> None:
        import torch
        from diffusers import (
            AutoencoderKL,
            ControlNetModel,
            DPMSolverMultistepScheduler,
            StableDiffusionXLControlNetPipeline,
        )

        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32

        try:
            controlnet = ControlNetModel.from_pretrained(
                SDXL_CONTROLNET_DEPTH_ID,
                torch_dtype=dtype,
            )
            vae = AutoencoderKL.from_pretrained(
                SDXL_VAE_ID,
                torch_dtype=dtype,
            )
            pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
                model_id,
                controlnet=controlnet,
                vae=vae,
                torch_dtype=dtype,
                add_watermarker=False,
                use_safetensors=True,
                variant=variant,
            )
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                pipe.scheduler.config,
                use_karras_sigmas=True,
                algorithm_type="dpmsolver++",
            )
            pipe.to(device)
        except Exception as exc:
            raise IFCRenderError(f"SDXL benchmark renderer init failed ({model_id}): {exc}") from exc

        self.device = device
        self._torch = torch
        self._pipe = pipe

    def render(
        self,
        depth_image: Image.Image,
        params: DepthStyleParams,
        view: IFCView,
    ) -> Image.Image:
        from ai_rendering.ifc2img.views import build_view_prompt

        prompt = build_view_prompt(params.prompt, view)
        negative_prompt = params.negative_prompt
        control = depth_image.convert("RGB")

        try:
            generator = None
            if params.seed is not None:
                generator = self._torch.Generator(device=self.device).manual_seed(params.seed)
            out = self._pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=control,
                guidance_scale=params.guidance_scale,
                num_inference_steps=params.num_inference_steps,
                controlnet_conditioning_scale=params.controlnet_conditioning_scale,
                width=control.width,
                height=control.height,
                generator=generator,
            )
            return out.images[0]
        except Exception as exc:
            raise IFCRenderError(f"SDXL benchmark render failed: {exc}") from exc


def _display_path(path: Path) -> Path:
    """Return a repo-relative path when possible, else keep the absolute path."""
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def _resolve_model_tags(args: list[str]) -> list[str]:
    selected = "all"
    for arg in args:
        if arg.startswith("--model="):
            selected = arg.split("=", 1)[1]
    if selected == "all":
        return list(MODEL_SPECS.keys())
    if selected not in MODEL_SPECS:
        raise SystemExit(
            f"unknown --model={selected!r}. available: {sorted(MODEL_SPECS.keys()) + ['all']}"
        )
    return [selected]


def _resolve_output_root(args: list[str]) -> Path:
    for arg in args:
        if arg.startswith("--output="):
            return Path(arg.split("=", 1)[1]).resolve()
    return DEFAULT_OUTPUT_ROOT


def _build_renderer(spec: ModelSpec) -> BenchmarkRenderer:
    if spec.family == "sd15":
        return SD15BenchmarkRenderer(spec.model_id)
    if spec.family == "sdxl":
        return SDXLBenchmarkRenderer(spec.model_id, variant=spec.variant)
    raise IFCRenderError(f"unsupported benchmark family: {spec.family}")


def _render_depths() -> dict[IFCView, Image.Image]:
    renderer = IFCRenderer(
        width=768,
        height=448,
        auto_zoom=AutoZoomMode.ITERATIVE,
    )
    return renderer.render_views(FIXTURE, views=BENCHMARK_VIEWS)


def _benchmark_slots() -> list[tuple[str, str, IFCView]]:
    slots: list[tuple[str, str, IFCView]] = []
    for preset_name in BENCHMARK_PRESETS:
        for view in BENCHMARK_VIEWS:
            slots.append((preset_name, BENCHMARK_TIME, view))
    return slots


def main() -> int:
    if not FIXTURE.exists():
        print(f"[error] fixture not found: {FIXTURE}", file=sys.stderr)
        return 2

    model_tags = _resolve_model_tags(sys.argv[1:])
    output_root = _resolve_output_root(sys.argv[1:])
    output_root.mkdir(parents=True, exist_ok=True)

    print(f"[fixture] {FIXTURE.name}")
    print(f"[slots] {len(_benchmark_slots())} ({BENCHMARK_PRESETS} x {[v.value for v in BENCHMARK_VIEWS]})")
    print(f"[models] {model_tags}")
    print(f"[output] {output_root}\n")

    print("[depth] rendering shared benchmark depths...")
    depth_t0 = time.time()
    depth_images = _render_depths()
    print(f"  done in {time.time() - depth_t0:.1f}s\n")

    for model_tag in model_tags:
        spec = MODEL_SPECS[model_tag]
        print(f"[model] {spec.label} ({spec.model_id})")
        model_dir = output_root / spec.tag / FIXTURE.stem
        model_dir.mkdir(parents=True, exist_ok=True)

        load_t0 = time.time()
        renderer = _build_renderer(spec)
        print(f"  renderer ready in {time.time() - load_t0:.1f}s on {renderer.device}")

        count = 0
        run_t0 = time.time()
        for preset_name in BENCHMARK_PRESETS:
            params = load_preset(preset_name, time_of_day=BENCHMARK_TIME)
            print(f"  [preset] {preset_name} {BENCHMARK_TIME}")
            for view in BENCHMARK_VIEWS:
                t0 = time.time()
                image = renderer.render(depth_images[view], params, view=view)
                out_path = model_dir / f"styled_{preset_name}_{BENCHMARK_TIME}_{view.value}.png"
                image.save(out_path, format="PNG")
                count += 1
                print(
                    f"    [{count}/10] {view.value:6s} -> {_display_path(out_path)} "
                    f"({time.time() - t0:.1f}s)"
                )
        print(f"  model total {time.time() - run_t0:.1f}s\n")

    print("[done] benchmark generation complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
