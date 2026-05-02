package com.a204.batang.domain.render.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "렌더링 스타일 요청")
public record RenderStyleRequest(
        @Schema(description = "시간대")
        String timeOfDay,
        @Schema(description = "시점")
        String viewpoint,
        @Schema(description = "계절")
        String season,
        @Schema(description = "날씨")
        String weather
) {
}
