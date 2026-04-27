package com.a204.batang.domain.render.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

/**
 * 프로젝트 렌더링 결과 응답 DTO.
 *
 * @param renderId 렌더링 ID(jobId)
 * @param style 렌더링 스타일
 * @param imageUrl 렌더링 이미지 URL
 * @param status 렌더링 상태
 * @param createdAt 렌더링 요청 시각
 * @param completedAt 렌더링 완료 시각
 */
@Schema(description = "프로젝트 렌더링 결과 정보")
public record ProjectRenderResponse(
        @Schema(description = "렌더링 ID(jobId)", example = "96e243de-0abd-41e5-b97f-7c68afea4fa5")
        UUID renderId,
        @Schema(description = "렌더링 스타일 정보", nullable = true)
        ProjectRenderStyleResponse style,
        @Schema(description = "렌더링 이미지 URL", example = "https://minio.local/renderings/render-001.png", nullable = true)
        String imageUrl,
        @Schema(description = "렌더링 상태", example = "SUCCESS")
        String status,
        @Schema(description = "렌더링 요청 시각 (UTC ISO-8601)", example = "2026-04-15T07:50:00Z")
        String createdAt,
        @Schema(description = "렌더링 완료 시각 (UTC ISO-8601)", example = "2026-04-15T07:50:28Z", nullable = true)
        String completedAt
) {
}
