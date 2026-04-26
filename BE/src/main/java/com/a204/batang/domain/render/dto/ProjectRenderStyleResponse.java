package com.a204.batang.domain.render.dto;

/**
 * 렌더링 스타일 응답 DTO.
 *
 * @param timeOfDay 시간대
 * @param viewpoint 시점
 * @param season 계절
 * @param weather 날씨
 */
public record ProjectRenderStyleResponse(
        String timeOfDay,
        String viewpoint,
        String season,
        String weather
) {
}
