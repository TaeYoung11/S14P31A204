package com.a204.batang.domain.render.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

@Schema(description = "실사 렌더링 생성 요청")
public record CreateRenderRequest(
        @Schema(description = "렌더링 프롬프트")
        @NotBlank(message = "prompt는 필수입니다.")
        String prompt,
        @Schema(description = "네거티브 프롬프트")
        String negativePrompt,
        @Schema(description = "렌더링 스타일")
        @Valid
        RenderStyleRequest style,
        @Schema(description = "카메라 상태")
        Object cameraState,
        @Schema(description = "소스 이미지 저장 URL")
        String sourceImageStorageUrl,
        @Schema(description = "이미지 너비", example = "1024")
        @Min(value = 256, message = "width는 256 이상이어야 합니다.")
        @Max(value = 2048, message = "width는 2048 이하이어야 합니다.")
        Integer width,
        @Schema(description = "이미지 높이", example = "1024")
        @Min(value = 256, message = "height는 256 이상이어야 합니다.")
        @Max(value = 2048, message = "height는 2048 이하이어야 합니다.")
        Integer height
) {
}
