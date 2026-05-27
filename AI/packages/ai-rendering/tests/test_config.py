"""img2img 기본 설정값이 렌더링 파이프라인에서 쓰기 안전한지 확인한다.

이 테스트는 실제 모델이나 GPU를 띄우지 않고, 설정 모듈에 정의된 기본값만 검증한다.
기본 해상도, 모델 id, strength, guidance, step 수, negative prompt가 비어 있거나
파이프라인 제약을 벗어나면 렌더링 호출 전에 빠르게 알아차리기 위한 sanity check다.
"""

from ai_rendering.img2img import config


def test_default_long_side_is_768_and_multiple_of_8() -> None:
    """기본 긴 변 길이는 SD 1.5 계열 기본 해상도이며 UNet stride 8에 맞아야 한다."""
    assert config.DEFAULT_LONG_SIDE == 768
    assert config.DEFAULT_LONG_SIDE % 8 == 0


def test_default_model_id_is_non_empty_str() -> None:
    """기본 모델 id는 diffusers 로더에 넘길 수 있는 비어 있지 않은 문자열이어야 한다."""
    assert isinstance(config.DEFAULT_MODEL_ID, str)
    assert config.DEFAULT_MODEL_ID


def test_default_strength_in_valid_range() -> None:
    """img2img strength는 원본 보존과 재생성 강도를 표현하므로 0과 1 사이여야 한다."""
    assert 0.0 < config.DEFAULT_STRENGTH < 1.0


def test_default_guidance_and_steps_positive() -> None:
    """guidance scale과 inference step은 파이프라인 호출에 유효한 양수 값이어야 한다."""
    assert config.DEFAULT_GUIDANCE_SCALE > 0
    assert isinstance(config.DEFAULT_NUM_INFERENCE_STEPS, int)
    assert config.DEFAULT_NUM_INFERENCE_STEPS > 0


def test_default_negative_prompt_non_empty() -> None:
    """기본 negative prompt는 품질 저하 요소를 억제할 수 있도록 비어 있지 않아야 한다."""
    assert isinstance(config.DEFAULT_NEGATIVE, str)
    assert config.DEFAULT_NEGATIVE.strip()
