# Scripts 안내

이 디렉터리는 schema codegen, 워커 실행 helper처럼 반복 실행되는 개발용
스크립트를 두기 위한 자리입니다.

서비스 로직은 이 디렉터리에 넣지 않습니다.

## 현재 스크립트

| 파일 | 용도 |
|------|------|
| `run_baseline.py` | ifc2img v2 baseline 5뷰 풀 렌더 — `AC20-FZK-Haus.ifc` + scandinavian 고정. baseline 재현/검증용. |
| `ifc_to_styled.py` | 일반 IFC → depth → 스타일 풀 파이프라인 (argparse). `--ifc / --preset / --views / --output / --dry-run`. baseline view-aware 합성 자동 적용. |
| `run_diversity_check.py` | 다양성 검증 depth 추출 — 3 fixture(haus / Smiley / SampleHouse) × 8뷰 = 24장. 출력 경로 positional 인자(default `outputs/ifc2img_diversity/`). |
| `run_diversity_inference.py` | 다양성 검증 SD 추론 — 3 fixture × 8뷰 × scandinavian preset = 24장 styled. depth 추출 + DepthStyleRenderer 추론을 같은 스크립트에서 수행, 출력 `outputs/ifc2img_diversity/{stem}/styled_{preset}_{view}.png`. |

두 스크립트 모두 `style_renderer.render(depth, params, view=v)` 단일 진입점을 사용해 *prompt suffix + cn_scale override*가 자동 적용됩니다.
