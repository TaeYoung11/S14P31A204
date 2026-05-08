package com.a204.batang.domain.job.dto;

import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(description = "렌더링 작업 전용 상세 정보")
public record RenderJobDetailsResponse(
        @Schema(description = "원본 revision ID")
        UUID sourceRevisionId,
        @Schema(description = "원본 scene 타입")
        String sourceSceneType,
        @Schema(description = "예약된 결과 artifact ID")
        UUID expectedOutputArtifactId,
        @Schema(description = "렌더링 프롬프트")
        String prompt,
        @Schema(description = "네거티브 프롬프트")
        String negativePrompt,
        @Schema(description = "렌더링 스타일")
        JsonNode style,
        @Schema(description = "출력 이미지 너비")
        Integer width,
        @Schema(description = "출력 이미지 높이")
        Integer height,
        @Schema(description = "참조 이미지 URL")
        String sourceImageStorageUrl
) {
}
