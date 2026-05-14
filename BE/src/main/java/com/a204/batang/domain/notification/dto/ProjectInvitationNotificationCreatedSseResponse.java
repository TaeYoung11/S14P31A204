package com.a204.batang.domain.notification.dto;

import com.a204.batang.domain.notification.event.ProjectInvitationNotificationCreatedEvent;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Project invitation notification SSE response DTO.
 *
 * @param notificationId notification ID
 * @param projectId invited project ID
 * @param projectName invited project name
 * @param inviterUserId invitation sender user ID
 * @param inviterName invitation sender name
 * @param isRead read status
 * @param readAt read timestamp
 * @param createdAt notification creation timestamp
 */
public record ProjectInvitationNotificationCreatedSseResponse(
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
     * Converts a project invitation notification created event to an SSE response DTO.
     *
     * @param event project invitation notification created event
     * @return project invitation notification SSE response
     */
    public static ProjectInvitationNotificationCreatedSseResponse from(
            ProjectInvitationNotificationCreatedEvent event
    ) {
        return new ProjectInvitationNotificationCreatedSseResponse(
                event.notificationId(),
                event.projectId(),
                event.projectName(),
                event.inviterUserId(),
                event.inviterName(),
                event.isRead(),
                event.readAt(),
                event.createdAt()
        );
    }
}
