package com.a204.batang.domain.project.dto;

import com.a204.batang.domain.project.entity.Project;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 수정 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param name 프로젝트 이름
 * @param description 프로젝트 설명
 * @param updatedAt 최종 수정 시각
 */
public record UpdateProjectResponse(
        UUID projectId,
        String name,
        String description,
        LocalDateTime updatedAt
) {

    /**
     * 프로젝트 엔티티를 수정 응답 DTO로 변환한다.
     *
     * @param project 프로젝트 엔티티
     * @return 수정 응답 DTO
     */
    public static UpdateProjectResponse from(Project project) {
        return new UpdateProjectResponse(
                project.getProjectId(),
                project.getName(),
                project.getDescription(),
                project.getUpdatedAt()
        );
    }
}