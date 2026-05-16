package com.a204.batang.domain.notification.event;

import com.a204.batang.domain.notification.entity.ProjectInvitationNotification;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Event published after a project invitation notification is created.
 *
 * @param notificationId notification ID
 * @param recipientUserId notification recipient user ID
 * @param inviterUserId invitation sender user ID
 * @param inviterName invitation sender name
 * @param projectId invited project ID
 * @param projectName invited project name
 * @param isRead read status
 * @param readAt read timestamp
 * @param createdAt notification creation timestamp
 */
public record ProjectInvitationNotificationCreatedEvent(
        UUID notificationId,
        UUID recipientUserId,
        UUID inviterUserId,
        String inviterName,
        UUID projectId,
        String projectName,
        boolean isRead,
        LocalDateTime readAt,
        LocalDateTime createdAt
) {

    /**
     * Converts a project invitation notification entity to an event.
     *
     * @param notification created project invitation notification
     * @return project invitation notification created event
     */
    public static ProjectInvitationNotificationCreatedEvent from(ProjectInvitationNotification notification) {
        return new ProjectInvitationNotificationCreatedEvent(
                notification.getNotificationId(),
                notification.getRecipientUserId(),
                notification.getInviterUserId(),
                notification.getInviterName(),
                notification.getProjectId(),
                notification.getProjectName(),
                notification.isRead(),
                notification.getReadAt(),
                notification.getCreatedAt()
        );
    }
}
