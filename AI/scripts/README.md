# Scripts

현재 유지하는 스크립트만 정리한다.

오래된 prompt/mask trial 스크립트는 production 후보 경로에서 제외되어 삭제했다.
새 실험을 추가할 때는 아래 목록에 남길 가치가 있는지 먼저 판단하고, 일회성 실험이면
DEVLOG에 결과만 남기는 쪽을 우선한다.

| 스크립트 | 용도 |
| --- | --- |
| `ifc_to_styled.py` | IFC에서 depth를 렌더링하고 preset style 이미지를 생성하는 production wrapper. |
| `generate_eye_auto_background_masks.py` | EYE 뷰에서 집은 보호하고 외부 전체를 inpaint 대상으로 잡는 preview-only mask 생성기. |
| `run_eye_auto_background_inpaint.py` | EYE full-outside auto-background inpaint smoke 실행 스크립트. |
| `run_baseline.py` | 작은 baseline 재현/확인용 helper. |
| `run_diversity_check.py` | 여러 fixture의 depth 다양성 확인용 helper. |
| `run_diversity_inference.py` | 여러 fixture의 styled inference 다양성 확인용 helper. |
| `create_minio_buckets.py` | 로컬/인프라 MinIO bucket 준비 helper. |
| `publish_sample_command.py` | sample publish command 생성/확인 helper. |
