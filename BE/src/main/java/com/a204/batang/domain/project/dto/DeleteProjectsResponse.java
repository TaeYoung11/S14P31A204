package com.a204.batang.domain.project.dto;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트 다건 삭제 응답 DTO.
 *
 * @param deletedCount 삭제된 프로젝트 수
 * @param projectIds 삭제된 프로젝트 ID 목록
 */
public record DeleteProjectsResponse(
        int deletedCount,
        List<UUID> projectIds
) {

    /**
     * 삭제 결과를 응답 DTO로 생성한다.
     *
     * @param deletedProjectIds 삭제된 프로젝트 ID 목록
     * @return 프로젝트 다건 삭제 응답 DTO
     */
    public static DeleteProjectsResponse from(List<UUID> deletedProjectIds) {
        return new DeleteProjectsResponse(deletedProjectIds.size(), List.copyOf(deletedProjectIds));
    }
}
