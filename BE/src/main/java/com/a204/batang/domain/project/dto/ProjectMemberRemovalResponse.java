package com.a204.batang.domain.project.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 멤버 제거 응답 DTO.
 *
 * @param projectId 프로젝트 ID
 * @param removedUserId 제거된 사용자 ID
 * @param removedAt 서버에서 제거 요청을 처리한 시각. DB 커밋 시각이나 감사 로그 시각은 아니다.
 */
public record ProjectMemberRemovalResponse(
        UUID projectId,
        UUID removedUserId,
        LocalDateTime removedAt
) {

    /**
     * 프로젝트 멤버 제거 응답 DTO를 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @param removedUserId 제거된 사용자 ID
     * @param removedAt 서버에서 제거 요청을 처리한 시각
     * @return 프로젝트 멤버 제거 응답 DTO
     */
    public static ProjectMemberRemovalResponse of(UUID projectId, UUID removedUserId, LocalDateTime removedAt) {
        return new ProjectMemberRemovalResponse(projectId, removedUserId, removedAt);
    }
}
