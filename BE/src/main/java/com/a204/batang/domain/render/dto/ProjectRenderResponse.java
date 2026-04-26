package com.a204.batang.domain.render.dto;

import java.time.LocalDateTime;
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
public record ProjectRenderResponse(
        UUID renderId,
        ProjectRenderStyleResponse style,
        String imageUrl,
        String status,
        LocalDateTime createdAt,
        LocalDateTime completedAt
) {
}
