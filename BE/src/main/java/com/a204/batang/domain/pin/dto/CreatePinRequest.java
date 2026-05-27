package com.a204.batang.domain.pin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 새 핀 등록 요청 DTO다.
 *
 * @param cameraPosition 카메라 좌표
 * @param worldPosition 월드 좌표
 * @param targetElementId 대상 엘리먼트 ID
 * @param content 코멘트 본문
 */
public record CreatePinRequest(
        @NotNull(message = "cameraPosition은 필수입니다.")
        @Valid
        PinPositionRequest cameraPosition,

        @NotNull(message = "worldPosition은 필수입니다.")
        @Valid
        PinPositionRequest worldPosition,

        @NotBlank(message = "targetElementId는 필수입니다.")
        @Size(max = 100, message = "targetElementId는 100자 이하여야 합니다.")
        String targetElementId,

        @NotBlank(message = "content는 필수입니다.")
        @Size(max = 2000, message = "content는 2000자 이하여야 합니다.")
        String content
) {
}
