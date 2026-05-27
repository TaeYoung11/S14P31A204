package com.a204.batang.domain.project.dto;

import com.a204.batang.domain.project.entity.Project;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 생성 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param name 프로젝트 이름
 * @param description 프로젝트 설명
 * @param currentVersionNo 현재 버전 번호
 * @param currentIfcUrl 현재 IFC URL
 * @param createdAt 생성 시각
 */
public record CreateProjectResponse(
        UUID projectId,
        String name,
        String description,
        Integer currentVersionNo,
        String currentIfcUrl,
        LocalDateTime createdAt
) {

    /**
     * 프로젝트 엔티티를 생성 응답 DTO로 변환한다.
     *
     * @param project 프로젝트 엔티티
     * @return 생성 응답 DTO
     */
    public static CreateProjectResponse from(Project project) {
        return new CreateProjectResponse(
                project.getProjectId(),
                project.getName(),
                project.getDescription(),
                0,
                null,
                project.getCreatedAt()
        );
    }
}
