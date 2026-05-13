package com.a204.batang.domain.notification.entity;

import com.a204.batang.global.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * 프로젝트 초대 알림을 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(
        name = "project_invitation_notifications",
        indexes = {
                @Index(name = "idx_project_invitation_notifications_recipient_created_at", columnList = "recipient_user_id, created_at"),
                @Index(name = "idx_project_invitation_notifications_recipient_read_created_at", columnList = "recipient_user_id, is_read, created_at")
        }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProjectInvitationNotification extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "notification_id", nullable = false, updatable = false)
    private UUID notificationId;

    @Column(name = "recipient_user_id", nullable = false, updatable = false)
    private UUID recipientUserId;

    @Column(name = "inviter_user_id", nullable = false, updatable = false)
    private UUID inviterUserId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "project_name", nullable = false, length = 100, updatable = false)
    private String projectName;

    @Column(name = "inviter_name", nullable = false, length = 100, updatable = false)
    private String inviterName;

    @Column(name = "is_read", nullable = false)
    private boolean read;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    private ProjectInvitationNotification(
            UUID recipientUserId,
            UUID inviterUserId,
            UUID projectId,
            String projectName,
            String inviterName
    ) {
        this.recipientUserId = Objects.requireNonNull(recipientUserId, "recipientUserId must not be null");
        this.inviterUserId = Objects.requireNonNull(inviterUserId, "inviterUserId must not be null");
        this.projectId = Objects.requireNonNull(projectId, "projectId must not be null");
        this.projectName = Objects.requireNonNull(projectName, "projectName must not be null");
        this.inviterName = Objects.requireNonNull(inviterName, "inviterName must not be null");
        this.read = false;
    }

    /**
     * 프로젝트 초대 알림을 생성한다.
     *
     * @param recipientUserId 알림 수신자 사용자 ID
     * @param inviterUserId 초대한 사용자 ID
     * @param projectId 프로젝트 ID
     * @param projectName 초대 당시 프로젝트 이름
     * @param inviterName 초대 당시 초대한 사용자 이름
     * @return 프로젝트 초대 알림
     */
    public static ProjectInvitationNotification create(
            UUID recipientUserId,
            UUID inviterUserId,
            UUID projectId,
            String projectName,
            String inviterName
    ) {
        return new ProjectInvitationNotification(
                recipientUserId,
                inviterUserId,
                projectId,
                projectName,
                inviterName
        );
    }

    /**
     * 알림을 읽음 상태로 변경한다.
     *
     * @param readAt 읽음 처리 시각
     */
    public void markAsRead(LocalDateTime readAt) {
        if (this.read) {
            return;
        }
        this.read = true;
        this.readAt = Objects.requireNonNull(readAt, "readAt must not be null");
    }
}
