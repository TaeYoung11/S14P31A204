package com.a204.batang.domain.project.dto;

import com.a204.batang.domain.project.entity.Project;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 대지정보 입력 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param cadastralInfo 대지정보
 * @param createdAt 프로젝트 생성 시각
 */
public record ProjectSiteResponse(
        UUID projectId,
        CadastralInfoResponse cadastralInfo,
        LocalDateTime createdAt
) {

    /**
     * 프로젝트와 지적도 정보를 대지정보 입력 응답 DTO로 변환한다.
     *
     * @param project 프로젝트 엔티티
     * @param polygon 지적도 다각형 정보
     * @return 대지정보 입력 응답 DTO
     */
    public static ProjectSiteResponse from(Project project, CadastralPolygonResponse polygon) {
        return new ProjectSiteResponse(
                project.getProjectId(),
                new CadastralInfoResponse(polygon),
                project.getCreatedAt()
        );
    }
}
