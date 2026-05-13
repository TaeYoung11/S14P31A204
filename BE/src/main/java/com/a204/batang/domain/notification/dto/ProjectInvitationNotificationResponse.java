package com.a204.batang.domain.notification.dto;

import com.a204.batang.domain.notification.entity.ProjectInvitationNotification;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 초대 알림 단건 응답 DTO.
 *
 * @param notificationId 알림 ID
 * @param projectId 프로젝트 ID
 * @param projectName 초대 당시 프로젝트 이름
 * @param inviterUserId 초대한 사용자 ID
 * @param inviterName 초대 당시 초대한 사용자 이름
 * @param isRead 읽음 여부
 * @param readAt 읽음 처리 시각
 * @param createdAt 알림 생성 시각
 */
public record ProjectInvitationNotificationResponse(
        UUID notificationId,
        UUID projectId,
        String projectName,
        UUID inviterUserId,
        String inviterName,
        boolean isRead,
        LocalDateTime readAt,
        LocalDateTime createdAt
) {

    /**
     * 프로젝트 초대 알림 엔티티를 응답 DTO로 변환한다.
     *
     * @param notification 프로젝트 초대 알림 엔티티
     * @return 프로젝트 초대 알림 응답 DTO
     */
    public static ProjectInvitationNotificationResponse from(ProjectInvitationNotification notification) {
        return new ProjectInvitationNotificationResponse(
                notification.getNotificationId(),
                notification.getProjectId(),
                notification.getProjectName(),
                notification.getInviterUserId(),
                notification.getInviterName(),
                notification.isRead(),
                notification.getReadAt(),
                notification.getCreatedAt()
        );
    }
}
