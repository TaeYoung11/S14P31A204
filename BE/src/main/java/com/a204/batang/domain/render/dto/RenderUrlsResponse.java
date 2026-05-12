package com.a204.batang.domain.render.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "렌더링 결과 URL 묶음")
public record RenderUrlsResponse(
        @Schema(description = "렌더링 manifest URL", nullable = true)
        String manifestUrl,
        @Schema(description = "전면 대각선 좌측 렌더 이미지 URL", nullable = true)
        String frontDiagonalLeftUrl,
        @Schema(description = "전면 대각선 우측 렌더 이미지 URL", nullable = true)
        String frontDiagonalRightUrl
) {
}
