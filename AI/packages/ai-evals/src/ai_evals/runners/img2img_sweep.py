"""Img2img 파라미터 스윕 실행기 — 평가 리그 본체.

사용:
    uv run python -m ai_evals.runners.img2img_sweep --config <yaml path>
    uv run python -m ai_evals.runners.img2img_sweep --config <yaml> --limit 3

동작:
    1. YAML config 로드 (fixtures, presets, sweep grid, seed)
    2. presets × fixtures × (strength × guidance × steps) 조합 전개
    3. Img2ImgRenderer 1회 로드
    4. 각 조합 render → outputs/run_{ts}/results/ 에 저장, 파일명에 파라미터 인코딩
    5. manifest.json 에 각 render 기록 (증분 저장 — 중간 크래시 대비)
    6. 종료 시 summary (ok/failed/duration/avg)

현재 (1-A-4):
    전체 스윕 루프 + tqdm + 증분 manifest + --limit 옵션.
    1-A-5 에서 make_grid.py 로 contact sheet 합성 예정.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from dataclasses import replace
from datetime import datetime
from itertools import product
from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped]
from tqdm import tqdm  # type: ignore[import-untyped]

from ai_rendering.img2img import ControlNetRenderer, Img2ImgRenderer, RenderParams, load_preset

# 이 스크립트 기준 ai-evals 패키지 루트 (outputs/ 위치 앵커)
_AI_EVALS_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTPUTS = _AI_EVALS_ROOT / "outputs"

# 조합 튜플: (preset, fixture_idx, fixture_path, strength, guidance, steps, conditioning_scale)
_ComboTuple = tuple[str, int, Path, float, float, int, float]


def encode_filename(
    preset: str,
    params: RenderParams,
    fixture_idx: int,
    controlnet: bool = False,
) -> str:
    """파일명에 파라미터 인코딩 — lex 정렬 가능한 고정폭 포맷.

    plain:      {preset}_s{s}_g{g}_step{steps}_seed{seed}_f{idx}.png
    controlnet: {preset}_s{s}_g{g}_cn{cn}_step{steps}_seed{seed}_f{idx}.png
    """
    if params.seed is None:
        raise ValueError("seed must be set before encoding filename")
    s = int(round(params.strength * 100))
    g = int(round(params.guidance_scale * 10))
    cn = int(round(params.controlnet_conditioning_scale * 10))
    steps = params.num_inference_steps
    seed = params.seed
    cn_part = f"_cn{cn:02d}" if controlnet else ""
    return (
        f"{preset}"
        f"_s{s:03d}"
        f"_g{g:03d}"
        f"{cn_part}"
        f"_step{steps:02d}"
        f"_seed{seed:05d}"
        f"_f{fixture_idx}.png"
    )


def create_run_dir(base: Path) -> Path:
    """outputs/run_YYYYMMDD_HHMMSS/results/ 생성 후 run_dir 반환."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = base / f"run_{ts}"
    (run_dir / "results").mkdir(parents=True, exist_ok=True)
    return run_dir


