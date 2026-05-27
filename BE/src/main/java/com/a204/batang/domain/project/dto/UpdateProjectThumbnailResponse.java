package com.a204.batang.domain.project.dto;

import com.a204.batang.domain.project.entity.Project;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 카드 썸네일 갱신 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param thumbnailUrl 프로젝트 카드 썸네일 URL
 * @param thumbnailMode 썸네일이 캡처된 에디터 모드
 * @param updatedAt 최종 수정 시각
 */
public record UpdateProjectThumbnailResponse(
        UUID projectId,
        String thumbnailUrl,
        String thumbnailMode,
        LocalDateTime updatedAt
) {

    public static UpdateProjectThumbnailResponse from(Project project) {
        return new UpdateProjectThumbnailResponse(
                project.getProjectId(),
                project.getThumbnailUrl(),
                project.getThumbnailMode(),
                project.getUpdatedAt()
        );
    }
}
