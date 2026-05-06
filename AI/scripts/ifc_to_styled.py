"""Render IFC depth views and style them with configured ifc2img presets."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    import io

    sys.stdout = io.TextIOWrapper(
        sys.stdout.buffer,
        encoding="utf-8",
        errors="replace",
    )
    sys.stderr = io.TextIOWrapper(
        sys.stderr.buffer,
        encoding="utf-8",
        errors="replace",
    )

from ai_rendering.ifc2img import (
    IFCRenderError,
    IFCRenderer,
    IFCView,
    list_presets,
    load_preset,
    resolve_preset_view_render_options,
)
from ai_rendering.ifc2img.style import DEFAULT_CONTROLNET_SEG_ID


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render IFC depth views and generate styled images."
    )
    parser.add_argument(
        "--ifc",
        required=True,
        type=Path,
        help="Input IFC path.",
    )
    parser.add_argument(
        "--preset",
        default="all",
        help=f"Preset name or 'all'. Available: {list_presets()}",
    )
    parser.add_argument(
        "--views",
        default="all",
        help="Comma-separated views such as front,side or 'all'.",
    )
    parser.add_argument(
        "--output",
        default=Path("outputs/ifc2img_e2e"),
        type=Path,
        help="Output directory.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Render depth images and print preset info without SD styling.",
    )
    return parser.parse_args()


def _resolve_views(arg: str) -> list[IFCView]:
    if arg == "all":
        return list(IFCView)
    names = [v.strip() for v in arg.split(",")]
    try:
        return [IFCView(n) for n in names]
    except ValueError as exc:
        raise SystemExit(
            f"Invalid views: {arg}. Available: {[v.value for v in IFCView]}"
        ) from exc


def _resolve_presets(arg: str) -> list[str]:
    if arg == "all":
        return list_presets()
    if arg not in list_presets():
        raise SystemExit(
            f"Invalid preset: {arg}. Available: {list_presets()}"
        )
    return [arg]


def _render_depths(
    ifc_path: Path,
    views: list[IFCView],
    output_dir: Path,
) -> dict[IFCView, Path]:
    """Render depth PNGs for each requested view."""
    print(f"[depth] rendering {ifc_path.name} views={len(views)}")
    renderer = IFCRenderer(width=768, height=448)
    images = renderer.render_views(ifc_path, views=views)

    saved: dict[IFCView, Path] = {}
    for view, img in images.items():
        path = output_dir / f"depth_{view.value}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        print(f"  {view.value:5s} -> {path}")
        saved[view] = path
    return saved


def _print_preset_info(presets: list[str]) -> None:
    print(f"\n[preset] {len(presets)} preset(s)")
    for name in presets:
        params = load_preset(name)
        print(
            f"  {name:14s} guidance={params.guidance_scale} "
            f"steps={params.num_inference_steps} "
            f"cn_scale={params.controlnet_conditioning_scale}"
        )


def _resolve_render_plan(
    views: list[IFCView],
    presets: list[str],
) -> list[tuple[IFCView, str]]:
    return [(view, preset_name) for view in views for preset_name in presets]


def _render_plan_requires_semantic_controlnet(
    plan: list[tuple[IFCView, str]],
) -> bool:
    return any(
        resolve_preset_view_render_options(
            preset_name,
            view,
        ).requires_semantic_controlnet
        for view, preset_name in plan
    )


def _render_option_label(preset_name: str, view: IFCView) -> str:
    options = resolve_preset_view_render_options(preset_name, view)
    enabled = [
        name
        for name, value in options.as_render_kwargs().items()
        if isinstance(value, bool) and value
    ]
    if not enabled:
        return "depth-only"
    enabled.append(f"ground={options.front_side_ground_class}")
    enabled.append(f"semantic_scale={options.front_side_semantic_control_scale}")
    return ", ".join(enabled)


def _render_styles(
    depth_paths: dict[IFCView, Path],
    presets: list[str],
    output_dir: Path,
) -> None:
    """Generate styled images from depth inputs using preset/view render options."""
    from PIL import Image

    from ai_rendering.ifc2img import DepthStyleRenderer

    plan = _resolve_render_plan(list(depth_paths), presets)
    print("\n[SD] preparing DepthStyleRenderer")
    print(
        "  semantic controlnet required="
        f"{_render_plan_requires_semantic_controlnet(plan)}"
    )

    renderers: dict[bool, DepthStyleRenderer] = {}

    def _get_renderer(requires_semantic: bool) -> DepthStyleRenderer:
        renderer = renderers.get(requires_semantic)
        if renderer is not None:
            return renderer

        t0 = time.time()
        if requires_semantic:
            renderer = DepthStyleRenderer(
                semantic_controlnet_model_id=DEFAULT_CONTROLNET_SEG_ID
            )
            mode = "depth+semantic"
        else:
            renderer = DepthStyleRenderer()
            mode = "depth-only"
        renderers[requires_semantic] = renderer
        print(
            f"  {mode} renderer ready ({time.time() - t0:.1f}s) "
            f"device={renderer.device}"
        )
        return renderer

    total = len(depth_paths) * len(presets)
    done = 0
    for view, depth_path in depth_paths.items():
        depth = Image.open(depth_path)
        for preset_name in presets:
            done += 1
            t1 = time.time()
            params = load_preset(preset_name)
            options = resolve_preset_view_render_options(preset_name, view)
            style_renderer = _get_renderer(options.requires_semantic_controlnet)
            result = style_renderer.render(
                depth,
                params,
                view=view,
                **options.as_render_kwargs(),
            )
            out_path = output_dir / f"style_{view.value}_{preset_name}.png"
            result.save(out_path)
            print(
                f"  [{done}/{total}] {view.value:5s} x {preset_name:14s} "
                f"-> {out_path.name} ({time.time() - t1:.1f}s) "
                f"options={_render_option_label(preset_name, view)}"
            )


def main() -> int:
    args = _parse_args()

    if not args.ifc.exists():
        print(f"Error: IFC not found: {args.ifc}", file=sys.stderr)
        return 1

    args.output.mkdir(parents=True, exist_ok=True)

    views = _resolve_views(args.views)
    presets = _resolve_presets(args.preset)

    print(f"input: {args.ifc}")
    print(f"views: {[v.value for v in views]}")
    print(f"presets: {presets}")
    print(f"output: {args.output}")
    print(f"mode: {'dry-run' if args.dry_run else 'render'}\n")

    try:
        depth_paths = _render_depths(args.ifc, views, args.output)
        _print_preset_info(presets)

        if args.dry_run:
            print(f"\n[dry-run] saved {len(depth_paths)} depth image(s).")
            return 0

        _render_styles(depth_paths, presets, args.output)
        print(f"\ndone: {args.output}")
        return 0

    except IFCRenderError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
