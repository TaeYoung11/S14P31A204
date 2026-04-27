package com.a204.batang.domain.render.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 렌더링 스타일 응답 DTO.
 *
 * @param timeOfDay 시간대
 * @param viewpoint 시점
 * @param season 계절
 * @param weather 날씨
 */
@Schema(description = "렌더링 스타일 정보")
public record ProjectRenderStyleResponse(
        @Schema(description = "시간대", example = "EVENING", nullable = true)
        String timeOfDay,
        @Schema(description = "시점", example = "EXTERIOR", nullable = true)
        String viewpoint,
        @Schema(description = "계절", example = "SPRING", nullable = true)
        String season,
        @Schema(description = "날씨", example = "CLEAR", nullable = true)
        String weather
) {
}
