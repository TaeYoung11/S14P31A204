"""config 모듈 테스트 — 하이퍼파라미터 상수 sanity check.

상수를 실수로 바꾸거나 제거할 때 회귀 방어용. torch/GPU 미필요.
"""

from ai_rendering.img2img import config


def test_default_long_side_is_768_and_multiple_of_8() -> None:
    """SD 1.5 권장 해상도 + UNet 요건(8의 배수)."""
    assert config.DEFAULT_LONG_SIDE == 768
    assert config.DEFAULT_LONG_SIDE % 8 == 0


def test_default_model_id_is_non_empty_str() -> None:
    assert isinstance(config.DEFAULT_MODEL_ID, str)
    assert config.DEFAULT_MODEL_ID  # non-empty


def test_default_strength_in_valid_range() -> None:
    """img2img strength 는 0~1 사이여야 의미 있음."""
    assert 0.0 < config.DEFAULT_STRENGTH < 1.0


def test_default_guidance_and_steps_positive() -> None:
    assert config.DEFAULT_GUIDANCE_SCALE > 0
    assert isinstance(config.DEFAULT_NUM_INFERENCE_STEPS, int)
    assert config.DEFAULT_NUM_INFERENCE_STEPS > 0


def test_default_negative_prompt_non_empty() -> None:
    assert isinstance(config.DEFAULT_NEGATIVE, str)
    assert config.DEFAULT_NEGATIVE.strip()
