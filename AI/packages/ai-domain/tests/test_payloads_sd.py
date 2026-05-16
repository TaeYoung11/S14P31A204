"""SD render worker payload tests."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_domain.worker_messages.payloads_sd import SdRenderCommandPayload


def test_sd_render_payload_keeps_prompt_based_sd_default() -> None:
    """기존 SD render command는 renderMode 생략 시 prompt 기반 경로로 유지된다."""
    payload = SdRenderCommandPayload(prompt="realistic house render")

    assert payload.renderMode == "sd"
    assert payload.prompt == "realistic house render"
    assert payload.preset is None


def test_sd_render_payload_allows_ifc2img_without_prompt() -> None:
    """ifc2img command는 IFC 입력을 사용하므로 prompt 없이 preset만으로도 통과한다."""
    payload = SdRenderCommandPayload(renderMode="ifc2img", preset="korean_house")

    assert payload.renderMode == "ifc2img"
    assert payload.prompt is None
    assert payload.preset == "korean_house"


def test_sd_render_payload_allows_ifc2img_time_of_day() -> None:
    payload = SdRenderCommandPayload(
        renderMode="ifc2img",
        preset="korean_house",
        timeOfDay="NIGHT",
    )

    assert payload.timeOfDay == "NIGHT"


def test_sd_render_payload_rejects_unknown_time_of_day() -> None:
    with pytest.raises(ValidationError):
        SdRenderCommandPayload(
            renderMode="ifc2img",
            preset="korean_house",
            timeOfDay="MORNING",  # type: ignore[arg-type]
        )


def test_sd_render_payload_requires_prompt_for_default_sd_mode() -> None:
    """기본 SD mode에서는 기존처럼 prompt가 필수다."""
    with pytest.raises(ValidationError, match="prompt is required"):
        SdRenderCommandPayload()


def test_sd_render_payload_rejects_unknown_render_mode() -> None:
    """지원하지 않는 renderMode는 command validation 단계에서 차단한다."""
    with pytest.raises(ValidationError):
        SdRenderCommandPayload(renderMode="img2img", prompt="house")
