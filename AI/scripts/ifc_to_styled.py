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
from ai_rendering.ifc2img.views import AutoZoomMode


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
    parser.add_argument(
        "--auto-zoom",
        action="store_true",
        help="Use iterative depth zoom to match each view's target fill ratio.",
    )
    parser.add_argument(
        "--front-diagonal-target-ratio",
        type=float,
        default=None,
        help=(
            "Override iterative zoom target fill ratio for front diagonal views only. "
            "Requires --auto-zoom to affect rendering."
        ),
    )
    parser.add_argument(
        "--front-diagonal-ground-extent-factor",
        type=float,
        default=None,
        help=(
            "Override ground plane extent factor for front diagonal views only. "
            "Omit to keep the default renderer geometry."
        ),
    )
    parser.add_argument(
        "--iter-tolerance",
        type=float,
        default=0.10,
        help="Iterative auto-zoom fill tolerance. Used with --auto-zoom.",
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
    auto_zoom: bool = False,
    front_diagonal_target_ratio: float | None = None,
    front_diagonal_ground_extent_factor: float | None = None,
    iter_tolerance: float = 0.10,
) -> dict[IFCView, Path]:
    """Render depth PNGs for each requested view."""
    zoom_mode = AutoZoomMode.ITERATIVE if auto_zoom else AutoZoomMode.OFF
    target_overrides = _build_front_diagonal_target_overrides(front_diagonal_target_ratio)
    ground_extent_overrides = _build_front_diagonal_ground_extent_overrides(
        front_diagonal_ground_extent_factor
    )
    print(
        f"[depth] rendering {ifc_path.name} views={len(views)} "
        f"auto_zoom={zoom_mode.value}"
    )
    if target_overrides:
        print(f"  front_diagonal_target_ratio={front_diagonal_target_ratio}")
    if ground_extent_overrides:
        print(f"  front_diagonal_ground_extent_factor={front_diagonal_ground_extent_factor}")
    renderer = IFCRenderer(
        width=768,
        height=448,
        auto_zoom=zoom_mode,
        iter_tolerance=iter_tolerance,
        view_target_overrides=target_overrides,
        view_ground_extent_overrides=ground_extent_overrides,
    )
    images = renderer.render_views(ifc_path, views=views)

    saved: dict[IFCView, Path] = {}
    for view, img in images.items():
        path = output_dir / f"depth_{view.value}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        print(f"  {view.value:5s} -> {path}")
        saved[view] = path
    return saved


def _build_front_diagonal_target_overrides(
    front_diagonal_target_ratio: float | None,
) -> dict[IFCView, float]:
    if front_diagonal_target_ratio is None:
        return {}
    if not 0.0 < front_diagonal_target_ratio < 1.0:
        raise SystemExit("--front-diagonal-target-ratio must be between 0 and 1.")
    return {
        IFCView.FRONT_DIAGONAL_RIGHT: front_diagonal_target_ratio,
        IFCView.FRONT_DIAGONAL_LEFT: front_diagonal_target_ratio,
    }


def _build_front_diagonal_ground_extent_overrides(
    front_diagonal_ground_extent_factor: float | None,
) -> dict[IFCView, float]:
    if front_diagonal_ground_extent_factor is None:
        return {}
    if front_diagonal_ground_extent_factor <= 0.0:
        raise SystemExit("--front-diagonal-ground-extent-factor must be greater than 0.")
    return {
        IFCView.FRONT_DIAGONAL_RIGHT: front_diagonal_ground_extent_factor,
        IFCView.FRONT_DIAGONAL_LEFT: front_diagonal_ground_extent_factor,
    }


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


def _create_depth_style_renderer(
    renderer_cls: type,
    requires_semantic: bool,
):
    if requires_semantic:
        return (
            renderer_cls(semantic_controlnet_model_id=DEFAULT_CONTROLNET_SEG_ID),
            "depth+semantic",
        )
    return renderer_cls(), "depth-only"


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
        renderer, mode = _create_depth_style_renderer(
            DepthStyleRenderer,
            requires_semantic,
        )
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
    print(f"auto_zoom: {'iterative' if args.auto_zoom else 'off'}")
    if args.front_diagonal_target_ratio is not None:
        print(f"front_diagonal_target_ratio: {args.front_diagonal_target_ratio}")
    if args.front_diagonal_ground_extent_factor is not None:
        print(f"front_diagonal_ground_extent_factor: {args.front_diagonal_ground_extent_factor}")
    print(f"iter_tolerance: {args.iter_tolerance}")

    try:
        depth_paths = _render_depths(
            args.ifc,
            views,
            args.output,
            auto_zoom=args.auto_zoom,
            front_diagonal_target_ratio=args.front_diagonal_target_ratio,
            front_diagonal_ground_extent_factor=args.front_diagonal_ground_extent_factor,
            iter_tolerance=args.iter_tolerance,
        )
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
