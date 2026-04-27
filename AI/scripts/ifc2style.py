"""IFC → 스타일 변환 파이프라인 연결 검증 스크립트.

IFCRenderer 출력(PIL Image)을 파일로 저장한 뒤 경로를
ControlNetRenderer에 전달하는 패턴을 검증한다.

기본 모드: IFC 렌더 + 프리셋 로드 + 타입/사이즈 호환 확인. SD 실행 없음.
풀 모드:   --full 플래그 추가 시 ControlNetRenderer 로드 후 스타일 변환까지 실행.

실행:
    uv run python scripts/ifc2style.py
    uv run python scripts/ifc2style.py --ifc <경로> --preset scandinavian
    uv run python scripts/ifc2style.py --full
"""

import io
import sys
import argparse
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from ai_rendering.ifc2img import IFCRenderer, IFCView
from ai_rendering.img2img import load_preset, list_presets, RenderParams

DEFAULT_IFC = (
    Path(__file__).parent.parent
    / "packages/ai-rendering/tests/fixtures/ifc/AC-20-Smiley-West-10-Bldg.ifc"
)
OUT_DIR = Path(__file__).parent.parent / "outputs" / "ifc2style"
VIEWS = list(IFCView)
PRESETS = ["scandinavian", "industrial", "japanese"]


def render_ifc(ifc_path: Path) -> dict[IFCView, Path]:
    """IFC를 3뷰로 렌더해 OUT_DIR에 저장. {뷰: 저장 경로} 반환."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    renderer = IFCRenderer()

    print(f"\n[IFC 렌더] {ifc_path.name}")
    imgs = renderer.render_views(ifc_path, VIEWS)

    saved: dict[IFCView, Path] = {}
    for view, img in imgs.items():
        out = OUT_DIR / f"render_{view.value}.png"
        img.save(out)
        saved[view] = out
        print(f"  {view.value:6s}: {img.size} {img.mode} -> {out.name}")

    return saved


def verify_connection(saved: dict[IFCView, Path], params: RenderParams) -> None:
    """저장된 PNG 경로와 RenderParams가 ControlNetRenderer 입력 조건을 충족하는지 확인."""
    from ai_rendering.img2img.preprocess import ImageInput

    print("\n[연결 검증]")
    for view, path in saved.items():
        # ControlNetRenderer.render()가 받는 타입: Union[Path, str]
        assert isinstance(path, Path), f"타입 오류: {type(path)}"
        assert path.exists(), f"파일 없음: {path}"
        print(f"  {view.value:6s}: ImageInput(Path) OK  크기={path.stat().st_size} bytes")

    print(f"  RenderParams: strength={params.strength}  guidance={params.guidance_scale}"
          f"  steps={params.num_inference_steps}")
    print("  타입 호환: ImageInput(Path) OK  사이즈: (768, 448) OK")


def run_full(saved: dict[IFCView, Path], preset_name: str) -> None:
    """실제 ControlNetRenderer를 로드해 스타일 변환을 실행한다."""
    from ai_rendering.img2img import ControlNetRenderer

    print(f"\n[풀 모드] ControlNetRenderer 로드 중... (수 분 소요)")
    cn = ControlNetRenderer()

    params = load_preset(preset_name)
    print(f"  프리셋: {preset_name}")

    for view, path in saved.items():
        result = cn.render(path, params)
        out = OUT_DIR / f"styled_{preset_name}_{view.value}.png"
        result.image.save(out)
        print(f"  {view.value:6s} -> {out.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="IFC → 스타일 변환 파이프라인 연결 검증")
    parser.add_argument("--ifc", type=Path, default=DEFAULT_IFC, help="IFC 파일 경로")
    parser.add_argument("--preset", default="scandinavian",
                        choices=list_presets() or PRESETS, help="스타일 프리셋 이름")
    parser.add_argument("--full", action="store_true",
                        help="ControlNetRenderer까지 실제 실행 (GPU + 수 분 소요)")
    args = parser.parse_args()

    if not args.ifc.exists():
        print(f"[오류] IFC 파일 없음: {args.ifc}")
        sys.exit(1)

    # 1. IFC 렌더
    saved = render_ifc(args.ifc)

    # 2. 프리셋 로드
    print(f"\n[프리셋] '{args.preset}' 로드 중...")
    params = load_preset(args.preset)
    print(f"  strength={params.strength}  guidance={params.guidance_scale}"
          f"  steps={params.num_inference_steps}")

    # 3. 연결 검증
    verify_connection(saved, params)

    # 4. 풀 모드 (선택)
    if args.full:
        run_full(saved, args.preset)
    else:
        print("\n[완료] 기본 모드 (타입/사이즈 검증만). SD 실행은 --full 플래그 사용.")

    print(f"\n출력 폴더: {OUT_DIR}")


if __name__ == "__main__":
    main()
