# ai-evals

AI 모듈의 **prompt / model / output / schema 품질** 을 평가하기 위한 전용 패키지.

- 일반 단위 테스트는 각 runtime 패키지 옆에 둠 (예: `packages/ai-rendering/tests/`).
- 이 패키지는 **튜닝 시 돌리는 batch 실험, 재사용 가능한 품질 지표, 평가 데이터셋** 등
  "워커 실행 직접 경로에는 없지만 품질 판단에 필요한 도구들" 의 집결지.

## 패키지 구조

```
packages/ai-evals/
├── src/ai_evals/
│   ├── runners/            # 워커별 batch 실험 스크립트
│   │   ├── img2img_sweep.py    # ai-rendering img2img 파라미터 스윕
│   │   └── make_grid.py        # img2img_sweep 결과 contact sheet 합성
│   └── metrics/            # 재사용 가능 품질 지표 (향후 추가)
├── datasets/               # 평가 데이터셋 (향후 추가)
├── configs/                # runner 별 config 예시
│   └── sweep_default.yaml      # img2img_sweep 기본 config
└── outputs/                # runner 실행 결과 (gitignored, 최근 5 run 자동 유지)
```

## 현재 지원 runner

| Runner | 대상 워커 | 용도 | 상세 |
|---|---|---|---|
| `img2img_sweep` + `make_grid` | `ai-rendering` | img2img 파라미터 튜닝용 batch 렌더 + 비교 판 생성 | [아래 섹션](#img2img-sweep-for-ai-rendering) |

**향후 확장 예시** (자리 표시):
- LLM prompt 튜닝 runner (`ai-planning` 의 자연어 명령 품질 평가)
- schema 회귀 runner (`ai-domain` 스키마 변경 영향 검증)
- 다른 워커에 튜닝 니즈 생길 때마다 `runners/<worker>_<purpose>.py` 추가

---

# img2img sweep (for `ai-rendering`)

Img2img 품질 튜닝용 평가 리그. `ai_rendering.img2img.Img2ImgRenderer` 를 사용해
**여러 파라미터 조합으로 일괄 렌더 → 한 장의 grid 이미지로 비교 가능하게** 만듦.

## 왜 필요한가

> "strength 0.6 이 더 나을까, 0.7 이 더 나을까?"
> "guidance 10 vs 12 를 눈으로 비교하고 싶다"

튜닝 효과를 객관적으로 판단하려면 **여러 조합을 같은 입력/seed 로 돌려 나란히 비교**해야 함.
이 runner 가 batch 실행 + 비교 판 생성 파이프라인을 제공.

## 빠른 시작

### 1. 스윕 실행
```bash
uv run python -m ai_evals.runners.img2img_sweep \
  --config packages/ai-evals/configs/sweep_default.yaml
```

축소 실행 (smoke test 용):
```bash
uv run python -m ai_evals.runners.img2img_sweep \
  --config packages/ai-evals/configs/sweep_default.yaml --limit 3
```

### 2. 비교 판 생성
```bash
uv run python -m ai_evals.runners.make_grid \
  --run packages/ai-evals/outputs/run_YYYYMMDD_HHMMSS
```

→ `<run>/grids/grid_{preset}_f{idx}.png` 들이 생성됨. IDE 나 파일 탐색기에서 열어서 비교.

## Config 구조 (`sweep_default.yaml`)

```yaml
model:
  id: runwayml/stable-diffusion-v1-5   # 체크포인트 교체 실험 시 여기 변경

seed: 42                                # 재현성 고정

fixtures:                               # 평가용 입력 PNG 경로 (repo root 상대)
  - packages/ai-rendering/tests/fixtures/input/image (17).png
  - ...

presets: [scandinavian, industrial, japanese]   # img2img 프리셋 이름

sweep:                                  # 스윕할 파라미터 (itertools.product 로 조합)
  strength: [0.5, 0.6, 0.7, 0.78]
  guidance_scale: [7, 10, 12]
  num_inference_steps: [30]
```

총 조합 수 = `len(presets) × len(fixtures) × strength × guidance × steps`.
예: 3 × 4 × 4 × 3 × 1 = **144** renders/run.

## 출력 구조

```
packages/ai-evals/outputs/
└── run_YYYYMMDD_HHMMSS/
    ├── results/
    │   ├── scandinavian_s050_g070_step30_seed00042_f0.png
    │   ├── scandinavian_s050_g100_step30_seed00042_f0.png
    │   └── ...
    ├── manifest.json                   # 각 render 의 config + duration + status
    └── grids/                          # make_grid 실행 후 생성
        ├── grid_scandinavian_f0.png
        ├── grid_scandinavian_f1.png
        └── ...
```

### 파일명 인코딩 규칙
```
{preset}_s{strength*100:03d}_g{guidance*10:03d}_step{steps:02d}_seed{seed:05d}_f{idx}.png
```
예: `scandinavian_s050_g070_step30_seed00042_f0.png`
- `s050` = strength 0.50
- `g070` = guidance 7.0
- `f0`   = fixture index 0

Lex 정렬 시 자연스러운 순서 (strength → guidance → ...) 로 나열됨.

## 결과 해석

### Grid 이미지
- **행(세로축)** = strength (위: 낮음 → 아래: 높음)
- **열(가로축)** = guidance (좌: 낮음 → 우: 높음)
- 각 셀 좌상단에 `s=0.6 g=10` 같은 라벨
- 실패 조합은 회색 placeholder + `FAIL` 표시 (격자 구조 유지)

### manifest.json
각 render 의 상세 기록. 재현에 필요한 전체 컨텍스트 보존:
- `filename`, `preset`, `fixture`, `fixture_idx`
- `params` (prompt, negative_prompt, strength, guidance_scale, steps, seed)
- `duration_sec`
- `status` (`"ok"` / `"failed"`), `error`

## Best config 기록 포맷 (튜닝 후)

각 preset 별로 grid 를 훑어서 "가장 좋은 조합" 을 결정. 찾은 결과를 README 나 별도 문서에 기록:

| preset | strength | guidance | steps | seed | 출처 (run_dir) | 메모 |
|---|---|---|---|---|---|---|
| scandinavian | 0.65 | 10 | 30 | 42 | run_20260424_000001 | 창호 유지력 OK, 벽 재질 자연스러움 |
| industrial | 0.70 | 12 | 30 | 42 | run_20260424_000001 | 노출 콘크리트 표현 굿 |
| japanese | 0.60 | 10 | 30 | 42 | run_20260424_000001 | 지붕 경사선 일부 깨짐 — 여전히 약함 |

결정되면 `ai-rendering` 의 프리셋 YAML 에 반영하거나 `config.py` 기본값 갱신.

## 실행 환경 팁

### 소요 시간 기준
- **CPU**: render 1장 당 ~90초 (30 steps × ~5s/step × strength 계수)
  - 144 combos 풀 스윕 = **3-4 시간**
  - CPU 는 smoke test (`--limit 3~10`) 용도 권장
- **GPU (CUDA)**: render 1장 당 **~5-15초**
  - 144 combos = **15-40분**, 현실적 full sweep 가능

### 브라우저/SSH 끊김 대응 (긴 실행)
```bash
nohup uv run python -m ai_evals.runners.img2img_sweep \
  --config packages/ai-evals/configs/sweep_default.yaml \
  > sweep.log 2>&1 &

tail -f sweep.log    # 재접속 후 진행 확인
```

중간 크래시 대비: manifest.json 은 **매 render 후 증분 저장** → 완료된 조합은 항상 보존.

### Outputs 자동 정리 (패키지 공통 동작)

새 sweep 시작 시 `outputs/` 아래 오래된 `run_*` 자동 삭제 (**최근 5개만 유지**).
중요한 run 은 `_pinned/` 아래로 옮기면 정리 대상에서 제외:

```bash
mv packages/ai-evals/outputs/run_20260424_000001 packages/ai-evals/outputs/_pinned/
```

미래에 다른 runner (LLM/schema 등) 가 추가돼도 동일한 `outputs/` 구조를 공유.

### 체크포인트 교체 실험 (Tier 2-F)
`sweep_default.yaml` 의 `model.id` 만 교체하면 동일 config 로 다른 모델 돌려 비교 가능:
```yaml
model:
  id: SG161222/Realistic_Vision_V6.0_B1_noVAE
```

## 현재 제약 (known limitations)

- `num_inference_steps` 여러 값 시 grid 배치 단순화됨 (동일 `(s, g)` 중첩 시 첫 entry 사용)
- seed 단일 값 가정 — seed 스윕은 별도 run 으로 (여러 run 의 grid 를 수동 비교)
- grid 라벨은 `ImageFont.load_default()` bitmap 폰트 (작음) — 큰 폰트 필요 시 `ImageFont.truetype(...)` 로 교체

## 관련 모듈

- `ai_rendering.img2img` — 실제 SD img2img 추론 ([packages/ai-rendering](../ai-rendering/))
- 프리셋 YAML — `packages/ai-rendering/src/ai_rendering/img2img/presets/`