def _prune_old_runs(outputs_base: Path, keep: int = 5) -> None:
    """outputs/ 아래 `run_*` 디렉토리 중 최근 keep 개만 유지, 나머지 삭제.

    - mtime 기준 정렬 (이름 포맷 의존성 제거)
    - glob `run_*` 이라 `_pinned/` 등은 자동으로 대상 밖
    - 첫 sweep 실행 등 삭제 대상 없으면 조용히 no-op
    """
    if not outputs_base.exists():
        return
    runs = sorted(
        (p for p in outputs_base.glob("run_*") if p.is_dir()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,  # 최신 먼저
    )
    for old in runs[keep:]:
        shutil.rmtree(old)
        print(f"[prune] removed old run: {old.name}")


def render_one(
    renderer: Img2ImgRenderer | ControlNetRenderer,
    fixture_path: Path,
    preset_name: str,
    sweep_overrides: dict[str, Any],
    seed: int,
    fixture_idx: int,
    run_dir: Path,
    controlnet: bool = False,
) -> dict[str, Any]:
    """1개 조합 render + 저장. manifest entry dict 반환.

    preset YAML 기본값 위에 sweep_overrides (strength/guidance/steps/conditioning_scale) + seed 덮어씀.
    render 실패 시 status='failed' + error 메시지로 기록, 파일 저장 없음.
    """
    base_params = load_preset(preset_name)
    params = replace(base_params, seed=seed, **sweep_overrides)

    filename = encode_filename(preset_name, params, fixture_idx, controlnet=controlnet)
    out_path = run_dir / "results" / filename

    t0 = time.perf_counter()
    status = "ok"
    error: str | None = None
    try:
        result = renderer.render(fixture_path, params)
        result.save(out_path)
    except Exception as e:
        status = "failed"
        error = f"{type(e).__name__}: {e}"
    duration = time.perf_counter() - t0

    return {
        "filename": filename,
        "preset": preset_name,
        "fixture": str(fixture_path),
        "fixture_idx": fixture_idx,
        "params": {
            "prompt": params.prompt,
            "negative_prompt": params.negative_prompt,
            "strength": params.strength,
            "guidance_scale": params.guidance_scale,
            "num_inference_steps": params.num_inference_steps,
            "seed": params.seed,
            "controlnet_conditioning_scale": params.controlnet_conditioning_scale,
        },
        "duration_sec": round(duration, 1),
        "status": status,
        "error": error,
    }


def _enumerate_combos(config: dict[str, Any]) -> list[_ComboTuple]:
    """(preset, fx_idx, fx_path, strength, guidance, steps, conditioning_scale) 조합 flat list 전개.

    순서: preset → fixture → (strength × guidance × steps × conditioning_scale product).
    conditioning_scale 이 config 에 없으면 [0.8] 기본값 사용.
    """
    presets: list[str] = config["presets"]
    fixtures: list[Path] = [Path(fx) for fx in config["fixtures"]]
    strengths: list[float] = config["sweep"]["strength"]
    guidances: list[float] = config["sweep"]["guidance_scale"]
    steps_list: list[int] = config["sweep"]["num_inference_steps"]
    cn_scales: list[float] = config["sweep"].get("controlnet_conditioning_scale", [0.8])

    return [
        (preset, fx_idx, fx, s, g, t, cn)
        for preset in presets
        for fx_idx, fx in enumerate(fixtures)
        for s, g, t, cn in product(strengths, guidances, steps_list, cn_scales)
    ]


def _save_manifest(run_dir: Path, entries: list[dict[str, Any]]) -> None:
    """manifest.json 에 현재까지의 entries 기록 (증분 저장)."""
    with open(run_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)


def _print_summary(entries: list[dict[str, Any]], total_duration_sec: float) -> None:
    """실행 종료 시 ok/failed/duration/avg 출력."""
    total = len(entries)
    ok = sum(1 for e in entries if e["status"] == "ok")
    failed = sum(1 for e in entries if e["status"] == "failed")
    avg = total_duration_sec / total if total else 0.0

    hours = int(total_duration_sec // 3600)
    minutes = int((total_duration_sec % 3600) // 60)
    seconds = int(total_duration_sec % 60)

    print()
    print("=== summary ===")
    print(f"total:    {total}")
    print(f"ok:       {ok}")
    print(f"failed:   {failed}")
    print(f"duration: {hours}h {minutes:02d}m {seconds:02d}s")
    print(f"avg:      {avg:.1f}s/render")

    if failed > 0:
        print()
        print("failed combos:")
        for e in entries:
            if e["status"] == "failed":
                print(f"  {e['filename']}: {e['error']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Img2img parameter sweep runner")
    parser.add_argument(
        "--config",
        required=True,
        type=Path,
        help="스윕 설정 YAML 경로",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="앞에서부터 N개 조합만 실행 (축소 sweep 용)",
    )
    parser.add_argument(
        "--controlnet",
        action="store_true",
        default=False,
        help="ControlNet Canny 파이프라인 사용 (기본: plain img2img)",
    )
    args = parser.parse_args(argv)

    if not args.config.exists():
        print(f"[error] config not found: {args.config}", file=sys.stderr)
        return 2

    with open(args.config, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # 사전 검증: 모든 fixture 파일 존재 확인
    for fx_str in config["fixtures"]:
        if not Path(fx_str).exists():
            print(f"[error] fixture missing: {fx_str}", file=sys.stderr)
            return 2

    seed = int(config.get("seed", 42))
    all_combos = _enumerate_combos(config)
    total_combos = len(all_combos)
    if args.limit is not None:
        all_combos = all_combos[: args.limit]

    # 새 run 만들기 전에 오래된 run 정리 (최근 5 유지)
    _prune_old_runs(DEFAULT_OUTPUTS, keep=5)

    run_dir = create_run_dir(DEFAULT_OUTPUTS)
    print(f"[run] {run_dir}")
    print(f"[combos] running {len(all_combos)} / {total_combos}"
          f"{' (limited)' if args.limit is not None else ''}")

    model_id: str | None = (config.get("model") or {}).get("id")
    renderer_name = "ControlNetRenderer" if args.controlnet else "Img2ImgRenderer"
    print(f"[init] {renderer_name} loading (model_id={model_id or 'default'})...")
    t_init = time.perf_counter()
    if args.controlnet:
        renderer: Img2ImgRenderer | ControlNetRenderer = (
            ControlNetRenderer(model_id=model_id) if model_id else ControlNetRenderer()
        )
    else:
        renderer = (
            Img2ImgRenderer(model_id=model_id) if model_id else Img2ImgRenderer()
        )
    print(f"[init] done in {time.perf_counter() - t_init:.1f}s "
          f"(device={renderer.device}, model={renderer.model_id})")

    manifest: list[dict[str, Any]] = []
    t_sweep_start = time.perf_counter()

    with tqdm(total=len(all_combos), unit="render", dynamic_ncols=True) as pbar:
        for preset, fx_idx, fx_path, strength, guidance, steps, cn_scale in all_combos:
            overrides: dict[str, Any] = {
                "strength": strength,
                "guidance_scale": guidance,
                "num_inference_steps": steps,
                "controlnet_conditioning_scale": cn_scale,
            }
            entry = render_one(
                renderer,
                fx_path,
                preset,
                overrides,
                seed=seed,
                fixture_idx=fx_idx,
                run_dir=run_dir,
                controlnet=args.controlnet,
            )
            manifest.append(entry)
            _save_manifest(run_dir, manifest)  # 증분 저장
            pbar.update(1)
            pbar.set_postfix(
                preset=preset, f=fx_idx, status=entry["status"]
            )

    total_duration = time.perf_counter() - t_sweep_start
    _print_summary(manifest, total_duration)

    failed_count = sum(1 for e in manifest if e["status"] == "failed")
    return 0 if failed_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
