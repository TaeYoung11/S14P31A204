"""img2img_sweep 모듈 — 순수 함수 단위 테스트.

torch/GPU 미필요. encode_filename / _enumerate_combos 만 검증.
"""

from pathlib import Path

import pytest

from ai_evals.runners.img2img_sweep import _enumerate_combos, encode_filename
from ai_rendering.img2img import RenderParams


# ========== encode_filename ==========


def _make_params(**kwargs) -> RenderParams:  # type: ignore[no-untyped-def]
    defaults = dict(prompt="test", seed=42, strength=0.67, guidance_scale=7.0,
                    num_inference_steps=25, controlnet_conditioning_scale=0.3)
    defaults.update(kwargs)
    return RenderParams(**defaults)


def test_encode_filename_plain_format() -> None:
    """plain 모드: cn 파트 없음, 파라미터 포맷 검증."""
    params = _make_params(strength=0.67, guidance_scale=7.0, seed=42,
                          num_inference_steps=25, controlnet_conditioning_scale=0.3)
    name = encode_filename("scandinavian", params, fixture_idx=0, controlnet=False)
    assert name == "scandinavian_s067_g070_step25_seed00042_f0.png"


def test_encode_filename_controlnet_includes_cn_part() -> None:
    """controlnet=True: _cn{xx} 파트가 g 뒤, step 앞에 삽입되어야."""
    params = _make_params(strength=0.67, guidance_scale=7.0, seed=42,
                          num_inference_steps=25, controlnet_conditioning_scale=0.3)
    name = encode_filename("scandinavian", params, fixture_idx=1, controlnet=True)
    assert "_cn03_" in name
    assert name == "scandinavian_s067_g070_cn03_step25_seed00042_f1.png"


def test_encode_filename_cn_scale_encoding() -> None:
    """cn_scale=0.6 → _cn06, cn_scale=1.2 → _cn12."""
    p06 = _make_params(controlnet_conditioning_scale=0.6)
    p12 = _make_params(controlnet_conditioning_scale=1.2)
    assert "_cn06_" in encode_filename("p", p06, 0, controlnet=True)
    assert "_cn12_" in encode_filename("p", p12, 0, controlnet=True)


def test_encode_filename_raises_when_seed_none() -> None:
    """seed=None 이면 ValueError — 파일명에 seed 인코딩 불가."""
    params = RenderParams(prompt="x", seed=None)
    with pytest.raises(ValueError, match="seed must be set"):
        encode_filename("preset", params, 0)


def test_encode_filename_fixture_idx_in_name() -> None:
    """fixture_idx 가 파일명 끝 _f{idx} 에 반영되어야."""
    p = _make_params()
    assert encode_filename("p", p, 3).endswith("_f3.png")
    assert encode_filename("p", p, 0).endswith("_f0.png")


# ========== _enumerate_combos ==========


def _base_config(
    strengths=None,
    guidances=None,
    cn_scales=None,
    fixtures=None,
    presets=None,
    steps=None,
):
    """최소 config dict 생성 헬퍼."""
    cfg: dict = {
        "presets": presets or ["scandinavian"],
        "fixtures": fixtures or ["dummy/input.jpg"],
        "sweep": {
            "strength": strengths or [0.67],
            "guidance_scale": guidances or [7.0],
            "num_inference_steps": steps or [25],
        },
    }
    if cn_scales is not None:
        cfg["sweep"]["controlnet_conditioning_scale"] = cn_scales
    return cfg


def test_enumerate_combos_default_cn_scale() -> None:
    """controlnet_conditioning_scale 없으면 [0.8] 기본값 적용."""
    cfg = _base_config()
    combos = _enumerate_combos(cfg)
    assert len(combos) == 1
    _, _, _, _, _, _, cn = combos[0]
    assert cn == pytest.approx(0.8)


def test_enumerate_combos_custom_cn_scales() -> None:
    """cn_scales=[0.3, 0.6] → 조합 수 2배."""
    cfg = _base_config(cn_scales=[0.3, 0.6])
    combos = _enumerate_combos(cfg)
    assert len(combos) == 2
    cn_values = {round(c[6], 2) for c in combos}
    assert cn_values == {0.3, 0.6}


def test_enumerate_combos_total_count() -> None:
    """2 presets × 2 fixtures × 2 strengths × 2 guidances × 1 step × 3 cn = 24."""
    cfg = _base_config(
        presets=["scandinavian", "industrial"],
        fixtures=["a.jpg", "b.jpg"],
        strengths=[0.65, 0.70],
        guidances=[7.0, 9.0],
        cn_scales=[0.3, 0.6, 0.9],
        steps=[25],
    )
    combos = _enumerate_combos(cfg)
    assert len(combos) == 2 * 2 * 2 * 2 * 1 * 3


def test_enumerate_combos_order_preset_outer_fixture_inner() -> None:
    """preset 이 가장 바깥 축, fixture 가 그 다음."""
    cfg = _base_config(
        presets=["aaa", "bbb"],
        fixtures=["f0.jpg", "f1.jpg"],
    )
    combos = _enumerate_combos(cfg)
    presets_seq = [c[0] for c in combos]
    # 앞 2개는 aaa, 뒤 2개는 bbb
    assert presets_seq[:2] == ["aaa", "aaa"]
    assert presets_seq[2:] == ["bbb", "bbb"]


def test_enumerate_combos_fixture_path_preserved() -> None:
    """_enumerate_combos 가 fixture str → Path 변환해 반환해야."""
    cfg = _base_config(fixtures=["some/path/img.jpg"])
    combos = _enumerate_combos(cfg)
    _, _, fx_path, *_ = combos[0]
    assert isinstance(fx_path, Path)
    assert fx_path == Path("some/path/img.jpg")
