package com.a204.batang.domain.pin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/**
 * 핀 위치 수정 요청 DTO.
 *
 * @param cameraPosition 변경할 카메라 좌표
 * @param worldPosition 변경할 핀(월드) 좌표
 */
public record UpdatePinPositionRequest(
        @NotNull(message = "cameraPosition은 필수입니다.")
        @Valid
        PinPositionRequest cameraPosition,

        @NotNull(message = "worldPosition은 필수입니다.")
        @Valid
        PinPositionRequest worldPosition
) {
}
