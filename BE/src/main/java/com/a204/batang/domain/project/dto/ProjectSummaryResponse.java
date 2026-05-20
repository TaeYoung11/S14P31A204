package com.a204.batang.domain.project.dto;

import com.a204.batang.domain.project.entity.Project;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 목록의 단건 요약 정보 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param name 프로젝트 이름
 * @param description 프로젝트 설명
 * @param cadastralAddress 대지 주소
 * @param thumbnailUrl 프로젝트 카드 썸네일 URL
 * @param thumbnailMode 썸네일이 캡처된 에디터 모드
 * @param createdAt 생성 시각
 * @param updatedAt 수정 시각
 */
public record ProjectSummaryResponse(
        UUID projectId,
        String name,
        String description,
        String cadastralAddress,
        String thumbnailUrl,
        String thumbnailMode,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    /**
     * 프로젝트 엔티티를 목록 응답 DTO로 변환한다.
     *
     * @param project 프로젝트 엔티티
     * @return 프로젝트 요약 DTO
     */
    public static ProjectSummaryResponse from(Project project) {
        return new ProjectSummaryResponse(
                project.getProjectId(),
                project.getName(),
                project.getDescription(),
                project.getCadastralAddress(),
                project.getThumbnailUrl(),
                project.getThumbnailMode(),
                project.getCreatedAt(),
                project.getUpdatedAt()
        );
    }
}
