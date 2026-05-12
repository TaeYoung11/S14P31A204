package com.a204.batang.domain.notification.repository;

import com.a204.batang.domain.notification.entity.ProjectInvitationNotification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트 초대 알림 영속 처리를 담당하는 Repository다.
 */
public interface ProjectInvitationNotificationRepository extends JpaRepository<ProjectInvitationNotification, UUID> {

    /**
     * 수신자 기준 프로젝트 초대 알림 목록을 최신순으로 조회한다.
     *
     * @param recipientUserId 알림 수신자 사용자 ID
     * @return 프로젝트 초대 알림 목록
     */
    List<ProjectInvitationNotification> findByRecipientUserIdOrderByCreatedAtDesc(UUID recipientUserId);

    /**
     * 수신자와 읽음 여부 기준 프로젝트 초대 알림 목록을 최신순으로 조회한다.
     *
     * @param recipientUserId 알림 수신자 사용자 ID
     * @param read 읽음 여부
     * @return 프로젝트 초대 알림 목록
     */
    List<ProjectInvitationNotification> findByRecipientUserIdAndReadOrderByCreatedAtDesc(
            UUID recipientUserId,
            boolean read
    );
}
