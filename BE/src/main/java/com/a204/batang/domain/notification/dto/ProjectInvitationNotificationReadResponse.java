package com.a204.batang.domain.notification.dto;

import com.a204.batang.domain.notification.entity.ProjectInvitationNotification;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 프로젝트 초대 알림 읽음 처리 응답 DTO.
 *
 * @param notificationId 알림 ID
 * @param isRead 읽음 여부
 * @param readAt 읽음 처리 시각
 */
public record ProjectInvitationNotificationReadResponse(
        UUID notificationId,
        boolean isRead,
        LocalDateTime readAt
) {

    /**
     * 프로젝트 초대 알림 엔티티를 읽음 처리 응답 DTO로 변환한다.
     *
     * @param notification 프로젝트 초대 알림 엔티티
     * @return 프로젝트 초대 알림 읽음 처리 응답 DTO
     */
    public static ProjectInvitationNotificationReadResponse from(ProjectInvitationNotification notification) {
        return new ProjectInvitationNotificationReadResponse(
                notification.getNotificationId(),
                notification.isRead(),
                notification.getReadAt()
        );
    }
}
